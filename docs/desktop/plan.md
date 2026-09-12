# Delivery plan

Status: proposed implementation sequence, documentation only. Live status and
dependencies belong in Beads. A stage passes by producing evidence, not by checking
off a document. Implementation begins only after the design is accepted.

## Dependency order and ownership

| Phase | Depends on | Owns | Deliverable and exit evidence |
| --- | --- | --- | --- |
| P0: Baseline and reproducible context | Design acceptance | Development/test dependency locks, fixture manifests, verification entry, scoped agent configuration | Existing suite results captured safely; F01-F14 mapped; relevant skills/commands recoverable from a fresh checkout |
| P1: Platform and scale feasibility | P0 | Throwaway/isolated packaging and benchmark prototypes; decision records | Packaged shell/helpers/media work on minimum OS targets including RHEL route; 500,000-file queries/indexes and GPU compatibility matrix evaluated; framework/engine/index decisions recorded |
| P2: Catalogue and job foundation | P1 | `crates/catalog-core/`, schema/migrations, storage/source adapters, shared contract definitions | Bounded discovery, stable IDs, date seek/histogram, FTS, restart-safe stages, cache budgets and snapshot tests pass |
| P3: Shared desktop/browser UI | P2 | `frontend/`, API transport adapter, `src-tauri/` integration | Modern themes and date rail, all browsing/folder/detail/duplicate/map/settings flows, keyboard/touch behavior and LAN pairing pass |
| P4: AI and media integration | P3 | `workers/inference/`, provider/runtime adapters, model manifests and media processing adapters | Managed local and optional external providers, face/CLIP quality parity, sandbox and batch reuse, playback/transcode and resource limits pass |
| P5: Release hardening | P4 | `.github/workflows/`, installer/update configuration, release fixture/report infrastructure | All F01-F14 journeys, scale budgets, crash/restore/update checks and signed production-package validation pass |

Phases are serial by default to avoid multiple agents editing shared contracts
and lockfiles. Within a phase, Beads tasks may run independently only with explicit
file ownership. Contract edits finish before dependent UI/worker edits begin.
Keep the existing application runnable until its replacement passes feature
parity. Fresh-library permission removes legacy conversion work; it does not
authorise deleting an existing database or originals.

## P0: Baseline and context

Capture current behavior using small, isolated media/catalogue fixtures. Retain
tests for folder restart recovery, date scopes, duplicate CSV safety, and user
controls. Resolve clean-install test dependency/isolation issues before adopting
the suite as a gate. Record existing failures instead of muting broad test groups.

Separate and lock runtime/dev dependencies. Add a short tracked agent entry and
source-pinned skill bootstrap in its own task; preserve user preferences and
remove duplication deliberately. Keep personal configuration, model data and
caches ignored. Use Beads for task state and these documents for design rationale.

## P1: Prove the difficult parts first

Build a minimal Tauri/React app with a paged local engine, packaged Python helper,
one face/embedding operation and HEIC/video playback. Test Windows 10 without a
preinstalled WebView2, macOS 13 on both architectures, Ubuntu, Fedora and the
RHEL packaged-runtime candidate. Measure bundle size, startup, helper startup,
model download/recovery and idle memory. This is a prototype, not the product UI.

Prototype full-query date histograms, keyset/date seeks, filtered text search and
incremental discovery at 100,000/500,000 files. Compare current Chroma behavior
with embedded vector candidates under memory, indexing and rare-filter recall tests.
Record the cost of Python reuse versus native paths before committing to ports.
The reduced cap removes larger-library stress and distributed/sharded-index work;
keep a single local catalogue and simple embedded indexes unless measurements
justify more. Retain pagination, thumbnail budgets and durable jobs. Prove GPU
capability detection and representative 2022-onward device/runtime combinations,
with CPU fallback, before advertising accelerated local processing.

Select Tauri only if the platform path is supportable; otherwise compare Electron
using the same engine/API contract. Select the vector implementation only after
the acceptance evidence. Do not solve a failed gate by silently dropping Red Hat,
Ventura, Windows 10, date-rail coverage, or the 500,000-file capacity contract.

## P2: Build the fast path

Implement the Rust catalogue/domain and source adapter boundary, migration runner,
single writer, query client contracts, FTS and date histogram/seek. Add metadata
discovery before expensive stages. Prove source disconnect/relink, Unicode,
symlink cycles, nested roots, reimport and interrupted reconciliation.
Enforce the cap through atomic admission and recoverable import reservations;
verify concurrent imports and clear capacity-paused progress states.

Implement durable stage leases, generation checks, cancellation, per-source I/O
limits and visible-work priority. Add local thumbnail cache and coherent snapshots.
Keep indexes reconstructible and changes revisioned. A test worker returns fixed
results before real model integrations arrive.

## P3: Redesign with parity

Start with tokens, themes, virtualised contact sheet, date rail and inspector.
Exercise a 500,000-file fixture before building all pages. Port shared components
and existing behaviors progressively; centralise server state/query cancellation
and generate API types rather than duplicating response schemas.

Complete F01-F13 presentation using deterministic worker/provider fakes. Preserve
date order and scopes, duplicate exports, metadata, label controls, sandbox,
backup/restore, maps and video fallback controls. Add LAN roles/pairing, source
availability and cloud/map disclosures. Review representative light/dark and
compact layouts, then record visual decisions once for later agents.

## P4: Connect inference and media

Extract common batch/sandbox processing into a packaged Python worker with versioned
protocol. Port only paths justified by P1 evidence. Add managed llama.cpp runtime
candidate, Ollama-native and OpenAI-compatible adapters, capability probes,
download integrity and job-scoped provider/privacy settings.

Choose/pin model manifests after measured quality, memory and redistribution
review. Add indexed face matching with exact reranking and separate clustering
threshold evaluation. Prevent model/embedding-space mixing. Integrate media
codecs/transcode lifecycle and OS-native actions. Test 2022-onward cross-vendor
GPU profiles, per-stage device selection, memory/device errors, CPU fallback and GPU
contention, cold model load, cloud limits, offline execution and crash recovery.

## P5: Ship verified artifacts

Promote the prototype build matrix into reusable workflows, minimum-OS runners,
signing/notarization and supported package-manager/update routes. Validate exact
production artifacts separately from instrumented desktop test builds. Confirm
that clean installs require no Python/Node/manual model setup for the managed path.

Run the feature matrix, 100,000/500,000-file measurements, capacity-boundary,
GPU compatibility and storage-failure suites. Report results with hardware and
dependency/model revisions. Publish only
after platform and data-integrity gates pass. Ship human-readable setup/privacy
notes, source-state help and known limits alongside release artifacts.

## Work item contract and continuation

Each Beads implementation task records: feature IDs, owned files, dependencies,
specific acceptance scenarios, verification commands/results and relevant decision
links. Prefer one independently testable change per task. End a task with a short
handoff including unresolved failures and the next ready dependency; do not copy
the entire design into every prompt. Keep decision records short and replace
outdated recommendations after a gate resolves.

The next implementation action is P0 after design acceptance. No implementation
phase, runtime installation, model download or application source edit has been
performed as part of preparing this plan.
