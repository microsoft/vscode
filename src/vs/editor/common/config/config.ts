/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICommandAndKeybindingRule, KeybindingsRegistry, IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditorService, getCodeEditor } from 'vs/editor/common/services/codeEditorService';
import { CommandsRegistry, ICommandHandler, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';

import H = editorCommon.Handler;
import D = editorCommon.CommandDescription;
import EditorContextKeys = editorCommon.EditorContextKeys;

const CORE_WEIGHT = KeybindingsRegistry.WEIGHT.editorCore();

export interface ICommandKeybindingsOptions extends IKeybindings {
	kbExpr?: ContextKeyExpr;
	weight?: number;
}

export interface ICommandOptions {
	id: string;
	precondition: ContextKeyExpr;
	kbOpts?: ICommandKeybindingsOptions;
	description?: ICommandHandlerDescription;
}

export abstract class Command {
	public id: string;
	public precondition: ContextKeyExpr;
	private kbOpts: ICommandKeybindingsOptions;
	private description: ICommandHandlerDescription;

	constructor(opts: ICommandOptions) {
		this.id = opts.id;
		this.precondition = opts.precondition;
		this.kbOpts = opts.kbOpts;
		this.description = opts.description;
	}

	public abstract runCommand(accessor: ServicesAccessor, args: any): void | TPromise<void>;

	public toCommandAndKeybindingRule(defaultWeight: number): ICommandAndKeybindingRule {
		const kbOpts = this.kbOpts || { primary: 0 };

		let kbWhen = kbOpts.kbExpr;
		if (this.precondition) {
			if (kbWhen) {
				kbWhen = ContextKeyExpr.and(kbWhen, this.precondition);
			} else {
				kbWhen = this.precondition;
			}
		}

		return {
			id: this.id,
			handler: (accessor, args) => this.runCommand(accessor, args),
			weight: kbOpts.weight || defaultWeight,
			when: kbWhen,
			primary: kbOpts.primary,
			secondary: kbOpts.secondary,
			win: kbOpts.win,
			linux: kbOpts.linux,
			mac: kbOpts.mac,
			description: this.description
		};
	}
}

export interface EditorControllerCommand<T extends editorCommon.IEditorContribution> {
	new (opts: IContributionCommandOptions<T>): EditorCommand;
}

export interface IContributionCommandOptions<T> extends ICommandOptions {
	handler: (controller: T) => void;
}

export abstract class EditorCommand extends Command {

	public static bindToContribution<T extends editorCommon.IEditorContribution>(controllerGetter: (editor: editorCommon.ICommonCodeEditor) => T): EditorControllerCommand<T> {

		return class EditorControllerCommandImpl extends EditorCommand {
			private _callback: (controller: T) => void;

			constructor(opts: IContributionCommandOptions<T>) {
				super(opts);

				this._callback = opts.handler;
			}

			public runEditorCommand(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void {
				let controller = controllerGetter(editor);
				if (controller) {
					this._callback(controllerGetter(editor));
				}
			}
		};
	}

	constructor(opts: ICommandOptions) {
		super(opts);
	}

	public runCommand(accessor: ServicesAccessor, args: any): void | TPromise<void> {
		let editor = findFocusedEditor(this.id, accessor, false);
		if (!editor) {
			editor = getActiveEditorWidget(accessor);
		}
		if (!editor) {
			// well, at least we tried...
			return;
		}
		return editor.invokeWithinContext((editorAccessor) => {
			const kbService = editorAccessor.get(IContextKeyService);
			if (!kbService.contextMatchesRules(this.precondition)) {
				// precondition does not hold
				return;
			}

			return this.runEditorCommand(editorAccessor, editor, args);
		});
	}

	public abstract runEditorCommand(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void | TPromise<void>;
}

export function findFocusedEditor(commandId: string, accessor: ServicesAccessor, complain: boolean): editorCommon.ICommonCodeEditor {
	let editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
	if (!editor) {
		if (complain) {
			console.warn('Cannot execute ' + commandId + ' because no code editor is focused.');
		}
		return null;
	}
	return editor;
}

function withCodeEditorFromCommandHandler(commandId: string, accessor: ServicesAccessor, callback: (editor: editorCommon.ICommonCodeEditor) => void): void {
	let editor = findFocusedEditor(commandId, accessor, true);
	if (editor) {
		callback(editor);
	}
}

function getActiveEditorWidget(accessor: ServicesAccessor): editorCommon.ICommonCodeEditor {
	const editorService = accessor.get(IEditorService);
	let activeEditor = (<any>editorService).getActiveEditor && (<any>editorService).getActiveEditor();
	return getCodeEditor(activeEditor);
}

function triggerEditorHandler(handlerId: string, accessor: ServicesAccessor, args: any): void {
	withCodeEditorFromCommandHandler(handlerId, accessor, (editor) => {
		editor.trigger('keyboard', handlerId, args);
	});
}

class CoreCommand extends Command {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		triggerEditorHandler(this.id, accessor, args);
	}
}

class UnboundCoreCommand extends CoreCommand {
	constructor(handlerId: string, precondition: ContextKeyExpr = null) {
		super({
			id: handlerId,
			precondition: precondition
		});
	}
}

function registerCommand(command: Command) {
	KeybindingsRegistry.registerCommandAndKeybindingRule(command.toCommandAndKeybindingRule(CORE_WEIGHT));
}

function registerCoreAPICommand(handlerId: string, description: ICommandHandlerDescription): void {
	CommandsRegistry.registerCommand(handlerId, {
		handler: triggerEditorHandler.bind(null, handlerId),
		description: description
	});
}

function registerOverwritableCommand(handlerId: string, handler: ICommandHandler): void {
	CommandsRegistry.registerCommand(handlerId, handler);
	CommandsRegistry.registerCommand('default:' + handlerId, handler);
}

function registerCoreDispatchCommand(handlerId: string): void {
	registerOverwritableCommand(handlerId, triggerEditorHandler.bind(null, handlerId));
}
registerCoreDispatchCommand(H.Type);
registerCoreDispatchCommand(H.ReplacePreviousChar);
registerCoreDispatchCommand(H.CompositionStart);
registerCoreDispatchCommand(H.CompositionEnd);
registerCoreDispatchCommand(H.Paste);
registerCoreDispatchCommand(H.Cut);

class WordCommand extends CoreCommand {
	public static getMacWordNavigationKB(shift: boolean, key: KeyCode): number {
		// For macs, word navigation is based on the alt modifier
		if (shift) {
			return KeyMod.Shift | KeyMod.Alt | key;
		} else {
			return KeyMod.Alt | key;
		}
	}

	public static getWordNavigationKB(shift: boolean, key: KeyCode): number {
		// Normally word navigation is based on the ctrl modifier
		if (shift) {
			return KeyMod.CtrlCmd | KeyMod.Shift | key;
		} else {
			return KeyMod.CtrlCmd | key;
		}
	}

	constructor(handlerId: string, shift: boolean, key: KeyCode, precondition: ContextKeyExpr = null) {
		super({
			id: handlerId,
			precondition: precondition,
			kbOpts: {
				weight: CORE_WEIGHT,
				kbExpr: EditorContextKeys.TextFocus,
				primary: WordCommand.getWordNavigationKB(shift, key),
				mac: { primary: WordCommand.getMacWordNavigationKB(shift, key) }
			}
		});
	}
}

// https://support.apple.com/en-gb/HT201236
// [ADDED] Control-H					Delete the character to the left of the insertion point. Or use Delete.
// [ADDED] Control-D					Delete the character to the right of the insertion point. Or use Fn-Delete.
// [ADDED] Control-K					Delete the text between the insertion point and the end of the line or paragraph.
// [ADDED] Command–Up Arrow				Move the insertion point to the beginning of the document.
// [ADDED] Command–Down Arrow			Move the insertion point to the end of the document.
// [ADDED] Command–Left Arrow			Move the insertion point to the beginning of the current line.
// [ADDED] Command–Right Arrow			Move the insertion point to the end of the current line.
// [ADDED] Option–Left Arrow			Move the insertion point to the beginning of the previous word.
// [ADDED] Option–Right Arrow			Move the insertion point to the end of the next word.
// [ADDED] Command–Shift–Up Arrow		Select the text between the insertion point and the beginning of the document.
// [ADDED] Command–Shift–Down Arrow		Select the text between the insertion point and the end of the document.
// [ADDED] Command–Shift–Left Arrow		Select the text between the insertion point and the beginning of the current line.
// [ADDED] Command–Shift–Right Arrow	Select the text between the insertion point and the end of the current line.
// [USED BY DUPLICATE LINES] Shift–Option–Up Arrow		Extend text selection to the beginning of the current paragraph, then to the beginning of the following paragraph if pressed again.
// [USED BY DUPLICATE LINES] Shift–Option–Down Arrow	Extend text selection to the end of the current paragraph, then to the end of the following paragraph if pressed again.
// [ADDED] Shift–Option–Left Arrow		Extend text selection to the beginning of the current word, then to the beginning of the following word if pressed again.
// [ADDED] Shift–Option–Right Arrow		Extend text selection to the end of the current word, then to the end of the following word if pressed again.
// [ADDED] Control-A					Move to the beginning of the line or paragraph.
// [ADDED] Control-E					Move to the end of a line or paragraph.
// [ADDED] Control-F					Move one character forward.
// [ADDED] Control-B					Move one character backward.
//Control-L								Center the cursor or selection in the visible area.
// [ADDED] Control-P					Move up one line.
// [ADDED] Control-N					Move down one line.
// [ADDED] Control-O					Insert a new line after the insertion point.
//Control-T								Swap the character behind the insertion point with the character in front of the insertion point.
// Unconfirmed????
//	Config.addKeyBinding(editorCommon.Handler.CursorPageDown,		KeyMod.WinCtrl | KeyCode.KEY_V);

// OS X built in commands
// Control+y => yank
// [ADDED] Command+backspace => Delete to Hard BOL
// [ADDED] Command+delete => Delete to Hard EOL
// [ADDED] Control+k => Delete to Hard EOL
// Control+l => show_at_center
// Control+Command+d => noop
// Control+Command+shift+d => noop

// Register cursor commands
registerCoreAPICommand(H.CursorMove, D.CursorMove);

registerCommand(new CoreCommand({
	id: H.CursorLeft,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.LeftArrow,
		mac: { primary: KeyCode.LeftArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_B] }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorLeftSelect,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.Shift | KeyCode.LeftArrow
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorRight,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.RightArrow,
		mac: { primary: KeyCode.RightArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_F] }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorRightSelect,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.Shift | KeyCode.RightArrow
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorUp,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.UpArrow,
		mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_P] }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorUpSelect,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.Shift | KeyCode.UpArrow,
		secondary: [WordCommand.getWordNavigationKB(true, KeyCode.UpArrow)],
		mac: { primary: KeyMod.Shift | KeyCode.UpArrow },
		linux: { primary: KeyMod.Shift | KeyCode.UpArrow }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorDown,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.DownArrow,
		mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_N] }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorDownSelect,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.Shift | KeyCode.DownArrow,
		secondary: [WordCommand.getWordNavigationKB(true, KeyCode.DownArrow)],
		mac: { primary: KeyMod.Shift | KeyCode.DownArrow },
		linux: { primary: KeyMod.Shift | KeyCode.DownArrow }
	}
}));

registerCommand(new CoreCommand({
	id: H.CursorPageUp,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.PageUp
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorPageUpSelect,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.Shift | KeyCode.PageUp
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorPageDown,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.PageDown
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorPageDownSelect,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.Shift | KeyCode.PageDown
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorHome,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.Home,
		mac: { primary: KeyCode.Home, secondary: [KeyMod.CtrlCmd | KeyCode.LeftArrow, KeyMod.WinCtrl | KeyCode.KEY_A] }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorHomeSelect,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.Shift | KeyCode.Home,
		mac: { primary: KeyMod.Shift | KeyCode.Home, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow] }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorEnd,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.End,
		mac: { primary: KeyCode.End, secondary: [KeyMod.CtrlCmd | KeyCode.RightArrow, KeyMod.WinCtrl | KeyCode.KEY_E] }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorEndSelect,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.Shift | KeyCode.End,
		mac: { primary: KeyMod.Shift | KeyCode.End, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow] }
	}
}));
registerCommand(new CoreCommand({
	id: H.ExpandLineSelection,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyCode.KEY_I
	}
}));

registerCoreAPICommand(H.EditorScroll, D.EditorScroll);

registerCommand(new CoreCommand({
	id: H.ScrollLineUp,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
		mac: { primary: KeyMod.WinCtrl | KeyCode.PageUp }
	}
}));
registerCommand(new CoreCommand({
	id: H.ScrollLineDown,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
		mac: { primary: KeyMod.WinCtrl | KeyCode.PageDown }
	}
}));

registerCommand(new CoreCommand({
	id: H.ScrollPageUp,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyCode.PageUp,
		win: { primary: KeyMod.Alt | KeyCode.PageUp },
		linux: { primary: KeyMod.Alt | KeyCode.PageUp }
	}
}));
registerCommand(new CoreCommand({
	id: H.ScrollPageDown,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyCode.PageDown,
		win: { primary: KeyMod.Alt | KeyCode.PageDown },
		linux: { primary: KeyMod.Alt | KeyCode.PageDown }
	}
}));

registerCoreAPICommand(H.RevealLine, D.RevealLine);

registerCommand(new CoreCommand({
	id: H.CursorColumnSelectLeft,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.LeftArrow,
		linux: { primary: 0 }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorColumnSelectRight,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.RightArrow,
		linux: { primary: 0 }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorColumnSelectUp,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
		linux: { primary: 0 }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorColumnSelectPageUp,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.PageUp,
		linux: { primary: 0 }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorColumnSelectDown,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
		linux: { primary: 0 }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorColumnSelectPageDown,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.PageDown,
		linux: { primary: 0 }
	}
}));

registerCommand(new CoreCommand({
	id: H.Tab,
	precondition: EditorContextKeys.Writable,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: ContextKeyExpr.and(
			EditorContextKeys.TextFocus,
			EditorContextKeys.TabDoesNotMoveFocus
		),
		primary: KeyCode.Tab
	}
}));
registerCommand(new CoreCommand({
	id: H.Outdent,
	precondition: EditorContextKeys.Writable,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: ContextKeyExpr.and(
			EditorContextKeys.TextFocus,
			EditorContextKeys.TabDoesNotMoveFocus
		),
		primary: KeyMod.Shift | KeyCode.Tab
	}
}));

registerCommand(new CoreCommand({
	id: H.DeleteLeft,
	precondition: EditorContextKeys.Writable,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.Backspace,
		secondary: [KeyMod.Shift | KeyCode.Backspace],
		mac: { primary: KeyCode.Backspace, secondary: [KeyMod.Shift | KeyCode.Backspace, KeyMod.WinCtrl | KeyCode.KEY_H, KeyMod.WinCtrl | KeyCode.Backspace] }
	}
}));
registerCommand(new CoreCommand({
	id: H.DeleteRight,
	precondition: EditorContextKeys.Writable,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.Delete,
		mac: { primary: KeyCode.Delete, secondary: [KeyMod.WinCtrl | KeyCode.KEY_D, KeyMod.WinCtrl | KeyCode.Delete] }
	}
}));

registerCommand(new CoreCommand({
	id: H.CancelSelection,
	precondition: EditorContextKeys.HasNonEmptySelection,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));
registerCommand(new CoreCommand({
	id: H.RemoveSecondaryCursors,
	precondition: EditorContextKeys.HasMultipleSelections,
	kbOpts: {
		weight: CORE_WEIGHT + 1,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));

registerCommand(new CoreCommand({
	id: H.CursorTop,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyCode.Home,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorTopSelect,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Home,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorBottom,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyCode.End,
		mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow }
	}
}));
registerCommand(new CoreCommand({
	id: H.CursorBottomSelect,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.End,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow }
	}
}));

registerCommand(new CoreCommand({
	id: H.LineBreakInsert,
	precondition: EditorContextKeys.Writable,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: null,
		mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_O }
	}
}));

registerCommand(new CoreCommand({
	id: H.CursorUndo,
	precondition: null,
	kbOpts: {
		weight: CORE_WEIGHT,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyCode.KEY_U
	}
}));

abstract class BaseTextInputAwareCommand extends Command {

	public runCommand(accessor: ServicesAccessor, args: any): void {
		let HANDLER = this.getEditorHandler();

		let focusedEditor = findFocusedEditor(HANDLER, accessor, false);
		// Only if editor text focus (i.e. not if editor has widget focus).
		if (focusedEditor && focusedEditor.isFocused()) {
			focusedEditor.trigger('keyboard', HANDLER, args);
			return;
		}

		// Ignore this action when user is focussed on an element that allows for entering text
		let activeElement = <HTMLElement>document.activeElement;
		if (activeElement && ['input', 'textarea'].indexOf(activeElement.tagName.toLowerCase()) >= 0) {
			document.execCommand(this.getInputHandler());
			return;
		}

		// Redirecting to last active editor
		let activeEditor = getActiveEditorWidget(accessor);
		if (activeEditor) {
			activeEditor.focus();
			activeEditor.trigger('keyboard', HANDLER, args);
			return;
		}
	}

	protected abstract getEditorHandler(): string;

	protected abstract getInputHandler(): string;
}

class SelectAllCommand extends BaseTextInputAwareCommand {

	constructor() {
		super({
			id: 'editor.action.selectAll',
			precondition: null,
			kbOpts: {
				weight: CORE_WEIGHT,
				kbExpr: null,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_A
			}
		});
	}

	protected getEditorHandler(): string {
		return editorCommon.Handler.SelectAll;
	}

	protected getInputHandler(): string {
		return 'selectAll';
	}
}
registerCommand(new SelectAllCommand());

class UndoCommand extends BaseTextInputAwareCommand {

	constructor() {
		super({
			id: H.Undo,
			precondition: EditorContextKeys.Writable,
			kbOpts: {
				weight: CORE_WEIGHT,
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Z
			}
		});
	}

	protected getEditorHandler(): string {
		return H.Undo;
	}

	protected getInputHandler(): string {
		return 'undo';
	}
}
registerCommand(new UndoCommand());

class RedoCommand extends BaseTextInputAwareCommand {

	constructor() {
		super({
			id: H.Redo,
			precondition: EditorContextKeys.Writable,
			kbOpts: {
				weight: CORE_WEIGHT,
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Y,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z],
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z }
			}
		});
	}

	protected getEditorHandler(): string {
		return H.Redo;
	}

	protected getInputHandler(): string {
		return 'redo';
	}
}
registerCommand(new RedoCommand());