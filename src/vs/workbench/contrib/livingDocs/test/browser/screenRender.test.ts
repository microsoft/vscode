/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILivingDocSummary, ITemplateInfo } from '../../common/livingDocs.js';
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
		// Actions wired to the real template uri.
		assert.strictEqual(html.split('data-msg="useTemplate"').length - 1, 2, 'each card has a Use Template action');
		assert.strictEqual(html.split('data-msg="editTemplate"').length - 1, 2, 'each card has an Edit action');
		assert.ok(html.includes('data-arg="' + esc(templates[0].uri.toString()) + '"'), 'the action carries the real template uri');
		assert.ok(/data-msg="newTemplate"/.test(html), 'New Template is wired');
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

	// The renderer escapes the same way the screen does, so a uri assertion matches the emitted attribute.
	function esc(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}
});
