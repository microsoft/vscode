/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { List } from 'vs/base/browser/ui/list/listWidget';
import * as errors from 'vs/base/common/errors';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IListService } from 'vs/platform/list/browser/listService';
import { IDebugService, IEnablement, CONTEXT_NOT_IN_DEBUG_MODE, CONTEXT_IN_DEBUG_MODE, CONTEXT_BREAKPOINTS_FOCUSED, CONTEXT_WATCH_EXPRESSIONS_FOCUSED, CONTEXT_VARIABLES_FOCUSED } from 'vs/workbench/parts/debug/common/debug';
import { Expression, Variable, Breakpoint, FunctionBreakpoint } from 'vs/workbench/parts/debug/common/debugModel';

export function registerCommands(): void {

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: '_workbench.startDebug',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
		handler(accessor: ServicesAccessor, configurationOrName: any) {
			const debugService = accessor.get(IDebugService);
			if (!configurationOrName) {
				configurationOrName = debugService.getViewModel().selectedConfigurationName;
			}

			return debugService.createProcess(configurationOrName);
		},
		when: CONTEXT_NOT_IN_DEBUG_MODE,
		primary: undefined
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.customDebugRequest',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
		handler(accessor: ServicesAccessor, request: string, requestArgs: any) {
			const process = accessor.get(IDebugService).getViewModel().focusedProcess;
			if (process) {
				return process.session.custom(request, requestArgs);
			}

			return undefined;
		},
		when: CONTEXT_IN_DEBUG_MODE,
		primary: undefined
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'debug.toggleBreakpoint',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(5),
		when: CONTEXT_BREAKPOINTS_FOCUSED,
		primary: KeyCode.Space,
		handler: (accessor) => {
			const listService = accessor.get(IListService);
			const debugService = accessor.get(IDebugService);
			const focused = listService.getFocused();

			// Tree only
			if (!(focused instanceof List)) {
				const tree = focused;
				const element = <IEnablement>tree.getFocus();
				debugService.enableOrDisableBreakpoints(!element.enabled, element).done(null, errors.onUnexpectedError);
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'debug.renameWatchExpression',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(5),
		when: CONTEXT_WATCH_EXPRESSIONS_FOCUSED,
		primary: KeyCode.F2,
		mac: { primary: KeyCode.Enter },
		handler: (accessor) => {
			const listService = accessor.get(IListService);
			const debugService = accessor.get(IDebugService);
			const focused = listService.getFocused();

			// Tree only
			if (!(focused instanceof List)) {
				const element = focused.getFocus();
				if (element instanceof Expression) {
					if (!element.hasChildren) {
						debugService.getViewModel().setSelectedExpression(element);
					}
				}
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'debug.setVariable',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(5),
		when: CONTEXT_VARIABLES_FOCUSED,
		primary: KeyCode.F2,
		mac: { primary: KeyCode.Enter },
		handler: (accessor) => {
			const listService = accessor.get(IListService);
			const debugService = accessor.get(IDebugService);
			const focused = listService.getFocused();

			// Tree only
			if (!(focused instanceof List)) {
				const element = focused.getFocus();
				if (element instanceof Variable) {
					debugService.getViewModel().setSelectedExpression(element);
				}
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'debug.removeWatchExpression',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: CONTEXT_WATCH_EXPRESSIONS_FOCUSED,
		primary: KeyCode.Delete,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
		handler: (accessor) => {
			const listService = accessor.get(IListService);
			const debugService = accessor.get(IDebugService);
			const focused = listService.getFocused();

			// Tree only
			if (!(focused instanceof List)) {
				const element = focused.getFocus();
				if (element instanceof Expression) {
					debugService.removeWatchExpressions(element.getId());
				}
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'debug.removeBreakpoint',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: CONTEXT_BREAKPOINTS_FOCUSED,
		primary: KeyCode.Delete,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
		handler: (accessor) => {
			const listService = accessor.get(IListService);
			const debugService = accessor.get(IDebugService);
			const focused = listService.getFocused();

			// Tree only
			if (!(focused instanceof List)) {
				const element = focused.getFocus();
				if (element instanceof Breakpoint) {
					debugService.removeBreakpoints(element.getId()).done(null, errors.onUnexpectedError);
				} else if (element instanceof FunctionBreakpoint) {
					debugService.removeFunctionBreakpoints(element.getId()).done(null, errors.onUnexpectedError);
				}
			}
		}
	});
}
