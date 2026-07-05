/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILivingDocSummary } from '../../common/livingDocs.js';
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
});
