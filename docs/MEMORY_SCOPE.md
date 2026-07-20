# Memory scope R4 — Meta steward

## Rules

| Scope | Who writes | Who injects |
|-------|------------|-------------|
| **master** | Meta chat extract & explicit remember | Meta + personas |
| **character** | Persona chats | Owner in full; Meta catalog/search when relevant |
| **orphan** | Migration/import when ownership is unknown | Meta, which reviews and assigns ownership |

Episodes / cold chunks remain tagged with the session’s `characterId`. Personas stay isolated. Meta can retrieve relevant episode summaries across personas, but cold detail chunks remain character-scoped.

## Migration (one-shot)

Pre-R4 items are normalized as follows:

- L3 identity predicates (`name`, `has_pet`, …) → **master**
- Items with a valid `characterId` → **character**
- Items without an owner → **orphan** (identity facts may still become **master**)

Flags: `memory.scopeMigrated`, `memory.scopeVersion = 2`.

## Not yet

- L6 state machine for 2D actions
- Optional visibility controls, if future users ask for them; controls should live directly beside each memory
