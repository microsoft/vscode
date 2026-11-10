/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { Color } from '../../../../base/common/color.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ColorId, StandardTokenType } from '../../../../editor/common/encodedTokenAttributes.js';
import { TokenizationRegistry } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { generateTokensCSSForColorMap, generateTokensCSSForFontMap } from '../../../../editor/common/languages/supports/tokenization.js';
import { LanguageService } from '../../../../editor/common/services/languageService.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { TMGrammarFactory } from '../../../services/textMate/common/TMGrammarFactory.js';
import { IValidEmbeddedLanguagesMap, IValidGrammarDefinition, IValidTokenTypeMap } from '../../../services/textMate/common/TMScopeRegistry.js';
import { TextMateTokenizationSupport } from '../../../services/textMate/browser/tokenizationSupport/textMateTokenizationSupport.js';
import { ITextMateThemingRule } from '../../../services/themes/common/workbenchThemeService.js';
// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module
import * as vscodeOniguruma from 'vscode-oniguruma';
// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module
import * as vscodeTextmate from 'vscode-textmate';
// eslint-disable-next-line local/code-import-patterns
import type { IOnigLib, IRawTheme } from 'vscode-textmate';
import { fixtureResourceUri, readFixtureBinaryResource, readFixtureTextResource } from './fixtureResourceLoader.js';

const fixtureLanguageIds = [
	'typescript',
	'typescriptreact',
	'javascript',
	'javascriptreact',
	'json',
	'css',
	'html',
	'jsx-tags',
] as const;

const commonScriptTokenTypes: IValidTokenTypeMap = {
	'punctuation.definition.template-expression': StandardTokenType.Other,
	'entity.name.type.instance.jsdoc': StandardTokenType.Other,
	'entity.name.function.tagged-template': StandardTokenType.Other,
	'meta.import string.quoted': StandardTokenType.Other,
	'variable.other.jsdoc': StandardTokenType.Other,
};

const grammarDescriptors: readonly FixtureGrammarDescriptor[] = [
	{ language: 'typescript', scopeName: 'source.ts', path: 'extensions/typescript-basics/syntaxes/TypeScript.tmLanguage.json', tokenTypes: commonScriptTokenTypes, unbalancedBracketScopes: ['keyword.operator.relational', 'storage.type.function.arrow', 'keyword.operator.bitwise.shift', 'meta.brace.angle', 'punctuation.definition.tag', 'keyword.operator.assignment.compound.bitwise.ts'] },
	{ language: 'typescriptreact', scopeName: 'source.tsx', path: 'extensions/typescript-basics/syntaxes/TypeScriptReact.tmLanguage.json', embeddedLanguages: { 'meta.tag.tsx': 'jsx-tags', 'meta.tag.without-attributes.tsx': 'jsx-tags', 'meta.tag.attributes.tsx': 'typescriptreact', 'meta.embedded.expression.tsx': 'typescriptreact' }, tokenTypes: commonScriptTokenTypes, unbalancedBracketScopes: ['keyword.operator.relational', 'storage.type.function.arrow', 'keyword.operator.bitwise.shift', 'punctuation.definition.tag', 'keyword.operator.assignment.compound.bitwise.ts'] },
	{ scopeName: 'documentation.injection.ts', path: 'extensions/typescript-basics/syntaxes/jsdoc.ts.injection.tmLanguage.json', injectTo: ['source.ts', 'source.tsx'] },
	{ scopeName: 'documentation.injection.js.jsx', path: 'extensions/typescript-basics/syntaxes/jsdoc.js.injection.tmLanguage.json', injectTo: ['source.js', 'source.js.jsx'] },
	{ language: 'javascript', scopeName: 'source.js', path: 'extensions/javascript/syntaxes/JavaScript.tmLanguage.json', embeddedLanguages: { 'meta.tag.js': 'jsx-tags', 'meta.tag.without-attributes.js': 'jsx-tags', 'meta.tag.attributes.js': 'javascript', 'meta.embedded.expression.js': 'javascript' }, tokenTypes: commonScriptTokenTypes },
	{ language: 'javascriptreact', scopeName: 'source.js.jsx', path: 'extensions/javascript/syntaxes/JavaScriptReact.tmLanguage.json', embeddedLanguages: { 'meta.tag.js': 'jsx-tags', 'meta.tag.without-attributes.js': 'jsx-tags', 'meta.tag.attributes.js.jsx': 'javascriptreact', 'meta.embedded.expression.js': 'javascriptreact' }, tokenTypes: commonScriptTokenTypes },
	{ scopeName: 'source.js.regexp', path: 'extensions/javascript/syntaxes/Regular Expressions (JavaScript).tmLanguage' },
	{ language: 'json', scopeName: 'source.json', path: 'extensions/json/syntaxes/JSON.tmLanguage.json' },
	{ language: 'css', scopeName: 'source.css', path: 'extensions/css/syntaxes/css.tmLanguage.json', tokenTypes: { 'meta.function.url string.quoted': StandardTokenType.Other } },
	{ scopeName: 'text.html.basic', path: 'extensions/html/syntaxes/html.tmLanguage.json', embeddedLanguages: { 'text.html': 'html', 'source.css': 'css', 'source.js': 'javascript' }, tokenTypes: { 'meta.tag string.quoted': StandardTokenType.Other } },
	{ language: 'html', scopeName: 'text.html.derivative', path: 'extensions/html/syntaxes/html-derivative.tmLanguage.json', embeddedLanguages: { 'text.html': 'html', 'source.css': 'css', 'source.js': 'javascript' }, tokenTypes: { 'meta.tag string.quoted': StandardTokenType.Other } },
];

export interface FixtureSyntaxHighlightingTheme extends IColorTheme {
	readonly tokenColors: ITextMateThemingRule[];
}

interface FixtureGrammarDescriptor {
	readonly language?: string;
	readonly scopeName: string;
	readonly path: string;
	readonly embeddedLanguages?: Readonly<Record<string, string>>;
	readonly tokenTypes?: IValidTokenTypeMap;
	readonly injectTo?: string[];
	readonly unbalancedBracketScopes?: string[];
}

export function registerFixtureLanguages(disposables: DisposableStore, languageService: ILanguageService): void {
	for (const languageId of fixtureLanguageIds) {
		disposables.add(languageService.registerLanguage({ id: languageId }));
	}
}

export async function registerFixtureSyntaxHighlighting(
	disposables: DisposableStore,
	fixtureHost: HTMLElement,
	darkTheme: FixtureSyntaxHighlightingTheme,
	theme: IColorTheme,
): Promise<void> {
	disposables.add(await fixtureTextMateTokenizers.acquire(darkTheme));
	const colorMap = toColorMap(darkTheme.tokenColorMap);
	const styleElement = createStyleSheet(fixtureHost, undefined, disposables);
	const styles = theme.type === ColorScheme.DARK
		? `${generateTokensCSSForColorMap(colorMap)}\n${generateTokensCSSForFontMap(darkTheme.tokenFontMap)}`
		: `${colorMap.slice(1).map((_, index) => `.mtk${index + 1}`).join(', ')} { color: var(--vscode-editor-foreground); font: inherit; text-decoration: none; }`;
	styleElement.textContent = `@scope {\n${styles}\n}`;
}

class FixtureTextMateTokenizers {
	private _references = 0;
	private _instancePromise: Promise<FixtureTextMateTokenizerInstance> | undefined;
	private _instance: FixtureTextMateTokenizerInstance | undefined;

	async acquire(darkTheme: FixtureSyntaxHighlightingTheme): Promise<IDisposable> {
		this._references++;
		try {
			const instance = await (this._instancePromise ??= FixtureTextMateTokenizerInstance.create(darkTheme));
			this._instance = instance;
		} catch (error) {
			this._references--;
			this._instancePromise = undefined;
			throw error;
		}

		let disposed = false;
		return toDisposable(() => {
			if (disposed) {
				return;
			}
			disposed = true;
			if (--this._references === 0) {
				this._instance?.dispose();
				this._instance = undefined;
				this._instancePromise = undefined;
			}
		});
	}
}

const fixtureTextMateTokenizers = new FixtureTextMateTokenizers();

class FixtureTextMateTokenizerInstance implements IDisposable {
	private constructor(
		private readonly _store: DisposableStore,
		private readonly _installedColorMap: readonly Color[],
		private readonly _previousColorMap: readonly Color[] | null,
	) { }

	static async create(darkTheme: FixtureSyntaxHighlightingTheme): Promise<FixtureTextMateTokenizerInstance> {
		const store = new DisposableStore();
		try {
			const languageService = store.add(new LanguageService());
			registerFixtureLanguages(store, languageService);
			const grammarDefinitions = createGrammarDefinitions(languageService);
			const onigLib = await createOnigLib();
			const grammarFactory = store.add(new TMGrammarFactory({
				logTrace: () => { },
				logError: (message, error) => console.error(message, error),
				readFile: readFixtureTextResource,
			}, grammarDefinitions, vscodeTextmate, Promise.resolve(onigLib)));
			const rawTheme: IRawTheme = { name: darkTheme.label, settings: darkTheme.tokenColors };
			grammarFactory.setTheme(rawTheme, darkTheme.tokenColorMap);

			await Promise.all(fixtureLanguageIds.filter(languageId => grammarFactory.has(languageId)).map(async languageId => {
				if (TokenizationRegistry.get(languageId)) {
					return;
				}
				const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
				const result = await grammarFactory.createGrammar(languageId, encodedLanguageId);
				if (!result.grammar) {
					return;
				}
				const support = store.add(new TextMateTokenizationSupport(
					result.grammar,
					result.initialState,
					result.containsEmbeddedLanguages,
					undefined,
					() => false,
					() => { },
					false,
				));
				store.add(TokenizationRegistry.register(languageId, support));
			}));

			const installedColorMap = toColorMap(grammarFactory.getColorMap());
			const currentColorMap = TokenizationRegistry.getColorMap();
			const previousColorMap = isValidColorMap(currentColorMap) ? currentColorMap : null;
			TokenizationRegistry.setColorMap(installedColorMap);
			return new FixtureTextMateTokenizerInstance(store, installedColorMap, previousColorMap);
		} catch (error) {
			store.dispose();
			throw error;
		}
	}

	dispose(): void {
		if (this._previousColorMap && TokenizationRegistry.getColorMap() === this._installedColorMap) {
			TokenizationRegistry.setColorMap([...this._previousColorMap]);
		}
		this._store.dispose();
	}
}

function createGrammarDefinitions(languageService: ILanguageService): IValidGrammarDefinition[] {
	return grammarDescriptors.map(descriptor => {
		const embeddedLanguages: IValidEmbeddedLanguagesMap = {};
		for (const [scope, languageId] of Object.entries(descriptor.embeddedLanguages ?? {})) {
			embeddedLanguages[scope] = languageService.languageIdCodec.encodeLanguageId(languageId);
		}
		return {
			location: fixtureResourceUri(descriptor.path),
			language: descriptor.language,
			scopeName: descriptor.scopeName,
			embeddedLanguages,
			tokenTypes: descriptor.tokenTypes ?? {},
			injectTo: descriptor.injectTo,
			balancedBracketSelectors: ['*'],
			unbalancedBracketSelectors: descriptor.unbalancedBracketScopes ?? [],
			sourceExtensionId: `vscode.${descriptor.path.split('/')[1]}`,
		};
	});
}

let onigLibPromise: Promise<IOnigLib> | undefined;

function createOnigLib(): Promise<IOnigLib> {
	return onigLibPromise ??= (async () => {
		const wasm = await readFixtureBinaryResource(fixtureResourceUri('node_modules/vscode-oniguruma/release/onig.wasm'));
		await vscodeOniguruma.loadWASM(wasm);
		return {
			createOnigScanner: (sources: string[]) => vscodeOniguruma.createOnigScanner(sources),
			createOnigString: (value: string) => vscodeOniguruma.createOnigString(value),
		};
	})().catch(error => {
		onigLibPromise = undefined;
		throw error;
	});
}

function toColorMap(colorMap: readonly string[]): Color[] {
	const result: Color[] = [null!];
	for (let index = 1; index < colorMap.length; index++) {
		result[index] = Color.fromHex(colorMap[index]);
	}
	return result;
}

function isValidColorMap(colorMap: readonly Color[] | null): colorMap is readonly Color[] {
	return !!colorMap
		&& colorMap.length > ColorId.DefaultBackground
		&& colorMap.slice(1).every(color => !!color);
}
