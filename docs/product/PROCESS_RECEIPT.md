# The Process Receipt

*The contract between the Writer, the receipt, the ledger and the teacher's verify page. Version 4.0.*

## What it proves, in one paragraph

A process receipt records **how a text was entered into the JITTEr Writer**: when, over how many sittings, how much was typed, pasted and deleted, and in what rhythm. It is signed by the device that produced it and bound to the final text, so it cannot be edited or moved to another essay. It does **not** say who was at the keyboard, whether typed text was copied from another screen, or whether a language model wrote it. Every page that shows a receipt says this.

Words that never appear in anything a teacher sees: *risk, suspicious, bot, AI, human-like, authentic, verdict, detected*. Words that do: *typed, pasted, deleted, sessions, active writing time, revision, typing rhythm (one statistic, not a verdict)*.

## Student flow

1. Open the Writer (an extension page). The document autosaves locally (text, formatting, ledger, session state); reopening restores it. **New document** starts fresh after a confirmation.
2. Write, over as many sittings as needed. The ledger records operations, never characters.
3. **Get receipt** signs the receipt with the device key, attests it with the server when online (optional; the receipt verifies offline without it), copies it to the clipboard (HTML badge + plain text code, as today) and offers two downloads: the receipt (`.jitter-receipt.json`) and the full ledger (`.jitter-ledger.json`, optional, for a replay).
4. The student submits the essay plus the receipt code (or link). The ledger is shared only if the teacher asks for a replay.

## Receipt format (the signed payload)

Top-level fields are kept where older verifiers and the attest server expect them (`war` in [0, 1], `keys` ≥ 20, `text_hash`, `url`, `minted_at`, `publicKeyJwk`):

```json
{
  "version": "4.0", "type": "process-receipt",
  "title": "Untitled",
  "text_hash": "<sha256 of the final text, normalized as CryptoUtils.textHash>",
  "chars": 4380, "words": 812,
  "url": "jitter://writer", "minted_at": "<iso>",
  "publicKeyJwk": { "kty": "EC", "crv": "P-256", "x": "…", "y": "…" }, "publicKeyId": "<fingerprint>",
  "previousBadge": "<hash of this device's previous receipt or null>",
  "keys": 4120, "war": 0.71, "war_uncapped": 0.71,

  "process": {
    "started_at": "<iso of the first operation>", "finished_at": "<iso of minting>",
    "sessions": [ { "start": "<iso>", "end": "<iso>", "active_ms": 2710000, "typed": 3100, "pasted": 0, "deleted": 410 } ],
    "active_ms": 6120000,
    "typed_chars": 4120, "pasted_chars": 380, "deleted_chars": 610,
    "typed_share": 0.92,
    "paste_events": [ { "t": "<iso>", "len": 320 }, { "t": "<iso>", "len": 60 } ],
    "away": { "events": 3, "total_ms": 412000 },
    "revision": { "backspaces": 540, "cursor_jumps": 12, "backward_edits": 9, "editing_linearity": 0.97 },
    "timeline": { "bucket_ms": 60000, "buckets": [ { "i": 0, "typed": 110, "pasted": 0, "deleted": 4 }, … ] }
  },
  "typing": { "mean_dwell": 91.2, "std_dwell": 24.1, "mean_flight": 214.5, "std_flight": 96.3, "keys": 4120 },
  "ledger": { "hash": "<final chain hash>", "checkpoints": 41, "ops": 1180 }
}
```

- `typed_share` = typed_chars / (typed_chars + pasted_chars); it is a share of what was *entered*, not of the final text (deletions make those differ).
- `timeline.buckets` are counts per bucket since `started_at`; buckets with no activity are omitted. `bucket_ms` is 60 000 while the span is ≤ 4 h, 300 000 up to 20 h, otherwise 3 600 000 — at most 240 buckets. Deleted counts are characters removed (a selection of 40 characters deleted at once counts 40).
- `war` is the shared engine's typing-rhythm score for the whole document (`JitterWAR` via `JitterBio.scoreWAR`); the receipt carries it as one statistic. `war_uncapped` is the same number (the Writer applies no age cap).
- Size: typically 5–10 KB for a 5 000-character essay written over a few hours; the timeline caps at 240 buckets, so a receipt never exceeds about 16 KB.
- Signed with `CryptoUtils.signBadge` over `canonicalJson` of everything except `CryptoUtils.UNSIGNED_FIELDS` (`signature`, `attestation`, `server_signature`, `server_key_id`), exactly as the extension's badges are today, so the attest server, `verify-page.js` and `content.js`'s certificate all keep working.

## Ledger format (local file, the student's to share)

```json
{ "version": "4.0", "type": "jitter-ledger",
  "started_at": "<iso>", "exported_at": "<iso>",
  "ops": [ … ],
  "checkpoints": [ { "i": 0, "op_index": 0, "t": "<iso>", "content_hash": "<sha256>", "content": "…", "hash": "<chain hash>" }, … ],
  "final_hash": "<hash of the last checkpoint>" }
```

Operations (no characters, ever):

| op | fields | when |
|---|---|---|
| `type` | `t, n, ms` | a run of `n` keystrokes lasting `ms`; a run ends at a pause over 2 000 ms, at any other operation, or at 50 keys |
| `delete` | `t, n` | Backspace/Delete/cut removed `n` characters |
| `paste` | `t, len` | a paste of `len` characters (the text itself is never recorded) |
| `blur` / `focus` | `t` | the Writer lost / regained focus |
| `session` | `t, k` | start of sitting `k` (page load, or a gap over 10 minutes since the previous operation) |

Checkpoints hold a content snapshot for the replay and are hash-chained: `hash = sha256(prev_hash + '|' + op_index + '|' + t + '|' + content_hash)`, `prev_hash = 'genesis'` for the first, `content_hash = sha256(content)`. A checkpoint is taken after at most 60 s of activity since the last one, after every paste, at every session boundary, and at minting. A verifier recomputes the chain from the file and compares `final_hash` with `receipt.ledger.hash`.

## Sessions and active time

- A new session starts on page load and whenever the gap between consecutive operations exceeds 10 minutes.
- `active_ms` is the sum, within a session, of the gaps between consecutive operations capped at 90 s, plus the durations of typing runs. Time away (`blur` to `focus`) never counts.

## The verify page (teacher)

Inputs: the receipt (pasted HTML badge, code, or link), the essay text (optional but recommended), the ledger file (optional).

Sections, in this order:

1. **Receipt** — signature valid / invalid; text matches / does not match / not provided; server record (date the server recorded it, countersignature verified / not checked / none); device key id.
2. **Summary** — "Written over 3 sittings across 2 days · 1 h 42 min of active writing · 4,120 characters typed, 380 pasted in 2 pastes, 610 deleted · 92% of what was entered was typed here."
3. **Timeline** — inline SVG bars per bucket (typed / pasted / deleted), paste events marked, session boundaries drawn. No libraries (MV3 CSP).
4. **Pastes** — each paste: when (offset from start), size, and its share of the final text length.
5. **Revision** — backspaces, backward edits, cursor jumps, editing linearity, described as revision activity.
6. **Typing rhythm** — dwell and flight means with spread, and the rhythm score, labelled "one statistic, not a verdict".
7. **Ledger** (when a file is provided) — chain recomputed ✓/✗, matches this receipt ✓/✗, and a replay scrubber over the content snapshots with paste checkpoints highlighted.
8. The fixed note from the top of this document.

Older (v3) extension badges still verify on the same page: signature, text binding, server record and basic counts, under the same language rules.

## Server

The attest contract is unchanged (`docs/architecture/TRUST_LAYER.md`); the Writer attests with `site_key: "writer"`. Attestation is optional for the education flow: an offline receipt verifies fully except for the server's timestamp.
