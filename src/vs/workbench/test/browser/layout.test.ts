/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ISerializableView, SerializableGrid } from '../../../base/browser/ui/grid/grid.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { Layout } from '../../browser/layout.js';
import { Part } from '../../browser/part.js';
import { IPartToggleWindowResize, PartToggleWindowResizeController } from '../../browser/partToggleWindowResize.js';
import { IViewDescriptorService } from '../../common/views.js';
import { isHorizontal, Parts, Position, positionToString } from '../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../services/panecomposite/browser/panecomposite.js';

suite('Layout - panel move window resizing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const editorSize = { width: 700, height: 500 };
	const panelWidth = 350;
	const panelHeight = 200;

	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Test setup needs access to private fields. */
	function setup(position: Position, hidden = true, canResize = true) {
		const requests: IPartToggleWindowResize[] = [];
		const values = new Map<string, string | boolean | number | object>([
			['panel.position', position],
			['panel.hidden', hidden],
			['panel.lastNonMaximizedWidth', panelWidth],
			['panel.lastNonMaximizedHeight', panelHeight],
			['auxiliaryBar.hidden', false]
		]);
		const layout = store.add(new class extends Layout {
			override hasFocus(): boolean { return false; }
		}(document.createElement('div')));
		layout['stateModel'] = new class extends mock<Layout['stateModel']>() {
			override getRuntimeValue<T extends string | boolean | number | object>(key: { name: string; defaultValue: T }): T {
				return (values.get(key.name) ?? key.defaultValue) as T;
			}
			override setRuntimeValue<T extends string | boolean | number | object>(key: { name: string }, value: T): void {
				values.set(key.name, value);
			}
		};
		layout['configurationService'] = new TestConfigurationService({ workbench: { panel: { opensMaximized: 'never' } } });
		layout['canResizeWindowToKeepEditorSize'] = () => canResize;
		layout['adjustPartPositions'] = () => { };
		layout['paneCompositeService'] = new class extends mock<IPaneCompositePartService>() {
			override getActivePaneComposite() { return undefined; }
			override getLastActivePaneCompositeId() { return ''; }
		};
		layout['viewDescriptorService'] = new class extends mock<IViewDescriptorService>() {
			override getViewContainersByLocation() { return []; }
		};
		for (const part of [Parts.EDITOR_PART, Parts.PANEL_PART, Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART]) {
			const container = document.createElement('div');
			layout['parts'].set(part, new class extends mock<Part>() {
				override minimumWidth = 50;
				override minimumHeight = 50;
				override maximumWidth = Infinity;
				override maximumHeight = Infinity;
				override getContainer() { return container; }
				override updateStyles() { }
				override toJSON() { return {}; }
			});
		}
		layout['editorPartView'] = layout['parts'].get(Parts.EDITOR_PART)!;
		layout['panelPartView'] = layout['parts'].get(Parts.PANEL_PART)!;
		layout['sideBarPartView'] = layout['parts'].get(Parts.SIDEBAR_PART)!;
		layout['auxiliaryBarPartView'] = layout['parts'].get(Parts.AUXILIARYBAR_PART)!;
		layout['workbenchGrid'] = new class extends mock<SerializableGrid<ISerializableView>>() {
			override getViewSize(view?: ISerializableView) {
				if (view === layout['editorPartView']) {
					return editorSize;
				}
				if (view === layout['panelPartView']) {
					return { width: panelWidth, height: panelHeight };
				}
				return { width: 150, height: 500 };
			}
			override getViewCachedVisibleSize() { return isHorizontal(position) ? panelHeight : panelWidth; }
			override setViewVisible() { }
			override moveView() { }
			override resizeView() { }
		};
		layout['partToggleWindowResizeController'] = new class extends mock<PartToggleWindowResizeController>() {
			override async resize(request: IPartToggleWindowResize) { requests.push(request); }
		};
		return { layout, requests };
	}
	/* eslint-enable local/code-no-bracket-notation-for-identifiers */

	test('panel visibility changes before grid initialization are ignored', () => {
		const layout = store.add(new class extends Layout { }(document.createElement('div')));
		assert.doesNotThrow(() => layout.setPartHidden(false, Parts.PANEL_PART));
	});

	for (const from of [Position.LEFT, Position.RIGHT, Position.TOP, Position.BOTTOM]) {
		for (const to of [Position.LEFT, Position.RIGHT, Position.TOP, Position.BOTTOM]) {
			test(`showing a hidden panel from ${positionToString(from)} at ${positionToString(to)} uses the destination`, () => {
				const { layout, requests } = setup(from);
				layout.setPanelPosition(to);
				const horizontal = isHorizontal(to);
				assert.deepStrictEqual(
					{ position: layout.getPanelPosition(), visible: layout.isVisible(Parts.PANEL_PART), requests },
					{
						position: to,
						visible: true,
						requests: [{
							part: Parts.PANEL_PART,
							editorSize,
							delta: { width: horizontal ? 0 : panelWidth, height: horizontal ? panelHeight : 0 },
							anchor: { right: to === Position.LEFT, bottom: to === Position.TOP },
							partSizes: [
								{ part: Parts.SIDEBAR_PART, size: 150, horizontal: false },
								{ part: Parts.AUXILIARYBAR_PART, size: 150, horizontal: false },
								{ part: Parts.PANEL_PART, size: horizontal ? panelHeight : panelWidth, horizontal }
							]
						}]
					}
				);
			});
		}
	}

	test('moving a visible panel does not resize the window', () => {
		const { layout, requests } = setup(Position.BOTTOM, false);
		layout.setPanelPosition(Position.RIGHT);
		assert.deepStrictEqual({ position: layout.getPanelPosition(), requests }, { position: Position.RIGHT, requests: [] });
	});

	test('moving a hidden panel does not resize when window resizing is disabled', () => {
		const { layout, requests } = setup(Position.BOTTOM, true, false);
		layout.setPanelPosition(Position.RIGHT);
		assert.deepStrictEqual(
			{ position: layout.getPanelPosition(), visible: layout.isVisible(Parts.PANEL_PART), requests },
			{ position: Position.RIGHT, visible: true, requests: [] }
		);
	});
});
