/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getFloatingOuterEdgeOwners, Parts, Position } from '../../browser/layoutService.js';
import { TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';

suite('LayoutService - getFloatingOuterEdgeOwners', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	class ConfigurableLayoutService extends TestLayoutService {
		floatingPanelsEnabled = true;
		sideBarPosition = Position.LEFT;
		panelPosition = Position.BOTTOM;
		visibleParts = new Set<Parts>();

		override isFloatingPanelsEnabled(): boolean { return this.floatingPanelsEnabled; }
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

			// Default full layout (side bar left): activity bar hugs the left edge (no owner),
			// the secondary side bar owns the right edge.
			defaultFull: owners(s => { s.visibleParts = new Set([Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]); }),

			// Maximized aux bar with the activity bar in its default (visible) position: the
			// activity bar still hugs the left edge, the aux bar owns the right edge.
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
			defaultFull: { left: undefined, right: Parts.AUXILIARYBAR_PART },
			maximizedAuxWithActivityBar: { left: undefined, right: Parts.AUXILIARYBAR_PART },
			maximizedAuxNoActivityBar: { left: Parts.AUXILIARYBAR_PART, right: Parts.AUXILIARYBAR_PART },
			maximizedAuxNoActivityBarSideBarRight: { left: Parts.AUXILIARYBAR_PART, right: Parts.AUXILIARYBAR_PART },
			editorOnly: { left: Parts.EDITOR_PART, right: Parts.EDITOR_PART },
			verticalPanelFull: { left: undefined, right: Parts.AUXILIARYBAR_PART },
			maximizedVerticalPanel: { left: Parts.PANEL_PART, right: Parts.PANEL_PART },
			horizontalPanelVisible: { left: Parts.SIDEBAR_PART, right: Parts.AUXILIARYBAR_PART },
		});
	});
});
