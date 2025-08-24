/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';

import { unmnemonicLabel } from '../../../base/common/labels.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IHoverManager } from '../../hover/browser/hoverManager.js';
import { CommandCenter } from '../../commandCenter/common/commandCenter.js';
import { Action, IAction, Separator } from '../../../base/common/actions.js';
import { ContextKeyExpression } from '../../contextkey/common/contextkey.js';
import { ErdosActionBarHoverManager } from './erdosActionBarHoverManager.js';
import { useErdosReactServicesContext } from '../../../base/browser/erdosReactRendererContext.js';

export interface CommandAction {
	id: string;
	label?: string;
	separator?: boolean;
	when?: ContextKeyExpression;
}

export interface ErdosActionBarState {
	appendCommandAction(actions: IAction[], commandAction: CommandAction): void;
	isCommandEnabled(commandId: string): boolean;
	hoverManager: IHoverManager;
	menuShowing: boolean;
	setMenuShowing(menuShowing: boolean): void;
	focusableComponents: Set<HTMLElement>;
}

export const useErdosActionBarState = (): ErdosActionBarState => {
	const services = useErdosReactServicesContext();
	const [menuShowing, setMenuShowing] = useState(false);
	const [focusableComponents] = useState(new Set<HTMLElement>());
	const [hoverManager, setHoverManager] = useState<IHoverManager>(undefined!);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		setHoverManager(disposableStore.add(new ErdosActionBarHoverManager(
			true,
			services.configurationService,
			services.hoverService
		)));

		return () => disposableStore.dispose();
	}, [services.accessibilityService, services.configurationService, services.hoverService]);

	const appendCommandAction = (actions: IAction[], commandAction: CommandAction) => {
		const commandInfo = CommandCenter.commandInfo(commandAction.id);

		if (commandInfo && services.contextKeyService.contextMatchesRules(commandAction.when)) {
			const enabled = !commandInfo.precondition ||
				services.contextKeyService.contextMatchesRules(commandInfo.precondition);
			const label = commandAction.label ||
				(typeof (commandInfo.title) === 'string' ?
					commandInfo.title :
					commandInfo.title.value
				);

			if (commandAction.separator) {
				actions.push(new Separator());
			}

			actions.push(new Action(
				commandAction.id,
				unmnemonicLabel(label),
				undefined,
				enabled, () => {
					services.commandService.executeCommand(commandAction.id);
				}
			));
		}
	};

	const isCommandEnabled = (commandId: string) => {
		const commandInfo = CommandCenter.commandInfo(commandId);
		if (!commandInfo) {
			return false;
		}

		if (!commandInfo.precondition) {
			return true;
		}

		return services.contextKeyService.contextMatchesRules(commandInfo.precondition);
	};

	return {
		appendCommandAction,
		isCommandEnabled,
		hoverManager,
		menuShowing,
		setMenuShowing,
		focusableComponents
	};
};