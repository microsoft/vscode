/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { timeout } from 'vs/base/common/async';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { FindReplaceState } from 'vs/editor/contrib/find/findState';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IShellLaunchConfig, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { IViewDescriptorService, IViewsService, ViewContainerLocation } from 'vs/workbench/common/views';
import { ITerminalFindHost, ITerminalGroup, ITerminalGroupService, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalGroup } from 'vs/workbench/contrib/terminal/browser/terminalGroup';
import { getInstanceFromResource } from 'vs/workbench/contrib/terminal/browser/terminalUri';
import { TerminalViewPane } from 'vs/workbench/contrib/terminal/browser/terminalView';
import { TERMINAL_VIEW_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';

export class TerminalGroupService extends Disposable implements ITerminalGroupService, ITerminalFindHost {
	declare _serviceBrand: undefined;

	groups: ITerminalGroup[] = [];
	activeGroupIndex: number = -1;
	get instances(): ITerminalInstance[] {
		return this.groups.reduce((p, c) => p.concat(c.terminalInstances), [] as ITerminalInstance[]);
	}

	private _terminalGroupCountContextKey: IContextKey<number>;
	private _terminalCountContextKey: IContextKey<number>;

	private _container: HTMLElement | undefined;

	private _findState: FindReplaceState;

	private readonly _onDidChangeActiveGroup = new Emitter<ITerminalGroup | undefined>();
	readonly onDidChangeActiveGroup = this._onDidChangeActiveGroup.event;
	private readonly _onDidDisposeGroup = new Emitter<ITerminalGroup>();
	readonly onDidDisposeGroup = this._onDidDisposeGroup.event;
	private readonly _onDidChangeGroups = new Emitter<void>();
	readonly onDidChangeGroups = this._onDidChangeGroups.event;

	private readonly _onDidDisposeInstance = new Emitter<ITerminalInstance>();
	readonly onDidDisposeInstance = this._onDidDisposeInstance.event;
	private readonly _onDidFocusInstance = new Emitter<ITerminalInstance>();
	readonly onDidFocusInstance = this._onDidFocusInstance.event;
	private readonly _onDidChangeActiveInstance = new Emitter<ITerminalInstance | undefined>();
	readonly onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
	private readonly _onDidChangeInstances = new Emitter<void>();
	readonly onDidChangeInstances = this._onDidChangeInstances.event;

	private readonly _onDidChangePanelOrientation = new Emitter<Orientation>();
	readonly onDidChangePanelOrientation = this._onDidChangePanelOrientation.event;

	constructor(
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IWorkbenchLayoutService private _layoutService: IWorkbenchLayoutService,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this.onDidDisposeGroup(group => this._removeGroup(group));

		this._terminalGroupCountContextKey = TerminalContextKeys.groupCount.bindTo(this._contextKeyService);
		this._terminalCountContextKey = TerminalContextKeys.count.bindTo(this._contextKeyService);

		this.onDidChangeGroups(() => this._terminalGroupCountContextKey.set(this.groups.length));
		this.onDidChangeInstances(() => this._terminalCountContextKey.set(this.instances.length));

		this._findState = new FindReplaceState();
	}

	hidePanel(): void {
		// Hide the panel if the terminal is in the panel and it has no sibling views
		const location = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
		if (location === ViewContainerLocation.Panel) {
			const panel = this._viewDescriptorService.getViewContainerByViewId(TERMINAL_VIEW_ID);
			if (panel && this._viewDescriptorService.getViewContainerModel(panel).activeViewDescriptors.length === 1) {
				this._layoutService.setPartHidden(true, Parts.PANEL_PART);
				TerminalContextKeys.tabsMouse.bindTo(this._contextKeyService).set(false);
			}
		}
	}

	showTabs() {
		this._configurationService.updateValue(TerminalSettingId.TabsEnabled, true);
	}

	get activeGroup(): ITerminalGroup | undefined {
		if (this.activeGroupIndex < 0 || this.activeGroupIndex >= this.groups.length) {
			return undefined;
		}
		return this.groups[this.activeGroupIndex];
	}
	set activeGroup(value: ITerminalGroup | undefined) {
		if (value === undefined) {
			// Setting to undefined is not possible, this can only be done when removing the last group
			return;
		}
		const index = this.groups.findIndex(e => e === value);
		this.setActiveGroupByIndex(index);
	}

	get activeInstance(): ITerminalInstance | undefined {
		return this.activeGroup?.activeInstance;
	}

	setActiveInstance(instance: ITerminalInstance) {
		this.setActiveInstanceByIndex(this._getIndexFromId(instance.instanceId));
	}

	private _getIndexFromId(terminalId: number): number {
		let terminalIndex = this.instances.findIndex(e => e.instanceId === terminalId);
		if (terminalIndex === -1) {
			throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
		}
		return terminalIndex;
	}

	setContainer(container: HTMLElement) {
		this._container = container;
		this.groups.forEach(group => group.attachToElement(container));
	}

	async focusTabs(): Promise<void> {
		if (this.instances.length === 0) {
			return;
		}
		await this.showPanel(true);
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		pane?.terminalTabbedView?.focusTabs();
	}

	createGroup(slcOrInstance?: IShellLaunchConfig | ITerminalInstance): ITerminalGroup {
		const group = this._instantiationService.createInstance(TerminalGroup, this._container, slcOrInstance);
		// TODO: Move panel orientation change into this file so it's not fired many times
		group.onPanelOrientationChanged((orientation) => this._onDidChangePanelOrientation.fire(orientation));
		this.groups.push(group);
		group.addDisposable(group.onDidDisposeInstance(this._onDidDisposeInstance.fire, this._onDidDisposeInstance));
		group.addDisposable(group.onDidFocusInstance(this._onDidFocusInstance.fire, this._onDidFocusInstance));
		group.addDisposable(group.onDidChangeActiveInstance(e => {
			if (group === this.activeGroup) {
				this._onDidChangeActiveInstance.fire(e);
			}
		}));
		group.addDisposable(group.onInstancesChanged(this._onDidChangeInstances.fire, this._onDidChangeInstances));
		group.addDisposable(group.onDisposed(this._onDidDisposeGroup.fire, this._onDidDisposeGroup));
		if (group.terminalInstances.length > 0) {
			this._onDidChangeInstances.fire();
		}
		if (this.instances.length === 1) {
			// It's the first instance so it should be made active automatically, this must fire
			// after onInstancesChanged so consumers can react to the instance being added first
			this.setActiveInstanceByIndex(0);
		}
		this._onDidChangeGroups.fire();
		return group;
	}

	async showPanel(focus?: boolean): Promise<void> {
		const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID)
			?? await this._viewsService.openView(TERMINAL_VIEW_ID, focus);
		pane?.setExpanded(true);

		if (focus) {
			// Do the focus call asynchronously as going through the
			// command palette will force editor focus
			await timeout(0);
			const instance = this.activeInstance;
			if (instance) {
				await instance.focusWhenReady(true);
			}
		}
	}

	getInstanceFromResource(resource: URI | undefined): ITerminalInstance | undefined {
		return getInstanceFromResource(this.instances, resource);
	}

	findNext(): void {
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		if (pane?.terminalTabbedView) {
			pane.terminalTabbedView.showFindWidget();
			pane.terminalTabbedView.getFindWidget().find(false);
		}
	}

	findPrevious(): void {
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		if (pane?.terminalTabbedView) {
			pane.terminalTabbedView.showFindWidget();
			pane.terminalTabbedView.getFindWidget().find(true);
		}
	}

	getFindState(): FindReplaceState {
		return this._findState;
	}

	async focusFindWidget(): Promise<void> {
		await this.showPanel(false);
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		pane?.terminalTabbedView?.focusFindWidget();
	}

	hideFindWidget(): void {
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		pane?.terminalTabbedView?.hideFindWidget();
	}

	private _removeGroup(group: ITerminalGroup) {
		// Get the index of the group and remove it from the list
		const activeGroup = this.activeGroup;
		const wasActiveGroup = group === activeGroup;
		const index = this.groups.indexOf(group);
		if (index !== -1) {
			this.groups.splice(index, 1);
			this._onDidChangeGroups.fire();
		}

		// Adjust focus if the group was active
		if (wasActiveGroup && this.groups.length > 0) {
			const newIndex = index < this.groups.length ? index : this.groups.length - 1;
			this.setActiveGroupByIndex(newIndex, true);
			this.activeInstance?.focus(true);
		} else if (this.activeGroupIndex >= this.groups.length) {
			const newIndex = this.groups.length - 1;
			this.setActiveGroupByIndex(newIndex);
		}

		this._onDidChangeInstances.fire();
		this._onDidChangeGroups.fire();
		if (wasActiveGroup) {
			this._onDidChangeActiveGroup.fire(this.activeGroup);
			this._onDidChangeActiveInstance.fire(this.activeInstance);
		}
	}

	/**
	 * @param force Whether to force the group change, this should be used when the previous active
	 * group has been removed.
	 */
	setActiveGroupByIndex(index: number, force?: boolean) {
		// Unset active group when the last group is removed
		if (index === -1 && this.groups.length === 0) {
			if (this.activeGroupIndex !== -1) {
				this.activeGroupIndex = -1;
				this._onDidChangeActiveGroup.fire(this.activeGroup);
				this._onDidChangeActiveInstance.fire(this.activeInstance);
			}
			return;
		}

		// Ensure index is valid
		if (index < 0 || index >= this.groups.length) {
			return;
		}

		// Fire group/instance change if needed
		const oldActiveGroup = this.activeGroup;
		this.activeGroupIndex = index;
		if (force || oldActiveGroup !== this.activeGroup) {
			this.groups.forEach((g, i) => g.setVisible(i === this.activeGroupIndex));
			this._onDidChangeActiveGroup.fire(this.activeGroup);
			this._onDidChangeActiveInstance.fire(this.activeInstance);
		}
	}

	private _getInstanceLocation(index: number): IInstanceLocation | undefined {
		let currentGroupIndex = 0;
		while (index >= 0 && currentGroupIndex < this.groups.length) {
			const group = this.groups[currentGroupIndex];
			const count = group.terminalInstances.length;
			if (index < count) {
				return {
					group,
					groupIndex: currentGroupIndex,
					instance: group.terminalInstances[index],
					instanceIndex: index
				};
			}
			index -= count;
			currentGroupIndex++;
		}
		return undefined;
	}

	setActiveInstanceByIndex(index: number) {
		const activeInstance = this.activeInstance;
		const instanceLocation = this._getInstanceLocation(index);
		const newActiveInstance = instanceLocation?.group.terminalInstances[instanceLocation.instanceIndex];
		if (!instanceLocation || activeInstance === newActiveInstance) {
			return;
		}

		const activeInstanceIndex = instanceLocation.instanceIndex;

		this.activeGroupIndex = instanceLocation.groupIndex;
		this._onDidChangeActiveGroup.fire(this.activeGroup);
		instanceLocation.group.setActiveInstanceByIndex(activeInstanceIndex, true);
		this.groups.forEach((g, i) => g.setVisible(i === instanceLocation.groupIndex));

	}

	setActiveGroupToNext() {
		if (this.groups.length <= 1) {
			return;
		}
		let newIndex = this.activeGroupIndex + 1;
		if (newIndex >= this.groups.length) {
			newIndex = 0;
		}
		this.setActiveGroupByIndex(newIndex);
	}

	setActiveGroupToPrevious() {
		if (this.groups.length <= 1) {
			return;
		}
		let newIndex = this.activeGroupIndex - 1;
		if (newIndex < 0) {
			newIndex = this.groups.length - 1;
		}
		this.setActiveGroupByIndex(newIndex);
	}

	moveGroup(source: ITerminalInstance, target: ITerminalInstance) {
		const sourceGroup = this.getGroupForInstance(source);
		const targetGroup = this.getGroupForInstance(target);

		// Something went wrong
		if (!sourceGroup || !targetGroup) {
			return;
		}

		// The groups are the same, rearrange within the group
		if (sourceGroup === targetGroup) {
			const index = sourceGroup.terminalInstances.indexOf(target);
			if (index !== -1) {
				sourceGroup.moveInstance(source, index);
			}
			return;
		}

		// The groups differ, rearrange groups
		const sourceGroupIndex = this.groups.indexOf(sourceGroup);
		const targetGroupIndex = this.groups.indexOf(targetGroup);
		this.groups.splice(sourceGroupIndex, 1);
		this.groups.splice(targetGroupIndex, 0, sourceGroup);
		this._onDidChangeInstances.fire();
	}

	moveGroupToEnd(source: ITerminalInstance): void {
		const sourceGroup = this.getGroupForInstance(source);
		if (!sourceGroup) {
			return;
		}
		const sourceGroupIndex = this.groups.indexOf(sourceGroup);
		this.groups.splice(sourceGroupIndex, 1);
		this.groups.push(sourceGroup);
		this._onDidChangeInstances.fire();
	}

	moveInstance(source: ITerminalInstance, target: ITerminalInstance, side: 'before' | 'after') {
		const sourceGroup = this.getGroupForInstance(source);
		const targetGroup = this.getGroupForInstance(target);
		if (!sourceGroup || !targetGroup) {
			return;
		}

		// Move from the source group to the target group
		if (sourceGroup !== targetGroup) {
			// Move groups
			sourceGroup.removeInstance(source);
			targetGroup.addInstance(source);
		}

		// Rearrange within the target group
		const index = targetGroup.terminalInstances.indexOf(target) + (side === 'after' ? 1 : 0);
		targetGroup.moveInstance(source, index);
	}

	unsplitInstance(instance: ITerminalInstance) {
		const oldGroup = this.getGroupForInstance(instance);
		if (!oldGroup || oldGroup.terminalInstances.length < 2) {
			return;
		}

		oldGroup.removeInstance(instance);
		this.createGroup(instance);
	}

	joinInstances(instances: ITerminalInstance[]) {
		const group = this.getGroupForInstance(instances[0]);
		if (group) {
			let differentGroups = true;
			for (let i = 1; i < group.terminalInstances.length; i++) {
				if (group.terminalInstances.includes(instances[i])) {
					differentGroups = false;
					break;
				}
			}
			if (!differentGroups) {
				return;
			}
		}
		// Find the group of the first instance that is the only instance in the group, if one exists
		let candidateInstance: ITerminalInstance | undefined = undefined;
		let candidateGroup: ITerminalGroup | undefined = undefined;
		for (const instance of instances) {
			const group = this.getGroupForInstance(instance);
			if (group?.terminalInstances.length === 1) {
				candidateInstance = instance;
				candidateGroup = group;
				break;
			}
		}

		// Create a new group if needed
		if (!candidateGroup) {
			candidateGroup = this.createGroup();
		}

		const wasActiveGroup = this.activeGroup === candidateGroup;

		// Unsplit all other instances and add them to the new group
		for (const instance of instances) {
			if (instance === candidateInstance) {
				continue;
			}

			const oldGroup = this.getGroupForInstance(instance);
			if (!oldGroup) {
				// Something went wrong, don't join this one
				continue;
			}
			oldGroup.removeInstance(instance);
			candidateGroup.addInstance(instance);
		}

		// Set the active terminal
		this.setActiveInstance(instances[0]);

		// Fire events
		this._onDidChangeInstances.fire();
		if (!wasActiveGroup) {
			this._onDidChangeActiveGroup.fire(this.activeGroup);
		}
	}

	instanceIsSplit(instance: ITerminalInstance): boolean {
		const group = this.getGroupForInstance(instance);
		if (!group) {
			return false;
		}
		return group.terminalInstances.length > 1;
	}

	getGroupForInstance(instance: ITerminalInstance): ITerminalGroup | undefined {
		return this.groups.find(group => group.terminalInstances.indexOf(instance) !== -1);
	}

	getGroupLabels(): string[] {
		return this.groups.filter(group => group.terminalInstances.length > 0).map((group, index) => {
			return `${index + 1}: ${group.title ? group.title : ''}`;
		});
	}
}

interface IInstanceLocation {
	group: ITerminalGroup,
	groupIndex: number,
	instance: ITerminalInstance,
	instanceIndex: number
}
