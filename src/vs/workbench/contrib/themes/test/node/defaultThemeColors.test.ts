/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { editorRuler, ghostTextForeground } from '../../../../../editor/common/core/editorColorRegistry.js';
import { IExtensionResourceLoaderService } from '../../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { editorFindMatchHighlightBorder, listHoverBackground, minimapFindMatch, overviewRulerFindMatchForeground, quickInputBackground, quickInputListFocusBackground, quickInputListFocusForeground, quickInputListFocusHighlightForeground, quickInputListFocusIconForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { BANNER_BACKGROUND, BANNER_FOREGROUND, BANNER_ICON_FOREGROUND, EDITOR_GROUP_HEADER_CONNECTED_TABS_BACKGROUND, STATUS_BAR_ERROR_ITEM_BACKGROUND, STATUS_BAR_ERROR_ITEM_FOREGROUND, STATUS_BAR_ERROR_ITEM_HOVER_BACKGROUND, STATUS_BAR_ERROR_ITEM_HOVER_FOREGROUND, STATUS_BAR_ITEM_COMPACT_HOVER_BACKGROUND, TAB_BORDER, TAB_DIVIDER, TAB_INACTIVE_FOREGROUND } from '../../../../common/theme.js';
import { ColorThemeData } from '../../../../services/themes/common/colorThemeData.js';
import { resolveTabDividerBorderCustomization } from '../../../../services/themes/common/tabDividerColor.js';

suite('Default theme colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function loadDefaultTheme(name: string, selector: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light', extension = 'theme-defaults'): Promise<ColorThemeData> {
		const theme = ColorThemeData.createUnloadedTheme(selector);
		theme.location = FileAccess.asFileUri(`vs/../../extensions/${extension}/themes/${name}`);
		await theme.ensureLoaded(new class extends mock<IExtensionResourceLoaderService>() {
			override async readExtensionResource(resource: URI): Promise<string> {
				return fs.promises.readFile(resource.fsPath, 'utf8');
			}
		}());
		return theme;
	}

	function getTokenForeground(theme: ColorThemeData, scope: string): string | undefined {
		return theme.tokenColors.findLast(rule => {
			return Array.isArray(rule.scope) ? rule.scope.includes(scope) : rule.scope === scope;
		})?.settings.foreground?.toLowerCase();
	}

	test('Light Modern Quick Pick focus is distinct from idle and hovered rows with readable content', async () => {
		const theme = await loadDefaultTheme('light_modern.json', 'vs');
		const background = theme.getColor(quickInputBackground)!;
		const focusedBackground = theme.getColor(quickInputListFocusBackground)!.makeOpaque(background);
		const hoveredBackground = theme.getColor(listHoverBackground)!.makeOpaque(background);

		assert.deepStrictEqual({
			distinctFromIdle: focusedBackground.getContrastRatio(background) >= 3,
			distinctFromHover: focusedBackground.getContrastRatio(hoveredBackground) >= 3,
			content: [quickInputListFocusForeground, quickInputListFocusIconForeground, quickInputListFocusHighlightForeground].map(id => ({
				id,
				readable: theme.getColor(id)!.makeOpaque(focusedBackground).getContrastRatio(focusedBackground) >= 4.5,
			})),
		}, {
			distinctFromIdle: true,
			distinctFromHover: true,
			content: [quickInputListFocusForeground, quickInputListFocusIconForeground, quickInputListFocusHighlightForeground].map(id => ({ id, readable: true })),
		});
	});

	for (const { name, file, selector, keywordForeground, invalidForeground } of [
		{ name: 'Dark 2026', file: '2026-dark.json', selector: 'vs-dark', keywordForeground: '#569cd6', invalidForeground: '#ffa198' },
		{ name: 'Light 2026', file: '2026-light.json', selector: 'vs', keywordForeground: '#0550ae', invalidForeground: '#82071e' },
	] as const) {
		test(`${name} keywords and storage types are blue while illegal syntax stays red`, async () => {
			const theme = await loadDefaultTheme(file, selector);
			const scopes = ['keyword', 'keyword.control', 'storage', 'storage.type'];

			assert.deepStrictEqual({
				keywordForegrounds: scopes.map(scope => getTokenForeground(theme, scope)),
				invalidForeground: getTokenForeground(theme, 'invalid.illegal'),
				resolvedForegrounds: [
					theme.resolveScopes([['source.ts', 'keyword.control.flow.ts']])?.foreground?.toString(),
					theme.resolveScopes([['source.ts', 'storage.type.ts']])?.foreground?.toString(),
					theme.resolveScopes([['source.ts', 'invalid.illegal.ts']])?.foreground?.toString(),
				],
			}, {
				keywordForegrounds: scopes.map(() => keywordForeground),
				invalidForeground,
				resolvedForegrounds: [keywordForeground, keywordForeground, invalidForeground],
			});
		});

		test(`${name} editor placeholders are readable and quieter than entered text`, async () => {
			const theme = await loadDefaultTheme(file, selector);
			// The browser contribution registers the placeholder color with this fallback.
			const placeholder = theme.getColor('editor.placeholder.foreground') ?? theme.getColor(ghostTextForeground)!;
			const foreground = theme.getColor('editor.foreground')!;
			const surfaces = ['input.background', 'sideBar.background', 'editor.background', 'editorWidget.background', 'agentsChatInput.background'];

			assert.deepStrictEqual(surfaces.map(surface => {
				const background = theme.getColor(surface)!;
				const contrast = placeholder.makeOpaque(background).getContrastRatio(background);
				return {
					surface,
					readable: contrast > 4.5,
					quieterThanEnteredText: contrast < foreground.getContrastRatio(background),
				};
			}), surfaces.map(surface => ({ surface, readable: true, quieterThanEnteredText: true })));
		});

		test(`${name} defines a distinct confetti palette visible on workbench surfaces`, async () => {
			const theme = await loadDefaultTheme(file, selector);
			const surfaces = ['editor.background', 'sideBar.background', 'agents.background', 'agentsChatInput.background', 'editorWidget.background'];
			const palette = Array.from({ length: 6 }, (_, index) => {
				const id = `confetti.color${index + 1}`;
				return { id, color: theme.getColor(id, false) };
			});
			assert.deepStrictEqual({
				distinctColors: new Set(palette.map(({ color }) => color?.toString())).size,
				palette: palette.map(({ id, color }) => ({
					id,
					opaque: color?.isOpaque(),
					visible: surfaces.every(surface => {
						const background = theme.getColor(surface);
						return color !== undefined && background !== undefined && color.getContrastRatio(background) >= 3;
					}),
				})),
			}, {
				distinctColors: 6,
				palette: palette.map(({ id }) => ({ id, opaque: true, visible: true })),
			});
		});
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
		const keywordForeground = getTokenForeground(theme, 'keyword');
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

	test('Light 2026 connected tabs have a light strip, visible dividers, and readable labels', async () => {
		const theme = await loadDefaultTheme('2026-light.json', 'vs');
		const strip = theme.getColor(EDITOR_GROUP_HEADER_CONNECTED_TABS_BACKGROUND)!.makeOpaque(theme.getColor('editor.background')!);
		const divider = theme.getColor(TAB_DIVIDER)!.makeOpaque(strip);
		const activeSurfaces = ['editor.background', 'sideBar.background', 'panel.background'];
		const inactiveForegrounds = [TAB_INACTIVE_FOREGROUND, 'activityBarTop.inactiveForeground', 'panelTitle.inactiveForeground'];

		assert.deepStrictEqual({
			lightStrip: strip.getRelativeLuminance() >= 0.85,
			darkerDivider: divider.getRelativeLuminance() < strip.getRelativeLuminance(),
			distinctDivider: divider.getContrastRatio(strip) >= 1.3,
			distinctActiveSurfaces: activeSurfaces.map(id => theme.getColor(id)!.getContrastRatio(strip) >= 1.08),
			readableInactiveForegrounds: inactiveForegrounds.map(id => theme.getColor(id)!.makeOpaque(strip).getContrastRatio(strip) >= 4.5),
		}, {
			lightStrip: true,
			darkerDivider: true,
			distinctDivider: true,
			distinctActiveSurfaces: activeSurfaces.map(() => true),
			readableInactiveForegrounds: inactiveForegrounds.map(() => true),
		});

		theme.setCustomColors({
			[EDITOR_GROUP_HEADER_CONNECTED_TABS_BACKGROUND]: '#123456',
			[TAB_DIVIDER]: '#abcdef',
		});
		assert.deepStrictEqual([
			theme.getColor(EDITOR_GROUP_HEADER_CONNECTED_TABS_BACKGROUND)?.toString(),
			theme.getColor(TAB_DIVIDER)?.toString(),
		], ['#123456', '#abcdef']);
	});

	test('Light 2026 dividers follow a customized tab.border unless tab.divider is customized', async () => {
		const theme = await loadDefaultTheme('2026-light.json', 'vs');
		const resolve = (customColors: { [id: string]: string }) => {
			theme.setCustomColors(customColors);
			return [resolveTabDividerBorderCustomization(theme)?.toString(), theme.getColor(TAB_DIVIDER)?.toString()];
		};

		assert.deepStrictEqual([
			resolve({}),
			resolve({ [TAB_BORDER]: '#ff0000' }),
			resolve({ [TAB_BORDER]: '#ff0000', [TAB_DIVIDER]: '#00ff00' }),
		], [
			[undefined, '#cecece'],
			['#ff0000', '#cecece'],
			[undefined, '#00ff00'],
		]);
	});

	test('minimap find markers stay visible and match the overview ruler in default themes', async () => {
		const themes = await Promise.all([
			loadDefaultTheme('dark_modern.json', 'vs-dark'),
			loadDefaultTheme('light_modern.json', 'vs'),
			loadDefaultTheme('2026-dark.json', 'vs-dark'),
			loadDefaultTheme('2026-light.json', 'vs'),
		]);

		assert.deepStrictEqual(themes.map(theme => {
			const background = theme.getColor('editor.background')!;
			const marker = theme.getColor(minimapFindMatch)!;
			const ruler = theme.getColor(overviewRulerFindMatchForeground)!;
			return {
				matchesRuler: marker.rgba.r === ruler.rgba.r && marker.rgba.g === ruler.rgba.g && marker.rgba.b === ruler.rgba.b,
				opacity: marker.rgba.a,
				visibleFullLine: marker.transparent(0.5).makeOpaque(background).getContrastRatio(background) >= 1.5,
			};
		}), themes.map(() => ({ matchesRuler: true, opacity: 0.8, visibleFullLine: true })));
	});

	test('high-contrast minimap find markers use the editor match border', async () => {
		const themes = await Promise.all([
			loadDefaultTheme('hc_black.json', 'hc-black'),
			loadDefaultTheme('hc_light.json', 'hc-light'),
		]);

		assert.deepStrictEqual(themes.map(theme => theme.getColor(minimapFindMatch)?.rgba), themes.map(theme => theme.getColor(editorFindMatchHighlightBorder)!.rgba));
	});

	test('minimap find markers follow customized overview colours and preserve explicit minimap colours', async () => {
		const theme = await loadDefaultTheme('2026-light.json', 'vs');
		theme.setCustomColors({ [overviewRulerFindMatchForeground]: '#52a37019' });
		const inherited = theme.getColor(minimapFindMatch)!.rgba;
		const customColors = ['#123456', '#98765440', '#abcdef00'];
		const customized = customColors.map(color => {
			theme.setCustomColors({
				[overviewRulerFindMatchForeground]: '#52a37019',
				[minimapFindMatch]: color,
			});
			return theme.getColor(minimapFindMatch)!.rgba;
		});

		assert.deepStrictEqual({ inherited, customized }, {
			inherited: new RGBA(82, 163, 112, 0.8),
			customized: customColors.map(color => Color.fromHex(color).rgba),
		});
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
