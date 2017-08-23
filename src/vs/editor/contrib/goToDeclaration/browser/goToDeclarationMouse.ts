/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./goToDeclarationMouse';
import * as nls from 'vs/nls';
import { Throttler } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { TPromise } from 'vs/base/common/winjs.base';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Location, DefinitionProviderRegistry } from 'vs/editor/common/modes';
import { ICodeEditor, IMouseTarget, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { getDefinitionsAtPosition } from './goToDeclaration';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorActiveLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { EditorState, CodeEditorStateFlag } from 'vs/editor/common/core/editorState';
import { DefinitionAction, DefinitionActionConfig } from './goToDeclarationCommands';
import { ClickLinkGesture, ClickLinkMouseEvent, ClickLinkKeyboardEvent } from 'vs/editor/contrib/goToDeclaration/browser/clickLinkGesture';

@editorContribution
class GotoDefinitionWithMouseEditorContribution implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.gotodefinitionwithmouse';
	static MAX_SOURCE_PREVIEW_LINES = 8;

	private editor: ICodeEditor;
	private toUnhook: IDisposable[];
	private decorations: string[];
	private currentWordUnderMouse: editorCommon.IWordAtPosition;
	private throttler: Throttler;

	constructor(
		editor: ICodeEditor,
		@ITextModelService private textModelResolverService: ITextModelService,
		@IModeService private modeService: IModeService
	) {
		this.toUnhook = [];
		this.decorations = [];
		this.editor = editor;
		this.throttler = new Throttler();

		let linkGesture = new ClickLinkGesture(editor);
		this.toUnhook.push(linkGesture);

		this.toUnhook.push(linkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
			this.startFindDefinition(mouseEvent, keyboardEvent);
		}));

		this.toUnhook.push(linkGesture.onExecute((mouseEvent: ClickLinkMouseEvent) => {
			if (this.isEnabled(mouseEvent)) {
				this.gotoDefinition(mouseEvent.target, mouseEvent.hasSideBySideModifier).done(() => {
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

		this.throttler.queue(() => {
			return state.validate(this.editor)
				? this.findDefinition(mouseEvent.target)
				: TPromise.as<Location[]>(null);

		}).then(results => {
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

					if (textEditorModel.getLineMaxColumn(startLineNumber) === 0) {
						ref.dispose();
						return;
					}

					const startIndent = textEditorModel.getLineFirstNonWhitespaceColumn(startLineNumber);
					const maxLineNumber = Math.min(textEditorModel.getLineCount(), startLineNumber + GotoDefinitionWithMouseEditorContribution.MAX_SOURCE_PREVIEW_LINES);
					let endLineNumber = startLineNumber + 1;
					let minIndent = startIndent;

					for (; endLineNumber < maxLineNumber; endLineNumber++) {
						let endIndent = textEditorModel.getLineFirstNonWhitespaceColumn(endLineNumber);
						minIndent = Math.min(minIndent, endIndent);
						if (startIndent === endIndent) {
							break;
						}
					}

					const previewRange = new Range(startLineNumber, 1, endLineNumber + 1, 1);
					const value = textEditorModel.getValueInRange(previewRange).replace(new RegExp(`^\\s{${minIndent - 1}}`, 'gm'), '').trim();

					this.addDecoration(
						new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
						new MarkdownString().appendCodeblock(this.modeService.getModeIdByFilenameOrFirstLine(textEditorModel.uri.fsPath), value)
					);
					ref.dispose();
				});
			}
		}).done(undefined, onUnexpectedError);
	}

	private addDecoration(range: Range, hoverMessage: MarkdownString): void {

		const newDecorations: editorCommon.IModelDeltaDecoration = {
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
			mouseEvent.target.type === MouseTargetType.CONTENT_TEXT &&
			(mouseEvent.hasTriggerModifier || (withKey && withKey.keyCodeIsTriggerKey)) &&
			DefinitionProviderRegistry.has(this.editor.getModel());
	}

	private findDefinition(target: IMouseTarget): TPromise<Location[]> {
		let model = this.editor.getModel();
		if (!model) {
			return TPromise.as(null);
		}

		return getDefinitionsAtPosition(this.editor.getModel(), target.position);
	}

	private gotoDefinition(target: IMouseTarget, sideBySide: boolean): TPromise<any> {
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

registerThemingParticipant((theme, collector) => {
	let activeLinkForeground = theme.getColor(editorActiveLinkForeground);
	if (activeLinkForeground) {
		collector.addRule(`.monaco-editor .goto-definition-link { color: ${activeLinkForeground} !important; }`);
	}
});
