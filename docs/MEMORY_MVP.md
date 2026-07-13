# Memory MVP (implemented)

## Behavior

1. After each successful assistant reply, if memory is **On** and enough new messages accumulated (`SUMMARY_EVERY_N_MESSAGES = 6`), a background Ollama job runs.
2. Job writes:
   - **L2 episode** summary (topic, what happened, open loops, entities)
   - **Cold chunks** with sparse term features (simple retrieval, not neural embeddings)
   - **L3/L4/L5 memory atoms** only if specificity score ≥ 0.55
3. Chat L0 injects: base system + active memories + recent episodes + retrieved chunks + **hot last 12 messages**.
4. UI: toast **记忆已更新**, Memory Center drawer (edit/delete/clear).

## Storage

`localStorage` key `liora.memory.v1` (browser profile).

## Injection & auto-job UX (B)

- **L3 profile always injected** across sessions (not only keyword match)
- **L4 procedures always on** when present
- L5: recent + query-related
- Cross-session episodes scored by token/entity overlap with profile
- Chunk retrieval enriched with profile keywords
- Toast shows `L3×n · L4×n · L5×n` after auto/force extract
- Settings: **summaryEveryN** (2–30) controls auto interval

## Explicit remember + sensitive confirm (added)

- User bubble **记住这句** / composer **记住输入框**
- Chat text matching `请记住…` / `帮我记住…` triggers explicit write
- Sensitive heuristics (phone/address/health/finance…) → confirm modal before save
- Source marked `user` for explicit writes

## Rolling compress + budget pack (R1)

- **Hot L1**: only recent turns under a token budget (scales with 4K/8K/16K).
- **Cold**: older turns never re-enter the prompt as raw messages; Micro-summary → L2 episode (+ L3/L4/L5 extract).
- **Trigger**: cold region ≥ 2 msgs past cursor, or everyN messages; heuristic episode if model fails so cursor still advances.
- **Assemble**: hard pack system + memory + hot under `num_ctx − gen reserve`; UI shows packed estimate + hot/cold counts, then Ollama measured usage after reply.

## Memory quality (R2)

- **Profile heuristics**: regex extract for 我叫X / 宠物名 / 职业 / open loops → L3/L5 even if LLM misses.
- **L3 merge**: identity predicates supersede older values; user writes win; touch confidence on repeats.
- **Inject order**: L3 identity first; L5 open_loops first; episodes show open_loops + entities; prefer meso then micro.
- **Meso merge**: when micro episodes ≥ 8, fold oldest 6 into one meso (LLM + heuristic fallback).

## Not yet

- True embedding / vector store
- Dedicated small summarizer model
- L6 character state machine
- Full high-sens taxonomy UI
