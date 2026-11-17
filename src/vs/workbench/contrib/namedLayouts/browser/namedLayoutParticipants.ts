/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { equals } from '../../../../base/common/objects.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { isObject, isString } from '../../../../base/common/types.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { EditorGroupLayout, GroupLayoutArgument, GroupOrientation, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, isHorizontal, PanelAlignment, Parts, positionFromString, positionToString, SINGLE_WINDOW_PARTS } from '../../../services/layout/browser/layoutService.js';
import { ISharedLayoutStateService } from '../../../services/layout/common/sharedLayoutState.js';
import { INamedLayoutDefinition, INamedLayoutEditorGroupDefinition, INamedLayoutPanelDefinition, INamedLayoutPartDefinition, INamedLayoutParticipant, INamedLayoutViewContainerDefinition, INamedLayoutViewDefinition, NamedLayoutViewContainerLocation } from '../../../services/namedLayouts/common/namedLayouts.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';

interface IPaneCompositePartLayoutState {
	readonly visible: boolean;
	readonly size?: number;
	readonly activeViewContainer?: string;
}

interface IWorkbenchPartsLayoutState {
	readonly sideBar: IPaneCompositePartLayoutState;
	readonly panel: IPaneCompositePartLayoutState & { readonly position: string; readonly alignment: PanelAlignment; readonly maximized: boolean };
	readonly auxiliaryBar: IPaneCompositePartLayoutState & { readonly maximized: boolean };
	readonly editorCentered: boolean;
}

const PANEL_ALIGNMENTS: readonly PanelAlignment[] = ['left', 'center', 'right', 'justify'];

function isPaneCompositePartLayoutState(candidate: unknown): candidate is IPaneCompositePartLayoutState {
	const state = candidate as IPaneCompositePartLayoutState;
	return isObject(candidate)
		&& typeof state.visible === 'boolean'
		&& (state.size === undefined || typeof state.size === 'number')
		&& (state.activeViewContainer === undefined || typeof state.activeViewContainer === 'string');
}

function isWorkbenchPartsLayoutState(candidate: unknown): candidate is IWorkbenchPartsLayoutState {
	const state = candidate as IWorkbenchPartsLayoutState;
	return isObject(candidate)
		&& isPaneCompositePartLayoutState(state.sideBar)
		&& isPaneCompositePartLayoutState(state.panel)
		&& typeof state.panel.position === 'string'
		&& PANEL_ALIGNMENTS.includes(state.panel.alignment)
		&& typeof state.panel.maximized === 'boolean'
		&& isPaneCompositePartLayoutState(state.auxiliaryBar)
		&& typeof state.auxiliaryBar.maximized === 'boolean'
		&& typeof state.editorCentered === 'boolean';
}

function roundFraction(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * Merges the definition of a part onto the given state. Sizes of the definition
 * are fractions of the given size of the window.
 */
function toPartLayoutState(state: IPaneCompositePartLayoutState, definition: INamedLayoutPartDefinition | undefined, windowSize: number): IPaneCompositePartLayoutState {
	return {
		visible: definition?.visible ?? state.visible,
		size: definition?.size !== undefined ? Math.round(definition.size * windowSize) : state.size,
		activeViewContainer: definition?.activeViewContainer ?? state.activeViewContainer
	};
}

function toPartDefinition(state: IPaneCompositePartLayoutState, windowSize: number): INamedLayoutPartDefinition {
	return {
		visible: state.visible,
		...(state.size !== undefined && windowSize > 0 ? { size: roundFraction(state.size / windowSize) } : {}),
		...(state.activeViewContainer ? { activeViewContainer: state.activeViewContainer } : {})
	};
}

function toPanelPositionDefinition(position: string): INamedLayoutPanelDefinition['position'] {
	return position === 'top' || position === 'left' || position === 'right' ? position : 'bottom';
}

/**
 * Fires when sizes may have changed without an event: dragging a sash ends with
 * a mouse up in the window, and commands can resize parts and editor groups.
 */
function onDidResizeWithoutEvent(commandService: ICommandService): Event<unknown> {
	return Event.any<unknown>(Event.fromDOMEventEmitter(mainWindow, 'mouseup'), commandService.onDidExecuteCommand);
}

/**
 * Captures and applies the visibility, position, size and maximized state of
 * the side bar, the panel and the secondary side bar, the view container that
 * is active in each of them, and whether the editor layout is centered.
 *
 * The side bar position, the activity bar location and the visibility of the
 * status bar are settings and therefore part of the settings of a named layout.
 */
export class WorkbenchPartsLayoutParticipant implements INamedLayoutParticipant {

	readonly id = 'workbench.parts';

	readonly onDidChange: Event<unknown>;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IPaneCompositePartService private readonly paneCompositePartService: IPaneCompositePartService,
		@ICommandService commandService: ICommandService
	) {
		this.onDidChange = Event.any<unknown>(
			layoutService.onDidChangePartVisibility,
			layoutService.onDidChangePanelPosition,
			layoutService.onDidChangePanelAlignment,
			layoutService.onDidChangeAuxiliaryBarMaximized,
			layoutService.onDidChangeMainEditorCenteredLayout,
			layoutService.onDidLayoutMainContainer,
			paneCompositePartService.onDidPaneCompositeOpen,
			onDidResizeWithoutEvent(commandService)
		);
	}

	capture(): IWorkbenchPartsLayoutState {
		const panelPosition = this.layoutService.getPanelPosition();
		const panelMaximized = this.layoutService.isPanelMaximized();
		const auxiliaryBarMaximized = this.layoutService.isAuxiliaryBarMaximized();

		return {
			sideBar: this.capturePart(Parts.SIDEBAR_PART, ViewContainerLocation.Sidebar, false, false),
			panel: {
				...this.capturePart(Parts.PANEL_PART, ViewContainerLocation.Panel, isHorizontal(panelPosition), panelMaximized),
				position: positionToString(panelPosition),
				alignment: this.layoutService.getPanelAlignment(),
				maximized: panelMaximized
			},
			auxiliaryBar: {
				...this.capturePart(Parts.AUXILIARYBAR_PART, ViewContainerLocation.AuxiliaryBar, false, auxiliaryBarMaximized),
				maximized: auxiliaryBarMaximized
			},
			editorCentered: this.layoutService.isMainEditorLayoutCentered()
		};
	}

	async apply(state: unknown): Promise<void> {
		if (!isWorkbenchPartsLayoutState(state)) {
			return;
		}

		// Restore the regular size of the parts before arranging them
		this.unmaximizeParts();

		// Panel position and alignment. The alignment only applies to a horizontal panel
		const panelPosition = positionFromString(state.panel.position);
		if (this.layoutService.getPanelPosition() !== panelPosition) {
			this.layoutService.setPanelPosition(panelPosition);
		}
		if (isHorizontal(panelPosition) && this.layoutService.getPanelAlignment() !== state.panel.alignment) {
			this.layoutService.setPanelAlignment(state.panel.alignment);
		}

		// Visibility and active view container
		await this.applyPartVisibility(Parts.SIDEBAR_PART, ViewContainerLocation.Sidebar, state.sideBar);
		await this.applyPartVisibility(Parts.PANEL_PART, ViewContainerLocation.Panel, state.panel);
		await this.applyPartVisibility(Parts.AUXILIARYBAR_PART, ViewContainerLocation.AuxiliaryBar, state.auxiliaryBar);

		// Showing a part can maximize it automatically, for example
		// when `workbench.panel.opensMaximized` is `always`
		this.unmaximizeParts();

		// Sizes apply to the regular arrangement
		this.applyPartSize(Parts.SIDEBAR_PART, false, state.sideBar);
		this.applyPartSize(Parts.PANEL_PART, isHorizontal(panelPosition), state.panel);
		this.applyPartSize(Parts.AUXILIARYBAR_PART, false, state.auxiliaryBar);

		// Maximized parts
		if (state.panel.visible && state.panel.maximized) {
			this.layoutService.toggleMaximizedPanel();
		}
		if (state.auxiliaryBar.visible && state.auxiliaryBar.maximized) {
			this.layoutService.setAuxiliaryBarMaximized(true);
		}

		// Centered editor layout
		if (this.layoutService.isMainEditorLayoutCentered() !== state.editorCentered) {
			this.layoutService.centerMainEditorLayout(state.editorCentered);
		}
	}

	async applyDefinition(definition: INamedLayoutDefinition, defaultState: unknown): Promise<void> {
		const state = isWorkbenchPartsLayoutState(defaultState) ? defaultState : this.capture();
		const { width, height } = this.layoutService.mainContainerDimension;

		// The size of the panel of the default layout does not apply if the definition changes its orientation
		const panelPosition = definition.panel?.position ?? state.panel.position;
		const panelIsHorizontal = isHorizontal(positionFromString(panelPosition));
		const panelState = panelIsHorizontal === isHorizontal(positionFromString(state.panel.position)) ? state.panel : { ...state.panel, size: undefined };

		await this.apply({
			sideBar: toPartLayoutState(state.sideBar, definition.sideBar, width),
			panel: {
				...toPartLayoutState(panelState, definition.panel, panelIsHorizontal ? height : width),
				position: panelPosition,
				alignment: definition.panel?.alignment ?? state.panel.alignment,
				maximized: definition.panel?.maximized ?? state.panel.maximized
			},
			auxiliaryBar: {
				...toPartLayoutState(state.auxiliaryBar, definition.secondarySideBar, width),
				maximized: definition.secondarySideBar?.maximized ?? state.auxiliaryBar.maximized
			},
			editorCentered: definition.editor?.centered ?? state.editorCentered
		} satisfies IWorkbenchPartsLayoutState);
	}

	captureDefinition(): INamedLayoutDefinition {
		const state = this.capture();
		const { width, height } = this.layoutService.mainContainerDimension;
		const panelIsHorizontal = isHorizontal(positionFromString(state.panel.position));

		return {
			sideBar: toPartDefinition(state.sideBar, width),
			panel: {
				...toPartDefinition(state.panel, panelIsHorizontal ? height : width),
				position: toPanelPositionDefinition(state.panel.position),
				alignment: state.panel.alignment,
				maximized: state.panel.maximized
			},
			secondarySideBar: {
				...toPartDefinition(state.auxiliaryBar, width),
				maximized: state.auxiliaryBar.maximized
			},
			editor: { centered: state.editorCentered }
		};
	}

	private unmaximizeParts(): void {
		if (this.layoutService.isPanelMaximized()) {
			this.layoutService.toggleMaximizedPanel();
		}
		if (this.layoutService.isAuxiliaryBarMaximized()) {
			this.layoutService.setAuxiliaryBarMaximized(false);
		}
	}

	private capturePart(part: SINGLE_WINDOW_PARTS, location: ViewContainerLocation, sizeIsHeight: boolean, maximized: boolean): IPaneCompositePartLayoutState {
		const visible = this.layoutService.isVisible(part);
		const size = visible && !maximized ? this.layoutService.getSize(part) : undefined;

		return {
			visible,
			size: size ? (sizeIsHeight ? size.height : size.width) : undefined,
			activeViewContainer: this.paneCompositePartService.getActivePaneComposite(location)?.getId()
		};
	}

	private async applyPartVisibility(part: SINGLE_WINDOW_PARTS, location: ViewContainerLocation, state: IPaneCompositePartLayoutState): Promise<void> {
		this.layoutService.setPartHidden(!state.visible, part);
		if (!state.visible) {
			return;
		}

		// The view container may have been moved to another location or no longer exist
		const activeViewContainer = state.activeViewContainer;
		if (
			activeViewContainer &&
			this.paneCompositePartService.getActivePaneComposite(location)?.getId() !== activeViewContainer &&
			this.paneCompositePartService.getPaneComposite(activeViewContainer, location)
		) {
			await this.paneCompositePartService.openPaneComposite(activeViewContainer, location);
		}
	}

	private applyPartSize(part: SINGLE_WINDOW_PARTS, sizeIsHeight: boolean, state: IPaneCompositePartLayoutState): void {
		if (!state.visible || state.size === undefined) {
			return;
		}

		const currentSize = this.layoutService.getSize(part);
		this.layoutService.setSize(part, sizeIsHeight ? { width: currentSize.width, height: state.size } : { width: state.size, height: currentSize.height });
	}
}

function isSharedLayoutState(candidate: unknown): candidate is IStringDictionary<string | null> {
	return isObject(candidate) && Object.values(candidate).every(value => typeof value === 'string' || value === null);
}

/**
 * Whether the given value of the shared layout state only adds entries to the previous value.
 * The state of views and view containers is stored as lists of entries with identifiers. Views
 * and view containers that are registered later add entries with their initial state.
 */
function addsEntriesOnly(previousValue: string | null, value: string | null): boolean {
	const previousEntries = previousValue === null ? [] : parseEntries(previousValue);
	const entries = value === null ? undefined : parseEntries(value);
	if (!previousEntries || !entries) {
		return false;
	}

	const previousIds = new Set(previousEntries.map(entry => entry.id));
	return equals(entries.filter(entry => previousIds.has(entry.id)), previousEntries);
}

function parseEntries(value: string): { readonly id: string }[] | undefined {
	try {
		const entries: unknown = JSON.parse(value);
		return Array.isArray(entries) && entries.every(entry => isObject(entry) && isString((entry as { id?: unknown }).id)) ? entries : undefined;
	} catch {
		return undefined;
	}
}

const VIEW_CONTAINER_LOCATIONS: readonly (readonly [NamedLayoutViewContainerLocation, ViewContainerLocation])[] = [
	['sideBar', ViewContainerLocation.Sidebar],
	['panel', ViewContainerLocation.Panel],
	['secondarySideBar', ViewContainerLocation.AuxiliaryBar]
];

function toViewContainerLocation(location: NamedLayoutViewContainerLocation): ViewContainerLocation | undefined {
	return VIEW_CONTAINER_LOCATIONS.find(([name]) => name === location)?.[1];
}

/**
 * Returns the given identifiers sorted by the given order. The sort is stable,
 * identifiers without an order are placed last.
 */
function sortByOrder(ids: readonly string[], getOrder: (id: string) => number | undefined): string[] {
	return [...ids].sort((a, b) => (getOrder(a) ?? Number.MAX_VALUE) - (getOrder(b) ?? Number.MAX_VALUE));
}

/**
 * Captures and applies the layout state that the default layout shares with the
 * other windows of the profile: the location of view containers and views, the
 * view containers shown in the activity bar, the panel and the secondary side bar
 * and their order, and the visibility and order of the views in each view container.
 * While a named layout is active, this window uses a local copy of that state.
 *
 * Must be applied before {@link WorkbenchPartsLayoutParticipant}, so that the
 * active view containers it opens are in their locations.
 */
export class SharedLayoutStateParticipant implements INamedLayoutParticipant {

	readonly id = 'workbench.sharedLayoutState';

	readonly onDidChange: Event<unknown>;

	constructor(
		@ISharedLayoutStateService private readonly sharedLayoutStateService: ISharedLayoutStateService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IPaneCompositePartService private readonly paneCompositePartService: IPaneCompositePartService
	) {
		this.onDidChange = sharedLayoutStateService.onDidChange;
	}

	capture(): IStringDictionary<string | null> {
		return this.sharedLayoutStateService.getState();
	}

	hasChangedSince(state: unknown): boolean {
		if (!isSharedLayoutState(state)) {
			return true;
		}

		const sharedState = this.sharedLayoutStateService.getSharedState();
		return Object.entries(this.sharedLayoutStateService.getState()).some(([key, value]) => {
			// Keys that came into use later have their shared value until they are changed
			const previousValue = Object.hasOwn(state, key) ? state[key] : sharedState[key];
			return value !== previousValue && !addsEntriesOnly(previousValue, value);
		});
	}

	async apply(state: unknown): Promise<void> {
		if (isSharedLayoutState(state)) {
			this.sharedLayoutStateService.setLocalState(state);
		}
	}

	async applyDefault(): Promise<void> {
		this.sharedLayoutStateService.setLocalState(undefined);
	}

	async applyDefinition(definition: INamedLayoutDefinition): Promise<void> {
		// Start from a local copy of the state of the default layout
		this.sharedLayoutStateService.setLocalState(this.sharedLayoutStateService.getSharedState());

		this.applyViewContainerDefinitions(definition.viewContainers ?? {});
		this.applyViewDefinitions(definition.views ?? {});
	}

	captureDefinition(): INamedLayoutDefinition {
		const viewContainers: IStringDictionary<INamedLayoutViewContainerDefinition> = {};
		const views: IStringDictionary<INamedLayoutViewDefinition> = {};

		for (const [locationName, location] of VIEW_CONTAINER_LOCATIONS) {
			const locationViewContainers = this.viewDescriptorService.getViewContainersByLocation(location);
			const pinnedIds = this.paneCompositePartService.getPinnedPaneCompositeIds(location);
			const barIds = this.paneCompositePartService.getPaneCompositeIds(location).filter(id => locationViewContainers.some(viewContainer => viewContainer.id === id));

			// The order is only described if it differs from the order of the contributions
			const describeOrder = !equals(barIds, sortByOrder(barIds, id => locationViewContainers.find(viewContainer => viewContainer.id === id)?.order));

			for (const viewContainer of locationViewContainers) {
				const index = barIds.indexOf(viewContainer.id);
				const viewContainerDefinition: INamedLayoutViewContainerDefinition = {
					...(this.viewDescriptorService.getDefaultViewContainerLocation(viewContainer) !== location ? { location: locationName } : {}),
					...(index !== -1 && !pinnedIds.includes(viewContainer.id) ? { visible: false } : {}),
					...(index !== -1 && describeOrder ? { order: index + 1 } : {})
				};
				if (Object.keys(viewContainerDefinition).length) {
					viewContainers[viewContainer.id] = viewContainerDefinition;
				}

				this.captureViewDefinitions(viewContainer, views);
			}
		}

		return {
			...(Object.keys(viewContainers).length ? { viewContainers } : {}),
			...(Object.keys(views).length ? { views } : {})
		};
	}

	private captureViewDefinitions(viewContainer: ViewContainer, views: IStringDictionary<INamedLayoutViewDefinition>): void {
		// Views moved into another view container cannot be described
		const model = this.viewDescriptorService.getViewContainerModel(viewContainer);
		const viewDescriptors = model.allViewDescriptors.filter(viewDescriptor => this.viewDescriptorService.getDefaultContainerById(viewDescriptor.id) === viewContainer);
		const viewIds = viewDescriptors.map(viewDescriptor => viewDescriptor.id);
		const describeOrder = !equals(viewIds, sortByOrder(viewIds, id => viewDescriptors.find(viewDescriptor => viewDescriptor.id === id)?.order));

		viewDescriptors.forEach((viewDescriptor, index) => {
			const visible = model.isVisible(viewDescriptor.id);
			const isActive = model.activeViewDescriptors.includes(viewDescriptor);
			const viewDefinition: INamedLayoutViewDefinition = {
				...(viewDescriptor.canToggleVisibility && isActive && visible === !!viewDescriptor.hideByDefault ? { visible } : {}),
				...(describeOrder ? { order: index + 1 } : {})
			};
			if (Object.keys(viewDefinition).length) {
				views[viewDescriptor.id] = viewDefinition;
			}
		});
	}

	private applyViewContainerDefinitions(definitions: Readonly<IStringDictionary<INamedLayoutViewContainerDefinition>>): void {
		const entries: { viewContainer: ViewContainer; definition: INamedLayoutViewContainerDefinition }[] = [];
		for (const [id, definition] of Object.entries(definitions)) {
			const viewContainer = this.viewDescriptorService.getViewContainerById(id);
			if (viewContainer) {
				entries.push({ viewContainer, definition });
			}
		}

		for (const { viewContainer, definition } of entries) {
			const location = definition.location ? toViewContainerLocation(definition.location) : undefined;
			if (location !== undefined && this.viewDescriptorService.getViewContainerLocation(viewContainer) !== location) {
				this.viewDescriptorService.moveViewContainerToLocation(viewContainer, location, undefined, 'namedLayout');
			}
		}

		for (const [, location] of VIEW_CONTAINER_LOCATIONS) {
			const locationEntries = entries.filter(({ viewContainer }) => this.viewDescriptorService.getViewContainerLocation(viewContainer) === location);
			const pinned = new Map<string, boolean>();
			for (const { viewContainer, definition } of locationEntries) {
				if (definition.visible !== undefined) {
					pinned.set(viewContainer.id, definition.visible);
				}
			}
			const order = locationEntries
				.filter(({ definition }) => definition.order !== undefined)
				.sort((a, b) => a.definition.order! - b.definition.order!)
				.map(({ viewContainer }) => viewContainer.id);
			if (pinned.size || order.length) {
				this.paneCompositePartService.arrangePaneComposites(location, { pinned, order });
			}
		}
	}

	private applyViewDefinitions(definitions: Readonly<IStringDictionary<INamedLayoutViewDefinition>>): void {
		const entriesByViewContainer = new Map<ViewContainer, { id: string; definition: INamedLayoutViewDefinition }[]>();
		for (const [id, definition] of Object.entries(definitions)) {
			const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
			if (viewContainer) {
				const entries = entriesByViewContainer.get(viewContainer) ?? [];
				entries.push({ id, definition });
				entriesByViewContainer.set(viewContainer, entries);
			}
		}

		for (const [viewContainer, entries] of entriesByViewContainer) {
			const model = this.viewDescriptorService.getViewContainerModel(viewContainer);
			const knownEntries = entries.filter(({ id }) => model.allViewDescriptors.some(viewDescriptor => viewDescriptor.id === id));

			for (const { id, definition } of knownEntries) {
				if (definition.visible !== undefined) {
					model.setVisible(id, definition.visible);
				}
			}

			// Place the views with an order first, the other views keep their order
			const orderedIds = knownEntries
				.filter(({ definition }) => definition.order !== undefined)
				.sort((a, b) => a.definition.order! - b.definition.order!)
				.map(({ id }) => id);
			orderedIds.forEach((id, index) => {
				const viewDescriptorAtIndex = model.allViewDescriptors[index];
				if (viewDescriptorAtIndex.id !== id) {
					model.move(id, viewDescriptorAtIndex.id);
				}
			});
		}
	}
}

function isGroupLayoutArguments(candidate: unknown): candidate is GroupLayoutArgument[] {
	return Array.isArray(candidate) && candidate.length > 0 && candidate.every(group =>
		isObject(group)
		&& ((group as GroupLayoutArgument).size === undefined || typeof (group as GroupLayoutArgument).size === 'number')
		&& ((group as GroupLayoutArgument).groups === undefined || isGroupLayoutArguments((group as GroupLayoutArgument).groups))
	);
}

function isEditorGroupLayout(candidate: unknown): candidate is EditorGroupLayout {
	const layout = candidate as EditorGroupLayout;
	return isObject(candidate)
		&& (layout.orientation === GroupOrientation.HORIZONTAL || layout.orientation === GroupOrientation.VERTICAL)
		&& isGroupLayoutArguments(layout.groups);
}

/**
 * Captures and applies the arrangement of the editor groups of the main editor
 * part. Open editors are kept: if a layout has fewer groups, editors are merged
 * into the remaining groups.
 */
export class EditorGroupsLayoutParticipant implements INamedLayoutParticipant {

	readonly id = 'workbench.editorGroups';

	readonly onDidChange: Event<unknown>;

	constructor(
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ICommandService commandService: ICommandService
	) {
		const mainPart = editorGroupsService.mainPart;
		this.onDidChange = Event.any<unknown>(
			mainPart.onDidAddGroup,
			mainPart.onDidRemoveGroup,
			mainPart.onDidMoveGroup,
			mainPart.onDidChangeGroupMaximized,
			mainPart.onDidLayout,
			onDidResizeWithoutEvent(commandService)
		);
	}

	capture(): EditorGroupLayout {
		return this.editorGroupsService.mainPart.getLayout();
	}

	hasChangedSince(state: unknown): boolean {
		// The sizes of the groups are pixels, resizing the window changes them but not their proportions
		const layout = this.capture();
		return !isEditorGroupLayout(state) || layout.orientation !== state.orientation || !haveSameProportions(layout.groups, state.groups);
	}

	async apply(state: unknown): Promise<void> {
		if (!isEditorGroupLayout(state) || equals(this.editorGroupsService.mainPart.getLayout(), state)) {
			return;
		}

		this.editorGroupsService.mainPart.applyLayout(state);
	}

	async applyDefinition(definition: INamedLayoutDefinition, defaultState: unknown): Promise<void> {
		const { orientation, groups } = definition.editor ?? {};
		if (orientation === undefined && !groups?.length) {
			await this.apply(defaultState);
			return;
		}

		const state = isEditorGroupLayout(defaultState) ? defaultState : this.capture();
		await this.apply({
			orientation: orientation === 'vertical' ? GroupOrientation.VERTICAL : orientation === 'horizontal' ? GroupOrientation.HORIZONTAL : state.orientation,
			groups: groups?.length ? toGroupLayoutArguments(groups) : state.groups
		} satisfies EditorGroupLayout);
	}

	captureDefinition(): INamedLayoutDefinition {
		const layout = this.capture();
		return {
			editor: {
				orientation: layout.orientation === GroupOrientation.VERTICAL ? 'vertical' : 'horizontal',
				groups: toEditorGroupDefinitions(layout.groups)
			}
		};
	}
}

/**
 * Converts the sizes of the groups into fractions of the size of their level.
 */
function toEditorGroupDefinitions(groups: readonly GroupLayoutArgument[]): INamedLayoutEditorGroupDefinition[] {
	const totalSize = groups.reduce((sum, group) => sum + (group.size ?? 0), 0);
	return groups.map(group => ({
		...(group.size !== undefined && totalSize > 0 ? { size: roundFraction(group.size / totalSize) } : {}),
		...(group.groups ? { groups: toEditorGroupDefinitions(group.groups) } : {})
	}));
}

/**
 * The largest difference between two fractions of the size of a level that is not a
 * change. Sizes in pixels are rounded when the window is resized.
 */
const PROPORTION_TOLERANCE = 0.01;

/**
 * Whether the given groups are arranged alike and have the same sizes as fractions of their level.
 */
function haveSameProportions(groups: readonly GroupLayoutArgument[], otherGroups: readonly GroupLayoutArgument[]): boolean {
	if (groups.length !== otherGroups.length) {
		return false;
	}

	const totalSize = groups.reduce((sum, group) => sum + (group.size ?? 0), 0);
	const otherTotalSize = otherGroups.reduce((sum, group) => sum + (group.size ?? 0), 0);
	return groups.every((group, index) => {
		const other = otherGroups[index];
		const fraction = totalSize > 0 ? (group.size ?? 0) / totalSize : 0;
		const otherFraction = otherTotalSize > 0 ? (other.size ?? 0) / otherTotalSize : 0;
		if (Math.abs(fraction - otherFraction) > PROPORTION_TOLERANCE) {
			return false;
		}
		return group.groups?.length || other.groups?.length ? haveSameProportions(group.groups ?? [], other.groups ?? []) : true;
	});
}

function toGroupLayoutArguments(groups: readonly INamedLayoutEditorGroupDefinition[]): GroupLayoutArgument[] {
	return groups.map(group => ({
		...(group.size !== undefined ? { size: group.size } : {}),
		...(group.groups?.length ? { groups: toGroupLayoutArguments(group.groups) } : {})
	}));
}
