# Product specification

Status: proposed acceptance contract; user requirements are recorded in
[the entry document](README.md). Technical targets require feasibility evidence.

## Scale and storage

The maximum library size is **500,000 indexed photo/video files across all roots**.
Each distinct indexed file location counts, including duplicate copies; folders,
thumbnails, embeddings and other derived records do not. Reimporting an existing
location does not consume another slot. This replaces the earlier larger-scale
targets. Use 100,000-file development benchmarks and 500,000-file release tests.
Assume 16 GB RAM and a six-core-class 2022 CPU with local SSD; record actual
reference models before benchmarking. An 8 GB machine is a reduced-concurrency
validation profile.

Enforce capacity atomically across concurrent imports. At the limit, stop admitting
new files and show the count, limit and next action; never silently truncate a
successful import or remove originals. Existing files remain browsable and can
be updated/rescanned. Resume discovery after catalogue entries are explicitly
removed; interrupted import reservations must not permanently consume capacity.

The catalogue, search indexes and thumbnail cache reside on local disk. Users
may place originals on local/removable disks or OS-mounted SMB/NFS shares.
The app never relocates or alters originals merely by indexing them. It must
not generate conversion files alongside originals. Connection/authentication
for network mounts uses the operating system initially.

Detached roots remain searchable through cached metadata/thumbnails. Display
source availability and offer reconnect/relink. A failed or incomplete scan
must never imply that missing files should be removed. USB is not synonymous
with slow: show a nonblocking advisory based on measured latency/throughput,
with an explanation that original reads and uncached imports may be slower.

Cache size is visible and bounded. Proposed default thumbnail budget: 10 GiB,
subject to available disk space, with user override and eviction/recreation.
Show estimated index/model disk needs before enabling expensive processing.
For perspective, 500,000 512-dimensional float32 vectors alone occupy about
0.95 GiB before index overhead; 500,000 40 KiB thumbnails occupy about 19 GiB.
Multiple models and face observations can generate more vectors than files.
A complete cache is not assumed.

## Local CPU and GPU support

Target GPUs introduced in **2022 or later across NVIDIA, AMD, Intel and Apple
Silicon**, including integrated and discrete graphics where applicable to the
supported operating systems. Avoid a single-vendor requirement. A dedicated GPU
remains optional: CPU-only library use and local processing remain supported,
with processing speed and model size constrained by available resources.

Use validated acceleration for local AI descriptions, embeddings, face analysis
and media processing wherever the selected runtime/model/codec supports it.
GPU release year alone does not establish driver/API compatibility, available
VRAM or model support; not every GPU accelerates every stage. Publish a tested
GPU/OS/driver/runtime matrix, detect capabilities at startup and offer Auto,
CPU or a compatible GPU per processing profile. Keep catalogue operations on the
CPU where appropriate rather than forcing all local work through a GPU.

Show the actual device used, missing acceleration support and memory requirements.
Constrain model/batch size to available memory, handle GPU out-of-memory and
device-loss errors, and fall back to CPU with a visible notice when the stage
supports it. Otherwise pause that stage with a useful explanation. Never fall
back to cloud without consent. Older GPUs are best-effort; supported Macs and
PCs can still use CPU fallback. Benchmark representative 2022-era and newer
devices from each vendor on applicable platforms; do not claim exhaustive
compatibility from a single GPU test.

## Required feature parity

| ID | Capability to retain | Acceptance example |
| --- | --- | --- |
| F01 | Gallery, image details, full-size viewing, EXIF/GPS, date/camera/entity filters and sorting | The same fixture is reachable by date, camera and named-person filters; metadata remains inspectable |
| F02 | Right-side year/month date rail and timeline grouping | Jump to an unloaded year in a 500,000-file filtered query; back returns to the previous asset anchor |
| F03 | Keyword, semantic text-to-image and visually similar search | Results are labelled by search mode; indexed and unindexed availability is clear; filters apply to semantic results |
| F04 | Folder explorer and year/month/day drilldown | Browse a root/subfolder and date scope, including undated items, without retrieving the whole tree |
| F05 | Metadata-only and AI scans | Start root, single-file and date-scope scans; preserve new-only, force-rescan, screenshot exclusion, stage toggles and model selection |
| F06 | Scan controls, progress, history and logs | Pause/resume/cancel and restart mid-job; committed results survive; counts do not double |
| F07 | People/entity identification, rename/merge/delete and pet labels | Labels and matching media update consistently; deleting a label never deletes an original |
| F08 | Duplicate/skipped review and scoped duplicate reports | Exact-hash groups, filters, pagination, source comparison and CSV export; invalid media stubs remain distinct from valid duplicates |
| F09 | Videos, legacy-format transcoding, image previews and OS open/reveal | Seek a large video, cancel a transcode, and preview HEIC; unsupported/corrupt files have useful fallback states |
| F10 | Map browsing, provider choice and external map links | Preserve processed/non-AI inclusion choice, clusters, cluster-to-thumbnail expansion and full-image actions; offline state retains coordinates |
| F11 | Isolated single-image AI test sandbox and entity controls | Test results never mutate the library or its search index; the same processing pipeline is exercised |
| F12 | Settings, themes, backup/restore and scoped data clearing | Restore a verified snapshot and rebuild derived data; confirmation states exactly what is cleared |
| F13 | Optional home-network browser UI | A paired browser can browse/search and use granted controls; native-only actions have meaningful browser alternatives |
| F14 | Managed dependencies/models and alternative AI endpoints | Browse before downloads finish; change providers without rebuilding unrelated metadata |

The implementation phase expands these examples into fixture assertions before
replacing each existing flow. Preserve the six existing accent-theme choices
or provide equivalent named choices. No legacy database import is required;
the old library is left untouched. Future upgrades require migrations/backups.
Force rescan recomputes machine output without silently overwriting human names
or corrections. Keep face bounding-box evidence, sandbox history, scan-grouped
duplicate/skipped timelines, and folder timeline deep links. Support CLIP-only
as well as full AI scope actions. CSV exports reflect the full active filter,
not just the visible page, and stream with bounded memory and existing escaping,
NUL cleanup and spreadsheet-formula handling.

## Proposed platform contract

| Platform | Initial target | Distribution/proof |
| --- | --- | --- |
| Windows | Windows 10 22H2 and Windows 11, x64 | NSIS installer `.exe`, managed WebView2 setup; verify oldest target explicitly |
| macOS | Ventura 13+, Intel x64 and Apple Silicon arm64 | Separate `.dmg` downloads; both architectures tested on the minimum OS |
| Ubuntu | 22.04 and supported newer LTS releases, x64 | `.deb` primary; oldest compatible build baseline |
| Fedora | Supported stable releases at delivery, x64 | `.rpm`; pin tested versions in the release manifest |
| Red Hat Enterprise Linux | RHEL 9/10, x64 | Packaged-runtime route evaluated first; RHEL 10 WebKitGTK removal makes this a mandatory feasibility gate |

The Linux proposal includes a Flatpak distribution for RHEL when native runtime
availability is insufficient; portals, mounted NAS access, model downloads,
GPU access and helper execution must pass on actual target systems. AppImage
is an alternative only after dependency/codec testing. Neither format is
automatically universal. If the Tauri route fails, evaluate Electron with the
same engine and recheck all minimum OS requirements before choosing it.

Three OS families require at least four CPU/OS build targets and additional
Linux package/verification jobs. The product promise is one application install,
not one binary shared by every OS/CPU. Windows/Linux ARM and 32-bit builds are
outside the initial scope.

## Performance acceptance targets

Measure in release builds, with models unloaded unless explicitly stated,
on the pinned 16 GB reference machines. Cold means a fresh application process;
also report filesystem-cache-cold measurements separately. Query measurements
use fixed representative filters and data distributions, not a favourable demo.

| Operation | Proposed p95 target at the 500,000-file limit |
| --- | --- |
| Cold launch to usable catalogue with first cached page | <= 3 seconds |
| Warm cached gallery page (200 records maximum) | <= 200 ms engine response; <= 400 ms visible |
| Indexed keyword/filter search | <= 300 ms engine response; <= 600 ms visible |
| Date-rail jump to a cached target page | <= 500 ms visible; no intervening pages fetched |
| Semantic retrieval, warm query model | <= 1 second engine response; cold model time reported separately |
| Scroll on a 60 Hz reference display | p95 frame time <= 20 ms; long tasks over 50 ms investigated |
| Import command accepted and progress displayed | <= 500 ms; directory enumeration continues in background |
| First discovered SSD files visible | <= 2 seconds on the fixed import fixture |
| Metadata-only discovery into catalogue on SSD | >= 1,000 files/sec sustained on the pinned fixture, excluding hashes/EXIF/thumbnails |
| Idle app memory, excluding OS-shared pages and AI | <= 750 MiB across owned processes; no growth proportional to loaded catalogue rows |

Record ingestion, index-build and peak memory separately at 100,000 and 500,000
files. Test admission at 499,999, 500,000 and 500,001 candidate files, including
concurrent imports; exceeding the limit is a capacity-handling test, not a larger
supported library. Keep the responsiveness targets above. These thresholds can
be revised only with documented measurements and a product decision, not silently
relaxed to pass a build.

NAS and external-drive throughput is reported by operation/device, with injected
latency/disconnection tests. Cached browsing should remain near local targets;
uncached original reads cannot be promised SSD latency. AI throughput is reported
as assets/minute plus model quality, RAM/VRAM and energy/resource observations.
There is no universal CPU-only vision throughput guarantee.

## Privacy and lifecycle

Local mode makes no inference request outside the chosen local runtime. Model
downloads, app updates, map tiles and LAN sharing are separately identified
network uses. Cloud AI requires opt-in for the selected provider and job, showing
endpoint, data sent, requested model, and cost limit when supported. Default
payloads omit EXIF/GPS and absolute paths. Never silently fall back to cloud.

App closure pauses work safely by default. An explicit background/tray setting
can keep scans and LAN access running, with visible status. Updates are announced
and user initiated initially; package-manager installations update through their
package manager when an update repository is configured. Directly downloaded
Linux packages initially use download/reinstall notices. Resuming a job preserves
its recorded provider/model/settings.
