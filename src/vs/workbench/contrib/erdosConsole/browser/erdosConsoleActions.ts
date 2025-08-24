/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
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
import { ErdosConsoleFocused } from '../../../common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
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

const enum ErdosConsoleCommandId {
	ClearConsole = 'workbench.action.erdosConsole.clearConsole',
	ExecuteCode = 'workbench.action.erdosConsole.executeCode',
	ExecuteCodeWithoutAdvancing = 'workbench.action.erdosConsole.executeCodeWithoutAdvancing',
	FocusConsole = 'workbench.action.erdosConsole.focusConsole',
}

const ERDOS_CONSOLE_ACTION_CATEGORY = localize('erdosConsoleCategory', "Console");

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
				keybinding: {
					when: ErdosConsoleFocused,
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyCode.KeyL,
					mac: {
						primary: KeyMod.WinCtrl | KeyCode.KeyL
					}
				},
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
}

