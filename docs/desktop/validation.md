# Validation and release evidence

## Principles and baseline

Coverage identifies blind spots. Acceptance is based on behavior, invariants,
failure recovery and measured performance. Keep tests deterministic and isolated;
use real SQLite and small media fixtures where storage/decoding is the behavior
under test, and fake external providers where network/model variability is not.

The current project has pytest and Vitest/RTL/MSW suites, including durable folder
queue recovery, date-scoped scanning, duplicate CSV/report cases and UI actions.
Do not replace these with superficial render/snapshot assertions. Current pass
status and coverage are unverified. Backend setup does not explicitly declare
all test dependencies, and its fixture environment paths do not directly control
all module globals; establish an isolated baseline before running destructive
database tests. Do not run test scripts against a user's live working directory.

Phase 0 captures existing commands in an isolated checkout/data directory:
frontend `npm ci`, `npm run test:run`, `npm run lint`, `npm run build`; backend
its pinned development environment and `python -m pytest`. Record dependencies,
failures and exclusions rather than claiming a clean baseline by ignoring them.

## Test responsibilities

| Layer | Repeatable protection |
| --- | --- |
| Pure/domain tests | Date provenance, path identity, stage states, scope rules, provider capability mapping and error normalization |
| Storage integration | Migrations, FTS update/delete, stable pagination/seek, histograms, writer contention, outbox replay, snapshot/restore |
| Filesystem/media integration | Unicode, symlink loops, nested roots, permissions, renamed/disconnected drives, corrupt/truncated HEIC/video, range/seek and timeouts |
| Provider contracts | Ollama/OpenAI-style request differences, unsupported vision/embeddings, response validation, 429/backoff, timeout/cancel, secret redaction and no-cloud-fallback |
| UI component tests | Date rail, virtualisation/anchors, theme persistence, keyboard/focus, all existing controls and error/offline states |
| Browser journeys | Paired LAN browse/search; permissions, session revocation and TLS/origin rules; shared UI with real host engine |
| Desktop journeys | Installed app starts, imports, date-seeks, searches, labels, backs up/restores and resumes after interruption |
| AI evaluation | Fixed licensed image set, face false matches, pet labels, descriptions, text/image retrieval quality and model changes |
| Performance | 100,000/500,000-file catalogues, capacity boundaries, memory/latency, incremental import, index maintenance and storage latency |
| GPU compatibility | Representative 2022-onward NVIDIA/AMD/Intel/Apple hardware on applicable OS/runtime combinations, device selection, CPU fallback and memory/device failures |

A minimum release journey runs: fresh install -> create library -> import -> date
seek -> keyword and semantic search -> identify -> duplicate CSV -> video preview
-> pause/restart/resume -> backup/restore -> update -> uninstall. Use targeted
separate tests for each transition so a single failure does not hide all results.

## Failure and scale fixtures

Use generated metadata for 100,000/500,000-file tests and a small committed/licensed real
media set for correctness. Generate additional distinct media for throughput;
do not infer decode performance from repeated copies benefiting from caches.
Seed datasets and record expected distributions, duplicate clusters, missing
dates, multiple locations, filenames, face counts and provider outputs.

Exercise 499,999, 500,000 and 500,001 candidate files, concurrent imports, duplicate
locations, reimports, capacity-paused jobs and reservation recovery. Verify that
the cap is never exceeded, originals are untouched, existing entries remain
usable and the UI does not report truncated imports as complete.

Record GPU model, release generation, driver, OS, runtime, model, VRAM/shared
memory and actual selected backend. Include integrated/constrained-memory devices,
GPU absence, unsupported acceleration, out-of-memory and device loss. Compare
CPU/GPU quality within defined tolerances and keep browsing responsive during
accelerated processing. GPU CI mocks protect routing/fallback; hardware runs prove
actual acceleration. No single-device run proves every 2022-onward GPU works.

Kill workers and engine at result/transaction/index boundaries. Replay jobs;
assert no missing committed labels, duplicate observations or mixed model indexes.
Test disk full during thumbnail write, model activation, backup and update;
network disconnect during enumeration; missing NAS with a healthy SSD import;
pause/cancel during a long provider call; changed/deleted source during processing.

Include identical content in two roots with different filesystem dates and one
offline copy; counts, representative dates and duplicate reports must agree.
Exercise bulk date-scope selection during import, human labels during rescan,
invalid-media-stub reports, bounded full-filter CSV exports and map expansion.
Test loopback port reuse after engine failure and downloaded Linux package upgrades.

Validate vector approximate recall against exact ground truth on a manageable
representative subset and rare filters. Proposed initial recall@20 target: 0.95;
record hardware/index parameters and tradeoffs. Evaluate face false positives
separately from retrieval recall. Never use exact generated-description strings
as the quality gate for a nondeterministic model.

Run SSD, throttled NAS, slow removable-drive and offline scenarios. Collect p50,
p95, peak memory, queue depth, disk growth and cancellation time. Use dedicated
reference hosts for performance release gates; noisy shared CI is for smoke and
trend checks. Cache-cold and cache-warm runs are distinct. Include model unload
and AI/import contention tests: a fast empty gallery is insufficient evidence.

## Tooling contract

Retain Vitest/RTL/MSW for components and pytest for Python worker behavior. Add
Rust unit/integration tests for the engine; property-based tests for state/path
invariants where useful. Use Playwright for the LAN browser UI. Use WebdriverIO
with Tauri's embedded test driver for desktop journeys on Windows/Linux/macOS.
Share fixture data and journey expectations; avoid forcing the different drivers
through a large custom abstraction.

Tauri now documents a free embedded WebDriver route on macOS. The paid driver
route is optional. Compile test plugins only into an instrumented test build;
also install and smoke-test the exact signed production artifact and verify it
contains no automation listener. [Current Tauri testing documentation](https://v2.tauri.app/develop/tests/webdriver/).

Add proposed root verification commands during implementation, with noninteractive
cross-platform wrappers and documented output artifacts:

| Proposed command (not present today) | Contract |
| --- | --- |
| `verify quick` | Formatting/types plus affected domain/component tests; no downloads or live AI |
| `verify integration` | Real storage/filesystem, worker protocol and provider fakes |
| `verify journeys` | Browser and instrumented desktop workflows |
| `verify package` | Clean install/start/upgrade/uninstall against built artifacts |
| `verify performance` | Seeded scale/storage benchmark, JSON results and budget comparison |
| `verify ai` | Explicit model/hardware evaluation; no unapproved cloud requests |

Choose the actual wrapper language in Phase 0 and publish one discoverable command
entry; these names specify intent, not existing runnable tooling. Keep default
checks fast and model-independent. Report coverage for Rust, Python and TypeScript
separately, exclude generated code, and link critical failures to F01-F14. Use
changed-code coverage and focused mutation testing selectively; avoid arbitrary
100% targets. Existing frontend coverage gates remain until deliberately reviewed.

## GitHub Actions and release contract

PR jobs run locked dependency installs, formatting/types, domain/component and
integration tests. Packaging smoke jobs run for relevant runtime/packaging changes.
Tag/release jobs build Windows x64, macOS x64/arm64 and Linux x64, then generate
the supported installer formats. Pin toolchains/actions, cache by lockfile plus
OS/architecture, use minimal permissions and reuse build/test workflow modules.

Test actual minimum OS versions in dedicated VMs/hosts; `windows-latest` is not
Windows 10, `macos-latest` is not Ventura, and an Ubuntu build does not prove RHEL.
Hosted CI handles builds; suitable self-hosted/VM runners provide older OS and
real desktop/codec validation. Privileged signing jobs never run untrusted PR
code. No private photos, provider keys or model cache contents enter artifacts.

Release steps: build -> test -> assemble -> sign/notarize -> validate signatures
and clean installation -> attach checksums, dependency/model notices and test
manifest -> publish versioned release. Build once per target and promote tested
artifacts; do not silently rebuild a different artifact for publication.

App signing, updater signing and model/runtime manifest verification are distinct.
Required signing credentials and target-machine access must be provisioned before
public release; their absence blocks a signed release, not unit testing. Updater
tests cover schema incompatibility, rollback, interrupted download and package
manager ownership. Benchmarks/AI evaluations can be scheduled or run on demand;
all critical functional checks are rerunnable for future changes.
