/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import * as assert from 'assert';
import { ITokenColorCustomizations } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { TokenStyle, TokenStyleBits } from 'vs/platform/theme/common/tokenStyleRegistry';
import { Color } from 'vs/base/common/color';
import { isString } from 'vs/base/common/types';

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

	// const fileService = new FileService(new NullLogService());
	// const diskFileSystemProvider = new DiskFileSystemProvider(new NullLogService());
	// fileService.registerProvider(Schemas.file, diskFileSystemProvider);




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
					scope: 'storage.type',
					settings: {
						foreground: '#66D9EF'
					}
				}
			]
		};

		themeData.setCustomTokenColors(customTokenColors);

		let tokenStyle;

		tokenStyle = themeData.findTokenStyleForScope('variable');
		assertTokenStyle(tokenStyle, ts('#F8F8F2', 0), 'variable');

		tokenStyle = themeData.findTokenStyleForScope('keyword');
		assertTokenStyle(tokenStyle, ts('#F92672', TokenStyleBits.ITALIC | TokenStyleBits.BOLD | TokenStyleBits.UNDERLINE), 'keyword');

		tokenStyle = themeData.findTokenStyleForScope('storage');
		assertTokenStyle(tokenStyle, ts('#F92672', TokenStyleBits.ITALIC), 'storage');

		tokenStyle = themeData.findTokenStyleForScope('storage.type');
		assertTokenStyle(tokenStyle, ts('#66D9EF', TokenStyleBits.ITALIC), 'storage.type');


	});
});
