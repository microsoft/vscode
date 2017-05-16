/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICommandAndKeybindingRule, IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditorService, getCodeEditor } from 'vs/editor/common/services/codeEditorService';
import { CommandsRegistry, ICommandHandler, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import H = editorCommon.Handler;

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
		let editor = findFocusedEditor(accessor);
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

function findFocusedEditor(accessor: ServicesAccessor): editorCommon.ICommonCodeEditor {
	return accessor.get(ICodeEditorService).getFocusedCodeEditor();
}

function withCodeEditorFromCommandHandler(accessor: ServicesAccessor, callback: (editor: editorCommon.ICommonCodeEditor) => void): void {
	let editor = findFocusedEditor(accessor);
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
	withCodeEditorFromCommandHandler(accessor, (editor) => {
		editor.trigger('keyboard', handlerId, args);
	});
}

class CoreCommand extends Command {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		triggerEditorHandler(this.id, accessor, args);
	}
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
