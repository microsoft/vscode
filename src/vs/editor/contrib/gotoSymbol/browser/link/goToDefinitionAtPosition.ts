/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { withNullAsUndefined } from 'vs/base/common/types';
import 'vs/css!./goToDefinitionAtPosition';
import { CodeEditorStateFlag, EditorState } from 'vs/editor/contrib/editorState/browser/editorState';
import { ICodeEditor, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IEditorContribution, IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { LocationLink } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ClickLinkGesture, ClickLinkKeyboardEvent, ClickLinkMouseEvent } from 'vs/editor/contrib/gotoSymbol/browser/link/clickLinkGesture';
import { PeekContext } from 'vs/editor/contrib/peekView/browser/peekView';
import * as nls from 'vs/nls';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { editorActiveLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { DefinitionAction } from '../goToCommands';
import { getDefinitionsAtPosition } from '../goToSymbol';
import { IWordAtPosition } from 'vs/editor/common/core/wordHelper';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

export class GotoDefinitionAtPositionEditorContribution implements IEditorContribution {

	public static readonly ID = 'editor.contrib.gotodefinitionatposition';
	static readonly MAX_SOURCE_PREVIEW_LINES = 8;

	private readonly editor: ICodeEditor;
	private readonly toUnhook = new DisposableStore();
	private readonly toUnhookForKeyboard = new DisposableStore();
	private readonly linkDecorations: IEditorDecorationsCollection;
	private currentWordAtPosition: IWordAtPosition | null = null;
	private previousPromise: CancelablePromise<LocationLink[] | null> | null = null;

	constructor(
		editor: ICodeEditor,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		this.editor = editor;
		this.linkDecorations = this.editor.createDecorationsCollection();

		const linkGesture = new ClickLinkGesture(editor);
		this.toUnhook.add(linkGesture);

		this.toUnhook.add(linkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
			this.startFindDefinitionFromMouse(mouseEvent, withNullAsUndefined(keyboardEvent));
		}));

		this.toUnhook.add(linkGesture.onExecute((mouseEvent: ClickLinkMouseEvent) => {
			if (this.isEnabled(mouseEvent)) {
				this.gotoDefinition(mouseEvent.target.position!, mouseEvent.hasSideBySideModifier).then(() => {
					this.removeLinkDecorations();
				}, (error: Error) => {
					this.removeLinkDecorations();
					onUnexpectedError(error);
				});
			}
		}));

		this.toUnhook.add(linkGesture.onCancel(() => {
			this.removeLinkDecorations();
			this.currentWordAtPosition = null;
		}));
	}

	static get(editor: ICodeEditor): GotoDefinitionAtPositionEditorContribution | null {
		return editor.getContribution<GotoDefinitionAtPositionEditorContribution>(GotoDefinitionAtPositionEditorContribution.ID);
	}

	startFindDefinitionFromCursor(position: Position) {
		// For issue: https://github.com/microsoft/vscode/issues/46257
		// equivalent to mouse move with meta/ctrl key

		// First find the definition and add decorations
		// to the editor to be shown with the content hover widget
		return this.startFindDefinition(position).then(() => {

			// Add listeners for editor cursor move and key down events
			// Dismiss the "extended" editor decorations when the user hides
			// the hover widget. There is no event for the widget itself so these
			// serve as a best effort. After removing the link decorations, the hover
			// widget is clean and will only show declarations per next request.
			this.toUnhookForKeyboard.add(this.editor.onDidChangeCursorPosition(() => {
				this.currentWordAtPosition = null;
				this.removeLinkDecorations();
				this.toUnhookForKeyboard.clear();
			}));

			this.toUnhookForKeyboard.add(this.editor.onKeyDown((e: IKeyboardEvent) => {
				if (e) {
					this.currentWordAtPosition = null;
					this.removeLinkDecorations();
					this.toUnhookForKeyboard.clear();
				}
			}));
		});
	}

	private startFindDefinitionFromMouse(mouseEvent: ClickLinkMouseEvent, withKey?: ClickLinkKeyboardEvent): void {

		// check if we are active and on a content widget
		if (mouseEvent.target.type === MouseTargetType.CONTENT_WIDGET && this.linkDecorations.length > 0) {
			return;
		}

		if (!this.editor.hasModel() || !this.isEnabled(mouseEvent, withKey)) {
			this.currentWordAtPosition = null;
			this.removeLinkDecorations();
			return;
		}

		const position = mouseEvent.target.position!;

		this.startFindDefinition(position);
	}

	private startFindDefinition(position: Position): Promise<number | undefined> {

		// Dispose listeners for updating decorations when using keyboard to show definition hover
		this.toUnhookForKeyboard.clear();

		// Find word at mouse position
		const word = position ? this.editor.getModel()?.getWordAtPosition(position) : null;
		if (!word) {
			this.currentWordAtPosition = null;
			this.removeLinkDecorations();
			return Promise.resolve(0);
		}

		// Return early if word at position is still the same
		if (this.currentWordAtPosition && this.currentWordAtPosition.startColumn === word.startColumn && this.currentWordAtPosition.endColumn === word.endColumn && this.currentWordAtPosition.word === word.word) {
			return Promise.resolve(0);
		}

		this.currentWordAtPosition = word;

		// Find definition and decorate word if found
		const state = new EditorState(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection | CodeEditorStateFlag.Scroll);

		if (this.previousPromise) {
			this.previousPromise.cancel();
			this.previousPromise = null;
		}

		this.previousPromise = createCancelablePromise(token => this.findDefinition(position, token));

		return this.previousPromise.then(results => {
			if (!results || !results.length || !state.validate(this.editor)) {
				this.removeLinkDecorations();
				return;
			}

			// Multiple results
			if (results.length > 1) {
				this.addDecoration(
					new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
					new MarkdownString().appendText(nls.localize('multipleResults', "Click to show {0} definitions.", results.length))
				);
			}

			// Single result
			else {
				const result = results[0];

				if (!result.uri) {
					return;
				}

				this.textModelResolverService.createModelReference(result.uri).then(ref => {

					if (!ref.object || !ref.object.textEditorModel) {
						ref.dispose();
						return;
					}

					const { object: { textEditorModel } } = ref;
					const { startLineNumber } = result.range;

					if (startLineNumber < 1 || startLineNumber > textEditorModel.getLineCount()) {
						// invalid range
						ref.dispose();
						return;
					}

					const previewValue = this.getPreviewValue(textEditorModel, startLineNumber, result);

					let wordRange: Range;
					if (result.originSelectionRange) {
						wordRange = Range.lift(result.originSelectionRange);
					} else {
						wordRange = new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
					}

					const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(textEditorModel.uri);
					this.addDecoration(
						wordRange,
						new MarkdownString().appendCodeblock(languageId ? languageId : '', previewValue)
					);
					ref.dispose();
				});
			}
		}).then(undefined, onUnexpectedError);
	}

	private getPreviewValue(textEditorModel: ITextModel, startLineNumber: number, result: LocationLink) {
		let rangeToUse = result.range;
		const numberOfLinesInRange = rangeToUse.endLineNumber - rangeToUse.startLineNumber;
		if (numberOfLinesInRange >= GotoDefinitionAtPositionEditorContribution.MAX_SOURCE_PREVIEW_LINES) {
			rangeToUse = this.getPreviewRangeBasedOnIndentation(textEditorModel, startLineNumber);
		}

		const previewValue = this.stripIndentationFromPreviewRange(textEditorModel, startLineNumber, rangeToUse);
		return previewValue;
	}

	private stripIndentationFromPreviewRange(textEditorModel: ITextModel, startLineNumber: number, previewRange: IRange) {
		const startIndent = textEditorModel.getLineFirstNonWhitespaceColumn(startLineNumber);
		let minIndent = startIndent;

		for (let endLineNumber = startLineNumber + 1; endLineNumber < previewRange.endLineNumber; endLineNumber++) {
			const endIndent = textEditorModel.getLineFirstNonWhitespaceColumn(endLineNumber);
			minIndent = Math.min(minIndent, endIndent);
		}

		const previewValue = textEditorModel.getValueInRange(previewRange).replace(new RegExp(`^\\s{${minIndent - 1}}`, 'gm'), '').trim();
		return previewValue;
	}

	private getPreviewRangeBasedOnIndentation(textEditorModel: ITextModel, startLineNumber: number) {
		const startIndent = textEditorModel.getLineFirstNonWhitespaceColumn(startLineNumber);
		const maxLineNumber = Math.min(textEditorModel.getLineCount(), startLineNumber + GotoDefinitionAtPositionEditorContribution.MAX_SOURCE_PREVIEW_LINES);
		let endLineNumber = startLineNumber + 1;

		for (; endLineNumber < maxLineNumber; endLineNumber++) {
			const endIndent = textEditorModel.getLineFirstNonWhitespaceColumn(endLineNumber);

			if (startIndent === endIndent) {
				break;
			}
		}

		return new Range(startLineNumber, 1, endLineNumber + 1, 1);
	}

	private addDecoration(range: Range, hoverMessage: MarkdownString): void {

		const newDecorations: IModelDeltaDecoration = {
			range: range,
			options: {
				description: 'goto-definition-link',
				inlineClassName: 'goto-definition-link',
				hoverMessage
			}
		};

		this.linkDecorations.set([newDecorations]);
	}

	private removeLinkDecorations(): void {
		this.linkDecorations.clear();
	}

	private isEnabled(mouseEvent: ClickLinkMouseEvent, withKey?: ClickLinkKeyboardEvent): boolean {
		return this.editor.hasModel()
			&& mouseEvent.isLeftClick
			&& mouseEvent.isNoneOrSingleMouseDown
			&& mouseEvent.target.type === MouseTargetType.CONTENT_TEXT
			&& (mouseEvent.hasTriggerModifier || (withKey ? withKey.keyCodeIsTriggerKey : false))
			&& this.languageFeaturesService.definitionProvider.has(this.editor.getModel());
	}

	private findDefinition(position: Position, token: CancellationToken): Promise<LocationLink[] | null> {
		const model = this.editor.getModel();
		if (!model) {
			return Promise.resolve(null);
		}

		return getDefinitionsAtPosition(this.languageFeaturesService.definitionProvider, model, position, token);
	}

	private gotoDefinition(position: Position, openToSide: boolean): Promise<any> {
		this.editor.setPosition(position);
		return this.editor.invokeWithinContext((accessor) => {
			const canPeek = !openToSide && this.editor.getOption(EditorOption.definitionLinkOpensInPeek) && !this.isInPeekEditor(accessor);
			const action = new DefinitionAction({ openToSide, openInPeek: canPeek, muteMessage: true }, { title: { value: '', original: '' }, id: '', precondition: undefined });
			return action.run(accessor, this.editor);
		});
	}

	private isInPeekEditor(accessor: ServicesAccessor): boolean | undefined {
		const contextKeyService = accessor.get(IContextKeyService);
		return PeekContext.inPeekEditor.getValue(contextKeyService);
	}

	public dispose(): void {
		this.toUnhook.dispose();
	}
}

registerEditorContribution(GotoDefinitionAtPositionEditorContribution.ID, GotoDefinitionAtPositionEditorContribution);

registerThemingParticipant((theme, collector) => {
	const activeLinkForeground = theme.getColor(editorActiveLinkForeground);
	if (activeLinkForeground) {
		collector.addRule(`.monaco-editor .goto-definition-link { color: ${activeLinkForeground} !important; }`);
	}
});
