---
template: true
name: Weekly report
description: A weekly operating summary bound to metrics.csv - figures fill live, commentary is drafted from the numbers.
sources:
  - metrics.csv
---

# {{slot:report title}}

Week {{slot:week number}} - {{slot:date range}}

## Highlights

Revenue is [pending](bind:metrics.mrr) MRR, up [pending](bind:metrics.mrr.delta) week-on-week, on [pending](bind:metrics.signups) new signups.

## Commentary

Summarise how the week went from the numbers above: what moved, why it matters, and what to watch next week.

## What to watch

Call out the one metric to keep an eye on next week.
