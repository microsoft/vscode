/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { MenuRegistry, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';

export const COMMAND_ID = 'workbench.action.toggleAIDisabled';


export function init(): IDisposable {
	const disposables = new DisposableStore();

	// Editor Context: We know the state of the active editor, so we can show Enable/Disable
	const whenAiDisabled = ContextKeyExpr.equals('aiGuardEnabled', false);

	disposables.add(MenuRegistry.appendMenuItem(MenuId.EditorContext, {
		command: { id: COMMAND_ID, title: 'Enable AI features' },
		group: 'navigation',
		order: 100,
		when: whenAiDisabled
	}));

	disposables.add(MenuRegistry.appendMenuItem(MenuId.EditorContext, {
		command: { id: COMMAND_ID, title: 'Disable AI features' },
		group: 'navigation',
		order: 100,
		when: whenAiDisabled.negate()
	}));

	// Explorer/Other Contexts: We can't easily know the state of every file in the tree, so we use "Toggle"
	const otherLocations = [MenuId.ExplorerContext, MenuId.ViewItemContext];
	for (const menuId of otherLocations) {
		disposables.add(MenuRegistry.appendMenuItem(menuId, {
			command: { id: COMMAND_ID, title: 'Toggle AI Guard' },
			group: 'navigation',
			order: 100,
		}));
	}

	return disposables;
}
