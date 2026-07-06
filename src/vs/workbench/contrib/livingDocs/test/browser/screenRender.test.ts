/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILivingDocSummary, ISourceInfo, ITemplateInfo } from '../../common/livingDocs.js';
import { summariseProjectRun } from '../../common/livingDocsModel.js';
import { IScreenState, renderScreenHtml, ScreenId } from '../../browser/screenRender.js';

suite('livingDocs screenRender', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const state: IScreenState = { knScope: 'org', agents: [], filter: 'all' };

	// Every main-area screen carries the comp's global top bar: brand + per-screen crumb on the left,
	// the sync-status pill + Present + the user avatar on the right.
	const screens: { id: ScreenId; crumb: string }[] = [
		{ id: 'home', crumb: 'Home' },
		{ id: 'templates', crumb: 'Templates' },
		{ id: 'knowledge', crumb: 'Knowledge' },
		{ id: 'agents', crumb: 'Agents' },
	];

	for (const { id, crumb } of screens) {
		test(`${id} renders the global top bar (brand, ${crumb} crumb, sync pill, Present, avatar)`, () => {
			const html = renderScreenHtml(id, state);
			const head = html.indexOf('class="topbar"');
			assert.ok(head >= 0, 'has a top bar');
			// The top bar precedes the screen content (it is the first flex child of .screen).
			assert.ok(head < html.indexOf('class="scr-body"') || html.indexOf('class="scr-body"') === -1, 'top bar is above the body');
			assert.ok(html.includes('Abstract'), 'shows the product brand');
			assert.ok(html.includes(`class="crumb">${crumb}<`), `crumb reads ${crumb}`);
			assert.ok(html.includes('All sources synced'), 'shows the sync-status pill');
			assert.ok(/data-msg="present"[^>]*class="tb-present"|class="tb-present"[^>]*data-msg="present"/.test(html), 'has a Present control wired to the present message');
			assert.ok(html.includes('class="av">TS<'), 'shows the user avatar');
		});
	}

	test('exactly one top bar is rendered per screen', () => {
		for (const { id } of screens) {
			const html = renderScreenHtml(id, state);
			assert.strictEqual(html.split('class="topbar"').length - 1, 1, `${id} has a single top bar`);
		}
	});

	// --- Home reflects the real open folder (the folder IS the project; decision #39) ---

	function summary(path: string, title: string, isLiving: boolean, pendingCount = 0): ILivingDocSummary {
		return { resource: URI.file(path), title, isLiving, sourceKinds: isLiving ? ['file'] : [], sources: isLiving ? ['metrics.csv'] : [], lastSynced: '', pendingCount };
	}

	test('home with no folder open shows the empty state and an Open folder action (no demo projects)', () => {
		const html = renderScreenHtml('home', { ...state, hasFolder: false });
		assert.ok(html.includes('Open a folder to begin'), 'shows the empty-state prompt');
		assert.ok(/data-msg="openFolder"/.test(html), 'the empty state has an Open folder action');
		assert.ok(!html.includes('Acme Co') && !html.includes('Job Search 2026'), 'no hardcoded demo project cards');
	});

	test('home with a folder open reflects the real folder: its name as the project, and a NEEDS-YOU card per doc with pending work', () => {
		// The home dashboard (plan 22) leads with the project name + a NEEDS-YOU section: one card per
		// document that has pending changes, each opening that document to review. A doc with no pending
		// work is truthfully absent from NEEDS-YOU (it is not "waiting for you").
		const docs = [summary('/ws/Weekly Update.md', 'Weekly Update', true, 3), summary('/ws/Team Notes.md', 'Team Notes', false, 0)];
		const html = renderScreenHtml('home', { ...state, hasFolder: true, folderName: 'realdocs-test', docs });

		assert.ok(html.includes('realdocs-test'), 'shows the open folder name as the project');
		assert.ok(/NEEDS YOU/.test(html), 'shows the NEEDS-YOU section when a doc has pending work');
		assert.ok(html.includes('Weekly Update'), 'the doc with pending changes is a NEEDS-YOU card');
		assert.strictEqual(html.split('data-msg="openDoc"').length - 1, 1, 'only the doc with pending work carries a Review action');
		assert.ok(!html.includes('Acme Co') && !html.includes('Fund III'), 'no hardcoded demo project cards');
		assert.ok(/data-msg="openFolder"/.test(html) || /data-msg="openFirstDoc"/.test(html), 'the populated home is interactive');
		assert.ok(!html.includes('data-msg="newProject"') && !/>New project</.test(html), 'the no-op New project button is gone');
	});

	// The name-or-template on-ramp (plan 28, iter 4): Home carries a New document primary that opens a sheet
	// with a name field, a Blank-document default (Enter), and each real template as a secondary row.
	test('home offers a New document on-ramp: a name-or-template sheet with blank + real template rows', () => {
		const templates = [template('Weekly report', 'A weekly summary.', ['metrics.csv'], '# {{slot:title}}\n\nMRR is [pending](bind:metrics.mrr).')];
		const html = renderScreenHtml('home', { ...state, hasFolder: true, folderName: 'realdocs-test', docs: [], templates });

		assert.ok(/data-msg="newDocument"[^>]*data-sheet-open="newdoc"|data-sheet-open="newdoc"[^>]*data-msg="newDocument"/.test(html), 'New document opens the on-ramp sheet');
		assert.ok(html.includes('id="sheet-newdoc"'), 'the name-or-template sheet is present');
		assert.ok(/data-sheet-default[^>]*data-msg="newDocument"|data-msg="newDocument"[^>]*data-sheet-default/.test(html), 'Blank document is the Enter default');
		// The real template shows as a secondary row routing to the iter-3 generate flow with the typed name.
		assert.ok(html.includes('OR START FROM A TEMPLATE') && html.includes('Weekly report'), 'the real template is a secondary row');
		assert.ok(html.includes('data-msg="generateFromTemplate"') && html.includes('data-arg="' + esc(templates[0].uri.toString()) + '"'), 'the template row carries its real uri and generates');
	});

	test('home with no templates shows only the blank option in the on-ramp (real data only)', () => {
		const html = renderScreenHtml('home', { ...state, hasFolder: true, folderName: 'empty', docs: [], templates: [] });
		assert.ok(html.includes('id="sheet-newdoc"'), 'the on-ramp sheet is still present');
		assert.ok(!html.includes('OR START FROM A TEMPLATE'), 'no template section when the folder ships no templates');
	});

	test('home with a folder open but no documents is calmly in-sync (no fabricated cards)', () => {
		const html = renderScreenHtml('home', { ...state, hasFolder: true, folderName: 'empty-folder', docs: [] });
		assert.ok(html.includes('empty-folder'), 'still shows the open folder name');
		assert.ok(/in sync/i.test(html), 'shows the calm in-sync summary when nothing pends');
		assert.ok(!/NEEDS YOU/.test(html), 'no NEEDS-YOU section when there is no pending work');
		assert.ok(!html.includes('Acme Co') && !html.includes('Fund III'), 'no hardcoded demo project cards');
	});

	// --- Templates (plan 28): the real template library, driven by listTemplates() ---

	function template(name: string, description: string, sources: readonly string[], body: string): ITemplateInfo {
		return { uri: URI.file(`/ws/templates/${name}.template.md`), name, description, sources, body };
	}

	test('templates screen lists real cards with true slot/source counts and Use/Edit/New wired', () => {
		const templates = [
			template('Weekly report', 'A weekly operating summary.', ['metrics.csv'], '# {{slot:title}}\n\nWeek {{slot:week}}\n\nMRR is [pending](bind:metrics.mrr).'),
			template('Client update', 'A warm progress note.', [], '# {{slot:client}}\n\nProgress.'),
		];
		const html = renderScreenHtml('templates', { ...state, templates });

		assert.ok(html.includes('Weekly report') && html.includes('Client update'), 'lists every discovered template by name');
		assert.ok(html.includes('A weekly operating summary.'), 'shows the authored description');
		// True counts: Weekly report has 2 slots + 1 source; Client update has 1 slot + 0 sources.
		assert.ok(html.includes('2 slots &middot; 1 source'), 'Weekly report shows the true 2 slots / 1 source count');
		assert.ok(html.includes('1 slot &middot; 0 sources'), 'Client update shows the true 1 slot / 0 sources count');
		// Actions wired to the real template uri. Use Template opens the D28-B generate sheet and posts the
		// generateFromTemplate message (plan 28, iter 3); Edit opens the file; New Template is present.
		assert.strictEqual(html.split('data-msg="generateFromTemplate"').length - 1, 3, 'each card wires Use Template to generate, plus the sheet submit');
		assert.strictEqual(html.split('data-sheet-open="generate"').length - 1, 2, 'each card opens the generate sheet');
		assert.strictEqual(html.split('data-msg="editTemplate"').length - 1, 2, 'each card has an Edit action');
		assert.ok(html.includes('data-arg="' + esc(templates[0].uri.toString()) + '"'), 'the action carries the real template uri');
		assert.ok(/data-msg="newTemplate"/.test(html), 'New Template is wired');
		// The generate sheet itself: a required document-name field and a Generate Draft submit (D28-B).
		assert.ok(html.includes('id="sheet-generate"') && html.includes('Generate Draft'), 'the calm generate sheet is present with a Generate Draft action');
		assert.ok(/data-field="name"/.test(html) && /data-field="note"/.test(html), 'the sheet has a name field and an optional note field');
	});

	test('templates screen shows a calm empty state with Create your first template, no fake preview', () => {
		const html = renderScreenHtml('templates', { ...state, templates: [] });
		assert.ok(/No templates yet/i.test(html), 'shows the empty-state line');
		assert.ok(/data-msg="newTemplate"/.test(html) && html.includes('Create your first template'), 'offers to create the first template');
		// The old mockup content is gone (no fabricated draft / resolved-slots preview).
		assert.ok(!html.includes('Weekly Operating Summary') && !html.includes('ALL SLOTS RESOLVED'), 'no fabricated draft preview');
	});

	test('templates screen carries no "Soon" labels', () => {
		const withTemplates = renderScreenHtml('templates', { ...state, templates: [template('T', 'd', [], 'body {{slot:x}}')] });
		const empty = renderScreenHtml('templates', { ...state, templates: [] });
		assert.ok(!/\bSoon\b/i.test(withTemplates) && !/\bSoon\b/i.test(empty), 'zero "Soon" labels on the Templates screen');
	});

	// --- Knowledge: the project's real source registry (plan 29, D29-A) ---

	function source(id: string, kind: 'file' | 'api', fresh: boolean, usedBy: { path: string; title: string; keys: string[]; context?: boolean }[]): ISourceInfo {
		return {
			id, kind,
			label: kind === 'api' ? new URL(id).host : id,
			syncedAt: new Date().toISOString(),
			fresh,
			usedBy: usedBy.map(u => ({ doc: URI.file(u.path), title: u.title, keys: u.keys, context: !!u.context })),
		};
	}

	test('Knowledge Project tab renders the real SOURCES table with per-source freshness and the used-by count', () => {
		const sources = [
			source('metrics.csv', 'file', true, [
				{ path: '/ws/Weekly.md', title: 'Weekly Summary', keys: ['metrics.mrr', 'metrics.signups'] },
				{ path: '/ws/Board.md', title: 'Board Note', keys: ['metrics.mrr'] },
			]),
			source('https://api.example.com/repo', 'api', false, [{ path: '/ws/Eco.md', title: 'Ecosystem', keys: ['repo.stars'] }]),
		];
		const html = renderScreenHtml('knowledge', { ...state, knScope: 'project', sources });
		assert.ok(html.includes('metrics.csv'), 'the file source label shows');
		assert.ok(html.includes('api.example.com'), 'the api source shows its host label');
		assert.ok(html.includes('2 docs'), 'the shared CSV shows a used-by count of 2');
		assert.ok(html.includes('Fresh'), 'a fresh source shows the fresh state');
		assert.ok(html.includes('Source changed'), 'a stale source shows the truthful changed state');
		assert.ok(!/\bSoon\b/i.test(html), 'the Project tab carries no "Soon" label');
		assert.ok(/data-msg="selectSource"[^>]*data-arg="metrics.csv"/.test(html), 'a source row selects into its detail drawer');
		assert.ok(/data-sheet-open="addsource"/.test(html), 'an Add source action is wired');
	});

	test('Knowledge Project tab shows the honest empty state when no source is referenced', () => {
		const html = renderScreenHtml('knowledge', { ...state, knScope: 'project', sources: [] });
		assert.ok(html.includes('No sources yet'), 'the honest empty registry state');
		assert.ok(!/\bSoon\b/i.test(html), 'the empty Project tab fabricates nothing (no "Soon")');
	});

	test('Knowledge source drawer lists the dependent documents with jump-to-doc and Detach', () => {
		const sources = [source('metrics.csv', 'file', true, [
			{ path: '/ws/Weekly.md', title: 'Weekly Summary', keys: ['metrics.mrr'] },
			{ path: '/ws/Notes.md', title: 'Market notes', keys: [], context: true },
		])];
		const html = renderScreenHtml('knowledge', { ...state, knScope: 'project', sources, knSelectedSource: 'metrics.csv' });
		assert.ok(html.includes('USED BY 2 DOCUMENTS'), 'the drawer names the two dependent documents');
		assert.ok(html.includes('metrics.mrr'), 'a value dependency shows its bind key');
		assert.ok(html.includes('Context reference'), 'a context dependency is labelled as influence, not a fake key');
		assert.ok(/data-msg="openDoc"[^>]*data-arg="[^"]*Weekly\.md"/.test(html), 'jump-to-doc opens the dependent document');
		assert.ok(/data-msg="detachSource"/.test(html), 'each dependency has a Detach action');
		assert.ok(html.includes('&quot;context&quot;:true'), 'the detach arg records whether the use is a context reference');
	});

	test('Knowledge Organization tab is an honest "Soon", never fabricated org content', () => {
		const html = renderScreenHtml('knowledge', { ...state, knScope: 'org', sources: [] });
		assert.ok(/\bSOON\b/i.test(html), 'the Org tab is labelled Soon');
		assert.ok(!html.includes('Mission') && !html.includes('OKRs'), 'no fabricated mission/OKR decision stack');
	});

	test('Knowledge Add-source sheet offers the real folder data files and the project documents', () => {
		const docs = [summary('/ws/Weekly.md', 'Weekly Summary', true)];
		const html = renderScreenHtml('knowledge', { ...state, knScope: 'project', sources: [], docs, dataFiles: ['metrics.csv', 'pipeline.json'] });
		assert.ok(/id="sheet-addsource"/.test(html), 'the Add-source sheet is present');
		assert.ok(html.includes('pipeline.json') && html.includes('metrics.csv'), 'the folder data files are offered as picker rows');
		assert.ok(/data-field="target"[\s\S]*Weekly Summary/.test(html), 'the target-document picker lists the project documents');
		assert.ok(/data-msg="addSourceApi"/.test(html), 'an API endpoint can be added as a source');
	});

	// --- project-run: Stop the fan-out with truthful per-doc states (plan 27 iter 4) ---

	const runDocs = [{ docId: 'a', docTitle: 'Access Control' }, { docId: 'b', docTitle: 'Acceptable Use' }];

	test('an in-flight project-run shows a Stop run control and the Live pill (plan 27 iter 4)', () => {
		const html = renderScreenHtml('project-run', {
			...state, projectRun: {
				instruction: 'Apply the review across every policy', inFlight: true,
				summary: summariseProjectRun(runDocs, []), working: runDocs.map(d => d.docId), decisions: [],
			},
		});
		assert.ok(/data-msg="stopProjectRun"/.test(html), 'a Stop run control is wired while in flight');
		assert.ok(html.includes('Stop run'), 'the control reads Stop run');
		assert.ok(html.includes('Live'), 'the topbar shows the Live pill while running');
	});

	test('a stopped project-run renders skipped tiles, a Stopped state and no Stop control (plan 27 iter 4)', () => {
		// A stopped whole-project run: nothing settled, so both documents are honestly skipped (never ran),
		// the topbar reads Stopped, and the Stop control is gone (there is nothing left to stop).
		const html = renderScreenHtml('project-run', {
			...state, projectRun: {
				instruction: 'Apply the review across every policy', inFlight: false, stopped: true,
				summary: summariseProjectRun(runDocs, [], true), working: [], decisions: [],
			},
		});
		assert.ok(html.includes('skipped'), 'not-yet-run documents render as skipped, not "no change"');
		assert.ok(!/data-msg="stopProjectRun"/.test(html), 'no Stop control once the run has stopped');
		assert.ok(html.includes('Stopped'), 'the topbar shows the Stopped state');
		assert.ok(html.includes('Run stopped'), 'the swarm heading reflects the stop honestly');
	});

	// The renderer escapes the same way the screen does, so a uri assertion matches the emitted attribute.
	function esc(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}
});
