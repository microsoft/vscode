/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { isString } from '../../../../base/common/types.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IEditor } from '../../../../editor/common/editorCommon.js';

import { Position } from '../../../../editor/common/core/position.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ErdosConsoleFocused, ErdosConsoleInstancesExistContext } from '../../../common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { NOTEBOOK_EDITOR_FOCUSED } from '../../notebook/common/notebookContextKeys.js';
import { RuntimeCodeExecutionMode, RuntimeErrorBehavior } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { IErdosConsoleService, ERDOS_CONSOLE_VIEW_ID } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { CodeAttributionSource, IConsoleCodeAttribution } from '../../../services/erdosConsole/common/erdosConsoleCodeExecution.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { URI } from '../../../../base/common/uri.js';

const enum ErdosConsoleCommandId {
	ClearConsole = 'workbench.action.erdosConsole.clearConsole',
	ExecuteCode = 'workbench.action.erdosConsole.executeCode',
	ExecuteCodeWithoutAdvancing = 'workbench.action.erdosConsole.executeCodeWithoutAdvancing',
	FocusConsole = 'workbench.action.erdosConsole.focusConsole',
	RestartSession = 'workbench.action.erdosConsole.restartSession',
	InterruptExecution = 'workbench.action.erdosConsole.interruptExecution',
	DeleteSession = 'workbench.action.erdosConsole.deleteSession',
	ShowWorkingDirectory = 'workbench.action.erdosConsole.showWorkingDirectory',
}

const ERDOS_CONSOLE_ACTION_CATEGORY = localize('erdosConsoleCategory', "Console");

// Console action icons
const erdosConsoleRestartIcon = registerIcon('erdos-console-restart', Codicon.refresh, localize('erdosConsoleRestartIcon', "Restart console session"));
const erdosConsoleInterruptIcon = registerIcon('erdos-console-interrupt', Codicon.debugStop, localize('erdosConsoleInterruptIcon', "Interrupt console execution"));
const erdosConsoleClearIcon = registerIcon('erdos-console-clear', Codicon.clearAll, localize('erdosConsoleClearIcon', "Clear console"));
const erdosConsoleDeleteIcon = registerIcon('erdos-console-delete', Codicon.trash, localize('erdosConsoleDeleteIcon', "Delete session"));

// Function to check if console is the active panel
function isConsoleActive(accessor: ServicesAccessor): boolean {
	const paneCompositeService = accessor.get(IPaneCompositePartService);
	const activeComposite = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
	return activeComposite?.getId() === ERDOS_CONSOLE_VIEW_ID;
}

const trimNewlines = (str: string) => str.replace(/^\n+|\n+$/g, '');

export function registerErdosConsoleActions() {
	const category: ILocalizedString = {
		value: ERDOS_CONSOLE_ACTION_CATEGORY,
		original: 'Console'
	};

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosConsoleCommandId.ClearConsole,
				title: {
					value: localize('workbench.action.erdosConsole.clearConsole', "Clear Console"),
					original: 'Clear Console'
				},
				f1: true,
				category,
				icon: erdosConsoleClearIcon,
				keybinding: {
					when: ErdosConsoleFocused,
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyCode.KeyL,
					mac: {
						primary: KeyMod.WinCtrl | KeyCode.KeyL
					}
				},
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.and(ContextKeyExpr.equals('view', ERDOS_CONSOLE_VIEW_ID), ErdosConsoleInstancesExistContext),
					group: 'navigation',
					order: 4
				}]
			});
		}

		async run(accessor: ServicesAccessor) {
			const erdosConsoleService = accessor.get(IErdosConsoleService);
			if (erdosConsoleService.activeErdosConsoleInstance) {
				erdosConsoleService.activeErdosConsoleInstance.clearConsole();
			} else {
				accessor.get(INotificationService).notify({
					severity: Severity.Info,
					message: localize('erdos.clearConsole.noActiveConsole', "Cannot clear console. A console is not active."),
					sticky: false
				});
			}
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosConsoleCommandId.ExecuteCode,
				title: {
					value: localize('workbench.action.erdosConsole.executeCode', "Execute Code"),
					original: 'Execute Code'
				},
				f1: true,
				category,
				precondition: ContextKeyExpr.and(
					EditorContextKeys.editorTextFocus,
					NOTEBOOK_EDITOR_FOCUSED.toNegated()
				),
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyCode.Enter,
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.Enter,
						secondary: [KeyMod.WinCtrl | KeyCode.Enter]
					}
				},
			});
		}

		async run(
			accessor: ServicesAccessor,
			opts: {
				allowIncomplete?: boolean;
				languageId?: string;
				advance?: boolean;
				mode?: RuntimeCodeExecutionMode;
				errorBehavior?: RuntimeErrorBehavior;
			} = {}
		) {
			const editorService = accessor.get(IEditorService);
			const languageService = accessor.get(ILanguageService);
			const notificationService = accessor.get(INotificationService);
			const erdosConsoleService = accessor.get(IErdosConsoleService);

			const advance = opts.advance === undefined ? true : opts.advance;
			let code: string | undefined = undefined;

			const editor = editorService.activeTextEditorControl as IEditor;
			if (!editor) {
				return;
			}

			const selection = editor.getSelection();
			const model = editor.getModel() as ITextModel;

			if (selection && !selection.isEmpty()) {
				code = model.getValueInRange(selection);
				if (editorService.activeTextEditorLanguageId === 'python') {
					const lines = code.split('\n');
					if (lines.length > 1 && /^[ \t]/.test(lines[lines.length - 1])) {
						code += '\n';
					}
				}
			}

			const position = editor.getPosition();
			if (!position) {
				return;
			}

			// Note: Statement range providers are not available in base VSCode
			// We'll use line-based execution instead

			if (!isString(code)) {
				const position = editor.getPosition();
				let lineNumber = position?.lineNumber ?? 0;

				if (lineNumber > 0) {
					for (let number = lineNumber; number <= model.getLineCount(); ++number) {
						const temp = trimNewlines(model.getLineContent(number));

						if (temp.length > 0) {
							code = temp;
							lineNumber = number;
							break;
						}
					}
				}

				if (advance && isString(code) && position) {
					this.advanceLine(model, editor, position, lineNumber, code, editorService);
				}

				if (!isString(code) && position && lineNumber === model.getLineCount()) {
					this.amendNewlineToEnd(model);

					const newPosition = new Position(lineNumber, 1);
					editor.setPosition(newPosition);
					editor.revealPositionInCenterIfOutsideViewport(newPosition);
				}

				if (!isString(code)) {
					code = '';
				}
			}

			const languageId = opts.languageId ? opts.languageId : editorService.activeTextEditorLanguageId;
			if (!languageId) {
				notificationService.notify({
					severity: Severity.Info,
					message: localize('erdos.executeCode.noLanguage', "Cannot execute code. Unable to detect input language."),
					sticky: false
				});
				return;
			}

			const allowIncomplete = opts.allowIncomplete;

			const attribution: IConsoleCodeAttribution = {
				source: CodeAttributionSource.Script,
				metadata: {
					file: model.uri.path,
					position: {
						line: position.lineNumber,
						column: position.column
					},
				},
			};

			if (!await erdosConsoleService.executeCode(
				languageId, code, attribution, false, allowIncomplete, opts.mode, opts.errorBehavior)) {
				const languageName = languageService.getLanguageName(languageId);
				notificationService.notify({
					severity: Severity.Info,
					message: localize('erdos.executeCode.noRuntime', "Cannot execute code. Unable to start a runtime for the {0} language.", languageName),
					sticky: false
				});
			}
		}



		advanceLine(
			model: ITextModel,
			editor: IEditor,
			position: Position,
			lineNumber: number,
			code: string,
			editorService: IEditorService,
		) {
			if (editorService.activeTextEditorLanguageId === 'python' &&
				/^[ \t]/.test(code) &&
				lineNumber + 1 <= model.getLineCount() &&
				model.getLineContent(lineNumber + 1) === '') {
				code += '\n';
			}

			let onlyEmptyLines = true;

			for (let number = lineNumber + 1; number <= model.getLineCount(); ++number) {
				if (trimNewlines(model.getLineContent(number)).length !== 0) {
					onlyEmptyLines = false;
					lineNumber = number;
					break;
				}
			}

			if (onlyEmptyLines) {
				++lineNumber;

				if (lineNumber === model.getLineCount() + 1) {
					this.amendNewlineToEnd(model);
				}
			}

			const newPosition = position.with(lineNumber, 0);
			editor.setPosition(newPosition);
			editor.revealPositionInCenterIfOutsideViewport(newPosition);
		}

		amendNewlineToEnd(model: ITextModel) {
			const editOperation = {
				range: {
					startLineNumber: model.getLineCount(),
					startColumn: model.getLineMaxColumn(model.getLineCount()),
					endLineNumber: model.getLineCount(),
					endColumn: model.getLineMaxColumn(model.getLineCount())
				},
				text: '\n'
			};
			model.pushEditOperations([], [editOperation], () => []);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosConsoleCommandId.ExecuteCodeWithoutAdvancing,
				title: {
					value: localize('workbench.action.erdosConsole.executeCodeWithoutAdvancing', 'Execute Code Without Advancing'),
					original: 'Execute Code Without Advancing'
				},
				f1: false,
				category,
				precondition: ContextKeyExpr.and(
					EditorContextKeys.editorTextFocus,
					NOTEBOOK_EDITOR_FOCUSED.toNegated()
				),
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.Alt | KeyCode.Enter
				}
			});
		}

		async run(accessor: ServicesAccessor, opts: {}) {
			opts = {
				...opts,
				advance: false
			};
			const commandService = accessor.get(ICommandService);
			return commandService.executeCommand('workbench.action.erdosConsole.executeCode', opts);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosConsoleCommandId.FocusConsole,
				title: {
					value: localize('workbench.action.erdosConsole.focusConsole', "Focus Console"),
					original: 'Focus Console'
				},
				f1: true,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyF)
				},
				category,
			});
		}

		async run(accessor: ServicesAccessor) {
			const viewsService = accessor.get(IViewsService);
			await viewsService.openView(ERDOS_CONSOLE_VIEW_ID, true);
		}
	});

	// Register panel title actions that only appear when console is active
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosConsoleCommandId.RestartSession,
				title: {
					value: localize('workbench.action.erdosConsole.restartSession', "Restart Session"),
					original: 'Restart Session'
				},
				icon: erdosConsoleRestartIcon,
				category,
				f1: false,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.and(ContextKeyExpr.equals('view', ERDOS_CONSOLE_VIEW_ID), ErdosConsoleInstancesExistContext),
					group: 'navigation',
					order: 2
				}]
			});
		}

		async run(accessor: ServicesAccessor) {
			const erdosConsoleService = accessor.get(IErdosConsoleService);
			const runtimeSessionService = accessor.get(IRuntimeSessionService);
			const activeInstance = erdosConsoleService.activeErdosConsoleInstance;
			
			if (activeInstance && isConsoleActive(accessor)) {
				await runtimeSessionService.restartSession(
					activeInstance.sessionId,
					'User-requested restart from console toolbar'
				);
			}
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosConsoleCommandId.InterruptExecution,
				title: {
					value: localize('workbench.action.erdosConsole.interruptExecution', "Interrupt Execution"),
					original: 'Interrupt Execution'
				},
				icon: erdosConsoleInterruptIcon,
				category,
				f1: false,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.and(ContextKeyExpr.equals('view', ERDOS_CONSOLE_VIEW_ID), ErdosConsoleInstancesExistContext),
					group: 'navigation',
					order: 1
				}]
			});
		}

		async run(accessor: ServicesAccessor) {
			const erdosConsoleService = accessor.get(IErdosConsoleService);
			const activeInstance = erdosConsoleService.activeErdosConsoleInstance;
			
			if (activeInstance) {
				activeInstance.interrupt();
			}
		}
	});

	// Working directory action - shows current working directory (leftmost in toolbar)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosConsoleCommandId.ShowWorkingDirectory,
				title: {
					value: localize('workbench.action.erdosConsole.showWorkingDirectory', "Working Directory"),
					original: 'Working Directory'
				},
				icon: Codicon.folder,
				category,
				f1: false,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.and(ContextKeyExpr.equals('view', ERDOS_CONSOLE_VIEW_ID), ErdosConsoleInstancesExistContext),
					group: 'navigation',
					order: 0  // First item (leftmost)
				}]
			});
		}

		async run(accessor: ServicesAccessor) {
			const erdosConsoleService = accessor.get(IErdosConsoleService);
			const fileDialogService = accessor.get(IFileDialogService);
			const notificationService = accessor.get(INotificationService);
			const activeInstance = erdosConsoleService.activeErdosConsoleInstance;
			
			if (!activeInstance?.attachedRuntimeSession) {
				notificationService.warn(
					localize('console.noActiveSession', "No active console session")
				);
				return;
			}

			const currentDirectory = activeInstance.attachedRuntimeSession.dynState.currentWorkingDirectory || 
				activeInstance.initialWorkingDirectory;

			try {
				const result = await fileDialogService.showOpenDialog({
					title: localize('console.selectWorkingDirectory', "Select Working Directory"),
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
					defaultUri: currentDirectory ? URI.file(currentDirectory) : undefined,
					openLabel: localize('console.selectFolder', "Select Folder")
				});

				if (result && result.length > 0) {
					const newDirectory = result[0].fsPath;
					await activeInstance.attachedRuntimeSession.setWorkingDirectory(newDirectory);
				}
			} catch (error) {
				notificationService.error(
					localize('console.workingDirectoryError', "Failed to change working directory: {0}", error)
				);
			}
		}
	});

	// Delete session action (only when showDeleteButton is true - when console list is collapsed)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosConsoleCommandId.DeleteSession,
				title: {
					value: localize('workbench.action.erdosConsole.deleteSession', "Delete Session"),
					original: 'Delete Session'
				},
				icon: erdosConsoleDeleteIcon,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.and(ContextKeyExpr.equals('view', ERDOS_CONSOLE_VIEW_ID), ErdosConsoleInstancesExistContext),
					group: 'navigation',
					order: 3
				}],
				f1: false,
			});
		}

		async run(accessor: ServicesAccessor) {
			const erdosConsoleService = accessor.get(IErdosConsoleService);
			const runtimeSessionService = accessor.get(IRuntimeSessionService);
			const activeInstance = erdosConsoleService.activeErdosConsoleInstance;
			
			if (activeInstance) {
				await runtimeSessionService.deleteSession(activeInstance.sessionId);
			}
		}
	});
}

