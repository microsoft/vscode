/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/objects.js';
import { isObject } from '../../../../base/common/types.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { EditorGroupLayout, GroupLayoutArgument, GroupOrientation, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, isHorizontal, PanelAlignment, Parts, positionFromString, positionToString, SINGLE_WINDOW_PARTS } from '../../../services/layout/browser/layoutService.js';
import { INamedLayoutParticipant } from '../../../services/namedLayouts/common/namedLayouts.js';
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

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IPaneCompositePartService private readonly paneCompositePartService: IPaneCompositePartService
	) { }

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

	constructor(
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService
	) { }

	capture(): EditorGroupLayout {
		return this.editorGroupsService.mainPart.getLayout();
	}

	async apply(state: unknown): Promise<void> {
		if (!isEditorGroupLayout(state) || equals(this.editorGroupsService.mainPart.getLayout(), state)) {
			return;
		}

		this.editorGroupsService.mainPart.applyLayout(state);
	}
}
