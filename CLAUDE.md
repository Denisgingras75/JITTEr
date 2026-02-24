# Claude Code Project Instructions

## Multi-Session Coordination Protocol

This project uses a file-based coordination channel at `.claude-coord/` to prevent
conflicts when multiple Claude Code sessions work on the repo simultaneously.

### Required: Register on startup

When you begin a session, register yourself and check the board:

```bash
.claude-coord/coord register <your-session-id> "<what you're working on>"
.claude-coord/coord status
```

Use a short, unique session ID (e.g., `session-A`, `feat-auth`, `fix-crypto`).

### Required: Claim files before editing

Before editing any file, check if it's claimed and claim it if available:

```bash
.claude-coord/coord check <filename>
.claude-coord/coord claim <your-session-id> <filename> [more files...]
```

If a file is already claimed by another session, **do not edit it**. Send a message
to coordinate instead:

```bash
.claude-coord/coord send <your-id> <their-id> "Need to edit <file> — can we sync?"
```

### Required: Check messages periodically

Read your messages to see if other sessions need to coordinate:

```bash
.claude-coord/coord read <your-session-id>
```

### Required: Clean up when done

When you finish your work, deregister to release all claims:

```bash
.claude-coord/coord deregister <your-session-id>
```

### Quick reference

| Command | Description |
|---------|-------------|
| `coord register <id> <desc>` | Register session |
| `coord status` | Full board view |
| `coord claim <id> <files...>` | Claim files |
| `coord unclaim <id> <files...>` | Release files |
| `coord check <file>` | Check file status |
| `coord send <from> <to> <msg>` | Send message (`to` can be `all`) |
| `coord read <id>` | Read & consume messages |
| `coord heartbeat <id>` | Update heartbeat |
| `coord deregister <id>` | Unregister + release all |
| `coord clean` | Remove stale sessions (30 min) |
