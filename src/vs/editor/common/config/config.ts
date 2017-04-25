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
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import * as types from 'vs/base/common/types';
import H = editorCommon.Handler;

const CORE_WEIGHT = KeybindingsRegistry.WEIGHT.editorCore();


export namespace RevealLine {

	const isRevealLineArgs = function (arg): boolean {
		if (!types.isObject(arg)) {
			return false;
		}

		let reveaLineArg: RawArguments = arg;

		if (!types.isNumber(reveaLineArg.lineNumber)) {
			return false;
		}

		if (!types.isUndefined(reveaLineArg.at) && !types.isString(reveaLineArg.at)) {
			return false;
		}

		return true;
	};

	export const description = <ICommandHandlerDescription>{
		description: 'Reveal the given line at the given logical position',
		args: [
			{
				name: 'Reveal line argument object',
				description: `Property-value pairs that can be passed through this argument:
					* 'lineNumber': A mandatory line number value.
					* 'at': Logical position at which line has to be revealed .
						\`\`\`
						'top', 'center', 'bottom'
						\`\`\`
				`,
				constraint: isRevealLineArgs
			}
		]
	};

	/**
	 * Arguments for reveal line command
	 */
	export interface RawArguments {
		lineNumber?: number;
		at?: string;
	};

	/**
	 * Values for reveal line 'at' argument
	 */
	export const RawAtArgument = {
		Top: 'top',
		Center: 'center',
		Bottom: 'bottom'
	};
}

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

		const weight = (typeof kbOpts.weight === 'number' ? kbOpts.weight : defaultWeight);

		return {
			id: this.id,
			handler: (accessor, args) => this.runCommand(accessor, args),
			weight: weight,
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

// Register cursor commands

registerCoreAPICommand(H.RevealLine, RevealLine.description);

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
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: CORE_WEIGHT,
				kbExpr: EditorContextKeys.textFocus,
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
			precondition: EditorContextKeys.writable,
			kbOpts: {
				weight: CORE_WEIGHT,
				kbExpr: EditorContextKeys.textFocus,
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