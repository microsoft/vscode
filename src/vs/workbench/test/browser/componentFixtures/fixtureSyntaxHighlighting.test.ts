/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Color } from '../../../../base/common/color.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ColorId, TokenMetadata } from '../../../../editor/common/encodedTokenAttributes.js';
import { TokenizationRegistry } from '../../../../editor/common/languages.js';
import { LanguageService } from '../../../../editor/common/services/languageService.js';
import { IExtensionResourceLoaderService } from '../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { ThemeTypeSelector } from '../../../../platform/theme/common/theme.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { editorForeground } from '../../../../platform/theme/common/colors/editorColors.js';
import { ColorThemeData } from '../../../services/themes/common/colorThemeData.js';
import { ExtensionData } from '../../../services/themes/common/workbenchThemeService.js';
import { fixtureResourceUri, readFixtureTextResource } from './fixtureResourceLoader.js';
import { registerFixtureLanguages, registerFixtureSyntaxHighlighting } from './fixtureSyntaxHighlighting.js';

suite('Component fixture TextMate syntax highlighting', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const darkTheme = ColorThemeData.fromExtensionTheme(
		{ id: '2026-dark', path: '2026-dark.json', uiTheme: ThemeTypeSelector.VS_DARK, _watch: false },
		fixtureResourceUri('extensions/theme-defaults/themes/2026-dark.json'),
		ExtensionData.fromName('vscode', 'theme-defaults', true),
	);
	const themeLoader = new class implements IExtensionResourceLoaderService {
		declare readonly _serviceBrand: undefined;
		readExtensionResource(uri: URI): Promise<string> { return readFixtureTextResource(uri); }
		supportsExtensionGalleryResources(): Promise<boolean> { return Promise.resolve(false); }
		isExtensionGalleryResource(): Promise<boolean> { return Promise.resolve(false); }
		getExtensionGalleryResourceURL(): Promise<undefined> { return Promise.resolve(undefined); }
	}();
	let themeLoaded: Promise<void> | undefined;

	async function createTokenizers(theme: IColorTheme = darkTheme): Promise<{ store: DisposableStore; languageService: LanguageService; host: HTMLElement }> {
		const store = disposables.add(new DisposableStore());
		const languageService = store.add(new LanguageService());
		registerFixtureLanguages(store, languageService);
		const host = mainWindow.document.body.appendChild($('div'));
		store.add(toDisposable(() => host.remove()));
		await (themeLoaded ??= darkTheme.ensureLoaded(themeLoader));
		await registerFixtureSyntaxHighlighting(store, host, darkTheme, theme);
		return { store, languageService, host };
	}

	test('registers actual TextMate tokenizers for every fixture language', async () => {
		const { languageService } = await createTokenizers();
		const samples = new Map([
			['typescript', 'const value: number = 1;'],
			['typescriptreact', 'const view = <div>{value}</div>;'],
			['javascript', 'const value = /actual+/gi;'],
			['javascriptreact', 'const view = <div>{value}</div>;'],
			['json', '{ "enabled": true }'],
			['css', '.fixture { color: #ff7b72; }'],
			['html', '<main class="fixture">text</main>'],
		]);

		const actual = [...samples].map(([languageId, line]) => {
			const support = TokenizationRegistry.get(languageId);
			assert.ok(support);
			const result = support.tokenizeEncoded(line, true, support.getInitialState());
			return {
				languageId,
				registered: languageService.isRegisteredLanguageId(languageId),
				tokenCount: result.tokens.length / 2,
				encodedLanguageIds: distinctLanguageIds(result.tokens).map(id => languageService.languageIdCodec.decodeLanguageId(id)),
			};
		});

		assert.deepStrictEqual(actual, [
			{ languageId: 'typescript', registered: true, tokenCount: 11, encodedLanguageIds: ['typescript'] },
			{ languageId: 'typescriptreact', registered: true, tokenCount: 16, encodedLanguageIds: ['typescriptreact', 'jsx-tags'] },
			{ languageId: 'javascript', registered: true, tokenCount: 10, encodedLanguageIds: ['javascript'] },
			{ languageId: 'javascriptreact', registered: true, tokenCount: 16, encodedLanguageIds: ['javascriptreact', 'jsx-tags'] },
			{ languageId: 'json', registered: true, tokenCount: 5, encodedLanguageIds: ['json'] },
			{ languageId: 'css', registered: true, tokenCount: 6, encodedLanguageIds: ['css'] },
			{ languageId: 'html', registered: true, tokenCount: 11, encodedLanguageIds: ['html'] },
		]);
	});

	test('uses Dark 2026 TextMate scope distinctions and generated token CSS', async () => {
		const { host } = await createTokenizers();
		const support = TokenizationRegistry.get('typescript')!;
		const line = 'import value from "./value"; class Example { private readonly field = 1; } const result = value;';
		const result = support.tokenizeEncoded(line, true, support.getInitialState());

		assert.deepStrictEqual({
			import: colorAt(result.tokens, line.indexOf('import')),
			private: colorAt(result.tokens, line.indexOf('private')),
			readonly: colorAt(result.tokens, line.indexOf('readonly')),
			const: colorAt(result.tokens, line.indexOf('const')),
			hasPurpleRule: host.querySelector('style')?.textContent?.includes('#c586c0'),
			hasBlueRule: host.querySelector('style')?.textContent?.includes('#569cd6'),
			hasCoralRule: host.querySelector('style')?.textContent?.includes('#ff7b72'),
		}, {
			import: '#c586c0',
			private: '#569cd6',
			readonly: '#569cd6',
			const: '#ff7b72',
			hasPurpleRule: true,
			hasBlueRule: true,
			hasCoralRule: true,
		});
	});

	test('preserves multiline TextMate state and embedded language IDs', async () => {
		const { languageService } = await createTokenizers();
		const typescript = TokenizationRegistry.get('typescript')!;
		const initialState = typescript.getInitialState();
		const commentStart = typescript.tokenizeEncoded('/* first line', true, initialState);
		const commentEndLine = 'continued */ const value = 1;';
		const commentEnd = typescript.tokenizeEncoded(commentEndLine, true, commentStart.endState);

		const html = TokenizationRegistry.get('html')!;
		const scriptStart = html.tokenizeEncoded('<script>', true, html.getInitialState());
		const embeddedScript = html.tokenizeEncoded('const value = 1;', true, scriptStart.endState);

		assert.deepStrictEqual({
			stateChanged: !commentStart.endState.equals(initialState),
			continuedComment: colorAt(commentEnd.tokens, 0),
			constAfterComment: colorAt(commentEnd.tokens, commentEndLine.indexOf('const')),
			embeddedLanguages: distinctLanguageIds(embeddedScript.tokens).map(id => languageService.languageIdCodec.decodeLanguageId(id)),
		}, {
			stateChanged: true,
			continuedComment: '#8b949e',
			constAfterComment: '#ff7b72',
			embeddedLanguages: ['javascript'],
		});
	});

	test('uses monochrome token styles in non-Dark fixtures without affecting Dark', async () => {
		const variants = [
			{ name: 'Light', path: 'light_modern.json', uiTheme: ThemeTypeSelector.VS },
			{ name: 'DarkHighContrast', path: 'hc_black.json', uiTheme: ThemeTypeSelector.HC_BLACK },
			{ name: 'LightHighContrast', path: 'hc_light.json', uiTheme: ThemeTypeSelector.HC_LIGHT },
			{ name: 'Dark', path: '2026-dark.json', uiTheme: ThemeTypeSelector.VS_DARK },
		];
		const rendered = [];
		for (const variant of variants) {
			const theme = ColorThemeData.fromExtensionTheme(
				{ id: variant.name, path: variant.path, uiTheme: variant.uiTheme, _watch: false },
				fixtureResourceUri(`extensions/theme-defaults/themes/${variant.path}`),
				ExtensionData.fromName('vscode', 'theme-defaults', true),
			);
			await theme.ensureLoaded(themeLoader);
			const { host } = await createTokenizers(theme);
			const foreground = theme.getColor(editorForeground)!;
			host.style.setProperty('--vscode-editor-foreground', foreground.toString());
			host.style.font = '14px monospace';

			const support = TokenizationRegistry.get('typescript')!;
			const result = support.tokenizeEncoded('import value from "./value";', true, support.getInitialState());
			const token = host.appendChild($(`span.mtk${TokenMetadata.getForeground(result.tokens[1])}.mtki.mtkb.mtku.mtks`));
			token.textContent = 'import';
			rendered.push({ name: variant.name, token, foreground });
		}

		assert.deepStrictEqual(rendered.map(({ name, token }) => {
			const style = mainWindow.getComputedStyle(token);
			return {
				name,
				color: style.color,
				fontStyle: style.fontStyle,
				fontWeight: style.fontWeight,
				textDecoration: style.textDecorationLine,
			};
		}), rendered.map(({ name, foreground }) => ({
			name,
			color: name === 'Dark' ? 'rgb(197, 134, 192)' : Color.Format.CSS.formatRGB(foreground),
			fontStyle: name === 'Dark' ? 'italic' : 'normal',
			fontWeight: name === 'Dark' ? '700' : '400',
			textDecoration: name === 'Dark' ? 'underline line-through' : 'none',
		})));
	});

	test('retains shared tokenizers until the final fixture is disposed', async () => {
		const previousColorMap = TokenizationRegistry.getColorMap();
		assert.ok(previousColorMap);
		const sentinelColorMap = [...previousColorMap];
		sentinelColorMap[ColorId.DefaultForeground] = Color.fromHex('#010203');
		TokenizationRegistry.setColorMap(sentinelColorMap);
		try {
			const first = await createTokenizers();
			const second = await createTokenizers();
			const support = TokenizationRegistry.get('typescript');
			first.store.dispose();

			assert.deepStrictEqual({
				retainedAfterFirstDispose: TokenizationRegistry.get('typescript') === support,
				secondUsesCanonicalDarkCSS: second.host.querySelector('style')?.textContent?.includes('#ff7b72'),
			}, {
				retainedAfterFirstDispose: true,
				secondUsesCanonicalDarkCSS: true,
			});

			second.store.dispose();
			const finalColorMap = TokenizationRegistry.getColorMap();
			const defaultBackground = TokenizationRegistry.getDefaultBackground();
			assert.deepStrictEqual({
				tokenizerRemoved: TokenizationRegistry.get('typescript') === null,
				sentinelColorMapRestored: finalColorMap?.length === sentinelColorMap.length
					&& sentinelColorMap.every((color, index) => finalColorMap[index] === color),
				defaultBackgroundLuminance: typeof defaultBackground?.getRelativeLuminance() === 'number',
			}, {
				tokenizerRemoved: true,
				sentinelColorMapRestored: true,
				defaultBackgroundLuminance: true,
			});
		} finally {
			TokenizationRegistry.setColorMap([...previousColorMap]);
		}
	});
});

function distinctLanguageIds(tokens: Uint32Array): number[] {
	const result: number[] = [];
	for (let index = 1; index < tokens.length; index += 2) {
		const languageId = TokenMetadata.getLanguageId(tokens[index]);
		if (!result.includes(languageId)) {
			result.push(languageId);
		}
	}
	return result;
}

function colorAt(tokens: Uint32Array, offset: number): string {
	let metadata = tokens[1];
	for (let index = 2; index < tokens.length && tokens[index] <= offset; index += 2) {
		metadata = tokens[index + 1];
	}
	const color = TokenizationRegistry.getColorMap()?.[TokenMetadata.getForeground(metadata)];
	assert.ok(color);
	return color.toString();
}
