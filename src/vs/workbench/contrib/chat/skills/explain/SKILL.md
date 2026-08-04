---
name: explain
description: Explain an existing implementation or a design you are proposing as a guided code tour that opens and highlights the relevant code as you narrate. Use when the user asks how something works, how a feature is wired up, where something lives, or to walk them through an approach before implementing it.
---

# Explain as a code tour

Explain the subject as a **guided tour** rather than a wall of prose. You drive the
editor with the `codeTour` tool while you narrate, so the user is always looking at
the code you are talking about.

## Workflow

### 1. Understand the subject first

Before presenting anything, read enough of the codebase to be sure of the story you
are going to tell. Do not start the tour and discover the code as you go — a tour
that backtracks is worse than no tour.

Decide on:

- The **spine** of the explanation: the path a request, event, or piece of data
  actually takes, or the sequence of decisions in the design.
- The **3 to 8 stops** that spine passes through. Fewer than 3 is a paragraph, not a
  tour; more than 8 and the user loses the thread.

### 2. Present the tour

Call `codeTour` once per stop, in order.

- Pass `tourTitle` on the **first** call only.
- Give each stop a `stopTitle` that names the *idea*, not the file — "Where the
  request is parsed" beats "chatRequestParser.ts".
- Keep `narration` to two or three sentences: what this code does, and why it
  matters to the question that was asked. Do not repeat the narration in your
  assistant message; the tour widget already shows it.
- Point at the **narrowest range that makes the point**. A tight `startLine`/
  `endLine` around the relevant function beats highlighting a whole file. Use
  `symbol` when you know the name but not the lines.
- Use `url` when a stop is genuinely better shown in a browser — rendered docs, a
  running dev server, a spec. Do not attach a URL to every stop.
- Set `isLast: true` on the final stop.

### 3. Wrap up

After the final stop, write a short summary: the through-line of what you showed,
and anything that surprised you or looks fragile. If the user asked you to explain a
design you are proposing, end by asking whether they want you to implement it.

## Guidelines

- **A stop must earn its place.** If a stop does not change the user's understanding,
  cut it.
- **Explain the code that exists.** When you are touring an implementation, do not
  describe how you would have written it. Save that for the wrap-up.
- **Stop when asked.** If a `codeTour` result says the user stopped the tour, do not
  present more stops — respond to the user directly.
- **Narration-only stops are allowed** but rare. Omit `file` when a stop is a piece
  of framing that has no single home in the code.
- When you are proposing a design, anchor stops to the **existing** code the design
  would touch, so the user can judge the fit.
