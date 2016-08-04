/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindings, KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {ICommandAndKeybindingRule, KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {CommandsRegistry, ICommandHandler, ICommandHandlerDescription} from 'vs/platform/commands/common/commands';

import H = editorCommon.Handler;
import D = editorCommon.CommandDescription;
import EditorKbExpr = editorCommon.EditorKbExpr;

export interface IKeybindingsOptions {
	kbExpr?: KbExpr;
	weight?: number;
}

export interface ICommandKeybindingsOptions extends IKeybindings, IKeybindingsOptions {
}

export abstract class Command {
	public id: string;
	public kbOpts: ICommandKeybindingsOptions;

	constructor(id:string) {
		this.id = id;
		this.kbOpts = null;
	}

	public abstract runCommand(accessor:ServicesAccessor, args: any): void | TPromise<void>;

	public toCommandAndKeybindingRule(defaultWeight:number): ICommandAndKeybindingRule {
		const kbOpts = this.kbOpts || { primary: 0 };
		return {
			id: this.id,
			handler: (accessor, args) => this.runCommand(accessor, args),
			weight: kbOpts.weight || defaultWeight,
			when: kbOpts.kbExpr,
			primary: kbOpts.primary,
			secondary: kbOpts.secondary,
			win: kbOpts.win,
			linux: kbOpts.linux,
			mac: kbOpts.mac,
		};
	}
}

export interface EditorControllerCommand<T extends editorCommon.IEditorContribution> {
	new(id:string, callback:(controller:T)=>void, keybindings:ICommandKeybindingsOptions): EditorCommand;
}

export abstract class EditorCommand extends Command {

	public static bindToContribution<T extends editorCommon.IEditorContribution>(controllerGetter:(editor:editorCommon.ICommonCodeEditor) => T, defaults?:IKeybindingsOptions): EditorControllerCommand<T> {

		const defaultWeight = defaults ? defaults.weight || 0 : 0;
		const defaultKbExpr = defaults ? defaults.kbExpr || null : null;

		return class EditorControllerCommandImpl extends EditorCommand {
			private _callback:(controller:T)=>void;

			constructor(id:string, callback:(controller:T)=>void, keybindings:ICommandKeybindingsOptions) {
				super(id);

				this._callback = callback;

				this.kbOpts = {
					weight: keybindings.weight || defaultWeight,
					kbExpr: keybindings.kbExpr || defaultKbExpr,
					primary: keybindings.primary,
					secondary: keybindings.secondary,
					win: keybindings.win,
					linux: keybindings.linux,
					mac: keybindings.mac,
				};
			}

			protected runEditorCommand(accessor:ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void {
				this._callback(controllerGetter(editor));
			}
		};
	}

	constructor(id:string) {
		super(id);
	}

	public runCommand(accessor:ServicesAccessor, args: any): void | TPromise<void> {
		let editor = findFocusedEditor(this.id, accessor, false);
		if (!editor) {
			editor = getActiveEditor(accessor);
		}
		if (!editor) {
			// well, at least we tried...
			return;
		}
		return this.runEditorCommand(accessor, editor, args);
	}

	protected abstract runEditorCommand(accessor:ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void | TPromise<void>;
}

class CoreCommand extends Command {
	constructor(handlerId:string, weight: number, kbExpr: KbExpr, kb: IKeybindings) {
		super(handlerId);

		this.kbOpts = {
			weight: weight,
			kbExpr: kbExpr,
			primary: kb.primary,
			secondary: kb.secondary,
			win: kb.win,
			linux: kb.linux,
			mac: kb.mac,
		};
	}

	public runCommand(accessor:ServicesAccessor, args: any): void {
		triggerEditorHandler(this.id, accessor, args);
	}
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

function withCodeEditorFromCommandHandler(commandId: string, accessor: ServicesAccessor, callback: (editor:editorCommon.ICommonCodeEditor) => void): void {
	let editor = findFocusedEditor(commandId, accessor, true);
	if (editor) {
		callback(editor);
	}
}

function getActiveEditor(accessor: ServicesAccessor): editorCommon.ICommonCodeEditor {
	let editorService = accessor.get(IEditorService);
	let activeEditor = (<any>editorService).getActiveEditor && (<any>editorService).getActiveEditor();
	if (activeEditor) {
		let editor = <editorCommon.IEditor>activeEditor.getControl();

		// Substitute for (editor instanceof ICodeEditor)
		if (editor && typeof editor.getEditorType === 'function') {
			let codeEditor = <editorCommon.ICommonCodeEditor>editor;
			return codeEditor;
		}
	}

	return null;
}

function triggerEditorHandler(handlerId: string, accessor: ServicesAccessor, args: any): void {
	withCodeEditorFromCommandHandler(handlerId, accessor, (editor) => {
		editor.trigger('keyboard', handlerId, args);
	});
}

function registerCoreCommand(handlerId: string, kb: IKeybindings, weight?: number, when?: KbExpr): void {
	let command = new CoreCommand(
		handlerId,
		weight,
		when ? when : EditorKbExpr.TextFocus,
		kb
	);
	KeybindingsRegistry.registerCommandAndKeybindingRule(command.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorCore()));
}

function registerCoreAPICommand(handlerId: string, description: ICommandHandlerDescription): void {
	CommandsRegistry.registerCommand(handlerId, {
		handler: triggerEditorHandler.bind(null, handlerId),
		description: description
	});
}

function registerOverwritableCommand(handlerId:string, handler:ICommandHandler): void {
	CommandsRegistry.registerCommand(handlerId, handler);
	CommandsRegistry.registerCommand('default:' + handlerId, handler);
}

function registerCoreDispatchCommand(handlerId: string): void {
	registerOverwritableCommand(handlerId, triggerEditorHandler.bind(null, handlerId));
}
registerCoreDispatchCommand(H.Type);
registerCoreDispatchCommand(H.ReplacePreviousChar);
registerCoreDispatchCommand(H.Paste);
registerCoreDispatchCommand(H.Cut);

registerOverwritableCommand(H.CompositionStart, () => {});
registerOverwritableCommand(H.CompositionEnd, () => {});

function getMacWordNavigationKB(shift:boolean, key:KeyCode): number {
	// For macs, word navigation is based on the alt modifier
	if (shift) {
		return KeyMod.Shift | KeyMod.Alt | key;
	} else {
		return KeyMod.Alt | key;
	}
}

function getWordNavigationKB(shift:boolean, key:KeyCode): number {
	// Normally word navigation is based on the ctrl modifier
	if (shift) {
		return KeyMod.CtrlCmd | KeyMod.Shift | key;
	} else {
		return KeyMod.CtrlCmd | key;
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

registerCoreCommand(H.CursorLeft, {
	primary: KeyCode.LeftArrow,
	mac: { primary: KeyCode.LeftArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_B] }
});
registerCoreCommand(H.CursorLeftSelect, {
	primary: KeyMod.Shift | KeyCode.LeftArrow
});
registerCoreCommand(H.CursorRight, {
	primary: KeyCode.RightArrow,
	mac: { primary: KeyCode.RightArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_F] }
});
registerCoreCommand(H.CursorRightSelect, {
	primary: KeyMod.Shift | KeyCode.RightArrow
});
registerCoreCommand(H.CursorUp, {
	primary: KeyCode.UpArrow,
	mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_P] }
});
registerCoreCommand(H.CursorUpSelect, {
	primary: KeyMod.Shift | KeyCode.UpArrow,
	secondary: [getWordNavigationKB(true, KeyCode.UpArrow)],
	mac: { primary: KeyMod.Shift | KeyCode.UpArrow },
	linux: { primary: KeyMod.Shift | KeyCode.UpArrow }
});
registerCoreCommand(H.CursorDown, {
	primary: KeyCode.DownArrow,
	mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_N] }
});
registerCoreCommand(H.CursorDownSelect, {
	primary: KeyMod.Shift | KeyCode.DownArrow,
	secondary: [getWordNavigationKB(true, KeyCode.DownArrow)],
	mac: { primary: KeyMod.Shift | KeyCode.DownArrow },
	linux: { primary: KeyMod.Shift | KeyCode.DownArrow }
});

registerCoreCommand(H.CursorPageUp, {
	primary: KeyCode.PageUp
});
registerCoreCommand(H.CursorPageUpSelect, {
	primary: KeyMod.Shift | KeyCode.PageUp
});
registerCoreCommand(H.CursorPageDown, {
	primary: KeyCode.PageDown
});
registerCoreCommand(H.CursorPageDownSelect, {
	primary: KeyMod.Shift | KeyCode.PageDown
});
registerCoreCommand(H.CursorHome, {
	primary: KeyCode.Home,
	mac: { primary: KeyCode.Home, secondary: [KeyMod.CtrlCmd | KeyCode.LeftArrow, KeyMod.WinCtrl | KeyCode.KEY_A] }
});
registerCoreCommand(H.CursorHomeSelect, {
	primary: KeyMod.Shift | KeyCode.Home,
	mac: { primary: KeyMod.Shift | KeyCode.Home, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow] }
});
registerCoreCommand(H.CursorEnd, {
	primary: KeyCode.End,
	mac: { primary: KeyCode.End, secondary: [KeyMod.CtrlCmd | KeyCode.RightArrow, KeyMod.WinCtrl | KeyCode.KEY_E] }
});
registerCoreCommand(H.CursorEndSelect, {
	primary: KeyMod.Shift | KeyCode.End,
	mac: { primary: KeyMod.Shift | KeyCode.End, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow] }
});
registerCoreCommand(H.ExpandLineSelection, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_I
});

registerCoreAPICommand(H.EditorScroll, D.EditorScroll);

registerCoreCommand(H.ScrollLineUp, {
	primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
	mac: { primary: KeyMod.WinCtrl | KeyCode.PageUp}
});
registerCoreCommand(H.ScrollLineDown, {
	primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
	mac: { primary: KeyMod.WinCtrl | KeyCode.PageDown}
});

registerCoreCommand(H.ScrollPageUp, {
	primary: KeyMod.CtrlCmd | KeyCode.PageUp,
	win: { primary: KeyMod.Alt | KeyCode.PageUp },
	linux: { primary: KeyMod.Alt | KeyCode.PageUp }
});
registerCoreCommand(H.ScrollPageDown, {
	primary: KeyMod.CtrlCmd | KeyCode.PageDown,
	win: { primary: KeyMod.Alt | KeyCode.PageDown },
	linux: { primary: KeyMod.Alt | KeyCode.PageDown }
});

registerCoreCommand(H.CursorColumnSelectLeft, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.LeftArrow,
	linux: { primary: 0 }
});
registerCoreCommand(H.CursorColumnSelectRight, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.RightArrow,
	linux: { primary: 0 }
});
registerCoreCommand(H.CursorColumnSelectUp, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
	linux: { primary: 0 }
});
registerCoreCommand(H.CursorColumnSelectPageUp, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.PageUp,
	linux: { primary: 0 }
});
registerCoreCommand(H.CursorColumnSelectDown, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
	linux: { primary: 0 }
});
registerCoreCommand(H.CursorColumnSelectPageDown, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.PageDown,
	linux: { primary: 0 }
});

registerCoreCommand(H.Tab, {
	primary: KeyCode.Tab
}, KeybindingsRegistry.WEIGHT.editorCore(), KbExpr.and(
	EditorKbExpr.TextFocus,
	EditorKbExpr.TabDoesNotMoveFocus
));
registerCoreCommand(H.Outdent, {
	primary: KeyMod.Shift | KeyCode.Tab
}, KeybindingsRegistry.WEIGHT.editorCore(), KbExpr.and(
	EditorKbExpr.TextFocus,
	EditorKbExpr.TabDoesNotMoveFocus
));

registerCoreCommand(H.DeleteLeft, {
	primary: KeyCode.Backspace,
	secondary: [KeyMod.Shift | KeyCode.Backspace],
	mac: { primary: KeyCode.Backspace, secondary: [KeyMod.Shift | KeyCode.Backspace, KeyMod.WinCtrl | KeyCode.KEY_H, KeyMod.WinCtrl | KeyCode.Backspace] }
});
registerCoreCommand(H.DeleteRight, {
	primary: KeyCode.Delete,
	mac: { primary: KeyCode.Delete, secondary: [KeyMod.WinCtrl | KeyCode.KEY_D, KeyMod.WinCtrl | KeyCode.Delete] }
});
registerCoreCommand(H.DeleteAllLeft, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace }
});
registerCoreCommand(H.DeleteAllRight, {
	primary: null,
	mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_K, secondary: [KeyMod.CtrlCmd | KeyCode.Delete] }
});

function registerWordCommand(handlerId: string, shift:boolean, key:KeyCode): void {
	registerCoreCommand(handlerId, {
		primary: getWordNavigationKB(shift, key),
		mac: { primary: getMacWordNavigationKB(shift, key) }
	});
}
registerWordCommand(H.CursorWordStartLeft, false, KeyCode.LeftArrow);
registerCoreCommand(H.CursorWordEndLeft, { primary: 0 });
registerCoreCommand(H.CursorWordLeft, { primary: 0 });

registerWordCommand(H.CursorWordStartLeftSelect, true, KeyCode.LeftArrow);
registerCoreCommand(H.CursorWordEndLeftSelect, { primary: 0 });
registerCoreCommand(H.CursorWordLeftSelect, { primary: 0 });

registerWordCommand(H.CursorWordEndRight, false, KeyCode.RightArrow);
registerCoreCommand(H.CursorWordStartRight, { primary: 0 });
registerCoreCommand(H.CursorWordRight, { primary: 0 });

registerWordCommand(H.CursorWordEndRightSelect, true, KeyCode.RightArrow);
registerCoreCommand(H.CursorWordStartRightSelect, { primary: 0 });
registerCoreCommand(H.CursorWordRightSelect, { primary: 0 });

registerWordCommand(H.DeleteWordLeft, false, KeyCode.Backspace);
registerCoreCommand(H.DeleteWordStartLeft, { primary: 0 });
registerCoreCommand(H.DeleteWordEndLeft, { primary: 0 });

registerWordCommand(H.DeleteWordRight, false, KeyCode.Delete);
registerCoreCommand(H.DeleteWordStartRight, { primary: 0 });
registerCoreCommand(H.DeleteWordEndRight, { primary: 0 });

registerCoreCommand(H.CancelSelection, {
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape]
}, KeybindingsRegistry.WEIGHT.editorCore(), KbExpr.and(
	EditorKbExpr.TextFocus,
	EditorKbExpr.HasNonEmptySelection
));
registerCoreCommand(H.RemoveSecondaryCursors, {
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape]
}, KeybindingsRegistry.WEIGHT.editorCore(1), KbExpr.and(
	EditorKbExpr.TextFocus,
	EditorKbExpr.HasMultipleSelections
));

registerCoreCommand(H.CursorTop, {
	primary: KeyMod.CtrlCmd | KeyCode.Home,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow }
});
registerCoreCommand(H.CursorTopSelect, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Home,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow }
});
registerCoreCommand(H.CursorBottom, {
	primary: KeyMod.CtrlCmd | KeyCode.End,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow }
});
registerCoreCommand(H.CursorBottomSelect, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.End,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow }
});

registerCoreCommand(H.LineBreakInsert, {
	primary: null,
	mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_O }
});

registerCoreCommand(H.Undo, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_Z
});
registerCoreCommand(H.CursorUndo, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_U
});
registerCoreCommand(H.Redo, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_Y,
	secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z],
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z }
});


function selectAll(accessor: ServicesAccessor, args: any): void {
	let HANDLER = editorCommon.Handler.SelectAll;

	let focusedEditor = findFocusedEditor(HANDLER, accessor, false);
	// Only if editor text focus (i.e. not if editor has widget focus).
	if (focusedEditor && focusedEditor.isFocused()) {
		focusedEditor.trigger('keyboard', HANDLER, args);
		return;
	}

	// Ignore this action when user is focussed on an element that allows for entering text
	let activeElement = <HTMLElement>document.activeElement;
	if (activeElement && ['input', 'textarea'].indexOf(activeElement.tagName.toLowerCase()) >= 0) {
		(<any>activeElement).select();
		return;
	}

	// Redirecting to last active editor
	let activeEditor = getActiveEditor(accessor);
	if (activeEditor) {
		activeEditor.focus();
		activeEditor.trigger('keyboard', HANDLER, args);
		return;
	}
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'editor.action.selectAll',
	handler: selectAll,
	weight: KeybindingsRegistry.WEIGHT.editorCore(),
	when: EditorKbExpr.TextFocus,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_A
});
