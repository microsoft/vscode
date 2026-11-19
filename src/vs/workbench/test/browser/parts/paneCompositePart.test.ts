/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, append } from '../../../../base/browser/dom.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { toAction } from '../../../../base/common/actions.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { timeout } from '../../../../base/common/async.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { PanelPart } from '../../../browser/parts/panel/panelPart.js';
import { CompositeBar } from '../../../browser/parts/compositeBar.js';
import { CompositeBarAction } from '../../../browser/parts/compositeBarActions.js';
import { IWorkbenchLayoutService, LayoutSettings, Parts, Position } from '../../../services/layout/browser/layoutService.js';
import { TestLayoutService, workbenchInstantiationService } from '../workbenchTestServices.js';

class TestPaneCompositeLayoutService extends TestLayoutService {

	floatingPanelsEnabled = false;
	modernUICompact = false;
	panelPosition = Position.BOTTOM;

	private readonly visibleParts = new Set<Parts>([
		Parts.EDITOR_PART,
		Parts.PANEL_PART,
		Parts.STATUSBAR_PART,
	]);

	constructor(private readonly container: HTMLElement) {
		super();
		this.mainContainer = container;
		this.activeContainer = container;
		this.containers = [container];
	}

	override isFloatingPanelsEnabled(): boolean { return this.floatingPanelsEnabled; }
	override isModernUICompact(): boolean { return this.modernUICompact; }
	override getPanelPosition(): Position { return this.panelPosition; }
	override isVisible(part: Parts): boolean { return this.visibleParts.has(part); }
	override getContainer(): HTMLElement { return this.container; }

	setPanelVisible(visible: boolean): void {
		if (visible) {
			this.visibleParts.add(Parts.PANEL_PART);
		} else {
			this.visibleParts.delete(Parts.PANEL_PART);
		}
	}
}

class TestViewDescriptorService extends mock<IViewDescriptorService>() {
	override readonly onDidChangeViewContainers = Event.None;
	override readonly onDidChangeContainerLocation = Event.None;

	override canMoveViews(): boolean {
		return false;
	}

	override getDefaultViewContainer(_location: ViewContainerLocation) {
		return undefined;
	}

	override getViewContainersByLocation(_location: ViewContainerLocation) {
		return [];
	}

	override getViewContainerById() {
		return null;
	}

	override getViewContainerBadgeEnablementState(): boolean {
		return true;
	}
}

class TestPanelPart extends PanelPart {

	floatingBorderWidth = 1;

	protected override getFloatingBorderWidth(): number {
		return this.floatingBorderWidth;
	}

	get floatingContentDimension() {
		return assertReturnsDefined(this.contentDimension);
	}
}

suite('Pane composite part layout', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('remeasures pane tabs after appearance changes and cancels pending measurements on disposal', async () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		store.add(toDisposable(() => root.remove()));
		const container = append(root, $('.part.panel'));
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkbenchLayoutService, new TestPaneCompositeLayoutService(root));
		instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
		instantiationService.stub(IConfigurationService, configurationService);
		const part = store.add(instantiationService.createInstance(TestPanelPart));
		part.create(container);
		part.layout(300, 200, 0, 0);
		await timeout(0);

		const measuredStates: boolean[] = [];
		sinon.stub(CompositeBar.prototype, 'recomputeSizes').callsFake(() => {
			measuredStates.push(root.classList.contains('modern-ui-connected-editor-tabs'));
		});
		const changeConfiguration = (key: string) => configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(setting: string): boolean {
				return setting === key;
			}
		});

		changeConfiguration(LayoutSettings.MODERN_UI_EDITOR_TAB_STYLE);
		assert.deepStrictEqual(measuredStates, []);
		root.classList.add('modern-ui-connected-editor-tabs');
		await timeout(0);
		changeConfiguration('workbench.panel.showLabels');
		await timeout(0);
		changeConfiguration(LayoutSettings.MODERN_UI);
		changeConfiguration(LayoutSettings.MODERN_UI_EDITOR_TAB_STYLE);
		root.classList.remove('modern-ui-connected-editor-tabs');
		await timeout(0);
		changeConfiguration(LayoutSettings.MODERN_UI_EDITOR_TAB_STYLE);
		part.dispose();
		await timeout(0);
		assert.deepStrictEqual(measuredStates, [true, false]);
	});

	test('remeasures changed hidden tabs on reopening before applying narrow overflow', async () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench.test-pane-appearance'));
		store.add(toDisposable(() => root.remove()));
		const style = append(root, $('style'));
		style.textContent = `
			.test-pane-appearance .composite-bar .action-item { box-sizing: border-box; width: 80px; flex-shrink: 0; }
			.test-pane-appearance.wider-tabs .composite-bar .action-item { width: 100px; }
		`;
		const container = append(root, $('.part.panel'));
		const layoutService = new TestPaneCompositeLayoutService(root);
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
		instantiationService.stub(IConfigurationService, configurationService);
		const actions = ['First', 'Second', 'Third'].map(label => store.add(new CompositeBarAction({ id: label, name: label })));
		const getAction = (id: string) => assertReturnsDefined(actions.find(action => action.id === id));
		const compositeBar = store.add(instantiationService.createInstance(CompositeBar, actions.map(action => ({
			id: action.id, name: action.label, pinned: true, visible: true,
		})), {
			icon: false,
			orientation: ActionsOrientation.HORIZONTAL,
			colors: () => ({}),
			compositeSize: 0,
			overflowActionSize: 44,
			dndHandler: { drop() { }, onDragOver: () => true, onDragEnter: () => true },
			activityHoverOptions: { position: () => HoverPosition.BELOW },
			getActivityAction: getAction,
			getCompositePinnedAction: id => toAction({ id, label: '', run: () => { } }),
			getCompositeBadgeAction: id => toAction({ id, label: '', run: () => { } }),
			getOnCompositeClickAction: getAction,
			fillExtraContextMenuActions: () => { },
			getContextMenuActionsForComposite: () => [],
			openComposite: async () => null,
			getDefaultCompositeId: () => undefined,
		}));
		instantiationService.stubInstance(CompositeBar, compositeBar);
		const part = store.add(instantiationService.createInstance(TestPanelPart));
		part.create(container);
		part.layout(400, 200, 0, 0);
		await timeout(0);
		const capture = () => ({
			tabs: Array.from(container.querySelectorAll<HTMLElement>('.composite-bar .action-item:not([aria-haspopup])')).map(item => ({
				label: item.textContent,
				width: item.getBoundingClientRect().width,
			})),
			overflow: container.querySelector('.composite-bar .action-item[aria-haspopup]') !== null,
		});
		const initial = capture();
		const recomputeSizes = sinon.spy(compositeBar, 'recomputeSizes');
		layoutService.setPanelVisible(false);
		container.style.display = 'none';
		root.classList.add('wider-tabs');
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(key: string): boolean {
				return key === LayoutSettings.MODERN_UI_EDITOR_TAB_STYLE;
			}
		});
		await timeout(0);
		const hiddenMeasurements = recomputeSizes.callCount;
		layoutService.setPanelVisible(true);
		container.style.display = '';
		part.layout(0, 0, 0, 0);
		const zeroSizeMeasurements = recomputeSizes.callCount;
		part.layout(300, 200, 0, 0);
		const reopenedNarrow = capture();
		part.layout(400, 200, 0, 0);
		const widened = capture();
		assert.deepStrictEqual({
			initial, reopenedNarrow, widened,
			measurements: { hidden: hiddenMeasurements, zeroSize: zeroSizeMeasurements, visible: recomputeSizes.callCount },
		}, {
			initial: { tabs: [{ label: 'First', width: 80 }, { label: 'Second', width: 80 }, { label: 'Third', width: 80 }], overflow: false },
			reopenedNarrow: { tabs: [{ label: 'First', width: 100 }, { label: 'Second', width: 100 }], overflow: true },
			widened: { tabs: [{ label: 'First', width: 100 }, { label: 'Second', width: 100 }, { label: 'Third', width: 100 }], overflow: false },
			measurements: { hidden: 0, zeroSize: 0, visible: 1 },
		});
	});

	test('preserves panel layout across classic and DPR 2.5 floating modes', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		store.add(toDisposable(() => root.remove()));
		const container = append(root, $('.part.panel'));
		const layoutService = new TestPaneCompositeLayoutService(root);
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());

		const part = store.add(instantiationService.createInstance(TestPanelPart));
		part.create(container);
		const devicePixelRatio = 2.5;
		part.floatingBorderWidth = Math.floor(devicePixelRatio) / devicePixelRatio;

		const captureState = () => ({
			height: part.element.style.height,
			contentDimension: {
				width: part.floatingContentDimension.width,
				height: part.floatingContentDimension.height,
			},
			outerEdges: {
				left: part.element.classList.contains('floating-part-outer-left'),
				right: part.element.classList.contains('floating-part-outer-right'),
				top: part.element.classList.contains('floating-part-outer-top'),
				bottom: part.element.classList.contains('floating-part-outer-bottom'),
			},
		});

		layoutService.panelPosition = Position.TOP;
		part.layout(300, 200, 0, 0);
		const classicTop = captureState();

		layoutService.panelPosition = Position.RIGHT;
		part.layout(300, 200, 0, 0);
		const classicRight = captureState();

		layoutService.panelPosition = Position.BOTTOM;
		part.layout(300, 200, 0, 0);
		const classicBottom = captureState();

		layoutService.floatingPanelsEnabled = true;
		part.layout(300, 200, 0, 0);
		const floatingDefault = captureState();

		layoutService.modernUICompact = true;
		part.layout(300, 200, 0, 0);
		const floatingCompact = captureState();

		layoutService.floatingPanelsEnabled = false;
		part.layout(300, 200, 0, 0);
		const restoredClassic = captureState();

		assert.deepStrictEqual({
			classicTop,
			classicRight,
			classicBottom,
			floatingDefault,
			floatingCompact,
			restoredClassic,
		}, {
			classicTop: {
				height: '',
				contentDimension: { width: 300, height: 199 },
				outerEdges: { left: false, right: false, top: false, bottom: false },
			},
			classicRight: {
				height: '',
				contentDimension: { width: 299, height: 200 },
				outerEdges: { left: false, right: false, top: false, bottom: false },
			},
			classicBottom: {
				height: '',
				contentDimension: { width: 300, height: 200 },
				outerEdges: { left: false, right: false, top: false, bottom: false },
			},
			floatingDefault: {
				height: 'calc(100% - 8px)',
				contentDimension: { width: 290.4, height: 190.4 },
				outerEdges: { left: true, right: true, top: false, bottom: true },
			},
			floatingCompact: {
				height: 'calc(100% + 0px)',
				contentDimension: { width: 298.4, height: 198.4 },
				outerEdges: { left: true, right: true, top: false, bottom: true },
			},
			restoredClassic: {
				height: '',
				contentDimension: { width: 300, height: 200 },
				outerEdges: { left: false, right: false, top: false, bottom: false },
			},
		});
	});
});
