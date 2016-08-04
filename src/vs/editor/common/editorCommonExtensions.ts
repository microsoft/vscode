/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {illegalArgument} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {ServicesAccessor, IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindings, KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {ICommandHandler} from 'vs/platform/commands/common/commands';
import {ICommandDescriptor, KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {Registry} from 'vs/platform/platform';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {findFocusedEditor, getActiveEditor, withCodeEditorFromCommandHandler} from 'vs/editor/common/config/config';
import {Position} from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IModelService} from 'vs/editor/common/services/modelService';
import {MenuId, MenuRegistry} from 'vs/platform/actions/common/actions';

import EditorKbExpr = editorCommon.EditorKbExpr;

export type ServicesAccessor = ServicesAccessor;

// --- Keybinding extensions to make it more concise to express keybindings conditions
export interface IEditorCommandMenuOptions {
	kbExpr: KbExpr;
	menu?: MenuId;
	group?: string;
	order?: number;
}

// --- Editor Actions

export interface IEditorCommandHandler {
	(accessor:ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void;
}

export module CommonEditorRegistry {

	export function registerEditorAction(desc:EditorAction) {
		(<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).registerEditorAction(desc);
	}

	export function getEditorActions(): EditorAction[] {
		return (<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).getEditorActions();
	}

	// --- Editor Contributions
	export function registerEditorContribution(ctor:editorCommon.ICommonEditorContributionCtor): void {
		(<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).registerEditorContribution(ctor);
	}
	export function getEditorContributions(): editorCommon.ICommonEditorContributionDescriptor[] {
		return (<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).getEditorContributions();
	}

	// --- Editor Commands
	export function commandWeight(importance: number = 0): number {
		return KeybindingsRegistry.WEIGHT.editorContrib(importance);
	}

	export function registerEditorCommand(commandId: string, weight: number, keybinding:IKeybindings, needsTextFocus: boolean, needsKey: string, handler: IEditorCommandHandler): void {
		var commandDesc: ICommandDescriptor = {
			id: commandId,
			handler: createCommandHandler(commandId, handler),
			weight: weight,
			when: whenRule(needsTextFocus, needsKey),
			primary: keybinding.primary,
			secondary: keybinding.secondary,
			win: keybinding.win,
			linux: keybinding.linux,
			mac: keybinding.mac,
		};

		KeybindingsRegistry.registerCommandDesc(commandDesc);
	}

	export function registerEditorCommand2(desc: EditorCommand): void {
		KeybindingsRegistry.registerCommandDesc(desc.toCommandDescriptor(KeybindingsRegistry.WEIGHT.editorContrib()));
	}

	export function registerLanguageCommand(id: string, handler: (accessor: ServicesAccessor, args: { [n: string]: any }) => any) {
		KeybindingsRegistry.registerCommandDesc({
			id,
			handler(accessor, args: any) {
				return handler(accessor, args || {});
			},
			weight: KeybindingsRegistry.WEIGHT.editorContrib(),
			primary: undefined,
			when: undefined,
		});
	}

	export function registerDefaultLanguageCommand(id: string, handler: (model: editorCommon.IModel, position: Position, args: { [n: string]: any }) => any) {
		registerLanguageCommand(id, function(accessor, args) {

			const {resource, position} = args;
			if (!(resource instanceof URI) || !Position.isIPosition(position)) {
				throw illegalArgument();
			}

			const model = accessor.get(IModelService).getModel(resource);
			if (!model) {
				throw illegalArgument();
			}

			const editorPosition = Position.lift(position);

			return handler(model, editorPosition, args);
		});
	}
}

class SimpleEditorContributionDescriptor implements editorCommon.ICommonEditorContributionDescriptor {
	private _ctor:editorCommon.ICommonEditorContributionCtor;

	constructor(ctor:editorCommon.ICommonEditorContributionCtor) {
		this._ctor = ctor;
	}

	public createInstance(instantiationService: IInstantiationService, editor:editorCommon.ICommonCodeEditor): editorCommon.IEditorContribution {
		return instantiationService.createInstance(this._ctor, editor);
	}
}

// Editor extension points
var Extensions = {
	EditorCommonContributions: 'editor.commonContributions'
};

class EditorContributionRegistry {

	private editorContributions: editorCommon.ICommonEditorContributionDescriptor[];
	private editorActions: EditorAction[];

	constructor() {
		this.editorContributions = [];
		this.editorActions = [];
	}

	public registerEditorContribution(ctor:editorCommon.ICommonEditorContributionCtor): void {
		this.editorContributions.push(new SimpleEditorContributionDescriptor(ctor));
	}

	public registerEditorAction(action:EditorAction) {

		if (action.menuOpts) {
			MenuRegistry.appendMenuItem(action.menuOpts.menu || MenuId.EditorContext, {
				command: {
					id: action.id,
					title: action.label
				},
				when: action.menuOpts.kbExpr,
				group: action.menuOpts.group,
				order: action.menuOpts.order
			});
		}

		KeybindingsRegistry.registerCommandDesc(action.toCommandDescriptor(KeybindingsRegistry.WEIGHT.editorContrib()));

		this.editorActions.push(action);
	}

	public getEditorContributions(): editorCommon.ICommonEditorContributionDescriptor[] {
		return this.editorContributions.slice(0);
	}

	public getEditorActions(): EditorAction[] {
		return this.editorActions.slice(0);
	}
}
Registry.add(Extensions.EditorCommonContributions, new EditorContributionRegistry());

export function whenRule(needsTextFocus: boolean, needsKey: string): KbExpr {

	let base = (needsTextFocus ? EditorKbExpr.TextFocus : EditorKbExpr.Focus);

	if (needsKey) {
		return KbExpr.and(base, KbExpr.has(needsKey));
	}

	return base;
}

function createCommandHandler(commandId: string, handler: IEditorCommandHandler): ICommandHandler {
	return (accessor, args) => {
		withCodeEditorFromCommandHandler(commandId, accessor, (editor) => {
			handler(accessor, editor, args||{});
		});
	};
}

export interface IEditorActionKeybindingOptions2 extends IKeybindings {
	kbExpr?: KbExpr;
	weight?: number;
}

export abstract class Command {
	public id: string;
	public kbOpts: IEditorActionKeybindingOptions2;

	constructor(id:string) {
		this.id = id;
		this.kbOpts = null;
	}

	public abstract runCommand(accessor:ServicesAccessor, args: any): void | TPromise<void>;

	public toCommandDescriptor(defaultWeight:number): ICommandDescriptor {
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
	new(id:string, callback:(controller:T)=>void, keybindings:IKeybindings): EditorCommand;
}

export abstract class EditorCommand extends Command {

	public static bindToContribution<T extends editorCommon.IEditorContribution>(controllerGetter:(editor:editorCommon.ICommonCodeEditor) => T, weight: number, kbExpr: KbExpr): EditorControllerCommand<T> {
		return class EditorControllerCommandImpl extends EditorCommand {
			private _callback:(controller:T)=>void;

			constructor(id:string, callback:(controller:T)=>void, keybindings:IKeybindings) {
				super(id);

				this._callback = callback;

				this.kbOpts = {
					weight: weight,
					kbExpr: kbExpr,
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

export abstract class EditorAction extends EditorCommand {

	private _needsWritableEditor: boolean;

	public label: string;
	public alias: string;
	public menuOpts: IEditorCommandMenuOptions;

	constructor(id:string, label:string, alias:string, needsWritableEditor:boolean) {
		super(id);
		this.label = label;
		this.alias = alias;
		this._needsWritableEditor = needsWritableEditor;
		this.menuOpts = null;
	}

	protected runEditorCommand(accessor:ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void | TPromise<void> {
		if (!this.enabled(accessor, editor)) {
			return;
		}

		accessor.get(ITelemetryService).publicLog('editorActionInvoked', { name: this.label, id: this.id });
		return this.run(accessor, editor);
	}

	public enabled(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): boolean {
		if (this._needsWritableEditor) {
			return !editor.getConfiguration().readOnly;
		}
		return true;
	}

	public supported(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): boolean {
		if (this._needsWritableEditor) {
			return !editor.getConfiguration().readOnly;
		}
		return true;
	}

	public abstract run(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): void | TPromise<void>;
}

export abstract class HandlerEditorAction extends EditorAction {
	private _handlerId: string;

	constructor(id:string, label:string, alias:string, needsWritableEditor:boolean, handlerId: string) {
		super(id, label, alias, needsWritableEditor);
		this._handlerId = handlerId;
	}

	public run(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): void {
		editor.trigger(this.id, this._handlerId, null);
	}
}
