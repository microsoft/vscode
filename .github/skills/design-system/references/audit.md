# Audit coverage

Find where the system has gaps, drift, or broken routes, so people know what to author next. Don't edit.

## Inventory

- List topics and their kinds: `node <viewer>/scripts/book.mjs list --root <checkout>`.
- List spec files: `git ls-files '*.design.md'`.
- Run the fast check with the installed viewer or source clone: `node .github/design-system/scripts/validate.mts --viewer <viewer> --sources-only`.

## Compare

| Gap | How to spot it |
| --- | --- |
| Missing spec | A reusable component, shared token family, or repeated pattern has no topic. Use [component qualification](../../../design-system/components.md) and [token qualification](../../../design-system/foundations.md). |
| Orphan spec | A `*.design.md` isn't in the topic map. |
| Broken route | A map entry, binding, or link doesn't resolve. |
| Stale spec | The spec's code changed since the spec did (`git log -1 --format=%cs -- <path>`), or a rule contradicts the implementation. |
| Duplicate owner | The same rule appears in a spec and in an instruction or skill, instead of a link. |
| Thin topic | A topic has no decisions, examples, or accessibility guidance for its job. |

Scope by kind or area if the argument names one.

## Report

Group findings by gap type, ordered by reader impact. For each, name the topic, the evidence, and the next action: author, update, link, or remove. Note which checks ran and which didn't.
