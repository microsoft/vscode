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

function ts(foreground: string | undefined, styleFlags: number | undefined): TokenStyle {
	const foregroundColor = isString(foreground) ? Color.fromHex(foreground) : undefined;
	return new TokenStyle(foregroundColor, undefined, styleFlags);
}

function tokenStyleAsString(ts: TokenStyle | undefined | null) {
	return ts ? `${ts.foreground ? ts.foreground.toString() : 'no-foreground'}-${ts.styles ? ts.styles : 'no-styles'}` : 'tokenstyle-undefined';
}

function assertTokenStyle(expected: TokenStyle | undefined | null, actual: TokenStyle | undefined | null, message?: string) {
	assert.equal(tokenStyleAsString(expected), tokenStyleAsString(actual), message);
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

		let tokenStyle;

		tokenStyle = themeData.getTokenStyle(comments);
		assertTokenStyle(tokenStyle, ts('#75715E', 0));

		tokenStyle = themeData.getTokenStyle(variables);
		assertTokenStyle(tokenStyle, ts('#F8F8F2', 0));

		tokenStyle = themeData.getTokenStyle(types);
		assertTokenStyle(tokenStyle, ts('#A6E22E', TokenStyleBits.UNDERLINE));

		tokenStyle = themeData.getTokenStyle(functions);
		assertTokenStyle(tokenStyle, ts('#A6E22E', 0));

		tokenStyle = themeData.getTokenStyle(strings);
		assertTokenStyle(tokenStyle, ts('#E6DB74', 0));

		tokenStyle = themeData.getTokenStyle(numbers);
		assertTokenStyle(tokenStyle, ts('#AE81FF', 0));

		tokenStyle = themeData.getTokenStyle(keywords);
		assertTokenStyle(tokenStyle, ts('#F92672', 0));

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
					scope: 'keyword',
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

		tokenStyle = themeData.findTokenStyleForScope(['variable']);
		assertTokenStyle(tokenStyle, ts('#F8F8F2', 0), 'variable');

		tokenStyle = themeData.findTokenStyleForScope(['keyword']);
		assertTokenStyle(tokenStyle, ts('#F92672', TokenStyleBits.ITALIC | TokenStyleBits.BOLD | TokenStyleBits.UNDERLINE), 'keyword');

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
