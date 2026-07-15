# Memory scope R3

## Rules

| Scope | Who writes | Who injects |
|-------|------------|-------------|
| **master** | Meta (builtin Liora / `kind: meta`) chat extract & explicit remember | Meta only |
| **character** | Persona chats | That `characterId` only |

Episodes / cold chunks are tagged with the session’s `characterId` (including Meta’s id). Cross-session episode inject stays within the same character.

## Migration (one-shot)

Pre-R3 items without `scope`:

- L3 identity predicates (`name`, `has_pet`, …) → **master**
- Everything else → **character** + default character id (`char_default_assistant`)

Flag: `memory.scopeMigrated`.

## Not yet

- Meta “character index” (list of roles played)
- L6 state machine for 2D actions
- Optional “persona may read master” switch
