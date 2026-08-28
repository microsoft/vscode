/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { Part } from '../../../browser/part.js';
import { IDimension } from '../../../../base/browser/dom.js';
import { Direction, IViewSize } from '../../../../base/browser/ui/grid/grid.js';
import { isMacintosh, isNative, isWeb } from '../../../../base/common/platform.js';
import { isAuxiliaryWindow, mainWindow } from '../../../../base/browser/window.js';
import { CustomTitleBarVisibility, TitleBarSetting, getMenuBarVisibility, hasCustomTitlebar, hasNativeMenu, hasNativeTitlebar } from '../../../../platform/window/common/window.js';
import { isFullscreen, isWCOEnabled } from '../../../../base/browser/browser.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';

export const IWorkbenchLayoutService = refineServiceDecorator<ILayoutService, IWorkbenchLayoutService>(ILayoutService);

export const enum Parts {
	TITLEBAR_PART = 'workbench.parts.titlebar',
	BANNER_PART = 'workbench.parts.banner',
	ACTIVITYBAR_PART = 'workbench.parts.activitybar',
	SIDEBAR_PART = 'workbench.parts.sidebar',
	PANEL_PART = 'workbench.parts.panel',
	AUXILIARYBAR_PART = 'workbench.parts.auxiliarybar',
	SESSIONS_PART = 'workbench.parts.sessions',
	CUSTOM_VIEW_GRID_PART = 'workbench.parts.customViewGrid',
	EDITOR_PART = 'workbench.parts.editor',
	STATUSBAR_PART = 'workbench.parts.statusbar'
}

export const enum ZenModeSettings {
	SHOW_TABS = 'zenMode.showTabs',
	HIDE_LINENUMBERS = 'zenMode.hideLineNumbers',
	HIDE_STATUSBAR = 'zenMode.hideStatusBar',
	HIDE_ACTIVITYBAR = 'zenMode.hideActivityBar',
	CENTER_LAYOUT = 'zenMode.centerLayout',
	FULLSCREEN = 'zenMode.fullScreen',
	RESTORE = 'zenMode.restore',
	SILENT_NOTIFICATIONS = 'zenMode.silentNotifications',
}

export const enum LayoutSettings {
	ACTIVITY_BAR_LOCATION = 'workbench.activityBar.location',
	ACTIVITY_BAR_AUTO_HIDE = 'workbench.activityBar.autoHide',
	ACTIVITY_BAR_COMPACT = 'workbench.activityBar.compact',
	EDITOR_TABS_MODE = 'workbench.editor.showTabs',
	EDITOR_ACTIONS_LOCATION = 'workbench.editor.editorActionsLocation',
	COMMAND_CENTER = 'window.commandCenter',
	LAYOUT_ACTIONS = 'workbench.layoutControl.enabled',
	SHADOWS = 'workbench.shadows',
	MODERN_UI = 'workbench.experimental.modernUI',
	MODERN_UI_DENSITY = 'window.density.layout',
	MODERN_UI_UPPERCASE_VIEW_HEADERS = 'workbench.experimental.modernUIUppercaseViewHeaders'
}

export const enum ModernUIDensity {
	Default = 'default',
	Compact = 'compact'
}

/**
 * The margin (in pixels) reserved on each side of a part when the Modern UI Update
 * experiment (`LayoutSettings.MODERN_UI`) is enabled. Parts grow or shrink their
 * content by this amount to leave room for the margin/border applied in CSS
 * (`src/vs/workbench/browser/media/floatingPanels.css`, `.floating-panels`).
 * Keep in sync with the `--vscode-spacing-size40` (4px) token used there.
 */
export const FLOATING_PANEL_MARGIN = 4;

/**
 * Compact Modern UI density removes the gaps between cards.
 */
export const COMPACT_FLOATING_PANEL_MARGIN = 0;

/**
 * Compact Modern UI density keeps a small perimeter between the connected card
 * cluster and the surrounding window chrome.
 */
export const COMPACT_FLOATING_PANEL_OUTER_MARGIN = 4;
/**
 * The trailing card margin (in pixels) when the Modern UI Update experiment is
 * enabled. Together with the next card's leading {@link FLOATING_PANEL_MARGIN},
 * it forms the 4px inter-card gap. Keep in sync with the
 * `--vscode-spacing-sizeNone` (0px) token used in `floatingPanels.css`.
 */
export const FLOATING_PANEL_INNER_MARGIN = 0;

export function getFloatingPanelMargin(layoutService: IWorkbenchLayoutService): number {
	return layoutService.isModernUICompact() ? COMPACT_FLOATING_PANEL_MARGIN : FLOATING_PANEL_MARGIN;
}

/**
 * The perimeter gutter (in pixels) a card reserves on an edge that faces window chrome
 * rather than another card. Both densities use the same 4px perimeter; they differ only in
 * the gap *between* cards (see {@link getFloatingPanelMargin}). Keep in sync with
 * `--modern-ui-floating-card-outer-margin` in `floatingPanels.css`.
 */
export function getFloatingPanelOuterMargin(layoutService: IWorkbenchLayoutService): number {
	return layoutService.isModernUICompact() ? COMPACT_FLOATING_PANEL_OUTER_MARGIN : FLOATING_PANEL_MARGIN;
}

export const enum ActivityBarPosition {
	DEFAULT = 'default',
	TOP = 'top',
	BOTTOM = 'bottom',
	HIDDEN = 'hidden'
}

export const enum EditorTabsMode {
	MULTIPLE = 'multiple',
	SINGLE = 'single',
	NONE = 'none'
}

export const enum EditorActionsLocation {
	DEFAULT = 'default',
	TITLEBAR = 'titleBar',
	HIDDEN = 'hidden'
}

export const enum Position {
	LEFT,
	RIGHT,
	BOTTOM,
	TOP
}

export function isHorizontal(position: Position): boolean {
	return position === Position.BOTTOM || position === Position.TOP;
}

export const enum PartOpensMaximizedOptions {
	ALWAYS,
	NEVER,
	REMEMBER_LAST
}

export type PanelAlignment = 'left' | 'center' | 'right' | 'justify';

export function positionToString(position: Position): string {
	switch (position) {
		case Position.LEFT: return 'left';
		case Position.RIGHT: return 'right';
		case Position.BOTTOM: return 'bottom';
		case Position.TOP: return 'top';
		default: return 'bottom';
	}
}

/**
 * Whether the floating cards sit against the top window edge and take the density-specific
 * outer gutter. Both grid rows above the middle section (title bar and banner) must be hidden.
 */
export function isFloatingTopEdgeExposed(layoutService: IWorkbenchLayoutService, targetWindow: Window): boolean {
	return !layoutService.isVisible(Parts.TITLEBAR_PART, targetWindow) && !layoutService.isVisible(Parts.BANNER_PART);
}

/**
 * Determines which horizontal edge of the floating-card cluster is owned by its outermost
 * card when the Modern UI Update experiment is enabled, and which {@link Parts} owns it.
 * The owning part receives the density-specific outer gutter. Compact density includes the
 * default-position Activity Bar in the connected card cluster.
 *
 * The horizontal order of the parts is reconstructed from the same inputs the grid
 * layout uses (mirrors `Layout.adjustPartPositions` in `src/vs/workbench/browser/layout.ts`): the activity bar and primary side bar sit
 * on `getSideBarPosition()`, the secondary side bar on the opposite side, the editor in
 * the middle, and a vertical (left/right) panel immediately next to the editor on its
 * placement side. The outermost *visible* part on each edge wins; a visible Activity Bar is the
 * outermost card of the side bar cluster. A hidden editor is skipped, so a maximized side bar
 * (which spans the full content width) is correctly detected as the owner on both edges.
 *
 * Consumed by `AbstractPaneCompositePart` (side bars and panel) and `EditorPart`
 * (main editor) so the outer-gutter decision stays in sync between them.
 */
export function getFloatingOuterEdgeOwners(layoutService: IWorkbenchLayoutService): { left: Parts | undefined; right: Parts | undefined } {
	if (!layoutService.isFloatingPanelsEnabled()) {
		return { left: undefined, right: undefined };
	}

	const sideBarLeft = layoutService.getSideBarPosition() === Position.LEFT;
	const panelPosition = layoutService.getPanelPosition();
	const verticalPanelVisible = !isHorizontal(panelPosition) && layoutService.isVisible(Parts.PANEL_PART);

	// A visible vertical panel sits immediately outside the editor on its placement
	// side (between the editor and the side/aux bar on that side).
	const panelInLeftSequence = verticalPanelVisible && panelPosition === Position.LEFT;
	const panelInRightSequence = verticalPanelVisible && panelPosition === Position.RIGHT;

	// The full window order of the floatable parts, left -> right: the activity bar and
	// primary side bar sit together on `getSideBarPosition()` (activity bar outermost), the
	// secondary side bar on the opposite side, a vertical panel immediately beside the editor
	// on its placement side, and the editor in the middle. Each edge is resolved by walking
	// this order inward to the first *visible* card, so a hidden editor (e.g. a maximized side
	// bar that spans the full content width) is skipped and the spanning card is detected on
	// both edges.
	const sideBarGroup: Parts[] = [Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART];
	const panelGroup: Parts[] = [Parts.PANEL_PART];
	const fullOrder: Parts[] = sideBarLeft
		? [
			...sideBarGroup,
			...(panelInLeftSequence ? panelGroup : []),
			Parts.EDITOR_PART,
			...(panelInRightSequence ? panelGroup : []),
			Parts.AUXILIARYBAR_PART
		]
		: [
			Parts.AUXILIARYBAR_PART,
			...(panelInLeftSequence ? panelGroup : []),
			Parts.EDITOR_PART,
			...(panelInRightSequence ? panelGroup : []),
			...[...sideBarGroup].reverse() // activity bar is outermost on the right edge
		];

	return {
		left: resolveFloatingOuterOwner(layoutService, fullOrder),
		right: resolveFloatingOuterOwner(layoutService, [...fullOrder].reverse())
	};
}

/**
 * Walks the given window order (outermost -> innermost) and returns the first visible card
 * owning the cluster edge. A visible default-position Activity Bar is a cluster card in both
 * densities: it is the outermost card of the side bar cluster and carries the outer gutter.
 */
function resolveFloatingOuterOwner(layoutService: IWorkbenchLayoutService, orderedParts: Parts[]): Parts | undefined {
	for (const part of orderedParts) {
		// The editor is the only multi-window part in this order; its main-window visibility
		// is what matters for the main-window floating layout.
		const visible = part === Parts.EDITOR_PART
			? layoutService.isVisible(Parts.EDITOR_PART, mainWindow)
			: layoutService.isVisible(part as SINGLE_WINDOW_PARTS);
		if (!visible) {
			continue;
		}

		return part;
	}

	return undefined;
}

/**
 * The horizontal cluster edges on which the given part is the outermost floating card and
 * should therefore receive the density-specific outer gutter. A part can own both edges (notably
 * a horizontal bottom/top panel that spans the full width when the bars beside it are
 * hidden or not full-height). Convenience wrapper around {@link getFloatingOuterEdgeOwners}.
 */
export function getFloatingOuterGutterEdges(layoutService: IWorkbenchLayoutService, partId: Parts): { left: boolean; right: boolean } {
	if (!layoutService.isFloatingPanelsEnabled()) {
		return { left: false, right: false };
	}

	// A horizontal (bottom/top) panel can reach both window edges simultaneously, so it
	// is not captured by the single-owner-per-edge model and is resolved separately.
	if (partId === Parts.PANEL_PART && isHorizontal(layoutService.getPanelPosition())) {
		return getFloatingHorizontalPanelOuterEdges(layoutService);
	}

	const owners = getFloatingOuterEdgeOwners(layoutService);
	return { left: owners.left === partId, right: owners.right === partId };
}

/**
 * Horizontal margins (in pixels) a floating pane composite reserves, mirroring the
 * margins in `floatingPanels.css`.
 */
export function getFloatingPaneCompositeHorizontalMargins(layoutService: IWorkbenchLayoutService, partId: Parts): { left: number; right: number } {
	if (!layoutService.isFloatingPanelsEnabled()) {
		return { left: 0, right: 0 };
	}

	const outerGutter = getFloatingOuterGutterEdges(layoutService, partId);
	const margin = getFloatingPanelMargin(layoutService);
	const outerMargin = getFloatingPanelOuterMargin(layoutService);

	// The primary side bar meets the activity bar rail flush so the two read as one connected
	// surface. Only a left-positioned side bar needs this explicitly; on the right the seam is
	// the side bar's trailing edge, which already uses the inner margin.
	const meetsActivityBarRail = partId === Parts.SIDEBAR_PART
		&& layoutService.getSideBarPosition() === Position.LEFT
		&& layoutService.isVisible(Parts.ACTIVITYBAR_PART);
	const leading = meetsActivityBarRail ? FLOATING_PANEL_INNER_MARGIN : margin;

	return {
		left: outerGutter.left ? outerMargin : leading,
		right: outerGutter.right ? outerMargin : FLOATING_PANEL_INNER_MARGIN,
	};
}

/**
 * Whether the primary sidebar and auxiliary bar are each in the same grid row as the
 * editor (sibling to the editor) for a horizontal panel. A bar that is a sibling is not
 * full-height; it sits above or below the panel row rather than spanning the full height.
 * Mirrors the sideBarSiblingToEditor / auxiliaryBarSiblingToEditor formula used in
 * adjustPartPositions() in layout.ts.
 */
export function getFloatingSidebarSiblingToEditorStatus(
	layoutService: IWorkbenchLayoutService
): { sideBar: boolean; auxBar: boolean } {
	const alignment = layoutService.getPanelAlignment();
	const sideBarOnLeft = layoutService.getSideBarPosition() === Position.LEFT;
	return {
		sideBar: !(alignment === 'center' || (sideBarOnLeft && alignment === 'right') || (!sideBarOnLeft && alignment === 'left')),
		auxBar: !(alignment === 'center' || (!sideBarOnLeft && alignment === 'right') || (sideBarOnLeft && alignment === 'left')),
	};
}

/**
 * Vertical margins (in pixels) a floating pane composite (primary side bar, secondary side
 * bar or panel) reserves, mirroring the margins in `floatingPanels.css`. Compact density
 * uses the perimeter gutter whenever the edge faces window chrome rather than another card.
 */
export function getFloatingPaneCompositeVerticalMargins(
	layoutService: IWorkbenchLayoutService,
	partId: Parts,
	targetWindow: Window
): { top: number; bottom: number } {
	if (!layoutService.isFloatingPanelsEnabled()) {
		return { top: 0, bottom: 0 };
	}

	const outerEdges = getFloatingPaneCompositeVerticalOuterEdges(layoutService, partId, targetWindow);
	const statusBarVisible = layoutService.isVisible(Parts.STATUSBAR_PART, targetWindow);
	const margin = getFloatingPanelMargin(layoutService);
	const outerMargin = getFloatingPanelOuterMargin(layoutService);

	return {
		top: outerEdges.top
			? isFloatingTopEdgeExposed(layoutService, targetWindow) ? outerMargin : FLOATING_PANEL_INNER_MARGIN
			: margin,
		bottom: outerEdges.bottom
			? statusBarVisible ? FLOATING_PANEL_MARGIN : outerMargin
			: FLOATING_PANEL_INNER_MARGIN
	};
}

export function getFloatingPaneCompositeVerticalOuterEdges(
	layoutService: IWorkbenchLayoutService,
	partId: Parts,
	targetWindow: Window
): { top: boolean; bottom: boolean } {
	if (!layoutService.isFloatingPanelsEnabled()) {
		return { top: false, bottom: false };
	}

	const panelPosition = layoutService.getPanelPosition();
	const panelVisible = layoutService.isVisible(Parts.PANEL_PART);
	const isSideBar = partId === Parts.SIDEBAR_PART || partId === Parts.AUXILIARYBAR_PART;
	const siblingStatus = getFloatingSidebarSiblingToEditorStatus(layoutService);
	const isSiblingToEditor = partId === Parts.SIDEBAR_PART ? siblingStatus.sideBar : siblingStatus.auxBar;
	const facesPanelAbove = panelVisible && panelPosition === Position.TOP && isSideBar && isSiblingToEditor;
	const facesEditorAbove = partId === Parts.PANEL_PART && panelPosition === Position.BOTTOM && layoutService.isVisible(Parts.EDITOR_PART, targetWindow);
	const facesEditorBelow = partId === Parts.PANEL_PART && panelPosition === Position.TOP && layoutService.isVisible(Parts.EDITOR_PART, targetWindow);
	const facesPanelBelow = panelVisible && panelPosition === Position.BOTTOM && isSideBar && isSiblingToEditor;

	return {
		top: !facesPanelAbove && !facesEditorAbove,
		bottom: !facesEditorBelow && !facesPanelBelow,
	};
}

/**
 * Vertical margins (in pixels) the floating main editor reserves, mirroring the margins in
 * `floatingPanels.css`. A panel above or below takes the place of the corresponding window edge.
 */
export function getFloatingEditorVerticalMargins(
	layoutService: IWorkbenchLayoutService,
	targetWindow: Window
): { top: number; bottom: number } {
	if (!layoutService.isFloatingPanelsEnabled()) {
		return { top: 0, bottom: 0 };
	}

	const outerEdges = getFloatingEditorVerticalOuterEdges(layoutService);
	const margin = getFloatingPanelMargin(layoutService);
	const outerMargin = getFloatingPanelOuterMargin(layoutService);

	return {
		top: outerEdges.top
			? isFloatingTopEdgeExposed(layoutService, targetWindow) ? outerMargin : FLOATING_PANEL_INNER_MARGIN
			: margin,
		bottom: outerEdges.bottom
			? layoutService.isVisible(Parts.STATUSBAR_PART, targetWindow) ? FLOATING_PANEL_MARGIN : outerMargin
			: FLOATING_PANEL_INNER_MARGIN
	};
}

export function getFloatingEditorVerticalOuterEdges(layoutService: IWorkbenchLayoutService): { top: boolean; bottom: boolean } {
	if (!layoutService.isFloatingPanelsEnabled()) {
		return { top: false, bottom: false };
	}

	const panelVisible = layoutService.isVisible(Parts.PANEL_PART);
	const panelPosition = layoutService.getPanelPosition();
	return {
		top: !(panelVisible && panelPosition === Position.TOP),
		bottom: !(panelVisible && panelPosition === Position.BOTTOM),
	};
}

/**
 * Whether a visible horizontal (bottom/top) panel reaches each horizontal cluster edge and
 * should therefore receive the density-specific outer gutter so it aligns with the editor above.
 * The panel spans underneath a bar that is not full-height, and reaches an edge whenever
 * the bar on that side is hidden or not full-height (and, on the side bar side, the
 * activity bar is absent). The full-height/sibling computation mirrors `Layout.adjustPartPositions`.
 */
function getFloatingHorizontalPanelOuterEdges(layoutService: IWorkbenchLayoutService): { left: boolean; right: boolean } {
	if (!layoutService.isVisible(Parts.PANEL_PART)) {
		return { left: false, right: false };
	}

	const sideBarLeft = layoutService.getSideBarPosition() === Position.LEFT;
	const { sideBar: sideBarSiblingToEditor, auxBar: auxSiblingToEditor } = getFloatingSidebarSiblingToEditorStatus(layoutService);

	const sideBarSideReached = !layoutService.isVisible(Parts.ACTIVITYBAR_PART)
		&& (!layoutService.isVisible(Parts.SIDEBAR_PART) || sideBarSiblingToEditor);
	const auxSideReached = !layoutService.isVisible(Parts.AUXILIARYBAR_PART) || auxSiblingToEditor;

	return sideBarLeft
		? { left: sideBarSideReached, right: auxSideReached }
		: { left: auxSideReached, right: sideBarSideReached };
}

const positionsByString: { [key: string]: Position } = {
	[positionToString(Position.LEFT)]: Position.LEFT,
	[positionToString(Position.RIGHT)]: Position.RIGHT,
	[positionToString(Position.BOTTOM)]: Position.BOTTOM,
	[positionToString(Position.TOP)]: Position.TOP
};

export function positionFromString(str: string): Position {
	return positionsByString[str];
}

function partOpensMaximizedSettingToString(setting: PartOpensMaximizedOptions): string {
	switch (setting) {
		case PartOpensMaximizedOptions.ALWAYS: return 'always';
		case PartOpensMaximizedOptions.NEVER: return 'never';
		case PartOpensMaximizedOptions.REMEMBER_LAST: return 'preserve';
		default: return 'preserve';
	}
}

const partOpensMaximizedByString: { [key: string]: PartOpensMaximizedOptions } = {
	[partOpensMaximizedSettingToString(PartOpensMaximizedOptions.ALWAYS)]: PartOpensMaximizedOptions.ALWAYS,
	[partOpensMaximizedSettingToString(PartOpensMaximizedOptions.NEVER)]: PartOpensMaximizedOptions.NEVER,
	[partOpensMaximizedSettingToString(PartOpensMaximizedOptions.REMEMBER_LAST)]: PartOpensMaximizedOptions.REMEMBER_LAST
};

export function partOpensMaximizedFromString(str: string): PartOpensMaximizedOptions {
	return partOpensMaximizedByString[str];
}

export type MULTI_WINDOW_PARTS = Parts.EDITOR_PART | Parts.STATUSBAR_PART | Parts.TITLEBAR_PART;
export type SINGLE_WINDOW_PARTS = Exclude<Parts, MULTI_WINDOW_PARTS>;

export function isMultiWindowPart(part: Parts): part is MULTI_WINDOW_PARTS {
	return part === Parts.EDITOR_PART ||
		part === Parts.STATUSBAR_PART ||
		part === Parts.TITLEBAR_PART;
}

export interface IPartVisibilityChangeEvent {
	readonly partId: string;
	readonly visible: boolean;
	readonly source?: 'resize';
}

export interface IWorkbenchLayoutService extends ILayoutService {

	readonly _serviceBrand: undefined;

	/**
	 * Emits when the zen mode is enabled or disabled.
	 */
	readonly onDidChangeZenMode: Event<boolean>;

	/**
	 * Emits when the target window is maximized or unmaximized.
	 */
	readonly onDidChangeWindowMaximized: Event<{ readonly windowId: number; readonly maximized: boolean }>;

	/**
	 * Emits when main editor centered layout is enabled or disabled.
	 */
	readonly onDidChangeMainEditorCenteredLayout: Event<boolean>;

	/*
	 * Emit when panel position changes.
	 */
	readonly onDidChangePanelPosition: Event<string>;

	/**
	 * Emit when panel alignment changes.
	 */
	readonly onDidChangePanelAlignment: Event<PanelAlignment>;

	/**
	 * Emit when part visibility changes.
	 */
	readonly onDidChangePartVisibility: Event<IPartVisibilityChangeEvent>;

	/**
	 * Emit when notifications (toasts or center) visibility changes.
	 */
	readonly onDidChangeNotificationsVisibility: Event<boolean>;

	/*
	 * Emit when auxiliary bar maximized state changes.
	 */
	readonly onDidChangeAuxiliaryBarMaximized: Event<void>;

	/**
	 * True if a default layout with default editors was applied at startup
	 */
	readonly openedDefaultEditors: boolean;

	/**
	 * Run a layout of the workbench.
	 */
	layout(): void;

	/**
	 * Asks the part service if all parts have been fully restored. For editor part
	 * this means that the contents of visible editors have loaded.
	 */
	isRestored(): boolean;

	/**
	 * A promise for to await the `isRestored()` condition to be `true`.
	 */
	readonly whenRestored: Promise<void>;

	/**
	 * Returns whether the given part has the keyboard focus or not.
	 */
	hasFocus(part: Parts): boolean;

	/**
	 * Returns whether the floating panels presentation is enabled for this
	 * workbench, i.e. whether the Modern UI Update experiment
	 * (`LayoutSettings.MODERN_UI`) is on. Always `false` for the agents window,
	 * which has its own floating card design and must not apply the experiment's
	 * content insets.
	 */
	isFloatingPanelsEnabled(): boolean;

	/**
	 * Returns whether Modern UI uses its compact density.
	 */
	isModernUICompact(): boolean;

	/**
	 * Focuses the part in the target window. If the part is not visible this is a noop.
	 */
	focusPart(part: SINGLE_WINDOW_PARTS): void;
	focusPart(part: MULTI_WINDOW_PARTS, targetWindow: Window): void;
	focusPart(part: Parts, targetWindow: Window): void;

	/**
	 * Returns the target window container or parts HTML element within, if there is one.
	 */
	getContainer(targetWindow: Window): HTMLElement;
	getContainer(targetWindow: Window, part: Parts): HTMLElement | undefined;

	/**
	 * Returns if the part is visible in the target window.
	 */
	isVisible(part: SINGLE_WINDOW_PARTS): boolean;
	isVisible(part: MULTI_WINDOW_PARTS, targetWindow: Window): boolean;
	isVisible(part: Parts, targetWindow: Window): boolean;

	/**
	 * Set part hidden or not in the target window.
	 */
	setPartHidden(hidden: boolean, part: Parts): void;

	/**
	 * Returns whether the layout surface that represents the secondary sidebar is visible.
	 */
	isSecondarySideBarVisible(): boolean;

	/**
	 * Toggles the layout surface that represents the secondary sidebar.
	 */
	toggleSecondarySideBar(): void;

	/**
	 * Maximizes the panel height if the panel is not already maximized.
	 * Shrinks the panel to the default starting size if the panel is maximized.
	 */
	toggleMaximizedPanel(): void;

	/**
	 * Returns true if the panel is maximized.
	 */
	isPanelMaximized(): boolean;

	/**
	 * Maximizes the auxiliary sidebar by hiding the editor and panel areas.
	 * Restores the previous layout if the auxiliary sidebar is already maximized.
	 */
	toggleMaximizedAuxiliaryBar(): void;

	/**
	 * Maximizes or restores the auxiliary sidebar.
	 *
	 * @returns `true` if there was a change in the maximization state.
	 */
	setAuxiliaryBarMaximized(maximized: boolean): boolean;

	/**
	 * Returns true if the auxiliary sidebar is maximized.
	 */
	isAuxiliaryBarMaximized(): boolean;

	/**
	 * Returns true if the main window has a border.
	 */
	hasMainWindowBorder(): boolean;

	/**
	 * Returns the main window border radius if any.
	 */
	getMainWindowBorderRadius(): string | undefined;

	/**
	 * Gets the current side bar position. Note that the sidebar can be hidden too.
	 */
	getSideBarPosition(): Position;

	/**
	 * Toggles the menu bar visibility.
	 */
	toggleMenuBar(): void;

	/*
	 * Gets the current panel position. Note that the panel can be hidden too.
	 */
	getPanelPosition(): Position;

	/**
	 * Sets the panel position.
	 */
	setPanelPosition(position: Position): void;

	/**
	 * Gets the panel alignement.
	 */
	getPanelAlignment(): PanelAlignment;

	/**
	 * Sets the panel alignment.
	 */
	setPanelAlignment(alignment: PanelAlignment): void;

	/**
	 * Gets the maximum possible size for editor in the given container.
	 */
	getMaximumEditorDimensions(container: HTMLElement): IDimension;

	/**
	 * Toggles the workbench in and out of zen mode - parts get hidden and window goes fullscreen.
	 */
	toggleZenMode(): void;

	/**
	 * Returns whether the centered editor layout is active on the main editor part.
	 */
	isMainEditorLayoutCentered(): boolean;

	/**
	 * Sets the main editor part in and out of centered layout.
	 */
	centerMainEditorLayout(active: boolean): void;

	/**
	 * Get the provided parts size in the main window.
	 */
	getSize(part: Parts): IViewSize;

	/**
	 * Set the provided parts size in the main window.
	 */
	setSize(part: Parts, size: IViewSize): void;

	/**
	 * Resize the provided part in the main window.
	 */
	resizePart(part: Parts, sizeChangeWidth: number, sizeChangeHeight: number): void;

	/**
	 * Register a part to participate in the layout.
	 */
	registerPart(part: Part): IDisposable;

	/**
	 * Returns whether the target window is maximized.
	 */
	isWindowMaximized(targetWindow: Window): boolean;

	/**
	 * Updates the maximized state of the target window.
	 */
	updateWindowMaximizedState(targetWindow: Window, maximized: boolean): void;

	/**
	 * Returns the next visible view part in a given direction in the main window.
	 */
	getVisibleNeighborPart(part: Parts, direction: Direction): Parts | undefined;
}

export function shouldShowCustomTitleBar(configurationService: IConfigurationService, window: Window, menuBarToggled?: boolean): boolean {
	if (!hasCustomTitlebar(configurationService)) {
		return false;
	}

	const inFullscreen = isFullscreen(window);
	const nativeTitleBarEnabled = hasNativeTitlebar(configurationService);

	if (!isWeb) {
		const showCustomTitleBar = configurationService.getValue<CustomTitleBarVisibility>(TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY);
		if (showCustomTitleBar === CustomTitleBarVisibility.NEVER && nativeTitleBarEnabled || showCustomTitleBar === CustomTitleBarVisibility.WINDOWED && inFullscreen) {
			return false;
		}
	}

	if (!isTitleBarEmpty(configurationService)) {
		return true;
	}

	// Hide custom title bar when native title bar enabled and custom title bar is empty
	if (nativeTitleBarEnabled && hasNativeMenu(configurationService)) {
		return false;
	}

	// macOS desktop does not need a title bar when full screen
	if (isMacintosh && isNative) {
		return !inFullscreen;
	}

	// non-fullscreen native must show the title bar
	if (isNative && !inFullscreen) {
		return true;
	}

	// if WCO is visible, we have to show the title bar
	if (isWCOEnabled() && !inFullscreen) {
		return true;
	}

	// remaining behavior is based on menubar visibility
	const menuBarVisibility = !isAuxiliaryWindow(window) ? getMenuBarVisibility(configurationService) : 'hidden';
	switch (menuBarVisibility) {
		case 'classic':
			return !inFullscreen || !!menuBarToggled;
		case 'compact':
		case 'hidden':
			return false;
		case 'toggle':
			return !!menuBarToggled;
		case 'visible':
			return true;
		default:
			return isWeb ? false : !inFullscreen || !!menuBarToggled;
	}
}

function isTitleBarEmpty(configurationService: IConfigurationService): boolean {

	// with the command center enabled, we should always show
	if (configurationService.getValue<boolean>(LayoutSettings.COMMAND_CENTER)) {
		return false;
	}

	// with the activity bar on top, we should always show
	const activityBarPosition = configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
	if (activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM) {
		return false;
	}

	// with the editor actions on top, we should always show
	const editorActionsLocation = configurationService.getValue<EditorActionsLocation>(LayoutSettings.EDITOR_ACTIONS_LOCATION);
	const editorTabsMode = configurationService.getValue<EditorTabsMode>(LayoutSettings.EDITOR_TABS_MODE);
	if (editorActionsLocation === EditorActionsLocation.TITLEBAR || editorActionsLocation === EditorActionsLocation.DEFAULT && editorTabsMode === EditorTabsMode.NONE) {
		return false;
	}

	// with the layout actions on top, we should always show
	if (configurationService.getValue<boolean>(LayoutSettings.LAYOUT_ACTIONS)) {
		return false;
	}

	return true;
}
