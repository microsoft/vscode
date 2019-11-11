/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import * as assert from 'assert';
import { ITokenColorCustomizations } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { TokenStyle, comments, variables, types, functions, keywords, numbers, strings, getTokenClassificationRegistry } from 'vs/platform/theme/common/tokenClassificationRegistry';
import { Color } from 'vs/base/common/color';
import { isString } from 'vs/base/common/types';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { ExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/electron-browser/extensionResourceLoaderService';

let tokenClassificationRegistry = getTokenClassificationRegistry();

const undefinedStyle = { bold: undefined, underline: undefined, italic: undefined };
const unsetStyle = { bold: false, underline: false, italic: false };

function ts(foreground: string | undefined, styleFlags: { bold?: boolean; underline?: boolean; italic?: boolean } | undefined): TokenStyle {
	const foregroundColor = isString(foreground) ? Color.fromHex(foreground) : undefined;
	return new TokenStyle(foregroundColor, styleFlags && styleFlags.bold, styleFlags && styleFlags.underline, styleFlags && styleFlags.italic);
}

function tokenStyleAsString(ts: TokenStyle | undefined | null) {
	if (!ts) {
		return 'tokenstyle-undefined';
	}
	let str = ts.foreground ? ts.foreground.toString() : 'no-foreground';
	if (ts.bold !== undefined) {
		str += ts.bold ? '+B' : '-B';
	}
	if (ts.underline !== undefined) {
		str += ts.underline ? '+U' : '-U';
	}
	if (ts.italic !== undefined) {
		str += ts.italic ? '+I' : '-I';
	}
	return str;
}

function assertTokenStyle(actual: TokenStyle | undefined | null, expected: TokenStyle | undefined | null, message?: string) {
	assert.equal(tokenStyleAsString(actual), tokenStyleAsString(expected), message);
}

function assertTokenStyles(themeData: ColorThemeData, expected: { [qualifiedClassifier: string]: TokenStyle }) {
	for (let qualifiedClassifier in expected) {
		const classification = tokenClassificationRegistry.getTokenClassificationFromString(qualifiedClassifier);
		assert.ok(classification, 'Classification not found');

		const tokenStyle = themeData.getTokenStyle(classification!);
		assertTokenStyle(tokenStyle, expected[qualifiedClassifier], qualifiedClassifier);
	}
}

suite('Themes - TokenStyleResolving', () => {


	const fileService = new FileService(new NullLogService());
	const extensionResourceLoaderService = new ExtensionResourceLoaderService(fileService);

	const diskFileSystemProvider = new DiskFileSystemProvider(new NullLogService());
	fileService.registerProvider(Schemas.file, diskFileSystemProvider);


	test('color defaults - monokai', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-monokai/themes/monokai-color-theme.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(extensionResourceLoaderService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#88846f', undefinedStyle),
			[variables]: ts('#F8F8F2', unsetStyle),
			[types]: ts('#A6E22E', { underline: true }),
			[functions]: ts('#A6E22E', unsetStyle),
			[strings]: ts('#E6DB74', undefinedStyle),
			[numbers]: ts('#AE81FF', undefinedStyle),
			[keywords]: ts('#F92672', undefinedStyle)
		});

	});

	test('color defaults - dark+', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-defaults/themes/dark_plus.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(extensionResourceLoaderService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#6A9955', undefinedStyle),
			[variables]: ts('#9CDCFE', undefinedStyle),
			[types]: ts('#4EC9B0', undefinedStyle),
			[functions]: ts('#DCDCAA', undefinedStyle),
			[strings]: ts('#CE9178', undefinedStyle),
			[numbers]: ts('#B5CEA8', undefinedStyle),
			[keywords]: ts('#C586C0', undefinedStyle)
		});

	});

	test('color defaults - light vs', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-defaults/themes/light_vs.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(extensionResourceLoaderService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#008000', undefinedStyle),
			[variables]: ts(undefined, undefinedStyle),
			[types]: ts(undefined, undefinedStyle),
			[functions]: ts(undefined, undefinedStyle),
			[strings]: ts('#a31515', undefinedStyle),
			[numbers]: ts('#09885a', undefinedStyle),
			[keywords]: ts('#0000ff', undefinedStyle)
		});

	});

	test('color defaults - hc', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-defaults/themes/hc_black.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(extensionResourceLoaderService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#7ca668', undefinedStyle),
			[variables]: ts('#9CDCFE', undefinedStyle),
			[types]: ts('#4EC9B0', undefinedStyle),
			[functions]: ts('#DCDCAA', undefinedStyle),
			[strings]: ts('#ce9178', undefinedStyle),
			[numbers]: ts('#b5cea8', undefinedStyle),
			[keywords]: ts('#C586C0', undefinedStyle)
		});

	});

	test('color defaults - kimbie dark', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-kimbie-dark/themes/kimbie-dark-color-theme.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(extensionResourceLoaderService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#a57a4c', undefinedStyle),
			[variables]: ts('#dc3958', undefinedStyle),
			[types]: ts('#f06431', undefinedStyle),
			[functions]: ts('#8ab1b0', undefinedStyle),
			[strings]: ts('#889b4a', undefinedStyle),
			[numbers]: ts('#f79a32', undefinedStyle),
			[keywords]: ts('#98676a', undefinedStyle)
		});

	});

	test('color defaults - abyss', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-abyss/themes/abyss-color-theme.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(extensionResourceLoaderService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#384887', undefinedStyle),
			[variables]: ts(undefined, unsetStyle),
			[types]: ts('#ffeebb', { underline: true }),
			[functions]: ts('#ddbb88', unsetStyle),
			[strings]: ts('#22aa44', undefinedStyle),
			[numbers]: ts('#f280d0', undefinedStyle),
			[keywords]: ts('#225588', undefinedStyle)
		});

	});

	test('resolveScopes', async () => {
		const themeData = ColorThemeData.createLoadedEmptyTheme('test', 'test');

		const customTokenColors: ITokenColorCustomizations = {
			textMateRules: [
				{
					scope: 'variable',
					settings: {
						fontStyle: '',
						foreground: '#F8F8F2'
					}
				},
				{
					scope: 'keyword.operator',
					settings: {
						fontStyle: 'italic bold underline',
						foreground: '#F92672'
					}
				},
				{
					scope: 'storage',
					settings: {
						fontStyle: 'italic',
						foreground: '#F92672'
					}
				},
				{
					scope: ['storage.type', 'meta.structure.dictionary.json string.quoted.double.json'],
					settings: {
						foreground: '#66D9EF'
					}
				},
				{
					scope: 'entity.name.type, entity.name.class, entity.name.namespace, entity.name.scope-resolution',
					settings: {
						fontStyle: 'underline',
						foreground: '#A6E22E'
					}
				},
			]
		};

		themeData.setCustomTokenColors(customTokenColors);

		let tokenStyle;
		let defaultTokenStyle = undefined;

		tokenStyle = themeData.resolveScopes([['variable']]);
		assertTokenStyle(tokenStyle, ts('#F8F8F2', unsetStyle), 'variable');

		tokenStyle = themeData.resolveScopes([['keyword.operator']]);
		assertTokenStyle(tokenStyle, ts('#F92672', { italic: true, bold: true, underline: true }), 'keyword');

		tokenStyle = themeData.resolveScopes([['keyword']]);
		assertTokenStyle(tokenStyle, defaultTokenStyle, 'keyword');

		tokenStyle = themeData.resolveScopes([['keyword.operator']]);
		assertTokenStyle(tokenStyle, ts('#F92672', { italic: true, bold: true, underline: true }), 'keyword.operator');

		tokenStyle = themeData.resolveScopes([['keyword.operators']]);
		assertTokenStyle(tokenStyle, defaultTokenStyle, 'keyword.operators');

		tokenStyle = themeData.resolveScopes([['storage']]);
		assertTokenStyle(tokenStyle, ts('#F92672', { italic: true }), 'storage');

		tokenStyle = themeData.resolveScopes([['storage.type']]);
		assertTokenStyle(tokenStyle, ts('#66D9EF', { italic: true }), 'storage.type');

		tokenStyle = themeData.resolveScopes([['entity.name.class']]);
		assertTokenStyle(tokenStyle, ts('#A6E22E', { underline: true }), 'entity.name.class');

		tokenStyle = themeData.resolveScopes([['meta.structure.dictionary.json', 'string.quoted.double.json']]);
		assertTokenStyle(tokenStyle, ts('#66D9EF', undefined), 'json property');

		tokenStyle = themeData.resolveScopes([['keyword'], ['storage.type'], ['entity.name.class']]);
		assertTokenStyle(tokenStyle, ts('#66D9EF', { italic: true }), 'storage.type');

	});

	test('rule matching', async () => {
		const themeData = ColorThemeData.createLoadedEmptyTheme('test', 'test');
		themeData.setCustomColors({ 'editor.foreground': '#000000' });
		themeData.setCustomTokenStyleRules({
			'types': '#ff0000',
			'classes': { foreground: '#0000ff', fontStyle: 'italic' },
			'*.static': { fontStyle: 'bold' },
			'*.declaration': { fontStyle: 'italic' },
			'*.async.static': { fontStyle: 'italic underline' },
			'*.async': { foreground: '#000fff', fontStyle: '-italic underline' }
		});

		assertTokenStyles(themeData, {
			'types': ts('#ff0000', undefinedStyle),
			'types.static': ts('#ff0000', { bold: true }),
			'types.static.declaration': ts('#ff0000', { bold: true, italic: true }),
			'classes': ts('#0000ff', { italic: true }),
			'classes.static.declaration': ts('#0000ff', { bold: true, italic: true }),
			'classes.declaration': ts('#0000ff', { italic: true }),
			'classes.declaration.async': ts('#000fff', { underline: true, italic: false }),
			'classes.declaration.async.static': ts('#000fff', { italic: true, underline: true, bold: true }),
		});

	});
});
