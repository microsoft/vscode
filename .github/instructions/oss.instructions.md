---
applyTo: '{ThirdPartyNotices.txt,cli/ThirdPartyNotices.txt,cglicenses.json,cgmanifest.json}'
---

# OSS License Review

When reviewing changes to these files, verify:

## ThirdPartyNotices.txt

- Every new entry has a license type header (e.g., "MIT License", "Apache License 2.0")
- License text is present and non-empty for every entry
- License text matches the declared license type (e.g., MIT-declared entry actually contains MIT license text, not Apache)
- Removed entries are cleanly removed (no leftover fragments)
- Entries are sorted alphabetically by package name

## cglicenses.json

- New overrides have a justification comment
- No obviously stale entries for packages no longer in the dependency tree

## cgmanifest.json

- Package versions match what's actually installed
- Repository URLs are valid and point to real source repositories
- Newly added license identifiers should use SPDX format where possible
- License identifiers match the corresponding ThirdPartyNotices.txt entries

## Red Flags

- Any **newly added** copyleft license (GPL, LGPL, AGPL) — flag immediately (existing copyleft entries like ffmpeg are pre-approved)
- Any "UNKNOWN" or placeholder license text
- License text that appears truncated or corrupted
- A package declared as MIT but with Apache/BSD/other license text (or vice versa)
