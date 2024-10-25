/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { EditorConfiguration } from '../../../../../../editor/browser/config/editorConfiguration.js';
import { CoreEditingCommands } from '../../../../../../editor/browser/coreCommands.js';
import { ICodeEditor, PastePayload } from '../../../../../../editor/browser/editorBrowser.js';
import { RedoCommand, UndoCommand } from '../../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorConfiguration } from '../../../../../../editor/common/config/editorConfiguration.js';
import { cursorBlinkingStyleFromString, cursorStyleFromString, TextEditorCursorBlinkingStyle, TextEditorCursorStyle } from '../../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { Selection, SelectionDirection } from '../../../../../../editor/common/core/selection.js';
import { IWordAtPosition, USUAL_WORD_SEPARATORS } from '../../../../../../editor/common/core/wordHelper.js';
import { CommandExecutor, CursorsController } from '../../../../../../editor/common/cursor/cursor.js';
import { DeleteOperations } from '../../../../../../editor/common/cursor/cursorDeleteOperations.js';
import { CursorConfiguration, ICursorSimpleModel } from '../../../../../../editor/common/cursorCommon.js';
import { CursorChangeReason } from '../../../../../../editor/common/cursorEvents.js';
import { CompositionTypePayload, Handler, ReplacePreviousCharPayload } from '../../../../../../editor/common/editorCommon.js';
import { ILanguageConfigurationService } from '../../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { IModelDeltaDecoration, ITextModel, PositionAffinity } from '../../../../../../editor/common/model.js';
import { indentOfLine } from '../../../../../../editor/common/model/textModel.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { ICoordinatesConverter } from '../../../../../../editor/common/viewModel.js';
import { ViewModelEventsCollector } from '../../../../../../editor/common/viewModelEventDispatcher.js';
import { WordHighlighterContribution } from '../../../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IPastFutureElements, IUndoRedoElement, IUndoRedoService, UndoRedoElementType } from '../../../../../../platform/undoRedo/common/undoRedo.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from '../../../common/notebookContextKeys.js';
import { INotebookActionContext, NotebookAction } from '../../controller/coreActions.js';
import { getNotebookEditorFromEditorPane, ICellViewModel, INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { CellEditorOptions } from '../../view/cellParts/cellEditorOptions.js';

const NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID = 'notebook.addFindMatchToSelection';

export enum NotebookMultiCursorState {
	Idle,
	Selecting,
	Editing,
}

interface NotebookCursorConfig {
	cursorStyle: TextEditorCursorStyle;
	cursorBlinking: TextEditorCursorBlinkingStyle;
	cursorSmoothCaretAnimation: 'off' | 'explicit' | 'on';
}

interface SelectionTranslation {
	deltaStartCol: number;
	deltaStartLine: number;
	deltaEndCol: number;
	deltaEndLine: number;
}

interface TrackedMatch {
	cellViewModel: ICellViewModel;
	initialSelection: Selection;
	wordSelections: Selection[];
	editorConfig: IEditorConfiguration;
	cursorConfig: NotebookCursorConfig;
	decorationIds: string[];
	undoRedoHistory: IPastFutureElements;
}

export const NOTEBOOK_MULTI_CURSOR_CONTEXT = {
	IsNotebookMultiCursor: new RawContextKey<boolean>('isNotebookMultiSelect', false),
	NotebookMultiSelectCursorState: new RawContextKey<NotebookMultiCursorState>('notebookMultiSelectCursorState', NotebookMultiCursorState.Idle),
};

export class NotebookMultiCursorController extends Disposable implements INotebookEditorContribution {

	static readonly id: string = 'notebook.multiCursorController';

	private word: string = '';
	private trackedMatches: TrackedMatch[] = [];

	private readonly _onDidChangeAnchorCell = this._register(new Emitter<void>());
	readonly onDidChangeAnchorCell: Event<void> = this._onDidChangeAnchorCell.event;
	private anchorCell: [ICellViewModel, ICodeEditor] | undefined;

	private readonly anchorDisposables = this._register(new DisposableStore());
	private readonly cursorsDisposables = this._register(new DisposableStore());
	private cursorsControllers: ResourceMap<CursorsController> = new ResourceMap<CursorsController>();

	private state: NotebookMultiCursorState = NotebookMultiCursorState.Idle;
	public getState(): NotebookMultiCursorState {
		return this.state;
	}

	private _nbIsMultiSelectSession = NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor.bindTo(this.contextKeyService);
	private _nbMultiSelectState = NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.bindTo(this.contextKeyService);

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService,
	) {
		super();

		this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;

		// anchor cell will catch and relay all type, cut, paste events to the cursors controllers
		// need to create new controllers when the anchor cell changes, then update their listeners
		// ** cursor controllers need to happen first, because anchor listeners relay to them
		this._register(this.onDidChangeAnchorCell(() => {
			this.updateCursorsControllers();
			this.updateAnchorListeners();
		}));
	}

	private updateCursorsControllers() {
		this.cursorsDisposables.clear(); // TODO: dial this back for perf and just update the relevant controllers
		this.trackedMatches.forEach(async match => {
			const textModelRef = await this.textModelService.createModelReference(match.cellViewModel.uri);
			const textModel = textModelRef.object.textEditorModel;
			if (!textModel) {
				return;
			}

			const cursorSimpleModel = this.constructCursorSimpleModel(match.cellViewModel);
			const converter = this.constructCoordinatesConverter();
			const editorConfig = match.editorConfig;

			const controller = this.cursorsDisposables.add(new CursorsController(
				textModel,
				cursorSimpleModel,
				converter,
				new CursorConfiguration(textModel.getLanguageId(), textModel.getOptions(), editorConfig, this.languageConfigurationService)
			));

			controller.setSelections(new ViewModelEventsCollector(), undefined, match.wordSelections, CursorChangeReason.Explicit);
			this.cursorsControllers.set(match.cellViewModel.uri, controller);
		});
	}

	private constructCoordinatesConverter(): ICoordinatesConverter {
		return {
			convertViewPositionToModelPosition(viewPosition: Position): Position {
				return viewPosition;
			},
			convertViewRangeToModelRange(viewRange: Range): Range {
				return viewRange;
			},
			validateViewPosition(viewPosition: Position, expectedModelPosition: Position): Position {
				return viewPosition;
			},
			validateViewRange(viewRange: Range, expectedModelRange: Range): Range {
				return viewRange;
			},
			convertModelPositionToViewPosition(modelPosition: Position, affinity?: PositionAffinity, allowZeroLineNumber?: boolean, belowHiddenRanges?: boolean): Position {
				return modelPosition;
			},
			convertModelRangeToViewRange(modelRange: Range, affinity?: PositionAffinity): Range {
				return modelRange;
			},
			modelPositionIsVisible(modelPosition: Position): boolean {
				return true;
			},
			getModelLineViewLineCount(modelLineNumber: number): number {
				return 1;
			},
			getViewLineNumberOfModelPosition(modelLineNumber: number, modelColumn: number): number {
				return modelLineNumber;
			}
		};
	}

	private constructCursorSimpleModel(cell: ICellViewModel): ICursorSimpleModel {
		return {
			getLineCount(): number {
				return cell.textBuffer.getLineCount();
			},
			getLineContent(lineNumber: number): string {
				return cell.textBuffer.getLineContent(lineNumber);
			},
			getLineMinColumn(lineNumber: number): number {
				return cell.textBuffer.getLineMinColumn(lineNumber);
			},
			getLineMaxColumn(lineNumber: number): number {
				return cell.textBuffer.getLineMaxColumn(lineNumber);
			},
			getLineFirstNonWhitespaceColumn(lineNumber: number): number {
				return cell.textBuffer.getLineFirstNonWhitespaceColumn(lineNumber);
			},
			getLineLastNonWhitespaceColumn(lineNumber: number): number {
				return cell.textBuffer.getLineLastNonWhitespaceColumn(lineNumber);
			},
			normalizePosition(position: Position, affinity: PositionAffinity): Position {
				return position;
			},
			getLineIndentColumn(lineNumber: number): number {
				return indentOfLine(cell.textBuffer.getLineContent(lineNumber)) + 1;
			}
		};
	}

	private updateAnchorListeners() {
		this.anchorDisposables.clear();

		if (!this.anchorCell) {
			throw new Error('Anchor cell is undefined');
		}

		// typing
		this.anchorDisposables.add(this.anchorCell[1].onWillType((input) => {
			const collector = new ViewModelEventsCollector();
			this.trackedMatches.forEach(match => {
				const controller = this.cursorsControllers.get(match.cellViewModel.uri);
				if (!controller) {
					// should not happen
					return;
				}
				if (match.cellViewModel.handle !== this.anchorCell?.[0].handle) { // don't relay to active cell, already has a controller for typing
					controller.type(collector, input, 'keyboard');
				}
			});
		}));

		this.anchorDisposables.add(this.anchorCell[1].onDidType(() => {
			this.state = NotebookMultiCursorState.Editing; // typing will continue to work as normal across ranges, just preps for another cmd+d
			this._nbMultiSelectState.set(NotebookMultiCursorState.Editing);

			const anchorController = this.cursorsControllers.get(this.anchorCell![0].uri);
			if (!anchorController) {
				return;
			}
			const activeSelections = this.notebookEditor.activeCodeEditor?.getSelections();
			if (!activeSelections) {
				return;
			}

			// need to keep anchor cursor controller in sync manually (for delete usage), since we don't relay type event to it
			anchorController.setSelections(new ViewModelEventsCollector(), 'keyboard', activeSelections, CursorChangeReason.Explicit);

			this.trackedMatches.forEach(match => {
				const controller = this.cursorsControllers.get(match.cellViewModel.uri);
				if (!controller) {
					return;
				}

				// this is used upon exiting the multicursor session to set the selections back to the correct cursor state
				match.initialSelection = controller.getSelection();
				// clear tracked selection data as it is invalid once typing begins
				match.wordSelections = [];
			});

			this.updateLazyDecorations();
		}));

		// arrow key navigation
		this.anchorDisposables.add(this.anchorCell[1].onDidChangeCursorSelection((e) => {
			if (e.source === 'mouse') {
				this.resetToIdleState();
				return;
			}

			// ignore this event if it was caused by a typing event or a delete (NotSet and RecoverFromMarkers respectively)
			if (!e.oldSelections || e.reason === CursorChangeReason.NotSet || e.reason === CursorChangeReason.RecoverFromMarkers) {
				return;
			}

			const translation: SelectionTranslation = {
				deltaStartCol: e.selection.startColumn - e.oldSelections[0].startColumn,
				deltaStartLine: e.selection.startLineNumber - e.oldSelections[0].startLineNumber,
				deltaEndCol: e.selection.endColumn - e.oldSelections[0].endColumn,
				deltaEndLine: e.selection.endLineNumber - e.oldSelections[0].endLineNumber,
			};
			const translationDir = e.selection.getDirection();

			this.trackedMatches.forEach(match => {
				const controller = this.cursorsControllers.get(match.cellViewModel.uri);
				if (!controller) {
					return;
				}

				const newSelections = controller.getSelections().map(selection => {
					const newStartCol = selection.startColumn + translation.deltaStartCol;
					const newStartLine = selection.startLineNumber + translation.deltaStartLine;
					const newEndCol = selection.endColumn + translation.deltaEndCol;
					const newEndLine = selection.endLineNumber + translation.deltaEndLine;
					return Selection.createWithDirection(newStartLine, newStartCol, newEndLine, newEndCol, translationDir);
				});

				controller.setSelections(new ViewModelEventsCollector(), e.source, newSelections, CursorChangeReason.Explicit);
			});

			this.updateLazyDecorations();
		}));

		// core actions
		this.anchorDisposables.add(this.anchorCell[1].onWillTriggerEditorOperationEvent((e) => {
			this.trackedMatches.forEach(match => {
				if (match.cellViewModel.handle === this.anchorCell?.[0].handle) {
					return;
				}

				const eventsCollector = new ViewModelEventsCollector();
				const controller = this.cursorsControllers.get(match.cellViewModel.uri);
				if (!controller) {
					return;
				}
				switch (e.handlerId) {
					case Handler.CompositionStart:
						controller.startComposition(eventsCollector);
						return;
					case Handler.CompositionEnd:
						controller.endComposition(eventsCollector, e.source);
						return;
					case Handler.ReplacePreviousChar: {
						const args = <Partial<ReplacePreviousCharPayload>>e.payload;
						controller.compositionType(eventsCollector, args.text || '', args.replaceCharCnt || 0, 0, 0, e.source);
						return;
					}
					case Handler.CompositionType: {
						const args = <Partial<CompositionTypePayload>>e.payload;
						controller.compositionType(eventsCollector, args.text || '', args.replacePrevCharCnt || 0, args.replaceNextCharCnt || 0, args.positionDelta || 0, e.source);
						return;
					}
					case Handler.Paste: {
						const args = <Partial<PastePayload>>e.payload;
						controller.paste(eventsCollector, args.text || '', args.pasteOnNewLine || false, args.multicursorText || null, e.source);
						return;

						// ! this code is for firing the paste event, not sure what that would enable, trace the event listener
						// const startPos = XYZ
						// const endPos = XYZ
						// if (source === 'keyboard') {
						// 	this._onDidPaste.fire({
						// 		clipboardEvent,
						// 		range: new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column),
						// 		languageId: mode
						// 	});
						// }
					}
					case Handler.Cut:
						controller.cut(eventsCollector, e.source);
						return;
				}
			});
		}));

		// exit mode
		this.anchorDisposables.add(this.anchorCell[1].onDidBlurEditorWidget(() => {
			if (this.state === NotebookMultiCursorState.Selecting || this.state === NotebookMultiCursorState.Editing) {
				this.resetToIdleState();
			}
		}));
	}

	private updateFinalUndoRedo() {
		const anchorCellModel = this.anchorCell?.[1].getModel();
		if (!anchorCellModel) {
			// should not happen
			return;
		}

		const newElementsMap: ResourceMap<IUndoRedoElement[]> = new ResourceMap<IUndoRedoElement[]>();
		const resources: URI[] = [];

		this.trackedMatches.forEach(trackedMatch => {
			const undoRedoState = trackedMatch.undoRedoHistory;
			if (!undoRedoState) {
				return;
			}

			resources.push(trackedMatch.cellViewModel.uri);

			const currentPastElements = this.undoRedoService.getElements(trackedMatch.cellViewModel.uri).past.slice();
			const oldPastElements = trackedMatch.undoRedoHistory.past.slice();
			const newElements = currentPastElements.slice(oldPastElements.length);
			if (newElements.length === 0) {
				return;
			}

			newElementsMap.set(trackedMatch.cellViewModel.uri, newElements);

			this.undoRedoService.removeElements(trackedMatch.cellViewModel.uri);
			oldPastElements.forEach(element => {
				this.undoRedoService.pushElement(element);
			});
		});

		this.undoRedoService.pushElement({
			type: UndoRedoElementType.Workspace,
			resources: resources,
			label: 'Multi Cursor Edit',
			code: 'multiCursorEdit',
			confirmBeforeUndo: false,
			undo: async () => {
				newElementsMap.forEach(async value => {
					value.reverse().forEach(async element => {
						await element.undo();
					});
				});
			},
			redo: async () => {
				newElementsMap.forEach(async value => {
					value.forEach(async element => {
						await element.redo();
					});
				});
			}
		});
	}

	public resetToIdleState() {
		this.state = NotebookMultiCursorState.Idle;
		this._nbMultiSelectState.set(NotebookMultiCursorState.Idle);
		this._nbIsMultiSelectSession.set(false);
		this.updateFinalUndoRedo();

		this.trackedMatches.forEach(match => {
			this.clearDecorations(match);
			match.cellViewModel.setSelections([match.initialSelection]); // correct cursor placement upon exiting cmd-d session
		});

		this.anchorDisposables.clear();
		this.anchorCell = undefined;
		this.cursorsDisposables.clear();
		this.cursorsControllers.clear();
		this.trackedMatches = [];
	}

	public async findAndTrackNextSelection(cell: ICellViewModel): Promise<void> {
		if (this.state === NotebookMultiCursorState.Idle) { // move cursor to end of the symbol + track it, transition to selecting state
			const textModel = cell.textModel;
			if (!textModel) {
				return;
			}

			const inputSelection = cell.getSelections()[0];
			const word = this.getWord(inputSelection, textModel);
			if (!word) {
				return;
			}
			this.word = word.word;

			const newSelection = new Selection(
				inputSelection.startLineNumber,
				word.startColumn,
				inputSelection.startLineNumber,
				word.endColumn
			);
			cell.setSelections([newSelection]);

			this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
			if (!this.anchorCell || this.anchorCell[0].handle !== cell.handle) {
				throw new Error('Active cell is not the same as the cell passed as context');
			}
			if (!(this.anchorCell[1] instanceof CodeEditorWidget)) {
				throw new Error('Active cell is not an instance of CodeEditorWidget');
			}

			textModel.pushStackElement();

			this.trackedMatches = [];
			const editorConfig = this.constructCellEditorOptions(this.anchorCell[0]);
			const rawEditorOptions = editorConfig.getRawOptions();
			const cursorConfig: NotebookCursorConfig = {
				cursorStyle: cursorStyleFromString(rawEditorOptions.cursorStyle!),
				cursorBlinking: cursorBlinkingStyleFromString(rawEditorOptions.cursorBlinking!),
				cursorSmoothCaretAnimation: rawEditorOptions.cursorSmoothCaretAnimation!
			};

			const newMatch: TrackedMatch = {
				cellViewModel: cell,
				initialSelection: inputSelection,
				wordSelections: [newSelection],
				editorConfig: editorConfig, // cache this in the match so we can create new cursors controllers with the correct language config
				cursorConfig: cursorConfig,
				decorationIds: [],
				undoRedoHistory: this.undoRedoService.getElements(cell.uri)
			};
			this.trackedMatches.push(newMatch);

			this._nbIsMultiSelectSession.set(true);
			this.state = NotebookMultiCursorState.Selecting;
			this._nbMultiSelectState.set(NotebookMultiCursorState.Selecting);
			this._onDidChangeAnchorCell.fire();

		} else if (this.state === NotebookMultiCursorState.Selecting) { // use the word we stored from idle state transition to find next match, track it
			const notebookTextModel = this.notebookEditor.textModel;
			if (!notebookTextModel) {
				return;
			}

			const index = this.notebookEditor.getCellIndex(cell);
			if (index === undefined) {
				return;
			}

			const findResult = notebookTextModel.findNextMatch(
				this.word,
				{ cellIndex: index, position: cell.getSelections()[cell.getSelections().length - 1].getEndPosition() },
				false,
				true,
				USUAL_WORD_SEPARATORS //! might want to get these from the editor config
			);
			if (!findResult) {
				return; //todo: some sort of message to the user alerting them that there are no more matches? editor does not do this
			}

			const resultCellViewModel = this.notebookEditor.getCellByHandle(findResult.cell.handle);
			if (!resultCellViewModel) {
				return;
			}

			let newMatch: TrackedMatch;
			if (findResult.cell.handle === cell.handle) { // match is in the same cell, find tracked entry, update and set selections in viewmodel and cursorController
				newMatch = this.trackedMatches.find(match => match.cellViewModel.handle === findResult.cell.handle)!;
				newMatch.wordSelections.push(Selection.fromRange(findResult.match.range, SelectionDirection.LTR));
				resultCellViewModel.setSelections(newMatch.wordSelections);

				const controller = this.cursorsControllers.get(newMatch.cellViewModel.uri);
				if (!controller) {
					// should not happen
					return;
				}
				controller.setSelections(new ViewModelEventsCollector(), undefined, newMatch.wordSelections, CursorChangeReason.Explicit);

			} else if (findResult.cell.handle !== cell.handle) {	// result is in a different cell, move focus there and apply selection, then update anchor
				await this.notebookEditor.revealRangeInViewAsync(resultCellViewModel, findResult.match.range);
				this.notebookEditor.focusNotebookCell(resultCellViewModel, 'editor');

				const initialSelection = resultCellViewModel.getSelections()[0];
				const newSelection = Selection.fromRange(findResult.match.range, SelectionDirection.LTR);
				resultCellViewModel.setSelections([newSelection]);
				if (this.notebookEditor.activeCellAndCodeEditor?.[0].handle !== resultCellViewModel.handle) {
					// should not happen
					throw new Error('Focused cell does not match the find match data');
				}

				this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
				if (!this.anchorCell || !(this.anchorCell[1] instanceof CodeEditorWidget)) {
					throw new Error('Active cell is not an instance of CodeEditorWidget');
				}

				const textModel = await resultCellViewModel.resolveTextModel();
				textModel.pushStackElement();

				const editorConfig = this.constructCellEditorOptions(this.anchorCell[0]);
				const rawEditorOptions = editorConfig.getRawOptions();
				const cursorConfig: NotebookCursorConfig = {
					cursorStyle: cursorStyleFromString(rawEditorOptions.cursorStyle!),
					cursorBlinking: cursorBlinkingStyleFromString(rawEditorOptions.cursorBlinking!),
					cursorSmoothCaretAnimation: rawEditorOptions.cursorSmoothCaretAnimation!
				};

				newMatch = {
					cellViewModel: resultCellViewModel,
					initialSelection: initialSelection,
					wordSelections: [newSelection],
					editorConfig: editorConfig,
					cursorConfig: cursorConfig,
					decorationIds: [],
					undoRedoHistory: this.undoRedoService.getElements(resultCellViewModel.uri)
				} satisfies TrackedMatch;
				this.trackedMatches.push(newMatch);

				this._onDidChangeAnchorCell.fire();

				// we set the decorations manually for the cell we have just departed, since it blurs
				// we can find the match with the handle that the find and track request originated
				this.initializeMultiSelectDecorations(this.trackedMatches.find(match => match.cellViewModel.handle === cell.handle));
			} else {
				// should not happen
				return;
			}

		}
	}

	public async deleteLeft(): Promise<void> {
		this.trackedMatches.forEach(match => {
			const controller = this.cursorsControllers.get(match.cellViewModel.uri);
			if (!controller) {
				// should not happen
				return;
			}

			const [, commands] = DeleteOperations.deleteLeft(
				controller.getPrevEditOperationType(),
				controller.context.cursorConfig,
				controller.context.model,
				controller.getSelections(),
				controller.getAutoClosedCharacters(),
			);

			const delSelections = CommandExecutor.executeCommands(controller.context.model, controller.getSelections(), commands);
			if (!delSelections) {
				return;
			}
			controller.setSelections(new ViewModelEventsCollector(), undefined, delSelections, CursorChangeReason.Explicit);
		});
		this.updateLazyDecorations();
	}

	public async deleteRight(): Promise<void> {
		this.trackedMatches.forEach(match => {
			const controller = this.cursorsControllers.get(match.cellViewModel.uri);
			if (!controller) {
				// should not happen
				return;
			}

			const [, commands] = DeleteOperations.deleteRight(
				controller.getPrevEditOperationType(),
				controller.context.cursorConfig,
				controller.context.model,
				controller.getSelections(),
			);

			if (match.cellViewModel.handle !== this.anchorCell?.[0].handle) {
				const delSelections = CommandExecutor.executeCommands(controller.context.model, controller.getSelections(), commands);
				if (!delSelections) {
					return;
				}
				controller.setSelections(new ViewModelEventsCollector(), undefined, delSelections, CursorChangeReason.Explicit);
			} else {
				// get the selections from the viewmodel since we run the command manually (for cursor decoration reasons)
				controller.setSelections(new ViewModelEventsCollector(), undefined, match.cellViewModel.getSelections(), CursorChangeReason.Explicit);
			}

		});
		this.updateLazyDecorations();
	}

	async undo() {
		const models: ITextModel[] = [];
		for (const match of this.trackedMatches) {
			const model = await match.cellViewModel.resolveTextModel();
			if (model) {
				models.push(model);
			}

			const controller = this.cursorsControllers.get(match.cellViewModel.uri);
			if (!controller) {
				// should not happen
				return;
			}
			controller.setSelections(new ViewModelEventsCollector(), undefined, match.cellViewModel.getSelections(), CursorChangeReason.Explicit);
		}

		await Promise.all(models.map(model => model.undo()));
		this.updateLazyDecorations();
	}

	async redo() {
		const models: ITextModel[] = [];
		for (const match of this.trackedMatches) {
			const model = await match.cellViewModel.resolveTextModel();
			if (model) {
				models.push(model);
			}

			const controller = this.cursorsControllers.get(match.cellViewModel.uri);
			if (!controller) {
				// should not happen
				return;
			}
			controller.setSelections(new ViewModelEventsCollector(), undefined, match.cellViewModel.getSelections(), CursorChangeReason.Explicit);
		}

		await Promise.all(models.map(model => model.redo()));
		this.updateLazyDecorations();
	}

	private constructCellEditorOptions(cell: ICellViewModel): EditorConfiguration {
		const cellEditorOptions = new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(cell.language), this.notebookEditor.notebookOptions, this.configurationService);
		const options = cellEditorOptions.getUpdatedValue(cell.internalMetadata, cell.uri);
		return new EditorConfiguration(false, MenuId.EditorContent, options, null, this.accessibilityService);
	}

	/**
	 * Updates the multicursor selection decorations for a specific matched cell
	 *
	 * @param match -- match object containing the viewmodel + selections
	 */
	private initializeMultiSelectDecorations(match: TrackedMatch | undefined, isCurrentWord?: boolean) {
		if (!match) {
			return;
		}

		const decorations: IModelDeltaDecoration[] = [];
		match.wordSelections.forEach(selection => {
			// mock cursor at the end of the selection
			decorations.push({
				range: Selection.fromPositions(selection.getEndPosition()),
				options: {
					description: '',
					className: this.getClassName(match.cursorConfig, true),
				}
			});
		});

		match.decorationIds = match.cellViewModel.deltaModelDecorations(
			match.decorationIds,
			decorations
		);
	}

	private updateLazyDecorations() {
		// for every tracked match that is not in the visible range, dispose of their decorations and update them based off the cursorcontroller
		this.trackedMatches.forEach(match => {
			if (match.cellViewModel.handle === this.anchorCell?.[0].handle) {
				return;
			}

			const controller = this.cursorsControllers.get(match.cellViewModel.uri);
			if (!controller) {
				// should not happen
				return;
			}
			const selections = controller.getSelections();

			const newDecorations: IModelDeltaDecoration[] = [];
			selections?.map(selection => {
				const isEmpty = selection.isEmpty();

				if (!isEmpty) {
					// selection decoration (shift+arrow, etc)
					newDecorations.push({
						range: selection,
						options: {
							description: '',
							className: this.getClassName(match.cursorConfig, false),
						}
					});
				}

				// mock cursor at the end of the selection
				newDecorations.push({
					range: Selection.fromPositions(selection.getPosition()),
					options: {
						description: '',
						zIndex: 10000,
						className: this.getClassName(match.cursorConfig, true),
					}
				});
			});

			match.decorationIds = match.cellViewModel.deltaModelDecorations(
				match.decorationIds,
				newDecorations
			);

			/**
			 * TODO: @Yoyokrazy debt
			 * goal: draw decorations for occurrence higlight on the cursor blink cycle
			 *
			 * Trigger WH with delay: x ms (x = cursor blink cycle)
			 * -> start = Date()
			 * -> WordHighlighter -> compute
			 * -> end = Date()
			 * -> delay = x - ((end - start) % x)
			 */
			const matchingEditor = this.notebookEditor.codeEditors.find(cellEditor => cellEditor[0] === match.cellViewModel);
			if (matchingEditor) {
				WordHighlighterContribution.get(matchingEditor[1])?.wordHighlighter?.trigger();
			}
		});
	}

	private clearDecorations(match: TrackedMatch) {
		match.decorationIds = match.cellViewModel.deltaModelDecorations(
			match.decorationIds,
			[]
		);
	}

	private getWord(selection: Selection, model: ITextModel): IWordAtPosition | null {
		const lineNumber = selection.startLineNumber;
		const startColumn = selection.startColumn;

		if (model.isDisposed()) {
			return null;
		}

		return model.getWordAtPosition({
			lineNumber: lineNumber,
			column: startColumn
		});
	}

	private getClassName(cursorConfig: NotebookCursorConfig, isCursor?: boolean): string {
		let result = isCursor ? '.nb-multicursor-cursor' : '.nb-multicursor-selection';

		if (isCursor) {
			// handle base style
			switch (cursorConfig.cursorStyle) {
				case TextEditorCursorStyle.Line:
					break; // default style, no additional class needed (handled by base css style)
				case TextEditorCursorStyle.Block:
					result += '.nb-cursor-block-style';
					break;
				case TextEditorCursorStyle.Underline:
					result += '.nb-cursor-underline-style';
					break;
				case TextEditorCursorStyle.LineThin:
					result += '.nb-cursor-line-thin-style';
					break;
				case TextEditorCursorStyle.BlockOutline:
					result += '.nb-cursor-block-outline-style';
					break;
				case TextEditorCursorStyle.UnderlineThin:
					result += '.nb-cursor-underline-thin-style';
					break;
				default:
					break;
			}

			// handle animation style
			switch (cursorConfig.cursorBlinking) {
				case TextEditorCursorBlinkingStyle.Blink:
					result += '.nb-blink';
					break;
				case TextEditorCursorBlinkingStyle.Smooth:
					result += '.nb-smooth';
					break;
				case TextEditorCursorBlinkingStyle.Phase:
					result += '.nb-phase';
					break;
				case TextEditorCursorBlinkingStyle.Expand:
					result += '.nb-expand';
					break;
				case TextEditorCursorBlinkingStyle.Solid:
					result += '.nb-solid';
					break;
				default:
					result += '.nb-solid';
					break;
			}

			// handle caret animation style
			if (cursorConfig.cursorSmoothCaretAnimation === 'on' || cursorConfig.cursorSmoothCaretAnimation === 'explicit') {
				result += '.nb-smooth-caret-animation';
			}

		}
		return result;
	}

	override dispose(): void {
		super.dispose();
		this.anchorDisposables.dispose();
		this.cursorsDisposables.dispose();

		this.trackedMatches.forEach(match => {
			this.clearDecorations(match);
		});
		this.trackedMatches = [];
	}

}

class NotebookAddMatchToMultiSelectionAction extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID,
			title: localize('addFindMatchToSelection', "Add Find Match to Selection"),
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
				NOTEBOOK_IS_ACTIVE_EDITOR,
				NOTEBOOK_CELL_EDITOR_FOCUSED,
			),
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
					NOTEBOOK_IS_ACTIVE_EDITOR,
					NOTEBOOK_CELL_EDITOR_FOCUSED,
				),
				primary: KeyMod.CtrlCmd | KeyCode.KeyD,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return;
		}

		if (!context.cell) {
			return;
		}

		const controller = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
		controller.findAndTrackNextSelection(context.cell);
	}
}

class NotebookExitMultiSelectionAction extends NotebookAction {
	constructor() {
		super({
			id: 'noteMultiCursor.exit',
			title: localize('exitMultiSelection', "Exit Multi Cursor Mode"),
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
				NOTEBOOK_IS_ACTIVE_EDITOR,
				NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
			),
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
					NOTEBOOK_IS_ACTIVE_EDITOR,
					NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
				),
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return;
		}

		const controller = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
		controller.resetToIdleState();
	}
}

class NotebookDeleteLeftMultiSelectionAction extends NotebookAction {
	constructor() {
		super({
			id: 'noteMultiCursor.deleteLeft',
			title: localize('deleteLeftMultiSelection', "Delete Left"),
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
				NOTEBOOK_IS_ACTIVE_EDITOR,
				NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
				ContextKeyExpr.or(
					NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting),
					NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing)
				)
			),
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
					NOTEBOOK_IS_ACTIVE_EDITOR,
					NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
					ContextKeyExpr.or(
						NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting),
						NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing)
					)
				),
				primary: KeyCode.Backspace,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return;
		}

		const controller = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
		controller.deleteLeft();
	}
}

class NotebookDeleteRightMultiSelectionAction extends NotebookAction {
	constructor() {
		super({
			id: 'noteMultiCursor.deleteRight',
			title: localize('deleteRightMultiSelection', "Delete Right"),
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
				NOTEBOOK_IS_ACTIVE_EDITOR,
				NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
				ContextKeyExpr.or(
					NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting),
					NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing)
				)
			),
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
					NOTEBOOK_IS_ACTIVE_EDITOR,
					NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
					ContextKeyExpr.or(
						NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting),
						NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing)
					)
				),
				primary: KeyCode.Delete,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const nbEditor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
		if (!nbEditor) {
			return;
		}
		const cellEditor = nbEditor.activeCodeEditor;
		if (!cellEditor) {
			return;
		}

		// need to run the command manually since we are overriding the command, this ensures proper cursor animation behavior
		CoreEditingCommands.DeleteRight.runEditorCommand(accessor, cellEditor, null);

		const controller = nbEditor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
		controller.deleteRight();
	}
}

class NotebookMultiCursorUndoRedoContribution extends Disposable {

	static readonly ID = 'workbench.contrib.notebook.multiCursorUndoRedo';

	constructor(@IEditorService private readonly _editorService: IEditorService, @IConfigurationService private readonly configurationService: IConfigurationService) {
		super();

		if (!this.configurationService.getValue<boolean>('notebook.multiCursor.enabled')) {
			return;
		}

		const PRIORITY = 10005;
		this._register(UndoCommand.addImplementation(PRIORITY, 'notebook-multicursor-undo-redo', () => {
			const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
			if (!editor) {
				return false;
			}

			if (!editor.hasModel()) {
				return false;
			}

			const controller = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);

			return controller.undo();
		}, ContextKeyExpr.and(
			ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
			NOTEBOOK_IS_ACTIVE_EDITOR,
			NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
		)));

		this._register(RedoCommand.addImplementation(PRIORITY, 'notebook-multicursor-undo-redo', () => {
			const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
			if (!editor) {
				return false;
			}

			if (!editor.hasModel()) {
				return false;
			}

			const controller = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
			return controller.redo();
		}, ContextKeyExpr.and(
			ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
			NOTEBOOK_IS_ACTIVE_EDITOR,
			NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
		)));
	}
}

registerNotebookContribution(NotebookMultiCursorController.id, NotebookMultiCursorController);
registerWorkbenchContribution2(NotebookMultiCursorUndoRedoContribution.ID, NotebookMultiCursorUndoRedoContribution, WorkbenchPhase.BlockRestore);

registerAction2(NotebookAddMatchToMultiSelectionAction);
registerAction2(NotebookExitMultiSelectionAction);
registerAction2(NotebookDeleteLeftMultiSelectionAction);
registerAction2(NotebookDeleteRightMultiSelectionAction);
