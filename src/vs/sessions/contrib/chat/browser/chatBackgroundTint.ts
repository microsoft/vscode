/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Color, HSLA, RGBA } from '../../../../base/common/color.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { editorGutter } from '../../../../editor/common/core/editorColorRegistry.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { descriptionForeground, focusBorder, foreground, textLinkActiveForeground, textLinkForeground } from '../../../../platform/theme/common/colors/baseColors.js';
import { editorBackground, editorForeground, editorHoverBackground, editorHoverForeground, editorSelectionBackground, editorSelectionForeground, editorStickyScrollBackground, editorStickyScrollGutterBackground, editorWidgetBackground, editorWidgetForeground } from '../../../../platform/theme/common/colors/editorColors.js';
import { buttonBackground, buttonForeground, buttonHoverBackground, buttonSecondaryBackground, buttonSecondaryForeground, buttonSecondaryHoverBackground, checkboxBackground, checkboxForeground, inputBackground, inputForeground, inputPlaceholderForeground, selectBackground, selectForeground, selectListBackground } from '../../../../platform/theme/common/colors/inputColors.js';
import { listActiveSelectionBackground, listActiveSelectionForeground, listActiveSelectionIconForeground, listFocusBackground, listFocusForeground, listFocusHighlightForeground, listFocusOutline, listHighlightForeground, listHoverBackground, listHoverForeground, listInactiveSelectionBackground, listInactiveSelectionForeground } from '../../../../platform/theme/common/colors/listColors.js';
import { menuBackground, menuForeground, menuSelectionBackground, menuSelectionBorder, menuSelectionForeground } from '../../../../platform/theme/common/colors/menuColors.js';
import { quickInputBackground, quickInputForeground, quickInputListFocusBackground, quickInputListFocusForeground, quickInputListFocusHighlightForeground, quickInputListFocusIconForeground } from '../../../../platform/theme/common/colors/quickpickColors.js';
import { ColorScheme, isHighContrast } from '../../../../platform/theme/common/theme.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { EDITOR_GROUP_EMPTY_BACKGROUND, EDITOR_GROUP_HEADER_TABS_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_FOREGROUND, MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_FOREGROUND, MODERN_EDITOR_TAB_INACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_FOREGROUND, MODERN_TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_FOREGROUND, NOTIFICATIONS_BACKGROUND, NOTIFICATIONS_FOREGROUND, PANEL_BACKGROUND, SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND, TAB_ACTIVE_BACKGROUND, TAB_ACTIVE_FOREGROUND, TAB_INACTIVE_BACKGROUND, TAB_INACTIVE_FOREGROUND, TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_INACTIVE_FOREGROUND } from '../../../../workbench/common/theme.js';
import { TERMINAL_BACKGROUND_COLOR, TERMINAL_FOREGROUND_COLOR } from '../../../../workbench/contrib/terminal/common/terminalColorRegistry.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IColorMap, IWorkbenchThemeService } from '../../../../workbench/services/themes/common/workbenchThemeService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsChatBackgroundAvailableContext, SessionsChatBackgroundImageConfiguredContext } from '../../../common/contextkeys.js';
import { activeSessionViewBackground, activeSessionViewForeground, agentsBackground, agentsChatInputBackground, agentsChatInputFocusBorder, agentsChatInputForeground, agentsChatInputPlaceholderForeground, agentsDetailBackground, agentsGradientTintColor, agentsPanelBackground, agentsPanelForeground, inactiveSessionViewBackground, inactiveSessionViewForeground } from '../../../common/theme.js';
import { ISessionsChatBackgroundService } from '../../../services/chatBackground/browser/chatBackgroundService.js';

export const AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING = 'chat.agentSessions.backgroundImageTint';

export class ToggleChatBackgroundTintAction extends Action2 {
	static readonly ID = 'workbench.action.chat.toggleAgentSessionsBackgroundTint';

	constructor() {
		const when = ContextKeyExpr.and(ChatContextKeys.enabled, IsSessionsWindowContext, SessionsChatBackgroundAvailableContext, SessionsChatBackgroundImageConfiguredContext);
		super({
			id: ToggleChatBackgroundTintAction.ID,
			title: localize2('chat.agentSessions.toggleBackgroundTint', "Tint Window to Match Background"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: when,
			toggled: ContextKeyExpr.equals(`config.${AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING}`, true),
			menu: [{
				id: Menus.SessionChatBackgroundContext,
				group: 'navigation',
				order: 3,
				when,
			}, {
				id: MenuId.ChatContext,
				group: 'zz_background',
				order: 3,
				when: ContextKeyExpr.and(when, ChatContextKeys.contextMenuIsBackground),
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const enabled = !configurationService.getValue<boolean>(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING);
		await configurationService.updateValue(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING, enabled, ConfigurationTarget.USER);
		status(enabled
			? localize('chat.agentSessions.backgroundTintEnabled', "Window tinting enabled.")
			: localize('chat.agentSessions.backgroundTintDisabled', "Window tinting disabled."));
	}
}

const tintedBackgrounds = [
	{ color: agentsBackground, foregrounds: [foreground, SIDE_BAR_FOREGROUND, agentsPanelForeground, descriptionForeground], strength: 0.12 },
	{ color: agentsPanelBackground, foregrounds: [agentsPanelForeground, descriptionForeground], strength: 0.08 },
	{ color: agentsDetailBackground, foregrounds: [agentsPanelForeground, descriptionForeground], strength: 0.08 },
	{ color: activeSessionViewBackground, foregrounds: [activeSessionViewForeground, descriptionForeground], strength: 0.08 },
	{ color: inactiveSessionViewBackground, foregrounds: [inactiveSessionViewForeground, descriptionForeground], strength: 0.08 },
	{ color: agentsChatInputBackground, foregrounds: [agentsChatInputForeground, agentsChatInputPlaceholderForeground], strength: 0.1 },
	{ color: SIDE_BAR_BACKGROUND, foregrounds: [SIDE_BAR_FOREGROUND, descriptionForeground], strength: 0.12 },
	{ color: TITLE_BAR_ACTIVE_BACKGROUND, foregrounds: [TITLE_BAR_ACTIVE_FOREGROUND], strength: 0.12 },
	{ color: TITLE_BAR_INACTIVE_BACKGROUND, foregrounds: [TITLE_BAR_INACTIVE_FOREGROUND], strength: 0.12 },
	{ color: PANEL_BACKGROUND, foregrounds: [foreground, descriptionForeground], strength: 0.08 },
	{ color: editorBackground, foregrounds: [editorForeground], strength: 0.06 },
	{ color: EDITOR_GROUP_EMPTY_BACKGROUND, foregrounds: [foreground, descriptionForeground], strength: 0.08, fallback: editorBackground },
	{ color: TERMINAL_BACKGROUND_COLOR, foregrounds: [TERMINAL_FOREGROUND_COLOR], strength: 0.08 },
	{ color: editorWidgetBackground, foregrounds: [editorWidgetForeground, descriptionForeground], strength: 0.08 },
	{ color: editorHoverBackground, foregrounds: [editorHoverForeground, descriptionForeground], strength: 0.08 },
	{ color: inputBackground, foregrounds: [inputForeground, inputPlaceholderForeground], strength: 0.1 },
	{ color: selectBackground, foregrounds: [selectForeground], strength: 0.1 },
	{ color: selectListBackground, foregrounds: [selectForeground], strength: 0.08 },
	{ color: checkboxBackground, foregrounds: [checkboxForeground], strength: 0.1 },
	{ color: buttonSecondaryBackground, foregrounds: [buttonSecondaryForeground], strength: 0.1 },
	{ color: buttonSecondaryHoverBackground, foregrounds: [buttonSecondaryForeground], strength: 0.1 },
	{ color: menuBackground, foregrounds: [menuForeground], strength: 0.08 },
	{ color: quickInputBackground, foregrounds: [quickInputForeground, descriptionForeground], strength: 0.08 },
	{ color: NOTIFICATIONS_BACKGROUND, foregrounds: [NOTIFICATIONS_FOREGROUND, descriptionForeground], strength: 0.08 },
	{ color: TAB_ACTIVE_BACKGROUND, foregrounds: [TAB_ACTIVE_FOREGROUND], strength: 0.08 },
	{ color: TAB_INACTIVE_BACKGROUND, foregrounds: [TAB_INACTIVE_FOREGROUND], strength: 0.08 },
	{ color: EDITOR_GROUP_HEADER_TABS_BACKGROUND, foregrounds: [TAB_INACTIVE_FOREGROUND], strength: 0.08 },
	{ color: MODERN_TAB_ACTIVE_BACKGROUND, foregrounds: [MODERN_TAB_ACTIVE_FOREGROUND], strength: 0.1, backdrop: agentsPanelBackground },
	{ color: MODERN_TAB_HOVER_BACKGROUND, foregrounds: [MODERN_TAB_HOVER_FOREGROUND], strength: 0.1, backdrop: agentsPanelBackground },
	{ color: MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, foregrounds: [MODERN_EDITOR_TAB_ACTIVE_FOREGROUND], strength: 0.1, backdrop: editorBackground },
	{ color: MODERN_EDITOR_TAB_INACTIVE_BACKGROUND, foregrounds: [TAB_INACTIVE_FOREGROUND], strength: 0.08, backdrop: editorBackground },
	{ color: MODERN_EDITOR_TAB_HOVER_BACKGROUND, foregrounds: [MODERN_EDITOR_TAB_HOVER_FOREGROUND], strength: 0.1, backdrop: editorBackground },
	{ color: MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, foregrounds: [MODERN_EDITOR_TAB_ACTIVE_FOREGROUND], strength: 0.1, backdrop: editorBackground },
	{ color: listInactiveSelectionBackground, foregrounds: [listInactiveSelectionForeground, foreground], strength: 0.1, backdrop: agentsPanelBackground },
	{ color: listFocusBackground, foregrounds: [listFocusForeground, foreground], strength: 0.1, backdrop: agentsPanelBackground },
	{ color: listHoverBackground, foregrounds: [listHoverForeground, foreground], strength: 0.1, backdrop: agentsPanelBackground },
];

const accentBackgrounds = [
	{ color: buttonBackground, foregrounds: [buttonForeground] },
	{ color: buttonHoverBackground, foregrounds: [buttonForeground] },
	{ color: listActiveSelectionBackground, foregrounds: [listActiveSelectionForeground, listActiveSelectionIconForeground] },
	{ color: menuSelectionBackground, foregrounds: [menuSelectionForeground] },
	{ color: quickInputListFocusBackground, foregrounds: [quickInputListFocusForeground, quickInputListFocusIconForeground] },
];

export function getChatBackgroundImageColor(pixels: Uint8ClampedArray): Color | undefined {
	let red = 0;
	let green = 0;
	let blue = 0;
	let weight = 0;
	for (let index = 0; index < pixels.length; index += 4) {
		const alpha = pixels[index + 3] / 255;
		red += pixels[index] * alpha;
		green += pixels[index + 1] * alpha;
		blue += pixels[index + 2] * alpha;
		weight += alpha;
	}
	return weight > 0 ? new Color(new RGBA(
		Math.round(red / weight),
		Math.round(green / weight),
		Math.round(blue / weight),
		weight / (pixels.length / 4)
	)) : undefined;
}

export function getChatBackgroundTintedColor(background: Color, imageColor: Color, foregrounds: readonly Color[], strength: number, backdrop?: Color, minimumContrasts?: readonly number[]): Color {
	if (background.isTransparent() || (!background.isOpaque() && !backdrop?.isOpaque()) || imageColor.hsla.s < 0.05) {
		return background;
	}

	const surface = backdrop ? background.makeOpaque(backdrop) : background;
	const tint = new Color(new HSLA(imageColor.hsla.h, Math.min(imageColor.hsla.s, 0.6), 0.5, background.rgba.a));
	const contrastTargets = minimumContrasts ?? foregrounds.map(color => Math.min(4.5, surface.getContrastRatio(color.makeOpaque(surface))));
	const hasContrast = (candidate: Color) => {
		const candidateSurface = backdrop ? candidate.makeOpaque(backdrop) : candidate;
		return foregrounds.every((color, index) => candidateSurface.getContrastRatio(color.makeOpaque(candidateSurface)) >= contrastTargets[index]);
	};
	const tinted = background.mix(tint, strength * imageColor.rgba.a);
	if (hasContrast(tinted)) {
		return tinted;
	}

	// Preserve the hue by adjusting brightness when muted text rules out a simple color mix.
	for (let step = 1; step <= 100; step++) {
		for (const lightness of [tinted.hsla.l - step / 1000, tinted.hsla.l + step / 1000]) {
			if (lightness >= 0 && lightness <= 1) {
				const candidate = new Color(new HSLA(tinted.hsla.h, tinted.hsla.s, lightness, background.rgba.a));
				if (hasContrast(candidate)) {
					return candidate;
				}
			}
		}
	}
	return background;
}

function getImageAccentColor(original: Color, imageColor: Color, hasContrast: (color: Color) => boolean): Color {
	const saturation = Math.min(imageColor.hsla.s, 0.65);
	for (let step = 0; step <= 100; step++) {
		for (const lightness of [original.hsla.l + step / 100, original.hsla.l - step / 100]) {
			if (lightness >= 0 && lightness <= 1) {
				const candidate = new Color(new HSLA(imageColor.hsla.h, saturation, lightness, original.rgba.a));
				if (hasContrast(candidate)) {
					return candidate;
				}
			}
		}
	}
	return original;
}

export function generateChatBackgroundTheme(theme: IColorTheme, imageColor: Color): IColorMap {
	const colors: IColorMap = {};
	if (isHighContrast(theme.type) || imageColor.hsla.s < 0.05 || imageColor.rgba.a < 0.05) {
		return colors;
	}

	const tokenColors = theme.tokenColorMap.filter(Boolean).map(color => Color.fromHex(color));
	const lightTheme = theme.type === ColorScheme.LIGHT;
	const surfaceImageColor = lightTheme
		? new Color(new HSLA(imageColor.hsla.h, Math.max(0.45, imageColor.hsla.s), 0.5, imageColor.rgba.a))
		: imageColor;
	const surfaces = tintedBackgrounds.flatMap(({ color, foregrounds, strength, backdrop, fallback }) => {
		const background = theme.getColor(color) ?? (fallback ? theme.getColor(fallback) : undefined);
		if (!background) {
			return [];
		}
		const originalBackdrop = backdrop ? theme.getColor(backdrop) : undefined;
		const originalSurface = originalBackdrop ? background.makeOpaque(originalBackdrop) : background;
		const textColors: { id?: string; color: Color }[] = foregrounds.flatMap(id => {
			const text = theme.getColor(id);
			return text ? [{ id, color: text }] : [];
		});
		if (color === editorBackground) {
			textColors.push(...tokenColors.map(color => ({ color })));
		}
		return [{
			color, background, backdrop, originalBackdrop, originalSurface,
			strength: strength * (lightTheme ? 2 : 1),
			textColors: textColors.map(text => ({
				...text,
				minimumContrast: Math.min(4.5, originalSurface.getContrastRatio(text.color.makeOpaque(originalSurface))),
			})),
		}];
	});

	const getColor = (id: string) => colors[id] ?? theme.getColor(id);
	const getSurfaceColor = (surface: typeof surfaces[number]) => {
		const background = colors[surface.color] ?? surface.background;
		const backdrop = surface.backdrop ? getColor(surface.backdrop) : undefined;
		return backdrop ? background.makeOpaque(backdrop) : background;
	};
	const getTextColor = (text: typeof surfaces[number]['textColors'][number]) => text.id ? getColor(text.id)! : text.color;
	for (const surface of surfaces) {
		colors[surface.color] = getChatBackgroundTintedColor(surface.background, surfaceImageColor, [], surface.strength, surface.originalBackdrop);
	}

	if (lightTheme) {
		for (const id of [descriptionForeground, inputPlaceholderForeground, agentsChatInputPlaceholderForeground]) {
			const original = theme.getColor(id);
			const appearances = surfaces.flatMap(surface => {
				const text = surface.textColors.find(text => text.id === id);
				return text ? [{ surface, minimumContrast: text.minimumContrast }] : [];
			});
			if (!original || !appearances.length || appearances.some(({ surface }) => !surface.originalSurface.isOpaque() || !getSurfaceColor(surface).isOpaque())) {
				continue;
			}
			let adjusted = original;
			for (const { surface } of appearances) {
				const background = getSurfaceColor(surface);
				const opaqueText = adjusted.makeOpaque(background);
				if (opaqueText.getRelativeLuminance() < background.getRelativeLuminance() && background.getContrastRatio(opaqueText) < 4.5) {
					adjusted = background.ensureConstrast(opaqueText, 4.5);
				}
			}
			if (appearances.every(({ surface, minimumContrast }) => [surface.originalSurface, getSurfaceColor(surface)].every(background =>
				background.getContrastRatio(adjusted.makeOpaque(background)) >= minimumContrast))) {
				colors[id] = adjusted;
			}
		}
	}

	const tintSurface = (surface: typeof surfaces[number]) => {
		colors[surface.color] = getChatBackgroundTintedColor(
			surface.background, surfaceImageColor, surface.textColors.map(getTextColor), surface.strength,
			surface.backdrop ? getColor(surface.backdrop) : undefined,
			surface.textColors.map(text => text.minimumContrast),
		);
	};
	for (const surface of surfaces) {
		tintSurface(surface);
	}
	for (const backdrop of new Set(surfaces.flatMap(surface => surface.backdrop ? [surface.backdrop] : []))) {
		const children = surfaces.filter(surface => surface.backdrop === backdrop);
		const readable = children.every(surface => {
			const background = getSurfaceColor(surface);
			return surface.textColors.every(text => background.getContrastRatio(getTextColor(text).makeOpaque(background)) >= text.minimumContrast);
		});
		if (!readable) {
			// Low-opacity fills may not be able to compensate for a changed backdrop.
			colors[backdrop] = theme.getColor(backdrop)!;
			for (const surface of children) {
				tintSurface(surface);
			}
		}
	}

	const originalEditorBackground = theme.getColor(editorBackground);
	if (originalEditorBackground && colors[editorBackground]) {
		for (const id of [editorGutter, editorStickyScrollBackground, editorStickyScrollGutterBackground]) {
			if (theme.getColor(id)?.equals(originalEditorBackground)) {
				colors[id] = colors[editorBackground];
			}
		}
	}
	for (const { color, foregrounds } of accentBackgrounds) {
		const background = theme.getColor(color);
		const textColors = foregrounds.map(id => theme.getColor(id)).filter(color => color !== undefined);
		if (background?.isOpaque() && textColors.length) {
			colors[color] = getImageAccentColor(background, imageColor, candidate =>
				textColors.every(text => candidate.getContrastRatio(text.makeOpaque(candidate)) >= 4.5));
		}
	}

	const selection = theme.getColor(editorSelectionBackground);
	const selectionForeground = theme.getColor(editorSelectionForeground);
	const selectionText = selectionForeground ? [selectionForeground] : [theme.getColor(editorForeground), ...tokenColors].filter(color => color !== undefined);
	if (selection?.isOpaque() && selectionText.length) {
		colors[editorSelectionBackground] = getImageAccentColor(selection, imageColor, candidate =>
			selectionText.every(text => candidate.getContrastRatio(text.makeOpaque(candidate)) >= Math.min(4.5, selection.getContrastRatio(text.makeOpaque(selection)))));
	}

	const focusSurfaces = [agentsBackground, agentsPanelBackground, agentsDetailBackground, activeSessionViewBackground, inactiveSessionViewBackground, agentsChatInputBackground, inputBackground, editorBackground, menuBackground, quickInputBackground]
		.map(getColor).filter((color): color is Color => !!color?.isOpaque());
	for (const id of [focusBorder, listFocusOutline, agentsChatInputFocusBorder]) {
		const original = theme.getColor(id);
		if (original && focusSurfaces.length) {
			colors[id] = getImageAccentColor(original, imageColor, candidate =>
				focusSurfaces.every(background => candidate.makeOpaque(background).getContrastRatio(background) >= 3));
		}
	}
	const menuFocusBorder = theme.getColor(menuSelectionBorder);
	const menuSurface = getColor(menuBackground);
	if (menuFocusBorder && menuSurface?.isOpaque()) {
		const menuFocusSurfaces = [menuSurface, (getColor(listHoverBackground) ?? menuSurface).makeOpaque(menuSurface)];
		colors[menuSelectionBorder] = getImageAccentColor(menuFocusBorder, imageColor, candidate =>
			menuFocusSurfaces.every(background => candidate.makeOpaque(background).getContrastRatio(background) >= 3));
	}
	for (const { foregrounds, backgrounds } of [
		{ foregrounds: [textLinkForeground, textLinkActiveForeground], backgrounds: [activeSessionViewBackground, inactiveSessionViewBackground, agentsPanelBackground, agentsDetailBackground, editorBackground, editorHoverBackground] },
		{ foregrounds: [listHighlightForeground], backgrounds: [agentsBackground, SIDE_BAR_BACKGROUND, agentsPanelBackground, agentsDetailBackground, menuBackground, quickInputBackground] },
		{ foregrounds: [listFocusHighlightForeground], backgrounds: [listActiveSelectionBackground] },
		{ foregrounds: [quickInputListFocusHighlightForeground], backgrounds: [quickInputListFocusBackground] },
	]) {
		const surfaces = backgrounds.map(getColor).filter((color): color is Color => !!color?.isOpaque());
		for (const id of foregrounds) {
			const original = theme.getColor(id);
			if (original && surfaces.length) {
				colors[id] = getImageAccentColor(original, imageColor, candidate =>
					surfaces.every(background => candidate.makeOpaque(background).getContrastRatio(background) >= 4.5));
			}
		}
	}
	colors[agentsGradientTintColor] = imageColor;
	return colors;
}

export class SessionsChatBackgroundTint extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.chatBackgroundTint';

	private readonly imageLoad = this._register(new MutableDisposable<DisposableStore>());
	private readonly themeOverlay = this._register(new MutableDisposable<IDisposable>());
	private image: URI | undefined;

	constructor(
		@ISessionsChatBackgroundService private readonly backgroundService: ISessionsChatBackgroundService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(this.backgroundService.onDidChangeBackground(() => this.update()));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING)) {
				this.update();
			}
		}));
		this.update();
	}

	private update(): void {
		if (this._store.isDisposed) {
			return;
		}
		const image = this.configurationService.getValue<boolean>(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING)
			&& this.backgroundService.getBackground()?.kind === 'image'
			? this.backgroundService.getConfiguredBackgroundImage()
			: undefined;
		if (!isEqual(image, this.image)) {
			this.image = image;
			this.imageLoad.clear();
			this.themeOverlay.clear();
			if (image) {
				void this.loadImageColor(image);
			}
		}
	}

	private async loadImageColor(uri: URI): Promise<void> {
		const store = new DisposableStore();
		this.imageLoad.value = store;
		try {
			const color = await this.readImageColor(uri, store);
			if (color && !store.isDisposed) {
				this.themeOverlay.value = this.themeService.registerColorThemeOverlay(theme => generateChatBackgroundTheme(theme, color));
			}
		} catch (error) {
			if (!store.isDisposed) {
				this.logService.warn('[SessionsChatBackgroundTint] Could not sample the chat background image.', error);
			}
		} finally {
			if (this.imageLoad.value === store) {
				this.imageLoad.clear();
			}
		}
	}

	protected async readImageColor(uri: URI, store: DisposableStore): Promise<Color | undefined> {
		const image = $<HTMLImageElement>('img');
		store.add(toDisposable(() => image.removeAttribute('src')));
		image.src = FileAccess.uriToBrowserUri(uri).toString(true);
		await image.decode();
		if (store.isDisposed) {
			return undefined;
		}

		const canvas = $<HTMLCanvasElement>('canvas', { width: 32, height: 32 });
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) {
			throw new Error('Could not create a canvas to sample the chat background image.');
		}
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		return getChatBackgroundImageColor(context.getImageData(0, 0, canvas.width, canvas.height).data);
	}
}
