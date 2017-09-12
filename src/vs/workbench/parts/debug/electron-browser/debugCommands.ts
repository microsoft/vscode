/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import uri from 'vs/base/common/uri';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import severity from 'vs/base/common/severity';
import { List } from 'vs/base/browser/ui/list/listWidget';
import * as errors from 'vs/base/common/errors';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IListService } from 'vs/platform/list/browser/listService';
import { IMessageService } from 'vs/platform/message/common/message';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IDebugService, IConfig, IEnablement, CONTEXT_NOT_IN_DEBUG_MODE, CONTEXT_IN_DEBUG_MODE, CONTEXT_BREAKPOINTS_FOCUSED, CONTEXT_WATCH_EXPRESSIONS_FOCUSED, CONTEXT_VARIABLES_FOCUSED, EDITOR_CONTRIBUTION_ID, IDebugEditorContribution } from 'vs/workbench/parts/debug/common/debug';
import { Expression, Variable, Breakpoint, FunctionBreakpoint } from 'vs/workbench/parts/debug/common/debugModel';
import { IExtensionsViewlet, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/parts/extensions/common/extensions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

export function registerCommands(): void {

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: '_workbench.startDebug',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		handler(accessor: ServicesAccessor, configurationOrName: IConfig | string, folderUri?: uri) {
			const debugService = accessor.get(IDebugService);
			if (!configurationOrName) {
				configurationOrName = debugService.getConfigurationManager().selectedName;
			}

			if (!folderUri) {
				const selectedLaunch = debugService.getConfigurationManager().selectedLaunch;
				folderUri = selectedLaunch ? selectedLaunch.workspaceUri : undefined;
			}

			if (typeof configurationOrName === 'string') {
				debugService.startDebugging(folderUri, configurationOrName);
			} else {
				debugService.createProcess(folderUri, configurationOrName);
			}
		},
		when: CONTEXT_NOT_IN_DEBUG_MODE,
		primary: undefined
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.customDebugRequest',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
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
		id: 'debug.logToDebugConsole',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		handler(accessor: ServicesAccessor, value: string) {
			if (typeof value === 'string') {
				const debugService = accessor.get(IDebugService);
				// Use warning as severity to get the orange color for messages coming from the debug extension
				debugService.logToRepl(value, severity.Warning);
			}
		},
		when: undefined,
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
					debugService.getViewModel().setSelectedExpression(element);
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

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'debug.installAdditionalDebuggers',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: undefined,
		primary: undefined,
		handler: (accessor) => {
			const viewletService = accessor.get(IViewletService);
			return viewletService.openViewlet(EXTENSIONS_VIEWLET_ID, true)
				.then(viewlet => viewlet as IExtensionsViewlet)
				.then(viewlet => {
					viewlet.search('tag:debuggers @sort:installs');
					viewlet.focus();
				});
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'debug.addConfiguration',
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: undefined,
		primary: undefined,
		handler: (accessor, workspaceUri: string) => {
			const manager = accessor.get(IDebugService).getConfigurationManager();
			if (!accessor.get(IWorkspaceContextService).hasWorkspace()) {
				accessor.get(IMessageService).show(severity.Info, nls.localize('noFolderDebugConfig', "Please first open a folder in order to do advanced debug configuration."));
				return TPromise.as(null);
			}
			const launch = manager.getLaunches().filter(l => l.workspaceUri.toString() === workspaceUri).pop() || manager.selectedLaunch;

			return launch.openConfigFile(false).done(editor => {
				if (editor) {
					const codeEditor = <ICommonCodeEditor>editor.getControl();
					if (codeEditor) {
						return codeEditor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).addLaunchConfiguration();
					}
				}

				return undefined;
			});
		}
	});
}
