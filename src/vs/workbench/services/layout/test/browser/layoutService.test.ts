/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { COMPACT_FLOATING_PANEL_MARGIN, COMPACT_FLOATING_PANEL_OUTER_MARGIN, FLOATING_PANEL_INNER_MARGIN, FLOATING_PANEL_MARGIN, getFloatingEditorVerticalMargins, getFloatingOuterEdgeOwners, getFloatingPaneCompositeHorizontalMargins, getFloatingPaneCompositeVerticalMargins, getFloatingPanelMargin, getFloatingPanelOuterMargin, getFloatingSidebarSiblingToEditorStatus, isFloatingTopEdgeExposed, type PanelAlignment, Parts, Position } from '../../browser/layoutService.js';
import { TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';

suite('LayoutService - isFloatingTopEdgeExposed', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	class VisibilityLayoutService extends TestLayoutService {
		visibleParts = new Set<Parts>();
		override isVisible(part: Parts): boolean { return this.visibleParts.has(part); }
	}

	function topEdgeExposed(visible: Parts[]): boolean {
		const service = new VisibilityLayoutService();
		service.visibleParts = new Set(visible);
		return isFloatingTopEdgeExposed(service, mainWindow);
	}

	test('exposed only when both the title bar and the banner are hidden', () => {
		const actual = {
			bothHidden: topEdgeExposed([]),
			titleBarVisible: topEdgeExposed([Parts.TITLEBAR_PART]),
			bannerVisible: topEdgeExposed([Parts.BANNER_PART]),
			bothVisible: topEdgeExposed([Parts.TITLEBAR_PART, Parts.BANNER_PART]),
		};

		// A visible banner gives the cards a top edge to sit against, same as a visible title bar.
		assert.deepStrictEqual(actual, {
			bothHidden: true,
			titleBarVisible: false,
			bannerVisible: false,
			bothVisible: false,
		});
	});
});

suite('LayoutService - floating panel spacing', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses density-specific inter-card gaps', () => {
		const compactLayoutService = new TestLayoutService();
		compactLayoutService.isModernUICompact = () => true;

		assert.deepStrictEqual({
			leadingMargin: FLOATING_PANEL_MARGIN,
			trailingMargin: FLOATING_PANEL_INNER_MARGIN,
			gap: FLOATING_PANEL_MARGIN + FLOATING_PANEL_INNER_MARGIN,
			compactMargin: getFloatingPanelMargin(compactLayoutService),
			compactOuterMargin: getFloatingPanelOuterMargin(compactLayoutService),
		}, {
			leadingMargin: 4,
			trailingMargin: 0,
			gap: 4,
			compactMargin: COMPACT_FLOATING_PANEL_MARGIN,
			compactOuterMargin: 4,
		});
	});
});

suite('LayoutService - getFloatingOuterEdgeOwners', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	class ConfigurableLayoutService extends TestLayoutService {
		floatingPanelsEnabled = true;
		modernUICompact = false;
		sideBarPosition = Position.LEFT;
		panelPosition = Position.BOTTOM;
		visibleParts = new Set<Parts>();

		override isFloatingPanelsEnabled(): boolean { return this.floatingPanelsEnabled; }
		override isModernUICompact(): boolean { return this.modernUICompact; }
		override getSideBarPosition(): Position { return this.sideBarPosition; }
		override getPanelPosition(): Position { return this.panelPosition; }
		override isVisible(part: Parts): boolean { return this.visibleParts.has(part); }
	}

	function owners(configure: (service: ConfigurableLayoutService) => void): { left: Parts | undefined; right: Parts | undefined } {
		const service = new ConfigurableLayoutService();
		configure(service);
		return getFloatingOuterEdgeOwners(service);
	}

	test('edge ownership across layouts', () => {
		const actual = {
			// Experiment disabled: no owners regardless of layout.
			disabled: owners(s => { s.floatingPanelsEnabled = false; s.visibleParts = new Set([Parts.AUXILIARYBAR_PART]); }),

			// Default full layout (side bar left): the activity bar is the outermost card of the
			// side bar cluster and owns the left edge, the secondary side bar owns the right edge.
			defaultFull: owners(s => { s.visibleParts = new Set([Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]); }),
			defaultFullSideBarRight: owners(s => { s.sideBarPosition = Position.RIGHT; s.visibleParts = new Set([Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]); }),

			// Compact density resolves ownership identically.
			compactFull: owners(s => { s.modernUICompact = true; s.visibleParts = new Set([Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]); }),
			compactFullSideBarRight: owners(s => { s.modernUICompact = true; s.sideBarPosition = Position.RIGHT; s.visibleParts = new Set([Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]); }),

			// Maximized aux bar with the activity bar in its default (visible) position: the
			// activity bar owns the left edge, the aux bar owns the right edge.
			maximizedAuxWithActivityBar: owners(s => { s.visibleParts = new Set([Parts.ACTIVITYBAR_PART, Parts.AUXILIARYBAR_PART]); }),

			// Maximized aux bar with the activity bar not in its default position (hidden from
			// the side column): the aux bar spans the full width and owns both edges.
			maximizedAuxNoActivityBar: owners(s => { s.visibleParts = new Set([Parts.AUXILIARYBAR_PART]); }),

			// Same, but the side bar is on the right: the aux bar still spans and owns both edges.
			maximizedAuxNoActivityBarSideBarRight: owners(s => { s.sideBarPosition = Position.RIGHT; s.visibleParts = new Set([Parts.AUXILIARYBAR_PART]); }),

			// Only the editor visible with the activity bar hidden: the editor is the sole card
			// and owns both edges.
			editorOnly: owners(s => { s.visibleParts = new Set([Parts.EDITOR_PART]); }),

			// Full layout with a visible left vertical panel: the panel sits between the editor
			// and the side bar, so it never reaches an edge.
			verticalPanelFull: owners(s => { s.panelPosition = Position.LEFT; s.visibleParts = new Set([Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.PANEL_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]); }),

			// Maximized left vertical panel with the activity bar hidden: the panel spans the
			// full width and owns both edges.
			maximizedVerticalPanel: owners(s => { s.panelPosition = Position.LEFT; s.visibleParts = new Set([Parts.PANEL_PART]); }),

			// Visible horizontal (bottom) panel: not part of the vertical order, so it owns no
			// edge; the secondary side bar still owns the right edge.
			horizontalPanelVisible: owners(s => { s.panelPosition = Position.BOTTOM; s.visibleParts = new Set([Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART]); }),
		};

		assert.deepStrictEqual(actual, {
			disabled: { left: undefined, right: undefined },
			defaultFull: { left: Parts.ACTIVITYBAR_PART, right: Parts.AUXILIARYBAR_PART },
			defaultFullSideBarRight: { left: Parts.AUXILIARYBAR_PART, right: Parts.ACTIVITYBAR_PART },
			compactFull: { left: Parts.ACTIVITYBAR_PART, right: Parts.AUXILIARYBAR_PART },
			compactFullSideBarRight: { left: Parts.AUXILIARYBAR_PART, right: Parts.ACTIVITYBAR_PART },
			maximizedAuxWithActivityBar: { left: Parts.ACTIVITYBAR_PART, right: Parts.AUXILIARYBAR_PART },
			maximizedAuxNoActivityBar: { left: Parts.AUXILIARYBAR_PART, right: Parts.AUXILIARYBAR_PART },
			maximizedAuxNoActivityBarSideBarRight: { left: Parts.AUXILIARYBAR_PART, right: Parts.AUXILIARYBAR_PART },
			editorOnly: { left: Parts.EDITOR_PART, right: Parts.EDITOR_PART },
			verticalPanelFull: { left: Parts.ACTIVITYBAR_PART, right: Parts.AUXILIARYBAR_PART },
			maximizedVerticalPanel: { left: Parts.PANEL_PART, right: Parts.PANEL_PART },
			horizontalPanelVisible: { left: Parts.SIDEBAR_PART, right: Parts.AUXILIARYBAR_PART },
		});
	});
});

suite('LayoutService - getFloatingPaneCompositeHorizontalMargins', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	class HorizontalMarginLayoutService extends TestLayoutService {
		floatingPanelsEnabled = true;
		modernUICompact = false;
		sideBarPosition = Position.LEFT;
		panelPosition = Position.BOTTOM;
		panelAlignment: PanelAlignment = 'center';
		visibleParts = new Set<Parts>();

		override isFloatingPanelsEnabled(): boolean { return this.floatingPanelsEnabled; }
		override isModernUICompact(): boolean { return this.modernUICompact; }
		override getSideBarPosition(): Position { return this.sideBarPosition; }
		override getPanelPosition(): Position { return this.panelPosition; }
		override getPanelAlignment(): PanelAlignment { return this.panelAlignment; }
		override isVisible(part: Parts): boolean { return this.visibleParts.has(part); }
	}

	function margins(partId: Parts, visibleParts: Parts[], sideBarPosition = Position.LEFT, compact = false, panelAlignment: PanelAlignment = 'center'): { left: number; right: number } {
		const service = new HorizontalMarginLayoutService();
		service.sideBarPosition = sideBarPosition;
		service.visibleParts = new Set(visibleParts);
		service.modernUICompact = compact;
		service.panelAlignment = panelAlignment;
		return getFloatingPaneCompositeHorizontalMargins(service, partId);
	}

	test('horizontal margins across densities and side bar positions', () => {
		assert.deepStrictEqual({
			activityBarLeft: margins(Parts.AUXILIARYBAR_PART, [Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]),
			activityBarRight: margins(Parts.AUXILIARYBAR_PART, [Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART], Position.RIGHT),
			secondarySideBarOnly: margins(Parts.AUXILIARYBAR_PART, [Parts.AUXILIARYBAR_PART]),

			// Default density: the primary side bar meets the activity bar rail flush on the
			// facing edge, and falls back to the outer gutter when the rail is hidden.
			primarySideBarLeft: margins(Parts.SIDEBAR_PART, [Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART], Position.LEFT),
			primarySideBarRight: margins(Parts.SIDEBAR_PART, [Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART], Position.RIGHT),
			primarySideBarLeftNoActivityBar: margins(Parts.SIDEBAR_PART, [Parts.SIDEBAR_PART, Parts.EDITOR_PART], Position.LEFT),

			compactSecondarySideBarOnly: margins(Parts.AUXILIARYBAR_PART, [Parts.AUXILIARYBAR_PART], Position.LEFT, true),
			compactPrimarySideBarLeft: margins(Parts.SIDEBAR_PART, [Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART], Position.LEFT, true),
			compactPrimarySideBarRight: margins(Parts.SIDEBAR_PART, [Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART], Position.RIGHT, true),
			compactJustifiedPanel: margins(Parts.PANEL_PART, [Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART], Position.LEFT, true, 'justify'),
			compactJustifiedPanelSideBarRight: margins(Parts.PANEL_PART, [Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART], Position.RIGHT, true, 'justify'),
		}, {
			// The default density uses the same 4px for the window-edge perimeter as for the
			// gap between cards; only compact distinguishes them.
			activityBarLeft: { left: 4, right: 4 },
			activityBarRight: { left: 4, right: 0 },
			secondarySideBarOnly: { left: 4, right: 4 },
			primarySideBarLeft: { left: FLOATING_PANEL_INNER_MARGIN, right: FLOATING_PANEL_INNER_MARGIN },
			primarySideBarRight: { left: 4, right: FLOATING_PANEL_INNER_MARGIN },
			primarySideBarLeftNoActivityBar: { left: 4, right: FLOATING_PANEL_INNER_MARGIN },
			compactSecondarySideBarOnly: { left: COMPACT_FLOATING_PANEL_OUTER_MARGIN, right: COMPACT_FLOATING_PANEL_OUTER_MARGIN },
			compactPrimarySideBarLeft: { left: COMPACT_FLOATING_PANEL_MARGIN, right: FLOATING_PANEL_INNER_MARGIN },
			compactPrimarySideBarRight: { left: COMPACT_FLOATING_PANEL_MARGIN, right: FLOATING_PANEL_INNER_MARGIN },
			compactJustifiedPanel: { left: COMPACT_FLOATING_PANEL_MARGIN, right: COMPACT_FLOATING_PANEL_OUTER_MARGIN },
			compactJustifiedPanelSideBarRight: { left: COMPACT_FLOATING_PANEL_OUTER_MARGIN, right: FLOATING_PANEL_INNER_MARGIN },
		});
	});
});

suite('LayoutService - getFloatingSidebarSiblingToEditorStatus', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	class SiblingStatusLayoutService extends TestLayoutService {
		sideBarPosition = Position.LEFT;
		panelAlignment: PanelAlignment = 'center';

		override getSideBarPosition(): Position { return this.sideBarPosition; }
		override getPanelAlignment(): PanelAlignment { return this.panelAlignment; }
	}

	function siblingStatus(configure: (s: SiblingStatusLayoutService) => void): { sideBar: boolean; auxBar: boolean } {
		const s = new SiblingStatusLayoutService();
		configure(s);
		return getFloatingSidebarSiblingToEditorStatus(s);
	}

	test('sibling-to-editor status across alignment and sidebar-position combinations', () => {
		const actual = {
			// center: neither bar is a sibling (both span full height)
			centerLeft: siblingStatus(s => { s.sideBarPosition = Position.LEFT; s.panelAlignment = 'center'; }),
			centerRight: siblingStatus(s => { s.sideBarPosition = Position.RIGHT; s.panelAlignment = 'center'; }),
			// justify: both bars are siblings (panel spans the full width)
			justifyLeft: siblingStatus(s => { s.sideBarPosition = Position.LEFT; s.panelAlignment = 'justify'; }),
			justifyRight: siblingStatus(s => { s.sideBarPosition = Position.RIGHT; s.panelAlignment = 'justify'; }),
			// left alignment, sidebar on LEFT: sidebar IS sibling, aux bar is NOT
			leftAlignSidebarLeft: siblingStatus(s => { s.sideBarPosition = Position.LEFT; s.panelAlignment = 'left'; }),
			// left alignment, sidebar on RIGHT: sidebar is NOT sibling, aux bar IS
			leftAlignSidebarRight: siblingStatus(s => { s.sideBarPosition = Position.RIGHT; s.panelAlignment = 'left'; }),
			// right alignment, sidebar on LEFT: sidebar is NOT sibling, aux bar IS
			rightAlignSidebarLeft: siblingStatus(s => { s.sideBarPosition = Position.LEFT; s.panelAlignment = 'right'; }),
			// right alignment, sidebar on RIGHT: sidebar IS sibling, aux bar is NOT
			rightAlignSidebarRight: siblingStatus(s => { s.sideBarPosition = Position.RIGHT; s.panelAlignment = 'right'; }),
		};

		assert.deepStrictEqual(actual, {
			centerLeft: { sideBar: false, auxBar: false },
			centerRight: { sideBar: false, auxBar: false },
			justifyLeft: { sideBar: true, auxBar: true },
			justifyRight: { sideBar: true, auxBar: true },
			leftAlignSidebarLeft: { sideBar: true, auxBar: false },
			leftAlignSidebarRight: { sideBar: false, auxBar: true },
			rightAlignSidebarLeft: { sideBar: false, auxBar: true },
			rightAlignSidebarRight: { sideBar: true, auxBar: false },
		});
	});
});

/**
 * The margins below must stay in step with `floatingPanels.css`; a mismatch shows up as a
 * card whose contents overflow or fall short of its own gap.
 */
class VerticalMarginLayoutService extends TestLayoutService {
	floatingPanelsEnabled = true;
	modernUICompact = false;
	panelPosition = Position.BOTTOM;
	panelAlignment: PanelAlignment = 'center';
	visibleParts = new Set<Parts>([Parts.TITLEBAR_PART, Parts.STATUSBAR_PART, Parts.EDITOR_PART]);

	override isFloatingPanelsEnabled(): boolean { return this.floatingPanelsEnabled; }
	override isModernUICompact(): boolean { return this.modernUICompact; }
	override getPanelPosition(): Position { return this.panelPosition; }
	override getPanelAlignment(): PanelAlignment { return this.panelAlignment; }
	override isVisible(part: Parts): boolean { return this.visibleParts.has(part); }
}

suite('LayoutService - getFloatingPaneCompositeVerticalMargins', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function margins(partId: Parts, configure: (service: VerticalMarginLayoutService) => void): { top: number; bottom: number } {
		const service = new VerticalMarginLayoutService();
		configure(service);
		return getFloatingPaneCompositeVerticalMargins(service, partId, mainWindow);
	}

	const inner = FLOATING_PANEL_INNER_MARGIN;
	const margin = FLOATING_PANEL_MARGIN;
	// The window-edge perimeter matches the inter-card gap at the default density.
	const outer = FLOATING_PANEL_MARGIN;

	test('bottom panel top margin across editor visibility and top edge', () => {
		const bottomPanel = (configure: (s: VerticalMarginLayoutService) => void) => margins(Parts.PANEL_PART, s => { s.visibleParts.add(Parts.PANEL_PART); configure(s); });
		const actual = {
			// Editor above the panel: the gap is between two cards.
			editorVisible: bottomPanel(() => { }),

			// Maximized panel (editor hidden) below a title bar: it takes over that row.
			maximizedUnderTitleBar: bottomPanel(s => { s.visibleParts.delete(Parts.EDITOR_PART); }),

			// Maximized panel with nothing above it: the top is now a window edge.
			maximizedAtTopEdge: bottomPanel(s => { s.visibleParts.delete(Parts.EDITOR_PART); s.visibleParts.delete(Parts.TITLEBAR_PART); }),

			// Maximized panel with a banner above it: still not a window edge.
			maximizedUnderBanner: bottomPanel(s => { s.visibleParts.delete(Parts.EDITOR_PART); s.visibleParts.delete(Parts.TITLEBAR_PART); s.visibleParts.add(Parts.BANNER_PART); }),
		};

		assert.deepStrictEqual(actual, {
			editorVisible: { top: margin, bottom: margin },
			maximizedUnderTitleBar: { top: inner, bottom: margin },
			maximizedAtTopEdge: { top: outer, bottom: margin },
			maximizedUnderBanner: { top: inner, bottom: margin },
		});
	});

	test('margins across panel positions', () => {
		const actual = {
			// Top panel: its bottom faces the editor, so it never reaches the window bottom.
			topPanelStatusBarHidden: margins(Parts.PANEL_PART, s => { s.panelPosition = Position.TOP; s.visibleParts.add(Parts.PANEL_PART); s.visibleParts.delete(Parts.STATUSBAR_PART); }),

			// Vertical panel: full height, so both edges are window edges.
			leftPanelAtBothEdges: margins(Parts.PANEL_PART, s => { s.panelPosition = Position.LEFT; s.visibleParts.add(Parts.PANEL_PART); s.visibleParts.delete(Parts.TITLEBAR_PART); s.visibleParts.delete(Parts.STATUSBAR_PART); }),

			// Side bar beside a top panel, center alignment: full height, so it starts at the top edge.
			sideBarTopPanelCentered: margins(Parts.SIDEBAR_PART, s => { s.panelPosition = Position.TOP; s.visibleParts.add(Parts.PANEL_PART); s.visibleParts.delete(Parts.TITLEBAR_PART); }),

			// Same but justified: the bar is a sibling, so its top faces the panel card.
			sideBarTopPanelJustified: margins(Parts.SIDEBAR_PART, s => { s.panelPosition = Position.TOP; s.panelAlignment = 'justify'; s.visibleParts.add(Parts.PANEL_PART); s.visibleParts.delete(Parts.TITLEBAR_PART); }),

			// Sibling bar above a bottom panel: its bottom faces the panel, not the window.
			sideBarBottomPanelJustified: margins(Parts.SIDEBAR_PART, s => { s.panelAlignment = 'justify'; s.visibleParts.add(Parts.PANEL_PART); s.visibleParts.delete(Parts.STATUSBAR_PART); }),

			// Full-height bar with the status bar hidden: it does reach the window bottom.
			sideBarBottomPanelCentered: margins(Parts.SIDEBAR_PART, s => { s.visibleParts.add(Parts.PANEL_PART); s.visibleParts.delete(Parts.STATUSBAR_PART); }),

			// Maximized top panel: the editor it normally faces is hidden, so the panel now owns
			// the cluster's bottom edge and takes the perimeter gutter there.
			topPanelMaximized: margins(Parts.PANEL_PART, s => { s.panelPosition = Position.TOP; s.visibleParts.add(Parts.PANEL_PART); s.visibleParts.delete(Parts.EDITOR_PART); s.visibleParts.delete(Parts.STATUSBAR_PART); }),

			// Experiment off: the parts are not cards at all.
			disabled: margins(Parts.SIDEBAR_PART, s => { s.floatingPanelsEnabled = false; s.visibleParts.clear(); }),
		};

		assert.deepStrictEqual(actual, {
			topPanelStatusBarHidden: { top: inner, bottom: inner },
			topPanelMaximized: { top: inner, bottom: outer },
			leftPanelAtBothEdges: { top: outer, bottom: outer },
			sideBarTopPanelCentered: { top: outer, bottom: margin },
			sideBarTopPanelJustified: { top: margin, bottom: margin },
			sideBarBottomPanelJustified: { top: inner, bottom: inner },
			sideBarBottomPanelCentered: { top: inner, bottom: outer },
			disabled: { top: 0, bottom: 0 },
		});
	});

	test('compact density keeps internal seams flush and reserves the outer cluster gutter', () => {
		assert.deepStrictEqual({
			atWindowEdges: margins(Parts.PANEL_PART, service => {
				service.modernUICompact = true;
				service.panelPosition = Position.LEFT;
				service.visibleParts.add(Parts.PANEL_PART);
				service.visibleParts.delete(Parts.TITLEBAR_PART);
				service.visibleParts.delete(Parts.STATUSBAR_PART);
			}),
			betweenTitleAndStatusBars: margins(Parts.PANEL_PART, service => {
				service.modernUICompact = true;
				service.panelPosition = Position.LEFT;
				service.visibleParts.add(Parts.PANEL_PART);
			}),
			betweenEditorAndStatusBar: margins(Parts.PANEL_PART, service => {
				service.modernUICompact = true;
				service.visibleParts.add(Parts.PANEL_PART);
			}),
		}, {
			atWindowEdges: { top: COMPACT_FLOATING_PANEL_OUTER_MARGIN, bottom: COMPACT_FLOATING_PANEL_OUTER_MARGIN },
			betweenTitleAndStatusBars: { top: FLOATING_PANEL_INNER_MARGIN, bottom: COMPACT_FLOATING_PANEL_OUTER_MARGIN },
			betweenEditorAndStatusBar: { top: COMPACT_FLOATING_PANEL_MARGIN, bottom: COMPACT_FLOATING_PANEL_OUTER_MARGIN },
		});
	});
});

suite('LayoutService - getFloatingEditorVerticalMargins', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function margins(configure: (service: VerticalMarginLayoutService) => void): { top: number; bottom: number } {
		const service = new VerticalMarginLayoutService();
		configure(service);
		return getFloatingEditorVerticalMargins(service, mainWindow);
	}

	const inner = FLOATING_PANEL_INNER_MARGIN;
	const margin = FLOATING_PANEL_MARGIN;
	// The window-edge perimeter matches the inter-card gap at the default density.
	const outer = FLOATING_PANEL_MARGIN;

	test('margins across panel positions, title bar, banner and status bar', () => {
		const actual = {
			// Windowed default: a title bar above and a status bar below.
			titleAndStatusBarVisible: margins(() => { }),

			// Native fullscreen: nothing above the editor.
			titleBarHidden: margins(s => { s.visibleParts.delete(Parts.TITLEBAR_PART); }),

			// A banner keeps the editor off the window edge.
			bannerInsteadOfTitleBar: margins(s => { s.visibleParts.delete(Parts.TITLEBAR_PART); s.visibleParts.add(Parts.BANNER_PART); }),

			// A top panel takes the place of the title bar, so the gap stays an inter-card one.
			topPanelAtTopEdge: margins(s => { s.panelPosition = Position.TOP; s.visibleParts.add(Parts.PANEL_PART); s.visibleParts.delete(Parts.TITLEBAR_PART); }),

			// Status bar hidden: the editor reaches the window bottom.
			statusBarHidden: margins(s => { s.visibleParts.delete(Parts.STATUSBAR_PART); }),

			// A bottom panel takes the place of the status bar.
			bottomPanelStatusBarHidden: margins(s => { s.visibleParts.add(Parts.PANEL_PART); s.visibleParts.delete(Parts.STATUSBAR_PART); }),

			// Experiment off.
			disabled: margins(s => { s.floatingPanelsEnabled = false; s.visibleParts.clear(); }),
		};

		assert.deepStrictEqual(actual, {
			titleAndStatusBarVisible: { top: inner, bottom: margin },
			titleBarHidden: { top: outer, bottom: margin },
			bannerInsteadOfTitleBar: { top: inner, bottom: margin },
			topPanelAtTopEdge: { top: margin, bottom: margin },
			statusBarHidden: { top: inner, bottom: outer },
			bottomPanelStatusBarHidden: { top: inner, bottom: inner },
			disabled: { top: 0, bottom: 0 },
		});
	});

	test('compact density attaches to title chrome and preserves the lower perimeter gutter', () => {
		assert.deepStrictEqual({
			betweenTitleAndStatusBars: margins(service => {
				service.modernUICompact = true;
			}),
			atWindowEdges: margins(service => {
				service.modernUICompact = true;
				service.visibleParts.delete(Parts.TITLEBAR_PART);
				service.visibleParts.delete(Parts.STATUSBAR_PART);
			}),
		}, {
			betweenTitleAndStatusBars: { top: FLOATING_PANEL_INNER_MARGIN, bottom: COMPACT_FLOATING_PANEL_OUTER_MARGIN },
			atWindowEdges: { top: COMPACT_FLOATING_PANEL_OUTER_MARGIN, bottom: COMPACT_FLOATING_PANEL_OUTER_MARGIN },
		});
	});
});
