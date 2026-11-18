/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IViewContainerModel, IViewDescriptor, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { IWorkbenchLayoutService, PanelAlignment, Parts, Position } from '../../../../services/layout/browser/layoutService.js';
import { ISharedLayoutStateService } from '../../../../services/layout/common/sharedLayoutState.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { mock } from '../../../../test/common/workbenchTestServices.js';
import { SharedLayoutStateParticipant, WorkbenchPartsLayoutParticipant } from '../../browser/namedLayoutParticipants.js';

class TestLayoutService extends mock<IWorkbenchLayoutService>() {

	readonly visibleParts = new Set<Parts>([Parts.SIDEBAR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART]);
	private nonMaximizedVisibleParts: Set<Parts> | undefined;
	panelAlignment: PanelAlignment = 'center';

	override readonly mainContainerDimension = { width: 1000, height: 800 };

	override isVisible(part: Parts): boolean { return this.visibleParts.has(part); }
	override setPartHidden(hidden: boolean, part: Parts): void {
		if (hidden) {
			this.visibleParts.delete(part);
		} else {
			this.visibleParts.add(part);
		}
	}
	override isVisibleWhenAuxiliaryBarNotMaximized(part: Parts.SIDEBAR_PART | Parts.PANEL_PART): boolean { return (this.nonMaximizedVisibleParts ?? this.visibleParts).has(part); }
	override isAuxiliaryBarMaximized(): boolean { return !!this.nonMaximizedVisibleParts; }
	override setAuxiliaryBarMaximized(maximized: boolean): boolean {
		if (maximized === this.isAuxiliaryBarMaximized()) {
			return false;
		}
		const visibleParts = maximized ? [Parts.AUXILIARYBAR_PART] : [...this.nonMaximizedVisibleParts!];
		this.nonMaximizedVisibleParts = maximized ? new Set(this.visibleParts) : undefined;
		this.visibleParts.clear();
		visibleParts.forEach(part => this.visibleParts.add(part));
		return true;
	}
	override isPanelMaximized(): boolean { return false; }
	override getPanelPosition(): Position { return Position.BOTTOM; }
	override getPanelAlignment(): PanelAlignment { return this.panelAlignment; }
	override setPanelAlignment(alignment: PanelAlignment): void { this.panelAlignment = alignment; }
	override isMainEditorLayoutCentered(): boolean { return false; }
	override getSize(): { width: number; height: number } { return { width: 300, height: 200 }; }
	override setSize(): void { }
}

suite('NamedLayoutParticipants', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function aWorkbenchPartsLayoutParticipant(layoutService: TestLayoutService): WorkbenchPartsLayoutParticipant {
		const paneCompositePartService = new class extends mock<IPaneCompositePartService>() {
			override getActivePaneComposite() { return undefined; }
			override getLastActivePaneCompositeId(location: ViewContainerLocation) { return location === ViewContainerLocation.Sidebar ? 'explorer' : 'terminal'; }
			override getPaneComposite() { return undefined; }
		};
		const commandService = new class extends mock<ICommandService>() { override readonly onDidExecuteCommand = Event.None; };
		return new WorkbenchPartsLayoutParticipant(layoutService, paneCompositePartService, commandService);
	}

	test('the side bar and the panel that a maximized secondary side bar hides are visible again when it is restored', async () => {
		const layoutService = new TestLayoutService();
		layoutService.setAuxiliaryBarMaximized(true);
		const testObject = aWorkbenchPartsLayoutParticipant(layoutService);
		const state = testObject.capture();

		// Another layout shows no parts
		layoutService.setAuxiliaryBarMaximized(false);
		layoutService.visibleParts.clear();

		await testObject.apply(state);
		const maximized = layoutService.isAuxiliaryBarMaximized();
		layoutService.setAuxiliaryBarMaximized(false);

		assert.deepStrictEqual({ state, maximized, restoredParts: [...layoutService.visibleParts].sort() }, {
			state: {
				sideBar: { visible: true, size: undefined, activeViewContainer: 'explorer' },
				panel: { visible: true, size: undefined, activeViewContainer: 'terminal', position: 'bottom', maximized: false },
				auxiliaryBar: { visible: true, size: undefined, activeViewContainer: undefined, maximized: true },
				editorCentered: false
			},
			maximized: true,
			restoredParts: [Parts.AUXILIARYBAR_PART, Parts.PANEL_PART, Parts.SIDEBAR_PART].sort()
		});
	});

	test('the panel alignment of a saved state is not applied, the one of a definition is', async () => {
		const layoutService = new TestLayoutService();
		const testObject = aWorkbenchPartsLayoutParticipant(layoutService);
		const state = testObject.capture();

		// The alignment of the shared layout state that the window uses
		layoutService.panelAlignment = 'left';
		await testObject.apply(state);
		const appliedState = layoutService.getPanelAlignment();

		await testObject.applyDefinition({ panel: { alignment: 'justify' } }, state);

		assert.deepStrictEqual({ appliedState, appliedDefinition: layoutService.getPanelAlignment(), capturedDefinition: testObject.captureDefinition().panel?.alignment }, {
			appliedState: 'left',
			appliedDefinition: 'justify',
			capturedDefinition: 'justify'
		});
	});
	test('the description of view containers and views specifies values that are the defaults of their contributions', () => {
		const createViewContainer = (id: string) => new class extends mock<ViewContainer>() { override readonly id = id; };
		const createView = (id: string) => new class extends mock<IViewDescriptor>() { override readonly id = id; override readonly canToggleVisibility = true; };
		const explorer = createViewContainer('explorer');
		const search = createViewContainer('search');
		const outline = createView('outline');
		const timeline = createView('timeline');
		const createModel = (viewDescriptors: IViewDescriptor[], visibleIds: string[]) => new class extends mock<IViewContainerModel>() {
			override readonly allViewDescriptors = viewDescriptors;
			override readonly activeViewDescriptors = viewDescriptors;
			override isVisible(id: string) { return visibleIds.includes(id); }
		};
		const explorerModel = createModel([outline, timeline], [outline.id]);
		const searchModel = createModel([], []);
		const viewDescriptorService = new class extends mock<IViewDescriptorService>() {
			override getViewContainersByLocation(location: ViewContainerLocation) { return location === ViewContainerLocation.Sidebar ? [explorer, search] : []; }
			override getViewContainerModel(viewContainer: ViewContainer) { return viewContainer === explorer ? explorerModel : searchModel; }
			override getDefaultContainerById() { return explorer; }
		};
		// The pinned view containers and their order are the defaults of their contributions
		const paneCompositePartService = new class extends mock<IPaneCompositePartService>() {
			override getPinnedPaneCompositeIds() { return [explorer.id]; }
			override getPaneCompositeIds() { return [explorer.id, search.id]; }
		};
		const sharedLayoutStateService = new class extends mock<ISharedLayoutStateService>() { override readonly onDidChange = Event.None; };

		const testObject = new SharedLayoutStateParticipant(sharedLayoutStateService, viewDescriptorService, paneCompositePartService);

		assert.deepStrictEqual(testObject.captureDefinition(), {
			viewContainers: {
				explorer: { location: 'sideBar', visible: true, order: 1 },
				search: { location: 'sideBar', visible: false, order: 2 }
			},
			views: {
				outline: { visible: true, order: 1 },
				timeline: { visible: false, order: 2 }
			}
		});
	});
});
