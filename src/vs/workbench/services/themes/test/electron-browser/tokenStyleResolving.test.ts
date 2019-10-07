/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import * as assert from 'assert';
import { ITokenColorCustomizations } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { TokenStyle, comments, variables, types, functions, keywords, numbers, strings, getTokenClassificationRegistry, TokenStylingRule } from 'vs/platform/theme/common/tokenClassificationRegistry';
import { Color } from 'vs/base/common/color';
import { isString } from 'vs/base/common/types';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { getPathFromAmdModule } from 'vs/base/common/amd';

let tokenClassificationRegistry = getTokenClassificationRegistry();

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

function getTokenStyleRules(rules: [string, TokenStyle][]): TokenStylingRule[] {
	return rules.map(e => {
		const rule = tokenClassificationRegistry.getTokenStylingRule(e[0], e[1]);
		assert.ok(rule);
		return rule!;
	});
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
	const diskFileSystemProvider = new DiskFileSystemProvider(new NullLogService());
	fileService.registerProvider(Schemas.file, diskFileSystemProvider);


	test('color defaults - monokai', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-monokai/themes/monokai-color-theme.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#75715E', unsetStyle),
			[variables]: ts('#F8F8F2', unsetStyle),
			[types]: ts('#A6E22E', { underline: true, bold: false, italic: false }),
			[functions]: ts('#A6E22E', unsetStyle),
			[strings]: ts('#E6DB74', unsetStyle),
			[numbers]: ts('#AE81FF', unsetStyle),
			[keywords]: ts('#F92672', unsetStyle)
		});

	});

	test('color defaults - dark+', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-defaults/themes/dark_plus.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#6A9955', unsetStyle),
			[variables]: ts('#9CDCFE', unsetStyle),
			[types]: ts('#4EC9B0', unsetStyle),
			[functions]: ts('#DCDCAA', unsetStyle),
			[strings]: ts('#CE9178', unsetStyle),
			[numbers]: ts('#B5CEA8', unsetStyle),
			[keywords]: ts('#C586C0', unsetStyle)
		});

	});

	test('color defaults - light vs', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-defaults/themes/light_vs.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#008000', unsetStyle),
			[variables]: ts('#000000', unsetStyle),
			[types]: ts('#000000', unsetStyle),
			[functions]: ts('#000000', unsetStyle),
			[strings]: ts('#a31515', unsetStyle),
			[numbers]: ts('#09885a', unsetStyle),
			[keywords]: ts('#0000ff', unsetStyle)
		});

	});

	test('color defaults - hc', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-defaults/themes/hc_black.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#7ca668', unsetStyle),
			[variables]: ts('#9CDCFE', unsetStyle),
			[types]: ts('#4EC9B0', unsetStyle),
			[functions]: ts('#DCDCAA', unsetStyle),
			[strings]: ts('#ce9178', unsetStyle),
			[numbers]: ts('#b5cea8', unsetStyle),
			[keywords]: ts('#C586C0', unsetStyle)
		});

	});

	test('color defaults - kimbie dark', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-kimbie-dark/themes/kimbie-dark-color-theme.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#a57a4c', unsetStyle),
			[variables]: ts('#dc3958', unsetStyle),
			[types]: ts('#f06431', unsetStyle),
			[functions]: ts('#8ab1b0', unsetStyle),
			[strings]: ts('#889b4a', unsetStyle),
			[numbers]: ts('#f79a32', unsetStyle),
			[keywords]: ts('#98676a', unsetStyle)
		});

	});

	test('color defaults - abyss', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-abyss/themes/abyss-color-theme.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#384887', unsetStyle),
			[variables]: ts('#6688cc', unsetStyle),
			[types]: ts('#ffeebb', { underline: true, bold: false, italic: false }),
			[functions]: ts('#ddbb88', unsetStyle),
			[strings]: ts('#22aa44', unsetStyle),
			[numbers]: ts('#f280d0', unsetStyle),
			[keywords]: ts('#225588', unsetStyle)
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
		assertTokenStyle(tokenStyle, ts('#F92672', { italic: true, underline: false, bold: false }), 'storage');

		tokenStyle = themeData.resolveScopes([['storage.type']]);
		assertTokenStyle(tokenStyle, ts('#66D9EF', { italic: true, underline: false, bold: false }), 'storage.type');

		tokenStyle = themeData.resolveScopes([['entity.name.class']]);
		assertTokenStyle(tokenStyle, ts('#A6E22E', { underline: true, italic: false, bold: false }), 'entity.name.class');

		tokenStyle = themeData.resolveScopes([['meta.structure.dictionary.json', 'string.quoted.double.json']]);
		assertTokenStyle(tokenStyle, ts('#66D9EF', undefined), 'json property');

		tokenStyle = themeData.resolveScopes([['keyword'], ['storage.type'], ['entity.name.class']]);
		assertTokenStyle(tokenStyle, ts('#66D9EF', { italic: true, underline: false, bold: false }), 'storage.type');

	});

	test('rule matching', async () => {
		const themeData = ColorThemeData.createLoadedEmptyTheme('test', 'test');
		themeData.setCustomColors({ 'editor.foreground': '#000000' });
		themeData.setTokenStyleRules(getTokenStyleRules([
			['types', ts('#ff0000', undefined)],
			['classes', ts('#0000ff', undefined)],
			['*.static', ts(undefined, { bold: true })],
			['*.declaration', ts(undefined, { italic: true })]
		]));

		assertTokenStyles(themeData, {
			'types': ts('#ff0000', unsetStyle),
			'types.static': ts('#ff0000', { bold: true, italic: false, underline: false }),
			'types.static.declaration': ts('#ff0000', { bold: true, italic: true, underline: false })
		});

	});
});
