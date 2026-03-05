#!/usr/bin/env python3
"""
Wonderland Phone - Inter-session communication for Claude Code.

Two Claude sessions, two terminals, talking through ~/.wonderland/ like cubicles with phones.

Usage:
    python3 wonderland_phone.py lobby              # Register, see who's online, check inbox
    python3 wonderland_phone.py check              # Check inbox for unread messages
    python3 wonderland_phone.py send <target> <msg> # Send message to another session
    python3 wonderland_phone.py connect <target>    # Open shared context with another session
    python3 wonderland_phone.py disconnect          # Close current connection
    python3 wonderland_phone.py status              # Show current session status
    python3 wonderland_phone.py broadcast <msg>     # Send message to all online sessions
"""

import sys
import os
import json
import time
import hashlib
from pathlib import Path
from datetime import datetime, timezone

# ─── Configuration ───────────────────────────────────────────────────────────

WONDERLAND_DIR = Path.home() / ".wonderland"
SESSIONS_DIR = WONDERLAND_DIR / "sessions"
MESSAGES_DIR = WONDERLAND_DIR / "messages"
CONNECTIONS_DIR = WONDERLAND_DIR / "connections"
SHARED_DIR = WONDERLAND_DIR / "shared"

# Sessions older than this (seconds) are considered offline
HEARTBEAT_TIMEOUT = 300  # 5 minutes


# ─── Helpers ─────────────────────────────────────────────────────────────────

def ensure_dirs():
    """Create the ~/.wonderland/ directory structure."""
    for d in [SESSIONS_DIR, MESSAGES_DIR, CONNECTIONS_DIR, SHARED_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def get_project_name():
    """Derive session name from the current working directory."""
    cwd = Path.cwd()
    return cwd.name.lower().replace(" ", "-")


def get_session_id():
    """Create a unique session ID from project name + PID lineage."""
    project = get_project_name()
    # Use parent PID to tie to the terminal session, not this script's PID
    ppid = os.getppid()
    return f"{project}"


def session_file(session_id):
    return SESSIONS_DIR / f"{session_id}.json"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def now_ts():
    return time.time()


# ─── Session Registry ────────────────────────────────────────────────────────

def register_session():
    """Register or refresh the current session in the lobby."""
    ensure_dirs()
    sid = get_session_id()
    sf = session_file(sid)

    data = {
        "session_id": sid,
        "project": get_project_name(),
        "cwd": str(Path.cwd()),
        "pid": os.getpid(),
        "ppid": os.getppid(),
        "registered_at": now_iso(),
        "last_heartbeat": now_ts(),
        "status": "online",
    }

    # Preserve registration time if already registered
    if sf.exists():
        try:
            existing = json.loads(sf.read_text())
            data["registered_at"] = existing.get("registered_at", data["registered_at"])
        except (json.JSONDecodeError, KeyError):
            pass

    sf.write_text(json.dumps(data, indent=2))
    return sid


def heartbeat():
    """Update the heartbeat timestamp for the current session."""
    sid = get_session_id()
    sf = session_file(sid)
    if sf.exists():
        try:
            data = json.loads(sf.read_text())
            data["last_heartbeat"] = now_ts()
            sf.write_text(json.dumps(data, indent=2))
        except (json.JSONDecodeError, KeyError):
            register_session()
    else:
        register_session()


def get_online_sessions():
    """Return list of sessions that have heartbeated recently."""
    ensure_dirs()
    cutoff = now_ts() - HEARTBEAT_TIMEOUT
    sessions = []
    for f in SESSIONS_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            if data.get("last_heartbeat", 0) > cutoff:
                sessions.append(data)
        except (json.JSONDecodeError, KeyError):
            continue
    return sessions


def unregister_session():
    """Remove the current session from the lobby."""
    sid = get_session_id()
    sf = session_file(sid)
    if sf.exists():
        sf.unlink()


# ─── Messaging ───────────────────────────────────────────────────────────────

def inbox_dir(recipient):
    """Get the inbox directory for a recipient."""
    d = MESSAGES_DIR / recipient
    d.mkdir(parents=True, exist_ok=True)
    return d


def send_message(target, message):
    """Send a message to another session's inbox."""
    ensure_dirs()
    sender = get_session_id()

    # Verify target exists
    online = {s["session_id"] for s in get_online_sessions()}
    if target not in online:
        print(f"[WONDERLAND] WARNING: '{target}' is not online. Message queued anyway.")

    msg = {
        "from": sender,
        "to": target,
        "message": message,
        "timestamp": now_iso(),
        "ts": now_ts(),
        "read": False,
    }

    # Write message file with timestamp-based name to preserve order
    ts_str = f"{time.time_ns()}"
    msg_file = inbox_dir(target) / f"{sender}_{ts_str}.json"
    msg_file.write_text(json.dumps(msg, indent=2))
    print(f"[WONDERLAND] Message sent to '{target}'.")
    return msg_file


def check_inbox(mark_read=True):
    """Check the current session's inbox for unread messages."""
    ensure_dirs()
    sid = get_session_id()
    idir = inbox_dir(sid)

    messages = []
    for f in sorted(idir.glob("*.json")):
        try:
            data = json.loads(f.read_text())
            messages.append((f, data))
        except (json.JSONDecodeError, KeyError):
            continue

    unread = [(f, m) for f, m in messages if not m.get("read", False)]

    if not unread:
        print("[WONDERLAND] No unread messages.")
        return []

    print(f"[WONDERLAND] {len(unread)} unread message(s):\n")
    for f, m in unread:
        sender = m.get("from", "unknown")
        ts = m.get("timestamp", "?")
        body = m.get("message", "")
        print(f"  FROM: {sender}")
        print(f"  TIME: {ts}")
        print(f"  MSG:  {body}")
        print()

        if mark_read:
            m["read"] = True
            f.write_text(json.dumps(m, indent=2))

    return unread


# ─── Connections (Shared Context) ────────────────────────────────────────────

def connection_id(a, b):
    """Deterministic connection ID for two sessions."""
    pair = sorted([a, b])
    return f"{pair[0]}--{pair[1]}"


def shared_context_file(conn_id):
    """Get the shared context file for a connection."""
    return SHARED_DIR / f"{conn_id}.md"


def connect_to(target):
    """Establish a connection with another session (wall comes down)."""
    ensure_dirs()
    sid = get_session_id()

    # Verify target exists
    online = {s["session_id"] for s in get_online_sessions()}
    if target not in online:
        print(f"[WONDERLAND] WARNING: '{target}' is not currently online.")

    conn_id = connection_id(sid, target)
    conn_file = CONNECTIONS_DIR / f"{conn_id}.json"

    conn_data = {
        "connection_id": conn_id,
        "participants": sorted([sid, target]),
        "initiated_by": sid,
        "created_at": now_iso(),
        "status": "active",
    }

    conn_file.write_text(json.dumps(conn_data, indent=2))

    # Create shared context file if it doesn't exist
    ctx_file = shared_context_file(conn_id)
    if not ctx_file.exists():
        header = f"""# Shared Context: {sid} <-> {target}
# Connection established: {now_iso()}
# Both sessions can read/write this file to share context.
# ─────────────────────────────────────────────────────────

"""
        ctx_file.write_text(header)

    print(f"[WONDERLAND] Connected to '{target}'.")
    print(f"[WONDERLAND] Shared context file: {ctx_file}")

    # Notify the other session
    send_message(target, f"CONNECTION_REQUEST: {sid} has opened a channel with you. "
                 f"Shared context: {ctx_file}")

    return conn_id, ctx_file


def get_active_connections():
    """Get all active connections for the current session."""
    ensure_dirs()
    sid = get_session_id()
    connections = []
    for f in CONNECTIONS_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            if sid in data.get("participants", []) and data.get("status") == "active":
                connections.append(data)
        except (json.JSONDecodeError, KeyError):
            continue
    return connections


def disconnect(target=None):
    """Close a connection."""
    ensure_dirs()
    sid = get_session_id()

    if target:
        conn_id = connection_id(sid, target)
        conn_file = CONNECTIONS_DIR / f"{conn_id}.json"
        if conn_file.exists():
            data = json.loads(conn_file.read_text())
            data["status"] = "closed"
            data["closed_at"] = now_iso()
            conn_file.write_text(json.dumps(data, indent=2))
            send_message(target, f"DISCONNECT: {sid} has closed the channel.")
            print(f"[WONDERLAND] Disconnected from '{target}'.")
        else:
            print(f"[WONDERLAND] No active connection with '{target}'.")
    else:
        # Disconnect all
        for conn in get_active_connections():
            other = [p for p in conn["participants"] if p != sid]
            if other:
                disconnect(other[0])


# ─── Commands ────────────────────────────────────────────────────────────────

def cmd_lobby():
    """Full lobby experience: register, show online, show inbox, list connections."""
    sid = register_session()
    print(f"[WONDERLAND] Registered as '{sid}'\n")

    # Show who's online
    online = get_online_sessions()
    others = [s for s in online if s["session_id"] != sid]

    print("── Online Sessions ──")
    if others:
        for s in others:
            print(f"  • {s['session_id']}  ({s.get('cwd', '?')})")
    else:
        print("  (no other sessions online)")
    print()

    # Show active connections
    connections = get_active_connections()
    if connections:
        print("── Active Connections ──")
        for c in connections:
            other = [p for p in c["participants"] if p != sid]
            ctx = shared_context_file(c["connection_id"])
            print(f"  • Connected to: {other[0] if other else '?'}")
            print(f"    Shared context: {ctx}")
        print()

    # Check inbox
    print("── Inbox ──")
    unread = check_inbox(mark_read=False)
    if not unread:
        print("  (no unread messages)")
    print()

    # Show available targets
    if others:
        print("── Available to connect ──")
        for i, s in enumerate(others, 1):
            print(f"  {i}. {s['session_id']}")
        print()
        print("Use: python3 wonderland_phone.py connect <session_id>")
    print()

    # Return structured data for Claude to parse
    return {
        "session_id": sid,
        "online": [s["session_id"] for s in others],
        "connections": [c["connection_id"] for c in connections],
        "unread_count": len(unread),
    }


def cmd_check():
    """Check inbox and refresh heartbeat."""
    heartbeat()
    check_inbox(mark_read=True)


def cmd_send(target, message):
    """Send a message."""
    heartbeat()
    send_message(target, message)


def cmd_connect(target):
    """Connect to another session."""
    heartbeat()
    connect_to(target)


def cmd_disconnect(target=None):
    """Disconnect from a session."""
    heartbeat()
    disconnect(target)


def cmd_status():
    """Show current session status."""
    sid = get_session_id()
    sf = session_file(sid)

    print(f"[WONDERLAND] Session: {sid}")
    if sf.exists():
        data = json.loads(sf.read_text())
        hb = data.get("last_heartbeat", 0)
        age = now_ts() - hb
        print(f"  Registered: {data.get('registered_at', '?')}")
        print(f"  Last heartbeat: {age:.0f}s ago")
        print(f"  CWD: {data.get('cwd', '?')}")
    else:
        print("  NOT registered. Run 'lobby' to register.")
    print()

    connections = get_active_connections()
    if connections:
        print("  Active connections:")
        for c in connections:
            other = [p for p in c["participants"] if p != sid]
            print(f"    • {other[0] if other else '?'}")
    else:
        print("  No active connections.")


def cmd_broadcast(message):
    """Send a message to all online sessions."""
    heartbeat()
    sid = get_session_id()
    online = get_online_sessions()
    others = [s for s in online if s["session_id"] != sid]

    if not others:
        print("[WONDERLAND] No other sessions online.")
        return

    for s in others:
        send_message(s["session_id"], message)

    print(f"[WONDERLAND] Broadcast sent to {len(others)} session(s).")


def cmd_write_shared(target, text):
    """Append text to the shared context file with a connection."""
    heartbeat()
    sid = get_session_id()
    conn_id = connection_id(sid, target)
    ctx_file = shared_context_file(conn_id)

    if not ctx_file.exists():
        print(f"[WONDERLAND] No shared context with '{target}'. Connect first.")
        return

    entry = f"\n[{sid} @ {now_iso()}]\n{text}\n"
    with open(ctx_file, "a") as f:
        f.write(entry)

    print(f"[WONDERLAND] Written to shared context with '{target}'.")


def cmd_read_shared(target):
    """Read the shared context file with a connection."""
    heartbeat()
    sid = get_session_id()
    conn_id = connection_id(sid, target)
    ctx_file = shared_context_file(conn_id)

    if not ctx_file.exists():
        print(f"[WONDERLAND] No shared context with '{target}'. Connect first.")
        return

    print(ctx_file.read_text())


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1].lower()

    if cmd == "lobby":
        cmd_lobby()

    elif cmd == "check":
        cmd_check()

    elif cmd == "send":
        if len(sys.argv) < 4:
            print("Usage: wonderland_phone.py send <target> <message>")
            sys.exit(1)
        cmd_send(sys.argv[2], " ".join(sys.argv[3:]))

    elif cmd == "connect":
        if len(sys.argv) < 3:
            print("Usage: wonderland_phone.py connect <target>")
            sys.exit(1)
        cmd_connect(sys.argv[2])

    elif cmd == "disconnect":
        target = sys.argv[2] if len(sys.argv) > 2 else None
        cmd_disconnect(target)

    elif cmd == "status":
        cmd_status()

    elif cmd == "broadcast":
        if len(sys.argv) < 3:
            print("Usage: wonderland_phone.py broadcast <message>")
            sys.exit(1)
        cmd_broadcast(" ".join(sys.argv[2:]))

    elif cmd == "write":
        if len(sys.argv) < 4:
            print("Usage: wonderland_phone.py write <target> <text>")
            sys.exit(1)
        cmd_write_shared(sys.argv[2], " ".join(sys.argv[3:]))

    elif cmd == "read":
        if len(sys.argv) < 3:
            print("Usage: wonderland_phone.py read <target>")
            sys.exit(1)
        cmd_read_shared(sys.argv[2])

    elif cmd == "heartbeat":
        heartbeat()

    elif cmd == "unregister":
        unregister_session()
        print("[WONDERLAND] Session unregistered.")

    else:
        print(f"[WONDERLAND] Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
