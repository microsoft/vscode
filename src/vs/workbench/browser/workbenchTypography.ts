/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheetFromObservable } from '../../base/browser/domStylesheets.js';
import { DEFAULT_UI_FONT_SIZE, DEFAULT_UI_TYPOGRAPHY, getUITypography, isEqualUITypography, IUITypography, setUITypography } from '../../base/browser/fonts.js';
import { getStandardRowHeight } from '../../base/browser/ui/list/list.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { clamp } from '../../base/common/numbers.js';
import { observableValue } from '../../base/common/observable.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { asCssVariableName, getSizeRegistry, sizeValueToCss } from '../../platform/theme/common/sizeRegistry.js';
import { IColorTheme, IThemeService } from '../../platform/theme/common/themeService.js';
import { IWorkbenchContribution } from '../common/contributions.js';
import { IAuxiliaryWindowService, layoutAllWindows } from '../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IWorkbenchLayoutService } from '../services/layout/browser/layoutService.js';

export const enum WorkbenchTypographySettings {
	FontSize = 'workbench.fontSize',
	FontFamily = 'workbench.fontFamily',
	ListDensity = 'workbench.list.density',
	TreeFontFamily = 'workbench.tree.fontFamily',
}

/**
 * The spacing of the standard rows of lists and trees in views, see `getDensityRowHeight`.
 */
export const enum ListDensity {
	Compact = 'compact',
	Default = 'default',
	Comfortable = 'comfortable',
}

/**
 * The space in px added to standard rows for each {@link ListDensity} at the default font size.
 */
const LIST_ROW_SPACING: { readonly [density: string]: number } = {
	[ListDensity.Compact]: -4,
	[ListDensity.Comfortable]: 4,
};

export const MIN_WORKBENCH_FONT_SIZE = 10;
export const MAX_WORKBENCH_FONT_SIZE = 28;

/**
 * Holds the custom UI font family for elements that do not inherit it, such as
 * shadow DOM hosts. Matches the variable that webviews receive.
 */
const FONT_FAMILY_VARIABLE = '--vscode-font-family';

/**
 * Holds the ratio of the UI font size to the default one, for CSS font sizes
 * that have no matching font size token.
 */
const FONT_SCALE_VARIABLE = '--vscode-font-scale';

/**
 * Holds the factor by which icons grow with the UI font, for CSS icon sizes that
 * have no matching size token. Icons grow with larger fonts but never shrink.
 */
const ICON_SCALE_VARIABLE = '--vscode-icon-scale';

/**
 * Holds the height of a standard list row, see `getStandardRowHeight`.
 */
const LIST_ROW_HEIGHT_VARIABLE = '--vscode-list-row-height';

/**
 * Holds the font family of file and symbol labels in the lists and trees of views.
 */
const TREE_FONT_FAMILY_VARIABLE = '--vscode-tree-font-family';

/**
 * Applies {@link TREE_FONT_FAMILY_VARIABLE} to the labels of files and symbols in
 * the lists and trees of views. Chat renders its own content.
 */
const TREE_FONT_FAMILY_CSS = `.monaco-workbench .pane-body .monaco-list .monaco-icon-label-container:not(.interactive-session *) { font-family: var(${TREE_FONT_FAMILY_VARIABLE}); }`;

/**
 * Size tokens that hold UI font sizes. Other tokens, such as spacing, do not
 * scale with the UI font.
 */
const FONT_SIZE_TOKEN = /^(agents\.)?(fontSize|bodyFontSize)(\.|$)/;

/**
 * Size tokens that hold icon sizes, which scale like {@link ICON_SCALE_VARIABLE}.
 */
const ICON_SIZE_TOKEN = /^codiconFontSize(\.|$)/;

/**
 * Editor text, the gutter and editor widgets follow the editor font, so they keep the
 * default typography. So do the find widgets of other editors, which share the editor
 * find widget metrics. Peek views are UI.
 */
const EDITOR_SELECTOR = [
	...['.margin', '.view-lines', '.contentWidgets', '.overflowingContentWidgets', '.overlayWidgets > :not(.zone-widget)', '.overflowingOverlayWidgets > :not(.zone-widget)'].map(selector => `.monaco-editor ${selector}`),
	'.simple-find-part-wrapper',
	'.simple-fr-find-part-wrapper',
].map(selector => `.monaco-workbench ${selector}`).join(', ');

/**
 * Returns the CSS that restores the default typography inside editors, see {@link EDITOR_SELECTOR}.
 */
export function getEditorTypographyResetCss(theme: IColorTheme): string {
	const declarations = [FONT_SCALE_VARIABLE, ICON_SCALE_VARIABLE, LIST_ROW_HEIGHT_VARIABLE].map(name => `${name}: initial;`);
	const sizeRegistry = getSizeRegistry();
	for (const { id } of sizeRegistry.getSizes()) {
		const size = (FONT_SIZE_TOKEN.test(id) || ICON_SIZE_TOKEN.test(id)) ? sizeRegistry.resolveDefaultSize(id, theme) : undefined;
		if (size) {
			declarations.push(`${asCssVariableName(id)}: ${sizeValueToCss(size)};`);
		}
	}
	return `${EDITOR_SELECTOR} { ${declarations.join(' ')} }`;
}

/**
 * Returns the CSS variables for the given UI typography, keyed by variable name.
 * Empty values stand for the default typography, i.e. no override.
 */
export function getWorkbenchTypographyVariables(typography: IUITypography, theme: IColorTheme): Map<string, string> {
	const variables = new Map<string, string>();
	variables.set(FONT_FAMILY_VARIABLE, typography.fontFamily ?? '');

	const fontScale = typography.fontSize / DEFAULT_UI_FONT_SIZE;
	variables.set(FONT_SCALE_VARIABLE, fontScale !== 1 ? String(fontScale) : '');

	const iconScale = Math.max(fontScale, 1);
	variables.set(ICON_SCALE_VARIABLE, iconScale !== 1 ? String(iconScale) : '');

	const sizeRegistry = getSizeRegistry();
	for (const { id } of sizeRegistry.getSizes()) {
		const scale = FONT_SIZE_TOKEN.test(id) ? fontScale : ICON_SIZE_TOKEN.test(id) ? iconScale : undefined;
		if (scale !== undefined) {
			const size = sizeRegistry.resolveDefaultSize(id, theme);
			variables.set(asCssVariableName(id), scale !== 1 && size?.unit === 'px' ? sizeValueToCss({ value: size.value * scale, unit: 'px' }) : '');
		}
	}

	const rowHeight = getStandardRowHeight(typography);
	variables.set(LIST_ROW_HEIGHT_VARIABLE, rowHeight !== getStandardRowHeight(DEFAULT_UI_TYPOGRAPHY) ? `${rowHeight}px` : '');

	return variables;
}

/**
 * Applies the given UI typography to a workbench root element by overriding the
 * font family, the font size tokens and the typography dependent metrics inline.
 * Removes all overrides for the default typography.
 */
export function applyWorkbenchTypography(root: HTMLElement, typography: IUITypography, theme: IColorTheme): void {
	root.style.fontFamily = typography.fontFamily ?? '';
	for (const [name, value] of getWorkbenchTypographyVariables(typography, theme)) {
		root.style.setProperty(name, value);
	}
}

/**
 * Applies the {@link WorkbenchTypographySettings} to all workbench containers and
 * publishes them as the UI typography (see `onDidChangeUITypography`).
 */
export class WorkbenchTypographyContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workbenchTypography';

	private readonly editorTypographyResetCss = observableValue<string>(this, '');
	private readonly treeFontFamilyCss = observableValue<string>(this, '');
	private treeFontFamily: string | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
	) {
		super();

		this._register(createStyleSheetFromObservable(this.editorTypographyResetCss));
		this._register(createStyleSheetFromObservable(this.treeFontFamilyCss));
		this.update();
		this.updateTreeFontFamily();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if ((e.affectsConfiguration(WorkbenchTypographySettings.FontSize) || e.affectsConfiguration(WorkbenchTypographySettings.FontFamily) || e.affectsConfiguration(WorkbenchTypographySettings.ListDensity)) && this.update()) {
				layoutAllWindows(this.layoutService, this.auxiliaryWindowService);
			}
			if (e.affectsConfiguration(WorkbenchTypographySettings.TreeFontFamily)) {
				this.updateTreeFontFamily();
			}
		}));

		this._register(this.themeService.onDidColorThemeChange(() => {
			const typography = getUITypography();
			if (!isEqualUITypography(typography, DEFAULT_UI_TYPOGRAPHY)) {
				this.applyToContainers(typography);
			}
		}));

		this._register(this.layoutService.onDidAddContainer(({ container }) => {
			const typography = getUITypography();
			if (!isEqualUITypography(typography, DEFAULT_UI_TYPOGRAPHY)) {
				applyWorkbenchTypography(container, typography, this.themeService.getColorTheme());
			}
			if (this.treeFontFamily) {
				container.style.setProperty(TREE_FONT_FAMILY_VARIABLE, this.treeFontFamily);
			}
		}));
	}

	/**
	 * @returns whether the UI typography changed.
	 */
	private update(): boolean {
		const typography = this.readTypography();
		if (isEqualUITypography(typography, getUITypography())) {
			return false;
		}

		// Apply the CSS before notifying listeners so that they measure the new typography
		this.applyToContainers(typography);
		setUITypography(typography);
		return true;
	}

	private readTypography(): IUITypography {
		const fontSize = this.configurationService.getValue<number>(WorkbenchTypographySettings.FontSize);
		const fontFamily = this.configurationService.getValue<string>(WorkbenchTypographySettings.FontFamily);
		const trimmedFontFamily = typeof fontFamily === 'string' ? fontFamily.trim() : '';

		const listRowSpacing = LIST_ROW_SPACING[this.configurationService.getValue<string>(WorkbenchTypographySettings.ListDensity)];

		return {
			fontSize: typeof fontSize === 'number' && Number.isFinite(fontSize) ? clamp(fontSize, MIN_WORKBENCH_FONT_SIZE, MAX_WORKBENCH_FONT_SIZE) : DEFAULT_UI_FONT_SIZE,
			fontFamily: trimmedFontFamily && trimmedFontFamily !== 'default' ? trimmedFontFamily : undefined,
			...(listRowSpacing ? { listRowSpacing } : undefined)
		};
	}

	private updateTreeFontFamily(): void {
		const fontFamily = this.configurationService.getValue<string>(WorkbenchTypographySettings.TreeFontFamily);
		const trimmedFontFamily = typeof fontFamily === 'string' ? fontFamily.trim() : '';
		this.applyTreeFontFamily(trimmedFontFamily && trimmedFontFamily !== 'default' ? trimmedFontFamily : undefined);
	}

	private applyTreeFontFamily(fontFamily: string | undefined): void {
		if (fontFamily === this.treeFontFamily) {
			return;
		}

		this.treeFontFamily = fontFamily;
		for (const container of this.layoutService.containers) {
			if (fontFamily) {
				container.style.setProperty(TREE_FONT_FAMILY_VARIABLE, fontFamily);
			} else {
				container.style.removeProperty(TREE_FONT_FAMILY_VARIABLE);
			}
		}
		this.treeFontFamilyCss.set(fontFamily ? TREE_FONT_FAMILY_CSS : '', undefined);
	}

	private applyToContainers(typography: IUITypography): void {
		const theme = this.themeService.getColorTheme();
		for (const container of this.layoutService.containers) {
			applyWorkbenchTypography(container, typography, theme);
		}
		this.editorTypographyResetCss.set(isEqualUITypography(typography, DEFAULT_UI_TYPOGRAPHY) ? '' : getEditorTypographyResetCss(theme), undefined);
	}

	override dispose(): void {
		if (!isEqualUITypography(getUITypography(), DEFAULT_UI_TYPOGRAPHY)) {
			this.applyToContainers(DEFAULT_UI_TYPOGRAPHY);
			setUITypography(DEFAULT_UI_TYPOGRAPHY);
		}
		this.applyTreeFontFamily(undefined);

		super.dispose();
	}
}
