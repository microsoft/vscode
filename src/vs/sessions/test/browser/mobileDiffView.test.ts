/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { ITextFileService } from '../../../workbench/services/textfile/common/textfiles.js';
import { IFileDiffViewData, MobileDiffView } from '../../browser/parts/mobile/contributions/mobileDiffView.js';

suite('MobileDiffView resource presentation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const modifiedURI = URI.parse('snapshot:/change.txt');
	const diff: IFileDiffViewData = { originalURI: undefined, modifiedURI, identical: false, added: 1, removed: 0 };
	const language = upcastPartial<ILanguageService>({ guessLanguageIdByFilepathOrFirstLine: () => 'plaintext' });

	for (const custom of [false, true]) {
		test(`${custom ? 'custom' : 'default'} reads use only the selected resource provider`, async () => {
			const container = dom.$('div');
			const reads: string[] = [];
			const files = upcastPartial<ITextFileService>({
				read: async uri => {
					reads.push(`file:${uri.toString()}`);
					return upcastPartial<Awaited<ReturnType<ITextFileService['read']>>>({ value: '' });
				},
			});
			store.add(new MobileDiffView(container, { diff }, files, language, custom ? async uri => {
				reads.push(`model:${uri.toString()}`);
				return '';
			} : undefined));
			await timeout(0);
			assert.deepStrictEqual({ reads, text: container.querySelector('.mobile-diff-output')?.textContent }, {
				reads: [`${custom ? 'model' : 'file'}:${modifiedURI.toString()}`], text: 'No changes in this file.',
			});
		});
	}

	test('a failed custom read replaces loading with an accessible error', async () => {
		const container = dom.$('div');
		store.add(new MobileDiffView(container, { diff }, upcastPartial<ITextFileService>({}), language, async () => {
			throw new Error('Snapshot expired');
		}));
		await timeout(0);
		assert.deepStrictEqual({
			text: container.querySelector('.mobile-diff-output')?.textContent,
			alert: container.querySelector('[role="alert"]')?.textContent,
		}, { text: 'Unable to load changes: Snapshot expired', alert: 'Unable to load changes: Snapshot expired' });
	});

	test('a late read failure cannot overwrite the next file or recreate a disposed overlay', async () => {
		const container = dom.$('div');
		const deferred = new DeferredPromise<string>();
		const next = { ...diff, modifiedURI: URI.parse('snapshot:/next.txt') };
		const view = store.add(new MobileDiffView(container, { diff, siblings: [diff, next] }, upcastPartial<ITextFileService>({}), language,
			async uri => uri.path === '/change.txt' ? deferred.p : ''));
		container.querySelector<HTMLButtonElement>('.mobile-diff-nav-btn.next')!.click();
		await timeout(0);
		await deferred.error(new Error('Old snapshot expired'));
		await timeout(0);
		const text = container.querySelector('.mobile-diff-output')?.textContent;
		const alert = container.querySelector('[role="alert"]');
		view.dispose();
		assert.deepStrictEqual({ text, alert, children: container.childElementCount }, { text: 'No changes in this file.', alert: null, children: 0 });
	});
});
