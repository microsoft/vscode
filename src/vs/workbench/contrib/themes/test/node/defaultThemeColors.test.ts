/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { FileAccess } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IExtensionResourceLoaderService } from '../../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { ColorThemeData } from '../../../../services/themes/common/colorThemeData.js';

suite('Default theme colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Light 2026 inline code and code links remain distinct and readable on Markdown surfaces', async () => {
		const theme = ColorThemeData.createUnloadedTheme('vs');
		theme.location = FileAccess.asFileUri('vs/../../extensions/theme-defaults/themes/2026-light.json');
		await theme.ensureLoaded(new class extends mock<IExtensionResourceLoaderService>() {
			override async readExtensionResource(resource: URI): Promise<string> {
				return fs.promises.readFile(resource.fsPath, 'utf8');
			}
		}());

		const editorBackground = theme.getColor('editor.background')!;
		const quoteBackground = theme.getColor('textBlockQuote.background')!.makeOpaque(editorBackground);
		const codeBackground = theme.getColor('textPreformat.background')!;
		const quoteCodeBackground = codeBackground.makeOpaque(quoteBackground);
		const textContrast = ['editor.background', 'sideBar.background', 'editorWidget.background', 'textBlockQuote.background'].flatMap(surface => {
			const background = theme.getColor(surface)!.makeOpaque(editorBackground);
			const renderedBackground = codeBackground.makeOpaque(background);
			return ['textPreformat.foreground', 'textLink.foreground', 'textLink.activeForeground'].map(foreground => ({
				surface,
				foreground,
				readable: theme.getColor(foreground)!.makeOpaque(renderedBackground).getContrastRatio(renderedBackground) >= 4.5,
			}));
		});

		assert.deepStrictEqual({
			distinctFromQuote: quoteCodeBackground.getContrastRatio(quoteBackground) >= 1.3,
			textContrast,
		}, {
			distinctFromQuote: true,
			textContrast: textContrast.map(result => ({ ...result, readable: true })),
		});
	});
});
