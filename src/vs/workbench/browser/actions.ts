/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IAction } from 'vs/base/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { ITree, IActionProvider } from 'vs/base/parts/tree/browser/tree';
import { IInstantiationService, IConstructorSignature0, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

/**
 * The action bar contributor allows to add actions to an actionbar in a given context.
 */
export class ActionBarContributor {

	/**
	 * Returns true if this contributor has actions for the given context.
	 */
	hasActions(context: unknown): boolean {
		return false;
	}

	/**
	 * Returns an array of primary actions in the given context.
	 */
	getActions(context: unknown): ReadonlyArray<IAction> {
		return [];
	}
}

/**
 * Some predefined scopes to contribute actions to
 */
export const Scope = {

	/**
	 * Actions inside tree widgets.
	 */
	VIEWER: 'viewer'
};

/**
 * The ContributableActionProvider leverages the actionbar contribution model to find actions.
 */
export class ContributableActionProvider implements IActionProvider {
	private readonly registry: IActionBarRegistry = Registry.as<IActionBarRegistry>(Extensions.Actionbar);

	private toContext(tree: ITree, element: unknown): unknown {
		return {
			viewer: tree,
			element: element
		};
	}

	hasActions(tree: ITree, element: unknown): boolean {
		const context = this.toContext(tree, element);

		const contributors = this.registry.getActionBarContributors(Scope.VIEWER);
		for (const contributor of contributors) {
			if (contributor.hasActions(context)) {
				return true;
			}
		}

		return false;
	}

	getActions(tree: ITree, element: unknown): ReadonlyArray<IAction> {
		const actions: IAction[] = [];
		const context = this.toContext(tree, element);

		// Collect Actions
		const contributors = this.registry.getActionBarContributors(Scope.VIEWER);
		for (const contributor of contributors) {
			if (contributor.hasActions(context)) {
				actions.push(...contributor.getActions(context));
			}
		}

		return prepareActions(actions);
	}
}

// Helper function used in parts to massage actions before showing in action areas
export function prepareActions(actions: IAction[]): IAction[] {
	if (!actions.length) {
		return actions;
	}

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
		const isSeparator = actions[h].id === Separator.ID;
		if (isSeparator) {
			actions.splice(h, 1);
		} else {
			break;
		}
	}

	// Clean up separator duplicates
	let foundAction = false;
	for (let k = actions.length - 1; k >= 0; k--) {
		const isSeparator = actions[k].id === Separator.ID;
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
	 * Registers an Actionbar contributor. It will be called to contribute actions to all the action bars
	 * that are used in the Workbench in the given scope.
	 */
	registerActionBarContributor(scope: string, ctor: IConstructorSignature0<ActionBarContributor>): void;

	/**
	 * Returns an array of registered action bar contributors known to the workbench for the given scope.
	 */
	getActionBarContributors(scope: string): ActionBarContributor[];

	/**
	 * Starts the registry by providing the required services.
	 */
	start(accessor: ServicesAccessor): void;
}

class ActionBarRegistry implements IActionBarRegistry {
	private readonly actionBarContributorConstructors: { scope: string; ctor: IConstructorSignature0<ActionBarContributor>; }[] = [];
	private readonly actionBarContributorInstances: Map<string, ActionBarContributor[]> = new Map();
	private instantiationService!: IInstantiationService;

	start(accessor: ServicesAccessor): void {
		this.instantiationService = accessor.get(IInstantiationService);

		while (this.actionBarContributorConstructors.length > 0) {
			const entry = this.actionBarContributorConstructors.shift()!;
			this.createActionBarContributor(entry.scope, entry.ctor);
		}
	}

	private createActionBarContributor(scope: string, ctor: IConstructorSignature0<ActionBarContributor>): void {
		const instance = this.instantiationService.createInstance(ctor);
		let target = this.actionBarContributorInstances.get(scope);
		if (!target) {
			target = [];
			this.actionBarContributorInstances.set(scope, target);
		}
		target.push(instance);
	}

	private getContributors(scope: string): ActionBarContributor[] {
		return this.actionBarContributorInstances.get(scope) || [];
	}

	registerActionBarContributor(scope: string, ctor: IConstructorSignature0<ActionBarContributor>): void {
		if (!this.instantiationService) {
			this.actionBarContributorConstructors.push({
				scope: scope,
				ctor: ctor
			});
		} else {
			this.createActionBarContributor(scope, ctor);
		}
	}

	getActionBarContributors(scope: string): ActionBarContributor[] {
		return this.getContributors(scope).slice(0);
	}
}

Registry.add(Extensions.Actionbar, new ActionBarRegistry());
