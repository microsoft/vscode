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
		await animationFrames(2);

		const initialReadCount = readUris.length;
		assert.strictEqual(initialReadCount, 2, 'opening the view should load one visible file pair');
		const initialMountedSections = container.querySelectorAll('.mobile-multi-diff-file-section').length;
		assert.ok(initialMountedSections > 0, 'opening the view should mount visible file sections');
		assert.ok(initialMountedSections < fileCount, 'opening the view should not mount every file section');

		const scrollWrapper = container.querySelector('.mobile-overlay-scroll') as HTMLElement | null;
		assert.ok(scrollWrapper, 'scroll wrapper should exist');

		scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
		scrollWrapper.dispatchEvent(new Event('scroll'));
		await animationFrames(2);

		assert.ok(readUris.length > initialReadCount, 'scrolling should load more files');
		assert.ok(readUris.length <= initialReadCount + 2, 'scrolling should load at most one additional file pair per frame');
		const mountedSectionsAfterScroll = container.querySelectorAll('.mobile-multi-diff-file-section').length;
		assert.ok(mountedSectionsAfterScroll > 0, 'scrolling should mount file sections for the new viewport');
		assert.ok(mountedSectionsAfterScroll < fileCount, 'scrolling should still not mount every file section');

		scrollWrapper.scrollTop = 0;
		scrollWrapper.dispatchEvent(new Event('scroll'));
		await animationFrames(2);

		assert.strictEqual(new Set(readUris).size, readUris.length, 'remounting loaded files should not reread resources');

		view.dispose();
	});

	test('virtualizes rows inside a loaded large file body', async () => {
		const lineCount = 200;
		const originalURI = URI.parse('inmemory://original/src/large.ts');
		const modifiedURI = URI.parse('inmemory://modified/src/large.ts');
		const originalText = Array.from({ length: lineCount }, (_, i) => `export const fileValue${i} = ${i};`).join('\n');
		const modifiedText = Array.from({ length: lineCount }, (_, i) => `export const fileValue${i} = ${i + 1000};`).join('\n');
		const files = new Map<string, string>([
			[originalURI.toString(), originalText],
			[modifiedURI.toString(), modifiedText],
		]);

		const textFileService = {
			read(uri: URI) {
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

		const view = store.add(new MobileMultiDiffView(container, {
			diffs: [{
				originalURI,
				modifiedURI,
				identical: false,
				added: lineCount,
				removed: lineCount,
			}]
		}, textFileService, fileService, languageService));
		await waitForCondition(() => container.querySelectorAll('.mobile-diff-line').length > 0, 'loaded file should render visible rows');

		const renderedRows = container.querySelectorAll('.mobile-diff-line').length;
		assert.ok(renderedRows < lineCount * 2, 'loaded file should not render every diff row');

		const bodyInner = container.querySelector('.mobile-multi-diff-file-content-inner') as HTMLElement | null;
		assert.ok(bodyInner, 'loaded file should render a stable body wrapper');
		assertEntryOrder(container);

		const scrollWrapper = container.querySelector('.mobile-overlay-scroll') as HTMLElement | null;
		assert.ok(scrollWrapper, 'scroll wrapper should exist');
		scrollWrapper.scrollTop = 1200;
		scrollWrapper.dispatchEvent(new Event('scroll'));
		await waitForCondition(() => container.querySelector('.mobile-multi-diff-file-content-inner') === bodyInner, 'scrolling should keep the same body wrapper');

		const renderedRowsAfterScroll = container.querySelectorAll('.mobile-diff-line').length;
		assert.ok(renderedRowsAfterScroll < lineCount * 2, 'scrolling should keep rendering only the visible diff rows');
		assertEntryOrder(container);

		view.dispose();
	});
});

function animationFrame(): Promise<void> {
	return new Promise(resolve => mainWindow.requestAnimationFrame(() => resolve()));
}

async function animationFrames(count: number): Promise<void> {
	for (let i = 0; i < count; i++) {
		await animationFrame();
	}
}

async function waitForCondition(condition: () => boolean, message: string): Promise<void> {
	for (let i = 0; i < 60; i++) {
		if (condition()) {
			return;
		}
		await animationFrame();
	}
	assert.fail(message);
}

function assertEntryOrder(container: HTMLElement): void {
	const indexes = Array.from(container.querySelectorAll('.mobile-multi-diff-body-entry'), element => Number((element as HTMLElement).dataset.entryIndex));
	assert.deepStrictEqual(indexes, indexes.slice().sort((a, b) => a - b), 'rendered body entries should stay in document order');
}
