/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IShellLaunchConfig } from 'vs/platform/terminal/common/terminal';
import { ITerminalGroup, ITerminalGroupService, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalGroup } from 'vs/workbench/contrib/terminal/browser/terminalGroup';

export class TerminalGroupService extends Disposable implements ITerminalGroupService {
	declare _serviceBrand: undefined;

	groups: ITerminalGroup[] = [];
	activeGroupIndex: number = -1;
	instances: ITerminalInstance[] = [];
	activeInstanceIndex: number = -1;

	private _container: HTMLElement | undefined;

	private readonly _onDidChangeActiveGroup = new Emitter<ITerminalGroup | undefined>();
	get onDidChangeActiveGroup(): Event<ITerminalGroup | undefined> { return this._onDidChangeActiveGroup.event; }
	private readonly _onDidDisposeGroup = new Emitter<ITerminalGroup>();
	get onDidDisposeGroup(): Event<ITerminalGroup> { return this._onDidDisposeGroup.event; }
	private readonly _onDidChangeGroups = new Emitter<void>();
	get onDidChangeGroups(): Event<void> { return this._onDidChangeGroups.event; }

	private readonly _onDidDisposeInstance = new Emitter<ITerminalInstance>();
	get onDidDisposeInstance(): Event<ITerminalInstance> { return this._onDidDisposeInstance.event; }
	private readonly _onDidChangeActiveInstance = new Emitter<ITerminalInstance | undefined>();
	get onDidChangeActiveInstance(): Event<ITerminalInstance | undefined> { return this._onDidChangeActiveInstance.event; }
	private readonly _onDidChangeInstances = new Emitter<void>();
	get onDidChangeInstances(): Event<void> { return this._onDidChangeInstances.event; }

	private readonly _onPanelOrientationChanged = new Emitter<Orientation>();
	get onPanelOrientationChanged(): Event<Orientation> { return this._onPanelOrientationChanged.event; }

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this.onDidDisposeGroup(group => this.removeGroup(group));
	}

	get activeGroup(): ITerminalGroup | undefined {
		if (this.activeGroupIndex < 0 || this.activeGroupIndex >= this.groups.length) {
			return undefined;
		}
		return this.groups[this.activeGroupIndex];
	}

	get activeInstance(): ITerminalInstance | undefined {
		return this.activeGroup?.activeInstance;
	}

	set activeInstance(value: ITerminalInstance | undefined) {
		if (value === undefined) {
			return;
		}
		this.setActiveInstanceByIndex(this._getIndexFromId(value.instanceId));
	}

	private _getIndexFromId(terminalId: number): number {
		let terminalIndex = -1;
		this.instances.forEach((terminalInstance, i) => {
			if (terminalInstance.instanceId === terminalId) {
				terminalIndex = i;
			}
		});
		if (terminalIndex === -1) {
			throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
		}
		return terminalIndex;
	}

	setContainer(container: HTMLElement) {
		this._container = container;
		this.groups.forEach(group => group.attachToElement(container));
	}

	createGroup(slcOrInstance?: IShellLaunchConfig | ITerminalInstance): ITerminalGroup {
		const group = this._instantiationService.createInstance(TerminalGroup, this._container, slcOrInstance);
		// TODO: Move panel orientation change into this file so it's not fired many times
		group.onPanelOrientationChanged((orientation) => this._onPanelOrientationChanged.fire(orientation));
		this.groups.push(group);
		group.addDisposable(group.onDidDisposeInstance(this._onDidDisposeInstance.fire, this._onDidDisposeInstance));
		group.addDisposable(group.onInstancesChanged(this._onDidChangeInstances.fire, this._onDidChangeInstances));
		group.addDisposable(group.onDisposed(this._onDidDisposeGroup.fire, this._onDidDisposeGroup));
		if (group.terminalInstances.length > 0) {
			this._onDidChangeInstances.fire();
		}
		this._onDidChangeGroups.fire();
		return group;
	}

	removeGroup(group: ITerminalGroup): void {
		const wasActiveGroup = this._removeGroupAndAdjustFocus(group);

		this._onDidChangeInstances.fire();
		this._onDidChangeGroups.fire();
		if (wasActiveGroup) {
			this._onDidChangeActiveGroup.fire(this.activeGroup);
		}
	}

	private _removeGroupAndAdjustFocus(group: ITerminalGroup): boolean {
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
			this.setActiveGroupByIndex(newIndex);
			this.activeInstance?.focus(true);
		} else if (this.activeGroupIndex >= this.groups.length) {
			const newIndex = this.groups.length - 1;
			this.setActiveGroupByIndex(newIndex);
		}

		if (this.groups.length === 0) {
			this._onDidChangeActiveInstance.fire(undefined);
		}

		return wasActiveGroup;
	}

	setActiveGroupByIndex(index: number): void {
		if (index >= this.groups.length) {
			return;
		}

		this.activeGroupIndex = index;

		this.groups.forEach((g, i) => g.setVisible(i === this.activeGroupIndex));
		this._onDidChangeActiveGroup.fire(this.activeGroup);
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

	setActiveInstanceByIndex(index: number): void {
		const instanceLocation = this._getInstanceLocation(index);
		if (!instanceLocation || (this.activeInstanceIndex > 0 && this.activeInstanceIndex === index)) {
			return;
		}

		this.activeInstanceIndex = instanceLocation.instanceIndex;
		this.activeGroupIndex = instanceLocation.groupIndex;

		instanceLocation.group.setActiveInstanceByIndex(this.activeInstanceIndex);
		this.groups.forEach((g, i) => g.setVisible(i === instanceLocation.groupIndex));

		if (this.activeGroupIndex !== instanceLocation.groupIndex) {
			this._onDidChangeActiveGroup.fire(this.activeGroup);
		}
		this._onDidChangeActiveInstance.fire(instanceLocation.instance);
	}

	setActiveGroupToNext(): void {
		if (this.groups.length <= 1) {
			return;
		}
		let newIndex = this.activeGroupIndex + 1;
		if (newIndex >= this.groups.length) {
			newIndex = 0;
		}
		this.setActiveGroupByIndex(newIndex);
	}

	setActiveGroupToPrevious(): void {
		if (this.groups.length <= 1) {
			return;
		}
		let newIndex = this.activeGroupIndex - 1;
		if (newIndex < 0) {
			newIndex = this.groups.length - 1;
		}
		this.setActiveGroupByIndex(newIndex);
	}

	moveGroup(source: ITerminalInstance, target: ITerminalInstance): void {
		const sourceGroup = this.getGroupForInstance(source);
		const targetGroup = this.getGroupForInstance(target);
		if (!sourceGroup || !targetGroup) {
			return;
		}
		const sourceGroupIndex = this.groups.indexOf(sourceGroup);
		const targetGroupIndex = this.groups.indexOf(targetGroup);
		this.groups.splice(sourceGroupIndex, 1);
		this.groups.splice(targetGroupIndex, 0, sourceGroup);
		this._onDidChangeInstances.fire();
	}

	getGroupForInstance(instance: ITerminalInstance): ITerminalGroup | undefined {
		return this.groups.find(group => group.terminalInstances.indexOf(instance) !== -1);
	}
}

interface IInstanceLocation {
	group: ITerminalGroup,
	groupIndex: number,
	instance: ITerminalInstance,
	instanceIndex: number
}
