# Backup / Settings

## Settings panel

Top bar → **设置**

- Language (zh / EN)
- Memory on/off
- Default Ollama model id
- Export / import backup

## Backup format

```json
{
  "format": "liora-backup",
  "version": 1,
  "exportedAt": 0,
  "app": "Liora",
  "settings": { "locale", "defaultModelId", "memoryEnabled" },
  "sessions": [ ... ],
  "memory": { "version": 1, "memories", "episodes", "chunks", "cursors", "recentUpdates" }
}
```

## Import modes

| Mode | Behavior |
|------|----------|
| **Merge** | Union by id; newer `updatedAt` wins for sessions/memories |
| **Replace** | Local sessions + memory replaced by backup |

## Verify

1. Export → download JSON  
2. Change something (new chat / memory)  
3. Import merge or replace  
4. Refresh page — data matches expectation  
