# Checkpoints

Checkpoints give you undo/redo for agent actions. Every time you send a prompt and the agent responds, a checkpoint is created. You can browse past checkpoints, undo to an earlier point, or branch from a previous checkpoint by sending a new message.

## Browsing

Use `Ctrl+B` and `Ctrl+F` to step backward and forward through checkpoints.

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | View previous checkpoint |
| `Ctrl+F` | View next checkpoint (or back to live) |

When viewing a past checkpoint, messages after that point are dimmed and a separator shows:

```
↶ Viewing checkpoint #2, send a message to rewind here.
```

Browsing is instant and read-only — no files are changed, no git operations run. Press `Ctrl+F` past the last checkpoint to return to live view.

## Branching

Send a message while viewing a past checkpoint to **branch** from it. The conversation is truncated to that checkpoint's messages, and your new message continues from there. Later messages are discarded from the model context but remain visible (dimmed) in the chat.

## Undo & Redo

`/checkpoint undo` reverts the last checkpoint — both the conversation state and the files on disk. If the checkpoint had file edits and was git-tagged, the files are restored to their state at the target checkpoint.

| Command | Description |
|---------|-------------|
| `/checkpoint` | List all checkpoints |
| `/checkpoint N` | View checkpoint N |
| `/checkpoint live` | Back to live view |
| `/checkpoint undo` | Undo last checkpoint |
| `/checkpoint undo N` | Undo to checkpoint N |
| `/checkpoint redo` | Redo last undone checkpoint |
| `/checkpoint save` | Force save current state as git tag |

Undone checkpoints stay visible in the chat (dimmed) with a separator:

```
↶ Rewound past this point.
```

Redo restores the undone checkpoint's files and messages. Sending a new message after an undo clears the redo stack, like any undo/redo system.

## Checkpoint Rail

A vertical rail on the right edge of the chat shows checkpoint dots:

- Colored dot — completed checkpoint with file edits
- Muted dot — completed checkpoint (read-only, no edits)
- Spinner — currently running checkpoint
- Hollow dot — undone checkpoint
- Orange dot — currently viewed checkpoint

When there are more checkpoints than the rail can display, `+N` indicators show how many are hidden above and below. The visible window follows your navigation.

## Git Integration

Checkpoints that include file edits are automatically git-tagged when the agent finishes. Tags use lightweight git tags (no commits left in history) with the naming pattern:

```
soulforge/cp-<tabId>-<index>-<prompt-slug>
```

File restore uses `git show <tag>:<path>` for per-file recovery — only files edited in the undone checkpoints are reverted. Other tabs' files are never touched.

**No git repo?** Checkpoints still work for browsing and conversation undo. File restore is skipped silently — the agent will re-apply changes based on the rewound conversation.

## Sessions

Checkpoint git tags are saved with sessions and restored when a session is loaded. Deleting a session cleans up its git tags.

## Tabs

Each tab has its own independent checkpoint history. Git tags are namespaced by tab ID so they never collide. Undoing in one tab has no effect on other tabs.

## Steering

Steering messages (sent while the agent is working) do not create new checkpoints. They fold into the current running checkpoint.
