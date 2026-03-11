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
- License identifiers use SPDX format and match the corresponding ThirdPartyNotices.txt entries

## Red Flags

- Any copyleft license (GPL, LGPL, AGPL) — flag immediately
- Any "UNKNOWN" or placeholder license text
- License text that appears truncated or corrupted
- A package declared as MIT but with Apache/BSD/other license text (or vice versa)
