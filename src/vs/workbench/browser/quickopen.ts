/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';

export const inQuickOpenContextKeyValue = 'inQuickOpen';
export const InQuickOpenContextKey = new RawContextKey<boolean>(inQuickOpenContextKeyValue, false);
export const inQuickOpenContext = ContextKeyExpr.has(inQuickOpenContextKeyValue);

export const defaultQuickOpenContextKeyValue = 'inFilesPicker';
export const defaultQuickOpenContext = ContextKeyExpr.and(inQuickOpenContext, ContextKeyExpr.has(defaultQuickOpenContextKeyValue));

export interface IWorkbenchQuickOpenConfiguration {
	workbench: {
		commandPalette: {
			history: number;
			preserveInput: boolean;
		},
		quickOpen: {
			enableExperimentalNewVersion: boolean;
			preserveInput: boolean;
		}
	};
}

export function getQuickNavigateHandler(id: string, next?: boolean): ICommandHandler {
	return accessor => {
		const keybindingService = accessor.get(IKeybindingService);
		const quickInputService = accessor.get(IQuickInputService);

		const keys = keybindingService.lookupKeybindings(id);
		const quickNavigate = { keybindings: keys };

		quickInputService.navigate(!!next, quickNavigate);
	};
}
