# Audit coverage

Find where the system has gaps, drift, or broken routes, so people know what to author next. Don't edit.

## Inventory

- List shared specs and readiness: `node .github/skills/design-system/scripts/validate.mts --list`.
- Check metadata, source placement, and chapter composition: `node .github/skills/design-system/scripts/validate.mts`.
- Inspect component specs beside their implementations; do not treat an unannotated folder or fixture as a missing-coverage defect.

## Compare

| Gap | How to spot it |
| --- | --- |
| Missing spec | An identified reusable job has no useful owner. Check [component qualification](component-qualification.md) or [token qualification](token-qualification.md); do not infer a requirement from folder count. |
| Invalid specification | Required metadata is missing, a kind/status is invalid, an identity collides, or a deprecated redirect is unresolved. |
| Broken route | A source link, alias, or chapter binding does not resolve. |
| Stale spec | The spec's code changed since the spec did (`git log -1 --format=%cs -- <path>`), or a rule contradicts the implementation. |
| Duplicate owner | The same rule appears in multiple specs, instructions, or skills instead of linking to its owner. |
| Thin topic | A topic has no decisions, examples, or accessibility guidance for its job. |

Scope by kind or area if the argument names one.

## Report

Group findings by gap type, ordered by reader impact. For each, name the topic, the evidence, and the next action: author, update, link, or remove. Note which checks ran and which didn't.
