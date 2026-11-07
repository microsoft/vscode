/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { PanelPart } from '../../../browser/parts/panel/panelPart.js';
import { SidebarPart } from '../../../browser/parts/sidebar/sidebarPart.js';
import { AuxiliaryBarPart } from '../../../browser/parts/auxiliarybar/auxiliaryBarPart.js';
import { IWorkbenchLayoutService, Parts, Position } from '../../../services/layout/browser/layoutService.js';
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

suite('Pane composite part fonts', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const partType of [SidebarPart, AuxiliaryBarPart, PanelPart]) {
		test(`side bar fonts: ${partType.name} applies, updates and resets content fonts`, async () => {
			const root = append(mainWindow.document.body, $('.monaco-workbench'));
			store.add(toDisposable(() => root.remove()));
			const container = append(root, $('.part'));
			const configurationService = new TestConfigurationService({
				'workbench.sideBar.fontFamily': 'monospace',
				'workbench.sideBar.fontSize': 14,
			});
			store.add(configurationService.onDidChangeConfigurationEmitter);
			const instantiationService = workbenchInstantiationService(undefined, store);
			instantiationService.stub(IWorkbenchLayoutService, new TestPaneCompositeLayoutService(root));
			instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
			instantiationService.stub(IConfigurationService, configurationService);
			const part = store.add(partType === SidebarPart ? instantiationService.createInstance(SidebarPart)
				: partType === AuxiliaryBarPart ? instantiationService.createInstance(AuxiliaryBarPart)
					: instantiationService.createInstance(PanelPart));
			part.create(container);
			const content = assertReturnsDefined(container.querySelector<HTMLElement>(':scope > .content'));
			const label = append(content, $('span'));
			label.textContent = 'example.ts';
			const capture = () => ({
				family: content.style.fontFamily,
				size: content.style.fontSize,
				inheritedFamily: mainWindow.getComputedStyle(label).fontFamily,
				inheritedSize: mainWindow.getComputedStyle(label).fontSize,
			});
			const initial = capture();
			const update = async (family: string, size: number) => {
				await configurationService.setUserConfiguration('workbench.sideBar.fontFamily', family);
				await configurationService.setUserConfiguration('workbench.sideBar.fontSize', size);
				configurationService.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.USER,
					affectedKeys: new Set(['workbench.sideBar.fontFamily', 'workbench.sideBar.fontSize']),
					change: { keys: ['workbench.sideBar.fontFamily', 'workbench.sideBar.fontSize'], overrides: [] },
					affectsConfiguration: key => key.startsWith('workbench.sideBar.font'),
				});
			};
			await update('serif', 16);
			const updated = capture();
			await update('serif', 100);
			const upperBound = content.style.fontSize;
			await update('serif', 0);
			const lowerBound = content.style.fontSize;
			await update('', 13);
			const reset = { family: content.style.fontFamily, size: content.style.fontSize };
			if (partType === PanelPart) {
				assert.deepStrictEqual({ initial, updated, upperBound, lowerBound, reset }, {
					initial: { family: '', size: '', inheritedFamily: initial.inheritedFamily, inheritedSize: initial.inheritedSize },
					updated: { family: '', size: '', inheritedFamily: initial.inheritedFamily, inheritedSize: initial.inheritedSize },
					upperBound: '',
					lowerBound: '',
					reset: { family: '', size: '' },
				});
			} else {
				assert.deepStrictEqual({ initial, updated, upperBound, lowerBound, reset }, {
					initial: { family: 'monospace', size: '14px', inheritedFamily: 'monospace', inheritedSize: '14px' },
					updated: { family: 'serif', size: '16px', inheritedFamily: 'serif', inheritedSize: '16px' },
					upperBound: '16px',
					lowerBound: '9px',
					reset: { family: '', size: '' },
				});
			}
		});
	}

});

suite('Pane composite part layout', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
