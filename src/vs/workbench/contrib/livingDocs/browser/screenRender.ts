/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The "main-area" Abstract screens beyond the document editor -- Templates, Knowledge and
// Agents (with the workflow canvas). Each is rendered into a webview editor (see screenEditor.ts)
// so it fills the editor area at the comp's intended width, matching the Workbench hi-fi. These are
// our own surfaces (no core patch): the HTML below is ported from the locked design comp, with the
// comp's non-ASCII glyphs written as HTML entities to satisfy the source-hygiene rule.

import { groupPendingByDoc, IAgentDef, IAgentFlow, IAgentRun, IAgentTrigger, IDecisionGroup, IProjectRunSummary, IProposedChange, IReviewedDoc, reviewConfidence } from '../common/livingDocsModel.js';
import { ILivingDocSummary } from '../common/livingDocs.js';

export type ScreenId = 'home' | 'templates' | 'knowledge' | 'agents' | 'project-run' | 'review-project';

export type AgentFilter = 'all' | 'scheduled' | 'event' | 'needs-approval';

/** One entry in the ALL PROJECTS grid for recently-opened folders (no counts - not yet loaded). */
export interface IRecentProject {
	/** Basename of the folder, used as the project name. */
	readonly name: string;
	/** Stringified URI used as the `openFolder` arg so the host can re-open it. */
	readonly folderUri: string;
}

export interface IScreenState {
	/** Knowledge: which scope tab is selected. */
	readonly knScope: 'org' | 'project';
	/** Agents: the live registry (drives the table + canvas). */
	readonly agents: readonly IAgentDef[];
	/** Agents: the agent whose workflow canvas is open (vs the list). */
	readonly openAgentId?: string;
	/** Agents: the active table filter chip. */
	readonly filter: AgentFilter;
	/** Agents: the result of the most recent Run now, for the canvas banner. */
	readonly lastRun?: IAgentRun;
	/** Home: whether a workspace folder (the "project") is open. */
	readonly hasFolder?: boolean;
	/** Home: the open folder's name, shown as the project. */
	readonly folderName?: string;
	/** Home: the documents discovered in the open folder (all Markdown, living flagged for the badge). */
	readonly docs?: readonly ILivingDocSummary[];
	/**
	 * Home: recently-opened folders from the workbench history (D22-A). Each is shown as an
	 * additional tile in ALL PROJECTS with name + avatar only - counts are deferred until a
	 * folder is opened (real-data guardrail: never fabricate counts for unloaded projects).
	 */
	readonly recentFolders?: readonly IRecentProject[];
	/**
	 * Project-run (C4): the state of the live/last whole-project fan-out, or undefined when no
	 * run has started (the truthful idle state). Iter 2 populates only `instruction`/`source` from
	 * the real run when one is kicked; the swarm grid + decisions column (23.3/23.4) layer on later.
	 */
	readonly projectRun?: IProjectRunScreenState;
	/**
	 * Cross-document review (C5, plan 24): the project-scale second presentation of the SAME review model
	 * the C6 rail consumes. Absent on non-review screens. Carries the live pending set + the local
	 * navigation state (current doc + which docs were reviewed this session). Iter 1/2 is read-only.
	 */
	readonly reviewProject?: IReviewProjectScreenState;
}

/**
 * The cross-document review screen's state (plan 24, C5). `pending` is the live `getAllPending()` set,
 * grouped by document in the renderer for the doc-nav rail and the centre change cards. `currentDocId`
 * is the doc shown in the centre column (local screen navigation, not an engine action - defaults to the
 * first changed doc). `reviewedDocs` are the documents that had changes THIS session and now have zero
 * pending (the check "reviewed" glyph); tracked by the editor across re-renders. `source` labels the run's
 * attached transcript for the topbar chip. Nothing is fabricated - all counts derive from `pending`.
 */
export interface IReviewProjectScreenState {
	readonly pending: readonly IProposedChange[];
	readonly currentDocId?: string;
	/**
	 * Documents reviewed THIS session (seen with pending changes, now zero). Each carries the HUMAN title
	 * (not the raw docId URI) so the reviewed rail row is legible; derived by the editor via
	 * `reviewedDocsFromSeen`.
	 */
	readonly reviewedDocs?: readonly IReviewedDoc[];
	readonly source?: string;
	/** The project's folder name, for the topbar crumb + avatar. */
	readonly folderName?: string;
}

/**
 * The project-run screen's live state (plan 23, C4). Absent = no run in progress => the truthful
 * idle body. When present it carries the REAL instruction + attached source of the run so the
 * command strip reflects the actual fan-out (never the illustrative ISMS numbers from the comp).
 */
export interface IProjectRunScreenState {
	/** The user's whole-project instruction, rendered in reading type in the command strip. */
	readonly instruction: string;
	/** The attached source chip label (e.g. `Security Review - 3 Mar.txt`), if a source was named. */
	readonly source?: string;
	/** True while the fan-out is still in flight (isChatBusy) - drives the "Live" pill + tile spinners. */
	readonly inFlight?: boolean;
	/**
	 * The whole-project fan-out summary derived from `summariseProjectRun(listDocuments, getAllPending())`
	 * (plan 23, C4): one tile per project document + the real bottom-bar totals. Absent until the run's
	 * document set has been fetched. The `working` (spinner) tile state is a live overlay the renderer
	 * applies while `inFlight` is true - the selector itself only distinguishes changed / no-change.
	 */
	readonly summary?: IProjectRunSummary;
	/**
	 * Documents still being processed by the in-flight fan-out (their tiles render the spinner +
	 * `reviewing…`). While the run is live and nothing has settled yet, every no-change tile is treated
	 * as `working` so the grid reads as a busy swarm; once a doc settles (a change lands or the run
	 * finishes) it drops out of this set. Empty once the run settles.
	 */
	readonly working?: readonly string[];
	/**
	 * The decisions the agent understood (C4 left column, plan 23.4): the pending changes grouped by
	 * their source grounding via `groupDecisions(getAllPending())`. Each group carries the verbatim
	 * decision quote, its source line where known, and the count of distinct documents it affects.
	 * The attached source name (`source`) labels the transcript chip on each card. Absent/empty until a
	 * run has produced grounded changes; when the model omitted grounding the groups degrade to a
	 * rationale grouping (`grounded:false`) and the card omits the line chip.
	 */
	readonly decisions?: readonly IDecisionGroup[];
}

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ACCENT = 'oklch(0.55 0.13 255)';
const ACCENT_DK = 'oklch(0.5 0.13 255)';

// Project-avatar palette (Part B): blue / navy / teal / purple / amber, all with #fff text. A
// document's colour is picked deterministically from its title so the same doc always looks the same.
const AVATAR_COLORS = ['oklch(0.55 0.13 255)', '#3b4d8f', '#0e7c66', '#5a3ea8', '#b5642a'];

// A stable 2-letter avatar (initials of the first two words, else the first two letters) and its
// palette colour, derived only from the title - no stored/fabricated identity.
function avatar(title: string): { readonly text: string; readonly color: string } {
	const words = title.trim().split(/\s+/).filter(Boolean);
	const letters = words.length >= 2
		? (words[0][0] + words[1][0])
		: (title.replace(/\s+/g, '').slice(0, 2) || '?');
	let hash = 0;
	for (let i = 0; i < title.length; i++) { hash = (hash * 31 + title.charCodeAt(i)) | 0; }
	const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
	return { text: esc(letters.toUpperCase()), color };
}

// Shared webview head: same font stack, selection colour and scrollbar treatment as the comp shell.
const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a1c20;background:#fff}
::selection{background:rgba(80,110,235,.18)}
::-webkit-scrollbar{width:11px;height:11px}
::-webkit-scrollbar-thumb{background:#d7d9df;border:3px solid transparent;background-clip:content-box;border-radius:8px}
::-webkit-scrollbar-thumb:hover{background:#c2c5cd;background-clip:content-box}
@keyframes lwdPulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes lwdSpin{to{transform:rotate(360deg)}}
.screen{height:100vh;display:flex;flex-direction:column;min-height:0;background:#fff}
.scr-head{flex:none;display:flex;align-items:center;gap:16px;padding:18px 28px;border-bottom:1px solid #eef0f3}
.scr-title{margin:0 0 4px;font:600 18px/1.2 system-ui;color:#15171c}
.scr-sub{font:400 12px/1 'JetBrains Mono',ui-monospace,monospace;color:#a3a8b2}
.scr-body{flex:1;overflow-y:auto;background:#f8f9fb}
.btn-primary{border:none;border-radius:8px;padding:10px 16px;background:${ACCENT};color:#fff;font:600 13px/1 system-ui;cursor:pointer}
.btn-ghost{border:1px solid #e0e2e8;background:#fff;border-radius:8px;padding:8px 13px;font:500 12px/1 system-ui;color:#52575f;cursor:pointer}
.topbar{flex:none;height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 16px 0 14px;border-bottom:1px solid #e9eaee;background:#fbfbfc}
.brand{display:flex;align-items:center;gap:10px;font:600 13px/1 system-ui;color:#2a2c32}
.logo{width:20px;height:20px;border-radius:6px;background:${ACCENT};color:#fff;display:flex;align-items:center;justify-content:center;font:600 11px/1 system-ui}
.sep{color:#c8cbd2}
.crumb{color:#868b95;font-weight:400}
.right{display:flex;align-items:center;gap:8px}
.pill{display:flex;align-items:center;gap:7px;font:500 12px/1 system-ui;color:#5d8a66;background:#eef7f0;border:1px solid #d7ecdc;border-radius:999px;padding:6px 11px}
.pill .dot{width:7px;height:7px;border-radius:50%;background:oklch(0.6 0.13 150)}
.tb-present{border:1px solid #e0e2e8;background:#fff;border-radius:8px;padding:7px 12px;font:500 12px/1 system-ui;color:#52575f;cursor:pointer;display:flex;align-items:center;gap:6px}
.av{flex:none;width:27px;height:27px;border-radius:50%;background:${ACCENT};color:#fff;font:600 11px/27px system-ui;text-align:center}
</style>`;

// Generic message bridge: any element with data-msg posts {type:<msg>, arg:<data-arg>} to the host.
const SCRIPT = `const vscode = acquireVsCodeApi();
for (const el of document.querySelectorAll('[data-msg]')) {
	el.addEventListener('click', () => vscode.postMessage({ type: el.getAttribute('data-msg'), arg: el.getAttribute('data-arg') || undefined }));
}`;

function page(body: string): string {
	return `<!DOCTYPE html><html><head>${HEAD}</head><body>${body}<script>${SCRIPT}</script></body></html>`;
}

// The comp's global top bar, shown on every main-area screen (the doc editor renders its own variant
// in livingDocRender). Brand + per-screen crumb on the left; sync-status pill, Present (posts the
// same `present` message the host already handles), and the user avatar on the right.
function topBar(crumb: string): string {
	return `<div class="topbar"><div class="brand"><span class="logo">A</span>Abstract<span class="sep">/</span><span class="crumb">${esc(crumb)}</span></div>`
		+ `<div class="right"><span class="pill"><span class="dot"></span>All sources synced</span>`
		+ `<button class="tb-present" data-msg="present">&#8599; Present</button>`
		+ `<span class="av">TS</span></div></div>`;
}

// Insert the top bar as the first flex child of the screen column (each renderer opens with .screen).
function withTopBar(html: string, crumb: string): string {
	return html.replace('<div class="screen">', `<div class="screen">${topBar(crumb)}`);
}

export function renderScreenHtml(screen: ScreenId, state: IScreenState): string {
	switch (screen) {
		case 'home': return page(withTopBar(renderHome(state), 'Home'));
		case 'templates': return page(withTopBar(renderTemplates(), 'Templates'));
		case 'knowledge': return page(withTopBar(renderKnowledge(state), 'Knowledge'));
		case 'agents': return page(withTopBar(renderAgents(state), 'Agents'));
		case 'project-run': return page(renderProjectRun(state));
		case 'review-project': return page(renderReviewProject(state));
	}
}

// Health indicator for a project tile. Comp pattern: In Sync = small `ok`-token green dot (no text);
// pending = amber chip with just the count number (attention tokens). Matches Part B tokens exactly.
function healthIndicator(pending: number): string {
	if (pending === 0) {
		// `ok` green dot: 6px, `oklch(0.6 0.13 150)` = #2C8159 approx
		return `<span style="display:flex;align-items:center;gap:5px;font:500 11px/1 system-ui;color:#5d8a66;flex:none"><span style="width:6px;height:6px;border-radius:50%;background:oklch(0.6 0.13 150)"></span></span>`;
	}
	// `attention` amber chip: just the number, no "to approve" text (matches comp exactly)
	return `<span style="font:600 9px/1 'JetBrains Mono',ui-monospace,monospace;color:#8a6d1a;background:#fdfaf2;border:1px solid #e4dccb;border-radius:5px;padding:3px 6px;flex:none">${pending}</span>`;
}

// ---- Home: the landing dashboard. The open folder IS the project (decision #39): an empty state when no
// folder is open, otherwise the folder's name + every Markdown document (living ones badged). ----
function renderHome(state: IScreenState): string {
	const scroll = (inner: string) => `<div class="screen"><div style="flex:1;overflow-y:auto;background:#f8f9fb">${inner}</div></div>`;

	// No folder open: a single calm invitation to open one (the on-ramp).
	if (!state.hasFolder) {
		return `<div class="screen"><div style="flex:1;overflow-y:auto;background:#f8f9fb;display:flex;align-items:center;justify-content:center">
			<div style="text-align:center;max-width:430px;padding:40px">
				<div style="font-size:42px;line-height:1;margin-bottom:16px">&#128193;</div>
				<h1 style="margin:0 0 10px;font:600 23px/1.25 system-ui;color:#15171c;letter-spacing:-.01em">Open a folder to begin</h1>
				<p style="margin:0 0 24px;font:400 14px/1.6 system-ui;color:#696e78">Living Documents works on a folder of Markdown files on your computer. Open one to see its documents, sources and agents &mdash; everything stays on disk.</p>
				<button data-msg="openFolder" style="border:none;border-radius:10px;padding:13px 22px;background:${ACCENT};color:#fff;font:600 14px/1 system-ui;cursor:pointer">Open folder&hellip;</button>
			</div>
		</div></div>`;
	}

	const docs = state.docs ?? [];
	const folderName = state.folderName ?? 'Workspace';

	// NEEDS YOU + the greeting summary are derived from the REAL per-document pending count that
	// listDocuments() already carries (ILivingDocSummary.pendingCount = the live pending set for that
	// doc). Never fabricated: if nothing pends the section is absent and the summary is "in sync".
	const pendingDocs = docs.filter(d => d.pendingCount > 0).sort((a, b) => b.pendingCount - a.pendingCount);
	const totalPending = pendingDocs.reduce((n, d) => n + d.pendingCount, 0);
	const summary = pendingDocs.length
		? `${pendingDocs.length} document${pendingDocs.length === 1 ? '' : 's'} need${pendingDocs.length === 1 ? 's' : ''} your review across this project. <strong style="font-weight:600;color:#8a6d1a">${totalPending} change${totalPending === 1 ? '' : 's'} to approve</strong>.`
		: 'Everything is in sync.';

	// One NEEDS-YOU card per document with pending work: accent top-border, a 2.4s pulse dot, the doc
	// name, the amber `N TO APPROVE` chip (attention tokens), and a primary Review that opens the doc.
	const needsCard = (d: ILivingDocSummary) => {
		const av = avatar(d.title);
		const n = d.pendingCount;
		return `<div style="flex:1;min-width:0;max-width:520px;background:#fff;border:1px solid #e0e5fb;border-radius:15px;padding:20px 22px;box-shadow:0 12px 30px -20px rgba(86,97,201,.45);position:relative">
			<div style="position:absolute;top:0;left:22px;right:22px;height:3px;background:${ACCENT};border-radius:0 0 3px 3px"></div>
			<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><span style="width:28px;height:28px;flex:none;border-radius:8px;background:${av.color};color:#fff;font:600 11px/28px system-ui;text-align:center">${av.text}</span><span style="font:600 16px/1.2 system-ui;color:#1a1c20;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.title)}</span><span style="margin-left:auto;flex:none;font:600 9.5px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.04em;color:#8a6d1a;background:#fdfaf2;border:1px solid #e4dccb;border-radius:5px;padding:4px 7px">${n} TO APPROVE</span></div>
			<div style="font:400 11.5px/1 'JetBrains Mono',ui-monospace,monospace;color:#a3a8b2;margin-bottom:16px;padding-left:38px">${d.sources.length ? `${d.sources.length} source${d.sources.length === 1 ? '' : 's'}` : 'Living document'}</div>
			<div style="display:flex;gap:8px;margin-bottom:16px"><span style="width:7px;height:7px;border-radius:50%;background:oklch(0.66 0.16 45);margin-top:5px;flex:none;animation:lwdPulse 2.4s ease-in-out infinite"></span><span style="font:400 12.5px/1.5 system-ui;color:#52575f"><strong style="color:#1a1c20;font-weight:600">${n} change${n === 1 ? '' : 's'}</strong> from a source refresh ${n === 1 ? 'is' : 'are'} waiting for your review.</span></div>
			<button data-msg="openDoc" data-arg="${esc(d.resource.toString())}" style="width:100%;font:600 13px/1 system-ui;color:#fff;background:${ACCENT};border:none;border-radius:9px;padding:11px;cursor:pointer">Review ${n} change${n === 1 ? '' : 's'}</button>
		</div>`;
	};
	const needsYou = pendingDocs.length
		? `<div style="font:600 11px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.12em;color:#5661c9;margin-bottom:14px;display:flex;align-items:center;gap:8px"><span style="width:6px;height:6px;border-radius:50%;background:${ACCENT};animation:lwdPulse 2.4s ease-in-out infinite"></span>NEEDS YOU</div>
			<div style="display:flex;gap:16px;margin-bottom:34px;flex-wrap:wrap">${pendingDocs.slice(0, 2).map(needsCard).join('')}</div>`
		: '';

	// ALL PROJECTS grid (D22-A): the current folder prominently + recent folders as additional tiles.
	// Counts for the current folder are REAL (from the live listDocuments() data + distinct sources).
	// Counts for recent folders are DEFERRED (not yet loaded) - show name + avatar only, per the
	// real-data guardrail (never fabricate counts for unloaded projects).
	const distinctSources = new Set<string>();
	for (const d of docs) { for (const s of d.sources) { distinctSources.add(s); } }
	const docCount = docs.length;
	const srcCount = distinctSources.size;
	const countsLabel = srcCount > 0
		? `${docCount} doc${docCount === 1 ? '' : 's'} &middot; ${srcCount} source${srcCount === 1 ? '' : 's'}`
		: `${docCount} doc${docCount === 1 ? '' : 's'}`;

	// Current-project tile (comp: 1px border, 14px radius, 17x18px padding, 24px avatar/7px-radius).
	// The current project tile gets the same uniform border as the comp (no 2px accent outline) but
	// a subtle accent-tint background so the active project reads as distinct from recent ones.
	const currentAv = avatar(folderName);
	const currentTile = `<button data-msg="openFirstDoc" style="text-align:left;background:#f7f9ff;border:1px solid #e0e5fb;border-radius:14px;padding:17px 18px;cursor:pointer;display:flex;flex-direction:column;gap:12px;width:100%">
		<div style="display:flex;align-items:center;gap:9px">
			<span style="width:24px;height:24px;flex:none;border-radius:7px;background:${currentAv.color};color:#fff;font:600 10px/24px system-ui;text-align:center">${currentAv.text}</span>
			<span style="font:600 14px/1 system-ui;color:#1a1c20;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(folderName)}</span>
			${healthIndicator(totalPending)}
		</div>
		<div style="font:400 11px/1 'JetBrains Mono',ui-monospace,monospace;color:#a3a8b2">${countsLabel}</div>
	</button>`;

	// Recent-folder tiles (D22-A): name + avatar only, "Open" affordance instead of counts.
	// Filter out the current folder so it does not appear twice.
	const recents = (state.recentFolders ?? []).filter(r => r.name !== folderName);
	const recentTile = (r: IRecentProject) => {
		const av = avatar(r.name);
		return `<button data-msg="openRecentFolder" data-arg="${esc(r.folderUri)}" style="text-align:left;background:#fff;border:1px solid #e9eaee;border-radius:14px;padding:17px 18px;cursor:pointer;display:flex;flex-direction:column;gap:12px;width:100%">
			<div style="display:flex;align-items:center;gap:9px">
				<span style="width:24px;height:24px;flex:none;border-radius:7px;background:${av.color};color:#fff;font:600 10px/24px system-ui;text-align:center">${av.text}</span>
				<span style="font:600 14px/1 system-ui;color:#1a1c20;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(r.name)}</span>
				<span style="font:500 10px/1 system-ui;color:#a3a8b2;flex:none">Open &#8599;</span>
			</div>
			<div style="font:400 11px/1 'JetBrains Mono',ui-monospace,monospace;color:#c2c5cd">Open to see counts</div>
		</button>`;
	};

	const allTiles = [currentTile, ...recents.map(recentTile)];
	// 3-column grid for >= 3 tiles; 2-column for fewer (comp uses 3-col).
	const cols = allTiles.length >= 3 ? 3 : (allTiles.length === 2 ? 2 : 1);
	const projectsGrid = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:14px">${allTiles.join('')}</div>`;

	return scroll(`<div style="max-width:1080px;margin:0 auto;padding:40px 36px 80px">
		<div style="display:flex;align-items:baseline;justify-content:space-between;gap:24px;margin-bottom:6px"><h1 style="margin:0;flex:none;white-space:nowrap;font:600 26px/1.2 system-ui;color:#15171c;letter-spacing:-.01em">Good morning, Tom</h1><button data-msg="openFolder" style="flex:none;border:1px solid #e6e8ed;background:#fff;border-radius:8px;padding:7px 12px;font:500 12px/1 system-ui;color:#52575f;cursor:pointer">Switch folder&hellip;</button></div>
		<p style="margin:0 0 26px;font:400 14.5px/1.5 system-ui;color:#52575f">${summary}</p>
		${needsYou}
		<div style="font:600 11px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.12em;color:#a3a8b2;margin-bottom:14px">ALL PROJECTS</div>
		${projectsGrid}
	</div>`);
}

// ---- Templates: run a template -> fill from sources -> review the diff. ----
function renderTemplates(): string {
	const step = (n: string, label: string, extra: string, inner: string) => `<div style="background:#fff;border:1px solid #e9eaee;border-radius:12px;padding:16px">`
		+ `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="width:20px;height:20px;border-radius:50%;background:${ACCENT};color:#fff;font:600 11px/20px system-ui;text-align:center">${n}</span><span style="font:600 13px/1 system-ui">${label}</span>${extra}</div>${inner}</div>`;
	const green = (t: string) => `<span style="background:#e7f6ec;color:#1f5a36;padding:0 4px;border-radius:3px;font-weight:600">${t}</span>`;
	const srcChip = (t: string) => `<span style="display:flex;align-items:center;gap:6px;font:500 12px/1 'JetBrains Mono',ui-monospace,monospace;color:#52575f;background:#f4f6ff;border:1px solid #e2e8ff;border-radius:999px;padding:6px 10px"><span style="width:6px;height:6px;border-radius:50%;background:${ACCENT}"></span>${t}</span>`;
	return `<div class="screen">
	<div class="scr-head" style="display:block"><h2 class="scr-title">Run template &mdash; Weekly report</h2><div class="scr-sub">Fill from sources, generate a draft, review the diff before it lands.</div></div>
	<div class="scr-body">
		<div style="max-width:980px;margin:0 auto;padding:26px 28px 80px;display:flex;gap:20px;align-items:flex-start">
			<div style="width:380px;flex:none;display:flex;flex-direction:column;gap:14px">
				${step('1', 'Template', '', `<div style="border:1px solid #e6e8ed;border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:8px;font:500 13px/1 system-ui;color:#2c2f36">&#9636; Weekly report<span style="margin-left:auto;color:#a3a8b2">&#9662;</span></div>`)}
				${step('2', 'Prompt', `<button class="btn-ghost" style="margin-left:auto;display:flex;align-items:center;gap:6px;padding:5px 9px;font:500 11px/1 system-ui">&#127897; Voice</button>`, `<div style="border:1px solid #e6e8ed;border-radius:8px;padding:11px 12px;font:400 13.5px/1.55 system-ui;color:#2c2f36;background:#fcfcfd">Summarise week 24. Flag the signup spike and call out that growth accelerated.</div>`)}
				${step('3', 'Sources', '', `<div style="display:flex;flex-wrap:wrap;gap:7px">${srcChip('metrics.csv')}${srcChip('crm &middot; api')}<span style="display:flex;align-items:center;gap:6px;font:500 12px/1 'JetBrains Mono',ui-monospace,monospace;color:#868b95;background:#fff;border:1px dashed #d4d7de;border-radius:999px;padding:6px 10px">&#65291; add source</span></div>`)}
				<button class="btn-primary" style="border-radius:10px;padding:13px;font:600 14px/1 system-ui">Generate draft</button>
			</div>
			<div style="flex:1;min-width:0;background:#fff;border:1px solid #e9eaee;border-radius:12px;overflow:hidden">
				<div style="display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid #f1f2f5"><span style="font:600 12px/1 system-ui;color:#2c2f36">Draft preview</span><span style="font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;color:#1f7a44;background:#e7f6ec;border-radius:999px;padding:4px 8px">ALL SLOTS RESOLVED</span><div style="margin-left:auto;display:flex;gap:7px"><button class="btn-ghost" style="padding:6px 11px;font:500 12px/1 system-ui" data-msg="goReview">Review diff &#8594;</button><button class="btn-ghost" style="padding:6px 11px;font:500 12px/1 system-ui" data-msg="present">Export</button></div></div>
				<div style="padding:28px 32px">
					<h1 style="margin:0 0 4px;font:600 23px/1.2 system-ui;color:#15171c">Weekly Operating Summary</h1>
					<div style="font:400 12px/1 'JetBrains Mono',ui-monospace,monospace;color:#a3a8b2;margin-bottom:24px">Week ${green('24')} &middot; Jun 15&ndash;19</div>
					<h2 style="margin:0 0 10px;font:600 16px/1.3 system-ui;color:#23262c">Highlights</h2>
					<p style="margin:0 0 20px;font:400 15px/1.7 system-ui;color:#2c2f36">Revenue grew ${green('18%')} to ${green('$48.6k')} MRR on ${green('427')} new signups.</p>
					<h2 style="margin:0 0 10px;font:600 16px/1.3 system-ui;color:#23262c">Commentary</h2>
					<p style="margin:0;font:400 15px/1.7 system-ui;color:#2c2f36">Growth ${green('accelerated sharply')} &mdash; fastest pace this quarter. The signup spike is the headline; watch activation next week.</p>
					<div style="margin-top:22px;padding-top:16px;border-top:1px dashed #e6e8ed;font:400 11.5px/1.6 'JetBrains Mono',ui-monospace,monospace;color:#bcc0c8"><span style="color:#1f7a44">green</span> = filled from source &middot; grey template slots all resolved</div>
				</div>
			</div>
		</div>
	</div>
</div>`;
}

// ---- Knowledge: the decision stack (Org enduring / Project directional) agents align to. ----
function renderKnowledge(state: IScreenState): string {
	const isOrg = state.knScope === 'org';
	const tabStyle = (on: boolean) => on
		? 'background:#fff;color:#1a1c20;box-shadow:0 1px 2px rgba(0,0,0,.06)'
		: 'background:transparent;color:#868b95';
	const card = (border: string, label: string, labelColor: string, inner: string) => `<div style="background:#fff;border:1px solid #e9eaee;${border};border-radius:11px;padding:18px 20px;margin-bottom:11px"><div style="font:600 11px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em;color:${labelColor};margin-bottom:8px">${label}</div>${inner}</div>`;
	const krBar = (label: string, val: string, valColor: string, pct: string, barColor: string) => `<div><div style="display:flex;justify-content:space-between;font:400 12.5px/1.4 system-ui;color:#52575f;margin-bottom:5px"><span>${label}</span><span style="font-weight:600;color:${valColor}">${val}</span></div><div style="height:6px;border-radius:999px;background:#eef0f3;overflow:hidden"><div style="width:${pct};height:100%;background:${barColor}"></div></div></div>`;
	const metric = (label: string, val: string, sub: string, subColor: string) => `<div style="flex:1;background:#fff;border:1px solid #e9eaee;border-radius:11px;padding:15px 16px"><div style="font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em;color:#a3a8b2;margin-bottom:9px">${label}</div><div style="font:600 22px/1 system-ui;color:#1d1b16;margin-bottom:4px">${val}</div><div style="font:400 11px/1 'JetBrains Mono',ui-monospace,monospace;color:${subColor}">${sub}</div></div>`;
	const value = (t: string) => `<span style="font:500 12px/1 system-ui;color:#52575f;background:#f4f6ff;border:1px solid #e2e8ff;border-radius:999px;padding:6px 11px">${t}</span>`;
	const principle = (n: string, t: string) => `<div style="display:flex;gap:10px"><span style="font:600 12px/1.5 system-ui;color:oklch(0.6 0.13 60)">${n}</span><span style="font:400 14px/1.5 system-ui;color:#2f2c26">${t}</span></div>`;
	const arrow = (t: string) => `<div style="display:flex;gap:10px"><span style="color:${ACCENT};font:600 13px/1.5 system-ui">&#8594;</span><span style="font:400 14px/1.5 system-ui;color:#2f2c26">${t}</span></div>`;

	const org = `<div style="font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.1em;color:#bcb199;margin:0 0 12px">ENDURING &middot; WHY WE EXIST</div>
		${card('border-left:3px solid oklch(0.6 0.13 60)', 'MISSION', '#a99b78', `<p style="margin:0;font:500 19px/1.4 system-ui;color:#1d1b16;letter-spacing:-.01em">Make every business document trustworthy by default.</p>`)}
		${card('border-left:3px solid oklch(0.6 0.13 60)', 'VISION', '#a99b78', `<p style="margin:0;font:400 16px/1.55 system-ui;color:#2f2c26">A world where teams act on the documents in front of them without ever having to re-check the numbers or the wording.</p>`)}
		<div style="font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.1em;color:#bcb199;margin:20px 0 12px">HOW WE OPERATE</div>
		<div style="display:flex;gap:11px;margin-bottom:11px"><div style="flex:1;background:#fff;border:1px solid #e9eaee;border-radius:11px;padding:16px 18px"><div style="font:600 11px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em;color:#a3a8b2;margin-bottom:11px">VALUES</div><div style="display:flex;flex-wrap:wrap;gap:7px">${value('Truth over polish')}${value('Auditability')}${value('Calm software')}${value('Customer proximity')}</div></div></div>
		<div style="background:#fff;border:1px solid #e9eaee;border-radius:11px;padding:16px 18px"><div style="font:600 11px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em;color:#a3a8b2;margin-bottom:11px">PRINCIPLES</div><div style="display:flex;flex-direction:column;gap:10px">${principle('01', `Never ship a change a human can't trace back to its source.`)}${principle('02', 'Automate the safe, escalate the meaningful.')}${principle('03', 'Default to the calm path: fewer surfaces, clearer diffs.')}</div></div>`;

	const project = `<div style="font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.1em;color:#bcb199;margin:0 0 12px">DIRECTIONAL &middot; HOW WE WIN</div>
		${card('border-left:3px solid ' + ACCENT, 'PRODUCT STRATEGY', '#8a93c4', `<div style="display:flex;flex-direction:column;gap:10px">${arrow('<strong style="font-weight:600">Wedge:</strong> land on recurring, data-linked reports &mdash; the painful work that repeats.')}${arrow('<strong style="font-weight:600">Moat:</strong> provenance + approval trail nobody can retrofit onto a chatbot.')}${arrow('<strong style="font-weight:600">Expand:</strong> from one bound report outward to quotes, SOPs and trackers.')}</div>`)}
		<div style="font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.1em;color:#bcb199;margin:20px 0 12px">MEASURABLE &middot; WHAT WE TRACK</div>
		<div style="background:#fff;border:1px solid #e9eaee;border-radius:11px;padding:16px 18px;margin-bottom:11px"><div style="display:flex;align-items:center;gap:9px;margin-bottom:13px"><span style="font:600 11px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em;color:#a3a8b2">Q3 OKRs</span><span style="font:600 10px/1 system-ui;color:#9a6b16;background:#fdf2dc;border-radius:999px;padding:4px 8px">OBJECTIVE 2</span></div><p style="margin:0 0 14px;font:500 15px/1.4 system-ui;color:#1d1b16">Prove the report wedge with real recurring usage.</p><div style="display:flex;flex-direction:column;gap:12px">${krBar('KR1 &middot; 25 weekly reports live', '18 / 25', '#1f7a44', '72%', 'oklch(0.55 0.14 150)')}${krBar('KR2 &middot; +20% MRR from reporting tier', '+13%', '#9a6b16', '65%', 'oklch(0.7 0.14 70)')}${krBar('KR3 &middot; 90% changes reviewed in &lt;1 day', '94%', '#1f7a44', '94%', 'oklch(0.55 0.14 150)')}</div></div>
		<div style="display:flex;gap:11px">${metric('ACTIVATION', '61%', 'target 55% &#10003;', '#1f7a44')}${metric('NET RETENTION', '118%', 'target 110% &#10003;', '#1f7a44')}${metric('TIME-TO-TRUST', '2.1d', 'target 1d', '#9a6b16')}</div>`;

	return `<div class="screen">
	<div class="scr-head">
		<div><h2 class="scr-title">Knowledge</h2><div class="scr-sub">The decision stack &mdash; what agents and documents align to.</div></div>
		<div style="margin-left:auto;display:flex;gap:5px;background:#f1f2f5;border-radius:9px;padding:3px">
			<button data-msg="setKnOrg" style="border:none;border-radius:7px;padding:7px 13px;font:500 12px/1 system-ui;cursor:pointer;${tabStyle(isOrg)}">Organization</button>
			<button data-msg="setKnProject" style="border:none;border-radius:7px;padding:7px 13px;font:500 12px/1 system-ui;cursor:pointer;${tabStyle(!isOrg)}">Project &middot; Abstract</button>
		</div>
		<button class="btn-ghost">Edit</button>
	</div>
	<div class="scr-body">
		<div style="max-width:1040px;margin:0 auto;padding:26px 28px 80px;display:flex;gap:22px;align-items:flex-start">
			<div style="flex:1;min-width:0">${isOrg ? org : project}</div>
			<div style="width:288px;flex:none">
				<div style="background:#fff;border:1px solid #e9eaee;border-radius:12px;padding:16px 17px;margin-bottom:14px">
					<div style="font:600 11px/1 system-ui;color:#1a1c20;margin-bottom:10px">How this is used</div>
					<p style="margin:0 0 14px;font:400 12.5px/1.55 system-ui;color:#696e78">This is the decision stack teams align to. Agents read it; documents inherit it; reviews check against it.</p>
					<div style="display:flex;flex-direction:column;gap:9px">
						<div style="display:flex;gap:9px;align-items:flex-start"><span style="width:24px;height:24px;flex:none;border-radius:7px;background:#fdf2dc;color:#9a6b16;font-size:12px;display:flex;align-items:center;justify-content:center">&#9672;</span><span style="font:400 12px/1.45 system-ui;color:#52575f"><strong style="font-weight:600">Strategy agent</strong> tests document claims against this.</span></div>
						<div style="display:flex;gap:9px;align-items:flex-start"><span style="width:24px;height:24px;flex:none;border-radius:7px;background:#eef1ff;color:${ACCENT_DK};font-size:12px;display:flex;align-items:center;justify-content:center">&#9635;</span><span style="font:400 12px/1.45 system-ui;color:#52575f">Auto-attached to <strong style="font-weight:600">6 documents</strong> as context.</span></div>
						<div style="display:flex;gap:9px;align-items:flex-start"><span style="width:24px;height:24px;flex:none;border-radius:7px;background:#e7f6ec;color:#1f7a44;font-size:12px;display:flex;align-items:center;justify-content:center">&#10003;</span><span style="font:400 12px/1.45 system-ui;color:#52575f">Last reviewed <strong style="font-weight:600">2 weeks ago</strong> by Tom.</span></div>
					</div>
				</div>
				<div style="background:#fdfaf2;border:1px solid #e4dccb;border-radius:12px;padding:14px 16px">
					<div style="font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em;color:#a99b78;margin-bottom:9px">DECISION STACK</div>
					<div style="display:flex;flex-direction:column;gap:6px;font:500 12px/1.4 system-ui">
						<div style="background:#fff;border:1px solid #efe7d6;border-radius:7px;padding:8px 10px;color:#1d1b16">Mission &amp; Vision <span style="font-weight:400;color:#a99b78">&mdash; enduring</span></div>
						<div style="text-align:center;color:#cdbf9f;font-size:11px">&#8595;</div>
						<div style="background:#fff;border:1px solid #efe7d6;border-radius:7px;padding:8px 10px;color:#1d1b16">Strategy <span style="font-weight:400;color:#a99b78">&mdash; directional</span></div>
						<div style="text-align:center;color:#cdbf9f;font-size:11px">&#8595;</div>
						<div style="background:#fff;border:1px solid #efe7d6;border-radius:7px;padding:8px 10px;color:#1d1b16">OKRs &amp; KPIs <span style="font-weight:400;color:#a99b78">&mdash; measurable</span></div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>`;
}

// ---- Agents: the live registry table, and the workflow canvas for one agent. ----
function renderAgents(state: IScreenState): string {
	const open = state.openAgentId ? state.agents.find(a => a.id === state.openAgentId) : undefined;
	return open ? renderAgentCanvas(open, state) : renderAgentList(state);
}

const AGENT_ICON: Record<string, string> = { cron: '&#10227;', heartbeat: '&#9673;', event: '&#8853;', lifecycle: '&#9638;', manual: '&#9654;' };

function base(path: string): string { return esc(path.split('/').pop() ?? path); }

function triggerLabel(t: IAgentTrigger): string {
	switch (t.kind) {
		case 'cron': return `cron &middot; ${esc(t.cron ?? '')}`;
		case 'heartbeat': return `heartbeat &middot; ${t.everyHours ?? 6}h`;
		case 'event': return `event &middot; ${esc(t.source ?? '*')}`;
		case 'lifecycle': return `lifecycle &middot; ${esc(t.lifecycle ?? '')}`;
		default: return 'manual';
	}
}

function flowLabel(f: IAgentFlow): string {
	const s = f.sources.length ? f.sources.map(base).join(', ') : 'all sources';
	const d = f.docs.length ? f.docs.map(base).join(', ') : 'all documents';
	return `${s} &#8594; ${d}`;
}

// Format the agent's last-run ISO timestamp as the comp's relative label ("2m ago" / "1h ago" /
// "yesterday"); an em dash when the agent has never run. (lastRun is a real timestamp - the
// orchestrator parses it for due-checks - so it is formatted here, not stored as a label.)
function relTime(iso: string | undefined): string {
	if (!iso) { return '\u2014'; }
	const ms = Date.now() - Date.parse(iso);
	if (!isFinite(ms) || ms < 0) { return 'just now'; }
	const mins = Math.floor(ms / 60000);
	if (mins < 1) { return 'just now'; }
	if (mins < 60) { return `${mins}m ago`; }
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) { return `${hrs}h ago`; }
	const days = Math.floor(hrs / 24);
	return days === 1 ? 'yesterday' : `${days}d ago`;
}

function statusBadge(status: string): string {
	const dot = (color: string, label: string, fg = '#52575f') => `<span style="display:inline-flex;align-items:center;gap:6px;font:600 11px/1 system-ui;color:${fg}"><span style="width:7px;height:7px;border-radius:50%;background:${color}"></span>${label}</span>`;
	switch (status) {
		case 'running': return dot('oklch(0.66 0.16 45)', 'Running', '#9a6b16');
		case 'needs-approval': return `<span style="font:600 11px/1 system-ui;color:#9a6b16;background:#fdf2dc;border-radius:999px;padding:5px 10px">Needs approval</span>`;
		case 'blocked': return `<span style="font:600 11px/1 system-ui;color:#b4332f;background:#fdecec;border-radius:999px;padding:5px 10px">Blocked</span>`;
		case 'error': return dot('#b4332f', 'Error', '#b4332f');
		default: return dot('#cdd1d8', 'Idle', '#868b95');
	}
}

function isScheduled(a: IAgentDef): boolean { return a.trigger.kind === 'cron' || a.trigger.kind === 'heartbeat'; }
function isEvent(a: IAgentDef): boolean { return a.trigger.kind === 'event' || a.trigger.kind === 'lifecycle'; }

function renderAgentList(state: IScreenState): string {
	const agents = state.agents;
	const counts = {
		all: agents.length,
		scheduled: agents.filter(isScheduled).length,
		event: agents.filter(isEvent).length,
		needs: agents.filter(a => a.status === 'needs-approval').length,
	};
	const chip = (id: AgentFilter, label: string, warn = false) => {
		const on = state.filter === id;
		return `<button data-msg="setFilter" data-arg="${id}" style="font:500 12px/1 system-ui;cursor:pointer;${on ? 'color:#15181f;background:#fff;border:1px solid #e6e8ed;box-shadow:0 1px 2px rgba(0,0,0,.04);' : `color:${warn ? '#9a6b16' : '#868b95'};background:none;border:1px solid transparent;`}border-radius:8px;padding:7px 12px">${label}</button>`;
	};
	const shown = agents.filter(a => state.filter === 'all'
		|| (state.filter === 'scheduled' && isScheduled(a))
		|| (state.filter === 'event' && isEvent(a))
		|| (state.filter === 'needs-approval' && a.status === 'needs-approval'));
	const rows = shown.map(a => `<div data-msg="openAgent" data-arg="${esc(a.id)}" style="display:flex;align-items:center;padding:15px 18px;border-bottom:1px solid #f1f2f5;font:400 13px/1.4 system-ui;cursor:pointer">
		<div style="flex:2.4;display:flex;align-items:center;gap:9px"><span style="color:${ACCENT}">${AGENT_ICON[a.trigger.kind] ?? '&#9679;'}</span><span style="font-weight:500">${esc(a.name)}</span><span style="font:400 10px/1 'JetBrains Mono',ui-monospace,monospace;color:#aeb6e0">open &#8599;</span></div>
		<div style="flex:1.4;font:400 12px/1 'JetBrains Mono',ui-monospace,monospace;color:#696e78">${triggerLabel(a.trigger)}</div>
		<div style="flex:2.6;font:400 12px/1.5 'JetBrains Mono',ui-monospace,monospace;color:#868b95">${flowLabel(a.flow)}</div>
		<div style="flex:1.3;color:#969ba4;font:400 12px/1 system-ui">${relTime(a.lastRun)}</div>
		<div style="flex:1.4">${statusBadge(a.status)}</div>
	</div>`).join('');
	const empty = `<div style="padding:24px 18px;font:400 12.5px/1.5 system-ui;color:#969ba4">No agents match this filter.</div>`;
	return `<div class="screen">
	<div class="scr-head"><div><h2 class="scr-title">Agents</h2><div class="scr-sub">Documents talking to documents &mdash; running quietly in the background.</div></div><div style="margin-left:auto;display:flex;align-items:center;gap:8px"><button class="btn-ghost">&#65291; New agent</button><button class="btn-primary" data-msg="runProject">&#10022; Run Across the Project</button></div></div>
	<div class="scr-body">
		<div style="max-width:1040px;margin:0 auto;padding:24px 28px 80px">
			<div style="display:flex;gap:6px;margin-bottom:16px">${chip('all', `All &middot; ${counts.all}`)}${chip('scheduled', `Scheduled &middot; ${counts.scheduled}`)}${chip('event', `Event &middot; ${counts.event}`)}${chip('needs-approval', `Needs approval &middot; ${counts.needs}`, true)}</div>
			<div style="background:#fff;border:1px solid #e9eaee;border-radius:12px;overflow:hidden">
				<div style="display:flex;align-items:center;padding:11px 18px;background:#f8f9fb;border-bottom:1px solid #eef0f3;font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em;color:#a3a8b2"><div style="flex:2.4">AGENT</div><div style="flex:1.4">TRIGGER</div><div style="flex:2.6">FLOW</div><div style="flex:1.3">LAST RUN</div><div style="flex:1.4">STATUS</div></div>
				${rows || empty}
			</div>
			<div style="margin-top:14px;font:400 12px/1.5 'JetBrains Mono',ui-monospace,monospace;color:#bcc0c8">Tip: open an agent to see its flow on the canvas, then Run now.</div>
		</div>
	</div>
</div>`;
}

// The workflow canvas renders the agent as the loop (spec 5): trigger -> sources -> agent -> verify
// gate -> policy gate -> documents -> review rail. Run state comes from the last run.
function renderAgentCanvas(agent: IAgentDef, state: IScreenState): string {
	const run = state.lastRun && state.lastRun.agentId === agent.id ? state.lastRun : undefined;
	const node = (label: string, sub: string, accent = false, tint = '#fff') => `<div style="flex:none;width:150px;background:${tint};border:1.5px solid ${accent ? ACCENT : '#e6e8ed'};border-radius:11px;padding:12px 13px;box-shadow:0 1px 3px rgba(0,0,0,.05)"><div style="font:600 12.5px/1.2 system-ui;color:#1a1c20">${label}</div><div style="font:400 10.5px/1.35 'JetBrains Mono',ui-monospace,monospace;color:#a3a8b2;margin-top:6px">${sub}</div></div>`;
	const arrow = `<div style="flex:none;align-self:center;color:#c2c8d4;font-size:18px">&#8594;</div>`;
	const stages = [
		node('Trigger', triggerLabel(agent.trigger), true),
		arrow,
		node('Sources', agent.flow.sources.length ? agent.flow.sources.map(base).join('<br>') : 'workspace sources'),
		arrow,
		node(esc(agent.name), 'read &middot; diff &middot; rewrite'),
		arrow,
		node('Verify', 'Financial &middot; Strategy &middot; Formatting', true, '#f7f9ff'),
		arrow,
		node('Policy gate', esc(agent.policy), true, '#f7f9ff'),
		arrow,
		node('Documents', agent.flow.docs.length ? agent.flow.docs.map(base).join('<br>') : 'workspace docs'),
		arrow,
		node('Review rail', run ? `${run.queued} queued` : 'awaiting run', true, '#fdf6e9'),
	].join('');
	let banner = '';
	if (run) {
		banner = run.blocked
			? `<div style="flex:none;display:flex;align-items:center;gap:10px;padding:11px 24px;background:#fdecec;border-bottom:1px solid #f3c9c6;font:500 12.5px/1.4 system-ui;color:#b4332f"><span style="width:8px;height:8px;border-radius:50%;background:#b4332f"></span>Blocked at the verify gate &middot; ${esc(run.blocked)}</div>`
			: `<div style="flex:none;display:flex;align-items:center;gap:10px;padding:11px 24px;background:#fdf6e9;border-bottom:1px solid #f0e2c4;font:500 12.5px/1.4 system-ui;color:#9a6b16"><span style="width:8px;height:8px;border-radius:50%;background:oklch(0.66 0.16 45)"></span>Run complete &middot; ${run.applied} figure update${run.applied === 1 ? '' : 's'} applied &middot; ${run.queued} change${run.queued === 1 ? '' : 's'} queued<button data-msg="goReview" style="margin-left:auto;border:none;background:none;font:600 12.5px/1 system-ui;color:${ACCENT_DK};cursor:pointer">Review &#8594;</button></div>`;
	}
	return `<div class="screen">
	<div style="flex:none;display:flex;align-items:center;gap:14px;padding:13px 24px;border-bottom:1px solid #eef0f3">
		<button class="btn-ghost" data-msg="closeAgent">&#8592; Agents</button>
		<div><div style="display:flex;align-items:center;gap:8px"><span style="color:${ACCENT}">${AGENT_ICON[agent.trigger.kind] ?? '&#9679;'}</span><h2 style="margin:0;font:600 16px/1.2 system-ui;color:#15171c">${esc(agent.name)}</h2></div><div style="font:400 11.5px/1 'JetBrains Mono',ui-monospace,monospace;color:#a3a8b2;margin-top:4px">${triggerLabel(agent.trigger)} &middot; ${esc(agent.policy)}</div></div>
		<div style="margin-left:auto;display:flex;align-items:center;gap:12px">${statusBadge(agent.status)}<button data-msg="runWf" data-arg="${esc(agent.id)}" style="border:none;border-radius:8px;padding:9px 16px;background:oklch(0.55 0.14 150);color:#fff;font:600 13px/1 system-ui;cursor:pointer">&#9654; Run now</button></div>
	</div>
	${banner}
	<div style="flex:1;overflow:auto;background:#f8f9fb;background-image:radial-gradient(#e2e6ee 1px,transparent 1px);background-size:22px 22px">
		<div style="display:flex;align-items:stretch;gap:8px;padding:40px 28px;min-width:max-content">${stages}</div>
		<div style="padding:0 28px 40px;font:400 12px/1.5 'JetBrains Mono',ui-monospace,monospace;color:#bcc0c8">The loop: trigger &#8594; sources &#8594; agent &#8594; verify gate &#8594; policy gate &#8594; documents &#8594; review rail.</div>
	</div>
</div>`;
}


// ---- Project-wide agent run (C4, the ceiling surface). One instruction fans out across every
// document in the project. This iteration (plan 23 iter 2) builds the reachable, TRUTHFUL SHELL:
// the 48px run topbar, the command strip (avatar + instruction in reading type + source chip +
// `Whole project` pill), a truthful idle body when no run is active, and the bottom-bar route stub.
// The decisions column (23.4) and the sub-agent swarm grid (23.3) are deliberately NOT built yet -
// the placeholder region below says so honestly rather than showing the comp's illustrative
// 38-changes / 24-doc ISMS numbers (real-data guardrail, plan-17 "never fabricate"). ----
function renderProjectRun(state: IScreenState): string {
	const run = state.projectRun;
	const folderName = state.folderName ?? 'Project';
	const projectAv = avatar(folderName);

	// The 48px run topbar: navy project avatar + name crumb + `Agent run` label + a Live pulse pill
	// only while the fan-out is genuinely in flight (isChatBusy). No live run => no Live pill.
	const livePill = run?.inFlight
		? `<span style="display:inline-flex;align-items:center;gap:6px;background:#f4f5fd;border:1px solid #e0e5fb;border-radius:999px;padding:3px 10px;font:600 11.5px/1 system-ui;color:#4650b8"><span style="width:6px;height:6px;border-radius:50%;background:${ACCENT};animation:lwdPulse 1.6s ease-in-out infinite"></span>Live</span>`
		: '';
	const runTopBar = `<div style="height:48px;flex:none;display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid #e9eaee;background:#fbfbfc">
		<span style="width:20px;height:20px;border-radius:6px;background:#3b4d8f;display:flex;align-items:center;justify-content:center;color:#fff;font:600 10px/1 system-ui">${projectAv.text}</span>
		<span style="font:600 13px/1 system-ui;color:#1a1c20">${esc(folderName)}</span><span style="color:#cfd3da">/</span>
		<span style="display:inline-flex;align-items:center;gap:7px;font:500 13px/1 system-ui;color:#5661c9">&#10022; Agent run</span>
		${livePill}
	</div>`;

	// The command strip (C4): 32px accent avatar + the instruction in reading type + the attached
	// source chip + a `Whole project` pill. When there is a live/last run, show its REAL instruction
	// + source; otherwise the strip reflects the idle state with a calm prompt (no fabricated ISMS copy).
	const sourceChip = run?.source
		? `<span style="font:500 12.5px/1 'JetBrains Mono',ui-monospace,monospace;color:#4650b8;background:#f4f5fd;border:1px solid #e0e5fb;border-radius:6px;padding:2px 8px">${esc(run.source)}</span>`
		: '';
	const instruction = run?.instruction
		? `${sourceChip ? 'From ' + sourceChip + ', ' : ''}&ldquo;${esc(run.instruction)}&rdquo;`
		: 'No project run in progress. Start one from Agents or ask across the whole project in Chat.';
	const instructionColor = run?.instruction ? '#26292f' : '#868b95';
	const commandStrip = `<div style="flex:none;padding:18px 28px;border-bottom:1px solid #eef0f3;display:flex;align-items:center;gap:16px">
		<span style="width:32px;height:32px;border-radius:50%;background:${ACCENT};color:#fff;display:flex;align-items:center;justify-content:center;font:600 12px/1 system-ui;flex:none">TS</span>
		<div style="flex:1;font:400 18px/1.4 system-ui;color:${instructionColor}">${instruction}</div>
		<span style="flex:none;font:600 12.5px/1 system-ui;color:#fff;background:${ACCENT};border-radius:8px;padding:8px 14px">Whole Project</span>
	</div>`;

	// Truthful idle body (guardrail): no fabricated numbers, shown only when no run has started.
	const idleBody = `<div style="flex:1;overflow:auto;background:#f8f9fb;display:flex;align-items:center;justify-content:center;padding:40px">
		<div style="text-align:center;max-width:460px">
			<div style="width:44px;height:44px;margin:0 auto 16px;border-radius:12px;background:#f4f5fd;border:1px solid #e0e5fb;display:flex;align-items:center;justify-content:center;font-size:20px;color:${ACCENT}">&#10022;</div>
			<h2 style="margin:0 0 10px;font:600 18px/1.3 system-ui;color:#1a1c20">No project run in progress</h2>
			<p style="margin:0 0 22px;font:400 14px/1.6 system-ui;color:#696e78">Start one from Agents or ask across the whole project in Chat. The sub-agent swarm and the decisions the agent understands will appear here as the run proceeds.</p>
			<button data-msg="goAgents" style="border:none;border-radius:10px;padding:11px 20px;background:${ACCENT};color:#fff;font:600 13px/1 system-ui;cursor:pointer">Go to Agents</button>
		</div>
	</div>`;

	// The live fan-out body (C4): the decisions-understood rail (a truthful 23.4 placeholder for now)
	// on the left, and the sub-agent swarm grid + progress bar on the right - all from REAL run data.
	const summary = run?.summary;
	const workingSet = new Set(run?.working ?? []);
	const runBody = summary
		? `<div style="flex:1;display:flex;overflow:hidden;min-height:0">
		${decisionsRail(run?.decisions ?? [], run?.source, !!run?.inFlight)}
		${swarmPane(summary, workingSet)}
	</div>`
		: idleBody;

	// Bottom-bar totals. When a run is active they read from the REAL summary (`summariseProjectRun`) +
	// the live working count; idle shows honest zeros. The primary "Review across the project" opens the
	// cross-document review screen (C5) on the first changed doc - handled by `reviewProject` in screenEditor.
	const changed = summary?.totalChanges ?? 0;
	const changedDocs = summary?.changedDocs ?? 0;
	const workingCount = summary ? workingSet.size : 0;
	// Unchanged = documents that have settled with no change. While the run is live, a working tile has
	// not settled yet, so it is not counted as unchanged; the selector's unchangedDocs includes them, so
	// subtract the live working count to keep the three buckets (changed + working + unchanged) truthful.
	const unchangedDocs = summary ? Math.max(0, summary.unchangedDocs - workingCount) : 0;
	const numeral = (n: number) => `<strong style="font:500 20px/1 system-ui;color:#14161a">${n}</strong>`;
	const bottomBar = `<div style="flex:none;height:66px;border-top:1px solid #eef0f3;background:#fbfbfc;display:flex;align-items:center;padding:0 28px;gap:18px">
		<span style="font:400 14px/1 system-ui;color:#3a3f49">${numeral(changed)} changes proposed in ${numeral(changedDocs)} documents</span>
		<span style="font:400 13px/1 system-ui;color:#a3a8b2">&middot; ${workingCount} working &middot; ${unchangedDocs} unchanged</span>
		<button data-msg="reviewProject" style="margin-left:auto;font:600 14px/1 system-ui;color:#fff;background:${ACCENT};border:none;border-radius:10px;padding:12px 22px;cursor:pointer">Review Across the Project &#8594;</button>
	</div>`;

	return `<div class="screen">${runTopBar}${commandStrip}${runBody}${bottomBar}</div>`;
}

// The left "decisions understood" rail (360px, C4 left column, plan 23.4). One card per decision the
// agent extracted, grouped from the REAL pending changes by their source grounding (`groupDecisions`).
// Each card shows the decision (the verbatim source quote in reading type), a source chip
// (`transcript . line N`, mono - the line is OMITTED when unknown so nothing is fabricated) and
// `-> N documents affected` (distinct docs sharing that decision). When the run is still in flight and
// nothing has grounded yet, a calm reading state; when a run produced changes but the model gave no
// grounding, the cards degrade honestly (grouped by rationale, no line chip).
function decisionsRail(decisions: readonly IDecisionGroup[], source: string | undefined, inFlight: boolean): string {
	// The source label for the chip: the attached source name (e.g. `Security Review - 3 Mar.txt`),
	// else the neutral `transcript`. Kept short so the mono chip does not wrap.
	const sourceName = source ? esc(source) : 'transcript';
	// Header carries a count when decisions exist ("6 decisions understood"), matching the comp's
	// "N decisions understood"; the idle/empty state keeps the bare label.
	const count = decisions.length;
	const headerLabel = count ? `${count} ${count === 1 ? 'decision' : 'decisions'} understood` : 'Decisions understood';
	const header = `<div style="font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#5661c9;margin-bottom:16px">${headerLabel}</div>`;
	const shell = (body: string) => `<div style="width:360px;flex:none;border-right:1px solid #eef0f3;background:#fafbfc;padding:22px;overflow:hidden;display:flex;flex-direction:column">${header}${body}</div>`;

	if (!decisions.length) {
		const message = inFlight
			? 'Reading the source and extracting the decisions across the project&hellip;'
			: 'No decisions were grounded in the source for this run.';
		return shell(`<div style="flex:1;display:flex;align-items:center;justify-content:center;text-align:center;color:#a3a8b2">
			<p style="margin:0;font:400 13px/1.6 system-ui;max-width:240px">${message}</p>
		</div>`);
	}

	// One card per decision, matching the comp's structure: the source chip on top (`transcript .
	// line N`, mono), then the decision in reading type, then `-> N documents affected` in accent. The
	// line clause and whole chip are dropped when the decision has no verified line / grounding (the
	// honest degrade) - never a fabricated line. Reading type stays UI sans per handoff Part B/F
	// (decision 4b: the handoff wins over the comp's Newsreader serif - a deliberate, logged departure).
	const cards = decisions.map(d => {
		const chip = d.grounded
			? `<div style="font:400 11px/1 'JetBrains Mono',ui-monospace,monospace;color:#5661c9;margin-bottom:7px">${sourceName}${typeof d.sourceLine === 'number' ? ` &middot; line ${d.sourceLine}` : ''}</div>`
			: '';
		const docs = d.docsAffected;
		return `<div style="background:#fff;border:1px solid #e6e8ec;border-radius:13px;padding:15px 16px">
			${chip}
			<div style="font:400 15.5px/1.4 system-ui;color:#1a1c20;margin-bottom:10px">${esc(d.quote)}</div>
			<div style="font:600 12px/1 system-ui;color:#4650b8">&#8594; ${docs} ${docs === 1 ? 'document' : 'documents'} affected</div>
		</div>`;
	}).join('');
	return shell(`<div style="flex:1;overflow:auto;min-height:0;display:flex;flex-direction:column;gap:12px">${cards}</div>`);
}

// The right sub-agent swarm pane (C4): a progress header + bar, then a 4-column grid of one tile per
// project document. Every tile's status comes from the REAL run: `changed` (accent tint + check +
// `N changes`) from `summariseProjectRun`, `working` (spinner + `reviewing...`) layered on live while
// the fan-out is in flight, and settled `no-change` (muted `no change`). Nothing is fabricated.
function swarmPane(summary: IProjectRunSummary, working: ReadonlySet<string>): string {
	const total = summary.tiles.length;
	// A document is "done" once it has settled - it is no longer in the live working set. Progress counts
	// settled docs (X) against the whole project (Y), matching the comp's "21 / 24 done".
	const done = summary.tiles.filter(t => !working.has(t.docId)).length;
	const pct = total > 0 ? Math.round((done / total) * 100) : 0;
	const busy = working.size > 0;
	const heading = busy
		? `<span style="font:600 15px/1 system-ui;color:#1a1c20">Orchestrating ${total} sub-agents</span><span style="font:400 13px/1 system-ui;color:#a3a8b2">reading every document in parallel</span>`
		: `<span style="font:600 15px/1 system-ui;color:#1a1c20">${total} sub-agents finished</span><span style="font:400 13px/1 system-ui;color:#a3a8b2">every document read across the project</span>`;
	const progress = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">${heading}<span style="margin-left:auto;font:400 12px/1 'JetBrains Mono',ui-monospace,monospace;color:#52575f">${done} / ${total} done</span></div>
		<div style="height:5px;background:#e9eaee;border-radius:3px;margin-bottom:18px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${ACCENT};border-radius:3px"></div></div>`;
	const tiles = summary.tiles.map(t => swarmTile(t.docId, t.docTitle, t.status, t.changeCount, working.has(t.docId))).join('');
	return `<div style="flex:1;overflow:hidden;padding:22px 28px;display:flex;flex-direction:column">
		${progress}
		<div style="flex:1;display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:1fr;gap:9px;overflow:auto">${tiles}</div>
	</div>`;
}

// One document tile. The live `isWorking` overlay wins over the selector's changed/no-change status so
// an in-flight document reads as a spinning sub-agent even before its edits (if any) have landed.
function swarmTile(_docId: string, title: string, status: 'changed' | 'no-change' | 'working', count: number, isWorking: boolean): string {
	const name = esc(title);
	const nameStyle = 'font:500 11.5px/1.2 system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
	if (isWorking || status === 'working') {
		return `<div style="background:#fff;border:1.5px solid #c9cff5;border-radius:10px;padding:10px 11px;display:flex;flex-direction:column;justify-content:space-between">
			<div style="display:flex;align-items:center;gap:6px"><span style="width:11px;height:11px;border:2px solid #c9cff5;border-top-color:${ACCENT};border-radius:50%;animation:lwdSpin .8s linear infinite;flex:none"></span><span style="${nameStyle};color:#26292f">${name}</span></div>
			<span style="font:400 10.5px/1 'JetBrains Mono',ui-monospace,monospace;color:#a3a8b2;font-style:italic">reviewing&hellip;</span>
		</div>`;
	}
	if (status === 'changed') {
		return `<div style="background:#f4f5fd;border:1px solid #e0e5fb;border-radius:10px;padding:10px 11px;display:flex;flex-direction:column;justify-content:space-between">
			<div style="display:flex;align-items:center;gap:6px"><span style="color:#2c8159;font-size:11px">&#10003;</span><span style="${nameStyle};color:#26292f">${name}</span></div>
			<span style="font:600 10.5px/1 'JetBrains Mono',ui-monospace,monospace;color:#4650b8">${count} ${count === 1 ? 'change' : 'changes'}</span>
		</div>`;
	}
	return `<div style="background:#fafbfc;border:1px solid #eceef2;border-radius:10px;padding:10px 11px;display:flex;flex-direction:column;justify-content:space-between">
		<div style="display:flex;align-items:center;gap:6px"><span style="color:#cfd3da;font-size:12px">&middot;</span><span style="${nameStyle};color:#a3a8b2">${name}</span></div>
		<span style="font:400 10.5px/1 'JetBrains Mono',ui-monospace,monospace;color:#cfd3da">no change</span>
	</div>`;
}


// ---- Cross-document review (C5, plan 24). A SECOND presentation of the existing review model at
// project scale: the live pending changes (getAllPending) grouped by document. Left = a 292px doc-nav
// rail (count header + progress bar + one row per changed doc with a check "reviewed" / filled-dot
// "current" / hollow-dot "pending" glyph + count); centre = the current document's change cards, each
// showing the change in context, a `decision . line NN` source chip, and a filled-dot "High" / half-dot
// "Inferred" confidence chip (D24-A). Accept / Tweak / Reject per card and the sticky bar (Accept all here /
// Next / Accept all remaining) post messages the editor routes to the EXISTING engine
// (approve/reject/approveAll/approveAllPending); the C6 Review rail consumes the same model and stays in sync.
function renderReviewProject(state: IScreenState): string {
	const rp = state.reviewProject;
	const pending = rp?.pending ?? [];
	const groups = groupPendingByDoc(pending);
	const folderName = rp?.folderName ?? 'Project';
	const projectAv = avatar(folderName);
	const reviewed = rp?.reviewedDocs ?? [];

	// The 48px topbar: project avatar + name crumb + `Review project update` + the attached source pill.
	// The right side reports the session totals from the reviewed set - honest zeros when nothing has been
	// reviewed yet. `Accept All Remaining` -> approveAllPending() (posts `reviewAcceptAllRemaining`); shown
	// only while something is still pending.
	const sourcePill = rp?.source
		? `<span style="font:500 11.5px/1 'JetBrains Mono',ui-monospace,monospace;color:#5661c9;background:#f4f5fd;border:1px solid #e0e5fb;border-radius:999px;padding:4px 10px">${esc(rp.source)}</span>`
		: '';
	const totalRemaining = pending.length;
	const acceptRemaining = totalRemaining
		? `<button data-msg="reviewAcceptAllRemaining" style="font:600 12.5px/1 system-ui;color:#5661c9;background:#fff;border:1px solid #d9d7fb;border-radius:9px;padding:7px 13px;cursor:pointer">Accept All Remaining (${totalRemaining})</button>`
		: '';
	const topBar = `<div style="height:48px;flex:none;display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid #e9eaee;background:#fbfbfc">
		<span style="width:20px;height:20px;border-radius:6px;background:#3b4d8f;display:flex;align-items:center;justify-content:center;color:#fff;font:600 10px/1 system-ui">${projectAv.text}</span>
		<span style="font:600 13px/1 system-ui;color:#1a1c20">${esc(folderName)}</span><span style="color:#cfd3da">/</span><span style="font:500 13px/1 system-ui;color:#868b95">Review project update</span>
		${sourcePill}
		<div style="margin-left:auto;display:flex;align-items:center;gap:12px"><span style="font:400 13px/1 system-ui;color:#a3a8b2">${reviewed.length} reviewed</span>${acceptRemaining}</div>
	</div>`;

	// The end-state: nothing pending. Honest copy - the celebratory "All changes reviewed" only when a
	// review actually happened this session (docs were actioned to zero); otherwise the calm idle state.
	if (!groups.length) {
		const didReview = reviewed.length > 0;
		const glyph = didReview ? '&#10003;' : '&#9679;';
		const heading = didReview ? 'All changes reviewed' : 'Nothing waiting';
		const body = didReview
			? `Every proposed change across ${reviewed.length} document${reviewed.length === 1 ? '' : 's'} has been actioned. Nothing is left to review.`
			: 'No changes are waiting across the project. Run an agent across the project to propose updates.';
		return `<div class="screen">${topBar}<div style="flex:1;display:flex;align-items:center;justify-content:center;background:#f8f9fb;padding:40px">
			<div style="text-align:center;max-width:420px">
				<div style="width:44px;height:44px;margin:0 auto 16px;border-radius:12px;background:#eef7f0;border:1px solid #d7ecdc;display:flex;align-items:center;justify-content:center;font-size:20px;color:#2c8159">${glyph}</div>
				<h2 style="margin:0 0 10px;font:600 18px/1.3 system-ui;color:#1a1c20">${heading}</h2>
				<p style="margin:0;font:400 14px/1.6 system-ui;color:#696e78">${body}</p>
			</div>
		</div></div>`;
	}

	// The current document = the selected doc if it still has changes, else the first changed doc. This
	// is local screen navigation (clicking a rail row posts `reviewDoc`), not an engine action.
	const current = groups.find(g => g.docId === rp?.currentDocId) ?? groups[0];
	const currentIndex = groups.findIndex(g => g.docId === current.docId);

	return `<div class="screen">${topBar}<div style="flex:1;display:flex;overflow:hidden;min-height:0">${reviewRail(groups, current.docId, reviewed)}${reviewColumn(current.changes, current.docId, current.docTitle, currentIndex, groups)}</div></div>`;
}

// The 292px doc-nav rail (C5): a header count `N docs . M changes`, a green progress bar (reviewed /
// total docs seen this session), then one row per document WITH pending changes. Each row carries a
// status glyph - check "reviewed" (a doc reviewed this session, now 0 pending - only ever appears once a
// doc empties, so in a fresh run every changed doc is hollow-dot "pending" or filled-dot "current"),
// filled-dot "current" (the selected doc, accent tint + 3px accent bar), hollow-dot "pending" (still has
// changes, not selected) - and its count.
function reviewRail(groups: readonly { docId: string; docTitle: string; changes: readonly IProposedChange[] }[], currentDocId: string, reviewed: readonly IReviewedDoc[]): string {
	const changeTotal = groups.reduce((n, g) => n + g.changes.length, 0);
	const docTotal = groups.length + reviewed.length;
	const reviewedCount = reviewed.length;
	const pct = docTotal > 0 ? Math.round((reviewedCount / docTotal) * 100) : 0;
	const header = `<div style="padding:17px 18px;border-bottom:1px solid #eef0f3">
		<div style="font:600 13px/1 system-ui;color:#1a1c20;margin-bottom:10px">${docTotal} document${docTotal === 1 ? '' : 's'} &middot; ${changeTotal} change${changeTotal === 1 ? '' : 's'}</div>
		<div style="height:5px;background:#e9eaee;border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:oklch(0.6 0.13 150);border-radius:3px"></div></div>
		<div style="font:400 11.5px/1 system-ui;color:#a3a8b2;margin-top:7px">${reviewedCount} of ${docTotal} reviewed</div>
	</div>`;

	// Reviewed docs (0 pending) come first as muted check rows showing the HUMAN title (not the docId URI),
	// then the still-pending docs. A reviewed doc has no changes left, so it is not in `groups` - it shows
	// here once the editor derives it (a seen doc, now zero pending) via `reviewedDocsFromSeen`.
	const reviewedRows = reviewed.map(r => `<div style="display:flex;align-items:center;gap:9px;padding:8px 10px">
		<span style="color:#2c8159;font-size:12px;width:13px;text-align:center">&#10003;</span>
		<span style="font:500 12px/1 system-ui;color:#a3a8b2;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.title)}</span>
	</div>`).join('');

	const rows = groups.map(g => {
		const isCurrent = g.docId === currentDocId;
		const count = g.changes.length;
		if (isCurrent) {
			return `<div data-msg="reviewDoc" data-arg="${esc(g.docId)}" style="display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:8px;background:#eef0fb;border:1px solid #e0e5fb;position:relative;cursor:pointer">
				<span style="position:absolute;left:0;top:7px;bottom:7px;width:3px;border-radius:3px;background:${ACCENT}"></span>
				<span style="width:13px;display:flex;justify-content:center"><span style="width:7px;height:7px;border-radius:50%;background:${ACCENT}"></span></span>
				<span style="font:600 12px/1 system-ui;color:#2a2f60;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.docTitle)}</span>
				<span style="font:600 11px/1 'JetBrains Mono',ui-monospace,monospace;color:#4650b8">${count}</span>
			</div>`;
		}
		return `<div data-msg="reviewDoc" data-arg="${esc(g.docId)}" style="display:flex;align-items:center;gap:9px;padding:8px 10px;cursor:pointer">
			<span style="color:#cfd3da;font-size:12px;width:13px;text-align:center">&#9675;</span>
			<span style="font:500 12px/1 system-ui;color:#3a3f49;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.docTitle)}</span>
			<span style="font:400 11px/1 'JetBrains Mono',ui-monospace,monospace;color:#868b95">${count}</span>
		</div>`;
	}).join('');

	return `<div style="width:292px;flex:none;background:#fafbfc;border-right:1px solid #e9eaee;display:flex;flex-direction:column;overflow:hidden">
		${header}
		<div style="flex:1;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:1px">${reviewedRows}${rows}</div>
	</div>`;
}

// The centre review column (C5): the current document's title + a per-change card list. Each card shows
// the change IN CONTEXT (old struck through -> new added, reusing the addition/removal tokens the rail +
// editor use; an insertion has no oldText so it renders as pure additions), a `decision . line NN` source
// chip (from sourceQuote/sourceLine, plan 23.4 - the line is OMITTED when unknown so nothing is
// fabricated), and a filled-dot "High" / half-dot "Inferred" confidence chip per D24-A. The bottom bar
// reports the still-attention count + the batch controls. All actions drive the EXISTING engine (24.2):
// `Accept All N Here` -> approveAll(docId), `Next` -> advance the current doc (nextPendingDocId), the
// per-card Accept/Reject/Tweak -> approve/reject/focusChange.
function reviewColumn(changes: readonly IProposedChange[], docId: string, docTitle: string, currentIndex: number, groups: readonly { docId: string; docTitle: string }[]): string {
	const total = groups.length;
	const eyebrow = `<div style="font:400 11px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#a3a8b2;margin-bottom:7px">Document ${currentIndex + 1} of ${total}</div>`;
	const cards = changes.map(reviewCard).join('');
	const inferredCount = changes.filter(c => reviewConfidence(c) === 'inferred').length;

	// `Next` advances to the next changed document; the label names it. Only shown when more than one
	// document still has changes (the editor computes the real target via nextPendingDocId when clicked).
	const next = groups[currentIndex + 1] ?? groups[0];
	const nextBtn = total > 1
		? `<button data-msg="reviewNext" data-arg="${esc(docId)}" style="font:600 13px/1 system-ui;color:#fff;background:#1a1c20;border:none;border-radius:9px;padding:10px 18px;cursor:pointer">Next: ${esc(next.docTitle)} &#8594;</button>`
		: '';
	const attention = inferredCount
		? `${inferredCount} change${inferredCount === 1 ? '' : 's'} need${inferredCount === 1 ? 's' : ''} your eyes`
		: 'All changes look confident';
	const bottomBar = `<div style="flex:none;height:64px;border-top:1px solid #eef0f3;background:#fafbfc;display:flex;align-items:center;padding:0 40px;gap:14px">
		<span style="font:400 13px/1 system-ui;color:#a3a8b2">${attention}</span>
		<div style="margin-left:auto;display:flex;gap:10px">
			<button data-msg="reviewAcceptAllHere" data-arg="${esc(docId)}" style="font:600 13px/1 system-ui;color:#52575f;background:#fff;border:1px solid #e0e2e8;border-radius:9px;padding:10px 16px;cursor:pointer">Accept All ${changes.length} Here</button>
			${nextBtn}
		</div>
	</div>`;

	return `<div style="flex:1;overflow:hidden;background:#fff;display:flex;flex-direction:column">
		<div style="flex:1;overflow:auto;padding:30px 40px 30px">
			<div style="max-width:720px">
				${eyebrow}
				<h1 style="font:600 28px/1.12 system-ui;letter-spacing:-.02em;color:#14161a;margin:0 0 3px">${esc(docTitle)}</h1>
				<p style="font:400 13.5px/1 system-ui;color:#868b95;margin:0 0 24px">${changes.length} change${changes.length === 1 ? '' : 's'} proposed &middot; review each in context</p>
				${cards}
			</div>
		</div>
		${bottomBar}
	</div>`;
}

// One change card. The prose renders the change in context: `newText` with the addition tokens, then
// `oldText` struck through with the removal tokens (an insertion has no oldText -> pure additions). Below,
// the source chip + confidence chip + Accept / Tweak / Reject wired to the engine (24.2). An `inferred`
// change gets the attention-tinted card (bg #fffdf8, border #e4dccb) + the amber half-dot chip.
function reviewCard(change: IProposedChange): string {
	const level = reviewConfidence(change);
	const inferred = level === 'inferred';
	const cardStyle = inferred
		? 'border:1px solid #e4dccb;border-radius:13px;padding:16px 18px;margin-bottom:13px;background:#fffdf8'
		: 'border:1px solid #e6e8ec;border-radius:13px;padding:16px 18px;margin-bottom:13px';

	// The change in context: removal (struck) then addition. Additions use the `ok` tokens (#e9f6ee /
	// #2c8159); removals the `removed` tokens (#fbeeee / #b5514b strike). An insertion (`insert`) has no
	// oldText, so only the addition renders. Text is escaped - this is prose, not markup.
	const removal = !change.insert && change.oldText.trim()
		? ` <span style="background:#fbeeee;color:#b5514b;text-decoration:line-through;text-decoration-color:#cf5a53;border-radius:3px;padding:0 3px">${esc(change.oldText)}</span>`
		: '';
	const addition = change.newText.trim()
		? `<span style="background:#e9f6ee;color:#2c8159;border-radius:3px;padding:0 3px">${esc(change.newText)}</span>`
		: '';
	const prose = `<p style="font:400 16px/1.7 system-ui;color:#26292f;margin:0 0 12px">${addition}${removal}</p>`;

	// The source chip: `decision . line NN` when a real line is known, else just `decision` (never a
	// fabricated line). The verbatim decision quote (sourceQuote), when present, is the chip's hover title.
	const hasLine = typeof change.sourceLine === 'number';
	const chipTitle = change.sourceQuote ? ` title="${esc(change.sourceQuote)}"` : '';
	const sourceChip = `<span${chipTitle} style="display:inline-flex;align-items:center;gap:5px;font:500 11px/1 'JetBrains Mono',ui-monospace,monospace;color:#5661c9;background:#f4f5fd;border:1px solid #e0e5fb;border-radius:999px;padding:4px 10px"><span style="width:5px;height:5px;border-radius:50%;background:${ACCENT}"></span>decision${hasLine ? ` &middot; line ${change.sourceLine}` : ''}</span>`;

	// The confidence chip (D24-A): filled-dot "High" (ok/accent) or half-dot "Inferred . needs your eyes" (attention).
	const confChip = inferred
		? `<span style="font:600 11px/1 system-ui;color:#8a6d1a;background:#fdfaf2;border:1px solid #e4dccb;border-radius:999px;padding:5px 10px">&#9680; Inferred &middot; needs your eyes</span>`
		: `<span style="font:600 11px/1 system-ui;color:#2c8159;background:#eef7f0;border:1px solid #d7ecdc;border-radius:999px;padding:5px 10px">&#9679; High</span>`;

	// Actions wired to the EXISTING engine (24.2): Accept -> approve(id), Reject -> reject(id), Tweak ->
	// open the change's document and focus its inline diff (focusChange). The editor resolves the docId
	// from the change id, so the card only carries the change id.
	const actions = `<div style="margin-left:auto;display:flex;gap:7px">
		<button data-msg="reviewAccept" data-arg="${esc(change.id)}" style="font:600 12px/1 system-ui;color:#fff;background:${ACCENT};border:none;border-radius:8px;padding:8px 14px;cursor:pointer">Accept</button>
		<button data-msg="reviewTweak" data-arg="${esc(change.id)}" style="font:600 12px/1 system-ui;color:#52575f;background:#fff;border:1px solid #e0e2e8;border-radius:8px;padding:8px 12px;cursor:pointer">Tweak</button>
		<button data-msg="reviewReject" data-arg="${esc(change.id)}" style="font:600 12px/1 system-ui;color:#a3a8b2;background:none;border:none;padding:8px 4px;cursor:pointer">Reject</button>
	</div>`;

	return `<div style="${cardStyle}">
		${prose}
		<div style="display:flex;align-items:center;gap:8px">${sourceChip}${confChip}${actions}</div>
	</div>`;
}
