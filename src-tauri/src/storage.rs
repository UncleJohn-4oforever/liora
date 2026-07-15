//! User-visible data directory for Liora (memory / sessions / settings).
//!
//! - Fixed config (where data lives): `%APPDATA%\Liora\storage-config.json` (Windows)
//! - Default data: `%APPDATA%\Liora\data\`
//! - User may point data at any folder they choose.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const CONFIG_NAME: &str = "storage-config.json";
const DATA_SUBDIR: &str = "data";
const FILES: &[&str] = &[
    "sessions.json",
    "memory.json",
    "settings.json",
    "characters.json",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageConfig {
    /// Absolute path to the data directory (contains json files).
    pub data_dir: String,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub config_path: String,
    pub data_dir: String,
    pub default_data_dir: String,
    pub is_default: bool,
    pub data_dir_exists: bool,
    pub files: Vec<StorageFileInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageFileInfo {
    pub name: String,
    pub exists: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDataDirResult {
    pub ok: bool,
    pub data_dir: String,
    pub migrated: bool,
    pub error: Option<String>,
}

/// Root always under the OS app data area (not user-movable).
pub fn app_root() -> PathBuf {
    if let Ok(ad) = std::env::var("APPDATA") {
        if !ad.trim().is_empty() {
            return PathBuf::from(ad).join("Liora");
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".liora");
    }
    if let Ok(ud) = std::env::var("USERPROFILE") {
        return PathBuf::from(ud).join(".liora");
    }
    std::env::temp_dir().join("Liora")
}

pub fn default_data_dir() -> PathBuf {
    app_root().join(DATA_SUBDIR)
}

pub fn config_path() -> PathBuf {
    app_root().join(CONFIG_NAME)
}

fn ensure_dir(p: &Path) -> Result<(), String> {
    fs::create_dir_all(p).map_err(|e| format!("create_dir {}: {e}", p.display()))
}

pub fn load_config() -> StorageConfig {
    let path = config_path();
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(cfg) = serde_json::from_str::<StorageConfig>(&raw) {
            if !cfg.data_dir.trim().is_empty() {
                return cfg;
            }
        }
    }
    let def = default_data_dir();
    let _ = ensure_dir(&def);
    StorageConfig {
        data_dir: def.to_string_lossy().to_string(),
        version: 1,
    }
}

pub fn save_config(cfg: &StorageConfig) -> Result<(), String> {
    let root = app_root();
    ensure_dir(&root)?;
    let path = config_path();
    let raw = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("write config: {e}"))
}

pub fn resolve_data_dir() -> PathBuf {
    let cfg = load_config();
    let p = PathBuf::from(cfg.data_dir.trim());
    let _ = ensure_dir(&p);
    p
}

fn file_path(name: &str) -> Result<PathBuf, String> {
    let safe = match name {
        "sessions" | "sessions.json" => "sessions.json",
        "memory" | "memory.json" => "memory.json",
        "settings" | "settings.json" => "settings.json",
        "characters" | "characters.json" => "characters.json",
        _ => return Err(format!("unknown_store: {name}")),
    };
    Ok(resolve_data_dir().join(safe))
}

pub fn read_store_json(name: &str) -> Result<Option<String>, String> {
    let path = file_path(name)?;
    if !path.is_file() {
        return Ok(None);
    }
    let s = fs::read_to_string(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
    Ok(Some(s))
}

pub fn write_store_json(name: &str, content: &str) -> Result<(), String> {
    let path = file_path(name)?;
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    // Atomic-ish write
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, content).map_err(|e| format!("write tmp: {e}"))?;
    if let Err(e) = fs::rename(&tmp, &path) {
        fs::copy(&tmp, &path).map_err(|e2| format!("copy after rename fail ({e}): {e2}"))?;
        let _ = fs::remove_file(&tmp);
    }
    Ok(())
}

pub fn storage_info() -> StorageInfo {
    let cfg = load_config();
    let data = PathBuf::from(&cfg.data_dir);
    let def = default_data_dir();
    let is_default = canonicalize_loose(&data) == canonicalize_loose(&def);
    let mut files = Vec::new();
    for f in FILES {
        let p = data.join(f);
        let (exists, size) = if p.is_file() {
            (
                true,
                fs::metadata(&p).map(|m| m.len()).unwrap_or(0),
            )
        } else {
            (false, 0)
        };
        files.push(StorageFileInfo {
            name: f.to_string(),
            exists,
            size_bytes: size,
        });
    }
    StorageInfo {
        config_path: config_path().to_string_lossy().to_string(),
        data_dir: data.to_string_lossy().to_string(),
        default_data_dir: def.to_string_lossy().to_string(),
        is_default,
        data_dir_exists: data.is_dir(),
        files,
    }
}

fn canonicalize_loose(p: &Path) -> String {
    p.canonicalize()
        .unwrap_or_else(|_| p.to_path_buf())
        .to_string_lossy()
        .trim_start_matches(r"\\?\")
        .replace('/', "\\")
        .to_lowercase()
}

pub fn pick_data_dir() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Choose Liora data folder (memory & chats)")
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}

/// Copy store files from one directory to another (overwrite).
pub fn copy_data_files(from: &Path, to: &Path) -> Result<u32, String> {
    ensure_dir(to)?;
    let mut n = 0u32;
    for f in FILES {
        let src = from.join(f);
        if src.is_file() {
            let dst = to.join(f);
            fs::copy(&src, &dst).map_err(|e| format!("copy {f}: {e}"))?;
            n += 1;
        }
    }
    Ok(n)
}

pub fn set_data_dir(new_dir: String, migrate: bool) -> SetDataDirResult {
    let new_path = PathBuf::from(new_dir.trim().trim_matches('"'));
    if new_path.as_os_str().is_empty() {
        return SetDataDirResult {
            ok: false,
            data_dir: String::new(),
            migrated: false,
            error: Some("empty_path".into()),
        };
    }
    if let Err(e) = ensure_dir(&new_path) {
        return SetDataDirResult {
            ok: false,
            data_dir: new_path.to_string_lossy().to_string(),
            migrated: false,
            error: Some(e),
        };
    }

    let old = resolve_data_dir();
    let mut migrated = false;
    if migrate {
        let old_c = canonicalize_loose(&old);
        let new_c = canonicalize_loose(&new_path);
        if old_c != new_c {
            match copy_data_files(&old, &new_path) {
                Ok(n) => {
                    migrated = n > 0;
                }
                Err(e) => {
                    return SetDataDirResult {
                        ok: false,
                        data_dir: new_path.to_string_lossy().to_string(),
                        migrated: false,
                        error: Some(e),
                    };
                }
            }
        }
    }

    let cfg = StorageConfig {
        data_dir: new_path.to_string_lossy().to_string(),
        version: 1,
    };
    if let Err(e) = save_config(&cfg) {
        return SetDataDirResult {
            ok: false,
            data_dir: cfg.data_dir,
            migrated,
            error: Some(e),
        };
    }

    SetDataDirResult {
        ok: true,
        data_dir: cfg.data_dir,
        migrated,
        error: None,
    }
}

pub fn reset_default_data_dir(migrate: bool) -> SetDataDirResult {
    set_data_dir(default_data_dir().to_string_lossy().to_string(), migrate)
}

pub fn open_data_dir() -> Result<(), String> {
    let dir = resolve_data_dir();
    ensure_dir(&dir)?;
    open_path_in_explorer(&dir)
}

pub fn open_config_dir() -> Result<(), String> {
    let root = app_root();
    ensure_dir(&root)?;
    open_path_in_explorer(&root)
}

fn open_path_in_explorer(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| format!("explorer: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("open: {e}"))?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("xdg-open: {e}"))?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("open_folder_unsupported".into())
}

/// First-run: ensure default data dir + config exist.
pub fn bootstrap_storage() {
    let _ = ensure_dir(&app_root());
    let cfg_path = config_path();
    if !cfg_path.is_file() {
        let def = default_data_dir();
        let _ = ensure_dir(&def);
        let _ = save_config(&StorageConfig {
            data_dir: def.to_string_lossy().to_string(),
            version: 1,
        });
    } else {
        let d = resolve_data_dir();
        let _ = ensure_dir(&d);
    }
}
