/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import collections = require('vs/base/common/collections');
import {Registry} from 'vs/platform/platform';
import {IAction} from 'vs/base/common/actions';
import {EventProvider} from 'vs/base/common/eventProvider';
import {KeybindingsRegistry,ICommandDescriptor} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {KeybindingsUtils} from 'vs/platform/keybinding/common/keybindingsUtils';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {ICommandHandler} from 'vs/platform/keybinding/common/keybindingService';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IMessageService, IMessageWithAction} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {Keybinding} from 'vs/base/common/keyCodes';
import Severity from 'vs/base/common/severity';

export const Extensions = {
	WorkbenchActions: 'workbench.contributions.actions'
};

export interface IActionProvider {
	getActions(): IAction[];
}

export interface IWorkbenchActionRegistry {

	/**
	 * Registers a workbench action to the platform. Workbench actions are not
	 * visible by default and can only be invoked through a keybinding if provided.
	 */
	registerWorkbenchAction(descriptor: SyncActionDescriptor, category?: string): void;

	/**
	 * Unregisters a workbench action from the platform.
	 */
	unregisterWorkbenchAction(id: string): boolean;

	/**
	 * Returns the workbench action descriptor for the given id or null if none.
	 */
	getWorkbenchAction(id: string): SyncActionDescriptor;

	/**
	 * Returns an array of registered workbench actions known to the platform.
	 */
	getWorkbenchActions(): SyncActionDescriptor[];

	/**
	 * Returns the category for the given action or null iff none.
	 */
	getCategory(actionId: string): string;
}

class WorkbenchActionRegistry implements IWorkbenchActionRegistry {
	private workbenchActions: collections.IStringDictionary<SyncActionDescriptor>;
	private mapActionIdToCategory: { [id: string]: string; };

	constructor() {
		this.workbenchActions = Object.create(null);
		this.mapActionIdToCategory = Object.create(null);
	}

	public registerWorkbenchAction(descriptor: SyncActionDescriptor, category?: string): void {
		if (!this.workbenchActions[descriptor.id]) {
			this.workbenchActions[descriptor.id] = descriptor;
			registerWorkbenchCommandFromAction(descriptor);

			if (category) {
				this.mapActionIdToCategory[descriptor.id] = category;
			}
		}
	}

	public unregisterWorkbenchAction(id: string): boolean {
		if (!this.workbenchActions[id]) {
			return false;
		}

		let descriptor = this.workbenchActions[id];
		delete this.workbenchActions[id];
		delete this.mapActionIdToCategory[id];

		return true;
	}

	public getWorkbenchAction(id: string): SyncActionDescriptor {
		return this.workbenchActions[id] || null;
	}

	public getCategory(id: string): string {
		return this.mapActionIdToCategory[id] || null;
	}

	public getWorkbenchActions(): SyncActionDescriptor[] {
		return collections.values(this.workbenchActions);
	}

	public setWorkbenchActions(actions: SyncActionDescriptor[]): void {
		this.workbenchActions = Object.create(null);
		this.mapActionIdToCategory = Object.create(null);

		actions.forEach(action => this.registerWorkbenchAction(action), this);
	}
}

Registry.add(Extensions.WorkbenchActions, new WorkbenchActionRegistry());

function registerWorkbenchCommandFromAction(descriptor: SyncActionDescriptor): void {
	let context = descriptor.keybindingContext;
	let weight = (typeof descriptor.keybindingWeight === 'undefined' ? KeybindingsRegistry.WEIGHT.workbenchContrib() : descriptor.keybindingWeight);
	let keybindings = descriptor.keybindings;

	let desc: ICommandDescriptor = {
		id: descriptor.id,
		handler: createCommandHandler(descriptor),
		weight: weight,
		context: context,
		primary: keybindings && keybindings.primary,
		secondary: keybindings && keybindings.secondary,
		win: keybindings && keybindings.win,
		mac: keybindings && keybindings.mac,
		linux: keybindings && keybindings.linux
	};

	KeybindingsRegistry.registerCommandDesc(desc);
}

export function createCommandHandler(descriptor: SyncActionDescriptor): ICommandHandler {
	return (accessor, args) => {

		let messageService = accessor.get(IMessageService);
		let instantiationService = accessor.get(IInstantiationService);
		let telemetryServce = accessor.get(ITelemetryService);
		let partService = accessor.get(IPartService);

		TPromise.as(triggerAndDisposeAction(instantiationService, telemetryServce, partService, descriptor, args)).done(null, (err) => {
			messageService.show(Severity.Error, err);
		});
	};
}

export function triggerAndDisposeAction(instantitationService: IInstantiationService, telemetryService: ITelemetryService, partService: IPartService, descriptor: SyncActionDescriptor, args: any): TPromise<any> {
	let actionInstance = instantitationService.createInstance(descriptor.syncDescriptor);
	actionInstance.label = descriptor.label || actionInstance.label;

	// don't run the action when not enabled
	if (!actionInstance.enabled) {
		actionInstance.dispose();
		return;
	}

	if (telemetryService) {
		telemetryService.publicLog('workbenchActionExecuted', { id: actionInstance.id, from: args.from || 'keybinding' });
	}

	// run action when workbench is created
	return partService.joinCreation().then(() => {
		try {
			return TPromise.as(actionInstance.run()).then(() => {
				actionInstance.dispose();
			}, (err) => {
				actionInstance.dispose();
				return TPromise.wrapError(err);
			});
		} catch (err) {
			actionInstance.dispose();
			return TPromise.wrapError(err);
		}
	});
}
