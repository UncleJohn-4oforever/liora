// Liora desktop shell — silent Ollama lifecycle + reliable start on Windows.

mod storage;

use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
struct AppInfo {
    name: String,
    version: String,
    stage: String,
    platform: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OllamaDetect {
    installed: bool,
    path: Option<String>,
    version: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OllamaProbe {
    online: bool,
    models: Vec<String>,
    /// Model names whose Ollama capabilities include "vision" (multimodal).
    vision_models: Vec<String>,
    version: Option<String>,
    /// tcp_open | http_ok | offline
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartResult {
    ok: bool,
    already_running: bool,
    method: String,
    error: Option<String>,
}

static DETECT_CACHE: Mutex<Option<OllamaDetect>> = Mutex::new(None);

/// True when Liora spawned headless `ollama serve` and should stop it on exit.
/// If Ollama was already online at start, we never claim ownership.
static LIORA_OWNED_OLLAMA: AtomicBool = AtomicBool::new(false);

/// Active chat streams that can be cancelled from the UI.
static STREAM_CANCEL: Mutex<Option<HashMap<String, Arc<AtomicBool>>>> = Mutex::new(None);

const OLLAMA_HOST: &str = "127.0.0.1";
const OLLAMA_PORT: u16 = 11434;
const OLLAMA_STREAM_EVENT: &str = "ollama-chat-line";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaStreamEvent {
    request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<u16>,
    done: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaHttpResponse {
    status: u16,
    body: String,
}

fn stream_cancel_flag(request_id: &str) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut guard) = STREAM_CANCEL.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(request_id.to_string(), flag.clone());
    }
    flag
}

fn stream_cancel_clear(request_id: &str) {
    if let Ok(mut guard) = STREAM_CANCEL.lock() {
        if let Some(map) = guard.as_mut() {
            map.remove(request_id);
        }
    }
}

fn emit_stream(app: &AppHandle, ev: OllamaStreamEvent) {
    let _ = app.emit(OLLAMA_STREAM_EVENT, ev);
}

#[tauri::command]
fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Liora".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        stage: "desktop".into(),
        platform: std::env::consts::OS.into(),
    }
}

#[cfg(windows)]
fn apply_no_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
}

#[cfg(not(windows))]
fn apply_no_window(cmd: &mut Command) {
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
}

fn port_open(host: &str, port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("{host}:{port}").parse().unwrap(),
        Duration::from_millis(400),
    )
    .is_ok()
}

/// Minimal HTTP/1.1 GET — no extra crates. Used as ground truth for engine readiness.
fn http_get(path: &str, timeout_ms: u64) -> Option<String> {
    let addr = format!("{OLLAMA_HOST}:{OLLAMA_PORT}");
    let mut stream = TcpStream::connect_timeout(
        &addr.parse().ok()?,
        Duration::from_millis(timeout_ms.min(2000)),
    )
    .ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(timeout_ms)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(timeout_ms.min(2000))));
    let req = format!(
        "GET {path} HTTP/1.1\r\nHost: {OLLAMA_HOST}:{OLLAMA_PORT}\r\nConnection: close\r\nAccept: application/json\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).ok()?;
    let mut buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 2048];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if buf.len() > 512_000 {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    if buf.is_empty() {
        return None;
    }
    let raw = String::from_utf8_lossy(&buf);
    // Require HTTP 200
    let status_ok = raw.starts_with("HTTP/1.1 200") || raw.starts_with("HTTP/1.0 200");
    if !status_ok {
        return None;
    }
    // Body after header separator
    if let Some(idx) = raw.find("\r\n\r\n") {
        Some(raw[idx + 4..].to_string())
    } else {
        raw.find("\n\n").map(|idx| raw[idx + 2..].to_string())
    }
}

fn probe_api_inner() -> OllamaProbe {
    if !port_open(OLLAMA_HOST, OLLAMA_PORT) {
        return OllamaProbe {
            online: false,
            models: vec![],
            vision_models: vec![],
            version: None,
            detail: "offline".into(),
        };
    }

    let body = match http_get("/api/tags", 2500) {
        Some(b) => b,
        None => {
            return OllamaProbe {
                online: false,
                models: vec![],
                vision_models: vec![],
                version: None,
                detail: "tcp_open_http_fail".into(),
            };
        }
    };

    let mut models = Vec::new();
    let mut vision_models = Vec::new();
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
        if let Some(arr) = v.get("models").and_then(|m| m.as_array()) {
            for m in arr {
                if let Some(name) = m.get("name").and_then(|n| n.as_str()) {
                    models.push(name.to_string());
                    let has_vision = m
                        .get("capabilities")
                        .and_then(|c| c.as_array())
                        .map(|caps| {
                            caps.iter().any(|x| {
                                x.as_str()
                                    .map(|s| s.eq_ignore_ascii_case("vision"))
                                    .unwrap_or(false)
                            })
                        })
                        .unwrap_or(false);
                    if has_vision {
                        vision_models.push(name.to_string());
                    }
                }
            }
        }
    }

    let version = http_get("/api/version", 1500).and_then(|b| {
        serde_json::from_str::<serde_json::Value>(&b)
            .ok()
            .and_then(|v| v.get("version")?.as_str().map(|s| s.to_string()))
    });

    OllamaProbe {
        online: true,
        models,
        vision_models,
        version,
        detail: "http_ok".into(),
    }
}

fn wait_for_api(timeout_ms: u64) -> bool {
    let start = Instant::now();
    while start.elapsed() < Duration::from_millis(timeout_ms) {
        if probe_api_inner().online {
            return true;
        }
        thread::sleep(Duration::from_millis(400));
    }
    false
}

fn candidate_ollama_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        paths.push(
            PathBuf::from(&local)
                .join("Programs")
                .join("Ollama")
                .join("ollama.exe"),
        );
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        paths.push(PathBuf::from(pf).join("Ollama").join("ollama.exe"));
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        paths.push(PathBuf::from(pf86).join("Ollama").join("ollama.exe"));
    }
    paths
}

fn resolve_ollama_exe() -> Option<PathBuf> {
    for p in candidate_ollama_paths() {
        if p.is_file() {
            return Some(p);
        }
    }
    #[cfg(windows)]
    {
        let mut cmd = Command::new("where.exe");
        cmd.arg("ollama.exe");
        apply_no_window(&mut cmd);
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                if let Some(line) = text.lines().next() {
                    let p = PathBuf::from(line.trim());
                    if p.is_file() {
                        return Some(p);
                    }
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        let mut cmd = Command::new("which");
        cmd.arg("ollama");
        apply_no_window(&mut cmd);
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                if let Some(line) = text.lines().next() {
                    let p = PathBuf::from(line.trim());
                    if p.is_file() {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}

// Intentionally no launch of "ollama app.exe" / tray GUI — product uses headless serve only.

fn read_version(exe: &Path) -> Option<String> {
    let mut cmd = Command::new(exe);
    cmd.arg("--version");
    apply_no_window(&mut cmd);
    let out = cmd.output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    let t = s.trim();
    if !t.is_empty() {
        return Some(t.lines().next().unwrap_or(t).to_string());
    }
    let e = String::from_utf8_lossy(&out.stderr);
    let et = e.trim();
    if et.is_empty() {
        None
    } else {
        Some(et.lines().next().unwrap_or(et).to_string())
    }
}

#[tauri::command]
fn detect_ollama(force_refresh: Option<bool>) -> OllamaDetect {
    let force = force_refresh.unwrap_or(false);
    if !force {
        if let Ok(guard) = DETECT_CACHE.lock() {
            if let Some(cached) = guard.clone() {
                return cached;
            }
        }
    }

    let result = match resolve_ollama_exe() {
        Some(path) => OllamaDetect {
            installed: true,
            path: Some(path.display().to_string()),
            version: read_version(&path),
        },
        None => OllamaDetect {
            installed: false,
            path: None,
            version: None,
        },
    };

    if let Ok(mut guard) = DETECT_CACHE.lock() {
        *guard = Some(result.clone());
    }
    result
}

/// Ground-truth API probe from the Rust side (not WebView fetch).
#[tauri::command]
fn probe_ollama_api() -> OllamaProbe {
    probe_api_inner()
}

/// Spawn detached; on Windows use CREATE_NO_WINDOW so no flash console.
fn spawn_detached(exe: &Path, args: &[&str]) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP — keep silent & independent
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        Command::new(exe)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
            .spawn()
            .map_err(|e| format!("spawn_failed: {e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Command::new(exe)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("spawn_failed: {e}"))?;
        Ok(())
    }
}

fn start_ollama_serve_inner() -> Result<StartResult, String> {
    // Already healthy? Do not take ownership — leave user's engine alone on exit.
    if probe_api_inner().online {
        return Ok(StartResult {
            ok: true,
            already_running: true,
            method: "already_online".into(),
            error: None,
        });
    }

    let exe = resolve_ollama_exe().ok_or_else(|| "ollama_not_found".to_string())?;

    // Product: run engine headless only — never launch "ollama app.exe" tray UI.
    // CREATE_NO_WINDOW via spawn_detached keeps console invisible.
    spawn_detached(&exe, &["serve"])?;

    if wait_for_api(35_000) {
        LIORA_OWNED_OLLAMA.store(true, Ordering::SeqCst);
        return Ok(StartResult {
            ok: true,
            already_running: false,
            method: "ollama_serve_headless".into(),
            error: None,
        });
    }

    let detail = probe_api_inner().detail;
    Ok(StartResult {
        ok: false,
        already_running: false,
        method: "ollama_serve_headless".into(),
        error: Some(format!("timeout_waiting_for_api:{detail}")),
    })
}

/// Stop Ollama processes only if Liora started them this session.
fn stop_ollama_if_owned() {
    if !LIORA_OWNED_OLLAMA.swap(false, Ordering::SeqCst) {
        return;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // /T kills child tree; silent flags avoid console flash
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "ollama.exe", "/T"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
        // In case an older build or side-effect left the tray host running
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "ollama app.exe", "/T"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("pkill")
            .args(["-f", "ollama serve"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

/// Manual stop (e.g. settings); same ownership rule as exit.
#[tauri::command]
fn stop_ollama_serve() -> bool {
    let owned = LIORA_OWNED_OLLAMA.load(Ordering::SeqCst);
    if owned {
        stop_ollama_if_owned();
    }
    owned
}

/// Start local engine and wait until HTTP API answers (not only TCP).
/// Async so the UI thread is not blocked for ~30s.
#[tauri::command]
async fn start_ollama_serve() -> Result<StartResult, String> {
    tauri::async_runtime::spawn_blocking(start_ollama_serve_inner)
        .await
        .map_err(|e| format!("join_error: {e}"))?
}

/// One-shot HTTP POST/GET to local Ollama — raw TCP, never uses system proxy.
/// Used for non-streaming chat (memory extract) and diagnostics.
#[tauri::command]
async fn ollama_http(
    method: String,
    path: String,
    body: Option<String>,
) -> Result<OllamaHttpResponse, String> {
    tauri::async_runtime::spawn_blocking(move || ollama_http_once(&method, &path, body.as_deref()))
        .await
        .map_err(|e| format!("join_error: {e}"))?
}

fn ollama_http_once(
    method: &str,
    path: &str,
    body: Option<&str>,
) -> Result<OllamaHttpResponse, String> {
    let addr = format!("{OLLAMA_HOST}:{OLLAMA_PORT}");
    let mut stream = TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("bad_addr: {e}"))?,
        Duration::from_secs(10),
    )
    .map_err(|e| format!("connect_failed: {e}"))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(300)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(30)));

    let path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    let method = method.to_uppercase();
    let body_bytes = body.unwrap_or("").as_bytes();
    let mut req = format!(
        "{method} {path} HTTP/1.1\r\nHost: {OLLAMA_HOST}:{OLLAMA_PORT}\r\nConnection: close\r\nAccept: application/json\r\n"
    );
    if !body_bytes.is_empty() {
        req.push_str("Content-Type: application/json\r\n");
        req.push_str(&format!("Content-Length: {}\r\n", body_bytes.len()));
    } else if method == "POST" || method == "PUT" {
        req.push_str("Content-Length: 0\r\n");
    }
    req.push_str("\r\n");
    stream
        .write_all(req.as_bytes())
        .map_err(|e| format!("write_headers: {e}"))?;
    if !body_bytes.is_empty() {
        stream
            .write_all(body_bytes)
            .map_err(|e| format!("write_body: {e}"))?;
    }

    let mut buf = Vec::with_capacity(8192);
    let mut chunk = [0u8; 4096];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if buf.len() > 8_000_000 {
                    break;
                }
            }
            Err(e) => {
                if buf.is_empty() {
                    return Err(format!("read_failed: {e}"));
                }
                break;
            }
        }
    }
    let raw = String::from_utf8_lossy(&buf);
    let status = parse_http_status(&raw).unwrap_or(0);
    let body = split_http_body(&raw).unwrap_or_default();
    Ok(OllamaHttpResponse { status, body })
}

fn parse_http_status(raw: &str) -> Option<u16> {
    let line = raw.lines().next()?;
    let mut parts = line.split_whitespace();
    let _http = parts.next()?;
    parts.next()?.parse().ok()
}

fn split_http_body(raw: &str) -> Option<String> {
    if let Some(idx) = raw.find("\r\n\r\n") {
        Some(raw[idx + 4..].to_string())
    } else {
        raw.find("\n\n").map(|idx| raw[idx + 2..].to_string())
    }
}

/// Stream POST /api/chat via raw TCP (bypasses system proxy / plugin-http 502/403).
/// Emits `ollama-chat-line` events with NDJSON lines, then done.
#[tauri::command]
async fn ollama_chat_stream(
    app: AppHandle,
    request_id: String,
    body: String,
) -> Result<(), String> {
    let cancel = stream_cancel_flag(&request_id);
    let app2 = app.clone();
    let rid = request_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        ollama_chat_stream_inner(&app2, &rid, &body, &cancel)
    })
    .await
    .map_err(|e| format!("join_error: {e}"))?;
    stream_cancel_clear(&request_id);
    result
}

fn ollama_chat_stream_inner(
    app: &AppHandle,
    request_id: &str,
    body: &str,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let finish = |app: &AppHandle, request_id: &str, error: Option<String>, status: Option<u16>| {
        emit_stream(
            app,
            OllamaStreamEvent {
                request_id: request_id.to_string(),
                line: None,
                error,
                status,
                done: true,
            },
        );
    };

    if cancel.load(Ordering::SeqCst) {
        finish(app, request_id, Some("aborted".into()), None);
        return Ok(());
    }

    let addr = format!("{OLLAMA_HOST}:{OLLAMA_PORT}");
    let mut stream = match TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("bad_addr: {e}"))?,
        Duration::from_secs(10),
    ) {
        Ok(s) => s,
        Err(e) => {
            finish(app, request_id, Some(format!("connect_failed: {e}")), None);
            return Ok(());
        }
    };
    // Long generations (thinking + answer) can idle between tokens on slow GPUs.
    // 30 min read timeout; timeout errors are retried in the read loop.
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1800)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(60)));
    let _ = stream.set_nodelay(true);

    let body_bytes = body.as_bytes();
    let req = format!(
        "POST /api/chat HTTP/1.1\r\nHost: {OLLAMA_HOST}:{OLLAMA_PORT}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nAccept: application/x-ndjson, application/json\r\n\r\n",
        body_bytes.len()
    );
    if let Err(e) = stream
        .write_all(req.as_bytes())
        .and_then(|_| stream.write_all(body_bytes))
    {
        finish(app, request_id, Some(format!("write_failed: {e}")), None);
        return Ok(());
    }

    let mut reader = BufReader::new(stream);
    // Status line
    let mut status_line = String::new();
    if let Err(e) = reader.read_line(&mut status_line) {
        finish(app, request_id, Some(format!("read_status: {e}")), None);
        return Ok(());
    }
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);

    // Headers
    loop {
        let mut line = String::new();
        if let Err(e) = reader.read_line(&mut line) {
            finish(
                app,
                request_id,
                Some(format!("read_headers: {e}")),
                Some(status),
            );
            return Ok(());
        }
        if line == "\r\n" || line == "\n" || line.is_empty() {
            break;
        }
    }

    if status != 200 {
        // Read error body (non-stream or short)
        let mut err_body = String::new();
        let _ = reader.read_to_string(&mut err_body);
        let snippet: String = err_body.chars().take(240).collect();
        finish(
            app,
            request_id,
            Some(format!("Ollama HTTP {status}: {snippet}")),
            Some(status),
        );
        return Ok(());
    }

    // NDJSON body lines
    loop {
        if cancel.load(Ordering::SeqCst) {
            finish(app, request_id, Some("aborted".into()), Some(status));
            return Ok(());
        }
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                emit_stream(
                    app,
                    OllamaStreamEvent {
                        request_id: request_id.to_string(),
                        line: Some(trimmed.to_string()),
                        error: None,
                        status: Some(status),
                        done: false,
                    },
                );
            }
            Err(e) => {
                // Timeout mid-stream or connection closed
                if line.is_empty() && err_is_timeout(&e) {
                    // keep waiting unless cancelled — but read_timeout means we should retry
                    if cancel.load(Ordering::SeqCst) {
                        finish(app, request_id, Some("aborted".into()), Some(status));
                        return Ok(());
                    }
                    continue;
                }
                if !line.trim().is_empty() {
                    emit_stream(
                        app,
                        OllamaStreamEvent {
                            request_id: request_id.to_string(),
                            line: Some(line.trim().to_string()),
                            error: None,
                            status: Some(status),
                            done: false,
                        },
                    );
                }
                break;
            }
        }
    }

    finish(app, request_id, None, Some(status));
    Ok(())
}

fn err_is_timeout(e: &std::io::Error) -> bool {
    e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut
}

#[tauri::command]
fn ollama_chat_cancel(request_id: String) -> Result<(), String> {
    cancel_stream_request(&request_id)
}

fn cancel_stream_request(request_id: &str) -> Result<(), String> {
    if let Ok(guard) = STREAM_CANCEL.lock() {
        if let Some(map) = guard.as_ref() {
            if let Some(flag) = map.get(request_id) {
                flag.store(true, Ordering::SeqCst);
            }
        }
    }
    Ok(())
}

const OLLAMA_PULL_EVENT: &str = "ollama-pull-line";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaPullEvent {
    request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<u16>,
    done: bool,
}

/// Stream POST /api/pull via raw TCP. Emits `ollama-pull-line` NDJSON lines.
#[tauri::command]
async fn ollama_pull_stream(
    app: AppHandle,
    request_id: String,
    model: String,
) -> Result<(), String> {
    let model = model.trim().to_string();
    if model.is_empty() {
        return Err("empty_model".into());
    }
    let cancel = stream_cancel_flag(&request_id);
    let app2 = app.clone();
    let rid = request_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        ollama_pull_stream_inner(&app2, &rid, &model, &cancel)
    })
    .await
    .map_err(|e| format!("join_error: {e}"))?;
    stream_cancel_clear(&request_id);
    result
}

fn ollama_pull_stream_inner(
    app: &AppHandle,
    request_id: &str,
    model: &str,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let finish = |error: Option<String>, status: Option<u16>| {
        let _ = app.emit(
            OLLAMA_PULL_EVENT,
            OllamaPullEvent {
                request_id: request_id.to_string(),
                line: None,
                error,
                status,
                done: true,
            },
        );
    };

    if cancel.load(Ordering::SeqCst) {
        finish(Some("aborted".into()), None);
        return Ok(());
    }

    let body = serde_json::json!({
        "model": model,
        "stream": true,
    })
    .to_string();
    let body_bytes = body.as_bytes();

    let addr = format!("{OLLAMA_HOST}:{OLLAMA_PORT}");
    let mut stream = match TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("bad_addr: {e}"))?,
        Duration::from_secs(15),
    ) {
        Ok(s) => s,
        Err(e) => {
            finish(Some(format!("connect_failed: {e}")), None);
            return Ok(());
        }
    };
    // Pull can take a long time on slow networks
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3600)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(30)));
    let _ = stream.set_nodelay(true);

    let req = format!(
        "POST /api/pull HTTP/1.1\r\nHost: {OLLAMA_HOST}:{OLLAMA_PORT}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nAccept: application/x-ndjson, application/json\r\n\r\n",
        body_bytes.len()
    );
    if let Err(e) = stream
        .write_all(req.as_bytes())
        .and_then(|_| stream.write_all(body_bytes))
    {
        finish(Some(format!("write_failed: {e}")), None);
        return Ok(());
    }

    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    if let Err(e) = reader.read_line(&mut status_line) {
        finish(Some(format!("read_status: {e}")), None);
        return Ok(());
    }
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);

    loop {
        let mut line = String::new();
        if let Err(e) = reader.read_line(&mut line) {
            finish(Some(format!("read_headers: {e}")), Some(status));
            return Ok(());
        }
        if line == "\r\n" || line == "\n" || line.is_empty() {
            break;
        }
    }

    if status != 200 {
        let mut err_body = String::new();
        let _ = reader.read_to_string(&mut err_body);
        let snippet: String = err_body.chars().take(240).collect();
        finish(
            Some(format!("Ollama HTTP {status}: {snippet}")),
            Some(status),
        );
        return Ok(());
    }

    loop {
        if cancel.load(Ordering::SeqCst) {
            finish(Some("aborted".into()), Some(status));
            return Ok(());
        }
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let _ = app.emit(
                    OLLAMA_PULL_EVENT,
                    OllamaPullEvent {
                        request_id: request_id.to_string(),
                        line: Some(trimmed.to_string()),
                        error: None,
                        status: Some(status),
                        done: false,
                    },
                );
            }
            Err(e) => {
                if err_is_timeout(&e) && !cancel.load(Ordering::SeqCst) {
                    continue;
                }
                if !line.trim().is_empty() {
                    let _ = app.emit(
                        OLLAMA_PULL_EVENT,
                        OllamaPullEvent {
                            request_id: request_id.to_string(),
                            line: Some(line.trim().to_string()),
                            error: None,
                            status: Some(status),
                            done: false,
                        },
                    );
                }
                break;
            }
        }
    }

    finish(None, Some(status));
    Ok(())
}

#[tauri::command]
fn ollama_pull_cancel(request_id: String) -> Result<(), String> {
    cancel_stream_request(&request_id)
}

/// Best-effort total RAM in GiB (for model recommendations).
#[tauri::command]
fn system_ram_gb() -> Option<u32> {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB)",
        ]);
        apply_no_window(&mut cmd);
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                if let Ok(n) = text.trim().parse::<u32>() {
                    if n > 0 {
                        return Some(n);
                    }
                }
            }
        }
        None
    }
    #[cfg(not(windows))]
    {
        // /proc/meminfo MemTotal kB
        if let Ok(s) = std::fs::read_to_string("/proc/meminfo") {
            for line in s.lines() {
                if let Some(rest) = line.strip_prefix("MemTotal:") {
                    let kb: u64 = rest
                        .split_whitespace()
                        .next()
                        .and_then(|x| x.parse().ok())
                        .unwrap_or(0);
                    if kb > 0 {
                        return Some(((kb / 1024 / 1024) as u32).max(1));
                    }
                }
            }
        }
        None
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportGgufResult {
    ok: bool,
    name: String,
    path: String,
    /// Absolute path of auto-detected mmproj (vision projector), if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    mmproj_path: Option<String>,
    /// True when import staged main GGUF + mmproj for Ollama vision.
    vision_attached: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    log: Option<String>,
}

fn import_fail(
    name: String,
    path: String,
    mmproj_path: Option<String>,
    error: String,
    log: Option<String>,
) -> ImportGgufResult {
    ImportGgufResult {
        ok: false,
        name,
        path,
        mmproj_path,
        vision_attached: false,
        error: Some(error),
        log,
    }
}

/// True if filename looks like a multimodal projector (not the language GGUF).
fn is_mmproj_filename(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".gguf")
        && (lower.contains("mmproj")
            || lower.contains("mm_proj")
            || lower.contains("projector")
            || lower.starts_with("mmproj-")
            || lower.contains("-mmproj-")
            || lower.contains("_mmproj_"))
}

/// Scan the same directory as `main_gguf` for a vision projector GGUF.
fn find_sibling_mmproj(main_gguf: &Path) -> Option<PathBuf> {
    let parent = main_gguf.parent()?;
    let main_name = main_gguf.file_name()?.to_string_lossy().to_string();
    let mut candidates: Vec<PathBuf> = Vec::new();
    let rd = std::fs::read_dir(parent).ok()?;
    for ent in rd.flatten() {
        let p = ent.path();
        if !p.is_file() {
            continue;
        }
        let fname = ent.file_name().to_string_lossy().to_string();
        if fname.eq_ignore_ascii_case(&main_name) {
            continue;
        }
        if is_mmproj_filename(&fname) {
            candidates.push(p);
        }
    }
    if candidates.is_empty() {
        return None;
    }
    // Prefer name containing mmproj; then largest (f16 projectors are bigger)
    candidates.sort_by(|a, b| {
        let sa = a.metadata().map(|m| m.len()).unwrap_or(0);
        let sb = b.metadata().map(|m| m.len()).unwrap_or(0);
        sb.cmp(&sa)
    });
    candidates.into_iter().next()
}

fn path_for_modelfile(p: &Path) -> String {
    let abs = p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
    let mut s = abs.to_string_lossy().to_string();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        s = stripped.to_string();
    }
    s.replace('\\', "/")
}

/// Link or copy `src` into `dest` (prefer hard link to avoid duplicating multi‑GB files).
fn link_or_copy(src: &Path, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        let _ = std::fs::remove_file(dest);
    }
    match std::fs::hard_link(src, dest) {
        Ok(()) => Ok(()),
        Err(_) => {
            // Cross-volume or FS without hardlinks — fall back to copy
            std::fs::copy(src, dest)
                .map(|_| ())
                .map_err(|e| format!("stage_copy_failed: {e}"))
        }
    }
}

/// Native file picker for a single .gguf file. Returns absolute path or null if cancelled.
#[tauri::command]
fn pick_gguf_file() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("GGUF model", &["gguf"])
        .set_title("Select language GGUF (mmproj in same folder is auto-detected)")
        .pick_file()
        .map(|p| p.to_string_lossy().to_string())
}

fn sanitize_model_name(raw: &str) -> Result<String, String> {
    let s = raw.trim().to_lowercase();
    if s.is_empty() {
        return Err("empty_name".into());
    }
    // allow name or name:tag
    let ok = s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == ':');
    if !ok {
        return Err("invalid_name".into());
    }
    if s.starts_with(':') || s.ends_with(':') || s.contains("::") {
        return Err("invalid_name".into());
    }
    if s.len() > 128 {
        return Err("name_too_long".into());
    }
    Ok(s)
}

/// Import a local GGUF into Ollama via `ollama create` + temporary Modelfile.
#[tauri::command]
async fn ollama_import_gguf(
    path: String,
    name: String,
    system: Option<String>,
) -> Result<ImportGgufResult, String> {
    tauri::async_runtime::spawn_blocking(move || ollama_import_gguf_inner(path, name, system))
        .await
        .map_err(|e| format!("join_error: {e}"))?
}

fn ollama_import_gguf_inner(
    path: String,
    name: String,
    system: Option<String>,
) -> Result<ImportGgufResult, String> {
    let path = path.trim().trim_matches('"').to_string();
    let path_buf = PathBuf::from(&path);
    if !path_buf.is_file() {
        return Ok(import_fail(
            name.clone(),
            path.clone(),
            None,
            "file_not_found".into(),
            None,
        ));
    }
    let ext = path_buf
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "gguf" {
        return Ok(import_fail(
            name.clone(),
            path.clone(),
            None,
            "not_gguf".into(),
            None,
        ));
    }

    // User may have picked the projector by mistake
    if let Some(fname) = path_buf.file_name().and_then(|n| n.to_str()) {
        if is_mmproj_filename(fname) {
            return Ok(import_fail(
                name.clone(),
                path.clone(),
                Some(path.clone()),
                "picked_mmproj".into(),
                Some(
                    "Selected file looks like a vision projector (mmproj). Pick the main language .gguf; Liora will auto-attach mmproj from the same folder.".into(),
                ),
            ));
        }
    }

    let name = match sanitize_model_name(&name) {
        Ok(n) => n,
        Err(e) => {
            return Ok(import_fail(name.clone(), path.clone(), None, e, None));
        }
    };

    let exe = match resolve_ollama_exe() {
        Some(p) => p,
        None => {
            return Ok(import_fail(
                name,
                path,
                None,
                "ollama_not_found".into(),
                None,
            ));
        }
    };

    let mmproj_buf = find_sibling_mmproj(&path_buf);
    let mmproj_path_str = mmproj_buf.as_ref().map(|p| p.to_string_lossy().to_string());

    // Staging + Modelfile:
    // - With mmproj: Ollama needs both files in one directory and FROM that directory
    //   (community-confirmed for vision GGUF + projector). We stage via hardlink/copy
    //   so messy source folders (blobs/manifests) do not confuse create.
    // - Without mmproj: classic FROM absolute main GGUF path.
    let stage_id = format!(
        "liora_import_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let stage_dir = std::env::temp_dir().join(&stage_id);
    if let Err(e) = std::fs::create_dir_all(&stage_dir) {
        return Ok(import_fail(
            name,
            path,
            mmproj_path_str,
            format!("temp_dir: {e}"),
            None,
        ));
    }

    let vision_attached = mmproj_buf.is_some();
    let from_target: PathBuf;
    let mut stage_note = String::new();

    if let Some(ref mmproj) = mmproj_buf {
        let main_name = path_buf
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "model.gguf".into());
        let mm_name = mmproj
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "mmproj.gguf".into());
        // Sanitize stage filenames (spaces ok; keep simple)
        let main_dest = stage_dir.join(&main_name);
        let mm_dest = stage_dir.join(&mm_name);
        if let Err(e) = link_or_copy(&path_buf, &main_dest) {
            let _ = std::fs::remove_dir_all(&stage_dir);
            return Ok(import_fail(name, path, mmproj_path_str, e, None));
        }
        if let Err(e) = link_or_copy(mmproj, &mm_dest) {
            let _ = std::fs::remove_dir_all(&stage_dir);
            return Ok(import_fail(name, path, mmproj_path_str, e, None));
        }
        from_target = stage_dir.clone();
        stage_note =
            format!("vision: staged main + mmproj ({mm_name}) for Ollama multimodal create\n");
    } else {
        from_target = path_buf.canonicalize().unwrap_or_else(|_| path_buf.clone());
    }

    let from_path = path_for_modelfile(&from_target);
    let from_line = if from_path.contains(' ') {
        format!("FROM \"{from_path}\"")
    } else {
        format!("FROM {from_path}")
    };

    let mut modelfile = format!("{from_line}\n");
    if let Some(ref sys) = system {
        let sys = sys.trim();
        if !sys.is_empty() {
            // triple-quote style; escape triple quotes in content
            let safe = sys.replace("\"\"\"", "'''");
            modelfile.push_str(&format!("SYSTEM \"\"\"\n{safe}\n\"\"\"\n"));
        }
    }

    let mf_path = stage_dir.join("Modelfile");
    if let Err(e) = std::fs::write(&mf_path, modelfile.as_bytes()) {
        let _ = std::fs::remove_dir_all(&stage_dir);
        return Ok(import_fail(
            name,
            path,
            mmproj_path_str,
            format!("write_modelfile: {e}"),
            None,
        ));
    }

    let mut cmd = Command::new(&exe);
    cmd.arg("create")
        .arg(&name)
        .arg("-f")
        .arg(&mf_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = match cmd.output() {
        Ok(o) => o,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&stage_dir);
            return Ok(import_fail(
                name,
                path,
                mmproj_path_str,
                format!("spawn_failed: {e}"),
                None,
            ));
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let log = format!("{stage_note}{stdout}{stderr}").trim().to_string();
    // Drop staged hardlinks/copies (Ollama has ingested layers on success)
    let _ = std::fs::remove_dir_all(&stage_dir);

    if output.status.success() {
        Ok(ImportGgufResult {
            ok: true,
            name,
            path,
            mmproj_path: mmproj_path_str,
            vision_attached,
            error: None,
            log: if log.is_empty() { None } else { Some(log) },
        })
    } else {
        // If directory FROM failed with mmproj, retry once as plain main GGUF
        // so text import still works on older Ollama without vision packaging.
        if vision_attached {
            let retry = ollama_import_gguf_text_only(&exe, &path_buf, &name, system.as_deref());
            if let Ok(mut r) = retry {
                if r.ok {
                    r.mmproj_path = mmproj_path_str.clone();
                    r.vision_attached = false;
                    let note = format!(
                        "mmproj was found but multimodal create failed; imported text-only. Detail:\n{log}\n"
                    );
                    r.log = Some(match r.log.take() {
                        Some(prev) => format!("{note}{prev}"),
                        None => note,
                    });
                    r.error = None;
                    // Surface soft warning via log only; ok=true text import
                    return Ok(r);
                }
            }
        }
        let err = if log.is_empty() {
            format!("create_failed: exit {:?}", output.status.code())
        } else {
            // keep tail of log
            let snippet: String = log
                .chars()
                .rev()
                .take(400)
                .collect::<String>()
                .chars()
                .rev()
                .collect();
            snippet
        };
        Ok(import_fail(name, path, mmproj_path_str, err, Some(log)))
    }
}

/// Text-only fallback: FROM single main GGUF (no mmproj staging).
fn ollama_import_gguf_text_only(
    exe: &PathBuf,
    main_gguf: &Path,
    name: &str,
    system: Option<&str>,
) -> Result<ImportGgufResult, String> {
    let path = main_gguf.to_string_lossy().to_string();
    let from_path = path_for_modelfile(main_gguf);
    let from_line = if from_path.contains(' ') {
        format!("FROM \"{from_path}\"")
    } else {
        format!("FROM {from_path}")
    };
    let mut modelfile = format!("{from_line}\n");
    if let Some(sys) = system {
        let sys = sys.trim();
        if !sys.is_empty() {
            let safe = sys.replace("\"\"\"", "'''");
            modelfile.push_str(&format!("SYSTEM \"\"\"\n{safe}\n\"\"\"\n"));
        }
    }
    let tmp_dir = std::env::temp_dir().join(format!(
        "liora_import_txt_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("temp_dir: {e}"))?;
    let mf_path = tmp_dir.join("Modelfile");
    std::fs::write(&mf_path, modelfile.as_bytes()).map_err(|e| format!("write_modelfile: {e}"))?;

    let mut cmd = Command::new(exe);
    cmd.arg("create")
        .arg(name)
        .arg("-f")
        .arg(&mf_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output().map_err(|e| format!("spawn_failed: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let log = format!("{stdout}{stderr}").trim().to_string();
    let _ = std::fs::remove_dir_all(&tmp_dir);

    if output.status.success() {
        Ok(ImportGgufResult {
            ok: true,
            name: name.to_string(),
            path,
            mmproj_path: None,
            vision_attached: false,
            error: None,
            log: if log.is_empty() { None } else { Some(log) },
        })
    } else {
        Ok(import_fail(
            name.to_string(),
            path,
            None,
            if log.is_empty() {
                format!("create_failed: exit {:?}", output.status.code())
            } else {
                log.chars()
                    .rev()
                    .take(400)
                    .collect::<String>()
                    .chars()
                    .rev()
                    .collect()
            },
            Some(log),
        ))
    }
}

// --- Desktop data directory (memory / sessions / settings on disk) ---

#[tauri::command]
fn storage_get_info() -> storage::StorageInfo {
    storage::bootstrap_storage();
    storage::storage_info()
}

#[tauri::command]
fn storage_pick_data_dir() -> Option<String> {
    storage::pick_data_dir()
}

#[tauri::command]
fn storage_set_data_dir(path: String, migrate: bool) -> storage::SetDataDirResult {
    storage::bootstrap_storage();
    storage::set_data_dir(path, migrate)
}

#[tauri::command]
fn storage_reset_default(migrate: bool) -> storage::SetDataDirResult {
    storage::bootstrap_storage();
    storage::reset_default_data_dir(migrate)
}

#[tauri::command]
fn storage_open_data_dir() -> Result<(), String> {
    storage::bootstrap_storage();
    storage::open_data_dir()
}

#[tauri::command]
fn storage_open_config_dir() -> Result<(), String> {
    storage::bootstrap_storage();
    storage::open_config_dir()
}

#[tauri::command]
fn storage_read_json(name: String) -> Result<Option<String>, String> {
    storage::bootstrap_storage();
    storage::read_store_json(&name)
}

#[tauri::command]
fn storage_write_json(name: String, content: String) -> Result<(), String> {
    storage::bootstrap_storage();
    storage::write_store_json(&name, &content)
}

/// Ensure loopback (Ollama) is never sent through system HTTP proxies
/// (Clash / V2Ray often return HTTP 502/403 for 127.0.0.1:11434).
fn ensure_loopback_no_proxy() {
    const EXTRA: &str = "127.0.0.1,localhost,::1";
    for key in ["NO_PROXY", "no_proxy"] {
        let merged = match std::env::var(key) {
            Ok(existing) if !existing.is_empty() => {
                if existing.contains("127.0.0.1") {
                    existing
                } else {
                    format!("{existing},{EXTRA}")
                }
            }
            _ => EXTRA.to_string(),
        };
        // SAFETY: called once at process start before other threads use proxy env
        unsafe {
            std::env::set_var(key, merged);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ensure_loopback_no_proxy();
    storage::bootstrap_storage();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            detect_ollama,
            probe_ollama_api,
            start_ollama_serve,
            stop_ollama_serve,
            ollama_http,
            ollama_chat_stream,
            ollama_chat_cancel,
            ollama_pull_stream,
            ollama_pull_cancel,
            system_ram_gb,
            pick_gguf_file,
            ollama_import_gguf,
            storage_get_info,
            storage_pick_data_dir,
            storage_set_data_dir,
            storage_reset_default,
            storage_open_data_dir,
            storage_open_config_dir,
            storage_read_json,
            storage_write_json
        ])
        .build(tauri::generate_context!())
        .expect("error while building Liora")
        .run(|_app, event| {
            // Tear down headless engine when the shell exits
            if let tauri::RunEvent::Exit = event {
                stop_ollama_if_owned();
            }
            if let tauri::RunEvent::ExitRequested { .. } = event {
                stop_ollama_if_owned();
            }
        });
}
