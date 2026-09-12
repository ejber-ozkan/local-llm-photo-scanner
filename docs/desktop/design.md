# Interface design

## Direction

A photographic contact sheet: restrained chrome, generous image space, crisp
typography and one selected accent. Preserve the useful browsing tools while
removing visual clutter. Use semantic design tokens for surfaces, text, borders,
focus, status and motion. Bundle any fonts/icons; basic browsing needs no CDN.

Light, dark and system modes share the same component contracts, with the six
existing accent choices retained. Persist preferences without a first-paint
flash. Respect reduced motion and contrast preferences. Decorative effects must
not degrade scrolling or obscure photographs.

## Languages and locales

Provide **33 selectable UI language/locale options**: all 24 official EU
languages below plus nine global options. Simplified and Traditional Chinese
are separate script locales, so this is 33 options rather than 33 distinct
languages. These are required translation targets, not a claim that translations
are already implemented.

### Full coverage of official EU languages (24)

Bulgarian (`bg`), Croatian (`hr`), Czech (`cs`), Danish (`da`), Dutch (`nl`),
English (`en`), Estonian (`et`), Finnish (`fi`), French (`fr`), German (`de`),
Greek (`el`), Hungarian (`hu`), Irish (`ga`), Italian (`it`), Latvian (`lv`),
Lithuanian (`lt`), Maltese (`mt`), Polish (`pl`), Portuguese (`pt`), Romanian
(`ro`), Slovak (`sk`), Slovenian (`sl`), Spanish (`es`), and Swedish (`sv`).

### Expanded global locales (9)

Turkish (`tr`), Arabic (`ar`), Simplified Chinese (`zh-Hans`), Traditional
Chinese (`zh-Hant`), Japanese (`ja`), Korean (`ko`), Russian (`ru`), Ukrainian
(`uk`), and Indonesian (`id`).

### Selection, formatting and layout

Offer a searchable language selector during first-run setup and under Settings.
Display each language's native name alongside its current-UI-language name;
do not use flags as language identifiers. Start from a supported OS/browser
language, falling back to English, and persist an explicit user override.
Switch without restarting or losing search filters, selection, date-rail anchor
or job progress. Each LAN browser keeps its own preference independently of the
desktop host. Update document language and direction for assistive technology.

Use stable translation keys, complete local translation bundles, plural-aware
messages and interpolation; avoid concatenating translated sentence fragments.
All 33 options work offline. Load only the active/fallback bundle into the UI.
Translate navigation, date-rail labels, filters, menus, tooltips, accessibility
labels, onboarding, dialogs, privacy notices and actionable errors. Missing
strings fall back to English defensively, but missing required translations
fail release validation. Raw technical diagnostics may remain in their source
language alongside a translated explanation.

Use locale-aware dates, month/day names, numbers, plurals, units and collation.
Separate UI language from regional date/number preferences; changing language
must not reinterpret stored dates, rename files, translate user-entered labels
or modify existing AI descriptions. Multilingual AI generation/search quality
is a separate provider/model capability, not guaranteed by UI translation.

Arabic requires right-to-left text, appropriate directional controls and keyboard
behavior, and bidirectional isolation for paths, identifiers and mixed-script
content. Preserve the date rail and the user's preferred position rather than
hiding it in an RTL layout. Do not mirror photographs or video content. Allow
text expansion and appropriate line wrapping for long translations, and provide
licensed offline font coverage for Cyrillic, Greek, Arabic and CJK scripts.

### Localization acceptance

Check all 33 catalogues for key completeness, valid interpolation and plural
forms. Use pseudo-localization to expose clipping and untranslated strings.
Run layout/keyboard/screen-reader checks for Arabic RTL, CJK, Cyrillic, Turkish
case handling and long EU-language strings, across light/dark themes, compact
widths and 200% zoom. Verify localized date-rail jumps, unknown-date labels,
language persistence, per-browser preferences and offline switching. Review
privacy/destructive-action translations for meaning, not just key coverage;
machine translation alone is insufficient release evidence.

## Desktop layout

```text
┌──────────────┬──────────────────────────────────────────┬─────────┐
│ Library      │ Search…   filter chips   sort   density   │         │
│ Folders      ├──────────────────────────────────────────┤ 2026    │
│ People & pets│ Sticky date heading                      │ Sep     │
│ Map          │                                          │ Aug     │
│ Duplicates   │ Virtualised photo / video contact sheet  │ …       │
│              │                                          │ 2025    │
│ Sources      │                                          │ …       │
│ SSD          │                                          │ Undated │
│ NAS • offline│                                          │         │
│              ├──────────────────────────────────────────┤ Date    │
│ Scan / Test  │ Import: discovering…  8,412 found  Pause │ rail    │
│ Settings     │ AI: 32 pending • Local • model ready     │         │
└──────────────┴──────────────────────────────────────────┴─────────┘
```

The right-side date rail is a first-class feature. It remains distinct from the
details inspector. Opening details uses an overlay/drawer or dedicated viewer
without permanently replacing the rail. Sidebar, inspector and thumbnail density
are adjustable. A compact layout collapses navigation, but keeps an explicit
date-jump control; mobile LAN access has touch-sized controls and a date drawer.

## Date rail and viewport behavior

Display years/months from the whole filtered catalogue with counts/density hints
and an explicit undated group. Hover/focus gives an exact date label; click or
keyboard activation fetches the page at that date. Drag scrubbing may preview
dates, but commits a bounded seek instead of fetching every intermediate month.

Maintain an asset ID plus intra-row pixel anchor, not an absolute row number.
Resizing, changing thumbnail density, opening details and returning from search
must preserve the selected asset/position where possible. Filter changes announce
the new scope and reset deliberately; late results from old queries are discarded.
Scroll highlighting tracks visible dates without installing an observer per
asset. Virtualised row headers and thumbnails must not require DOM nodes for the
entire library. The rail has independent scroll when needed.

Date order follows the selected taken/created/modified field. Label that field;
preserve existing creation-date preference in folder timelines. Filename/relevance
sorting must not imply chronological scrolling: offer an explicit date view.
Filtered/semantic histograms must state their scope, including any result cap.

## Core interactions

| Area | Design behavior |
| --- | --- |
| Search | Immediate local text/filter feedback; semantic stage has separate progress; filters are readable removable chips |
| Media viewer | Keyboard next/previous, zoom, metadata/entities, GPS and original availability; video seek/quality/fallback controls |
| Folder import | Pick/drop a root, see discovered items immediately; choose new-only/full metadata/AI stages without waiting for enumeration |
| Date-scope scan | Preview count and scope before starting; keep scan-new-only and force-rescan distinction |
| Job panel | Separate discovery, metadata, thumbnails and AI; durable pause/resume/cancel; stage/provider errors have specific retry actions |
| Entities | Review face evidence, rename/merge/remove labels, retain person/pet distinction; no original deletion through label actions |
| Duplicates | Side-by-side evidence, grouped counts, source/date/size filters and CSV export; no automatic original deletion |
| Sandbox | Clearly identified test area with independent clear action; show model, stage timings and result metadata |
| Settings | Appearance, language/region, sources/cache, AI providers/models, LAN devices, backup/restore, scoped data clearing |

Provide a searchable command menu, visible keyboard shortcuts, clear focus rings,
accessible names and live status announcements that are throttled. Prefer
established controls over novel gestures. Minimum design target is WCAG 2.2 AA;
verify contrast, keyboard-only flows, zoom and screen-reader navigation using
the [W3C standard](https://www.w3.org/TR/WCAG22/).

## Storage, offline and privacy states

Available, slow, reconnecting and offline are distinct source states. Example:
"This source is responding slowly. Cached browsing stays available; importing
and opening originals may take longer." Include measured rate only when reliable.
Do not present a precise finish time before enough samples exist.

Show cache disk use and eviction consequences: removing thumbnails frees disk
but can require rereading originals. Offline cards retain cached previews and
metadata, with disabled-original actions explained. Missing paths offer relink
without treating all absent files as deleted.

Local AI jobs show "Processed on this computer" only for verified managed local
execution. External LAN servers are labelled by host. Cloud jobs show provider,
destination, image/metadata payload and a persistent external-processing badge;
consent occurs before sending content, not after. Map providers have a separate
network disclosure and offline fallback. Third-party failures never switch
providers automatically.

## Visual acceptance

Review light/dark/system plus all accent themes at normal/compact widths and
125%/200% zoom. Exercise long filenames, non-Latin text, empty/undated results,
offline sources, partial thumbnails, thousands of date buckets, simultaneous
imports and cloud errors. Compare before/after flows against F01-F14; a cleaner
screen is not evidence that removed controls were unnecessary.

Implementation begins with component tokens and a small representative gallery,
date rail and inspector prototype. Validate the feel and keyboard/touch behavior
before rebuilding every page. This document is a wireframe/design contract,
not a completed visual prototype or screenshot.
