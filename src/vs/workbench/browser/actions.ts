/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/platform';
import types = require('vs/base/common/types');
import { Action, IAction } from 'vs/base/common/actions';
import { BaseActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { ITree, IActionProvider } from 'vs/base/parts/tree/browser/tree';
import { IInstantiationService, IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';

/**
 * The action bar contributor allows to add actions to an actionbar in a given context.
 */
export class ActionBarContributor {

	/**
	 * Returns true if this contributor has actions for the given context.
	 */
	public hasActions(context: any): boolean {
		return false;
	}

	/**
	 * Returns an array of primary actions in the given context.
	 */
	public getActions(context: any): IAction[] {
		return [];
	}

	/**
	 * Returns true if this contributor has secondary actions for the given context.
	 */
	public hasSecondaryActions(context: any): boolean {
		return false;
	}

	/**
	 * Returns an array of secondary actions in the given context.
	 */
	public getSecondaryActions(context: any): IAction[] {
		return [];
	}

	/**
	 * Can return a specific IActionItem to render the given action.
	 */
	public getActionItem(context: any, action: Action): BaseActionItem {
		return null;
	}
}

/**
 * Some predefined scopes to contribute actions to
 */
export const Scope = {

	/**
	 * Actions inside the global activity bar (DEPRECATED)
	 */
	GLOBAL: 'global',

	/**
	 * Actions inside viewlets.
	 */
	VIEWLET: 'viewlet',

	/**
	 * Actions inside panels.
	 */
	PANEL: 'panel',

	/**
	 * Actions inside editors.
	 */
	EDITOR: 'editor',

	/**
	 * Actions inside tree widgets.
	 */
	VIEWER: 'viewer'
};

/**
 * The ContributableActionProvider leverages the actionbar contribution model to find actions.
 */
export class ContributableActionProvider implements IActionProvider {
	private registry: IActionBarRegistry;

	constructor() {
		this.registry = Registry.as<IActionBarRegistry>(Extensions.Actionbar);
	}

	private toContext(tree: ITree, element: any): any {
		return {
			viewer: tree,
			element: element
		};
	}

	public hasActions(tree: ITree, element: any): boolean {
		let context = this.toContext(tree, element);

		let contributors = this.registry.getActionBarContributors(Scope.VIEWER);
		for (let i = 0; i < contributors.length; i++) {
			let contributor = contributors[i];
			if (contributor.hasActions(context)) {
				return true;
			}
		}

		return false;
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		let actions: IAction[] = [];
		let context = this.toContext(tree, element);

		// Collect Actions
		let contributors = this.registry.getActionBarContributors(Scope.VIEWER);
		for (let i = 0; i < contributors.length; i++) {
			let contributor = contributors[i];
			if (contributor.hasActions(context)) {
				actions.push(...contributor.getActions(context));
			}
		}

		return TPromise.as(prepareActions(actions));
	}

	public hasSecondaryActions(tree: ITree, element: any): boolean {
		let context = this.toContext(tree, element);

		let contributors = this.registry.getActionBarContributors(Scope.VIEWER);
		for (let i = 0; i < contributors.length; i++) {
			let contributor = contributors[i];
			if (contributor.hasSecondaryActions(context)) {
				return true;
			}
		}

		return false;
	}

	public getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		let actions: IAction[] = [];
		let context = this.toContext(tree, element);

		// Collect Actions
		let contributors = this.registry.getActionBarContributors(Scope.VIEWER);
		for (let i = 0; i < contributors.length; i++) {
			let contributor = contributors[i];
			if (contributor.hasSecondaryActions(context)) {
				actions.push(...contributor.getSecondaryActions(context));
			}
		}

		return TPromise.as(prepareActions(actions));
	}

	public getActionItem(tree: ITree, element: any, action: Action): BaseActionItem {
		let contributors = this.registry.getActionBarContributors(Scope.VIEWER);
		let context = this.toContext(tree, element);

		for (let i = contributors.length - 1; i >= 0; i--) {
			let contributor = contributors[i];

			let itemProvider = contributor.getActionItem(context, action);
			if (itemProvider) {
				return itemProvider;
			}
		}

		return null;
	}
}

// Helper function used in parts to massage actions before showing in action areas
export function prepareActions(actions: IAction[]): IAction[] {
	if (!actions.length) {
		return actions;
	}

	// Patch order if not provided
	for (let l = 0; l < actions.length; l++) {
		let a = <any>actions[l];
		if (types.isUndefinedOrNull(a.order)) {
			a.order = l;
		}
	}

	// Sort by order
	actions = actions.sort((first: Action, second: Action) => {
		let firstOrder = first.order;
		let secondOrder = second.order;
		if (firstOrder < secondOrder) {
			return -1;
		} else if (firstOrder > secondOrder) {
			return 1;
		} else {
			return 0;
		}
	});

	// Clean up leading separators
	let firstIndexOfAction = -1;
	for (let i = 0; i < actions.length; i++) {
		if (actions[i].id === Separator.ID) {
			continue;
		}

		firstIndexOfAction = i;
		break;
	}

	if (firstIndexOfAction === -1) {
		return [];
	}

	actions = actions.slice(firstIndexOfAction);

	// Clean up trailing separators
	for (let h = actions.length - 1; h >= 0; h--) {
		let isSeparator = actions[h].id === Separator.ID;
		if (isSeparator) {
			actions.splice(h, 1);
		} else {
			break;
		}
	}

	// Clean up separator duplicates
	let foundAction = false;
	for (let k = actions.length - 1; k >= 0; k--) {
		let isSeparator = actions[k].id === Separator.ID;
		if (isSeparator && !foundAction) {
			actions.splice(k, 1);
		} else if (!isSeparator) {
			foundAction = true;
		} else if (isSeparator) {
			foundAction = false;
		}
	}

	return actions;
}

export const Extensions = {
	Actionbar: 'workbench.contributions.actionbar'
};

export interface IActionBarRegistry {

	/**
	 * Goes through all action bar contributors and asks them for contributed actions for
	 * the provided scope and context. Supports primary actions.
	 */
	getActionBarActionsForContext(scope: string, context: any): IAction[];

	/**
	 * Goes through all action bar contributors and asks them for contributed actions for
	 * the provided scope and context. Supports secondary actions.
	 */
	getSecondaryActionBarActionsForContext(scope: string, context: any): IAction[];

	/**
	 * Goes through all action bar contributors and asks them for contributed action item for
	 * the provided scope and context.
	 */
	getActionItemForContext(scope: string, context: any, action: Action): BaseActionItem;

	/**
	 * Registers an Actionbar contributor. It will be called to contribute actions to all the action bars
	 * that are used in the Workbench in the given scope.
	 */
	registerActionBarContributor(scope: string, ctor: IConstructorSignature0<ActionBarContributor>): void;

	/**
	 * Returns an array of registered action bar contributors known to the workbench for the given scope.
	 */
	getActionBarContributors(scope: string): ActionBarContributor[];

	setInstantiationService(service: IInstantiationService): void;
}

class ActionBarRegistry implements IActionBarRegistry {
	private actionBarContributorConstructors: { scope: string; ctor: IConstructorSignature0<ActionBarContributor>; }[] = [];
	private actionBarContributorInstances: { [scope: string]: ActionBarContributor[] } = Object.create(null);
	private instantiationService: IInstantiationService;

	public setInstantiationService(service: IInstantiationService): void {
		this.instantiationService = service;

		while (this.actionBarContributorConstructors.length > 0) {
			let entry = this.actionBarContributorConstructors.shift();
			this.createActionBarContributor(entry.scope, entry.ctor);
		}
	}

	private createActionBarContributor(scope: string, ctor: IConstructorSignature0<ActionBarContributor>): void {
		const instance = this.instantiationService.createInstance(ctor);
		let target = this.actionBarContributorInstances[scope];
		if (!target) {
			target = this.actionBarContributorInstances[scope] = [];
		}
		target.push(instance);
	}

	private getContributors(scope: string): ActionBarContributor[] {
		return this.actionBarContributorInstances[scope] || [];
	}

	public getActionBarActionsForContext(scope: string, context: any): IAction[] {
		let actions: IAction[] = [];

		// Go through contributors for scope
		this.getContributors(scope).forEach((contributor: ActionBarContributor) => {

			// Primary Actions
			if (contributor.hasActions(context)) {
				actions.push(...contributor.getActions(context));
			}
		});

		return actions;
	}

	public getSecondaryActionBarActionsForContext(scope: string, context: any): IAction[] {
		let actions: IAction[] = [];

		// Go through contributors
		this.getContributors(scope).forEach((contributor: ActionBarContributor) => {

			// Secondary Actions
			if (contributor.hasSecondaryActions(context)) {
				actions.push(...contributor.getSecondaryActions(context));
			}
		});

		return actions;
	}

	public getActionItemForContext(scope: string, context: any, action: Action): BaseActionItem {
		let contributors = this.getContributors(scope);
		for (let i = 0; i < contributors.length; i++) {
			let contributor = contributors[i];
			let item = contributor.getActionItem(context, action);
			if (item) {
				return item;
			}
		}

		return null;
	}

	public registerActionBarContributor(scope: string, ctor: IConstructorSignature0<ActionBarContributor>): void {
		if (!this.instantiationService) {
			this.actionBarContributorConstructors.push({
				scope: scope,
				ctor: ctor
			});
		} else {
			this.createActionBarContributor(scope, ctor);
		}
	}

	public getActionBarContributors(scope: string): ActionBarContributor[] {
		return this.getContributors(scope).slice(0);
	}
}

Registry.add(Extensions.Actionbar, new ActionBarRegistry());
