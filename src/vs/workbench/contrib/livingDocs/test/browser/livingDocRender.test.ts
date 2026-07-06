/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILivingDocRenderInput, IPresentState, PresentChoice, renderLivingDocContent, renderLivingDocHtml } from '../../browser/livingDocRender.js';
import { ILivingDoc } from '../../common/livingDocsModel.js';

// Plan 15 iter 5 flipped the default: every living document now opens in the unified ProseMirror surface
// ('pm'), the bespoke renderDoc HTML body is retired, and the calm chrome (formatting toolbar + Present)
// lives in PM. These tests assert the PM default and the absence of the old renderDoc body.
suite('livingDocs render (PM default - renderLivingDocHtml)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const doc: ILivingDoc = {
		title: 'Weekly Operating Summary', subtitle: 'Week 24',
		sources: ['metrics.csv'], context: [], blocks: [], isLiving: true, body: '',
	};

	function html(present: IPresentState): string {
		const input: ILivingDocRenderInput = {
			doc, pending: [], resolved: new Map(), dirty: false, status: '',
			recent: new Set(), mode: 'pm', rawText: '', present, syncDiff: [],
		};
		return renderLivingDocHtml(input);
	}

	// (plan 33 iter 4, L8) Present is honest: only the two exports Abstract genuinely writes (a
	// self-contained HTML page and clean Markdown) are selectable; the native-format / cloud
	// destinations are shown as "Soon" and cannot be chosen or fired.
	test('Present offers exactly the two real exports as selectable, and marks the rest "Soon"', () => {
		const h = html({ open: true, choice: 'html' });
		// The two real destinations are selectable (carry a data-present-choice hook).
		assert.ok(h.includes('data-present-choice="html"'), 'HTML export is selectable');
		assert.ok(h.includes('data-present-choice="markdown"'), 'Markdown export is selectable');
		// The four aspirational destinations are listed but NOT selectable and carry a Soon marker.
		const soon: PresentChoice[] = ['gdoc', 'gsheet', 'docx', 'xlsx'];
		for (const k of soon) {
			assert.ok(!h.includes(`data-present-choice="${k}"`), `${k} is not selectable`);
		}
		assert.ok(h.includes('SOON'), 'a Soon marker is shown for the not-yet-real destinations');
		// No fabricated hosting / access-control / shareable URL is claimed anywhere.
		assert.ok(!h.includes('WHO CAN ACCESS'), 'no fabricated access-control section');
		assert.ok(!h.includes('opportunity-os'), 'no old-brand fabricated shareable URL');
	});

	test('the editor top bar carries the user avatar, matching the screens and the comp', () => {
		const input: ILivingDocRenderInput = {
			doc, pending: [], resolved: new Map(), dirty: false, status: 'All sources synced',
			recent: new Set(), mode: 'pm', rawText: '', present: { open: false, choice: 'html' }, syncDiff: [],
		};
		const h = renderLivingDocHtml(input);
		assert.ok(h.includes('class="topbar"') && h.includes('class="av">TS<'), 'top bar shows the TS avatar');
	});

	test('the Present CTA reflects the real export it will write', () => {
		assert.ok(html({ open: true, choice: 'html' }).includes('Export web page'), 'HTML choice CTA writes a web page');
		assert.ok(html({ open: true, choice: 'markdown' }).includes('Export Markdown'), 'Markdown choice CTA writes Markdown');
	});

	test('a living doc renders the unified ProseMirror surface (not the retired renderDoc body), and bound figures round-trip into PM as bind links', () => {
		const body = 'Revenue grew [12%](bind:metrics.mrr.delta) week-on-week.\n';
		const boundDoc: ILivingDoc = {
			title: 'Weekly', subtitle: 'Week 24', sources: ['metrics.csv'], context: [], isLiving: true,
			body, blocks: [{
				id: 'b1', type: 'paragraph', level: undefined,
				text: 'Revenue grew [12%](bind:metrics.mrr.delta) week-on-week.',
				binds: [{ key: 'metrics.mrr.delta', value: '12%' }],
			}],
		};
		const content = renderLivingDocContent({
			doc: boundDoc, pending: [], resolved: new Map([['metrics.mrr.delta', '+18%']]), dirty: false,
			status: '', recent: new Set(), mode: 'pm', rawText: body,
			present: { open: false, choice: 'html' }, syncDiff: [],
		});
		assert.deepStrictEqual({
			// the document IS the ProseMirror writing surface
			isPmSurface: content.html.includes('id="pm-root"'),
			// the bind link is handed to PM (the bundle renders it as the bound_figure atom node client-side)
			pmCarriesBindLink: content.pmMd?.includes('[12%](bind:metrics.mrr.delta)') ?? false,
			// the retired renderDoc body is gone: no server-rendered grid / bound span / contenteditable block
			noRenderDocGrid: !content.html.includes('class="docwrap"') && !content.html.includes('class="gutter2'),
			noServerBoundSpan: !content.html.includes('class="bound" data-cells='),
			noContentEditableBlock: !content.html.includes('contenteditable="true"'),
		}, {
			isPmSurface: true,
			pmCarriesBindLink: true,
			noRenderDocGrid: true,
			noServerBoundSpan: true,
			noContentEditableBlock: true,
		});
	});

	test('source-peek is a bottom in-surface drawer (never splits the editor): grip + header + sync action over the CSV grid', () => {
		const h = renderLivingDocHtml({
			doc, pending: [], resolved: new Map(), dirty: false, status: '', recent: new Set(),
			mode: 'pm', rawText: '', present: { open: false, choice: 'html' }, syncDiff: [],
			sourcePeek: {
				source: 'metrics.csv', referencedBy: [], synced: false, syncedCount: 0,
				rows: [{ key: 'metrics.mrr', value: '$48.6k', selected: true }],
				grid: {
					headers: ['week', 'mrr', 'signups'],
					rows: [['23', '44.9', '389'], ['24', '48.6', '427']],
					latestIndex: 1,
				},
			},
		});
		assert.deepStrictEqual({
			// the comp's bottom drawer, not the old left split pane / floating circle
			isBottomDrawer: h.includes('class="srcdrawer"'),
			hasGrip: h.includes('class="sd-grip"'),
			noLeftSplitPane: !h.includes('class="peekwrap"') && !h.includes('class="srcpane"'),
			noFloatingCircle: !h.includes('class="synccircle"'),
			// sync is now a header primary button, close lives in the header too
			syncIsHeaderButton: h.includes('class="sd-sync" data-sync'),
			closeInHeader: h.includes('class="sd-x" data-source-close'),
			// content preserved: CSV grid + latest-row highlight + bound figures
			hasGridTable: h.includes('class="sp-grid"'),
			hasLatestRow: h.includes('<tr class="sel"><td>24</td><td>48.6</td><td>427</td></tr>'),
			stillHasBoundFigures: h.includes('BOUND FIGURES'),
		}, {
			isBottomDrawer: true, hasGrip: true, noLeftSplitPane: true, noFloatingCircle: true,
			syncIsHeaderButton: true, closeInHeader: true,
			hasGridTable: true, hasLatestRow: true, stillHasBoundFigures: true,
		});
	});

	test('source-peek drawer, once synced, swaps the Sync button for a "N synced" chip', () => {
		const h = renderLivingDocHtml({
			doc, pending: [], resolved: new Map(), dirty: false, status: '', recent: new Set(),
			mode: 'pm', rawText: '', present: { open: false, choice: 'html' }, syncDiff: [],
			sourcePeek: {
				source: 'metrics.csv', referencedBy: [], synced: true, syncedCount: 3,
				rows: [{ key: 'metrics.mrr', value: '$48.6k', selected: true }], grid: undefined,
			},
		});
		assert.deepStrictEqual({
			showsSyncedChip: h.includes('class="sd-synced"') && h.includes('3 synced'),
			noSyncButton: !h.includes('class="sd-sync"'),
		}, { showsSyncedChip: true, noSyncButton: true });
	});

	test('the calm formatting toolbar lives in PM: wired to LWDPM.cmd (data-pmcmd), heading dropdown + B/I/lists/quote, Underline dropped, Present available', () => {
		const input: ILivingDocRenderInput = {
			doc, pending: [], resolved: new Map(), dirty: false, status: 'All sources synced',
			recent: new Set(), mode: 'pm', rawText: '', present: { open: false, choice: 'html' }, syncDiff: [],
		};
		const h = renderLivingDocHtml(input);
		assert.deepStrictEqual({
			pillIsRefresh: h.includes('class="pill ') && h.includes('data-refresh'),
			// the persistent calm toolbar is present and wired to the ProseMirror command bridge, NOT execCommand
			hasCalmToolbar: h.includes('class="etoolbar"'),
			wiredToPmCmd: h.includes('data-pmcmd="bold"') && h.includes('data-pmcmd="italic"'),
			noExecCommand: !h.includes('data-fmt='),
			// heading dropdown (a <select data-pmcmd>) -> paragraph/h1/h2/h3 option values
			hasHeadingDropdown: h.includes('<select class="tb-h" data-pmcmd') && h.includes('value="h2"') && h.includes('value="paragraph"'),
			hasListAndQuote: h.includes('data-pmcmd="bullet_list"') && h.includes('data-pmcmd="ordered_list"') && h.includes('data-pmcmd="blockquote"'),
			// Underline dropped: Markdown / the commonmark schema has no underline mark (calm by subtraction)
			noUnderline: !h.includes('data-pmcmd="underline"') && !h.includes('class="tb-b und"'),
			// the comp pares the toolbar to essentials - none of the old heavy controls
			noLinkToSource: !h.includes('Link to source'),
			noRunSkill: !h.includes('Run skill'),
			noHistoryButton: !h.includes('>History<'),
			// raw Markdown stays reachable via the hint affordance
			rawEditReachable: h.includes('class="hint-raw" data-to-raw'),
			present: h.includes('data-present-open'),
		}, {
			pillIsRefresh: true,
			hasCalmToolbar: true,
			wiredToPmCmd: true,
			noExecCommand: true,
			hasHeadingDropdown: true,
			hasListAndQuote: true,
			noUnderline: true,
			noLinkToSource: true,
			noRunSkill: true,
			noHistoryButton: true,
			rawEditReachable: true,
			present: true,
		});
	});

	// plan 16 iter 6: the formatting toolbar must show for a PLAIN doc too (PM is the one surface) -- a blank
	// new note previously opened with no way to format. The living-only chrome (sync bar, figure hint) stays off.
	test('a plain (non-living) doc in PM still gets the formatting toolbar, without the living-only chrome', () => {
		const plain: ILivingDoc = { title: 'Notes', subtitle: '', sources: [], context: [], blocks: [], isLiving: false, body: '' };
		const content = renderLivingDocContent({
			doc: plain, pending: [], resolved: new Map(), dirty: false, status: '',
			recent: new Set(), mode: 'pm', rawText: '', present: { open: false, choice: 'html' }, syncDiff: [],
		});
		const h = content.html;
		assert.deepStrictEqual({
			hasCalmToolbar: h.includes('class="etoolbar"'),
			wiredToPmCmd: h.includes('data-pmcmd="bold"') && h.includes('data-pmcmd="blockquote"'),
			crumbIsMarkdown: h.includes('class="crumb">Markdown<'),
			// living-only chrome stays off for a plain doc
			noSyncBar: !h.includes('class="syncbar"'),
			noFigureHint: !h.includes('Bound figures are highlighted'),
			// the document is still the PM writing surface
			isPmSurface: h.includes('id="pm-root"'),
		}, {
			hasCalmToolbar: true,
			wiredToPmCmd: true,
			crumbIsMarkdown: true,
			noSyncBar: true,
			noFigureHint: true,
			isPmSurface: true,
		});
	});

	test('raw mode is reachable and offers the way back to the editor without a separate "rendered" mode', () => {
		const raw = renderLivingDocContent({
			doc, pending: [], resolved: new Map(), dirty: false, status: '', recent: new Set(),
			mode: 'raw', rawText: '# Hello', present: { open: false, choice: 'html' }, syncDiff: [],
		});
		assert.deepStrictEqual({
			isRawTextarea: raw.html.includes('class="raw"') && raw.html.includes('# Hello'),
			noPmSurfaceInRaw: raw.pmMd === null,
			wayBack: raw.html.includes('data-apply-raw'),
		}, { isRawTextarea: true, noPmSurfaceInRaw: true, wayBack: true });
	});
});
