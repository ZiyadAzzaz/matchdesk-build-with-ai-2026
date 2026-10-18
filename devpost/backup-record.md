# Prior-project source backups

Created before beginning this implementation, at the participant's explicit request. Original projects remain in their folders. ZIP entries were read back and checked against per-file SHA256 values; each ZIP passed its integrity check. These are source snapshots, excluding private learner profiles, credentials, Git history, installed skills, environments and generated caches.

| Project | Workspace artifact | Source files | SHA256 |
|---|---|---|---|
| QueueZero | Parent `.dist/archives/QueueZero-2026-10-18.zip` | 52 | `db710b9552b662f7a7d9ea98e897d17d8df62c99fa16ddb55f79355e1c9b2305` |
| PacketProof | Parent `.dist/archives/PacketProof-2026-10-18.zip` | 40 | `affb15b971f328d5bee134ebb7a6abd996707867f19974c1939eff16a54e063b` |

Parent `.dist/archives/backup-manifest.json` records hashes for individual files. Restore into a fresh folder, install each project's documented requirements and run its documented launcher. Do not extract over unrelated work. MatchDesk is a separate local repository and is not inside either earlier snapshot.
