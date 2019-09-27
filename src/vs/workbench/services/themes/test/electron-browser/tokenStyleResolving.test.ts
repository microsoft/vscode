/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import * as assert from 'assert';
import { ITokenColorCustomizations } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { Extensions as TokenStyleRegistryExtensions, ITokenClassificationRegistry, TokenStyle, comments, variables, types, functions, keywords, numbers, strings } from 'vs/platform/theme/common/tokenClassificationRegistry';
import { Color } from 'vs/base/common/color';
import { isString } from 'vs/base/common/types';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { Registry } from 'vs/platform/registry/common/platform';

let tokenClassificationRegistry = Registry.as<ITokenClassificationRegistry>(TokenStyleRegistryExtensions.TokenClassificationContribution);

const enum TokenStyleBits {
	BOLD = 0x01,
	UNDERLINE = 0x02,
	ITALIC = 0x04
}


function ts(foreground: string | undefined, styleFlags: number | undefined): TokenStyle {
	const foregroundColor = isString(foreground) ? Color.fromHex(foreground) : undefined;
	let bold, underline, italic;
	if (styleFlags !== undefined) {
		bold = (styleFlags & TokenStyleBits.BOLD) !== 0;
		underline = (styleFlags & TokenStyleBits.UNDERLINE) !== 0;
		italic = (styleFlags & TokenStyleBits.ITALIC) !== 0;
	}
	return new TokenStyle(foregroundColor, bold, underline, italic);
}

function tokenStyleAsString(ts: TokenStyle | undefined | null) {
	if (!ts) {
		return 'tokenstyle-undefined';
	}
	let str = ts.foreground ? ts.foreground.toString() : 'no-foreground';
	if (ts.bold !== undefined) {
		str = ts.bold ? '+B' : '-B';
	}
	if (ts.underline !== undefined) {
		str = ts.underline ? '+U' : '-U';
	}
	if (ts.italic !== undefined) {
		str = ts.italic ? '+I' : '-I';
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
	const diskFileSystemProvider = new DiskFileSystemProvider(new NullLogService());
	fileService.registerProvider(Schemas.file, diskFileSystemProvider);


	test('color defaults - monokai', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-monokai/themes/monokai-color-theme.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#75715E', 0),
			[variables]: ts('#F8F8F2', 0),
			[types]: ts('#A6E22E', TokenStyleBits.UNDERLINE),
			[functions]: ts('#A6E22E', 0),
			[strings]: ts('#E6DB74', 0),
			[numbers]: ts('#AE81FF', 0),
			[keywords]: ts('#F92672', 0)
		});

	});

	test('color defaults - dark+', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-defaults/themes/dark_plus.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#6A9955', 0),
			[variables]: ts('#9CDCFE', 0),
			[types]: ts('#4EC9B0', 0),
			[functions]: ts('#DCDCAA', 0),
			[strings]: ts('#CE9178', 0),
			[numbers]: ts('#B5CEA8', 0),
			[keywords]: ts('#C586C0', 0)
		});

	});

	test('color defaults - light vs', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-defaults/themes/light_vs.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#008000', 0),
			[variables]: ts('#000000', 0),
			[types]: ts('#000000', 0),
			[functions]: ts('#000000', 0),
			[strings]: ts('#a31515', 0),
			[numbers]: ts('#09885a', 0),
			[keywords]: ts('#0000ff', 0)
		});

	});

	test('color defaults - hc', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-defaults/themes/hc_black.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#7ca668', 0),
			[variables]: ts('#9CDCFE', 0),
			[types]: ts('#4EC9B0', 0),
			[functions]: ts('#DCDCAA', 0),
			[strings]: ts('#ce9178', 0),
			[numbers]: ts('#b5cea8', 0),
			[keywords]: ts('#C586C0', 0)
		});

	});

	test('color defaults - kimbie dark', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-kimbie-dark/themes/kimbie-dark-color-theme.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#a57a4c', 0),
			[variables]: ts('#dc3958', 0),
			[types]: ts('#f06431', 0),
			[functions]: ts('#8ab1b0', 0),
			[strings]: ts('#889b4a', 0),
			[numbers]: ts('#f79a32', 0),
			[keywords]: ts('#98676a', 0)
		});

	});

	test('color defaults - abyss', async () => {
		const themeData = ColorThemeData.createUnloadedTheme('foo');
		const themeLocation = getPathFromAmdModule(require, '../../../../../../../extensions/theme-abyss/themes/abyss-color-theme.json');
		themeData.location = URI.file(themeLocation);
		await themeData.ensureLoaded(fileService);

		assert.equal(themeData.isLoaded, true);

		assertTokenStyles(themeData, {
			[comments]: ts('#384887', 0),
			[variables]: ts('#6688cc', 0),
			[types]: ts('#ffeebb', TokenStyleBits.UNDERLINE),
			[functions]: ts('#ddbb88', 0),
			[strings]: ts('#22aa44', 0),
			[numbers]: ts('#f280d0', 0),
			[keywords]: ts('#225588', 0)
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
		assertTokenStyle(tokenStyle, ts('#F8F8F2', 0), 'variable');

		tokenStyle = themeData.resolveScopes([['keyword.operator']]);
		assertTokenStyle(tokenStyle, ts('#F92672', TokenStyleBits.ITALIC | TokenStyleBits.BOLD | TokenStyleBits.UNDERLINE), 'keyword');

		tokenStyle = themeData.resolveScopes([['keyword']]);
		assertTokenStyle(tokenStyle, defaultTokenStyle, 'keyword');

		tokenStyle = themeData.resolveScopes([['keyword.operator']]);
		assertTokenStyle(tokenStyle, ts('#F92672', TokenStyleBits.ITALIC | TokenStyleBits.BOLD | TokenStyleBits.UNDERLINE), 'keyword.operator');

		tokenStyle = themeData.resolveScopes([['keyword.operators']]);
		assertTokenStyle(tokenStyle, defaultTokenStyle, 'keyword.operators');

		tokenStyle = themeData.resolveScopes([['storage']]);
		assertTokenStyle(tokenStyle, ts('#F92672', TokenStyleBits.ITALIC), 'storage');

		tokenStyle = themeData.resolveScopes([['storage.type']]);
		assertTokenStyle(tokenStyle, ts('#66D9EF', TokenStyleBits.ITALIC), 'storage.type');

		tokenStyle = themeData.resolveScopes([['entity.name.class']]);
		assertTokenStyle(tokenStyle, ts('#A6E22E', TokenStyleBits.UNDERLINE), 'entity.name.class');

		tokenStyle = themeData.resolveScopes([['meta.structure.dictionary.json', 'string.quoted.double.json']]);
		assertTokenStyle(tokenStyle, ts('#66D9EF', undefined), 'json property');

		tokenStyle = themeData.resolveScopes([['keyword'], ['storage.type'], ['entity.name.class']]);
		assertTokenStyle(tokenStyle, ts('#66D9EF', TokenStyleBits.ITALIC), 'storage.type');

	});
});
