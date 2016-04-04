/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./goToDeclaration';
import * as nls from 'vs/nls';
import {coalesce} from 'vs/base/common/arrays';
import {Throttler} from 'vs/base/common/async';
import {onUnexpectedError} from 'vs/base/common/errors';
import {ListenerUnbind} from 'vs/base/common/eventEmitter';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import * as browser from 'vs/base/browser/browser';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IMessageService} from 'vs/platform/message/common/message';
import {IRequestService} from 'vs/platform/request/common/request';
import {Range} from 'vs/editor/common/core/range';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IReference} from 'vs/editor/common/modes';
import {tokenizeToHtmlContent} from 'vs/editor/common/modes/textToHtmlTokenizer';
import {ICodeEditor, IEditorMouseEvent, IMouseTarget} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {DeclarationRegistry, getDeclarationsAtPosition} from 'vs/editor/contrib/goToDeclaration/common/goToDeclaration';
import {FindReferencesController} from 'vs/editor/contrib/referenceSearch/browser/referenceSearch';

const DEFAULT_BEHAVIOR = Behaviour.WidgetFocus | Behaviour.ShowInContextMenu | Behaviour.UpdateOnCursorPositionChange;

function metaTitle(references: IReference[]): string {
	if (references.length > 1) {
		return nls.localize('meta.title', " – {0} definitions", references.length);
	}
}

export abstract class GoToTypeAction extends EditorAction {

	constructor(
		descriptor: editorCommon.IEditorActionDescriptorData,
		editor: editorCommon.ICommonCodeEditor,
		private _messageService: IMessageService,
		private _editorService: IEditorService,
		condition = DEFAULT_BEHAVIOR
	) {
		super(descriptor, editor, condition);
	}

	public run(): TPromise<any> {
		let model = this.editor.getModel();
		let position = this.editor.getPosition();
		let promise = this._resolve(model.getAssociatedResource(), { lineNumber: position.lineNumber, column: position.column });

		return promise.then(references => {

			// remove falsy entries
			references = coalesce(references);
			if (!references || references.length === 0) {
				return;
			}

			// only use the start position
			references = references.map(reference => {
				return {
					resource: reference.resource,
					range: Range.collapseToStart(reference.range)
				};
			});

			// open and reveal
			if (references.length === 1 && !this._showSingleReferenceInPeek()) {
				return this._editorService.openEditor({
					resource: references[0].resource,
					options: { selection: references[0].range }
				}, this.openToTheSide);

			} else {
				let controller = FindReferencesController.getController(this.editor);
				return controller.processRequest(this.editor.getSelection(), TPromise.as(references), metaTitle);
			}

		}, (err) => {
			// report an error
			this._messageService.show(Severity.Error, err);
			return false;
		});
	}

	protected get openToTheSide(): boolean {
		return false;
	}

	protected abstract _resolve(resource: URI, position: editorCommon.IPosition): TPromise<IReference[]>;

	protected _showSingleReferenceInPeek() {
		return false;
	}
}

export class GoToTypeDeclarationActions extends GoToTypeAction {

	public static ID = 'editor.action.goToTypeDeclaration';

	constructor(
		descriptor: editorCommon.IEditorActionDescriptorData,
		editor: editorCommon.ICommonCodeEditor,
		@IMessageService messageService: IMessageService,
		@IEditorService editorService: IEditorService
	) {
		super(descriptor, editor, messageService, editorService);
	}

	public getGroupId(): string {
		return '1_goto/3_visitTypeDefinition';
	}

	public isSupported(): boolean {
		return !!this.editor.getModel().getMode().typeDeclarationSupport && super.isSupported();
	}

	public getEnablementState(): boolean {
		if (!super.getEnablementState()) {
			return false;
		}

		let model = this.editor.getModel(),
			position = this.editor.getSelection().getStartPosition();

		return model.getMode().typeDeclarationSupport.canFindTypeDeclaration(
			model.getLineContext(position.lineNumber),
			position.column - 1
		);
	}

	protected _resolve(resource: URI, position: editorCommon.IPosition): TPromise<IReference[]> {
		let typeDeclarationSupport = this.editor.getModel().getMode().typeDeclarationSupport;
		if (typeDeclarationSupport) {
			return typeDeclarationSupport.findTypeDeclaration(<any>resource, position).then(value => [value]);
		}
	}
}

export abstract class BaseGoToDeclarationAction extends GoToTypeAction {

	constructor(
		descriptor: editorCommon.IEditorActionDescriptorData,
		editor: editorCommon.ICommonCodeEditor,
		messageService: IMessageService,
		editorService: IEditorService,
		condition: Behaviour
	) {
		super(descriptor, editor, messageService, editorService, condition);
	}

	public getGroupId(): string {
		return '1_goto/2_visitDefinition';
	}

	public isSupported(): boolean {
		return DeclarationRegistry.has(this.editor.getModel()) && super.isSupported();
	}

	public getEnablementState(): boolean {
		if (!super.getEnablementState()) {
			return false;
		}

		let model = this.editor.getModel(),
			position = this.editor.getSelection().getStartPosition();

		return DeclarationRegistry.all(model).some(provider => {
			return provider.canFindDeclaration(
				model.getLineContext(position.lineNumber),
				position.column - 1);
		});
	}


	protected _resolve(resource: URI, position: editorCommon.IPosition): TPromise<IReference[]> {
		return getDeclarationsAtPosition(this.editor.getModel(), this.editor.getPosition());
	}
}

export class GoToDeclarationAction extends BaseGoToDeclarationAction {

	public static ID = 'editor.action.goToDeclaration';

	constructor(
		descriptor: editorCommon.IEditorActionDescriptorData,
		editor: editorCommon.ICommonCodeEditor,
		@IMessageService messageService: IMessageService,
		@IEditorService editorService: IEditorService
	) {
		super(descriptor, editor, messageService, editorService, DEFAULT_BEHAVIOR);
	}
}

export class OpenDeclarationToTheSideAction extends BaseGoToDeclarationAction {

	public static ID = 'editor.action.openDeclarationToTheSide';

	constructor(
		descriptor: editorCommon.IEditorActionDescriptorData,
		editor: editorCommon.ICommonCodeEditor,
		@IMessageService messageService: IMessageService,
		@IEditorService editorService: IEditorService
	) {
		super(descriptor, editor, messageService, editorService, Behaviour.WidgetFocus | Behaviour.UpdateOnCursorPositionChange);
	}

	protected get openToTheSide(): boolean {
		return true;
	}
}

export class PreviewDeclarationAction extends BaseGoToDeclarationAction {

	public static ID = 'editor.action.previewDeclaration';

	constructor(
		descriptor: editorCommon.IEditorActionDescriptorData,
		editor: editorCommon.ICommonCodeEditor,
		@IMessageService messageService: IMessageService,
		@IEditorService editorService: IEditorService
	) {
		super(descriptor, editor, messageService, editorService, DEFAULT_BEHAVIOR);
	}

	protected _showSingleReferenceInPeek() {
		return true;
	}
}

// --- Editor Contribution to goto definition using the mouse and a modifier key

class GotoDefinitionWithMouseEditorContribution implements editorCommon.IEditorContribution {

	static ID = 'editor.contrib.gotodefinitionwithmouse';
	static TRIGGER_MODIFIER = platform.isMacintosh ? 'metaKey' : 'ctrlKey';
	static TRIGGER_SIDEBYSIDE_KEY_VALUE = KeyCode.Alt;
	static TRIGGER_KEY_VALUE = platform.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
	static MAX_SOURCE_PREVIEW_LINES = 7;

	private editor: ICodeEditor;
	private toUnhook: ListenerUnbind[];
	private hasRequiredServices: boolean;
	private decorations: string[];
	private currentWordUnderMouse: editorCommon.IWordAtPosition;
	private throttler: Throttler;
	private lastMouseMoveEvent: IEditorMouseEvent;
	private hasTriggerKeyOnMouseDown: boolean;

	constructor(
		editor: ICodeEditor,
		@IRequestService private requestService: IRequestService,
		@IMessageService private messageService: IMessageService,
		@IEditorService private editorService: IEditorService
	) {
		this.hasRequiredServices = !!this.messageService && !!this.requestService && !!this.editorService;

		this.toUnhook = [];
		this.decorations = [];
		this.editor = editor;
		this.throttler = new Throttler();

		this.toUnhook.push(this.editor.addListener(editorCommon.EventType.MouseDown, (e: IEditorMouseEvent) => this.onEditorMouseDown(e)));
		this.toUnhook.push(this.editor.addListener(editorCommon.EventType.MouseUp, (e: IEditorMouseEvent) => this.onEditorMouseUp(e)));
		this.toUnhook.push(this.editor.addListener(editorCommon.EventType.MouseMove, (e: IEditorMouseEvent) => this.onEditorMouseMove(e)));
		this.toUnhook.push(this.editor.addListener(editorCommon.EventType.KeyDown, (e: IKeyboardEvent) => this.onEditorKeyDown(e)));
		this.toUnhook.push(this.editor.addListener(editorCommon.EventType.KeyUp, (e: IKeyboardEvent) => this.onEditorKeyUp(e)));

		this.toUnhook.push(this.editor.addListener(editorCommon.EventType.ModelChanged, (e: editorCommon.IModelContentChangedEvent) => this.resetHandler()));
		this.toUnhook.push(this.editor.addListener('change', (e: editorCommon.IModelContentChangedEvent) => this.resetHandler()));
		this.toUnhook.push(this.editor.addListener('scroll', () => this.resetHandler()));
	}

	private onEditorMouseMove(mouseEvent: IEditorMouseEvent, withKey?: IKeyboardEvent): void {
		this.lastMouseMoveEvent = mouseEvent;

		this.startFindDefinition(mouseEvent, withKey);
	}

	private startFindDefinition(mouseEvent: IEditorMouseEvent, withKey?: IKeyboardEvent): void {
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
		let state = this.editor.captureState(editorCommon.CodeEditorStateFlag.Position, editorCommon.CodeEditorStateFlag.Value, editorCommon.CodeEditorStateFlag.Selection, editorCommon.CodeEditorStateFlag.Scroll);
		this.throttler.queue(() => {
			return state.validate(this.editor)
				? this.findDefinition(mouseEvent.target)
				: TPromise.as(null);

		}).then(results => {
			if (!results || !results.length || !state.validate(this.editor)) {
				this.removeDecorations();
				return;
			}

			// Multiple results
			if (results.length > 1) {
				this.addDecoration({
					startLineNumber: position.lineNumber,
					startColumn: word.startColumn,
					endLineNumber: position.lineNumber,
					endColumn: word.endColumn
				}, nls.localize('multipleResults', "Click to show the {0} definitions found.", results.length), false);
			}

			// Single result
			else {
				let result = results[0];
				this.editorService.resolveEditorModel({ resource: result.resource }).then(model => {
					let source: string;
					if (model && model.textEditorModel) {

						let from = Math.max(1, result.range.startLineNumber),
							to: number,
							editorModel: editorCommon.IModel;

						editorModel = <editorCommon.IModel>model.textEditorModel;

						// if we have a range, take that into consideration for the "to" position, otherwise fallback to MAX_SOURCE_PREVIEW_LINES
						if (result.range.startLineNumber !== result.range.endLineNumber || result.range.startColumn !== result.range.endColumn) {
							to = Math.min(result.range.endLineNumber, result.range.startLineNumber + GotoDefinitionWithMouseEditorContribution.MAX_SOURCE_PREVIEW_LINES, editorModel.getLineCount());
						} else {
							to = Math.min(from + GotoDefinitionWithMouseEditorContribution.MAX_SOURCE_PREVIEW_LINES, editorModel.getLineCount());
						}

						source = editorModel.getValueInRange({
							startLineNumber: from,
							startColumn: 1,
							endLineNumber: to,
							endColumn: editorModel.getLineMaxColumn(to)
						}).trim();

						// remove common leading whitespace
						let min = Number.MAX_VALUE,
							regexp = /^[ \t]*/,
							match: RegExpExecArray,
							contents: string;

						while (from <= to && min > 0) {
							contents = editorModel.getLineContent(from++);
							if (contents.trim().length === 0) {
								// empty or whitespace only
								continue;
							}
							match = regexp.exec(contents);
							min = Math.min(min, match[0].length);
						}

						source = source.replace(new RegExp(`^([ \\t]{${min}})`, 'gm'), strings.empty);

						if (result.range.endLineNumber - result.range.startLineNumber > GotoDefinitionWithMouseEditorContribution.MAX_SOURCE_PREVIEW_LINES) {
							source += '\n\u2026';
						}
					}

					this.addDecoration({
						startLineNumber: position.lineNumber,
						startColumn: word.startColumn,
						endLineNumber: position.lineNumber,
						endColumn: word.endColumn
					}, source, true);
				});
			}
		}).done(undefined, onUnexpectedError);
	}

	private addDecoration(range: editorCommon.IRange, text: string, isCode: boolean): void {
		let model = this.editor.getModel();
		if (!model) {
			return;
		}

		let htmlMessage: IHTMLContentElement = {
			tagName: 'div',
			className: 'goto-definition-link-hover',
			style: `tab-size: ${model.getOptions().tabSize}`
		};

		if (text && text.trim().length > 0) {
			// not whitespace only
			htmlMessage.children = [isCode ? tokenizeToHtmlContent(text, model.getMode()) : { tagName: 'span', text }];
		}

		let newDecorations = {
			range: range,
			options: {
				inlineClassName: 'goto-definition-link',
				htmlMessage: [htmlMessage]
			}
		};

		this.decorations = this.editor.deltaDecorations(this.decorations, [newDecorations]);
	}

	private removeDecorations(): void {
		if (this.decorations.length > 0) {
			this.decorations = this.editor.deltaDecorations(this.decorations, []);
		}
	}

	private onEditorKeyDown(e: IKeyboardEvent): void {
		if (
			this.lastMouseMoveEvent && (
				e.keyCode === GotoDefinitionWithMouseEditorContribution.TRIGGER_KEY_VALUE || // User just pressed Ctrl/Cmd (normal goto definition)
				e.keyCode === GotoDefinitionWithMouseEditorContribution.TRIGGER_SIDEBYSIDE_KEY_VALUE && e[GotoDefinitionWithMouseEditorContribution.TRIGGER_MODIFIER] // User pressed Ctrl/Cmd+Alt (goto definition to the side)
			)
		) {
			this.startFindDefinition(this.lastMouseMoveEvent, e);
		} else if (e[GotoDefinitionWithMouseEditorContribution.TRIGGER_MODIFIER]) {
			this.removeDecorations(); // remove decorations if user holds another key with ctrl/cmd to prevent accident goto declaration
		}
	}

	private resetHandler(): void {
		this.lastMouseMoveEvent = null;
		this.removeDecorations();
	}

	private onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		// We need to record if we had the trigger key on mouse down because someone might select something in the editor
		// holding the mouse down and then while mouse is down start to press Ctrl/Cmd to start a copy operation and then
		// release the mouse button without wanting to do the navigation.
		// With this flag we prevent goto definition if the mouse was down before the trigger key was pressed.
		this.hasTriggerKeyOnMouseDown = !!mouseEvent.event[GotoDefinitionWithMouseEditorContribution.TRIGGER_MODIFIER];
	}

	private onEditorMouseUp(mouseEvent: IEditorMouseEvent): void {
		if (this.isEnabled(mouseEvent) && this.hasTriggerKeyOnMouseDown) {
			this.gotoDefinition(mouseEvent.target, mouseEvent.event.altKey).done(() => {
				this.removeDecorations();
			}, (error: Error) => {
				this.removeDecorations();
				onUnexpectedError(error);
			});
		}
	}

	private onEditorKeyUp(e: IKeyboardEvent): void {
		if (e.keyCode === GotoDefinitionWithMouseEditorContribution.TRIGGER_KEY_VALUE) {
			this.removeDecorations();
			this.currentWordUnderMouse = null;
		}
	}

	private isEnabled(mouseEvent: IEditorMouseEvent, withKey?: IKeyboardEvent): boolean {
		return this.hasRequiredServices &&
			this.editor.getModel() &&
			(browser.isIE11orEarlier || mouseEvent.event.detail <= 1) && // IE does not support event.detail properly
			mouseEvent.target.type === editorCommon.MouseTargetType.CONTENT_TEXT &&
			(mouseEvent.event[GotoDefinitionWithMouseEditorContribution.TRIGGER_MODIFIER] || (withKey && withKey.keyCode === GotoDefinitionWithMouseEditorContribution.TRIGGER_KEY_VALUE)) &&
			DeclarationRegistry.has(this.editor.getModel());
	}

	private findDefinition(target: IMouseTarget): TPromise<IReference[]> {
		let model = this.editor.getModel();
		if (!model) {
			return TPromise.as(null);
		}

		return getDeclarationsAtPosition(this.editor.getModel(), target.position);
	}

	private gotoDefinition(target: IMouseTarget, sideBySide: boolean): TPromise<any> {
		let state = this.editor.captureState(editorCommon.CodeEditorStateFlag.Position, editorCommon.CodeEditorStateFlag.Value, editorCommon.CodeEditorStateFlag.Selection, editorCommon.CodeEditorStateFlag.Scroll);

		return this.findDefinition(target).then((results: IReference[]) => {
			if (!results || !results.length || !state.validate(this.editor)) {
				return;
			}

			let position = target.position;
			let word = this.editor.getModel().getWordAtPosition(position);

			// Find valid target (and not the same position as the current hovered word)
			let validResults = results
				.filter(result => result.range && !(word && result.range.startColumn === word.startColumn && result.range.startLineNumber === target.position.lineNumber))
				.map((result) => {
					return {
						resource: result.resource,
						range: Range.collapseToStart(result.range)
					};
				});

			if (!validResults.length) {
				return;
			}

			// Muli result: Show in references UI
			if (validResults.length > 1) {
				let controller = FindReferencesController.getController(this.editor);
				return controller.processRequest(this.editor.getSelection(), TPromise.as(validResults), metaTitle);
			}

			// Single result: Open
			return this.editorService.openEditor({
				resource: validResults[0].resource,
				options: {
					selection: validResults[0].range
				}
			}, sideBySide);
		});
	}

	public getId(): string {
		return GotoDefinitionWithMouseEditorContribution.ID;
	}

	public dispose(): void {
		while (this.toUnhook.length > 0) {
			this.toUnhook.pop()();
		}
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(PreviewDeclarationAction, PreviewDeclarationAction.ID, nls.localize('actions.previewDecl.label', "Peek Definition"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Alt | KeyCode.F12,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F10 },
}));

let goToDeclarationKb: number;
if (platform.isWeb) {
	goToDeclarationKb = KeyMod.CtrlCmd | KeyCode.F12;
} else {
	goToDeclarationKb = KeyCode.F12;
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(GoToDeclarationAction, GoToDeclarationAction.ID, nls.localize('actions.goToDecl.label', "Go to Definition"), {
	context: ContextKey.EditorTextFocus,
	primary: goToDeclarationKb
}));

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(OpenDeclarationToTheSideAction, OpenDeclarationToTheSideAction.ID, nls.localize('actions.goToDeclToSide.label', "Open Definition to the Side"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, goToDeclarationKb)
}));

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(GoToTypeDeclarationActions, GoToTypeDeclarationActions.ID, nls.localize('actions.gotoTypeDecl.label', "Go to Type Definition")));
EditorBrowserRegistry.registerEditorContribution(GotoDefinitionWithMouseEditorContribution);
