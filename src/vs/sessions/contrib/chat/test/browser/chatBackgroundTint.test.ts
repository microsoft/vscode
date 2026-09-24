/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../../../base/browser/dom.js';
import { Menu } from '../../../../../base/browser/ui/menu/menu.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { editorGutter } from '../../../../../editor/common/core/editorColorRegistry.js';
import { isICommandActionToggleInfo } from '../../../../../platform/action/common/action.js';
import { isIMenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { defaultMenuStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariableName } from '../../../../../platform/theme/common/colorUtils.js';
import { descriptionForeground, errorForeground, focusBorder, foreground, textLinkForeground } from '../../../../../platform/theme/common/colors/baseColors.js';
import { editorBackground, editorForeground, editorStickyScrollBackground, editorStickyScrollGutterBackground } from '../../../../../platform/theme/common/colors/editorColors.js';
import { buttonBackground, buttonForeground, buttonHoverBackground, inputBackground, inputPlaceholderForeground } from '../../../../../platform/theme/common/colors/inputColors.js';
import { listActiveSelectionBackground, listActiveSelectionForeground, listHighlightForeground, listHoverBackground, listHoverForeground } from '../../../../../platform/theme/common/colors/listColors.js';
import { menuBackground, menuSelectionBackground, menuSelectionBorder, menuSelectionForeground } from '../../../../../platform/theme/common/colors/menuColors.js';
import { quickInputBackground, quickInputListFocusBackground, quickInputListFocusForeground, quickInputListFocusHighlightForeground } from '../../../../../platform/theme/common/colors/quickpickColors.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { EDITOR_GROUP_EMPTY_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_ACTION_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_ACTION_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND, MODERN_EDITOR_TAB_INACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_BACKGROUND, MODERN_TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_FOREGROUND, SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from '../../../../../workbench/common/theme.js';
import { ansiColorIdentifiers, TERMINAL_BACKGROUND_COLOR, TERMINAL_FOREGROUND_COLOR } from '../../../../../workbench/contrib/terminal/common/terminalColorRegistry.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ColorThemeData } from '../../../../../workbench/services/themes/common/colorThemeData.js';
import { IColorMap, IWorkbenchColorTheme, IWorkbenchThemeService } from '../../../../../workbench/services/themes/common/workbenchThemeService.js';
import '../../../../browser/media/workbench.css';
import { Menus } from '../../../../browser/menus.js';
import { applyAgentsPartCardStyles } from '../../../../browser/parts/agentsPartCard.js';
import { applySessionViewThemeColors } from '../../../../browser/parts/sessionBarStyles.js';
import { SessionsChatBackgroundAvailableContext, SessionsChatBackgroundImageConfiguredContext } from '../../../../common/contextkeys.js';
import { activeSessionViewBackground, activeSessionViewForeground, agentsBackground, agentsChatInputBackground, agentsChatInputForeground, agentsChatInputPlaceholderForeground, agentsDetailBackground, agentsPanelBackground, agentsPanelForeground, inactiveSessionViewBackground, inactiveSessionViewForeground } from '../../../../common/theme.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING, SessionsChatBackgroundService } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING, generateChatBackgroundTheme, getChatBackgroundImageColor, getChatBackgroundTintedColor, SessionsChatBackgroundTint, ToggleChatBackgroundTintAction } from '../../browser/chatBackgroundTint.js';

const backgroundColors = [agentsBackground, agentsPanelBackground, activeSessionViewBackground, inactiveSessionViewBackground, agentsChatInputBackground, editorBackground, inputBackground, menuBackground, quickInputBackground];
const foregroundColors = [foreground, SIDE_BAR_FOREGROUND, descriptionForeground, agentsPanelForeground, activeSessionViewForeground, inactiveSessionViewForeground, agentsChatInputForeground, agentsChatInputPlaceholderForeground];

function createTheme(type = ColorScheme.DARK, background = '#202020', foreground = '#cccccc'): ColorThemeData {
	return ColorThemeData.createUnloadedThemeForThemeType(type, Object.fromEntries([
		...backgroundColors.map(color => [color, background]),
		...foregroundColors.map(color => [color, foreground]),
		[editorForeground, foreground],
	]));
}

class TestOverlayThemeService extends TestThemeService {
	private readonly overlays = new Set<(theme: IWorkbenchColorTheme) => IColorMap>();

	constructor(private theme: ColorThemeData) {
		super(theme);
	}

	override getColorTheme(): ColorThemeData {
		return this.theme;
	}

	override setTheme(theme: ColorThemeData): void {
		this.theme = theme;
		this.refresh();
	}

	registerColorThemeOverlay(getColors: (theme: IWorkbenchColorTheme) => IColorMap): IDisposable {
		this.overlays.add(getColors);
		this.refresh();
		return toDisposable(() => {
			this.overlays.delete(getColors);
			this.refresh();
		});
	}

	private refresh(): void {
		this.theme.setTransientColors(undefined);
		this.theme.setTransientColors(Object.assign({}, ...[...this.overlays].map(getColors => getColors(this.theme))));
		super.setTheme(this.theme);
	}
}

suite('Sessions Chat Background Tint', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('offers the tint toggle in both background menus and the Command Palette only for supported images', () => {
		disposables.add(registerAction2(ToggleChatBackgroundTintAction));
		const configuration = new TestConfigurationService();
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		const keys = [ChatContextKeys.enabled, IsSessionsWindowContext, SessionsChatBackgroundAvailableContext, SessionsChatBackgroundImageConfiguredContext, ChatContextKeys.contextMenuIsBackground]
			.map(key => key.bindTo(context));
		for (const key of keys) {
			key.set(true);
		}
		const items = [Menus.SessionChatBackgroundContext, MenuId.ChatContext, MenuId.CommandPalette].map(menu =>
			MenuRegistry.getMenuItems(menu).filter(isIMenuItem).find(item => item.command.id === ToggleChatBackgroundTintAction.ID)!);
		const visibility = () => items.map(item => context.contextMatchesRules(item.when) && context.contextMatchesRules(item.command.precondition));
		const supported = visibility();
		const unsupported = keys.map(key => {
			key.set(false);
			const visible = visibility();
			key.set(true);
			return visible;
		});
		assert.deepStrictEqual({
			placements: items.slice(0, 2).map(item => ({ group: item.group, order: item.order })),
			supported,
			unsupported,
		}, {
			placements: [{ group: 'navigation', order: 3 }, { group: 'zz_background', order: 3 }],
			supported: [true, true, true],
			unsupported: [
				[false, false, false],
				[false, false, false],
				[false, false, false],
				[false, false, false],
				[true, false, true],
			],
		});
	});

	test('keeps the tint toggle check mark in sync with the setting', async () => {
		const configuration = new TestConfigurationService({ [AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING]: false });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		const toggled = new ToggleChatBackgroundTintAction().desc.toggled;
		const condition = isICommandActionToggleInfo(toggled) ? toggled.condition : toggled;
		const checked = [context.contextMatchesRules(condition)];
		await configuration.setUserConfiguration(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING, true);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectedKeys: new Set([AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING]),
			affectsConfiguration: key => key === AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING,
		}));
		checked.push(context.contextMatchesRules(condition));
		assert.deepStrictEqual(checked, [false, true]);
	});

	test('the tint action saves the preference without modifying the background image', async () => {
		const updates: { key: string; value: unknown; target: ConfigurationTarget | undefined }[] = [];
		const configuration = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown, target?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void> {
				updates.push({ key, value, target: typeof target === 'number' ? target : undefined });
				await this.setUserConfiguration(key, value);
			}
		}({ [AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: '/first.png' });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		const action = new ToggleChatBackgroundTintAction();
		await action.run(instantiationService);
		await action.run(instantiationService);
		assert.deepStrictEqual({
			updates,
			image: configuration.getValue(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING),
		}, {
			updates: [
				{ key: AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING, value: true, target: ConfigurationTarget.USER },
				{ key: AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING, value: false, target: ConfigurationTarget.USER },
			],
			image: '/first.png',
		});
	});

	function createFixture(background = '/first.png', tintEnabled = true) {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => root.remove()));
		const configurationService = new TestConfigurationService({
			[AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING]: tintEnabled,
			[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: background,
			[AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING]: background,
		});
		const themeService = new TestOverlayThemeService(createTheme());
		const backgroundService = disposables.add(new SessionsChatBackgroundService(
			configurationService,
			themeService,
			disposables.add(new MockContextKeyService()),
			disposables.add(new InMemoryStorageService()),
		));
		const requests: { uri: URI; store: DisposableStore; result: DeferredPromise<Color | undefined> }[] = [];
		const warnings: string[] = [];
		class TestTint extends SessionsChatBackgroundTint {
			protected override readImageColor(uri: URI, store: DisposableStore): Promise<Color | undefined> {
				const result = new DeferredPromise<Color | undefined>();
				requests.push({ uri, store, result });
				return result.p;
			}

			sampleImage(uri: URI): Promise<Color | undefined> {
				return super.readImageColor(uri, disposables.add(new DisposableStore()));
			}
		}
		const tint = disposables.add(new TestTint(
			backgroundService,
			configurationService,
			upcastPartial<IWorkbenchThemeService>({ registerColorThemeOverlay: getColors => themeService.registerColorThemeOverlay(getColors) }),
			upcastPartial<ILogService>({ warn: message => warnings.push(String(message)) }),
		));
		const configure = async (key: string, value: string | boolean) => {
			await configurationService.setUserConfiguration(key, value);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: candidate => candidate === key,
			}));
		};
		return { root, tint, requests, warnings, themeService, configure };
	}

	test('weights image colors by opacity and ignores fully transparent pixels', () => {
		assert.deepStrictEqual([
			getChatBackgroundImageColor(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]))?.rgba,
			getChatBackgroundImageColor(new Uint8ClampedArray([255, 0, 0, 128, 0, 0, 255, 255]))?.rgba,
			getChatBackgroundImageColor(new Uint8ClampedArray([255, 0, 0, 0])),
			getChatBackgroundImageColor(new Uint8ClampedArray()),
		], [
			new RGBA(255, 0, 0, 0.5),
			new RGBA(85, 0, 170, 383 / 510),
			undefined,
			undefined,
		]);
	});

	test('decodes and samples an image using a small canvas', async () => {
		const { tint } = createFixture('');
		const uri = URI.parse(`data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#c06030"/></svg>')}`);
		const color = await tint.sampleImage(uri);
		assert.deepStrictEqual(color?.rgba, new RGBA(192, 96, 48, 1));
	});

	test('retains readable text contrast for dark and light surfaces', () => {
		const results = [];
		for (const [backgroundValue, foregroundValue] of [['#202020', '#cccccc'], ['#ffffff', '#666666']]) {
			const background = Color.fromHex(backgroundValue);
			const text = Color.fromHex(foregroundValue);
			for (const value of ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff']) {
				const tinted = getChatBackgroundTintedColor(background, Color.fromHex(value), [text], 0.1);
				results.push(tinted.isOpaque() && !tinted.equals(background) && tinted.getContrastRatio(text) >= 4.5);
			}
		}
		assert.deepStrictEqual(results, Array(12).fill(true));
	});

	test('adjusts brightness to tint low-contrast surfaces without reducing readability', () => {
		const background = Color.fromHex('#202020');
		const image = Color.fromHex('#ff0000');
		const text = Color.fromHex('#555555');
		const tinted = getChatBackgroundTintedColor(background, image, [text], 0.1);
		assert.deepStrictEqual({
			tinted: !tinted.equals(background),
			contrastPreserved: tinted.getContrastRatio(text) >= background.getContrastRatio(text),
			hue: tinted.hsla.h,
		}, { tinted: true, contrastPreserved: true, hue: image.hsla.h });
	});

	test('does not recolor neutral images or transparent surfaces without a backdrop', () => {
		const background = Color.fromHex('#202020');
		const transparent = Color.fromHex('#20202080');
		assert.deepStrictEqual([
			getChatBackgroundTintedColor(background, Color.fromHex('#808080'), [Color.white], 0.1).toString(),
			getChatBackgroundTintedColor(transparent, Color.fromHex('#ff0000'), [Color.white], 0.1).toString(),
			getChatBackgroundTintedColor(Color.transparent, Color.fromHex('#ff0000'), [Color.white], 0.1, background).toString(),
		], [background.toString(), transparent.toString(), Color.transparent.toString()]);
	});

	test('preserves hover text contrast over the final generated backdrop', () => {
		const results = ['#dfca8844', '#ffffff04', '#00000000'].map(hoverBackground => {
			const theme = ColorThemeData.createUnloadedThemeForThemeType(ColorScheme.LIGHT, {
				[editorBackground]: '#fdf6e3',
				[SIDE_BAR_BACKGROUND]: '#eee8d5',
				[listHoverBackground]: hoverBackground,
			});
			const hoverColors = [MODERN_TAB_HOVER_BACKGROUND, listHoverBackground];
			const textColors = [MODERN_TAB_HOVER_FOREGROUND, listHoverForeground];
			const originalBackdrop = theme.getColor(agentsPanelBackground)!;
			const originalSurfaces = hoverColors.map(id => theme.getColor(id)!.makeOpaque(originalBackdrop));
			const minimumContrasts = originalSurfaces.map((surface, index) =>
				Math.min(4.5, surface.getContrastRatio((theme.getColor(textColors[index]) ?? theme.getColor(foreground)!).makeOpaque(surface))));
			const originalAlpha = theme.getColor(listHoverBackground)!.rgba.a;
			const colors = generateChatBackgroundTheme(theme, Color.fromHex('#0000ff'));
			theme.setTransientColors(colors);
			return {
				readable: hoverColors.map((id, index) => {
					const surface = theme.getColor(id)!.makeOpaque(theme.getColor(agentsPanelBackground)!);
					const text = theme.getColor(textColors[index]) ?? theme.getColor(foreground)!;
					return surface.getContrastRatio(text.makeOpaque(surface)) >= minimumContrasts[index];
				}),
				alphaPreserved: theme.getColor(listHoverBackground)!.rgba.a === originalAlpha,
			};
		});
		assert.deepStrictEqual(results, [
			{ readable: [true, true], alphaPreserved: true },
			{ readable: [true, true], alphaPreserved: true },
			{ readable: [true, true], alphaPreserved: true },
		]);
	});

	test('preserves shared description contrast on both light and dark generated surfaces', () => {
		const theme = createTheme(ColorScheme.LIGHT, '#ffffff', '#333333');
		theme.setCustomColors({
			[agentsPanelBackground]: '#000000',
			[agentsPanelForeground]: '#ffffff',
			[descriptionForeground]: '#767676',
		});
		const surfaces = [agentsBackground, agentsPanelBackground, agentsDetailBackground, activeSessionViewBackground, inactiveSessionViewBackground, quickInputBackground];
		const originalDescription = theme.getColor(descriptionForeground)!;
		const minimumContrasts = surfaces.map(id => Math.min(4.5, theme.getColor(id)!.getContrastRatio(originalDescription)));
		const colors = generateChatBackgroundTheme(theme, Color.fromHex('#a0539e'));
		theme.setTransientColors(colors);
		const description = theme.getColor(descriptionForeground)!;
		assert.deepStrictEqual(surfaces.map((id, index) => theme.getColor(id)!.getContrastRatio(description) >= minimumContrasts[index]), surfaces.map(() => true));
	});

	test('tints the editor-backed detail pane despite low-contrast syntax colors', () => {
		const theme = createTheme(ColorScheme.DARK, '#121314', '#BBBEBF');
		theme.setCustomTokenColors({
			textMateRules: [
				{ scope: 'header', settings: { foreground: '#000080' } },
				{ scope: 'constant.regexp', settings: { foreground: '#646695' } },
				{ scope: 'punctuation.definition.tag', settings: { foreground: '#808080' } },
			],
		});
		const background = theme.getColor(editorBackground)!;
		theme.setCustomColors({ [editorGutter]: background.toString(), [editorStickyScrollBackground]: background.toString() });
		const tokens = theme.tokenColorMap.filter(Boolean).map(color => Color.fromHex(color));
		const colors = generateChatBackgroundTheme(theme, Color.fromHex('#328ba8'));
		const tinted = colors[editorBackground];
		assert.deepStrictEqual({
			tinted: !tinted.equals(background),
			syntaxContrastPreserved: tokens.every(color => tinted.getContrastRatio(color) >= Math.min(4.5, background.getContrastRatio(color))),
			adjacentEditorSurfaces: [editorGutter, editorStickyScrollBackground, editorStickyScrollGutterBackground].every(id => colors[id].equals(tinted)),
			syntaxColorsUnchanged: theme.tokenColorMap.filter(Boolean).map(color => Color.fromHex(color).toString()),
		}, {
			tinted: true,
			syntaxContrastPreserved: true,
			adjacentEditorSurfaces: true,
			syntaxColorsUnchanged: tokens.map(color => color.toString()),
		});
	});

	test('tints the light details pane without reducing contrast for faint syntax tokens', () => {
		const theme = createTheme(ColorScheme.LIGHT, '#ffffff', '#333333');
		theme.setCustomTokenColors({ textMateRules: [{ scope: 'markup.ignored', settings: { foreground: '#eaeef2' } }] });
		const colors = generateChatBackgroundTheme(theme, Color.fromHex('#328ba8'));
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.dock-detail-panel'));
		disposables.add(toDisposable(() => root.remove()));
		root.style.setProperty('--vscode-editor-background', theme.getColor(editorBackground)!.toString());
		root.style.setProperty('--vscode-agentsDetail-background', colors[agentsDetailBackground].toString());
		const detail = append(root, $('.part.auxiliarybar'));
		const body = append(append(detail, $('.content')), $('.pane-body'));
		const list = append(body, $('.monaco-list'));
		const rows = append(list, $('.monaco-list-rows'));
		const expected = Color.Format.CSS.formatRGB(colors[agentsDetailBackground]);

		assert.deepStrictEqual({
			syntaxContrastPreserved: colors[editorBackground].getContrastRatio(Color.fromHex('#eaeef2')) >= theme.getColor(editorBackground)!.getContrastRatio(Color.fromHex('#eaeef2')),
			detailTinted: !colors[agentsDetailBackground].equals(theme.getColor(agentsDetailBackground)!),
			paintedSurfaces: [detail, body, list, rows].map(element => getWindow(element).getComputedStyle(element).backgroundColor),
		}, {
			syntaxContrastPreserved: true,
			detailTinted: true,
			paintedSurfaces: [expected, expected, expected, expected],
		});
	});

	test('details use the unmodified editor background when no generated theme is applied', () => {
		assert.deepStrictEqual([ColorScheme.DARK, ColorScheme.LIGHT, ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT].map(type => {
			const theme = createTheme(type);
			return theme.getColor(agentsDetailBackground)?.equals(theme.getColor(editorBackground)!);
		}), [true, true, true, true]);
	});

	for (const { name, shell, input, description, placeholder } of [
		{ name: 'Visual Studio Light', shell: '#f3f3f3', input: '#ffffff', description: '#717171', placeholder: '#767676' },
		{ name: 'Light Modern', shell: '#f8f8f8', input: '#ffffff', description: '#616161', placeholder: '#767676' },
		{ name: 'Light 2026', shell: '#fafafd', input: '#f7f7fa', description: '#606060', placeholder: '#999999' },
	]) {
		test(`gives ${name} a visible purple wash without washing out muted text`, () => {
			const theme = createTheme(ColorScheme.LIGHT, '#ffffff', '#333333');
			theme.setCustomColors({
				[agentsBackground]: shell,
				[agentsChatInputBackground]: input,
				[inputBackground]: input,
				[descriptionForeground]: description,
				[agentsChatInputPlaceholderForeground]: placeholder,
				[inputPlaceholderForeground]: placeholder,
			});
			const colors = generateChatBackgroundTheme(theme, new Color(new RGBA(148, 117, 168)));
			const surfaces = [agentsBackground, agentsPanelBackground, agentsDetailBackground, EDITOR_GROUP_EMPTY_BACKGROUND, agentsChatInputBackground, inputBackground];
			const textPairs = [
				[agentsBackground, descriptionForeground],
				[agentsDetailBackground, descriptionForeground],
				[agentsChatInputBackground, agentsChatInputPlaceholderForeground],
				[inputBackground, inputPlaceholderForeground],
			];
			assert.deepStrictEqual({
				visiblePurple: surfaces.map(id => {
					const { r, g, b } = colors[id].rgba;
					return b > r && r > g && b - g >= 16;
				}),
				mutedTextContrast: textPairs.map(([background, foreground]) => colors[background].getContrastRatio(colors[foreground] ?? theme.getColor(foreground)!) >= 4.5),
			}, {
				visiblePurple: surfaces.map(() => true),
				mutedTextContrast: textPairs.map(() => true),
			});
		});
	}

	for (const { type, background, foreground, terminal } of [
		{ type: ColorScheme.DARK, background: '#191a1b', foreground: '#bfbfbf', terminal: '#191a1b' },
		{ type: ColorScheme.LIGHT, background: '#fafafd', foreground: '#202020', terminal: '#fafafa' },
	]) {
		test(`tints modern tabs and explicit terminal surfaces in ${type} without changing alpha or ANSI colors`, () => {
			const theme = createTheme(type, background, foreground);
			theme.setCustomColors({
				[TERMINAL_BACKGROUND_COLOR]: terminal,
				[TERMINAL_FOREGROUND_COLOR]: foreground,
				[MODERN_TAB_ACTIVE_BACKGROUND]: type === ColorScheme.DARK ? '#2c2d2e' : '#dadada99',
				[MODERN_TAB_HOVER_BACKGROUND]: type === ColorScheme.DARK ? '#ffffff14' : '#00000014',
			});
			const ansiColors = ansiColorIdentifiers.map(color => theme.getColor(color)?.toString());
			const surfaces = [MODERN_TAB_ACTIVE_BACKGROUND, MODERN_TAB_HOVER_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, TERMINAL_BACKGROUND_COLOR];
			const base = surfaces.map(color => theme.getColor(color)!);
			const colors = generateChatBackgroundTheme(theme, Color.fromHex('#328ba8'));
			theme.setTransientColors(colors);
			const editorSurface = theme.getColor(editorBackground)!;

			assert.deepStrictEqual({
				tinted: surfaces.map((color, index) => !theme.getColor(color)!.equals(base[index])),
				alphaUnchanged: surfaces.map((color, index) => theme.getColor(color)!.rgba.a === base[index].rgba.a),
				inactiveTransparent: theme.getColor(MODERN_EDITOR_TAB_INACTIVE_BACKGROUND)?.isTransparent(),
				activeActionMatchesTab: theme.getColor(MODERN_EDITOR_TAB_ACTIVE_ACTION_BACKGROUND)?.toString() === theme.getColor(MODERN_EDITOR_TAB_ACTIVE_BACKGROUND)!.makeOpaque(editorSurface).toString(),
				hoverActionMatchesTab: theme.getColor(MODERN_EDITOR_TAB_HOVER_ACTION_BACKGROUND)?.toString() === theme.getColor(MODERN_EDITOR_TAB_HOVER_BACKGROUND)!.makeOpaque(editorSurface).toString(),
				terminalTextContrast: theme.getColor(TERMINAL_BACKGROUND_COLOR)!.getContrastRatio(theme.getColor(TERMINAL_FOREGROUND_COLOR)!) >= 4.5,
				ansiColors: ansiColorIdentifiers.map(color => theme.getColor(color)?.toString()),
			}, {
				tinted: surfaces.map(() => true),
				alphaUnchanged: surfaces.map(() => true),
				inactiveTransparent: true,
				activeActionMatchesTab: true,
				hoverActionMatchesTab: true,
				terminalTextContrast: true,
				ansiColors,
			});
		});
	}

	test('keeps terminal location fallback when the base theme does not set a terminal background', () => {
		const colors = generateChatBackgroundTheme(createTheme(), Color.fromHex('#328ba8'));
		assert.strictEqual(colors[TERMINAL_BACKGROUND_COLOR], undefined);
	});

	for (const { type, background, foreground, hover } of [
		{ type: ColorScheme.DARK, background: '#202122', foreground: '#bfbfbf', hover: '#ffffff14' },
		{ type: ColorScheme.LIGHT, background: '#fafafd', foreground: '#202020', hover: '#00000014' },
	]) {
		test(`tints context-menu focus borders with visible contrast in ${type} themes`, () => {
			const imageColor = Color.fromHex('#b83da8');
			const results = ['#3994bc', '#3994bcb3'].map(border => {
				const theme = createTheme(type, background, foreground);
				theme.setCustomColors({ [menuSelectionBorder]: border, [listHoverBackground]: hover });
				const originalBorder = theme.getColor(menuSelectionBorder)!;
				theme.setTransientColors(generateChatBackgroundTheme(theme, imageColor));
				const tintedBorder = theme.getColor(menuSelectionBorder)!;
				const menuSurface = theme.getColor(menuBackground)!;
				const selectedSurface = theme.getColor(listHoverBackground)!.makeOpaque(menuSurface);
				return {
					hueMatchesImage: Math.abs(tintedBorder.hsla.h - imageColor.hsla.h) <= 1,
					alphaPreserved: tintedBorder.rgba.a === originalBorder.rgba.a,
					menuContrast: tintedBorder.makeOpaque(menuSurface).getContrastRatio(menuSurface) >= 3,
					selectionContrast: tintedBorder.makeOpaque(selectedSurface).getContrastRatio(selectedSurface) >= 3,
				};
			});
			assert.deepStrictEqual(results, [
				{ hueMatchesImage: true, alphaPreserved: true, menuContrast: true, selectionContrast: true },
				{ hueMatchesImage: true, alphaPreserved: true, menuContrast: true, selectionContrast: true },
			]);
		});
	}

	test('paints the tinted focus border in a real menu and restores it when tinting is removed', () => {
		const theme = createTheme();
		theme.setCustomColors({ [menuSelectionBorder]: '#3994bc', [listHoverBackground]: '#ffffff14' });
		const host = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => host.remove()));
		const updateMenuColors = () => {
			for (const id of [menuBackground, menuSelectionBorder, listHoverBackground]) {
				host.style.setProperty(asCssVariableName(id), theme.getColor(id)!.toString());
			}
		};
		updateMenuColors();
		const menu = disposables.add(new Menu(host, [disposables.add(new Action('pin', 'Pin'))], {}, defaultMenuStyles));
		menu.focus(true);
		const item = host.querySelector<HTMLElement>('.action-menu-item')!;
		const originalOutline = getWindow(item).getComputedStyle(item).outlineColor;

		theme.setTransientColors(generateChatBackgroundTheme(theme, Color.fromHex('#b83da8')));
		updateMenuColors();
		const tintedStyle = getWindow(item).getComputedStyle(item);
		const tinted = {
			colorMatchesToken: tintedStyle.outlineColor === Color.Format.CSS.formatRGB(theme.getColor(menuSelectionBorder)!),
			changed: tintedStyle.outlineColor !== originalOutline,
			style: tintedStyle.outlineStyle,
			width: tintedStyle.outlineWidth,
		};
		theme.setTransientColors(undefined);
		updateMenuColors();

		assert.deepStrictEqual({
			tinted,
			restored: getWindow(item).getComputedStyle(item).outlineColor === originalOutline,
		}, {
			tinted: { colorMatchesToken: true, changed: true, style: 'solid', width: '1px' },
			restored: true,
		});
	});

	test('does not introduce menu focus borders or change high-contrast borders', () => {
		const imageColor = Color.fromHex('#b83da8');
		const highContrastBorders = [ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT].map(type => {
			const theme = createTheme(type);
			theme.setCustomColors({ [menuSelectionBorder]: '#00ff00' });
			theme.setTransientColors(generateChatBackgroundTheme(theme, imageColor));
			return theme.getColor(menuSelectionBorder)!.toString();
		});
		assert.deepStrictEqual({
			noBorder: generateChatBackgroundTheme(createTheme(), imageColor)[menuSelectionBorder],
			highContrastBorders,
		}, { noBorder: undefined, highContrastBorders: ['#00ff00', '#00ff00'] });
	});

	test('generates readable accents and preserves semantic and syntax colors', () => {
		const results: boolean[] = [];
		for (const theme of [createTheme(), createTheme(ColorScheme.LIGHT, '#ffffff', '#333333')]) {
			const tokens = theme.tokenColors;
			const error = theme.getColor(errorForeground)?.toString();
			for (const image of ['#dd783a', '#328ba8', '#a0539e', '#00ff00', '#ff0000', '#0000ff']) {
				const colors = generateChatBackgroundTheme(theme, Color.fromHex(image));
				for (const [background, foreground] of [
					[buttonBackground, buttonForeground],
					[buttonHoverBackground, buttonForeground],
					[listActiveSelectionBackground, listActiveSelectionForeground],
					[menuSelectionBackground, menuSelectionForeground],
					[quickInputListFocusBackground, quickInputListFocusForeground],
				]) {
					const text = theme.getColor(foreground)!;
					results.push(colors[background].getContrastRatio(text.makeOpaque(colors[background])) >= 4.5);
				}
				results.push(backgroundColors.every(id => colors[focusBorder].getContrastRatio(colors[id]) >= 3));
				results.push(colors[textLinkForeground].getContrastRatio(colors[activeSessionViewBackground]) >= 4.5);
				results.push(colors[listHighlightForeground].getContrastRatio(colors[quickInputBackground]) >= 4.5);
				results.push(colors[quickInputListFocusHighlightForeground].getContrastRatio(colors[quickInputListFocusBackground]) >= 4.5);
				results.push(!colors[buttonBackground].equals(theme.getColor(buttonBackground)!));
				results.push(colors[errorForeground] === undefined && theme.getColor(errorForeground)?.toString() === error && theme.tokenColors === tokens);
			}
		}
		assert.deepStrictEqual(results, Array(132).fill(true));
	});

	test('does not generate a palette for neutral images or high contrast themes', () => {
		assert.deepStrictEqual([
			generateChatBackgroundTheme(createTheme(), Color.fromHex('#808080')),
			generateChatBackgroundTheme(createTheme(ColorScheme.HIGH_CONTRAST_DARK), Color.fromHex('#c06030')),
			generateChatBackgroundTheme(createTheme(ColorScheme.HIGH_CONTRAST_LIGHT), Color.fromHex('#c06030')),
		], [{}, {}, {}]);
	});

	test('does not sample configured images until tinting is enabled', async () => {
		const { requests, themeService, configure } = createFixture('/first.png', false);
		const disabled = {
			loads: requests.length,
			background: themeService.getColorTheme().getColor(agentsBackground)?.toString(),
		};
		await configure(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING, true);
		await requests[0].result.complete(Color.fromHex('#c06030'));
		assert.deepStrictEqual({
			disabled,
			enabled: {
				loads: requests.length,
				tinted: themeService.getColorTheme().getColor(agentsBackground)?.toString() !== disabled.background,
			},
		}, {
			disabled: { loads: 0, background: '#202020' },
			enabled: { loads: 1, tinted: true },
		});
	});

	for (const background of ['', AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET]) {
		test(`does not sample or tint the ${background || 'empty'} background`, () => {
			const { root, requests, themeService } = createFixture(background);
			assert.deepStrictEqual({
				loads: requests.length,
				background: themeService.getColorTheme().getColor(agentsBackground)?.toString(),
				styles: root.style.cssText,
			}, { loads: 0, background: '#202020', styles: '' });
		});
	}

	test('updates mounted card and session surfaces without changing foreground tokens', async () => {
		const { root, requests, themeService } = createFixture();
		const card = append(root, $('.agents-part-card'));
		const session = append(card, $('.session-view'));
		const updateStyles = () => {
			applyAgentsPartCardStyles(card, themeService.getColorTheme());
			applySessionViewThemeColors(session, themeService.getColorTheme(), true);
		};
		disposables.add(themeService.onDidColorThemeChange(updateStyles));
		updateStyles();
		session.style.backgroundColor = 'var(--session-view-background)';
		const before = getWindow(card).getComputedStyle(card).backgroundColor;
		const beforeForegrounds = foregroundColors.map(color => themeService.getColorTheme().getColor(color)?.toString());
		await requests[0].result.complete(Color.fromHex('#c06030'));
		const after = getWindow(card).getComputedStyle(card).backgroundColor;

		assert.deepStrictEqual({
			changed: after !== before,
			cardMatchesSession: after === getWindow(session).getComputedStyle(session).backgroundColor,
			programmaticColor: card.style.getPropertyValue('--part-background') === themeService.getColorTheme().getColor(agentsPanelBackground)?.toString(),
			unchangedForegrounds: foregroundColors.every((color, index) => themeService.getColorTheme().getColor(color)?.toString() === beforeForegrounds[index]),
			rootStyles: root.style.cssText,
		}, {
			changed: true,
			cardMatchesSession: true,
			programmaticColor: true,
			unchangedForegrounds: true,
			rootStyles: '',
		});
	});

	test('reuses the sampled color for layout and theme changes', async () => {
		const { requests, themeService, configure } = createFixture();
		await requests[0].result.complete(Color.fromHex('#c06030'));
		const dark = themeService.getColorTheme().getColor(agentsBackground)!;
		await configure(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, 'center');
		themeService.setTheme(createTheme(ColorScheme.LIGHT, '#ffffff', '#333333'));
		const light = themeService.getColorTheme().getColor(agentsBackground)!;
		assert.deepStrictEqual({
			loads: requests.length,
			different: !dark.equals(light),
			lightContrast: light.getContrastRatio(Color.fromHex('#333333')) >= 4.5,
		}, { loads: 1, different: true, lightContrast: true });
	});

	test('recomputes from the base theme without accumulating tint and restores customizations', async () => {
		const { requests, themeService, configure } = createFixture();
		const theme = themeService.getColorTheme();
		await requests[0].result.complete(Color.fromHex('#c06030'));
		const background = theme.getColor(agentsBackground)?.toString();
		for (let index = 0; index < 3; index++) {
			themeService.setTheme(theme);
		}
		const repeatedBackground = theme.getColor(agentsBackground)?.toString();
		theme.setCustomColors({ [agentsBackground]: '#181818' });
		themeService.setTheme(theme);
		const customizedBackground = theme.getColor(agentsBackground)?.toString();
		await configure(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING, false);
		assert.deepStrictEqual({
			loads: requests.length,
			stable: repeatedBackground === background,
			recomputed: customizedBackground !== background,
			restored: theme.getColor(agentsBackground)?.toString(),
		}, { loads: 1, stable: true, recomputed: true, restored: '#181818' });
	});

	test('ignores a previous image that finishes loading after its replacement', async () => {
		const { requests, themeService, configure } = createFixture();
		await configure(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, '/second.png');
		await requests[1].result.complete(Color.fromHex('#3060c0'));
		const second = themeService.getColorTheme().getColor(agentsBackground);
		await requests[0].result.complete(Color.fromHex('#c06030'));
		assert.deepStrictEqual({
			images: requests.map(request => request.uri.path),
			unchanged: themeService.getColorTheme().getColor(agentsBackground) === second,
			disposed: requests.every(request => request.store.isDisposed),
		}, { images: ['/first.png', '/second.png'], unchanged: true, disposed: true });
	});

	for (const type of [ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT]) {
		test(`restores original colors in ${type} and ignores an outstanding image`, async () => {
			const { requests, themeService, configure } = createFixture();
			await requests[0].result.complete(Color.fromHex('#c06030'));
			await configure(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, '/second.png');
			const highContrastTheme = createTheme(type);
			const background = highContrastTheme.getColor(agentsBackground);
			themeService.setTheme(highContrastTheme);
			await requests[1].result.complete(Color.fromHex('#3060c0'));
			assert.deepStrictEqual({
				background: themeService.getColorTheme().getColor(agentsBackground),
				disposed: requests.every(request => request.store.isDisposed),
			}, { background, disposed: true });
		});
	}

	for (const [key, value] of [
		[AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING, false],
		[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, ''],
		[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET],
	] as const) {
		test(`clears tint when ${key} becomes ${value === '' ? 'empty' : value}`, async () => {
			const { root, requests, themeService, configure } = createFixture();
			await requests[0].result.complete(Color.fromHex('#c06030'));
			await configure(key, value);
			assert.deepStrictEqual({
				background: themeService.getColorTheme().getColor(agentsBackground)?.toString(),
				styles: root.style.cssText,
			}, { background: '#202020', styles: '' });
		});
	}

	test('logs image sampling failures without leaving a stale tint', async () => {
		const { root, requests, warnings, themeService, configure } = createFixture();
		await requests[0].result.complete(Color.fromHex('#c06030'));
		await configure(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, '/missing.png');
		await requests[1].result.error(new Error('Image decode failed'));
		assert.deepStrictEqual({
			background: themeService.getColorTheme().getColor(agentsBackground)?.toString(),
			styles: root.style.cssText,
			warnings,
		}, { background: '#202020', styles: '', warnings: ['[SessionsChatBackgroundTint] Could not sample the chat background image.'] });
	});

	test('restores the base theme and ignores late loads after disposal', async () => {
		const { tint, requests, themeService, configure } = createFixture();
		await requests[0].result.complete(Color.fromHex('#c06030'));
		await configure(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, '/second.png');
		tint.dispose();
		await requests[1].result.complete(Color.fromHex('#3060c0'));
		assert.deepStrictEqual({
			background: themeService.getColorTheme().getColor(agentsBackground)?.toString(),
			disposed: requests.every(request => request.store.isDisposed),
		}, { background: '#202020', disposed: true });
	});
});
