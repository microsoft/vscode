/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IShellLaunchConfig } from '../../../../platform/terminal/common/terminal.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ITerminalGroup, ITerminalGroupService, ITerminalInstance } from './terminal.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { TerminalGroup } from './terminalGroup.js';
import { getInstanceFromResource } from './terminalUri.js';
import { TerminalViewPane } from './terminalView.js';
import { TERMINAL_VIEW_ID } from '../common/terminal.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { asArray } from '../../../../base/common/arrays.js';

export class TerminalGroupService extends Disposable implements ITerminalGroupService {
	declare _serviceBrand: undefined;

	groups: ITerminalGroup[] = [];
	activeGroupIndex: number = -1;
	get instances(): ITerminalInstance[] {
		return this.groups.reduce((p, c) => p.concat(c.terminalInstances), [] as ITerminalInstance[]);
	}

	lastAccessedMenu: 'inline-tab' | 'tab-list' = 'inline-tab';

	private _container: HTMLElement | undefined;

	private _isQuickInputOpened: boolean = false;

	private readonly _onDidChangeActiveGroup = this._register(new Emitter<ITerminalGroup | undefined>());
	readonly onDidChangeActiveGroup = this._onDidChangeActiveGroup.event;
	private readonly _onDidDisposeGroup = this._register(new Emitter<ITerminalGroup>());
	readonly onDidDisposeGroup = this._onDidDisposeGroup.event;
	private readonly _onDidChangeGroups = this._register(new Emitter<void>());
	readonly onDidChangeGroups = this._onDidChangeGroups.event;
	private readonly _onDidShow = this._register(new Emitter<void>());
	readonly onDidShow = this._onDidShow.event;

	private readonly _onDidDisposeInstance = this._register(new Emitter<ITerminalInstance>());
	readonly onDidDisposeInstance = this._onDidDisposeInstance.event;
	private readonly _onDidFocusInstance = this._register(new Emitter<ITerminalInstance>());
	readonly onDidFocusInstance = this._onDidFocusInstance.event;
	private readonly _onDidChangeActiveInstance = this._register(new Emitter<ITerminalInstance | undefined>());
	readonly onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
	private readonly _onDidChangeInstances = this._register(new Emitter<void>());
	readonly onDidChangeInstances = this._onDidChangeInstances.event;
	private readonly _onDidChangeInstanceCapability = this._register(new Emitter<ITerminalInstance>());
	readonly onDidChangeInstanceCapability = this._onDidChangeInstanceCapability.event;

	private readonly _onDidChangePanelOrientation = this._register(new Emitter<Orientation>());
	readonly onDidChangePanelOrientation = this._onDidChangePanelOrientation.event;

	constructor(
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService
	) {
		super();

		const terminalGroupCountContextKey = TerminalContextKeys.groupCount.bindTo(this._contextKeyService);
		this._register(Event.runAndSubscribe(this.onDidChangeGroups, () => terminalGroupCountContextKey.set(this.groups.length)));

		const splitTerminalActiveContextKey = TerminalContextKeys.splitTerminalActive.bindTo(this._contextKeyService);
		this._register(Event.runAndSubscribe(this.onDidFocusInstance, () => {
			const activeInstance = this.activeInstance;
			splitTerminalActiveContextKey.set(activeInstance ? this.instanceIsSplit(activeInstance) : false);
		}));

		this._register(this.onDidDisposeGroup(group => this._removeGroup(group)));
		this._register(Event.any(this.onDidChangeActiveGroup, this.onDidChangeInstances)(() => this.updateVisibility()));
		this._register(this._quickInputService.onShow(() => this._isQuickInputOpened = true));
		this._register(this._quickInputService.onHide(() => this._isQuickInputOpened = false));
	}

	hidePanel(): void {
		// Hide the panel if the terminal is in the panel and it has no sibling views
		const panel = this._viewDescriptorService.getViewContainerByViewId(TERMINAL_VIEW_ID);
		if (panel && this._viewDescriptorService.getViewContainerModel(panel).visibleViewDescriptors.length === 1) {
			this._viewsService.closeView(TERMINAL_VIEW_ID);
			TerminalContextKeys.tabsMouse.bindTo(this._contextKeyService).set(false);
		}
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
		const terminalIndex = this.instances.findIndex(e => e.instanceId === terminalId);
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

	async focusHover(): Promise<void> {
		if (this.instances.length === 0) {
			return;
		}

		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		pane?.terminalTabbedView?.focusHover();
	}

	async focusInstance(_: ITerminalInstance): Promise<void> {
		return this.showPanel(true);
	}

	async focusActiveInstance(): Promise<void> {
		return this.showPanel(true);
	}

	createGroup(slcOrInstance?: IShellLaunchConfig | ITerminalInstance): ITerminalGroup {
		const group = this._instantiationService.createInstance(TerminalGroup, this._container, slcOrInstance);
		this.groups.push(group);
		group.addDisposable(Event.forward(group.onPanelOrientationChanged, this._onDidChangePanelOrientation));
		group.addDisposable(Event.forward(group.onDidDisposeInstance, this._onDidDisposeInstance));
		group.addDisposable(Event.forward(group.onDidFocusInstance, this._onDidFocusInstance));
		group.addDisposable(Event.forward(group.onDidChangeInstanceCapability, this._onDidChangeInstanceCapability));
		group.addDisposable(Event.forward(group.onInstancesChanged, this._onDidChangeInstances));
		group.addDisposable(Event.forward(group.onDisposed, this._onDidDisposeGroup));
		group.addDisposable(group.onDidChangeActiveInstance(e => {
			if (group === this.activeGroup) {
				this._onDidChangeActiveInstance.fire(e);
			}
		}));
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
				// HACK: Ensure the panel is still visible at this point as there may have been
				// a request since it was opened to show a different panel
				if (pane && !pane.isVisible()) {
					await this._viewsService.openView(TERMINAL_VIEW_ID, focus);
				}
				await instance.focusWhenReady(true);
			}
		}
		this._onDidShow.fire();
	}

	getInstanceFromResource(resource: URI | undefined): ITerminalInstance | undefined {
		return getInstanceFromResource(this.instances, resource);
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

		if (wasActiveGroup) {
			// Adjust focus if the group was active
			if (this.groups.length > 0 && !this._isQuickInputOpened) {
				const newIndex = index < this.groups.length ? index : this.groups.length - 1;
				this.setActiveGroupByIndex(newIndex, true);
				if (group.hadFocusOnExit) {
					this.activeInstance?.focus(true);
				}
			}
		} else {
			// Adjust the active group if the removed group was above the active group
			if (this.activeGroupIndex > index) {
				this.setActiveGroupByIndex(this.activeGroupIndex - 1);
			}
		}
		// Ensure the active group is still valid, this should set the activeGroupIndex to -1 if
		// there are no groups
		if (this.activeGroupIndex >= this.groups.length) {
			this.setActiveGroupByIndex(this.groups.length - 1);
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

	private _getValidTerminalGroups = (sources: ITerminalInstance[]): Set<ITerminalGroup> => {
		return new Set(
			sources
				.map(source => this.getGroupForInstance(source))
				.filter((group) => group !== undefined)
		);
	};

	moveGroup(source: ITerminalInstance | ITerminalInstance[], target: ITerminalInstance) {
		source = asArray(source);
		const sourceGroups = this._getValidTerminalGroups(source);
		const targetGroup = this.getGroupForInstance(target);
		if (!targetGroup || sourceGroups.size === 0) {
			return;
		}

		// The groups are the same, rearrange within the group
		if (sourceGroups.size === 1 && sourceGroups.has(targetGroup)) {
			const targetIndex = targetGroup.terminalInstances.indexOf(target);
			const sortedSources = source.sort((a, b) => {
				return targetGroup.terminalInstances.indexOf(a) - targetGroup.terminalInstances.indexOf(b);
			});
			const firstTargetIndex = targetGroup.terminalInstances.indexOf(sortedSources[0]);
			const position: 'before' | 'after' = firstTargetIndex < targetIndex ? 'after' : 'before';
			targetGroup.moveInstance(sortedSources, targetIndex, position);
			this._onDidChangeInstances.fire();
			return;
		}

		// The groups differ, rearrange groups
		const targetGroupIndex = this.groups.indexOf(targetGroup);
		const sortedSourceGroups = Array.from(sourceGroups).sort((a, b) => {
			return this.groups.indexOf(a) - this.groups.indexOf(b);
		});
		const firstSourceGroupIndex = this.groups.indexOf(sortedSourceGroups[0]);
		const position: 'before' | 'after' = firstSourceGroupIndex < targetGroupIndex ? 'after' : 'before';
		const insertIndex = position === 'after' ? targetGroupIndex + 1 : targetGroupIndex;
		this.groups.splice(insertIndex, 0, ...sortedSourceGroups);
		for (const sourceGroup of sortedSourceGroups) {
			const originSourceGroupIndex = position === 'after' ? this.groups.indexOf(sourceGroup) : this.groups.lastIndexOf(sourceGroup);
			this.groups.splice(originSourceGroupIndex, 1);
		}
		this._onDidChangeInstances.fire();
	}

	moveGroupToEnd(source: ITerminalInstance | ITerminalInstance[]): void {
		source = asArray(source);
		const sourceGroups = this._getValidTerminalGroups(source);
		if (sourceGroups.size === 0) {
			return;
		}
		const lastInstanceIndex = this.groups.length - 1;
		const sortedSourceGroups = Array.from(sourceGroups).sort((a, b) => {
			return this.groups.indexOf(a) - this.groups.indexOf(b);
		});
		this.groups.splice(lastInstanceIndex + 1, 0, ...sortedSourceGroups);
		for (const sourceGroup of sortedSourceGroups) {
			const sourceGroupIndex = this.groups.indexOf(sourceGroup);
			this.groups.splice(sourceGroupIndex, 1);
		}
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
		targetGroup.moveInstance(source, index, side);
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
			if (!differentGroups && group.terminalInstances.length === instances.length) {
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
		return this.groups.find(group => group.terminalInstances.includes(instance));
	}

	getGroupLabels(): string[] {
		return this.groups.filter(group => group.terminalInstances.length > 0).map((group, index) => {
			return `${index + 1}: ${group.title ? group.title : ''}`;
		});
	}

	/**
	 * Visibility should be updated in the following cases:
	 * 1. Toggle `TERMINAL_VIEW_ID` visibility
	 * 2. Change active group
	 * 3. Change instances in active group
	 */
	updateVisibility() {
		const visible = this._viewsService.isViewVisible(TERMINAL_VIEW_ID);
		this.groups.forEach((g, i) => g.setVisible(visible && i === this.activeGroupIndex));
	}
}

interface IInstanceLocation {
	group: ITerminalGroup;
	groupIndex: number;
	instance: ITerminalInstance;
	instanceIndex: number;
}
