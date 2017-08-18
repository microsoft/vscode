/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import collections = require('vs/base/common/collections');
import { Registry } from 'vs/platform/registry/common/platform';
import { IAction } from 'vs/base/common/actions';
import { KeybindingsRegistry, ICommandAndKeybindingRule } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
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
	registerWorkbenchAction(descriptor: SyncActionDescriptor, alias: string, category?: string): void;

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
	 * Returns the alias associated with the given action or null if none.
	 */
	getAlias(actionId: string): string;

	/**
	 * Returns the category for the given action or null if none.
	 */
	getCategory(actionId: string): string;
}

interface IActionMeta {
	alias: string;
	category?: string;
}

class WorkbenchActionRegistry implements IWorkbenchActionRegistry {
	private workbenchActions: collections.IStringDictionary<SyncActionDescriptor>;
	private mapActionIdToMeta: { [id: string]: IActionMeta; };

	constructor() {
		this.workbenchActions = Object.create(null);
		this.mapActionIdToMeta = Object.create(null);
	}

	public registerWorkbenchAction(descriptor: SyncActionDescriptor, alias: string, category?: string): void {
		if (!this.workbenchActions[descriptor.id]) {
			this.workbenchActions[descriptor.id] = descriptor;
			registerWorkbenchCommandFromAction(descriptor);

			let meta: IActionMeta = { alias };
			if (typeof category === 'string') {
				meta.category = category;
			}

			this.mapActionIdToMeta[descriptor.id] = meta;
		}
	}

	public unregisterWorkbenchAction(id: string): boolean {
		if (!this.workbenchActions[id]) {
			return false;
		}

		delete this.workbenchActions[id];
		delete this.mapActionIdToMeta[id];

		return true;
	}

	public getWorkbenchAction(id: string): SyncActionDescriptor {
		return this.workbenchActions[id] || null;
	}

	public getCategory(id: string): string {
		return (this.mapActionIdToMeta[id] && this.mapActionIdToMeta[id].category) || null;
	}

	public getAlias(id: string): string {
		return (this.mapActionIdToMeta[id] && this.mapActionIdToMeta[id].alias) || null;
	}

	public getWorkbenchActions(): SyncActionDescriptor[] {
		return collections.values(this.workbenchActions);
	}

	public setWorkbenchActions(actions: SyncActionDescriptor[]): void {
		this.workbenchActions = Object.create(null);
		this.mapActionIdToMeta = Object.create(null);

		actions.forEach(action => this.registerWorkbenchAction(action, ''), this);
	}
}

Registry.add(Extensions.WorkbenchActions, new WorkbenchActionRegistry());

function registerWorkbenchCommandFromAction(descriptor: SyncActionDescriptor): void {
	let when = descriptor.keybindingContext;
	let weight = (typeof descriptor.keybindingWeight === 'undefined' ? KeybindingsRegistry.WEIGHT.workbenchContrib() : descriptor.keybindingWeight);
	let keybindings = descriptor.keybindings;

	let desc: ICommandAndKeybindingRule = {
		id: descriptor.id,
		handler: createCommandHandler(descriptor),
		weight: weight,
		when: when,
		primary: keybindings && keybindings.primary,
		secondary: keybindings && keybindings.secondary,
		win: keybindings && keybindings.win,
		mac: keybindings && keybindings.mac,
		linux: keybindings && keybindings.linux
	};

	KeybindingsRegistry.registerCommandAndKeybindingRule(desc);
}

export function createCommandHandler(descriptor: SyncActionDescriptor): ICommandHandler {
	return (accessor, args) => {

		let messageService = accessor.get(IMessageService);
		let instantiationService = accessor.get(IInstantiationService);
		let telemetryService = accessor.get(ITelemetryService);
		let partService = accessor.get(IPartService);

		TPromise.as(triggerAndDisposeAction(instantiationService, telemetryService, partService, descriptor, args)).done(null, (err) => {
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

		return void 0;
	}

	const from = args && args.from || 'keybinding';
	if (telemetryService) {
		telemetryService.publicLog('workbenchActionExecuted', { id: actionInstance.id, from });
	}

	// run action when workbench is created
	return partService.joinCreation().then(() => {
		try {
			return TPromise.as(actionInstance.run(undefined, { from })).then(() => {
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
