/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { assertSnapshot } from '../../../../../base/test/common/snapshot.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { LanguageService } from '../../../../../editor/common/services/languageService.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { SimpleSettingRenderer } from '../../../markdown/browser/markdownSettingRenderer.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { processConditionalBlocks, renderReleaseNotesMarkdown } from '../../browser/releaseNotesEditor.js';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { releaseNotesWithHighlightsVideo } from './releaseNotesTestUtils.js';


suite('Release notes renderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let extensionService: IExtensionService;
	let languageService: ILanguageService;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override async whenInstalledExtensionsRegistered() { return true; }
		});
		instantiationService.stub(ILanguageService, store.add(new LanguageService()));
		extensionService = instantiationService.get(IExtensionService);
		languageService = instantiationService.get(ILanguageService);

		instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
	});

	test('Should render TOC', async () => {
		const content = `<table class="highlights-table">
	<tr>
		<th>a</th>
	</tr>
</table>

<br>

> text

<!-- TOC
<div class="toc-nav-layout">
	<nav id="toc-nav">
		<div>In this update</div>
		<ul>
			<li><a href="#chat">test</a></li>
		</ul>
	</nav>
	<div class="notes-main">
Navigation End -->

## Test`;

		const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer));
		await assertSnapshot(result.toString());
	});

	test('keeps shorthand as inline code without the tryout renderer', async () => {
		const content = '`try(editor.smart-diff,Try Smart Diff Layout)`\n\n<!-- %IF TRYOUTS %\n`try(editor.smart-diff,Conditional Example)`\n%ENDIF % -->';
		const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer));
		assert.strictEqual(result.toString().trim(), '<p><code>try(editor.smart-diff,Try Smart Diff Layout)</code></p>');
	});

	test('preserves the highlights table and renders fenced blocks separately from inline code', async () => {
		const content = '<table class="highlights-table"><tr><th>Editor</th></tr><tr><td><a href="#editor">Highlights</a></td></tr></table>\n\n## Editor\n\nInline `code`.\n\n```typescript\nconst value = 42;\n```\n\n```\nplain code\n```';
		const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer));
		await assertSnapshot(result.toString());
	});

	test('groups marked release highlights without including the following sections', async () => {
		const content = '# Release Notes\n\n<!-- RELEASE_HIGHLIGHTS_START -->\n## Release highlights\n\nSummary.\n\n* [Editor improvements](#editor)\n<!-- RELEASE_HIGHLIGHTS_END -->\n\n## Editor\n\nDetails.';
		const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer));
		await assertSnapshot(result.toString());
	});

	test('strips unmatched highlights markers without wrapping the following content', async () => {
		const content = '<!-- RELEASE_HIGHLIGHTS_START -->\n## Editor\n\nDetails.';
		const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer));
		assert.strictEqual(result.toString(), '<h2 id="editor">Editor</h2>\n<p>Details.</p>\n');
	});

	test('preserves the accessible initially open video through both sanitization passes', async () => {
		for (const mediaBaseUrl of [undefined, 'https://code.visualstudio.com/assets/updates/']) {
			const availability: boolean[] = [];
			const result = await renderReleaseNotesMarkdown(releaseNotesWithHighlightsVideo, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), 'stable', undefined, undefined, undefined, mediaBaseUrl, {
				enabled: true, onDidResolve: available => availability.push(available),
			});
			const document = new mainWindow.DOMParser().parseFromString(result.toString(), 'text/html');
			const disclosure = document.querySelector('details');
			const video = disclosure?.querySelector('video');
			const captions = video?.querySelector('track');
			const base = mediaBaseUrl ?? 'images/';
			assert.deepStrictEqual({
				availability,
				inHighlights: !!disclosure?.closest('.release-notes-highlights'),
				open: disclosure?.open,
				video: video ? ['src', 'poster', 'preload', 'controls', 'playsinline', 'autoplay', 'loop'].map(name => video.getAttribute(name)) : [],
				captions: captions ? ['src', 'kind', 'srclang', 'label', 'default'].map(name => captions.getAttribute(name)) : [],
				transcript: disclosure?.querySelector('.release-highlights-video-transcript')?.getAttribute('href'),
			}, {
				availability: [true], inHighlights: true, open: true,
				video: [`${base}1_147/highlights.mp4`, `${base}1_147/highlights.webp`, 'none', '', '', null, null],
				captions: [`${base}1_147/highlights.en.vtt`, 'captions', 'en', 'English', ''],
				transcript: 'https://code.visualstudio.com/transcript',
			});
		}
	});

	test('control detects the same candidate without rendering any video resources or disclosure', async () => {
		const availability: boolean[] = [];
		const result = await renderReleaseNotesMarkdown(releaseNotesWithHighlightsVideo, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), 'stable', undefined, undefined, undefined, undefined, {
			enabled: false, onDidResolve: available => availability.push(available),
		});
		const document = new mainWindow.DOMParser().parseFromString(result.toString(), 'text/html');
		assert.deepStrictEqual({
			availability,
			video: document.querySelector('details, video, track, source'),
			videoLinks: document.querySelectorAll('.release-highlights-video-transcript, .release-highlights-video-fallback').length,
			highlights: document.querySelector('.release-notes-highlights li')?.textContent,
			remainingLink: document.querySelector('h2#editor + p a')?.getAttribute('href'),
		}, { availability: [true], video: null, videoLinks: 0, highlights: 'Editor improvements', remainingLink: 'https://code.visualstudio.com/docs/editor' });
	});

	test('a video source alone is sufficient and gets an accessible disclosure in treatment', async () => {
		for (const enabled of [false, true]) {
			for (const videoMarkup of ['<video src="images/1_146/demo.mp4"></video>', '<video><source src="images/1_146/demo.mp4"></video>']) {
				const availability: boolean[] = [];
				let invalid = 0;
				const content = `<!-- %IF HIGHLIGHTS_VIDEO %\n${videoMarkup}\n%ENDIF % -->`;
				const html = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), 'stable', undefined, undefined, undefined, 'https://code.visualstudio.com/assets/updates/', {
					enabled, onDidResolve: available => availability.push(available), onInvalid: () => invalid++,
				});
				const document = new mainWindow.DOMParser().parseFromString(html.toString(), 'text/html');
				const disclosure = document.querySelector<HTMLDetailsElement>('details.release-highlights-video');
				const video = disclosure?.querySelector('video');
				assert.deepStrictEqual({
					availability, invalid,
					open: disclosure?.open,
					summary: disclosure?.querySelector('summary')?.textContent,
					label: video?.getAttribute('aria-label'),
					source: video?.getAttribute('src') ?? video?.querySelector('source')?.getAttribute('src'),
					optionalContent: document.querySelector('track, a, [poster]'),
				}, {
					availability: [true], invalid: 0,
					open: enabled ? true : undefined,
					summary: enabled ? 'Watch release highlights' : undefined,
					label: enabled ? 'Release highlights video' : undefined,
					source: enabled ? 'https://code.visualstudio.com/assets/updates/1_146/demo.mp4' : undefined,
					optionalContent: null,
				});
			}
		}
	});

	test('missing or incomplete optional metadata does not suppress an available video', async () => {
		for (const content of [
			releaseNotesWithHighlightsVideo.replace(/<track[^>]*>/, '').replace(/<p><a class="release-highlights-video-transcript"[\s\S]*?<\/p>/, ''),
			releaseNotesWithHighlightsVideo.replace('release-highlights-video-transcript', 'custom-transcript').replace('images/1_147/highlights.en.vtt', ''),
			releaseNotesWithHighlightsVideo.replace('poster="images/1_147/highlights.webp"', '').replace('title="Video showing release highlights."', ''),
		]) {
			const available: boolean[] = [];
			let invalid = 0;
			const html = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), 'stable', undefined, undefined, undefined, undefined, {
				enabled: true, onDidResolve: value => available.push(value), onInvalid: () => invalid++,
			});
			assert.deepStrictEqual({ available, invalid, hasVideo: html.toString().includes('<video') }, {
				available: [true], invalid: 0, hasVideo: true,
			});
		}
	});

	test('absent and empty optional video blocks remain normal text in both arms', async () => {
		const results: { enabled: boolean; availability: boolean[]; invalid: number; html: string }[] = [];
		for (const enabled of [false, true]) {
			for (const block of ['', '<!-- %IF HIGHLIGHTS_VIDEO %\n%ENDIF % -->', '<!-- %IF HIGHLIGHTS_VIDEO %\n<!-- No video yet. -->\n%ENDIF % -->']) {
				const availability: boolean[] = [];
				let invalid = 0;
				const html = await renderReleaseNotesMarkdown(`# Notes\n\n${block}`, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), 'stable', undefined, undefined, undefined, undefined, {
					enabled, onDidResolve: available => availability.push(available), onInvalid: () => invalid++,
				});
				results.push({ enabled, availability, invalid, html: html.toString().trim() });
			}
		}
		assert.deepStrictEqual(results, [false, true].flatMap(enabled => Array.from({ length: 3 }, () => ({
			enabled, availability: [false], invalid: 0, html: '<h1 id="notes">Notes</h1>',
		}))));
	});

	test('malformed populated candidates are diagnosed and never rendered', async () => {
		const results: { available: boolean[]; invalid: number; hasVideo: boolean }[] = [];
		for (const content of [
			releaseNotesWithHighlightsVideo.replace('images/1_147/highlights.mp4', 'javascript:alert(1)'),
			releaseNotesWithHighlightsVideo.replace('images/1_147/highlights.mp4', ''),
			releaseNotesWithHighlightsVideo.replace(/<video[\s\S]*?<\/video>/, ''),
		]) {
			const available: boolean[] = [];
			let invalid = 0;
			const html = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), 'stable', undefined, undefined, undefined, undefined, {
				enabled: true, onDidResolve: value => available.push(value), onInvalid: () => invalid++,
			});
			results.push({ available, invalid, hasVideo: html.toString().includes('<video') });
		}
		assert.deepStrictEqual(results, Array.from({ length: 3 }, () => ({ available: [false], invalid: 1, hasVideo: false })));
	});

	test('Should render code settings', async () => {
		// Stub preferences service with a known setting so the SimpleSettingRenderer treats it as valid
		const testSettingId = 'editor.wordWrap';
		instantiationService.stub(IPreferencesService, <Partial<IPreferencesService>>{
			_serviceBrand: undefined,
			onDidDefaultSettingsContentChanged: new Emitter<URI>().event,
			userSettingsResource: URI.parse('test://test'),
			workspaceSettingsResource: null,
			getFolderSettingsResource: () => null,
			createPreferencesEditorModel: async () => null,
			getDefaultSettingsContent: () => undefined,
			hasDefaultSettingsContent: () => false,
			createSettings2EditorModel: () => { throw new Error('not needed'); },
			openPreferences: async () => undefined,
			openRawDefaultSettings: async () => undefined,
			openSettings: async () => undefined,
			openApplicationSettings: async () => undefined,
			openUserSettings: async () => undefined,
			openRemoteSettings: async () => undefined,
			openWorkspaceSettings: async () => undefined,
			openFolderSettings: async () => undefined,
			openGlobalKeybindingSettings: async () => undefined,
			openDefaultKeybindingsFile: async () => undefined,
			openLanguageSpecificSettings: async () => undefined,
			getEditableSettingsURI: async () => null,
			getSetting: (id: string) => {
				if (id === testSettingId) {
					// Provide the minimal fields accessed by SimpleSettingRenderer
					return {
						key: testSettingId,
						value: 'off',
						type: 'string'
					};
				}
				return undefined;
			},
			createSplitJsonEditorInput: () => { throw new Error('not needed'); }
		});

		const content = `Here is a setting: \`setting(${testSettingId}:on)\` and another \`setting(${testSettingId}:off)\``;
		const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer));
		await assertSnapshot(result.toString());
	});
});

suite('Conditional blocks', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('IN_PRODUCT block is revealed when IN_PRODUCT is active', () => {
		const text = 'before\n<!-- %IF IN_PRODUCT %\nin-product content\n%ENDIF % -->\nafter';
		const result = processConditionalBlocks(text, new Set(['IN_PRODUCT']));
		assert.ok(result.includes('in-product content'));
		assert.ok(!result.includes('%IF'));
		assert.ok(result.includes('before'));
		assert.ok(result.includes('after'));
	});

	test('WEB block is removed when only IN_PRODUCT is active', () => {
		const text = 'before\n<!-- %IF WEB %\nweb-only content\n%ENDIF % -->\nafter';
		const result = processConditionalBlocks(text, new Set(['IN_PRODUCT']));
		assert.ok(!result.includes('web-only content'));
		assert.ok(result.includes('before'));
		assert.ok(result.includes('after'));
	});

	test('STABLE block is revealed when STABLE is active', () => {
		const text = 'before\n<!-- %IF STABLE %\nstable content\n%ENDIF % -->\nafter';
		const result = processConditionalBlocks(text, new Set(['IN_PRODUCT', 'STABLE']));
		assert.ok(result.includes('stable content'));
		assert.ok(!result.includes('%IF'));
	});

	test('STABLE block is removed when INSIDERS is active', () => {
		const text = 'before\n<!-- %IF STABLE %\nstable content\n%ENDIF % -->\nafter';
		const result = processConditionalBlocks(text, new Set(['IN_PRODUCT', 'INSIDERS']));
		assert.ok(!result.includes('stable content'));
		assert.ok(result.includes('before'));
		assert.ok(result.includes('after'));
	});

	test('INSIDERS block is revealed when INSIDERS is active', () => {
		const text = 'before\n<!-- %IF INSIDERS %\ninsiders content\n%ENDIF % -->\nafter';
		const result = processConditionalBlocks(text, new Set(['IN_PRODUCT', 'INSIDERS']));
		assert.ok(result.includes('insiders content'));
		assert.ok(!result.includes('%IF'));
	});

	test('INSIDERS block is removed when STABLE is active', () => {
		const text = 'before\n<!-- %IF INSIDERS %\ninsiders content\n%ENDIF % -->\nafter';
		const result = processConditionalBlocks(text, new Set(['IN_PRODUCT', 'STABLE']));
		assert.ok(!result.includes('insiders content'));
	});

	test('Conditions are case-insensitive', () => {
		const text = '<!-- %IF in_product %\ncontent\n%endif % -->';
		const result = processConditionalBlocks(text, new Set(['IN_PRODUCT']));
		assert.ok(result.includes('content'));
		assert.ok(!result.includes('%IF'));
	});

	test('Multiple conditional blocks in same document', () => {
		const text = [
			'shared content',
			'<!-- %IF IN_PRODUCT %',
			'in-product only',
			'%ENDIF % -->',
			'<!-- %IF WEB %',
			'web only',
			'%ENDIF % -->',
			'<!-- %IF STABLE %',
			'stable only',
			'%ENDIF % -->',
			'<!-- %IF INSIDERS %',
			'insiders only',
			'%ENDIF % -->',
			'more shared content',
		].join('\n');
		const result = processConditionalBlocks(text, new Set(['IN_PRODUCT', 'STABLE']));
		assert.ok(result.includes('shared content'));
		assert.ok(result.includes('in-product only'));
		assert.ok(!result.includes('web only'));
		assert.ok(result.includes('stable only'));
		assert.ok(!result.includes('insiders only'));
		assert.ok(result.includes('more shared content'));
	});

	test('renderReleaseNotesMarkdown passes stable quality correctly', async function () {
		const instantiationService = store.add(new TestInstantiationService());
		const extensionService = instantiationService.get(IExtensionService);
		const languageService = instantiationService.get(ILanguageService);
		instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));

		const content = [
			'## Title',
			'<!-- %IF STABLE %',
			'stable content',
			'%ENDIF % -->',
			'<!-- %IF INSIDERS %',
			'insiders content',
			'%ENDIF % -->',
		].join('\n');
		const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), 'stable');
		const html = result.toString();
		assert.ok(html.includes('stable content'));
		assert.ok(!html.includes('insiders content'));
	});

	test('renderReleaseNotesMarkdown passes insider quality correctly', async function () {
		const instantiationService = store.add(new TestInstantiationService());
		const extensionService = instantiationService.get(IExtensionService);
		const languageService = instantiationService.get(ILanguageService);
		instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));

		const content = [
			'## Title',
			'<!-- %IF STABLE %',
			'stable content',
			'%ENDIF % -->',
			'<!-- %IF INSIDERS %',
			'insiders content',
			'%ENDIF % -->',
		].join('\n');
		const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), 'insider');
		const html = result.toString();
		assert.ok(!html.includes('stable content'));
		assert.ok(html.includes('insiders content'));
	});
});
