/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { Color } from '../../../../../base/common/color.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { editorRuler } from '../../../../../editor/common/core/editorColorRegistry.js';
import { IExtensionResourceLoaderService } from '../../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { BANNER_BACKGROUND, BANNER_FOREGROUND, BANNER_ICON_FOREGROUND, STATUS_BAR_ERROR_ITEM_BACKGROUND, STATUS_BAR_ERROR_ITEM_FOREGROUND, STATUS_BAR_ERROR_ITEM_HOVER_BACKGROUND, STATUS_BAR_ERROR_ITEM_HOVER_FOREGROUND, STATUS_BAR_ITEM_COMPACT_HOVER_BACKGROUND } from '../../../../common/theme.js';
import { ColorThemeData } from '../../../../services/themes/common/colorThemeData.js';

suite('Default theme colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function loadDefaultTheme(name: string, selector: 'vs' | 'vs-dark', extension = 'theme-defaults'): Promise<ColorThemeData> {
		const theme = ColorThemeData.createUnloadedTheme(selector);
		theme.location = FileAccess.asFileUri(`vs/../../extensions/${extension}/themes/${name}`);
		await theme.ensureLoaded(new class extends mock<IExtensionResourceLoaderService>() {
			override async readExtensionResource(resource: URI): Promise<string> {
				return fs.promises.readFile(resource.fsPath, 'utf8');
			}
		}());
		return theme;
	}

	test('Light 2026 inline code and code links remain distinct and readable on Markdown surfaces', async () => {
		const theme = await loadDefaultTheme('2026-light.json', 'vs');
		const editorBackground = theme.getColor('editor.background')!;
		const quoteBackground = theme.getColor('textBlockQuote.background')!.makeOpaque(editorBackground);
		const codeBackground = theme.getColor('textPreformat.background')!;
		const codeForeground = theme.getColor('textPreformat.foreground')!;
		const quoteCodeBackground = codeBackground.makeOpaque(quoteBackground);
		const textContrast = ['editor.background', 'sideBar.background', 'editorWidget.background', 'textBlockQuote.background'].map(surface => {
			const background = theme.getColor(surface)!.makeOpaque(editorBackground);
			const renderedBackground = codeBackground.makeOpaque(background);
			return {
				surface,
				readable: codeForeground.makeOpaque(renderedBackground).getContrastRatio(renderedBackground) >= 4.5,
			};
		});
		const linkDistinction = ['textLink.foreground', 'textLink.activeForeground'].map(foreground => ({
			foreground,
			distinctFromText: theme.getColor(foreground)!.getContrastRatio(theme.getColor('foreground')!) >= 3,
		}));
		const keywordForeground = theme.tokenColors.findLast(rule => rule.scope === 'keyword')?.settings.foreground;
		assert.ok(keywordForeground);
		const codeBlockBackground = theme.getColor('textCodeBlock.background')!.makeOpaque(editorBackground);

		assert.deepStrictEqual({
			distinctFromQuote: quoteCodeBackground.getContrastRatio(quoteBackground) >= 1.3,
			textContrast,
			linkDistinction,
			readableCodeBlockKeyword: Color.fromHex(keywordForeground).getContrastRatio(codeBlockBackground) >= 4.5,
		}, {
			distinctFromQuote: true,
			textContrast: textContrast.map(result => ({ ...result, readable: true })),
			linkDistinction: linkDistinction.map(result => ({ ...result, distinctFromText: true })),
			readableCodeBlockKeyword: true,
		});
	});

	test('Light 2026 rulers have at least the contrast of Light Modern', async () => {
		const themes = await Promise.all([
			loadDefaultTheme('2026-light.json', 'vs'),
			loadDefaultTheme('light_modern.json', 'vs'),
		]);
		const [contrast, referenceContrast] = themes.map(theme => {
			const background = theme.getColor('editor.background')!;
			return theme.getColor(editorRuler)!.makeOpaque(background).getContrastRatio(background);
		});

		assert.ok(contrast >= referenceContrast, `Light 2026 ruler contrast ${contrast} is below Light Modern's ${referenceContrast}`);
	});

	test('Quiet Light banner text, links and icon remain readable', async () => {
		const theme = await loadDefaultTheme('quietlight-color-theme.json', 'vs', 'theme-quietlight');
		const background = theme.getColor(BANNER_BACKGROUND)!;
		const foreground = theme.getColor(BANNER_FOREGROUND)!;
		const icon = theme.getColor(BANNER_ICON_FOREGROUND)!;

		assert.deepStrictEqual({
			readableTextAndLinks: foreground.makeOpaque(background).getContrastRatio(background) >= 4.5,
			distinctIcon: icon.makeOpaque(background).getContrastRatio(background) >= 3,
		}, {
			readableTextAndLinks: true,
			distinctIcon: true,
		});
	});

	test('Dark 2026 error status hover stays red, distinguishable and readable', async () => {
		const theme = await loadDefaultTheme('2026-dark.json', 'vs-dark');
		const background = theme.getColor(STATUS_BAR_ERROR_ITEM_BACKGROUND)!;
		const foreground = theme.getColor(STATUS_BAR_ERROR_ITEM_FOREGROUND)!;
		const hoverBackground = theme.getColor(STATUS_BAR_ERROR_ITEM_HOVER_BACKGROUND)!.makeOpaque(background);
		const hoverForeground = theme.getColor(STATUS_BAR_ERROR_ITEM_HOVER_FOREGROUND)!;
		const compactBackground = theme.getColor(STATUS_BAR_ITEM_COMPACT_HOVER_BACKGROUND)!.makeOpaque(hoverBackground);

		assert.deepStrictEqual({
			hoverHue: hoverBackground.hsla.h,
			distinctHover: background.getContrastRatio(hoverBackground) >= 1.2,
			hoverForeground: hoverForeground.toString(),
			readableHover: hoverForeground.getContrastRatio(hoverBackground) >= 4.5,
			readableCompactHover: hoverForeground.getContrastRatio(compactBackground) >= 4.5,
		}, {
			hoverHue: background.hsla.h,
			distinctHover: true,
			hoverForeground: foreground.toString(),
			readableHover: true,
			readableCompactHover: true,
		});
	});
});
