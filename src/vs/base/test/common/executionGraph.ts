/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plain, renderer-friendly description of an execution history produced by a
 * traced scheduler. These types have no dependency on the tracing or
 * scheduling implementation — they can be built by hand in tests or by the
 * `buildHistoryFromTasks` adapter below.
 */

export interface ExecutionRoot {
	readonly label: string;
}

export interface ExecutionEvent {
	/** Relative time (e.g. ms since startTime). Must be >= 0 and non-decreasing in history order. */
	readonly time: number;
	readonly label: string;
	readonly root: ExecutionRoot;
	/** `undefined` means this event is a direct child of its root. */
	readonly parent: ExecutionEvent | undefined;
	/** Caller frame extracted from the scheduling stack trace. */
	readonly detail?: string;
}

export interface ExecutionHistory {
	/** Roots in first-appearance order (column order for renderers). */
	readonly roots: readonly ExecutionRoot[];
	/** Events in time order. */
	readonly events: readonly ExecutionEvent[];
}

// -----------------------------------------------------------------------------
// Adapter: ScheduledTask[] -> ExecutionHistory
// -----------------------------------------------------------------------------

interface TraceLike {
	readonly parent: TraceLike | undefined;
	readonly root: { readonly label: string };
}

interface ScheduledTaskLike {
	readonly time: number;
	readonly source: { toString(): string; readonly stackTrace?: string };
	readonly trace?: TraceLike;
}

/**
 * A log entry to weave into the history alongside scheduled tasks. Each log is
 * tagged with the trace that was current when it was emitted.
 */
export interface LogEntryLike {
	readonly trace: TraceLike;
	readonly message: string;
}

/**
 * Convert a list of scheduled tasks (each carrying a causal `trace`) into a
 * plain `ExecutionHistory`. Untraced tasks are dropped. A task's parent event
 * is the most recent earlier task whose `trace` is `task.trace.parent`; if
 * `task.trace.parent` is the trace root itself, the event has no parent event
 * (it is a direct child of the root).
 *
 * `logs` (if given) are interleaved as synthetic events: each log's parent is
 * the task event whose trace matches the log's current trace at emission
 * time (or the nearest ancestor task event), and its time is inherited from
 * that parent. Within a single parent task, logs are kept in emission order
 * and inserted directly after the parent event.
 */
export function buildHistoryFromTasks(
	tasks: readonly ScheduledTaskLike[],
	startTime: number,
	logs: readonly LogEntryLike[] = [],
): ExecutionHistory {
	const rootByTrace = new Map<unknown, ExecutionRoot>();
	const roots: ExecutionRoot[] = [];
	const eventByTrace = new Map<unknown, ExecutionEvent>();
	const taskEvents: ExecutionEvent[] = [];

	for (const task of tasks) {
		const trace = task.trace;
		if (!trace) { continue; }

		let root = rootByTrace.get(trace.root);
		if (!root) {
			root = { label: trace.root.label };
			rootByTrace.set(trace.root, root);
			roots.push(root);
		}

		// Find the parent event by walking up the trace chain until we hit
		// either a trace whose event we know, or the trace root.
		let parentEvent: ExecutionEvent | undefined;
		for (let p = trace.parent; p; p = p.parent) {
			const e = eventByTrace.get(p);
			if (e) { parentEvent = e; break; }
		}

		const event: ExecutionEvent = {
			time: task.time - startTime,
			label: `${task.source}`,
			root,
			parent: parentEvent,
			detail: extractCallerFrame(task.source.stackTrace),
		};
		eventByTrace.set(trace, event);
		taskEvents.push(event);
	}

	// Group log entries by their parent task event, preserving emission
	// order within each group. A log without an enclosing task event is
	// dropped (e.g. logs emitted at root before any task ran).
	const logsByParent = new Map<ExecutionEvent, ExecutionEvent[]>();
	for (const entry of logs) {
		let parentEvent: ExecutionEvent | undefined;
		for (let p: TraceLike | undefined = entry.trace; p; p = p.parent) {
			const e = eventByTrace.get(p);
			if (e) { parentEvent = e; break; }
		}
		if (!parentEvent) { continue; }

		const logEvent: ExecutionEvent = {
			time: parentEvent.time,
			label: `log: ${entry.message}`,
			root: parentEvent.root,
			parent: parentEvent,
		};
		const bucket = logsByParent.get(parentEvent);
		if (bucket) { bucket.push(logEvent); }
		else { logsByParent.set(parentEvent, [logEvent]); }
	}

	// Interleave: each task event followed by its logs in emission order.
	const events: ExecutionEvent[] = [];
	for (const e of taskEvents) {
		events.push(e);
		const ls = logsByParent.get(e);
		if (ls) { events.push(...ls); }
	}

	return { roots, events };
}

/**
 * Extract up to {@link MAX_DETAIL_FRAMES} stack frames that are not from
 * the scheduler/tracing infrastructure. Returns the frames joined by
 * newline (callers may render them stacked) or `undefined` when none.
 */
const _skipFramePatterns = [
	/[\\/]virtualScheduling[\\/]/,
	/[\\/]vs[\\/]base[\\/]common[\\/]async\./,
	/timeTravelScheduler|traceableTimeApi/,
	/RunOnceScheduler\.schedule/,
	/scheduleAtNextAnimationFrame/,
	/TimeoutTimer\.cancelAndSet/,
	/TimeoutTimer\.setIfNotSet/,
	/timeoutDeferred/,
	/createTimeout/,
];

const MAX_DETAIL_FRAMES = 5;

function extractCallerFrame(stackTrace: string | undefined): string | undefined {
	if (!stackTrace) { return undefined; }
	const frames: string[] = [];
	for (const line of stackTrace.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed.startsWith('at ')) { continue; }
		if (_skipFramePatterns.some(p => p.test(trimmed))) { continue; }
		frames.push(trimmed.slice(3));
		if (frames.length >= MAX_DETAIL_FRAMES) { break; }
	}
	return frames.length === 0 ? undefined : frames.join('\n');
}

// -----------------------------------------------------------------------------
// Renderer: swimlane (one column per root)
// -----------------------------------------------------------------------------

/**
 * Render `history` as a swimlane diagram: one column per root, events in the
 * column of their root, parent→child shown via `├─`/`└─` indentation, active
 * ancestors shown via `│` continuation lines.
 *
 * Example:
 * ```
 *                  A           B
 *   +0ms ├─ setTimeout
 *  +10ms │           ├─ setTimeout
 *  +16ms ├─ rAF      │
 *  +50ms └─ setTimeout
 * ```
 */
export function renderSwimlanes(history: ExecutionHistory): string {
	const { roots, events } = history;
	if (events.length === 0) { return '(empty history)'; }
	if (roots.length === 0) {
		return events.map(e => `[+${e.time}ms] ${e.label}`).join('\n');
	}

	const n = events.length;

	// Parent index per event (-1 = direct child of root).
	const parentOf = new Array<number>(n).fill(-1);
	const childrenOf: number[][] = Array.from({ length: n }, () => []);
	const indexOfEvent = new Map<ExecutionEvent, number>();
	for (let i = 0; i < n; i++) { indexOfEvent.set(events[i], i); }
	for (let i = 0; i < n; i++) {
		const p = events[i].parent;
		if (p) {
			const pi = indexOfEvent.get(p);
			if (pi !== undefined) {
				parentOf[i] = pi;
				childrenOf[pi].push(i);
			}
		}
	}

	// Is this event the last child of its parent event?
	const isLastChild = new Array<boolean>(n).fill(false);
	for (let i = 0; i < n; i++) {
		const p = parentOf[i];
		if (p >= 0 && childrenOf[p][childrenOf[p].length - 1] === i) { isLastChild[i] = true; }
	}

	// Slot = visual column index for indentation. By default every child
	// gets its own column (slot = parent.slot + 1) so pure last-child chains
	// still show their depth structure. Once we pass the depth threshold,
	// last-children collapse into their parent's slot to keep deeply nested
	// traces from walking off the screen.
	const COLLAPSE_DEPTH_THRESHOLD = 6;
	const depthOf = new Array<number>(n).fill(0);
	const slotOf = new Array<number>(n).fill(0);
	for (let i = 0; i < n; i++) {
		const p = parentOf[i];
		if (p >= 0) {
			depthOf[i] = depthOf[p] + 1;
			const collapse = isLastChild[i] && depthOf[i] >= COLLAPSE_DEPTH_THRESHOLD;
			slotOf[i] = slotOf[p] + (collapse ? 0 : 1);
		}
	}

	// Display label = label plus the caller stack frame when present,
	// e.g. `setTimeout · MyClass.foo (file.ts:42)`. Computed once so width
	// math and the per-row render agree. `detailLines` holds any additional
	// stack frames beyond the first; they are rendered as continuation rows.
	const displayLabelOf = new Array<string>(n);
	const detailLinesOf = new Array<readonly string[]>(n);
	for (let i = 0; i < n; i++) {
		const e = events[i];
		const frames = e.detail ? e.detail.split('\n') : [];
		displayLabelOf[i] = frames.length > 0 ? `${e.label} · ${frames[0]}` : e.label;
		detailLinesOf[i] = frames.slice(1);
	}

	// Column width per root: indentation uses slots (last-children collapse
	// into their parent's slot), so width must be slot-based to avoid
	// reserving empty space for degenerate last-child chains.
	const widthOf = new Map<ExecutionRoot, number>();
	for (const r of roots) { widthOf.set(r, r.label.length); }
	for (let i = 0; i < n; i++) {
		const baseIndent = slotOf[i] * 3 + 3;
		const maxLen = Math.max(displayLabelOf[i].length, ...detailLinesOf[i].map(l => l.length + 2));
		const w = baseIndent + maxLen;
		const cur = widthOf.get(events[i].root) ?? 0;
		if (w > cur) { widthOf.set(events[i].root, w); }
	}

	// Compute time column width based on max time (rounded).
	const maxTime = n > 0 ? Math.max(...events.map(e => Math.round(e.time))) : 0;
	const timeColWidth = `+${maxTime}ms`.length;

	const lines: string[] = [];

	// Header: root labels centered in their columns.
	const header: string[] = [];
	for (const r of roots) {
		const w = widthOf.get(r)!;
		header.push(r.label.padStart(Math.ceil((w + r.label.length) / 2)).padEnd(w));
	}
	lines.push(`${' '.repeat(timeColWidth)} ${header.join('  ')}`.trimEnd());

	// Compute lastChild index for each event (for drawing continuation lines).
	const lastChildOf = new Array<number>(n).fill(-1);
	for (let i = 0; i < n; i++) {
		const kids = childrenOf[i];
		if (kids.length > 0) { lastChildOf[i] = kids[kids.length - 1]; }
	}

	// Per-root: set of "active ancestor" event indices (events with children
	// whose last child has not yet been rendered, i.e. lastChildOf[a] > i).
	const laneStacks = new Map<ExecutionRoot, Set<number>>();
	for (const r of roots) { laneStacks.set(r, new Set()); }

	for (let i = 0; i < n; i++) {
		const event = events[i];
		const timeStr = `+${Math.round(event.time)}ms`.padStart(timeColWidth);

		const parts: string[] = [];
		for (const r of roots) {
			const w = widthOf.get(r)!;
			const stack = laneStacks.get(r)!;

			if (r === event.root) {
				// Event line: slot-based indentation, then `├─`/`└─` + label.
				// For each slot s in 0..(slot-1), show `│  ` if an ancestor
				// at slot s is still active (lastChild > current), else `   `.
				const slot = slotOf[i];
				const indent: string[] = [];
				for (let s = 0; s < slot; s++) {
					let hasActive = false;
					for (const a of stack) {
						if (slotOf[a] === s && lastChildOf[a] > i) { hasActive = true; break; }
					}
					indent.push(hasActive ? '│  ' : '   ');
				}
				const prefix = isLastChild[i] ? '└─ ' : '├─ ';
				parts.push(`${indent.join('')}${prefix}${displayLabelOf[i]}`.padEnd(w));
			} else {
				// Cross-lane continuation. Draw `│` at each slot occupied by
				// an active ancestor (lastChild > i). Also show a `|` placeholder
				// at the slot of the next upcoming event if it's a non-last child.
				const activeSlots: number[] = [];
				for (const a of stack) {
					if (lastChildOf[a] > i) { activeSlots.push(slotOf[a]); }
				}
				const maxSlot = Math.max(...activeSlots, -1);
				const chars: string[] = new Array(Math.max(maxSlot + 1, 0)).fill('   ');
				for (const s of activeSlots) { chars[s] = '│  '; }

				// Find the next event in root r strictly after i.
				let nextJ = -1;
				for (let j = i + 1; j < n; j++) {
					if (events[j].root === r) { nextJ = j; break; }
				}
				if (nextJ >= 0 && parentOf[nextJ] >= 0) {
					const s = slotOf[nextJ];
					// Reserve slot if next event will open a new branch (├─).
					if (!isLastChild[nextJ]) {
						while (chars.length <= s) { chars.push('   '); }
						if (chars[s] === '   ') { chars[s] = '|  '; }
					}
				}

				// Trim trailing empty cells.
				while (chars.length > 0 && chars[chars.length - 1] === '   ') { chars.pop(); }
				parts.push(chars.join('').padEnd(w));
			}
		}

		lines.push(`${timeStr} ${parts.join('  ')}`.trimEnd());

		// Continuation lines for any extra stack frames. Indented under the
		// label, with no time column, no `├─`/`└─` glyph, and `│  `
		// continuations for active ancestor lanes (including this event itself
		// when it has children that haven't been rendered yet).
		const extras = detailLinesOf[i];
		if (extras.length > 0) {
			const slot = slotOf[i];
			const stackForExtras = laneStacks.get(event.root)!;
			// Pretend this event is already on the lane stack so its column
			// gets a continuation glyph beneath the `├─`/`└─`.
			const hasOpenChildren = childrenOf[i].length > 0;
			const extraIndent: string[] = [];
			for (let s = 0; s < slot; s++) {
				let hasActive = false;
				for (const a of stackForExtras) {
					if (slotOf[a] === s && lastChildOf[a] > i) { hasActive = true; break; }
				}
				extraIndent.push(hasActive ? '│  ' : '   ');
			}
			extraIndent.push(hasOpenChildren ? '│  ' : '   ');
			for (const extra of extras) {
				const extrasParts: string[] = [];
				for (const r of roots) {
					const w = widthOf.get(r)!;
					if (r === event.root) {
						extrasParts.push(`${extraIndent.join('')}${extra}`.padEnd(w));
					} else {
						// Reuse the same continuation logic: any active lane on
						// other roots needs `│` glyphs.
						const otherStack = laneStacks.get(r)!;
						const activeSlots: number[] = [];
						for (const a of otherStack) {
							if (lastChildOf[a] > i) { activeSlots.push(slotOf[a]); }
						}
						const maxSlot = Math.max(...activeSlots, -1);
						const chars: string[] = new Array(Math.max(maxSlot + 1, 0)).fill('   ');
						for (const s of activeSlots) { chars[s] = '│  '; }
						while (chars.length > 0 && chars[chars.length - 1] === '   ') { chars.pop(); }
						extrasParts.push(chars.join('').padEnd(w));
					}
				}
				const timePad = ' '.repeat(timeColWidth);
				lines.push(`${timePad} ${extrasParts.join('  ')}`.trimEnd());
			}
		}

		// Stack maintenance: push this event if it has children, then pop
		// any ancestors whose last child was just rendered (propagating up).
		const stack = laneStacks.get(event.root)!;
		if (childrenOf[i].length > 0) { stack.add(i); }
		let cur = i;
		while (isLastChild[cur]) {
			const p = parentOf[cur];
			if (p < 0) { break; }
			stack.delete(p);
			cur = p;
		}
	}

	return lines.join('\n');
}

// -----------------------------------------------------------------------------
// Renderer: interleaved lane graph (git-log style)
// -----------------------------------------------------------------------------

/**
 * Render `history` as an interleaved-lane "git log" style graph. Each parent
 * event gets a column; columns are laid out left-to-right in event order.
 * Trace roots with at least one direct child become synthetic `+label` rows
 * inserted before their first child.
 *
 * Glyphs:
 *   `╷`  lane origin (this node is a parent)
 *   `│`  lane passes through
 *   `├─` child connects; lane continues
 *   `└─` last child connects; lane closes
 *   `┼─` horizontal connector crosses an active lane
 *   `──` horizontal connector crosses an empty column
 */
export function renderLaneGraph(history: ExecutionHistory): string {
	const { events } = history;
	if (events.length === 0) { return ''; }

	interface Node {
		readonly label: string;
		readonly parent: Node | undefined;
		readonly isSynthetic: boolean;
	}

	// Insert synthetic root nodes before their first child.
	const nodes: Node[] = [];
	const syntheticForRoot = new Map<ExecutionRoot, Node>();
	const nodeByEvent = new Map<ExecutionEvent, Node>();

	// Which roots have at least one direct child event?
	const rootsWithChildren = new Set<ExecutionRoot>();
	for (const e of events) { if (!e.parent) { rootsWithChildren.add(e.root); } }

	for (const e of events) {
		if (rootsWithChildren.has(e.root) && !syntheticForRoot.has(e.root)) {
			const syn: Node = { label: `+${e.root.label}`, parent: undefined, isSynthetic: true };
			syntheticForRoot.set(e.root, syn);
			nodes.push(syn);
		}
		const timeStr = `+${e.time}ms`.padStart(7);
		const parent = e.parent ? nodeByEvent.get(e.parent)! : syntheticForRoot.get(e.root);
		const node: Node = { label: `[${timeStr}] ${e.label}`, parent, isSynthetic: false };
		nodeByEvent.set(e, node);
		nodes.push(node);
	}

	const n = nodes.length;
	const parentOf = new Array<number>(n).fill(-1);
	const childrenOf: number[][] = Array.from({ length: n }, () => []);
	const indexOfNode = new Map<Node, number>();
	for (let i = 0; i < n; i++) { indexOfNode.set(nodes[i], i); }
	for (let i = 0; i < n; i++) {
		const p = nodes[i].parent;
		if (p) {
			const pi = indexOfNode.get(p);
			if (pi !== undefined) { parentOf[i] = pi; childrenOf[pi].push(i); }
		}
	}

	// Assign columns: every node with children gets its own column.
	const colOf = new Array<number>(n).fill(-1);
	let totalCols = 0;
	for (let i = 0; i < n; i++) {
		if (childrenOf[i].length > 0) { colOf[i] = totalCols++; }
	}

	if (totalCols === 0) {
		return events.map(e => `[+${`${e.time}ms`.padStart(5)}] ${e.label}`).join('\n');
	}

	const active = new Array<number>(totalCols).fill(-1);
	const lines: string[] = [];

	for (let i = 0; i < n; i++) {
		const node = nodes[i];
		const pIdx = parentOf[i];
		const connectCol = pIdx >= 0 ? colOf[pIdx] : -1;
		const last = pIdx >= 0 && childrenOf[pIdx][childrenOf[pIdx].length - 1] === i;
		const opensCol = childrenOf[i].length > 0 ? colOf[i] : -1;
		const horizEnd = pIdx >= 0 ? (opensCol >= 0 ? opensCol : totalCols) : -1;

		const chars: string[] = [];
		for (let c = 0; c < totalCols; c++) {
			const isActive = active[c] >= 0;
			const isConnect = c === connectCol;
			const isOpen = c === opensCol && !isConnect;
			const inHoriz = connectCol >= 0 && c > connectCol && c < horizEnd;

			let g: string, s: string;
			if (isConnect) {
				g = last ? '└' : '├';
				s = '─';
			} else if (isOpen && node.isSynthetic) {
				g = '+';
				s = node.label.slice(1, 2) || '?';
			} else if (isOpen && connectCol >= 0) {
				g = '╷'; s = '─';
			} else if (isOpen) {
				g = '╷'; s = ' ';
			} else if (inHoriz && isActive) {
				g = '┼'; s = '─';
			} else if (inHoriz) {
				g = '─'; s = '─';
			} else if (isActive) {
				g = '│'; s = ' ';
			} else {
				g = ' '; s = ' ';
			}
			chars.push(g, s);
		}

		if (last) { active[colOf[pIdx]] = -1; }
		if (opensCol >= 0) { active[opensCol] = i; }

		if (node.isSynthetic) {
			lines.push(chars.join('').trimEnd());
		} else {
			lines.push(`${chars.join('')}${node.label}`);
		}
	}

	return lines.join('\n');
}
