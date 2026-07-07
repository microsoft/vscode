/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { IFigureChange, ISourcePeek } from '../common/livingDocs.js';
import { parseLivingDoc, reconcileBindLinks } from '../common/livingDocMarkdown.js';
import { ILivingDoc, IProposedChange, IReviewFraming, reviewFraming } from '../common/livingDocsModel.js';
import { buildPmDecorationSpec, IPmDiffSegment, IPmEditDecoration, IPmGutterMarker, IPmInsertDecoration, IPmProvenance } from '../common/livingDocPmDecorations.js';
import { PROSEMIRROR_BUNDLE_BASE64 } from './prosemirrorBundle.js';

// The vendored ProseMirror IIFE (decision 43) is shipped base64-encoded to keep the source ASCII +
// single-quoted (repo hygiene); decode it once, lazily, and reuse the decoded text on every render.
let _pmBundleCache: string | undefined;
function proseMirrorBundle(): string {
	if (_pmBundleCache === undefined) {
		_pmBundleCache = decodeBase64(PROSEMIRROR_BUNDLE_BASE64).toString();
	}
	return _pmBundleCache;
}

// The Markdown for the initial ProseMirror mount is embedded in the shell as a JSON-encoded global
// (`<` escaped so it can never break out of the script); the RUNTIME reads it on load. Any literal
// '</script' in the vendored bundle is defensively split when it is inlined into the shell.
function escapeForScript(text: string): string {
	return JSON.stringify(text).replace(/</g, '\\u003c');
}

// Bind links render as plain text - the resolved value is its own visible text, and the `bind:` URL
// is never shown to the reader (spec 3.2). A blue gutter dot marks the bound line instead.
const BIND_LINK_RE = /\[([^\]]*)\]\(bind:([^)\s]+)\)/g;
function bindToValue(text: string): string {
	return text.replace(BIND_LINK_RE, '$1');
}

const EMPTY_RESOLVED: ReadonlyMap<string, string> = new Map<string, string>();

// 'pm' = the unified ProseMirror surface - the single editing surface for EVERY document, plain and
// living (plan 15 iter 5 flipped the default and retired the bespoke renderDoc body); 'raw' = the
// Markdown textarea, reachable from the editor for hand-editing source.
export type LivingDocViewMode = 'raw' | 'pm';

// (plan 33 iter 4, L8) Present only offers what Abstract actually produces today: a self-contained
// HTML page and clean portable Markdown. The native-format / cloud destinations (Google Docs, Google
// Sheets, Word, Excel) are real product goals but not built yet, so they are shown honestly as "Soon"
// (non-selectable) rather than fabricating a format - the plan-17 rule against dead-end affordances.
export type PresentChoice = 'html' | 'markdown' | 'gdoc' | 'gsheet' | 'docx' | 'xlsx';

export interface IPresentState {
	readonly open: boolean;
	readonly choice: PresentChoice;
}

export interface ILivingDocRenderInput {
	readonly doc: ILivingDoc | undefined;
	readonly pending: readonly IProposedChange[];
	/** Resolved value per bind key; the visible cache is reconciled to these at render time (lock wins). */
	readonly resolved: ReadonlyMap<string, string>;
	/** True when a source changed since last sync/review ("may be affected"). */
	readonly dirty: boolean;
	readonly status: string;
	readonly recent: ReadonlySet<string>;
	readonly mode: LivingDocViewMode;
	readonly rawText: string;
	readonly present: IPresentState;
	/** The figure diff from the last "Sync across" (drives the synced banner). */
	readonly syncDiff: readonly IFigureChange[];
	/**
	 * When set, the in-surface source-peek pane is open (the comp's "Sync across" source panel): it
	 * renders to the LEFT of the document inside the one surface - never a second editor group.
	 */
	readonly sourcePeek?: ISourcePeekRender;
	/**
	 * The next document (other than this one) that still has pending changes, if any (plan 19 iter 4).
	 * Drives the editor action bar's "Next document with changes" button - shown only when there is
	 * somewhere to advance to. Computed by the editor pane (which sees workspace-wide pending).
	 */
	readonly nextChangedDocTitle?: string;
	/** Total pending changes across EVERY document (plan 19 iter 5) - drives "Approve all everywhere". */
	readonly totalPendingCount?: number;
	/**
	 * Per-bind-key provenance for the figure/gutter hover tooltip (plan 29, iter 3): where each bound value
	 * came from, when it synced, and whether it is still fresh. Built by the editor pane from the lock +
	 * freshness; empty for a plain (non-living) document. Real data only - never a fabricated sync state.
	 */
	readonly provenance?: readonly IPmProvenance[];
}

/** The source-peek data plus the editor-held sync state (the divider circle's synced confirmation). */
export interface ISourcePeekRender extends ISourcePeek {
	readonly synced: boolean;
	readonly syncedCount: number;
}

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Render generic Markdown (headings, paragraphs, lists, bold/italic, code, links) by reusing
// VS Code's own sanitizing renderer, so any plain .md shows real content instead of a blank page.
function renderGenericMarkdown(body: string): string {
	const rendered = renderMarkdown({ value: body });
	try {
		return rendered.element.innerHTML;
	} finally {
		rendered.dispose();
	}
}

const ACCENT = 'oklch(0.55 0.13 255)';

// Style and script are single left-aligned template literals so source indentation stays tab-only.
const STYLE = `*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#fff;color:#1a1c20;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.topbar{position:sticky;top:0;height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 16px 0 14px;border-bottom:1px solid #e9eaee;background:#fbfbfc;z-index:5}
.brand{display:flex;align-items:center;gap:10px;font:600 13px/1 system-ui;color:#2a2c32}
.logo{width:20px;height:20px;border-radius:6px;background:${ACCENT};color:#fff;display:flex;align-items:center;justify-content:center;font:600 11px/1 system-ui}
.sep{color:#c8cbd2}
.crumb{color:#868b95;font-weight:400}
.right{display:flex;align-items:center;gap:10px}
.pill{display:flex;align-items:center;gap:7px;font:500 11.5px/1 system-ui;color:#5d8a66;background:#eef7f0;border:1px solid #d7ecdc;border-radius:999px;padding:6px 11px;cursor:pointer}
.pill .dot{width:7px;height:7px;border-radius:50%;background:oklch(0.6 0.13 150)}
.pill.warn{color:#9a6b16;background:#fdf2dc;border-color:#f0e2c0}
.pill.warn .dot{background:oklch(0.66 0.16 45)}
.btn{border:none;border-radius:8px;padding:8px 14px;background:${ACCENT};color:#fff;font:600 12px/1 system-ui;cursor:pointer}
.av{flex:none;width:27px;height:27px;border-radius:50%;background:${ACCENT};color:#fff;font:600 11px/27px system-ui;text-align:center}
/* The PM proposal widgets (inline diff / insert) sit full-width in a .pcell column. */
.pcell{min-width:0}
/* A source-bound figure inline in the prose: the comp's faint-blue highlight + underline, so the reader
 * sees exactly which words are live (the PM bound_figure atom node renders as span.bound). Clicking one
 * peeks its source. */
.bound{background:rgba(80,110,235,.08);border-bottom:1.5px solid oklch(0.6 0.1 255);border-radius:2px;padding:0 2px;cursor:pointer}
.bound:hover{background:rgba(80,110,235,.16)}
/* The applied-flash keyframe is reused by the PM provenance gutter's recently-changed marker. */
@keyframes flash{0%{background:rgba(31,122,68,.34)}100%{background:rgba(31,122,68,.09)}}
/* Inline word-diff for a meaning-change, matching the hi-fi (edit-in-place, not a stacked block). */
.editblock{box-shadow:inset 2px 0 0 oklch(0.66 0.16 45);padding-left:14px}
.editp{margin:0 0 12px;font:400 16px/1.78 system-ui;color:#2c2f36}
.d-o{background:#fdecec;color:#b4332f;text-decoration:line-through;text-decoration-color:rgba(180,51,47,.5);border-radius:2px;padding:0 2px}
.d-n{background:#e7f6ec;color:#1f7a44;border-radius:2px;padding:0 2px}
/* A generative insertion proposed by Chat: all-additions (green left accent + green-tinted body). */
.insertblock{box-shadow:inset 2px 0 0 #1f7a44;padding-left:14px}
.insertbody{background:#f1faf4;border:1px solid #d7ecdc;border-radius:8px;padding:6px 14px;margin:0 0 2px}
.insertbody>:first-child{margin-top:6px}.insertbody>:last-child{margin-bottom:6px}
.cdot.add{background:#1f7a44}
.ctrl{display:flex;align-items:center;gap:10px;margin-top:13px;background:#fff;border:1px solid #eceef2;border-radius:9px;padding:9px 11px;flex-wrap:wrap}
.ctrl .cdot{width:7px;height:7px;border-radius:50%;background:oklch(0.66 0.16 45);flex:none}
.ctrl .lbl{font:500 12px/1.4 system-ui;color:#52575f}
.ctrl .src{font-family:'JetBrains Mono',ui-monospace,monospace;color:${ACCENT}}
.ctrl .add{color:#1f7a44}.ctrl .rem{color:#b4332f}
.ctrl .acts{margin-left:auto;display:flex;gap:7px}
.ctrl .approve{border:none;border-radius:7px;padding:8px 14px;background:${ACCENT};color:#fff;font:600 12px/1 system-ui;cursor:pointer}
.ctrl .approve:hover{background:oklch(0.5 0.13 255)}
.ctrl .reject{border:1px solid #e0e2e8;border-radius:7px;padding:8px 12px;background:#fff;color:#696e78;font:500 12px/1 system-ui;cursor:pointer}
.ctrl .reject:hover{background:#f4f5f7}
table.kpi{flex:1;border:1px solid #eceef2;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;font:400 13.5px/1 system-ui;margin-bottom:22px}
table.kpi th{background:#f8f9fb;font:600 11px/1 'JetBrains Mono',ui-monospace,monospace;color:#a3a8b2;letter-spacing:.04em;text-align:right;padding:10px 14px}
table.kpi th:first-child{text-align:left}
table.kpi td{border-top:1px solid #f1f2f5;padding:10px 14px;text-align:right}
table.kpi td:first-child{text-align:left;font-weight:500}
.up{color:#1f7a44}.down{color:#b4332f}
.empty{padding:60px;color:#9a9aa3;text-align:center}
.hint{max-width:720px;margin:0 auto;padding:0 40px 30px;font:400 12px/1.6 system-ui;color:#a3a8b2}
.toggle{border:1px solid #d9dae0;border-radius:8px;padding:7px 12px;background:#fff;color:#4a4c54;font:600 12px/1 system-ui;cursor:pointer}
.toggle:hover{background:#f4f4f6}
/* Persistent calm formatting toolbar (the comp's "Workbench v2" word-processor toolbar - formatting
 * essentials only): borderless heading dropdown + B/I/U + list/ordered/quote, with a quiet "Saved" status
 * on the right. Sticks just below the 48px top bar. No Link-to-source / Run-skill / History (the comp
 * dropped them to keep the editor calm). */
.etoolbar{position:sticky;top:48px;z-index:4;height:46px;flex:none;display:flex;align-items:center;gap:2px;padding:0 16px;border-bottom:1px solid #eef0f3;background:#fff}
.etoolbar select.tb-h{border:none;background:transparent;border-radius:7px;padding:7px 24px 7px 9px;font:500 12.5px/1 system-ui;color:#3a3f49;cursor:pointer}
.etoolbar select.tb-h:hover{background:#f4f5f7}
.etoolbar .tb-div{width:1px;height:18px;background:#eceef2;margin:0 8px}
.etoolbar .tb-b{width:30px;height:30px;border:none;background:transparent;border-radius:7px;color:#52575f;cursor:pointer}
.etoolbar .tb-b:hover{background:#f4f5f7}
.etoolbar .tb-b.bold{font:700 13px/1 system-ui}
.etoolbar .tb-b.ital{font:400 13px/1 system-ui;font-style:italic}
.etoolbar .tb-b.ic{font:400 14px/1 system-ui}
.etoolbar .tb-saved{margin-left:auto;display:flex;align-items:center;gap:7px;font:400 11px/1 'JetBrains Mono',ui-monospace,monospace;color:#bcc0c8}
.etoolbar .tb-saved .sdot{width:6px;height:6px;border-radius:50%;background:oklch(0.6 0.13 150)}
/* Floating review bar (plan 19 iter 7): a calm affordance that floats DIRECTLY BELOW the formatting
 * toolbar - never inside the WYSIWYG header - and is present ONLY while there are pending changes in this
 * or another document. It sticks under the sticky topbar (top:48px, h48) + formatting toolbar (top:48px,
 * h46) at top:94px, spans the full document width, and reads as its own affordance via a warm amber tint
 * + soft elevation so it is distinct from the grey formatting chrome. When the last change is approved the
 * bar simply disappears (no persistent end state) - that disappearance is the "done" signal. */
.reviewbar{position:sticky;top:94px;z-index:5;display:flex;align-items:center;gap:8px;padding:9px 16px;border-bottom:1px solid oklch(0.9 0.05 75);background:oklch(0.985 0.02 75);box-shadow:0 6px 16px -6px rgba(120,90,20,.18)}
.reviewbar .rv-spacer{flex:1}
.reviewbar .rv-count{font:500 11.5px/1 system-ui;color:#9a6b16;background:oklch(0.97 0.04 75);border:1px solid oklch(0.9 0.05 75);border-radius:999px;padding:5px 9px}
.reviewbar .rv-clear{display:flex;align-items:center;gap:8px;font:500 12px/1 system-ui;color:#1f7a44}
.reviewbar .rv-tick{width:15px;height:15px;border-radius:50%;background:oklch(0.6 0.13 150);color:#fff;display:flex;align-items:center;justify-content:center;font:700 9px/1 system-ui}
.reviewbar .rv-next{border:1px solid #e6dcc2;border-radius:7px;padding:7px 11px;background:#fff;color:#52575f;font:500 12px/1 system-ui;cursor:pointer;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.reviewbar .rv-next:hover{background:#fbf7ee}
.reviewbar .rv-all{border:1px solid #e6dcc2;border-radius:7px;padding:7px 11px;background:#fff;color:#52575f;font:500 12px/1 system-ui;cursor:pointer}
.reviewbar .rv-all:hover{background:#fbf7ee}
.reviewbar .rv-approve{border:none;border-radius:7px;padding:7px 13px;background:${ACCENT};color:#fff;font:600 12px/1 system-ui;cursor:pointer}
.reviewbar .rv-approve:hover{background:oklch(0.5 0.13 255)}
.hint-raw{border:none;background:none;padding:0;margin-left:5px;color:#8a93c4;font:500 12px/1.6 system-ui;cursor:pointer;text-decoration:underline}
.hint-raw:hover{color:oklch(0.5 0.13 255)}
/* Source-peek / Sync-across banner. */
.syncbar{display:flex;align-items:center;gap:8px;margin:14px 16px 0;padding:9px 13px;border:1px solid #f0e2c4;background:#fdf6e9;border-radius:9px;font:500 12px/1.4 system-ui;color:#9a6b16}
.syncbar.done{border-color:#d7ecdc;background:#eef7f0;color:#1f5a36}
.syncbar .sb-spacer{flex:1}
.syncbar .sb-btn{border:none;border-radius:7px;padding:7px 12px;background:oklch(0.55 0.13 255);color:#fff;font:600 11.5px/1 system-ui;cursor:pointer}
.syncbar .sb-btn:hover{background:oklch(0.5 0.13 255)}
.syncbar .sb-diff{font:500 11px/1.5 'JetBrains Mono',ui-monospace,monospace}
/* In-surface source drawer (the comp's "Workbench v2" bottom overlay): slides up over the bottom of the
 * doc, full-width, so the document is NEVER split into a side-by-side pane. The sync action is the drawer
 * header's primary button (no floating divider circle). Fixed to the webview viewport so it overlays. */
.srcdrawer{position:fixed;left:0;right:0;bottom:0;height:52%;z-index:25;display:flex;flex-direction:column;background:#fff;border-top:1px solid #e6e8ed;box-shadow:0 -14px 36px rgba(20,30,60,.12)}
.srcdrawer .sd-grip{flex:none;display:flex;justify-content:center;padding:7px 0 0}
.srcdrawer .sd-grip span{width:34px;height:4px;border-radius:999px;background:#e1e4ea}
.srcdrawer .sd-head{height:46px;flex:none;display:flex;align-items:center;gap:10px;padding:0 18px;border-bottom:1px solid #f1f2f5}
.srcdrawer .sd-name{font:600 12.5px/1 'JetBrains Mono',ui-monospace,monospace;color:#52575f;flex:none}
.srcdrawer .sd-meta{font:400 10.5px/1 'JetBrains Mono',ui-monospace,monospace;color:#a3a8b2;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.srcdrawer .sd-actions{flex:none;display:flex;align-items:center;gap:8px}
.srcdrawer .sd-sync{display:flex;align-items:center;gap:6px;border:none;border-radius:8px;padding:8px 12px;background:oklch(0.55 0.13 255);color:#fff;font:600 12px/1 system-ui;cursor:pointer;white-space:nowrap}
.srcdrawer .sd-sync:hover{background:oklch(0.5 0.13 255)}
.srcdrawer .sd-synced{display:flex;align-items:center;gap:6px;border:1px solid #c5e7d0;background:#e7f6ec;border-radius:8px;padding:8px 12px;font:600 12px/1 system-ui;color:#1f7a44;white-space:nowrap}
.srcdrawer .sd-x{border:none;background:none;color:#9aa0aa;font-size:15px;cursor:pointer;padding:4px 6px}
.srcdrawer .sd-x:hover{color:#52575f}
.srcdrawer .sd-body{flex:1;overflow:auto;padding:16px 18px}
.srcdrawer table{width:100%;border-collapse:collapse;font:400 12px/1.5 'JetBrains Mono',ui-monospace,monospace}
.srcdrawer th{text-align:left;padding:7px 9px;font-weight:600;color:#a3a8b2;border-bottom:1px solid #e9eaee}
.srcdrawer td{padding:6px 9px;border-bottom:1px solid #f4f5f7;color:#2c2f36}
.srcdrawer tr.sel td{background:#fef6e9;box-shadow:inset 2px 0 0 oklch(0.66 0.16 45);font-weight:600}
.srcdrawer .sp-sec{font:600 9.5px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em;color:#a3a8b2;text-transform:uppercase;margin:2px 0 7px}
.srcdrawer .sp-sec:not(:first-child){margin-top:16px}
.srcdrawer table.sp-grid{font-size:11.5px}
.srcdrawer table.sp-grid th,.srcdrawer table.sp-grid td{padding:5px 7px;white-space:nowrap}
.srcdrawer .sp-refs{margin-top:18px;border-top:1px solid #eef0f3;padding-top:14px}
.srcdrawer .sp-refs-h{font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.08em;color:#a3a8b2;margin-bottom:10px}
/* api/mcp raw response payload (plan 29 iter 4): the actual JSON / tool result, with the extracted field
 * highlighted, so non-file provenance shows the real payload instead of a pretend CSV. */
.srcdrawer .sp-payload{margin:0 0 8px;padding:12px 14px;background:#f7f8fa;border:1px solid #eceef2;border-radius:8px;font:400 11.5px/1.6 'JetBrains Mono',ui-monospace,monospace;color:#2c2f36;white-space:pre-wrap;word-break:break-word;overflow:auto;max-height:220px}
.srcdrawer .sp-field{background:#fef0d6;box-shadow:inset 0 -1px 0 oklch(0.66 0.16 45);border-radius:2px;padding:0 2px;font-weight:600;color:#8a5a12}
.srcdrawer .sp-ref{display:flex;align-items:center;gap:7px;font:400 12.5px/1.6 system-ui;color:#52575f}
.prose{max-width:720px;margin:0 auto;padding:24px 40px 80px;font:400 15.5px/1.7 system-ui;color:#2a2a31}
.prose h1{font:600 30px/1.12 system-ui;letter-spacing:-.02em;color:#15151a;margin:24px 0 12px}
.prose h2{font:600 16px/1.3 system-ui;color:#26262d;margin:26px 0 10px}
.prose h3{font:600 16px/1.3 system-ui;color:#34343c;margin:22px 0 8px}
.prose h4,.prose h5,.prose h6{font:600 14px/1.3 system-ui;color:#46464e;margin:18px 0 6px}
.prose p{margin:0 0 14px}
.prose ul,.prose ol{margin:0 0 14px;padding-left:26px}
.prose li{margin:3px 0}
.prose a{color:${ACCENT};text-decoration:none}
.prose a:hover{text-decoration:underline}
.prose code{font:400 13px/1.5 'JetBrains Mono',ui-monospace,monospace;background:#f3f3f5;border-radius:4px;padding:1px 5px}
.prose pre{background:#f7f7f9;border:1px solid #ececf0;border-radius:8px;padding:14px 16px;overflow:auto;margin:0 0 14px}
.prose pre code{background:none;padding:0}
.prose blockquote{margin:0 0 14px;padding:2px 16px;border-left:3px solid #e1e2e8;color:#6a6a73}
.prose table{border-collapse:collapse;margin:0 0 14px;font-size:13px}
.prose th,.prose td{border:1px solid #ececf0;padding:7px 12px;text-align:left}
.prose img{max-width:100%}
/* Plain-Markdown ProseMirror editor (F2): the document IS the writing surface (reuses .prose type).
 * Layout (plan 21 iter 1 / C2): a flex row that centres a reading group of [30px provenance gutter][720px
 * reading column]. The gutter is a real reserved column (via the prose column's 30px left padding) so
 * provenance markers live to the LEFT of the prose and the prose NEVER shifts when markers toggle.
 * The .prose element is content-box with max-width:720px (the reading text) + padding-left:30px (the
 * reserved gutter lane), giving a total element width of 750px. */
.pmwrap{display:flex;justify-content:center;padding:32px 40px 90px}
.pmwrap .prose{flex:0 1 auto;max-width:720px;margin:0;padding-left:30px;padding-right:0;box-sizing:content-box;position:relative}
.pmwrap .ProseMirror{outline:none;min-height:60vh;white-space:pre-wrap;word-wrap:break-word;-webkit-font-smoothing:antialiased}
.pmwrap .ProseMirror:focus{outline:none}
.pmwrap .ProseMirror p.is-editor-empty:first-child::before{color:#bcc0c8;content:attr(data-placeholder);float:left;pointer-events:none;height:0}
.rawwrap{max-width:860px;margin:0 auto;padding:20px 40px 60px}
textarea.raw{width:100%;min-height:70vh;box-sizing:border-box;border:1px solid #e1e2e8;border-radius:10px;padding:18px 20px;resize:vertical;background:#fbfbfc;color:#23242a;font:400 13px/1.7 'JetBrains Mono',ui-monospace,monospace;tab-size:2}
textarea.raw:focus{outline:none;border-color:${ACCENT}}
/* Present & export modal. */
.pm-overlay{position:fixed;inset:0;z-index:60;background:rgba(20,26,40,.34);display:flex;align-items:center;justify-content:center;padding:32px}
.pm-card{width:740px;max-width:100%;max-height:100%;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(15,22,40,.32);overflow:hidden;display:flex;flex-direction:column}
.pm-head{flex:none;display:flex;align-items:center;gap:11px;padding:18px 22px;border-bottom:1px solid #eef0f3}
.pm-title{margin:0 0 3px;font:600 16px/1.2 system-ui;color:#15171c}
.pm-sub{font:400 12px/1 'JetBrains Mono',ui-monospace,monospace;color:#a3a8b2}
.pm-x{margin-left:auto;border:none;background:none;color:#9aa0aa;font-size:18px;cursor:pointer;padding:4px 8px}
.pm-body{flex:1;display:flex;min-height:0}
.pm-list{width:300px;flex:none;border-right:1px solid #eef0f3;background:#fbfbfc;overflow-y:auto;padding:14px}
.pm-detail{flex:1;min-width:0;overflow-y:auto;padding:22px}
.pmwrap .ProseMirror span.bound{cursor:pointer}
/* Provenance gutter (plan 21 iter 1 / C2): markers are ProseMirror node decorations that paint into the
 * real 30px gutter column reserved by .prose's 30px left padding (so the prose is never shifted). A
 * source-bound block gets a 9px accent dot vertically centred on its line; a recently-applied block
 * flashes attention. Hovering a marker opens the source-peek drawer (wired in the RUNTIME). */
.pmwrap .ProseMirror .pm-gutter{position:relative}
.pmwrap .ProseMirror .pm-gutter::before{content:"";position:absolute;left:-21px;top:.62em;width:9px;height:9px;border-radius:50%;background:oklch(0.55 0.13 255);cursor:pointer;transition:transform .15s ease}
.pmwrap .ProseMirror .pm-gutter:hover::before{transform:scale(1.25)}
.pmwrap .ProseMirror .pm-gutter-recent::before{background:oklch(0.66 0.16 45);box-shadow:0 0 0 4px rgba(220,150,60,.14);animation:flash 1.6s ease}
/* A multi-line edited paragraph hangs a 3px attention bar in the gutter spanning the diff-text rows
 * only (the .editp), so it does not overspill into the Approve/Reject control row below.
 * The bar is placed on .pm-edit-bar .editp rather than the outer .editblock to cap its extent. */
.pmwrap .ProseMirror .pm-edit-bar .editp{position:relative}
.pmwrap .ProseMirror .pm-edit-bar .editp::before{content:"";position:absolute;left:-22px;top:2px;bottom:2px;width:3px;border-radius:999px;background:oklch(0.66 0.16 45);cursor:pointer}
/* A block with a pending meaning-change is hidden; the diff + accept/reject widget renders in its place. */
.pmwrap .ProseMirror .pm-orig-hidden{display:none}
/* The diff / insert widgets are host-rendered with the renderDoc markup (.editblock/.insertblock/.ctrl),
 * so they need no new styles; they sit full-width in the PM column. */
.pmwrap .ProseMirror .editblock,.pmwrap .ProseMirror .insertblock{margin:0 0 14px;border-radius:10px;transition:box-shadow .3s ease,background-color .3s ease}
/* Inline review prominence (plan 19 iter 3): hovering a pending change lifts its accept/reject row so it
 * reads as one actionable unit you can approve while reading, without adding permanent chrome. */
.pmwrap .ProseMirror .editblock:hover .ctrl,.pmwrap .ProseMirror .insertblock:hover .ctrl{border-color:oklch(0.66 0.16 45 / .45);box-shadow:0 1px 6px oklch(0.66 0.16 45 / .14)}
/* Self-explaining framing line above the diff (plan 31 iter 2): a quiet row carrying the kind tag, the
 * confidence chip, the model's rationale and a source chip - read-first context before the word-diff. */
.pmwrap .ProseMirror .frame{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin:0 0 8px;font:500 11px/1.4 system-ui}
.pmwrap .ProseMirror .fr-kind{text-transform:uppercase;letter-spacing:.04em;font-weight:600;font-size:10.5px;border-radius:999px;padding:3px 9px}
.pmwrap .ProseMirror .fr-kind.attn{color:#9a6b16;background:#fdf6e9;border:1px solid #f0e2c4}
.pmwrap .ProseMirror .fr-kind.ok{color:#2c8159;background:#eef7f0;border:1px solid #d7ecdc}
.pmwrap .ProseMirror .fr-conf{font-weight:600;font-size:10.5px;border-radius:999px;padding:3px 9px}
.pmwrap .ProseMirror .fr-conf.high{color:#2c8159;background:#eef7f0;border:1px solid #d7ecdc}
.pmwrap .ProseMirror .fr-conf.inferred{color:#8a6d1a;background:#fdfaf2;border:1px solid #e4dccb}
.pmwrap .ProseMirror .fr-why{color:#5b616b;font-weight:400}
.pmwrap .ProseMirror .fr-src{color:#5661c9;background:#f4f5fd;border:1px solid #e0e5fb;border-radius:6px;padding:2px 8px;font:500 10.5px/1.3 'JetBrains Mono',ui-monospace,monospace}
/* Tweak (plan 31 iter 3): the in-place editor is hidden until Edit is pressed; then the diff hides, the
 * contenteditable shows, and the action row swaps Approve/Reject for Save & Approve / Cancel. */
.pmwrap .ProseMirror .tweakwrap{display:none;margin:0 0 10px}
.pmwrap .ProseMirror .tweakedit{border:1px solid oklch(0.66 0.16 45 / .5);border-radius:8px;padding:8px 11px;font:400 15px/1.6 system-ui;color:#26292f;background:#fffdf8;outline:none}
.pmwrap .ProseMirror .tweakacts{display:none}
.pmwrap .ProseMirror .editblock.tweaking .editp{display:none}
.pmwrap .ProseMirror .editblock.tweaking .tweakwrap{display:block}
.pmwrap .ProseMirror .editblock.tweaking .normacts{display:none}
.pmwrap .ProseMirror .editblock.tweaking .tweakacts{display:inline-flex}
.pmwrap .ProseMirror .tweak{border:1px solid #e0e2e8;background:#fff;color:#52575f;border-radius:7px;padding:5px 11px;font:600 12px/1 system-ui;cursor:pointer}
/* Rail-to-editor navigation (plan 19 iter 2): the change the rail sent us to gets a brief calm ring +
 * tint so the eye lands on it, then fades - no permanent chrome. */
.pmwrap .ProseMirror .lwd-focus-flash{box-shadow:0 0 0 3px oklch(0.66 0.16 45 / .5);background:oklch(0.97 0.03 70)}
/* Figure/gutter hover provenance tooltip (plan 29 iter 3): a quiet floating card that answers "where from,
 * how fresh" for a bound figure without shifting layout - it is fixed-position and pointer-events:none so it
 * floats over the prose and never intercepts a click (the click still opens the source drawer). */
.lwd-tip{position:fixed;z-index:80;max-width:300px;pointer-events:none;background:#1f2229;color:#f4f5f7;border-radius:8px;padding:8px 11px;box-shadow:0 8px 24px rgba(15,22,40,.28);font:400 12px/1.5 system-ui;opacity:0;transition:opacity .1s ease}
.lwd-tip.show{opacity:1}
.lwd-tip .tip-src{font:600 12px/1.4 'JetBrains Mono',ui-monospace,monospace;color:#fff;word-break:break-all}
.lwd-tip .tip-meta{color:#b7bcc6;margin-top:1px}
.lwd-tip .tip-stale{display:flex;align-items:center;gap:6px;margin-top:5px;color:#f0b968;font-weight:500}
.lwd-tip .tip-stale::before{content:"";width:6px;height:6px;border-radius:50%;background:oklch(0.66 0.16 45);flex:none}`;

// The webview RUNTIME (set up ONCE per webview via the shell). It mounts the ProseMirror view a single
// time and thereafter re-renders the document body from 'lwdRender' messages instead of a fresh setHtml,
// so the live editor is never torn down and the ~370KB bundle is inlined only once (mount-once-then-
// message; plan 15 iter 2). Event handling is DELEGATED on the persistent #lwd-root container, so it keeps
// working across innerHTML swaps without re-binding. On an update the live ProseMirror node is detached,
// the body is swapped, and the same node is re-inserted into the new #pm-root (PM survives reparenting).
const RUNTIME = `const vscode = acquireVsCodeApi();
const root = document.getElementById('lwd-root');
let pmView = null, pmTimer = 0;
// Per-key provenance for the hover tooltip (plan 29 iter 3), refreshed from every decoration payload so the
// tooltip always reads the current lock state (a source edit that flips freshness re-renders the payload).
let _prov = Object.create(null);
function setProv(spec){ _prov = Object.create(null); if (spec && spec.provenance) { for (let i = 0; i < spec.provenance.length; i++) { _prov[spec.provenance[i].key] = spec.provenance[i]; } } }
function pmOnChange(){ clearTimeout(pmTimer); pmTimer = setTimeout(function(){ if (pmView) { vscode.postMessage({ type: 'pmEdit', text: window.LWDPM.toMarkdown(pmView) }); } }, 300); }
function pmDeco(spec){ setProv(spec); if (pmView && spec && window.LWDPM) { window.LWDPM.setDecorations(pmView, spec); } }
// A single reused tooltip element (created lazily), floated over the prose with pointer-events:none so it
// never intercepts the click that opens the source drawer. esc keeps any source/location text inert markup.
let _tip = null;
function tipEsc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function showTip(el, key){ const p = _prov[key]; if (!p) { return; } if (!_tip) { _tip = document.createElement('div'); _tip.className = 'lwd-tip'; document.body.appendChild(_tip); }
	const loc = p.location ? (tipEsc(p.location) + ' &middot; ') : '';
	const stale = p.fresh ? '' : '<div class="tip-stale">Source changed since last sync</div>';
	_tip.innerHTML = '<div class="tip-src">' + tipEsc(p.source) + '</div><div class="tip-meta">' + loc + tipEsc(p.synced) + '</div>' + stale;
	const box = el.getBoundingClientRect();
	// Measure then place above the figure (or below when it would clip the top of the viewport).
	_tip.classList.add('show');
	const th = _tip.getBoundingClientRect().height;
	let top = box.top - th - 8; if (top < 6) { top = box.bottom + 8; }
	let left = box.left; if (left + 300 > window.innerWidth) { left = Math.max(6, window.innerWidth - 306); }
	_tip.style.left = left + 'px'; _tip.style.top = top + 'px';
}
function hideTip(){ if (_tip) { _tip.classList.remove('show'); } }
function mountPm(md, spec){ const r = root.querySelector('#pm-root'); if (r && window.LWDPM) { pmView = window.LWDPM.mount(r, md || '', { onChange: pmOnChange }); pmDeco(spec); focusPm(); } }
// plan 16 iter 3 (decision 56): land the caret in the document on first mount so a freshly-opened (or
// freshly-created blank) doc is immediately writable -- "one click -> cursor ready", no extra click to
// start typing. Only fires on the initial mount (mount-once-then-message, decision 50), so re-renders
// never steal the caret. Fail-soft: a focus that throws (view torn down) is ignored.
function focusPm(){ try { if (pmView && pmView.focus) { setTimeout(function(){ try { pmView && pmView.focus(); } catch (e) {} }, 0); } } catch (e) {} }
// Re-render the body from a message. The live ProseMirror node is detached, the body HTML is swapped, and
// the same node re-attached (PM is never remounted). A model-driven body change (an accepted proposal)
// arrives as pmReset and resets the live doc to disk truth; pending proposals + the gutter are decorations.
function applyUpdate(htmlStr, pmMd, spec, pmReset){
	const live = (pmView && pmMd !== null) ? pmView.dom : null;
	if (live && live.parentNode) { live.parentNode.removeChild(live); }
	root.innerHTML = htmlStr;
	if (pmMd !== null) {
		const r = root.querySelector('#pm-root');
		if (live && r) {
			r.appendChild(live);
			if (typeof pmReset === 'string' && window.LWDPM) { window.LWDPM.setDoc(pmView, pmReset); }
			pmDeco(spec);
		} else if (r && window.LWDPM) { mountPm(pmMd, spec); }
	} else if (pmView) { window.LWDPM.destroy(pmView); pmView = null; }
}
// The calm formatting toolbar drives the live ProseMirror view through LWDPM.cmd (plan 15 iter 5) - NOT
// document.execCommand, which PM does not honour. The B/I/list/quote buttons fire on mousedown with
// preventDefault so the PM selection is kept; the heading <select> fires on change.
root.addEventListener('mousedown', e => {
	const b = e.target.closest('button[data-pmcmd]');
	if (b && pmView && window.LWDPM) { e.preventDefault(); window.LWDPM.cmd(pmView, b.getAttribute('data-pmcmd')); }
});
root.addEventListener('change', e => {
	const s = e.target.closest('select[data-pmcmd]');
	if (s && pmView && window.LWDPM) { window.LWDPM.cmd(pmView, s.value); }
});
root.addEventListener('click', e => {
	let el;
	// Tweak (plan 31 iter 3): Edit opens the in-place editor over the proposed text; Save & Approve amends the
	// pending change then approves through the one path; Cancel restores. The contenteditable lives inside the
	// widget DOM (never the PM document), so the doc stays read-only until approval - no undo-stack coupling.
	if (el = e.target.closest('[data-tweak]')) { e.stopPropagation(); const card = el.closest('[data-editcard]'); if (card) { card.classList.add('tweaking'); const ed = card.querySelector('.tweakedit'); if (ed) { ed.focus(); } } return; }
	if (el = e.target.closest('[data-tweak-cancel]')) { e.stopPropagation(); const card = el.closest('[data-editcard]'); if (card) { card.classList.remove('tweaking'); const ed = card.querySelector('.tweakedit'); if (ed) { ed.textContent = ed.getAttribute('data-orig') || ''; } } return; }
	if (el = e.target.closest('[data-tweak-save]')) { e.stopPropagation(); const card = el.closest('[data-editcard]'); const ed = card && card.querySelector('.tweakedit'); const text = ed ? ed.innerText.replace(/\\s+/g, ' ').trim() : ''; return vscode.postMessage({ type: 'amendApprove', id: el.getAttribute('data-tweak-save'), text: text }); }
	if (el = e.target.closest('[data-approve]')) { e.stopPropagation(); return vscode.postMessage({ type: 'approve', id: el.getAttribute('data-approve') }); }
	if (el = e.target.closest('[data-reject]')) { e.stopPropagation(); return vscode.postMessage({ type: 'reject', id: el.getAttribute('data-reject') }); }
	if (el = e.target.closest('[data-approve-all-doc]')) { return vscode.postMessage({ type: 'approveAllDoc' }); }
	if (el = e.target.closest('[data-approve-all-everywhere]')) { return vscode.postMessage({ type: 'approveAllEverywhere' }); }
	if (el = e.target.closest('[data-next-doc]')) { return vscode.postMessage({ type: 'nextDoc' }); }
	if (el = e.target.closest('[data-refresh]')) { return vscode.postMessage({ type: 'refresh' }); }
	if (el = e.target.closest('[data-cells]')) { return vscode.postMessage({ type: 'reveal', cells: el.getAttribute('data-cells').split(',') }); }
	if (el = e.target.closest('span.bound[data-key]')) { return vscode.postMessage({ type: 'reveal', cells: [el.getAttribute('data-key')] }); }
	if (el = e.target.closest('.pm-gutter')) { const key = gutterKeyFor(el); if (key) { return vscode.postMessage({ type: 'reveal', cells: [key] }); } }
	if (el = e.target.closest('[data-to-raw]')) { return vscode.postMessage({ type: 'setMode', mode: 'raw' }); }
	if (el = e.target.closest('[data-source-close]')) { return vscode.postMessage({ type: 'closeSource' }); }
	if (el = e.target.closest('[data-sync]')) { return vscode.postMessage({ type: 'sync' }); }
	if (el = e.target.closest('[data-present-open]')) { return vscode.postMessage({ type: 'presentOpen' }); }
	if (el = e.target.closest('[data-present-choice]')) { return vscode.postMessage({ type: 'presentChoice', choice: el.getAttribute('data-present-choice') }); }
	if (el = e.target.closest('[data-present-cta]')) { return vscode.postMessage({ type: 'presentCta' }); }
	// The modal closes from the backdrop or the X (both data-present-close); a click inside the card
	// (data-present-stop) does not. Walk to whichever ancestor comes first and close only if it is a close.
	const modalHit = e.target.closest('[data-present-close],[data-present-stop]');
	if (modalHit && modalHit.hasAttribute('data-present-close')) { return vscode.postMessage({ type: 'presentClose' }); }
	if (el = e.target.closest('[data-apply-raw]')) { const ta = root.querySelector('textarea.raw'); return vscode.postMessage({ type: 'applyRaw', text: ta ? ta.value : '' }); }
});
root.addEventListener('keydown', e => {
	const b = e.target.closest('[data-block]');
	if (b && e.key === 'Enter') { e.preventDefault(); b.blur(); }
});
// Hovering a bound figure (or its provenance gutter dot) floats a quiet tooltip answering "where from, how
// fresh" (plan 29 iter 3): the source file/endpoint, the cell within it, the relative sync time, and an amber
// "source changed" line when stale. Click still opens the source drawer (unchanged) - the tooltip is
// pointer-events:none so it never intercepts that click. Delegated on root so it survives the innerHTML swaps.
// A gutter dot carries no data-key itself; resolve the key from the bound figure inside its block, and only
// fire when the pointer is over the dot's gutter column (clientX left of the block), so reading text stays quiet.
function gutterKeyFor(node){ const bound = node.querySelector('span.bound[data-key]'); return bound ? bound.getAttribute('data-key') : null; }
root.addEventListener('mouseover', e => {
	const fig = e.target.closest && e.target.closest('span.bound[data-key]');
	if (fig) { return showTip(fig, fig.getAttribute('data-key')); }
	const g = e.target.closest && e.target.closest('.pm-gutter');
	if (!g) { return; }
	const box = g.getBoundingClientRect();
	if (e.clientX > box.left) { return; }
	const key = gutterKeyFor(g);
	if (key) { showTip(g, key); }
});
root.addEventListener('mouseout', e => {
	const from = e.target.closest && (e.target.closest('span.bound[data-key]') || e.target.closest('.pm-gutter'));
	if (from) { hideTip(); }
});
root.addEventListener('focusout', e => {
	const b = e.target.closest('[data-block]');
	if (b) { const text = b.innerText.replace(/\\s+/g, ' ').trim(); if (text !== b.getAttribute('data-orig')) { vscode.postMessage({ type: 'edit', blockId: b.getAttribute('data-block'), text: text }); } }
});
// Scroll a pending change's inline diff into view and flash it (rail-to-editor navigation, plan 19 iter 2).
// The change's accept/reject widget carries data-approve="<id>"; reveal its surrounding diff/insert block.
// A short timeout lets the just-applied decorations lay out before we measure/scroll.
function focusChange(id){ setTimeout(function(){ try { const el = root.querySelector('[data-approve="' + id + '"]'); const block = el && el.closest('.editblock, .insertblock'); if (block) { block.scrollIntoView({ block: 'center', behavior: 'smooth' }); block.classList.add('lwd-focus-flash'); setTimeout(function(){ block.classList.remove('lwd-focus-flash'); }, 1600); } } catch (e) {} }, 30); }
window.addEventListener('message', e => { const m = e.data; if (m && m.type === 'lwdRender') { applyUpdate(m.html, m.pmMd, m.pmDeco, m.pmReset); } else if (m && m.type === 'focusChange') { focusChange(m.id); } });
if (typeof window.__LWD_PM_MD === 'string') { mountPm(window.__LWD_PM_MD, window.__LWD_PM_DECO); }
vscode.postMessage({ type: 'lwdReady' });`;

// One resolved decoration with its host-rendered widget HTML, ready for the bundle to place by text anchor.
interface IPmDecoEdit { readonly id: string; readonly anchorText: string; readonly html: string }
interface IPmDecoInsert { readonly id: string; readonly afterText: string | null; readonly html: string }
/** The decoration payload pushed to the webview: pending diffs/inserts (with widget HTML) + gutter markers. */
export interface IPmDecoPayload {
	readonly edits: readonly IPmDecoEdit[];
	readonly inserts: readonly IPmDecoInsert[];
	readonly gutters: readonly IPmGutterMarker[];
	/** Per-key provenance the RUNTIME reads to build the hover tooltip (plan 29, iter 3); [] for plain docs. */
	readonly provenance: readonly IPmProvenance[];
}

// Render the word-diff runs to the same inline add/del markup the renderDoc surface uses (one look).
function renderDiffSegments(segments: readonly IPmDiffSegment[]): string {
	return segments.map(s => {
		const t = esc(s.text);
		return s.t === 'del' ? `<span class="d-o">${t}</span>` : s.t === 'ins' ? `<span class="d-n">${t}</span>` : t;
	}).join(' ');
}

// The quiet self-explaining framing line above the diff (plan 31 iter 2): kind tag (attention for a meaning
// change, ok for a figure) + confidence chip (High / Inferred, the truthful reviewConfidence rule) +
// the model's rationale sentence when present (nothing when absent - no filler) + a source chip linking the
// grounding line. Rendered identically here, on the rail and on the cross-doc cards from `reviewFraming`.
function pmFramingHtml(f: IReviewFraming): string {
	const kindClass = f.kindAttention ? 'fr-kind attn' : 'fr-kind ok';
	const confClass = f.confidence === 'inferred' ? 'fr-conf inferred' : 'fr-conf high';
	const rationale = f.rationale ? `<span class="fr-why">${esc(f.rationale)}</span>` : '';
	const src = f.sourceLabel ? `<span class="fr-src">${esc(f.sourceLabel)}</span>` : '';
	return `<div class="frame"><span class="${kindClass}">${esc(f.kindLabel)}</span>`
		+ `<span class="${confClass}">${esc(f.confidenceLabel)}</span>${rationale}${src}</div>`;
}

// The inline diff + accept/reject control row for a pending meaning-change (reuses the renderDoc editblock
// markup minus the grid gutter cell, since the PM gutter is a separate node decoration).
function pmEditWidgetHtml(e: IPmEditDecoration, bar: boolean): string {
	// Provenance reads cleanly with or without a source: a bound/source-driven doc shows "Suggested edit
	// from <source>"; a plain doc (e.g. a chat rewrite) just shows "Suggested edit" - never a dangling
	// "from" with an empty source after it.
	const origin = e.source ? `Suggested edit from <span class="src">${esc(e.source)}</span>` : 'Suggested edit';
	// A multi-line edited paragraph carries the `attention` provenance bar (C2): it hangs a 3px bar in the
	// gutter column spanning the widget's rows. Single-line edits get no bar (nothing to span).
	const barClass = bar ? ' pm-edit-bar' : '';
	const framing = pmFramingHtml(reviewFraming(e, e.source));
	// Tweak (amend-before-approve, plan 31 iter 3, D31-A): a pencil beside Approve/Reject opens an in-place
	// editor over the proposed text. `Save & Approve` amends the pending change then approves it through the
	// one approve path; `Cancel` restores. Hidden for a figure (figures come from sources; not hand-editable).
	const canTweak = e.kind !== 'figure';
	const tweakBtn = canTweak ? `<button class="tweak" data-tweak="${esc(e.id)}" title="Edit the proposed text">Edit</button>` : '';
	const editor = canTweak
		? `<div class="tweakwrap"><div class="tweakedit" contenteditable="true" data-orig="${esc(e.newText)}">${esc(e.newText)}</div></div>`
		: '';
	const tweakActs = canTweak
		? `<span class="acts tweakacts"><button class="approve" data-tweak-save="${esc(e.id)}">Save &amp; Approve</button>`
		+ `<button class="reject" data-tweak-cancel="${esc(e.id)}">Cancel</button></span>`
		: '';
	return `<div class="pcell editblock${barClass}" data-editcard="${esc(e.id)}">`
		+ framing
		+ `<p class="editp">${renderDiffSegments(e.segments)}</p>`
		+ editor
		+ `<div class="ctrl"><span class="cdot"></span>`
		+ `<span class="lbl">${origin} &middot; <span class="add">+${e.added} added</span> &middot; <span class="rem">${e.removed} removed</span> &middot; ${Math.round(e.confidence * 100)}% confidence</span>`
		+ `<span class="acts normacts">${tweakBtn}<button class="approve" data-approve="${esc(e.id)}">Approve changes</button>`
		+ `<button class="reject" data-reject="${esc(e.id)}">Reject</button></span>${tweakActs}</div></div>`;
}

// The all-additions widget for a generative insertion (reuses the renderDoc insertblock markup).
function pmInsertWidgetHtml(ins: IPmInsertDecoration): string {
	const framing = pmFramingHtml(reviewFraming(ins, 'Chat'));
	return `<div class="pcell insertblock">`
		+ framing
		+ `<div class="insertbody">${renderGenericMarkdown(ins.newText)}</div>`
		+ `<div class="ctrl"><span class="cdot add"></span>`
		+ `<span class="lbl">New content from <span class="src">Chat</span> &middot; <span class="add">inserted after ${esc(ins.blockLabel)}</span> &middot; ${Math.round(ins.confidence * 100)}% confidence</span>`
		+ `<span class="acts"><button class="approve" data-approve="${esc(ins.id)}">Approve</button>`
		+ `<button class="reject" data-reject="${esc(ins.id)}">Reject</button></span></div></div>`;
}

// Build the decoration payload for the PM surface: the pure spec (TDD'd) augmented with widget HTML.
function renderPmDeco(doc: ILivingDoc, pending: readonly IProposedChange[], recent: ReadonlySet<string>, provenance: readonly IPmProvenance[]): IPmDecoPayload {
	const spec = buildPmDecorationSpec(doc, pending, recent);
	// The gutter bar for a multi-line edited paragraph hangs off that edit's visible widget (the original
	// node is hidden), so map the bar anchors onto the edit ids they belong to.
	const barAnchors = new Set(spec.gutters.filter(g => g.kind === 'bar').map(g => g.anchorText));
	return {
		edits: spec.edits.map(e => ({ id: e.id, anchorText: e.anchorText, html: pmEditWidgetHtml(e, barAnchors.has(e.anchorText)) })),
		inserts: spec.inserts.map(ins => ({ id: ins.id, afterText: ins.afterText, html: pmInsertWidgetHtml(ins) })),
		gutters: spec.gutters,
		provenance,
	};
}

/** The dynamic part of the doc surface: the body HTML, the Markdown to mount in ProseMirror (or null when
 * the surface is not a live PM editor - raw mode or no doc), and the PM decoration payload (or null). */
export interface ILivingDocContent {
	readonly html: string;
	readonly pmMd: string | null;
	readonly pmDeco: IPmDecoPayload | null;
}

// The right side of the in-webview toolbar - the editor action bar (plan 19 iter 4 + 5). Four calm states
// let the whole multi-document review run from the document pane:
//  - this doc has changes: a count, "Approve all in this doc", "Next document" (when another changed doc
//    exists), and a quiet "Approve everywhere" (when other docs also have changes);
//  - this doc is clear but others still have changes: a tick + "Next document" to keep cycling;
//  - nothing pending anywhere after a review: "All changes reviewed" (the end state);
//  - nothing pending and no review happened: the neutral "Saved" status.
function docReviewBar(pendingCount: number, totalPendingCount: number, nextChangedDocTitle: string | undefined): string {
	// The review bar is a floating affordance that only exists while there are pending changes somewhere -
	// in this document or another. When the last change is approved it simply disappears, and that
	// disappearance IS the "done" signal (plan 19 iter 7: no persistent end state).
	if (totalPendingCount <= 0) {
		return '';
	}

	const next = nextChangedDocTitle
		? `<button class="rv-next" data-next-doc title="Go to ${esc(nextChangedDocTitle)}">Next document &rarr;</button>`
		: '';
	const othersHavePending = totalPendingCount > pendingCount;

	let inner: string;
	if (pendingCount > 0) {
		const approveEverywhere = othersHavePending
			? `<button class="rv-all" data-approve-all-everywhere title="Approve every pending change across all documents">Approve everywhere</button>`
			: '';
		inner = `<span class="rv-count">${pendingCount} change${pendingCount === 1 ? '' : 's'} here</span>`
			+ `<span class="rv-spacer"></span>`
			+ next
			+ approveEverywhere
			+ `<button class="rv-approve" data-approve-all-doc>Approve all in this doc</button>`;
	} else {
		// This document is clear, but the review is not finished - keep the cycle moving to the next doc.
		inner = `<span class="rv-clear"><span class="rv-tick">&#10003;</span>This document is clear</span>`
			+ `<span class="rv-spacer"></span>`
			+ next
			+ `<button class="rv-all" data-approve-all-everywhere title="Approve every pending change across all documents">Approve everywhere</button>`;
	}

	return `<div class="reviewbar">${inner}</div>`;
}

export function renderLivingDocContent(input: ILivingDocRenderInput): ILivingDocContent {
	const { doc, pending, dirty, status, recent, mode, rawText } = input;
	const isLiving = !!doc?.isLiving;
	const crumb = isLiving ? 'Living Document' : 'Markdown';

	// PM is the single editing surface for every document (plan 15 iter 5); the chrome shows in 'pm' mode.
	const isPm = mode === 'pm';

	// The comp's calm 48px bar carries only: brand/crumb + the sync pill + Present + avatar. The status
	// pill IS the refresh affordance (click to re-derive from sources) - no separate Refresh/Download
	// buttons (Download is covered by the Present & export modal; per-doc sync by the Sync-across pane).
	const warn = (pending.length || dirty) ? 'warn' : '';
	const livingControls = isLiving
		? `<span class="pill ${warn}" data-refresh title="Refresh from sources"><span class="dot"></span>${esc(status)}</span>`
		: '';
	// In raw mode, offer the way back to the editor (apply the raw text and return to the PM surface).
	const rawToggleTop = mode === 'raw'
		? `<button class="toggle" data-apply-raw>&#10003; Done editing source</button>`
		: '';
	const presentBtn = (doc && isPm) ? `<button class="toggle" data-present-open>&#8599; Present</button>` : '';

	const topbar = `<div class="topbar"><div class="brand"><span class="logo">A</span>Abstract<span class="sep">/</span><span class="crumb">${crumb}</span></div>`
		+ `<div class="right">${livingControls}${rawToggleTop}${presentBtn}<span class="av">TS</span></div></div>`;

	const modal = input.present.open && doc ? renderPresentModal(input.present, doc.title) : '';

	// The comp's persistent calm formatting toolbar (sticks under the 48px top bar). Formatting essentials
	// only - a borderless heading dropdown, B/I, list/ordered/quote - and a quiet "Saved" status. Every
	// control drives the live ProseMirror view through LWDPM.cmd via [data-pmcmd] (plan 15 iter 5); the
	// names map 1:1 onto the bundle's COMMANDS. Underline is dropped (Markdown / the commonmark schema has
	// no underline mark - calm by subtraction). The comp also dropped Link-to-source / Run-skill / History.
	// plan 16 iter 6 (decision 59): the formatting toolbar shows for EVERY document in PM, plain or living --
	// PM is the one editing surface (decision 53), and a plain notes doc is just as writable, so it was wrong
	// to gate the toolbar on `isLiving` (a blank new doc opened with no way to format). The sync bar + the
	// bound-figure hint stay living-only (a plain doc has no sources/figures), but B/I/headings/lists are
	// universal.
	const docToolbar = (!!doc && isPm)
		? `<div class="etoolbar">`
		+ `<select class="tb-h" data-pmcmd title="Paragraph style">`
		+ `<option value="paragraph">Paragraph</option>`
		+ `<option value="h1">Heading 1</option>`
		+ `<option value="h2">Heading 2</option>`
		+ `<option value="h3">Heading 3</option>`
		+ `</select>`
		+ `<span class="tb-div"></span>`
		+ `<button class="tb-b bold" data-pmcmd="bold" title="Bold">B</button>`
		+ `<button class="tb-b ital" data-pmcmd="italic" title="Italic">I</button>`
		+ `<span class="tb-div"></span>`
		+ `<button class="tb-b ic" data-pmcmd="bullet_list" title="Bulleted list">&#8803;</button>`
		+ `<button class="tb-b ic" data-pmcmd="ordered_list" title="Numbered list">&#8862;</button>`
		+ `<button class="tb-b ic" data-pmcmd="blockquote" title="Quote">&#10077;</button>`
		+ `<span class="tb-saved"><span class="sdot"></span>Saved &middot; v14</span>`
		+ `</div>`
		: '';

	// Source-peek / "Sync across" banner: when a linked source changed, offer a one-tap Sync; after a
	// sync, show the figure diff (old -> new) so the source edit's effect on the document is visible.
	const syncDiff = input.syncDiff ?? [];
	const syncBar = (isLiving && isPm)
		? (dirty
			? `<div class="syncbar"><span>&#9888; A linked source changed since the last sync.</span><span class="sb-spacer"></span><button class="sb-btn" data-sync>Sync figures</button></div>`
			: (syncDiff.length
				? `<div class="syncbar done"><span>&#10003; Synced ${syncDiff.length} figure${syncDiff.length === 1 ? '' : 's'}:</span> <span class="sb-diff">${syncDiff.map(c => `${esc(c.key)} ${esc(c.old)}&rarr;${esc(c.next)}`).join(' &middot; ')}</span></div>`
				: ''))
		: '';

	// PM is the single writing surface for every document (plan 15 iter 5): the document IS the editor.
	// Bound figures render as non-editable atom nodes; pending proposals + the provenance gutter are PM
	// decorations (plan 15 iter 4); the source-peek opens as the SAME bottom drawer over the full-width doc
	// (G1 - never a split editor), driven by the existing reveal/sync messages. Raw mode is the one
	// alternative - a plain Markdown textarea for hand-editing source.
	const pmSurface = !!doc && isPm;

	let body: string;
	if (mode === 'raw') {
		body = `<div class="rawwrap"><textarea class="raw" spellcheck="false">${esc(rawText)}</textarea></div>`;
	} else if (!doc) {
		body = `<div class="empty">No document loaded.</div>`;
	} else {
		body = syncBar
			+ `<div class="pmwrap"><div id="pm-root" class="prose"></div></div>`
			+ (input.sourcePeek ? renderSourceDrawer(input.sourcePeek) : '');
	}

	const hint = (isPm && isLiving)
		? `<div class="hint">Bound figures are highlighted in blue &mdash; click one (or a gutter dot) to trace it back to the source. `
		+ `Figures apply automatically; meaning-changes wait in the Review rail (right side bar). `
		+ `<button class="hint-raw" data-to-raw>Edit raw Markdown</button></div>`
		: '';
	// ProseMirror is fed from the FRESH body (parsed from the raw text on disk): a model-driven change
	// (an accepted proposal) mutates blocks + persists but leaves the cached doc.body stale, so the live
	// surface must reset to the reparsed body, not the stale cache.
	const pmMd = pmSurface && doc ? parseLivingDoc(rawText).body : null;
	const pmDeco = pmSurface && doc ? renderPmDeco(doc, pending, recent, input.provenance ?? []) : null;
	// Floating review bar: rendered directly below the formatting toolbar, present ONLY when there are
	// pending changes in this document or another (plan 19 iter 7). It is distinct from the formatting
	// chrome - it floats under it with a warm tint - so review never lives inside the WYSIWYG header.
	const reviewBar = (!!doc && isPm)
		? docReviewBar(pending.length, input.totalPendingCount ?? pending.length, input.nextChangedDocTitle)
		: '';
	return { html: `${topbar}${docToolbar}${reviewBar}${body}${hint}${modal}`, pmMd, pmDeco };
}

// The full webview document: the calm chrome + the dynamic content in a persistent #lwd-root, the vendored
// ProseMirror bundle, and the RUNTIME - all set ONCE via setHtml. Thereafter the editor pushes
// `renderLivingDocContent` payloads as 'lwdRender' messages (mount-once-then-message, plan 15 iter 2).
export function renderLivingDocHtml(input: ILivingDocRenderInput): string {
	const content = renderLivingDocContent(input);
	const bundle = proseMirrorBundle().replace(/<\/script/gi, '<\\/script');
	// Seed the initial mount Markdown AND the initial decoration spec as globals (the `<` is escaped so they
	// can't break out of the script); the RUNTIME reads them once on load (so a default-PM living doc shows
	// its proposals/gutter without waiting for the first message).
	const decoLiteral = content.pmDeco === null ? 'null' : JSON.stringify(content.pmDeco).replace(/</g, '\\u003c');
	const pmInit = `<script>window.__LWD_PM_MD=${content.pmMd === null ? 'null' : escapeForScript(content.pmMd)};`
		+ `window.__LWD_PM_DECO=${decoLiteral};</script>`;
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>`
		+ `<div id="lwd-root">${content.html}</div>`
		+ `${pmInit}<script>${bundle}</script><script>${RUNTIME}</script></body></html>`;
}

// The bottom source drawer (the comp's "Workbench v2" overlay) for the PM surface: a full-width overlay
// fixed to the bottom of the webview so the document is never split into a side-by-side pane.
function renderSourceDrawer(peek: ISourcePeekRender): string {
	const rows = peek.rows.map(r =>
		`<tr class="${r.selected ? 'sel' : ''}"><td>${esc(r.key)}</td><td>${esc(r.value)}</td></tr>`).join('');
	// The comp shows the source's raw CSV grid with the latest row (the one the document binds to)
	// highlighted - rendered above the resolved bound-figure list.
	const grid = peek.grid;
	const gridHtml = grid
		? `<div class="sp-sec">${esc(peek.source)} &middot; latest row applies</div>`
		+ `<table class="sp-grid"><thead><tr>${grid.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>`
		+ grid.rows.map((r, i) => `<tr class="${i === grid.latestIndex ? 'sel' : ''}">${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
		+ `</tbody></table>`
		: '';
	// For an api/mcp bound value: show the REAL response payload with the extracted field highlighted, so the
	// source-peek stops pretending non-file sources are a CSV (plan 29 iter 4). Highlighting is a safe,
	// escape-on-render match of the field name in the escaped payload text (no markup ever injected).
	const payloadHtml = peek.payload
		? `<div class="sp-sec">${esc(peek.payload.source)} &middot; ${peek.payload.kind === 'mcp' ? 'MCP result' : 'API response'} &middot; field <span class="sp-field">${esc(peek.payload.field)}</span></div>`
		+ `<pre class="sp-payload">${highlightField(peek.payload.raw, peek.payload.field)}</pre>`
		: '';
	const refs = peek.referencedBy.length
		? `<div class="sp-refs"><div class="sp-refs-h">REFERENCED BY &middot; ${peek.referencedBy.length} DOCUMENT${peek.referencedBy.length === 1 ? '' : 'S'}</div>`
		+ peek.referencedBy.map(t => `<div class="sp-ref">&#9636; ${esc(t)}</div>`).join('') + `</div>`
		: '';
	// Header action: the primary "Sync to report" button, swapped for a "N synced" chip after a sync.
	const action = peek.synced
		? `<span class="sd-synced">&#10003; ${peek.syncedCount} synced</span>`
		: `<button class="sd-sync" data-sync title="Apply the changed cells to the report and show the diff"><span>&#10227;</span>Sync to report</button>`;
	const rowCount = grid ? grid.rows.length : peek.rows.length;
	const drawer = `<div class="srcdrawer">`
		+ `<div class="sd-grip"><span></span></div>`
		+ `<div class="sd-head"><span class="sd-name">&#8862; ${esc(peek.source)}</span>`
		+ `<span class="sd-meta">source &middot; ${rowCount} row${rowCount === 1 ? '' : 's'}</span>`
		+ `<span class="sd-actions">${action}<button class="sd-x" data-source-close title="Close source">&#10005;</button></span></div>`
		+ `<div class="sd-body">${gridHtml}${payloadHtml}<div class="sp-sec">BOUND FIGURES &middot; ${peek.rows.length}</div><table><thead><tr><th>Key</th><th>Resolved</th></tr></thead><tbody>${rows}</tbody></table>${refs}</div></div>`;
	return drawer;
}

// Render a raw response payload, escaping ALL of it (the [04] injection invariant: MCP/API payloads are
// text, never markup), then wrapping each occurrence of the extracted field name in a highlight span. The
// highlight operates on the already-escaped text, so nothing the source returns can break out as markup.
function highlightField(raw: string, field: string): string {
	const safe = esc(raw);
	if (!field) { return safe; }
	const needle = esc(field);
	// Split on the escaped field and rejoin with the highlight span, so only literal text is ever emitted.
	return safe.split(needle).join(`<span class="sp-field">${needle}</span>`);
}

// The Present & export modal. Only the two destinations Abstract genuinely produces are selectable - a
// self-contained HTML page and clean portable Markdown - each mapped in `_runPresent` to a real writer.
// The native-format / cloud destinations are shown honestly as "Soon" (non-selectable) so the affordance
// never fabricates an export it cannot make (plan 33 L8; plan-17 no-dead-ends rule).
interface IPresentDef { label: string; accent: string; cta: string; live: string; icon: string; tint: string; soon?: boolean }
const PRESENT_DEFS: Record<PresentChoice, IPresentDef> = {
	html: { label: 'Web page', accent: ACCENT, cta: 'Export web page', live: 'Self-contained HTML file &middot; opens in any browser, no Abstract needed', icon: '&#9673;', tint: '#eef1ff' },
	markdown: { label: 'Markdown', accent: '#3a3f4a', cta: 'Export Markdown', live: 'Clean portable Markdown &middot; bound values inlined, opens in any editor', icon: 'M&#8595;', tint: '#eef0f3' },
	gdoc: { label: 'Google Docs', accent: '#2a6fdb', cta: 'Coming soon', live: 'Editable copy with text &amp; tables formatted natively.', icon: 'G', tint: '#eaf1fd', soon: true },
	gsheet: { label: 'Google Sheets', accent: '#1f8a5b', cta: 'Coming soon', live: 'Linked tables become live sheets.', icon: 'G', tint: '#e7f5ee', soon: true },
	docx: { label: 'Microsoft Word', accent: '#2b579a', cta: 'Coming soon', live: 'Offline .docx with styles preserved.', icon: 'W', tint: '#eaf0fa', soon: true },
	xlsx: { label: 'Microsoft Excel', accent: '#217346', cta: 'Coming soon', live: 'Linked tables as an .xlsx workbook.', icon: 'X', tint: '#e7f3ec', soon: true },
};
// Real destinations first, then the honest "Soon" group.
const PRESENT_ORDER: readonly PresentChoice[] = ['html', 'markdown', 'gdoc', 'gsheet', 'docx', 'xlsx'];

function renderPresentModal(present: IPresentState, title: string): string {
	// Guard: never let a "Soon" destination be the selected one (defensive - the rows are non-selectable).
	const activeChoice: PresentChoice = PRESENT_DEFS[present.choice].soon ? 'html' : present.choice;
	const pc = PRESENT_DEFS[activeChoice];
	const rows = PRESENT_ORDER.map(k => {
		const d = PRESENT_DEFS[k];
		const sel = k === activeChoice;
		// Soon rows are shown but not selectable - no data-present-choice, muted, with a "Soon" pill.
		const rowStyle = d.soon
			? 'border:1px solid #edeef1;background:#fbfbfc;opacity:.72;cursor:default'
			: (sel ? 'border:1.5px solid ' + ACCENT + ';background:#f7f9ff;cursor:pointer' : 'border:1px solid #e9eaee;background:#fff;cursor:pointer');
		const choiceAttr = d.soon ? '' : ` data-present-choice="${k}"`;
		const soonPill = d.soon ? `<span style="margin-left:auto;font:600 9.5px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em;color:#a3a8b2;background:#f1f2f5;border-radius:5px;padding:4px 6px">SOON</span>` : '';
		return `<button class="pm-row"${choiceAttr}${d.soon ? ' disabled aria-disabled="true"' : ''} style="text-align:left;border-radius:10px;padding:11px 12px;display:flex;align-items:center;gap:11px;${rowStyle}">`
			+ `<span style="width:30px;height:30px;flex:none;border-radius:7px;background:${d.tint};color:${d.accent};font:700 13px/1 system-ui;display:flex;align-items:center;justify-content:center">${d.icon}</span>`
			+ `<span style="min-width:0"><span style="display:block;font:600 13px/1.2 system-ui;color:#1a1c20">${d.label}</span></span>${soonPill}</button>`;
	}).join('');

	// The export writes a file next to the document (honest - no fabricated hosting or shareable URL).
	const destNote = `<div style="margin-bottom:18px;border:1px solid #eceef2;border-radius:8px;padding:10px 12px;background:#fafbfc;font:400 12px/1.5 system-ui;color:#696e78">The exported file is saved beside your document and opens for review.</div>`;

	return `<div class="pm-overlay" data-present-close>`
		+ `<div class="pm-card" data-present-stop>`
		+ `<div class="pm-head"><div><h2 class="pm-title">Present &amp; export</h2><div class="pm-sub">${esc(title)} &middot; 4 linked blocks</div></div><button class="pm-x" data-present-close>&#10005;</button></div>`
		+ `<div class="pm-body">`
		+ `<div class="pm-list"><div style="font:600 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.08em;color:#a3a8b2;margin-bottom:9px">SEND A COPY TO</div><div style="display:flex;flex-direction:column;gap:7px">${rows}</div></div>`
		+ `<div class="pm-detail">`
		+ `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><h3 style="margin:0;font:600 17px/1.2 system-ui;color:#15171c">${pc.label}</h3></div>`
		+ `<p style="margin:0 0 18px;font:400 13.5px/1.55 system-ui;color:#696e78">${pc.live}</p>`
		+ `<div style="border:1px solid #eceef2;border-radius:10px;overflow:hidden;margin-bottom:18px"><div style="padding:13px 15px;border-bottom:1px solid #f4f5f7"><div style="font:600 13px/1.3 system-ui;color:#23262c;margin-bottom:5px">${esc(title)}</div><div style="font:400 11px/1.5 system-ui;color:#969ba4">Highlights &middot; KPI table &middot; Commentary &middot; What to watch</div></div><div style="display:flex;align-items:center;gap:8px;padding:10px 15px;background:#fafbfc;font:400 11.5px/1.4 system-ui;color:#52575f"><span style="width:7px;height:7px;border-radius:50%;background:${ACCENT}"></span>4 source-linked blocks included</div></div>`
		+ destNote
		+ `<button class="pm-cta" data-present-cta style="width:100%;border:none;border-radius:9px;padding:12px;background:${ACCENT};color:#fff;font:600 13.5px/1 system-ui;cursor:pointer">${pc.cta}</button>`
		+ `<div style="margin-top:11px;font:400 11px/1.5 system-ui;color:#bcc0c8;text-align:center">Provenance &amp; approval history are retained on export.</div>`
		+ `</div></div></div></div>`;
}

// Clean, self-contained export: no IDE chrome, no provenance dots, no diff UI -- just the
// document's current state as a print-ready HTML page that opens anywhere.
const EXPORT_STYLE = `*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:#1a1c20;font-family:Georgia,'Times New Roman',serif}
.page{max-width:720px;margin:0 auto;padding:56px 48px 80px}
h1{font:600 30px/1.25 system-ui,sans-serif;letter-spacing:-.01em;color:#15151a;margin:0 0 4px}
.subtitle{font:400 13px/1.4 system-ui,sans-serif;color:#8a8a93;margin:0 0 32px}
h2{font:600 17px/1.3 system-ui,sans-serif;color:#26262d;margin:30px 0 10px}
p{font-size:16px;line-height:1.7;margin:0 0 14px}
ul,ol{font-size:16px;line-height:1.7}
table{border-collapse:collapse;width:100%;margin:6px 0 16px;font:400 13px/1.4 system-ui,sans-serif}
th{background:#f7f7f9;color:#86868f;text-align:right;padding:9px 12px;border-bottom:1px solid #e6e6ea;font-weight:600}
th:first-child,td:first-child{text-align:left}
td{padding:9px 12px;border-bottom:1px solid #f0f0f3;text-align:right}
.up{color:#1f7a44}.down{color:#b4332f}
code{font-family:ui-monospace,monospace;background:#f3f3f5;border-radius:4px;padding:1px 5px}
pre{background:#f7f7f9;border:1px solid #ececf0;border-radius:8px;padding:14px 16px;overflow:auto}
blockquote{margin:0 0 14px;padding:2px 16px;border-left:3px solid #e1e2e8;color:#6a6a73}
footer{margin-top:48px;padding-top:14px;border-top:1px solid #eee;font:400 11px/1.5 system-ui,sans-serif;color:#a3a8b2}`;

/** Build a standalone, shareable HTML page from a document's current (resolved) state. */
export function renderExportHtml(doc: ILivingDoc, resolved: ReadonlyMap<string, string> = EMPTY_RESOLVED): string {
	const body = renderGenericMarkdown(renderExportMarkdown(doc, resolved));
	const footer = `<footer>Exported from Abstract &middot; Living Document</footer>`;
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${EXPORT_STYLE}</style></head><body><main class="page">${body}${footer}</main></body></html>`;
}

/**
 * Build a clean, static Markdown document from a document's current (resolved) state: the bind links
 * collapse to their resolved values, so there are no bindings and no metadata -- just portable
 * Markdown that opens anywhere (Obsidian, GitHub, a share).
 */
export function renderExportMarkdown(doc: ILivingDoc, resolved: ReadonlyMap<string, string> = EMPTY_RESOLVED): string {
	if (!doc.isLiving) {
		// Plain Markdown already is its own clean export.
		return doc.body.trim() + '\n';
	}
	const parts: string[] = [`# ${doc.title}`];
	if (doc.subtitle) { parts.push(`_${doc.subtitle}_`); }
	for (const block of doc.blocks) {
		if (block.type === 'heading') {
			parts.push(`${'#'.repeat(block.level ?? 2)} ${block.text}`);
		} else {
			parts.push(bindToValue(reconcileBindLinks(block.text, resolved)));
		}
	}
	return parts.join('\n\n') + '\n';
}
