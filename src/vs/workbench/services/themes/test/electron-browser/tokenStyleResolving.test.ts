/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import * as assert from 'assert';
import { ITokenColorCustomizations } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { TokenStyle, TokenStyleBits, comments, variables, types, functions, keywords, numbers, strings } from 'vs/platform/theme/common/tokenStyleRegistry';
import { Color } from 'vs/base/common/color';
import { isString } from 'vs/base/common/types';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { editorForeground } from 'vs/platform/theme/common/colorRegistry';

function ts(foreground: string | undefined, styleFlags: number | undefined): TokenStyle {
	const foregroundColor = isString(foreground) ? Color.fromHex(foreground) : undefined;
	return new TokenStyle(foregroundColor, undefined, styleFlags);
}

function tokenStyleAsString(ts: TokenStyle | undefined | null) {
	return ts ? `${ts.foreground ? ts.foreground.toString() : 'no-foreground'}-${ts.styles ? ts.styles : 'no-styles'}` : 'tokenstyle-undefined';
}

function assertTokenStyle(actual: TokenStyle | undefined | null, expected: TokenStyle | undefined | null, message?: string) {
	assert.equal(tokenStyleAsString(actual), tokenStyleAsString(expected), message);
}

function assertTokenStyles(themeData: ColorThemeData, expected: { [tokenStyleId: string]: TokenStyle }) {
	for (let tokenStyleId in expected) {
		const tokenStyle = themeData.getTokenStyle(tokenStyleId);
		assertTokenStyle(tokenStyle, expected[tokenStyleId], tokenStyleId);
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

	test('resolve resource', async () => {
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
		let defaultTokenStyle = new TokenStyle(themeData.getColor(editorForeground));

		tokenStyle = themeData.findTokenStyleForScope(['variable']);
		assertTokenStyle(tokenStyle, ts('#F8F8F2', 0), 'variable');

		tokenStyle = themeData.findTokenStyleForScope(['keyword.operator']);
		assertTokenStyle(tokenStyle, ts('#F92672', TokenStyleBits.ITALIC | TokenStyleBits.BOLD | TokenStyleBits.UNDERLINE), 'keyword');

		tokenStyle = themeData.findTokenStyleForScope(['keyword']);
		assertTokenStyle(tokenStyle, defaultTokenStyle, 'keyword');

		tokenStyle = themeData.findTokenStyleForScope(['keyword.operator']);
		assertTokenStyle(tokenStyle, ts('#F92672', TokenStyleBits.ITALIC | TokenStyleBits.BOLD | TokenStyleBits.UNDERLINE), 'keyword.operator');

		tokenStyle = themeData.findTokenStyleForScope(['keyword.operators']);
		assertTokenStyle(tokenStyle, defaultTokenStyle, 'keyword.operators');

		tokenStyle = themeData.findTokenStyleForScope(['storage']);
		assertTokenStyle(tokenStyle, ts('#F92672', TokenStyleBits.ITALIC), 'storage');

		tokenStyle = themeData.findTokenStyleForScope(['storage.type']);
		assertTokenStyle(tokenStyle, ts('#66D9EF', TokenStyleBits.ITALIC), 'storage.type');

		tokenStyle = themeData.findTokenStyleForScope(['entity.name.class']);
		assertTokenStyle(tokenStyle, ts('#A6E22E', TokenStyleBits.UNDERLINE), 'entity.name.class');

		tokenStyle = themeData.findTokenStyleForScope(['meta.structure.dictionary.json', 'string.quoted.double.json']);
		assertTokenStyle(tokenStyle, ts('#66D9EF', undefined), 'json property');

	});
});
