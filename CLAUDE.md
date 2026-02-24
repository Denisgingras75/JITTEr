# JITTEr - Claude Code Instructions

## Project Overview
JITTEr (Jitter Integrity Tracking & Typing Entropy Recognition) is a Chrome extension for human authorship verification through keystroke biometrics.

## Wonderland Phone - Inter-Session Communication

On session start, run the lobby to register this project and check for messages:

```
python3 ~/wonderland_phone.py lobby
```

This will:
- Register this session under the project folder name
- Show which other Claude sessions are online
- Display any unread messages
- List active connections with other sessions

### Quick Reference

| Command | What it does |
|---|---|
| `python3 ~/wonderland_phone.py lobby` | Register, see who's online, check inbox |
| `python3 ~/wonderland_phone.py check` | Check inbox for new messages |
| `python3 ~/wonderland_phone.py send <target> <msg>` | Send a message to another session |
| `python3 ~/wonderland_phone.py connect <target>` | Open shared context channel |
| `python3 ~/wonderland_phone.py disconnect [target]` | Close a connection |
| `python3 ~/wonderland_phone.py write <target> <text>` | Append to shared context file |
| `python3 ~/wonderland_phone.py read <target>` | Read shared context file |
| `python3 ~/wonderland_phone.py broadcast <msg>` | Message all online sessions |
| `python3 ~/wonderland_phone.py status` | Show this session's status |

### How It Works
- All sessions communicate through `~/.wonderland/`
- Sessions register in `~/.wonderland/sessions/`
- Messages are stored in `~/.wonderland/messages/<recipient>/`
- Connected sessions share a context file in `~/.wonderland/shared/`
- The inbox auto-check hook runs every prompt to catch incoming messages
