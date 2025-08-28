/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './consoleInput.css';

import React, { FocusEvent, useEffect, useLayoutEffect, useRef } from 'react';

import * as DOM from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { isMacintosh } from '../../../../../base/common/platform.js';

import { ISelection } from '../../../../../editor/common/core/selection.js';
import { IKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { useStateRef } from '../../../../../base/browser/ui/react/useStateRef.js';
import { CursorChangeReason } from '../../../../../editor/common/cursorEvents.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { InQuickPickContextKey } from '../../../../browser/quickaccess.js';
import { FormatOnType } from '../../../../../editor/contrib/format/browser/formatActions.js';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { MarkerController } from '../../../../../editor/contrib/gotoError/browser/gotoError.js';
import { IEditorOptions, LineNumbersType } from '../../../../../editor/common/config/editorOptions.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { ContextMenuController } from '../../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { EditOperation, ISingleEditOperation } from '../../../../../editor/common/core/editOperation.js';
import { TabCompletionController } from '../../../snippets/browser/tabCompletion.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { ParameterHintsController } from '../../../../../editor/contrib/parameterHints/browser/parameterHints.js';
import { SelectionClipboardContributionID } from '../../../codeEditor/browser/selectionClipboard.js';
import { RuntimeCodeExecutionMode, RuntimeCodeFragmentStatus } from '../../../../services/languageRuntime/common/languageRuntimeService.js';

import { IErdosConsoleInstance, ErdosConsoleState } from '../../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { ContentHoverController } from '../../../../../editor/contrib/hover/browser/contentHoverController.js';

import { CodeAttributionSource, IConsoleCodeAttribution } from '../../../../services/erdosConsole/common/erdosConsoleCodeExecution.js';
import { localize } from '../../../../../nls.js';

import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { IFontOptions } from '../../../../browser/fontConfigurationManager.js';

const enum Position {
	First,
	Last
}

type ILineNumbersOptions = Pick<IEditorOptions, 'lineNumbers' | 'lineNumbersMinChars'>;

interface ConsoleInputProps {
	readonly width: number;
	readonly hidden: boolean;
	readonly erdosConsoleInstance: IErdosConsoleInstance;
	readonly onSelectAll: () => void;
	readonly onCodeExecuted: () => void;
}

export const ConsoleInput = (props: ConsoleInputProps) => {
	const services = useErdosReactServicesContext();

	const codeEditorWidgetContainerRef = useRef<HTMLDivElement>(undefined!);

	const [, setCodeEditorWidget, codeEditorWidgetRef] = useStateRef<CodeEditorWidget>(undefined!);
	const [, setCodeEditorWidth, codeEditorWidthRef] = useStateRef(props.width);

	const shouldExecuteOnStartRef = useRef(false);

	const okToTakeFocus = () => {
		const contextKeyContext = services.contextKeyService.getContext(
			DOM.getActiveElement()
		);

		if (contextKeyContext.getValue(EditorContextKeys.textInputFocus.key)) {
			return false;
		}

		if (contextKeyContext.getValue(InQuickPickContextKey.key)) {
			return false;
		}

		if (contextKeyContext.getValue(TerminalContextKeys.focus.key)) {
			return false;
		}

		return true;
	};

	const updateCodeEditorWidgetPosition = (linePosition: Position, columnPosition: Position) => {
		const textModel = codeEditorWidgetRef.current.getModel();
		if (textModel) {
			const lineNumber = linePosition === Position.First ?
				1 :
				textModel.getLineCount();
			const column = columnPosition === Position.First ?
				1 :
				textModel.getLineMaxColumn(lineNumber);

			codeEditorWidgetRef.current.setPosition({ lineNumber, column });
			codeEditorWidgetContainerRef.current?.scrollIntoView({ behavior: 'auto' });
		}
	};

	const executeCodeEditorWidgetCodeIfPossible = async () => {
		const code = codeEditorWidgetRef.current.getValue();

		const session = props.erdosConsoleInstance.attachedRuntimeSession;
		if (!session) {
			return false;
		}

		let status = RuntimeCodeFragmentStatus.Unknown;
		try {
			status = await session.isCodeFragmentComplete(code);
		} catch (err) {
			if (err instanceof Error) {
				services.notificationService.error(
					localize('erdosConsole.incompleteError', 'Cannot execute code: {0} ({1})', err.name, err.message)
				);
			} else {
				services.notificationService.error(
					localize('erdosConsole.incompleteUnknownError', 'Cannot execute code: {0}', JSON.stringify(err))
				);
			}
			return false;
		}

		switch (status) {
			case RuntimeCodeFragmentStatus.Complete:
				break;

			case RuntimeCodeFragmentStatus.Incomplete: {
				return false;
			}

			case RuntimeCodeFragmentStatus.Invalid:
				services.logService.warn(
					`Executing invalid code fragment: '${code}'`
				);
				break;

			case RuntimeCodeFragmentStatus.Unknown:
				services.logService.warn(
					`Could not determine whether code fragment: '${code}' is complete.`
				);
				break;
		}

		codeEditorWidgetRef.current.setValue('');

		const promptWidth = Math.max(
			session.dynState.inputPrompt.length,
			session.dynState.continuationPrompt.length
		);
		codeEditorWidgetRef.current.updateOptions({
			lineNumbers: (_: number) => ' '.repeat(promptWidth),
			lineNumbersMinChars: promptWidth
		});

		const attribution: IConsoleCodeAttribution = {
			source: CodeAttributionSource.Interactive
		};
		props.erdosConsoleInstance.executeCode(code, attribution);

		codeEditorWidgetRef.current.render(true);

		props.onCodeExecuted();

		return true;
	};

	const keyDownHandler = async (e: IKeyboardEvent) => {
		const consumeEvent = () => {
			e.preventDefault();
			e.stopPropagation();
		};

		const cmdOrCtrlKey = isMacintosh ? e.metaKey : e.ctrlKey;

		if (!cmdOrCtrlKey) {
			const suggestWidgets = DOM.getActiveWindow().document.getElementsByClassName('suggest-widget');
			for (const suggestWidget of suggestWidgets) {
				if (suggestWidget.classList.contains('visible')) {
					return;
				}
			}
		}

		switch (e.keyCode) {
			case KeyCode.KeyA: {
				if (cmdOrCtrlKey) {
					const codeFragment = codeEditorWidgetRef.current.getValue();

					if (!codeFragment.length) {
						consumeEvent();
						props.onSelectAll();
					}

					const selection = codeEditorWidgetRef.current.getSelection();
					const textModel = codeEditorWidgetRef.current.getModel();
					if (selection && textModel) {
						const fullModelRange = textModel.getFullModelRange();
						if (!selection.equalsRange(fullModelRange)) {
							codeEditorWidgetRef.current.setSelection(fullModelRange);
						}

						consumeEvent();
					}
				}
				break;
			}

			case KeyCode.KeyC: {
				if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && !e.altGraphKey) {
					consumeEvent();

					const interruptRuntime = () => {
						const code = codeEditorWidgetRef.current.getValue();
						props.erdosConsoleInstance.interrupt(code);
					};

					if (isMacintosh) {
						interruptRuntime();
					} else {
						const selection = codeEditorWidgetRef.current.getSelection();

						if (!selection || selection.isEmpty()) {
							interruptRuntime();
						} else {
							const textModel = codeEditorWidgetRef.current.getModel();
							if (textModel) {
								const value = textModel.getValueInRange(selection);
								await services.clipboardService.writeText(value);
							}
						}
					}
				}
				break;
			}

			case KeyCode.KeyR: {
				break;
			}

			case KeyCode.KeyU: {
				if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && !e.altGraphKey) {
					consumeEvent();
					services.commandService.executeCommand('deleteAllLeft');
					break;
				}
				break;
			}

			case KeyCode.KeyP: {
				break;
			}

			case KeyCode.KeyN: {
				break;
			}

			case KeyCode.Tab: {
				break;
			}

			case KeyCode.UpArrow: {
				break;
			}

			case KeyCode.DownArrow: {
				break;
			}

			case KeyCode.Home: {
				if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && !e.altGraphKey) {
					consumeEvent();
					services.commandService.executeCommand('cursorLineStart');
					break;
				}
				break;
			}

			case KeyCode.End: {
				if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && !e.altGraphKey) {
					consumeEvent();
					services.commandService.executeCommand('cursorLineEnd');
					break;
				}
				break;
			}

			case KeyCode.Enter: {
				if (e.shiftKey) {
					break;
				}

				if (props.erdosConsoleInstance.state !== ErdosConsoleState.Ready) {
					if (!shouldExecuteOnStartRef.current) {
						shouldExecuteOnStartRef.current = true;
					}
					break;
				}

				consumeEvent();
				if (!await executeCodeEditorWidgetCodeIfPossible()) {
					services.commandService.executeCommand('editor.action.insertLineAfter');
				}

				break;
			}

			case KeyCode.Escape: {
				break;
			}
		}
	};

	useLayoutEffect(() => {
		const disposableStore = new DisposableStore();

		const createLineNumbersOptions = (): ILineNumbersOptions => {
			const session = props.erdosConsoleInstance.attachedRuntimeSession;
			if (!session) {
				return { lineNumbers: () => '', lineNumbersMinChars: 0 };
			}
			return {
				lineNumbers: ((): LineNumbersType => {
					switch (props.erdosConsoleInstance.state) {
						case ErdosConsoleState.Uninitialized:
						case ErdosConsoleState.Starting:
						case ErdosConsoleState.Ready:
							return (lineNumber: number) => lineNumber < 2 ?
								session.dynState.inputPrompt :
								session.dynState.continuationPrompt;

						default:
							return (_lineNumber: number) => '';
					}
				})(),
				lineNumbersMinChars: Math.max(
					session.dynState.inputPrompt.length,
					session.dynState.continuationPrompt.length
				)
			};
		};

		const createEditorOptions = (): IEditorOptions => ({
			...services.configurationService.getValue<IEditorOptions>('editor'),
			...services.configurationService.getValue<IFontOptions>('console'),
			...{
				readOnly: false,
				minimap: {
					enabled: false
				},
				glyphMargin: false,
				folding: false,
				fixedOverflowWidgets: true,
				lineDecorationsWidth: '1.0ch',
				renderLineHighlight: 'none',
				renderFinalNewline: 'on',
				wordWrap: 'bounded',
				wordWrapColumn: 2048,
				scrollbar: {
					vertical: 'hidden',
					useShadows: false
				},
				overviewRulerLanes: 0,
				rulers: [],
				scrollBeyondLastLine: false,
				renderValidationDecorations: 'off'
			},
			...createLineNumbersOptions(),
		});

		const codeEditorWidget = services.instantiationService.createInstance(
			CodeEditorWidget,
			codeEditorWidgetContainerRef.current,
			createEditorOptions(),
			{
				isSimpleWidget: true,
				contributions: EditorExtensionsRegistry.getSomeEditorContributions([
					SelectionClipboardContributionID,
					ContextMenuController.ID,
					SuggestController.ID,
					SnippetController2.ID,
					TabCompletionController.ID,
					ContentHoverController.ID,
					MarkerController.ID,
					ParameterHintsController.ID,
					FormatOnType.ID,
				])
			}
		);

		disposableStore.add(codeEditorWidget.onMouseDown(e => {
			e.event.stopPropagation();
		}));

		disposableStore.add(codeEditorWidget);
		setCodeEditorWidget(codeEditorWidget);

		props.erdosConsoleInstance.codeEditor = codeEditorWidget;

		codeEditorWidget.setModel(services.modelService.createModel(
			'',
			services.languageService.createById(
				props.erdosConsoleInstance.runtimeMetadata.languageId
			),
			URI.from({
				scheme: Schemas.inMemory,
				path: `/repl-${props.erdosConsoleInstance.runtimeMetadata.languageId}-${generateUuid()}`
			}),
			false
		));

		disposableStore.add(
			services.configurationService.onDidChangeConfiguration(
				configurationChangeEvent => {
					if (configurationChangeEvent.affectsConfiguration('editor') || configurationChangeEvent.affectsConfiguration('console')) {
						codeEditorWidget.updateOptions(createEditorOptions());
					}
				}
			)
		);

		disposableStore.add(codeEditorWidget.onKeyDown(keyDownHandler));

		disposableStore.add(codeEditorWidget.onDidContentSizeChange(contentSizeChangedEvent => {
			codeEditorWidget.layout({
				width: codeEditorWidthRef.current,
				height: codeEditorWidget.getContentHeight()
			});
		}));

		disposableStore.add(codeEditorWidget.onDidPaste(e => {
			updateCodeEditorWidgetPosition(Position.Last, Position.Last);
		}));

		codeEditorWidget.layout();

		disposableStore.add(
			services.erdosConsoleService.onDidChangeActiveErdosConsoleInstance(
				erdosConsoleInstance => {
					if (erdosConsoleInstance === props.erdosConsoleInstance) {
						if (okToTakeFocus()) {
							codeEditorWidget.focus();
						}
					}
				}
			)
		);

		disposableStore.add(props.erdosConsoleInstance.onFocusInput(() => {
			codeEditorWidget.focus();
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidChangeState(state => {
			codeEditorWidget.updateOptions(createLineNumbersOptions());
			if (state === ErdosConsoleState.Ready && shouldExecuteOnStartRef.current) {
				shouldExecuteOnStartRef.current = false;
				executeCodeEditorWidgetCodeIfPossible();
			}
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidPasteText(text => {
			let selections = codeEditorWidget.getSelections();
			if (!selections || !selections.length) {
				return;
			}

			const lines = text.split('\n');

			const edits: ISingleEditOperation[] = [];
			if (lines.length === selections.length) {
				for (let i = 0; i < lines.length; i++) {
					edits.push(EditOperation.replace(selections[i], lines[i]));
				}
			} else {
				for (const selection of selections) {
					edits.push(EditOperation.replace(selection, text));
				}
			}

			codeEditorWidget.executeEdits('console', edits);

			selections = codeEditorWidget.getSelections();
			if (selections && selections.length) {
				const updatedSelections: ISelection[] = [];
				for (const selection of selections) {
					updatedSelections.push(selection.setStartPosition(
						selection.endLineNumber,
						selection.endColumn
					));
				}

				codeEditorWidget.setSelections(
					updatedSelections,
					'console',
					CursorChangeReason.Paste
				);
			}

			codeEditorWidgetContainerRef.current?.scrollIntoView({
				behavior: 'auto',
				block: 'end'
			});
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidClearConsole(() => {
			codeEditorWidget.focus();
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidSetPendingCode(pendingCode => {
			codeEditorWidget.setValue(pendingCode || '');
			updateCodeEditorWidgetPosition(Position.Last, Position.Last);
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidExecuteCode(({ code, mode }) => {
			const trimmedCode = code.trim();

			if (trimmedCode.length && (mode === RuntimeCodeExecutionMode.Interactive || mode === RuntimeCodeExecutionMode.NonInteractive)) {
			}
		}));

		const session = props.erdosConsoleInstance.attachedRuntimeSession;
		if (session) {
			disposableStore.add(
				session.onDidReceiveRuntimeMessagePromptConfig(() => {
					codeEditorWidget.updateOptions(createLineNumbersOptions());
					codeEditorWidget.render(true);
				})
			);
		}

		if (okToTakeFocus()) {
			codeEditorWidget.focus();
		}

		return () => disposableStore.dispose();
	}, []);

	useEffect(() => {
		if (codeEditorWidgetRef.current) {
			setCodeEditorWidth(props.width);
			codeEditorWidgetRef.current.layout({
				width: props.width,
				height: codeEditorWidgetRef.current.getContentHeight()
			});
		}
	}, [codeEditorWidgetRef, props.width, setCodeEditorWidth]);

	const focusHandler = (e: FocusEvent<HTMLDivElement, Element>) => {
		if (codeEditorWidgetRef.current && !codeEditorWidgetRef.current.hasTextFocus) {
			codeEditorWidgetRef.current.focus();
		}
	};

	return (
		<div className={props.hidden ? 'console-input hidden' : 'console-input'} tabIndex={0} onFocus={focusHandler}>
			<div ref={codeEditorWidgetContainerRef} />
		</div>
	);
};
