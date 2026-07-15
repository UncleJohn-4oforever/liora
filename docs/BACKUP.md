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
  "settings": { "locale", "defaultModelId", "memoryEnabled", "defaultCharacterId?" },
  "sessions": [ ... ],
  "memory": { "version": 1, "memories", "episodes", "chunks", "cursors", "recentUpdates" },
  "characters": [ { "id", "name", "description", "systemPrompt?", "..." } ]
}
```

- `characters`：**0.6+** 导出必含；更早备份可无此字段。
- 导入时若备份无 `characters`：**保留本地角色库**（不抹掉）。

## Import modes

| Mode | Behavior |
|------|----------|
| **Merge** | Union by id; newer `updatedAt` wins for sessions/memories/characters |
| **Replace** | Local sessions + memory replaced by backup; characters replaced only if backup includes them |

## Verify

1. Export → download JSON  
2. Change something (new chat / memory)  
3. Import merge or replace  
4. Refresh page — data matches expectation  
