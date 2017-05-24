/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./goToDeclarationMouse';
import * as nls from 'vs/nls';
import { Throttler } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { MarkedString } from 'vs/base/common/htmlContent';
import { KeyCode } from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import * as browser from 'vs/base/browser/browser';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Location, DefinitionProviderRegistry } from 'vs/editor/common/modes';
import { ICodeEditor, IEditorMouseEvent, IMouseTarget, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { getDefinitionsAtPosition } from './goToDeclaration';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorActiveLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { EditorState, CodeEditorStateFlag } from 'vs/editor/common/core/editorState';
import { DefinitionAction, DefinitionActionConfig } from './goToDeclarationCommands';

/**
 * An event that encapsulates the various trigger modifiers logic needed for go to definition.
 */
class MyMouseEvent {

	public readonly target: IMouseTarget;
	public readonly hasTriggerModifier: boolean;
	public readonly hasSideBySideModifier: boolean;
	public readonly isSingleMouseDown: boolean;

	constructor(source: IEditorMouseEvent) {
		this.target = source.target;
		this.hasTriggerModifier = !!source.event[GotoDefinitionWithMouseEditorContribution.TRIGGER_MODIFIER];
		this.hasSideBySideModifier = source.event.altKey;
		this.isSingleMouseDown = (browser.isIE || source.event.detail <= 1); // IE does not support event.detail properly
	}
}

/**
 * An event that encapsulates the various trigger modifiers logic needed for go to definition.
 */
class MyKeyboardEvent {

	public readonly keyCodeIsTriggerKey: boolean;
	public readonly keyCodeIsSideBySideKey: boolean;
	public readonly hasTriggerModifier: boolean;

	constructor(source: IKeyboardEvent) {
		this.keyCodeIsTriggerKey = (source.keyCode === GotoDefinitionWithMouseEditorContribution.TRIGGER_KEY_VALUE);
		this.keyCodeIsSideBySideKey = (source.keyCode === GotoDefinitionWithMouseEditorContribution.TRIGGER_SIDEBYSIDE_KEY_VALUE);
		this.hasTriggerModifier = !!source[GotoDefinitionWithMouseEditorContribution.TRIGGER_MODIFIER];
	}
}

@editorContribution
class GotoDefinitionWithMouseEditorContribution implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.gotodefinitionwithmouse';
	static TRIGGER_MODIFIER = platform.isMacintosh ? 'metaKey' : 'ctrlKey';
	static TRIGGER_SIDEBYSIDE_KEY_VALUE = KeyCode.Alt;
	static TRIGGER_KEY_VALUE = platform.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
	static MAX_SOURCE_PREVIEW_LINES = 8;

	private editor: ICodeEditor;
	private toUnhook: IDisposable[];
	private decorations: string[];
	private currentWordUnderMouse: editorCommon.IWordAtPosition;
	private throttler: Throttler;
	private lastMouseMoveEvent: MyMouseEvent;
	private hasTriggerKeyOnMouseDown: boolean;

	constructor(
		editor: ICodeEditor,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@IModeService private modeService: IModeService
	) {
		this.toUnhook = [];
		this.decorations = [];
		this.editor = editor;
		this.throttler = new Throttler();

		this.toUnhook.push(this.editor.onMouseDown((e: IEditorMouseEvent) => this.onEditorMouseDown(new MyMouseEvent(e))));
		this.toUnhook.push(this.editor.onMouseUp((e: IEditorMouseEvent) => this.onEditorMouseUp(new MyMouseEvent(e))));
		this.toUnhook.push(this.editor.onMouseMove((e: IEditorMouseEvent) => this.onEditorMouseMove(new MyMouseEvent(e))));
		this.toUnhook.push(this.editor.onMouseDrag(() => this.resetHandler()));
		this.toUnhook.push(this.editor.onKeyDown((e: IKeyboardEvent) => this.onEditorKeyDown(new MyKeyboardEvent(e))));
		this.toUnhook.push(this.editor.onKeyUp((e: IKeyboardEvent) => this.onEditorKeyUp(new MyKeyboardEvent(e))));

		this.toUnhook.push(this.editor.onDidChangeCursorSelection((e) => this.onDidChangeCursorSelection(e)));
		this.toUnhook.push(this.editor.onDidChangeModel((e) => this.resetHandler()));
		this.toUnhook.push(this.editor.onDidChangeModelContent(() => this.resetHandler()));
		this.toUnhook.push(this.editor.onDidScrollChange((e) => {
			if (e.scrollTopChanged || e.scrollLeftChanged) {
				this.resetHandler();
			}
		}));
	}

	private onDidChangeCursorSelection(e: ICursorSelectionChangedEvent): void {
		if (e.selection && e.selection.startColumn !== e.selection.endColumn) {
			this.resetHandler(); // immediately stop this feature if the user starts to select (https://github.com/Microsoft/vscode/issues/7827)
		}
	}

	private onEditorMouseMove(mouseEvent: MyMouseEvent): void {
		this.lastMouseMoveEvent = mouseEvent;

		this.startFindDefinition(mouseEvent);
	}

	private startFindDefinition(mouseEvent: MyMouseEvent, withKey?: MyKeyboardEvent): void {
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
				this.addDecoration(new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn), nls.localize('multipleResults', "Click to show {0} definitions.", results.length));
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

					this.addDecoration(new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn), {
						language: this.modeService.getModeIdByFilenameOrFirstLine(textEditorModel.uri.fsPath),
						value
					});
					ref.dispose();
				});
			}
		}).done(undefined, onUnexpectedError);
	}

	private addDecoration(range: Range, hoverMessage: MarkedString): void {

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

	private onEditorKeyDown(e: MyKeyboardEvent): void {
		if (
			this.lastMouseMoveEvent
			&& (
				e.keyCodeIsTriggerKey // User just pressed Ctrl/Cmd (normal goto definition)
				|| (e.keyCodeIsSideBySideKey && e.hasTriggerModifier) // User pressed Ctrl/Cmd+Alt (goto definition to the side)
			)
		) {
			this.startFindDefinition(this.lastMouseMoveEvent, e);
		} else if (e.hasTriggerModifier) {
			this.removeDecorations(); // remove decorations if user holds another key with ctrl/cmd to prevent accident goto declaration
		}
	}

	private resetHandler(): void {
		this.lastMouseMoveEvent = null;
		this.hasTriggerKeyOnMouseDown = false;
		this.removeDecorations();
	}

	private onEditorMouseDown(mouseEvent: MyMouseEvent): void {
		// We need to record if we had the trigger key on mouse down because someone might select something in the editor
		// holding the mouse down and then while mouse is down start to press Ctrl/Cmd to start a copy operation and then
		// release the mouse button without wanting to do the navigation.
		// With this flag we prevent goto definition if the mouse was down before the trigger key was pressed.
		this.hasTriggerKeyOnMouseDown = mouseEvent.hasTriggerModifier;
	}

	private onEditorMouseUp(mouseEvent: MyMouseEvent): void {
		if (this.isEnabled(mouseEvent) && this.hasTriggerKeyOnMouseDown) {
			this.gotoDefinition(mouseEvent.target, mouseEvent.hasSideBySideModifier).done(() => {
				this.removeDecorations();
			}, (error: Error) => {
				this.removeDecorations();
				onUnexpectedError(error);
			});
		}
	}

	private onEditorKeyUp(e: MyKeyboardEvent): void {
		if (e.keyCodeIsTriggerKey) {
			this.removeDecorations();
			this.currentWordUnderMouse = null;
		}
	}

	private isEnabled(mouseEvent: MyMouseEvent, withKey?: MyKeyboardEvent): boolean {
		return this.editor.getModel() &&
			mouseEvent.isSingleMouseDown &&
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
