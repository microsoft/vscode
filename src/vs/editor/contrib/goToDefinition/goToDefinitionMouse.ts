/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./goToDefinitionMouse';
import * as nls from 'vs/nls';
import { createCancelablePromise, CancelablePromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { DefinitionProviderRegistry, DefinitionLink } from 'vs/editor/common/modes';
import { ICodeEditor, IMouseTarget, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { getDefinitionsAtPosition } from './goToDefinition';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorActiveLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { EditorState, CodeEditorStateFlag } from 'vs/editor/browser/core/editorState';
import { DefinitionAction, DefinitionActionConfig } from './goToDefinitionCommands';
import { ClickLinkGesture, ClickLinkMouseEvent, ClickLinkKeyboardEvent } from 'vs/editor/contrib/goToDefinition/clickLinkGesture';
import { IWordAtPosition, IModelDeltaDecoration, ITextModel, IFoundBracket } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';

class GotoDefinitionWithMouseEditorContribution implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.gotodefinitionwithmouse';
	static MAX_SOURCE_PREVIEW_LINES = 8;

	private editor: ICodeEditor;
	private toUnhook: IDisposable[];
	private decorations: string[];
	private currentWordUnderMouse: IWordAtPosition;
	private previousPromise: CancelablePromise<DefinitionLink[]>;

	constructor(
		editor: ICodeEditor,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IModeService private readonly modeService: IModeService
	) {
		this.toUnhook = [];
		this.decorations = [];
		this.editor = editor;
		this.previousPromise = null;

		let linkGesture = new ClickLinkGesture(editor);
		this.toUnhook.push(linkGesture);

		this.toUnhook.push(linkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
			this.startFindDefinition(mouseEvent, keyboardEvent);
		}));

		this.toUnhook.push(linkGesture.onExecute((mouseEvent: ClickLinkMouseEvent) => {
			if (this.isEnabled(mouseEvent)) {
				this.gotoDefinition(mouseEvent.target, mouseEvent.hasSideBySideModifier).then(() => {
					this.removeDecorations();
				}, (error: Error) => {
					this.removeDecorations();
					onUnexpectedError(error);
				});
			}
		}));

		this.toUnhook.push(linkGesture.onCancel(() => {
			this.removeDecorations();
			this.currentWordUnderMouse = null;
		}));

	}

	private startFindDefinition(mouseEvent: ClickLinkMouseEvent, withKey?: ClickLinkKeyboardEvent): void {

		// check if we are active and on a content widget
		if (mouseEvent.target.type === MouseTargetType.CONTENT_WIDGET && this.decorations.length > 0) {
			return;
		}

		if (!this.isEnabled(mouseEvent, withKey)) {
			this.currentWordUnderMouse = null;
			this.removeDecorations();
			return;
		}

		// Find word at mouse position
		let position = mouseEvent.target.position;
		let word = position ? this.editor.getModel().getWordAtPosition(position) : null;
		if (!word) {
			this.currentWordUnderMouse = null;
			this.removeDecorations();
			return;
		}

		// Return early if word at position is still the same
		if (this.currentWordUnderMouse && this.currentWordUnderMouse.startColumn === word.startColumn && this.currentWordUnderMouse.endColumn === word.endColumn && this.currentWordUnderMouse.word === word.word) {
			return;
		}

		this.currentWordUnderMouse = word;

		// Find definition and decorate word if found
		let state = new EditorState(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection | CodeEditorStateFlag.Scroll);

		if (this.previousPromise) {
			this.previousPromise.cancel();
			this.previousPromise = null;
		}

		this.previousPromise = createCancelablePromise(token => this.findDefinition(mouseEvent.target, token));

		this.previousPromise.then(results => {
			if (!results || !results.length || !state.validate(this.editor)) {
				this.removeDecorations();
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
				let result = results[0];

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

					const previewValue = this.getPreviewValue(textEditorModel, startLineNumber);

					let wordRange: Range;
					if (result.origin) {
						wordRange = Range.lift(result.origin);
					} else {
						wordRange = new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
					}

					this.addDecoration(
						wordRange,
						new MarkdownString().appendCodeblock(this.modeService.getModeIdByFilepathOrFirstLine(textEditorModel.uri.fsPath), previewValue)
					);
					ref.dispose();
				});
			}
		}).then(undefined, onUnexpectedError);
	}

	private getPreviewValue(textEditorModel: ITextModel, startLineNumber: number) {
		let rangeToUse = this.getPreviewRangeBasedOnBrackets(textEditorModel, startLineNumber);
		const numberOfLinesInRange = rangeToUse.endLineNumber - rangeToUse.startLineNumber;
		if (numberOfLinesInRange >= GotoDefinitionWithMouseEditorContribution.MAX_SOURCE_PREVIEW_LINES) {
			rangeToUse = this.getPreviewRangeBasedOnIndentation(textEditorModel, startLineNumber);
		}

		const previewValue = this.stripIndentationFromPreviewRange(textEditorModel, startLineNumber, rangeToUse);
		return previewValue;
	}

	private stripIndentationFromPreviewRange(textEditorModel: ITextModel, startLineNumber: number, previewRange: Range) {
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
		const maxLineNumber = Math.min(textEditorModel.getLineCount(), startLineNumber + GotoDefinitionWithMouseEditorContribution.MAX_SOURCE_PREVIEW_LINES);
		let endLineNumber = startLineNumber + 1;

		for (; endLineNumber < maxLineNumber; endLineNumber++) {
			let endIndent = textEditorModel.getLineFirstNonWhitespaceColumn(endLineNumber);

			if (startIndent === endIndent) {
				break;
			}
		}

		return new Range(startLineNumber, 1, endLineNumber + 1, 1);
	}

	private getPreviewRangeBasedOnBrackets(textEditorModel: ITextModel, startLineNumber: number) {
		const maxLineNumber = Math.min(textEditorModel.getLineCount(), startLineNumber + GotoDefinitionWithMouseEditorContribution.MAX_SOURCE_PREVIEW_LINES);

		const brackets: IFoundBracket[] = [];

		let ignoreFirstEmpty = true;
		let currentBracket = textEditorModel.findNextBracket(new Position(startLineNumber, 1));
		while (currentBracket !== null) {

			if (brackets.length === 0) {
				brackets.push(currentBracket);
			} else {
				const lastBracket = brackets[brackets.length - 1];
				if (lastBracket.open === currentBracket.open && lastBracket.isOpen && !currentBracket.isOpen) {
					brackets.pop();
				} else {
					brackets.push(currentBracket);
				}

				if (brackets.length === 0) {
					if (ignoreFirstEmpty) {
						ignoreFirstEmpty = false;
					} else {
						return new Range(startLineNumber, 1, currentBracket.range.endLineNumber + 1, 1);
					}
				}
			}

			const maxColumn = textEditorModel.getLineMaxColumn(startLineNumber);
			let nextLineNumber = currentBracket.range.endLineNumber;
			let nextColumn = currentBracket.range.endColumn;
			if (maxColumn === currentBracket.range.endColumn) {
				nextLineNumber++;
				nextColumn = 1;
			}

			if (nextLineNumber > maxLineNumber) {
				return new Range(startLineNumber, 1, maxLineNumber + 1, 1);
			}

			currentBracket = textEditorModel.findNextBracket(new Position(nextLineNumber, nextColumn));
		}

		return new Range(startLineNumber, 1, maxLineNumber + 1, 1);
	}

	private addDecoration(range: Range, hoverMessage: MarkdownString): void {

		const newDecorations: IModelDeltaDecoration = {
			range: range,
			options: {
				inlineClassName: 'goto-definition-link',
				hoverMessage
			}
		};

		this.decorations = this.editor.deltaDecorations(this.decorations, [newDecorations]);
	}

	private removeDecorations(): void {
		if (this.decorations.length > 0) {
			this.decorations = this.editor.deltaDecorations(this.decorations, []);
		}
	}

	private isEnabled(mouseEvent: ClickLinkMouseEvent, withKey?: ClickLinkKeyboardEvent): boolean {
		return this.editor.getModel() &&
			mouseEvent.isNoneOrSingleMouseDown &&
			(mouseEvent.target.type === MouseTargetType.CONTENT_TEXT) &&
			(mouseEvent.hasTriggerModifier || (withKey && withKey.keyCodeIsTriggerKey)) &&
			DefinitionProviderRegistry.has(this.editor.getModel());
	}

	private findDefinition(target: IMouseTarget, token: CancellationToken): Promise<DefinitionLink[] | null> {
		const model = this.editor.getModel();
		if (!model) {
			return Promise.resolve(null);
		}

		return getDefinitionsAtPosition(model, target.position, token);
	}

	private gotoDefinition(target: IMouseTarget, sideBySide: boolean): Promise<any> {
		this.editor.setPosition(target.position);
		const action = new DefinitionAction(new DefinitionActionConfig(sideBySide, false, true, false), { alias: undefined, label: undefined, id: undefined, precondition: undefined });
		return this.editor.invokeWithinContext(accessor => action.run(accessor, this.editor));
	}

	public getId(): string {
		return GotoDefinitionWithMouseEditorContribution.ID;
	}

	public dispose(): void {
		this.toUnhook = dispose(this.toUnhook);
	}
}

registerEditorContribution(GotoDefinitionWithMouseEditorContribution);

registerThemingParticipant((theme, collector) => {
	const activeLinkForeground = theme.getColor(editorActiveLinkForeground);
	if (activeLinkForeground) {
		collector.addRule(`.monaco-editor .goto-definition-link { color: ${activeLinkForeground} !important; }`);
	}
});
