/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IViewContainerModel, IViewDescriptor, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { EditorGroupLayout, GroupLayoutArgument, GroupOrientation, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, PanelAlignment, Parts, Position } from '../../../../services/layout/browser/layoutService.js';
import { ISharedLayoutStateService } from '../../../../services/layout/common/sharedLayoutState.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { mock } from '../../../../test/common/workbenchTestServices.js';
import { EditorGroupsLayoutParticipant, SharedLayoutStateParticipant, WorkbenchPartsLayoutParticipant } from '../../browser/namedLayoutParticipants.js';

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
	test('the description of view containers and views only specifies values that differ from the defaults of their contributions', () => {
		const createViewContainer = (id: string, order: number) => new class extends mock<ViewContainer>() { override readonly id = id; override readonly order = order; };
		const createView = (id: string, order: number, hideByDefault = false) => new class extends mock<IViewDescriptor>() { override readonly id = id; override readonly order = order; override readonly hideByDefault = hideByDefault; override readonly canToggleVisibility = true; };
		const explorer = createViewContainer('explorer', 0);
		const search = createViewContainer('search', 1);
		const chat = createViewContainer('chat', 100);
		const outline = createView('outline', 1);
		const timeline = createView('timeline', 2);
		const openEditors = createView('openEditors', 3, true);
		const chatView = createView('chatView', 1);
		const sessions = createView('sessions', 2);
		const createModel = (viewDescriptors: IViewDescriptor[], visibleIds: string[]) => new class extends mock<IViewContainerModel>() {
			override readonly allViewDescriptors = viewDescriptors;
			override readonly activeViewDescriptors = viewDescriptors;
			override isVisible(id: string) { return visibleIds.includes(id); }
		};
		// The views of the explorer have their default order, timeline is hidden and open editors hidden by default.
		// The user moved the sessions view before the chat view
		const models = new Map<ViewContainer, IViewContainerModel>([
			[explorer, createModel([outline, timeline, openEditors], [outline.id])],
			[search, createModel([], [])],
			[chat, createModel([sessions, chatView], [chatView.id, sessions.id])]
		]);
		const viewDescriptorService = new class extends mock<IViewDescriptorService>() {
			override getViewContainersByLocation(location: ViewContainerLocation) { return location === ViewContainerLocation.Sidebar ? [explorer, search, chat] : []; }
			override getViewContainerModel(viewContainer: ViewContainer) { return models.get(viewContainer)!; }
			override getDefaultViewContainerLocation(viewContainer: ViewContainer) { return viewContainer === chat ? ViewContainerLocation.AuxiliaryBar : ViewContainerLocation.Sidebar; }
			override getDefaultContainerById(id: string) { return id === chatView.id || id === sessions.id ? chat : explorer; }
		};
		// The user moved chat into the side bar before the explorer and unpinned search
		const paneCompositePartService = new class extends mock<IPaneCompositePartService>() {
			override getPinnedPaneCompositeIds(location: ViewContainerLocation) { return location === ViewContainerLocation.Sidebar ? [chat.id, explorer.id] : []; }
			override getPaneCompositeIds(location: ViewContainerLocation) { return location === ViewContainerLocation.Sidebar ? [chat.id, explorer.id, search.id] : []; }
		};
		const sharedLayoutStateService = new class extends mock<ISharedLayoutStateService>() { override readonly onDidChange = Event.None; };

		const testObject = new SharedLayoutStateParticipant(sharedLayoutStateService, viewDescriptorService, paneCompositePartService);

		assert.deepStrictEqual(testObject.captureDefinition(), {
			viewContainers: {
				chat: { location: 'sideBar', order: 1 },
				explorer: { order: 2 },
				search: { visible: false }
			},
			views: {
				timeline: { visible: false },
				sessions: { order: 1 },
				chatView: { order: 2 }
			}
		});
	});

	test('the description of the parts only specifies values that differ from those VS Code uses by default', () => {
		const layoutService = new TestLayoutService();
		layoutService.setPartHidden(true, Parts.PANEL_PART);
		const testObject = aWorkbenchPartsLayoutParticipant(layoutService);

		assert.deepStrictEqual(testObject.captureDefinition(), {
			sideBar: { visible: true, size: 0.3 },
			panel: { visible: false },
			secondarySideBar: { visible: true, size: 0.3 }
		});
	});

	test('the description of the editor groups is left out for a single editor group', () => {
		const describe = (groups: GroupLayoutArgument[]) => {
			const editorGroupsService = new class extends mock<IEditorGroupsService>() {
				override readonly mainPart = new class extends mock<IEditorPart>() {
					override readonly onDidAddGroup = Event.None;
					override readonly onDidRemoveGroup = Event.None;
					override readonly onDidMoveGroup = Event.None;
					override readonly onDidChangeGroupMaximized = Event.None;
					override readonly onDidLayout = Event.None;
					override getLayout(): EditorGroupLayout { return { orientation: GroupOrientation.HORIZONTAL, groups }; }
				};
			};
			const commandService = new class extends mock<ICommandService>() { override readonly onDidExecuteCommand = Event.None; };
			return new EditorGroupsLayoutParticipant(editorGroupsService, commandService).captureDefinition();
		};

		assert.deepStrictEqual({ single: describe([{ size: 800 }]), split: describe([{ size: 600 }, { size: 200 }]) }, {
			single: {},
			split: { editor: { orientation: 'horizontal', groups: [{ size: 0.75 }, { size: 0.25 }] } }
		});
	});
});
