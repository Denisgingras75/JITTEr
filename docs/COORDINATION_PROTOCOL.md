# The Switchboard Protocol
### File-Based Peer Coordination for Parallel AI Coding Sessions
**Denis Gingras — February 2026**

---

## The Problem Nobody Solved

Every AI coding tool on the market in 2026 — Copilot, Cursor, Claude Code — treats
each session as a solo operator. One session, one task, one human watching.

Open three tabs on the same repo? They're blind to each other. They edit the same
files, duplicate the same refactors, create the same merge conflicts. Three people
working in the same kitchen with the lights off.

The industry is scaling AI capability. Nobody is scaling AI coordination.

## The Insight

AI coding sessions already speak one language fluently: **files**. They read files,
write files, diff files, commit files. The filesystem isn't just their workspace —
it's their native communication medium.

So instead of building servers, databases, websockets, or orchestration frameworks
to coordinate parallel sessions, use what's already there. **A shared directory in
the project repo becomes the coordination channel.** JSON files become the protocol.

No infrastructure. No dependencies. No accounts. Drop a directory into any repo and
every session that opens it can see the board.

## The Protocol

A `.claude-coord/` directory at the project root acts as a switchboard with three
channels:

```
.claude-coord/
├── sessions/    # Who's here and what they're doing
├── claims/      # Who owns which files right now
└── messages/    # Direct and broadcast communication
```

**Sessions register on arrival** — announcing their identity and intent. The board
becomes a live map of parallel work.

**Files are claimed, not just edited** — before touching a file, a session checks
the board. If it's claimed, the session negotiates through messages instead of
creating a conflict. Ownership is explicit, not implicit.

**Messages enable real-time negotiation** — "I need crypto-utils.js, can you release
it?" / "Done, it's yours." The sessions coordinate like teammates, not like
processes competing for a lock.

**Heartbeats and cleanup prevent stale state** — sessions that disappear get reaped.
No zombie claims blocking progress.

## Why This Matters

The coordination cost between human developers is the single largest tax on
engineering productivity. Meetings, Slack threads, PR reviews, merge conflicts,
context switching. It doesn't scale.

This protocol drops the coordination cost between AI sessions to **near zero**.
A few JSON files. Milliseconds of overhead. The result:

- **Parallel feature development** — three sessions, three features, no conflicts
- **Domain specialization** — each session builds deep context in its area
- **Human as architect** — dispatch tasks, review results, ship faster

The human stops being a typist doing sequential work. They become a project manager
running a team.

## What Comes Next

This is a local protocol — sessions on one machine coordinating through one
directory. But the pattern is network-ready. Replace the local directory with a
shared cloud volume and the same protocol works across machines, across developers,
across time zones.

A team of developers, each running their own AI coding sessions, all coordinating
through one board. That's not a tool anymore. That's infrastructure for a new way
of building software.

---

*First implemented in the JITTEr project, February 24, 2026.*
*Concept and architecture by Denis Gingras.*

© 2026 Denis Gingras. All rights reserved.
