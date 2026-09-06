/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { EventType as TouchEventType } from '../../../base/browser/touch.js';
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
		const virtualContent = container.querySelector('.mobile-multi-diff-virtual-content') as HTMLElement | null;
		assert.ok(virtualContent, 'virtual content should exist');

		let appendChildCount = 0;
		const originalAppendChild = virtualContent.appendChild;
		virtualContent.appendChild = function <T extends Node>(node: T): T {
			appendChildCount++;
			return originalAppendChild.call(this, node) as T;
		};
		store.add(toDisposable(() => {
			virtualContent.appendChild = originalAppendChild;
		}));

		scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
		scrollWrapper.dispatchEvent(new Event('scroll'));
		await animationFrames(2);

		assert.ok(readUris.length > initialReadCount, 'scrolling should load more files');
		assert.ok(readUris.length <= initialReadCount + 4, 'scrolling should load at most one additional file pair per frame');
		const mountedSectionsAfterScroll = container.querySelectorAll('.mobile-multi-diff-file-section').length;
		assert.ok(mountedSectionsAfterScroll > 0, 'scrolling should mount file sections for the new viewport');
		assert.ok(mountedSectionsAfterScroll < fileCount, 'scrolling should still not mount every file section');

		scrollWrapper.scrollTop = 0;
		scrollWrapper.dispatchEvent(new Event('scroll'));
		await animationFrames(2);

		assert.strictEqual(new Set(readUris).size, readUris.length, 'remounting loaded files should not reread resources');
		assert.strictEqual(appendChildCount, 0, 'scrolling should not reappend mounted file sections');

		view.dispose();
	});

	test('uses a larger tappable file header to expand and collapse sections', async () => {
		const originalURI = URI.parse('inmemory://original/src/toggle.ts');
		const modifiedURI = URI.parse('inmemory://modified/src/toggle.ts');
		const files = new Map<string, string>([
			[originalURI.toString(), 'export const value = 1;\n'],
			[modifiedURI.toString(), 'export const value = 2;\n'],
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
				added: 1,
				removed: 1,
			}]
		}, textFileService, fileService, languageService));

		const section = container.querySelector('.mobile-multi-diff-file-section') as HTMLElement | null;
		assert.ok(section, 'file section should exist');
		const header = section.querySelector('.mobile-multi-diff-file-header') as HTMLElement | null;
		assert.ok(header, 'file header should exist');
		const chevron = header.querySelector('.mobile-multi-diff-file-chevron') as HTMLElement | null;
		assert.ok(chevron, 'file header chevron should exist');
		assert.strictEqual(mainWindow.getComputedStyle(header).height, '44px', 'file header should be a touch-friendly height');

		header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		assert.ok(section.classList.contains('collapsed'), 'tapping the header should collapse the file section');
		assert.strictEqual(chevron.getAttribute('aria-expanded'), 'false');

		chevron.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		assert.ok(!section.classList.contains('collapsed'), 'tapping the chevron should expand once without bubbling into a second toggle');
		assert.strictEqual(chevron.getAttribute('aria-expanded'), 'true');

		chevron.dispatchEvent(new Event(TouchEventType.Tap, { bubbles: true, cancelable: true }));
		assert.ok(section.classList.contains('collapsed'), 'touch tapping the chevron should collapse through the header target');
		assert.strictEqual(chevron.getAttribute('aria-expanded'), 'false');

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

	test('prefetches the next file near a boundary without mounting its section', async () => {
		const fileCount = 3;
		const lineCount = 200;
		const files = new Map<string, string>();
		const diffs: IFileDiffViewData[] = [];

		for (let i = 0; i < fileCount; i++) {
			const originalURI = URI.parse(`inmemory://original/src/prefetch${i}.ts`);
			const modifiedURI = URI.parse(`inmemory://modified/src/prefetch${i}.ts`);
			files.set(originalURI.toString(), Array.from({ length: lineCount }, (_, line) => `export const value${line} = ${line};`).join('\n'));
			files.set(modifiedURI.toString(), Array.from({ length: lineCount }, (_, line) => `export const value${line} = ${line + 1000};`).join('\n'));
			diffs.push({
				originalURI,
				modifiedURI,
				identical: false,
				added: lineCount,
				removed: lineCount,
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
		await waitForCondition(() => container.querySelectorAll('.mobile-diff-line').length > 0, 'first file should load before prefetching near its boundary');

		assert.ok(readUris.some(uri => uri.includes('prefetch0.ts')), 'opening should read the first file');
		assert.ok(!readUris.some(uri => uri.includes('prefetch1.ts')), 'opening should not immediately prefetch the next large file');

		const scrollWrapper = container.querySelector('.mobile-overlay-scroll') as HTMLElement | null;
		assert.ok(scrollWrapper, 'scroll wrapper should exist');
		scrollWrapper.scrollTop = 5000;
		scrollWrapper.dispatchEvent(new Event('scroll'));

		await waitForCondition(() => readUris.some(uri => uri.includes('prefetch1.ts')), 'approaching a file boundary should prefetch the next file');
		assert.strictEqual(container.querySelector('.mobile-multi-diff-file-section[data-index="1"]'), null, 'prefetching should not mount the next file section');
		assert.ok(!readUris.some(uri => uri.includes('prefetch2.ts')), 'prefetching should stay bounded to the near file');

		view.dispose();
	});

	test('starts loading the newly visible file while an older load is pending', async () => {
		const fileCount = 40;
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
				added: 100,
				removed: 100,
			});
		}

		const readUris: string[] = [];
		const pendingReads = new Map<string, Deferred<{ value: string }>>();
		const textFileService = {
			read(uri: URI) {
				readUris.push(uri.toString());
				const pending = deferred<{ value: string }>();
				pendingReads.set(uri.toString(), pending);
				return pending.promise;
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

		assert.ok(readUris.some(uri => uri.includes('file0.ts')), 'opening the view should start loading the first file');

		const scrollWrapper = container.querySelector('.mobile-overlay-scroll') as HTMLElement | null;
		assert.ok(scrollWrapper, 'scroll wrapper should exist');
		scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
		scrollWrapper.dispatchEvent(new Event('scroll'));
		await animationFrames(3);

		assert.ok(readUris.some(uri => uri.includes(`file${fileCount - 1}.ts`)), 'scrolling should start loading the newly visible file even while the first file is pending');

		view.dispose();
		resolvePendingReads(pendingReads, files);
	});

	test('keeps an unloaded large file body covered by a sticky loading placeholder', async () => {
		const fileCount = 3;
		const files = new Map<string, string>();
		const diffs: IFileDiffViewData[] = [];

		for (let i = 0; i < fileCount; i++) {
			const originalURI = URI.parse(`inmemory://original/src/large${i}.ts`);
			const modifiedURI = URI.parse(`inmemory://modified/src/large${i}.ts`);
			files.set(originalURI.toString(), `export const value${i} = ${i};\n`);
			files.set(modifiedURI.toString(), `export const value${i} = ${i + 1};\n`);
			diffs.push({
				originalURI,
				modifiedURI,
				identical: false,
				added: 1000,
				removed: 1000,
			});
		}

		const pendingReads = new Map<string, Deferred<{ value: string }>>();
		const textFileService = {
			read(uri: URI) {
				const pending = deferred<{ value: string }>();
				pendingReads.set(uri.toString(), pending);
				return pending.promise;
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

		const scrollWrapper = container.querySelector('.mobile-overlay-scroll') as HTMLElement | null;
		assert.ok(scrollWrapper, 'scroll wrapper should exist');
		scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
		scrollWrapper.dispatchEvent(new Event('scroll'));
		await animationFrames(2);

		const placeholderContent = Array.from(container.querySelectorAll('.mobile-multi-diff-file-content-placeholder')) as HTMLElement[];
		const bottomFileContent = placeholderContent.find(content => Number((content.parentElement as HTMLElement).dataset.index) === fileCount - 1);
		assert.ok(bottomFileContent, 'the unloaded file at the new scroll position should render placeholder content');
		assert.strictEqual(bottomFileContent.style.transform, '', 'loading placeholders should not rely on JS scroll transforms');
		assert.ok(bottomFileContent.style.height, 'the placeholder should reserve the file body height');

		const emptyState = bottomFileContent.querySelector('.mobile-diff-empty-state') as HTMLElement | null;
		assert.ok(emptyState, 'the placeholder should contain a loading message');
		assert.ok(emptyState.textContent?.includes('Loading'), 'the placeholder should not be blank');
		assert.ok(emptyState.style.height, 'the placeholder message should reserve visible viewport height');
		assert.strictEqual(mainWindow.getComputedStyle(emptyState).position, 'sticky', 'the loading message should remain visible during native scroll');

		view.dispose();
		resolvePendingReads(pendingReads, files);
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

interface Deferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(r => {
		resolve = r;
	});
	return { promise, resolve };
}

function resolvePendingReads(pendingReads: Map<string, Deferred<{ value: string }>>, files: Map<string, string>): void {
	for (const [uri, pending] of pendingReads) {
		pending.resolve({ value: files.get(uri) ?? '' });
	}
}
