/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableValue } from '../../../../../base/common/observable.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';

export type AutomationPendingAction = 'deleting' | 'disabling' | 'enabling';

export class AutomationPendingActions {

	private readonly lockedAutomationIds = new Set<string>();
	private readonly _actions = observableValue<ReadonlyMap<string, AutomationPendingAction>>(this, new Map());
	readonly actions = this._actions;

	isLocked(automationId: string): boolean {
		return this.lockedAutomationIds.has(automationId);
	}

	tryLock(automationId: string): boolean {
		if (this.lockedAutomationIds.has(automationId)) {
			return false;
		}
		this.lockedAutomationIds.add(automationId);
		return true;
	}

	tryBegin(automationId: string, action: AutomationPendingAction): boolean {
		if (!this.tryLock(automationId)) {
			return false;
		}
		this.setAction(automationId, action);
		return true;
	}

	beginLocked(automationId: string, action: AutomationPendingAction): boolean {
		if (!this.lockedAutomationIds.has(automationId) || this._actions.get().has(automationId)) {
			return false;
		}
		this.setAction(automationId, action);
		return true;
	}

	private setAction(automationId: string, action: AutomationPendingAction): void {
		const actions = new Map(this._actions.get());
		actions.set(automationId, action);
		this._actions.set(actions, undefined);
	}

	end(automationId: string): void {
		this.lockedAutomationIds.delete(automationId);
		if (!this._actions.get().has(automationId)) {
			return;
		}
		const actions = new Map(this._actions.get());
		actions.delete(automationId);
		this._actions.set(actions, undefined);
	}
}

const pendingActionsByService = new WeakMap<IAutomationService, AutomationPendingActions>();

export function getAutomationPendingActions(automationService: IAutomationService): AutomationPendingActions {
	let pendingActions = pendingActionsByService.get(automationService);
	if (!pendingActions) {
		pendingActions = new AutomationPendingActions();
		pendingActionsByService.set(automationService, pendingActions);
	}
	return pendingActions;
}
