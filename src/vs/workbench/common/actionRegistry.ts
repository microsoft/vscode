/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import collections = require('vs/base/common/collections');
import {Registry} from 'vs/platform/platform';
import {IAction} from 'vs/base/common/actions';
import {KeybindingsRegistry,ICommandDescriptor} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {ICommandHandler} from 'vs/platform/keybinding/common/keybindingService';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
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
	registerWorkbenchAction(descriptor: SyncActionDescriptor, keywords?: string[]): void;
	registerWorkbenchAction(descriptor: SyncActionDescriptor, category?: string, keywords?: string[]): void;

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

	/**
	 * Returns the keywords associated with the given action or null iff none.
	 */
	getKeywords(actionId: string): string[];
}

interface IActionMeta {
	category?: string;
	keywords?: string[];
}

class WorkbenchActionRegistry implements IWorkbenchActionRegistry {
	private workbenchActions: collections.IStringDictionary<SyncActionDescriptor>;
	private mapActionIdToMeta: { [id: string]: IActionMeta; };

	constructor() {
		this.workbenchActions = Object.create(null);
		this.mapActionIdToMeta = Object.create(null);
	}

	public registerWorkbenchAction(descriptor: SyncActionDescriptor, category?: string): void;
	public registerWorkbenchAction(descriptor: SyncActionDescriptor, keywords?: string[]): void;
	public registerWorkbenchAction(descriptor: SyncActionDescriptor, category?: string, keywords?: string[]): void;
	public registerWorkbenchAction(descriptor: SyncActionDescriptor, categoryOrKeywords?: string|string[], keywords?: string[]): void {
		if (!this.workbenchActions[descriptor.id]) {
			this.workbenchActions[descriptor.id] = descriptor;
			registerWorkbenchCommandFromAction(descriptor);

			let meta:IActionMeta;
			if (typeof categoryOrKeywords === 'string') {
				meta = { category: categoryOrKeywords };

				if (keywords) {
					meta.keywords = keywords;
				}
			} else {
				meta = { keywords: categoryOrKeywords };
			}

			if (meta) {
				this.mapActionIdToMeta[descriptor.id] = meta;
			}
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

	public getKeywords(id: string): string[] {
		return (this.mapActionIdToMeta[id] && this.mapActionIdToMeta[id].keywords) || null;
	}

	public getWorkbenchActions(): SyncActionDescriptor[] {
		return collections.values(this.workbenchActions);
	}

	public setWorkbenchActions(actions: SyncActionDescriptor[]): void {
		this.workbenchActions = Object.create(null);
		this.mapActionIdToMeta = Object.create(null);

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
