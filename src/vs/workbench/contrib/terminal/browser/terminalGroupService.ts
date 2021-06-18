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

	instances: ITerminalInstance[] = [];
	groups: ITerminalGroup[] = [];

	private _activeGroupIndex: number = -1;

	private _container: HTMLElement | undefined;

	private readonly _onDidChangeActiveGroup = new Emitter<ITerminalGroup | undefined>();
	get onDidChangeActiveGroup(): Event<ITerminalGroup | undefined> { return this._onDidChangeActiveGroup.event; }
	private readonly _onDidDisposeGroup = new Emitter<ITerminalGroup>();
	get onDidDisposeGroup(): Event<ITerminalGroup> { return this._onDidDisposeGroup.event; }
	private readonly _onDidChangeGroups = new Emitter<void>();
	get onDidChangeGroups(): Event<void> { return this._onDidChangeGroups.event; }

	private readonly _onDidChangeInstances = new Emitter<void>();
	get onDidChangeInstances(): Event<void> { return this._onDidChangeInstances.event; }

	private readonly _onPanelOrientationChanged = new Emitter<Orientation>();
	get onPanelOrientationChanged(): Event<Orientation> { return this._onPanelOrientationChanged.event; }

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
	}

	get activeGroup(): ITerminalGroup | undefined {
		if (this._activeGroupIndex < 0 || this._activeGroupIndex >= this.groups.length) {
			return undefined;
		}
		return this.groups[this._activeGroupIndex];
	}

	get activeInstance(): ITerminalInstance | undefined {
		// TODO: Change ITermianlGroup.activeInstance to return undefined
		return this.activeGroup?.activeInstance ?? undefined;
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
		group.addDisposable(group.onDisposed(this._onDidDisposeGroup.fire, this._onDidDisposeGroup));
		group.addDisposable(group.onInstancesChanged(this._onDidChangeInstances.fire, this._onDidChangeInstances));
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
		// if (index !== -1) {
		// 	// TODO: Remove cast
		// 	(this._terminalGroups as ITerminalGroup[]).splice(index, 1);
		// 	this._onGroupsChanged.fire();
		// }

		// Adjust focus if the group was active
		if (wasActiveGroup && this.groups.length > 0) {
			const newIndex = index < this.groups.length ? index : this.groups.length - 1;
			this._setActiveGroupByIndex(newIndex);
			this.activeInstance?.focus(true);
		} else if (this._activeGroupIndex >= this.groups.length) {
			const newIndex = this.groups.length - 1;
			this._setActiveGroupByIndex(newIndex);
		}

		// Hide the panel if there are no more instances, provided that VS Code is not shutting
		// down. When shutting down the panel is locked in place so that it is restored upon next
		// launch.
		// TODO: Move this into terminal service - listen to onDidGroupsChange
		// if (this.groups.length === 0 && !this._isShuttingDown) {
		// 	this.hidePanel();
		// 	this._onActiveInstanceChanged.fire(undefined);
		// }

		return wasActiveGroup;
	}

	private _setActiveGroupByIndex(index: number): void {
		if (index >= this.groups.length) {
			return;
		}

		this._activeGroupIndex = index;

		this.groups.forEach((g, i) => g.setVisible(i === this._activeGroupIndex));
		this._onDidChangeActiveGroup.fire(this.activeGroup);
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
