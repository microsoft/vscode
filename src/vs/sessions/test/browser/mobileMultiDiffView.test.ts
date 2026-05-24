/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { ITextFileService } from '../../../workbench/services/textfile/common/textfiles.js';
import { MobileMultiDiffView } from '../../browser/parts/mobile/contributions/mobileMultiDiffView.js';
import { IFileDiffViewData } from '../../browser/parts/mobile/contributions/mobileDiffView.js';

suite('MobileMultiDiffView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('loads visible files incrementally instead of batching the initial viewport', async () => {
		const fileCount = 100;
		const files = new Map<string, string>();
		const diffs: IFileDiffViewData[] = [];

		for (let i = 0; i < fileCount; i++) {
			const originalURI = URI.parse(`inmemory://original/src/file${i}.ts`);
			const modifiedURI = URI.parse(`inmemory://modified/src/file${i}.ts`);
			files.set(originalURI.toString(), `export const value${i} = ${i};\n`);
			files.set(modifiedURI.toString(), `export const value${i} = ${i + 1};\n`);
			diffs.push({
				originalURI,
				modifiedURI,
				identical: false,
				added: 1,
				removed: 1,
			});
		}

		const readUris: string[] = [];
		const textFileService = {
			read(uri: URI) {
				readUris.push(uri.toString());
				return Promise.resolve({ value: files.get(uri.toString()) ?? '' });
			}
		} as unknown as ITextFileService;

		const fileService = {} as IFileService;
		const languageService = {
			guessLanguageIdByFilepathOrFirstLine(): string {
				return 'typescript';
			}
		} as unknown as ILanguageService;

		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		const view = store.add(new MobileMultiDiffView(container, { diffs }, textFileService, fileService, languageService));
		await animationFrame();
		await animationFrame();

		const initialReadCount = readUris.length;
		assert.strictEqual(initialReadCount, 2, 'opening the view should load one visible file pair');
		const initialMountedSections = container.querySelectorAll('.mobile-multi-diff-file-section').length;
		assert.ok(initialMountedSections > 0, 'opening the view should mount visible file sections');
		assert.ok(initialMountedSections < fileCount, 'opening the view should not mount every file section');

		const scrollWrapper = container.querySelector('.mobile-overlay-scroll') as HTMLElement | null;
		assert.ok(scrollWrapper, 'scroll wrapper should exist');

		scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
		scrollWrapper.dispatchEvent(new Event('scroll'));
		await animationFrame();
		await animationFrame();

		assert.ok(readUris.length > initialReadCount, 'scrolling should load more files');
		assert.ok(readUris.length <= initialReadCount + 2, 'scrolling should load at most one additional file pair per frame');
		const mountedSectionsAfterScroll = container.querySelectorAll('.mobile-multi-diff-file-section').length;
		assert.ok(mountedSectionsAfterScroll > 0, 'scrolling should mount file sections for the new viewport');
		assert.ok(mountedSectionsAfterScroll < fileCount, 'scrolling should still not mount every file section');

		scrollWrapper.scrollTop = 0;
		scrollWrapper.dispatchEvent(new Event('scroll'));
		await animationFrame();
		await animationFrame();

		assert.strictEqual(new Set(readUris).size, readUris.length, 'remounting loaded files should not reread resources');

		view.dispose();
	});
});

function animationFrame(): Promise<void> {
	return new Promise(resolve => mainWindow.requestAnimationFrame(() => resolve()));
}
