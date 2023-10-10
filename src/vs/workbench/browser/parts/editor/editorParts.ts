/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorGroupLayout, GroupDirection, GroupOrientation, GroupsArrangement, GroupsOrder, IAuxiliaryEditorPart, IEditorDropTargetDelegate, IEditorGroupsService, IEditorSideGroup, IFindGroupScope, IMergeGroupOptions } from 'vs/workbench/services/editor/common/editorGroupsService';
import { Event, Emitter } from 'vs/base/common/event';
import { IDimension, getActiveDocument } from 'vs/base/browser/dom';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { GroupIdentifier, IEditorPartOptions } from 'vs/workbench/common/editor';
import { AuxiliaryEditorPart, EditorPart, MainEditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { IEditorGroupView, IEditorPartsView } from 'vs/workbench/browser/parts/editor/editor';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class EditorParts extends Disposable implements IEditorGroupsService, IEditorPartsView {

	declare readonly _serviceBrand: undefined;

	private readonly mainEditorPart = this._register(this.createMainEditorPart());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService
	) {
		super();

		this._register(this.registerEditorPart(this.mainEditorPart));
	}

	protected createMainEditorPart(): MainEditorPart {
		return this.instantiationService.createInstance(MainEditorPart, this);
	}

	//#region Auxiliary Editor Parts

	createAuxiliaryEditorPart(): IAuxiliaryEditorPart {
		const disposables = new DisposableStore();

		const auxiliaryWindow = disposables.add(this.auxiliaryWindowService.open());
		disposables.add(Event.once(auxiliaryWindow.onDidClose)(() => disposables.dispose()));

		const partContainer = document.createElement('div');
		partContainer.classList.add('part', 'editor');
		partContainer.setAttribute('role', 'main');
		auxiliaryWindow.container.appendChild(partContainer);

		const editorPart = disposables.add(this.instantiationService.createInstance(AuxiliaryEditorPart, this));
		disposables.add(this.registerEditorPart(editorPart));

		disposables.add(Event.once(editorPart.onDidClose)(() => disposables.dispose()));
		disposables.add(Event.once(this.lifecycleService.onDidShutdown)(() => disposables.dispose()));

		editorPart.create(partContainer, { restorePreviousState: false });
		disposables.add(auxiliaryWindow.onWillLayout(dimension => editorPart.layout(dimension.width, dimension.height, 0, 0)));

		auxiliaryWindow.layout();

		this._onDidAddGroup.fire(editorPart.activeGroup);

		return editorPart;
	}

	//#endregion

	//#region Registration

	private readonly parts = new Set<EditorPart>();

	private registerEditorPart(part: EditorPart): IDisposable {
		this.parts.add(part);

		const disposables = this._register(new DisposableStore());
		disposables.add(toDisposable(() => this.parts.delete(part)));

		this.registerEditorPartListeners(part, disposables);

		return disposables;
	}

	private registerEditorPartListeners(part: EditorPart, disposables: DisposableStore): void {
		disposables.add(part.onDidFocus(() => {
			if (this.parts.size > 1) {
				this._onDidActiveGroupChange.fire(this.activeGroup); // this can only happen when we have more than 1 editor part
			}
		}));

		disposables.add(part.onDidChangeActiveGroup(group => this._onDidActiveGroupChange.fire(group)));
		disposables.add(part.onDidAddGroup(group => this._onDidAddGroup.fire(group)));
		disposables.add(part.onDidRemoveGroup(group => this._onDidRemoveGroup.fire(group)));
		disposables.add(part.onDidMoveGroup(group => this._onDidMoveGroup.fire(group)));
		disposables.add(part.onDidActivateGroup(group => this._onDidActivateGroup.fire(group)));

		disposables.add(part.onDidLayout(dimension => this._onDidLayout.fire(dimension)));
		disposables.add(part.onDidScroll(() => this._onDidScroll.fire()));

		disposables.add(part.onDidChangeGroupIndex(group => this._onDidChangeGroupIndex.fire(group)));
		disposables.add(part.onDidChangeGroupLocked(group => this._onDidChangeGroupLocked.fire(group)));
	}

	//#endregion

	//#region Helpers

	get activePart(): EditorPart {
		return this.getPartByDocument(getActiveDocument());
	}

	private getPartByDocument(document: Document): EditorPart {
		if (this.parts.size > 1) {
			for (const part of this.parts) {
				if (part.element?.ownerDocument === document) {
					return part;
				}
			}
		}

		return this.mainEditorPart;
	}

	private getPart(group: IEditorGroupView | GroupIdentifier): EditorPart;
	private getPart(element: HTMLElement): EditorPart;
	private getPart(groupOrElement: IEditorGroupView | GroupIdentifier | HTMLElement): EditorPart {
		if (this.parts.size > 1) {
			if (groupOrElement instanceof HTMLElement) {
				const element = groupOrElement;

				return this.getPartByDocument(element.ownerDocument);
			} else {
				const group = groupOrElement;

				let id: GroupIdentifier;
				if (typeof group === 'number') {
					id = group;
				} else {
					id = group.id;
				}

				for (const part of this.parts) {
					if (part.hasGroup(id)) {
						return part;
					}
				}
			}
		}

		return this.mainEditorPart;
	}

	//#endregion

	//#region Events

	private readonly _onDidActiveGroupChange = this._register(new Emitter<IEditorGroupView>());
	readonly onDidChangeActiveGroup = this._onDidActiveGroupChange.event;

	private readonly _onDidAddGroup = this._register(new Emitter<IEditorGroupView>());
	readonly onDidAddGroup = this._onDidAddGroup.event;

	private readonly _onDidRemoveGroup = this._register(new Emitter<IEditorGroupView>());
	readonly onDidRemoveGroup = this._onDidRemoveGroup.event;

	private readonly _onDidMoveGroup = this._register(new Emitter<IEditorGroupView>());
	readonly onDidMoveGroup = this._onDidMoveGroup.event;

	private readonly _onDidActivateGroup = this._register(new Emitter<IEditorGroupView>());
	readonly onDidActivateGroup = this._onDidActivateGroup.event;

	private readonly _onDidLayout = this._register(new Emitter<IDimension>());
	readonly onDidLayout = this._onDidLayout.event;

	private readonly _onDidScroll = this._register(new Emitter<void>());
	readonly onDidScroll = this._onDidScroll.event;

	private readonly _onDidChangeGroupIndex = this._register(new Emitter<IEditorGroupView>());
	readonly onDidChangeGroupIndex = this._onDidChangeGroupIndex.event;

	private readonly _onDidChangeGroupLocked = this._register(new Emitter<IEditorGroupView>());
	readonly onDidChangeGroupLocked = this._onDidChangeGroupLocked.event;

	//#endregion

	//#region Editor Groups Service

	get activeGroup(): IEditorGroupView {
		return this.activePart.activeGroup;
	}

	get sideGroup(): IEditorSideGroup {
		return this.activePart.sideGroup;
	}

	get groups(): IEditorGroupView[] {
		return this.getGroups();
	}

	get count(): number {
		return this.groups.length;
	}

	getGroups(order = GroupsOrder.CREATION_TIME): IEditorGroupView[] {
		if (this.parts.size > 1) {
			// TODO@bpasero support non-creation-time group orders across parts
			return [...this.parts].map(part => part.getGroups(order)).flat();
		}

		return this.mainEditorPart.getGroups(order);
	}

	getGroup(identifier: GroupIdentifier): IEditorGroupView | undefined {
		for (const part of this.parts) {
			const group = part.getGroup(identifier);
			if (group) {
				return group;
			}
		}

		return undefined;
	}

	activateGroup(group: IEditorGroupView | GroupIdentifier): IEditorGroupView {
		return this.getPart(group).activateGroup(group);
	}

	getSize(group: IEditorGroupView | GroupIdentifier): { width: number; height: number } {
		return this.getPart(group).getSize(group);
	}

	setSize(group: IEditorGroupView | GroupIdentifier, size: { width: number; height: number }): void {
		return this.getPart(group).setSize(group, size);
	}

	arrangeGroups(arrangement: GroupsArrangement): void {
		return this.activePart.arrangeGroups(arrangement);
	}

	restoreGroup(group: IEditorGroupView | GroupIdentifier): IEditorGroupView {
		return this.getPart(group).restoreGroup(group);
	}

	applyLayout(layout: EditorGroupLayout): void {
		return this.activePart.applyLayout(layout);
	}

	getLayout(): EditorGroupLayout {
		return this.activePart.getLayout();
	}

	centerLayout(active: boolean): void {
		return this.activePart.centerLayout(active);
	}

	isLayoutCentered(): boolean {
		return this.activePart.isLayoutCentered();
	}

	get orientation() {
		return this.activePart.orientation;
	}

	setGroupOrientation(orientation: GroupOrientation): void {
		return this.activePart.setGroupOrientation(orientation);
	}

	findGroup(scope: IFindGroupScope, source?: IEditorGroupView | GroupIdentifier, wrap?: boolean): IEditorGroupView | undefined {
		if (source) {
			return this.getPart(source).findGroup(scope, source, wrap);
		}

		return this.activePart.findGroup(scope, source, wrap);
	}

	addGroup(location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		return this.getPart(location).addGroup(location, direction);
	}

	removeGroup(group: IEditorGroupView | GroupIdentifier): void {
		return this.getPart(group).removeGroup(group);
	}

	moveGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		return this.getPart(group).moveGroup(group, location, direction);
	}

	mergeGroup(group: IEditorGroupView | GroupIdentifier, target: IEditorGroupView | GroupIdentifier, options?: IMergeGroupOptions): IEditorGroupView {
		return this.getPart(group).mergeGroup(group, target, options);
	}

	mergeAllGroups(): IEditorGroupView {
		return this.activePart.mergeAllGroups();
	}

	copyGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView {
		return this.getPart(group).copyGroup(group, location, direction);
	}

	createEditorDropTarget(container: HTMLElement, delegate: IEditorDropTargetDelegate): IDisposable {
		return this.getPart(container).createEditorDropTarget(container, delegate);
	}

	//#endregion

	//#region TODO@bpasero TO BE INVESTIGATED

	get onDidVisibilityChange() { return this.mainEditorPart.onDidVisibilityChange; }

	get contentDimension() { return this.mainEditorPart.contentDimension; }
	get partOptions() { return this.mainEditorPart.partOptions; }
	get onDidChangeEditorPartOptions() { return this.mainEditorPart.onDidChangeEditorPartOptions; }

	enforcePartOptions(options: IEditorPartOptions): IDisposable {
		return this.mainEditorPart.enforcePartOptions(options);
	}

	//#endregion

	//#region Main Editor Part Only

	get isReady() { return this.mainEditorPart.isReady; }
	get whenReady() { return this.mainEditorPart.whenReady; }
	get whenRestored() { return this.mainEditorPart.whenRestored; }
	get hasRestorableState() { return this.mainEditorPart.hasRestorableState; }

	//#endregion
}

registerSingleton(IEditorGroupsService, EditorParts, InstantiationType.Eager);
