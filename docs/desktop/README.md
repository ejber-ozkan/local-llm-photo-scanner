# Desktop redesign: start here

Status: proposed design for review, 12 September 2026. No application implementation
has started. Repository reviewed at `1978f11` (v3.10.0). Performance figures below
are acceptance targets, not measured results. Tracking: `LocalAIPhotoMetadataApplication-3dy`.

Delivery epic: `LocalAIPhotoMetadataApplication-8lz`. Design acceptance is
`LocalAIPhotoMetadataApplication-8lz.1`; phases P0-P5 are `.2` through `.7`,
with sequential dependencies. All implementation phases remain unstarted.

## Agreed product requirements

- One installable application per OS; dependencies managed by the application,
  with separate, managed model downloads.
- Windows 10/11, macOS Ventura 13+ on Intel and Apple Silicon, Ubuntu first,
  Fedora and Red Hat Linux. Mainstream Intel/AMD hardware from around 2022;
  a dedicated GPU is optional.
- Libraries can contain millions of photos/videos. Originals may live on SSD,
  NAS, USB, or external disks. Opening, searching, browsing, and importing take
  priority over AI throughput.
- Local AI by default, multiple provider implementations, and explicit opt-in
  to third-party/cloud APIs with clear data-disclosure notices.
- Optional home-network browser access. A fresh library is acceptable.
- Modern UI with light/dark themes, preserving existing functionality and the
  right-side scrolling date-navigation rail.
- Reusable, meaningful regression tests and concise context that different AI
  coding harnesses can use. No application code changes during design review.

## Proposed direction

Reuse React/TypeScript and established processing behavior. Use a Tauri 2 shell,
a Rust catalogue/application engine, local SQLite/FTS5, bounded thumbnail and
vector caches, and managed inference helpers. Preserve useful Python AI code
behind a worker boundary; do not load Python/ML to open the gallery.

RHEL installation, packaged media support, Python native dependencies, and
million-item query/index performance must pass the early feasibility gate.
Electron is the shell fallback if packaged WebKit cannot meet the platform
contract. Changing the shell must not require changing catalogue services.

## Reading order

| Document | Purpose |
| --- | --- |
| [Specification](specification.md) | Scope, feature parity, platform and performance contracts |
| [Architecture](architecture.md) | Components, storage, provider contracts, failure recovery |
| [UI design](design.md) | Layout, date rail, themes, accessibility, storage/privacy states |
| [Validation](validation.md) | Repeatable tests, measurements, packaging/release evidence |
| [Delivery plan](plan.md) | Ordered phases, ownership, completion criteria |

Read this page and the relevant document, then follow source references only
where needed. Beads holds live task status; these documents hold design decisions.

## Review findings to retain

| Current implementation | Design consequence |
| --- | --- |
| `backend/api/routes/gallery.py`: original-size image responses; search defaults to 500 rows | Persistent thumbnails, bounded pages and full-library date seeking |
| `frontend/src/components/Gallery.tsx`: date markers built from returned photos | Server-produced histogram for the complete filtered library |
| `backend/database_setup.py`: face matching iterates stored JSON vectors | Indexed candidate retrieval, exact reranking and quality evaluation |
| `backend/services/scan_worker.py`: sequential stages and mixed storage/model logic | Durable stage jobs, provider interfaces and resource budgets |
| `backend/core/config.py`, `core/chroma.py`: working-directory-dependent paths | OS application-data directories; catalogue stays on local storage |
| `backend/backup_db.py`, `restore_db.py`: direct SQLite/Chroma file copying | Consistent database snapshots and recoverable derived indexes |
| `backend/requirements.txt`: largely unpinned runtime/tool dependencies | Separate locked development/runtime environments per target |
| Existing pytest/RTL/MSW tests include folder recovery, timelines and duplicate reports | Preserve useful scenarios; extend them across process/install boundaries |
| `LocationMap.tsx`, `ImageMapPage.tsx`: external map services | Map network disclosure independent of cloud AI settings |
| `.gitignore` excludes agent instructions, skills and skill manifest | Make future handoff context reproducible in a separate configuration task |

Descriptions currently produce pet labels; visual pet identity recognition is
not an established existing feature. The README's React 18 claim differs from
the React 19 package. Source behavior is the parity baseline.

## Agent and skill handoff

Already installed locally for Codex and Gemini CLI: `e2e-testing-patterns` and
`github-actions-templates`. Existing useful skills: `python-design-patterns`,
`python-performance-optimization`, `python-testing-patterns`, `python-code-style`,
and `vercel-react-best-practices`. `chromadb-integration-skills` is relevant to
the legacy baseline/comparison, not a requirement to retain Chroma.

Before desktop implementation, review/install a focused Tauri 2 skill such as
[tauri-v2](https://skills.sh/nodnarbnitram/claude-code-extensions/tauri-v2), and
discover a focused Rust testing/design skill. Review their contents and record
source revisions; do not install whole overlapping skill collections. Existing
React Native guidance does not apply to this desktop React UI.

Keep a short, tracked shared instruction entry, with minimal Gemini/Codex
adapters only when necessary. Pin reproducible skill sources in a tracked
manifest/bootstrap procedure, keeping caches and personal settings ignored.
Do this in the configuration phase, not by silently editing current instructions.
Current instructions contain duplicated Beads workflow text and unconditional
session-close rules that need an explicit documentation-only workflow later.

For each implementation task: read its Beads entry, affected contracts and
relevant skill; run the smallest meaningful verification; record changed paths,
commands/results and next dependency in Beads. Never mark unrun checks as passed.
Update the code graph when required for code commits, but inspect tests/build
files directly: `.graphifyignore` currently excludes many of them.

## Evidence and limits

Official platform sources are linked in the architecture and validation files.
No current-suite run, installed-package test, AI quality evaluation or performance
benchmark was performed for this review. Exact dependency/model versions are
selected and pinned during feasibility work, using recorded results. This draft
does not claim all proposed platforms already work.
