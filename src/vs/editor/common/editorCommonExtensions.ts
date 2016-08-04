/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {illegalArgument, onUnexpectedError} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {SyncDescriptor1, createSyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
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

export type ServicesAccessor = ServicesAccessor;

// --- Keybinding extensions to make it more concise to express keybindings conditions
export enum ContextKey {
	None = 0,
	EditorTextFocus = 1,
	EditorFocus = 2
}
export interface IEditorActionKeybindingOptions extends IKeybindings {
	handler?: ICommandHandler;
	context: ContextKey;
	kbExpr?: KbExpr;
}
export interface IEditorCommandKeybindingOptions extends IKeybindings {
	context: ContextKey;
}
export interface IEditorCommandMenuOptions {
	kbExpr: KbExpr;
	menu?: MenuId;
	group?: string;
	order?: number;
}

// --- Editor Actions
export class EditorActionDescriptor {

	public ctor: editorCommon.IEditorActionContributionCtor;
	public id: string;
	public label: string;
	public alias: string;
	public kbOpts: IEditorActionKeybindingOptions;
	public menuOpts: IEditorCommandMenuOptions;

	constructor(ctor: editorCommon.IEditorActionContributionCtor, id: string, label: string,
		kbOpts: IEditorActionKeybindingOptions = defaultEditorActionKeybindingOptions,
		alias?: string
	) {
		this.ctor = ctor;
		this.id = id;
		this.label = label;
		this.alias = alias;
		this.kbOpts = kbOpts;
	}
}

export interface IEditorCommandHandler {
	(accessor:ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void;
}

export module CommonEditorRegistry {

	export function registerEditorAction(desc:EditorActionDescriptor) {
		(<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).registerEditorAction(desc);
	}

	export function registerEditorAction2(desc:EditorAction2) {
		(<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).registerEditorAction2(desc);
	}

	export function getEditorActions(): EditorAction2[] {
		return (<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).getEditorActions2();
	}

	// --- Editor Contributions
	export function registerEditorContribution(ctor:editorCommon.ICommonEditorContributionCtor): void {
		(<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).registerEditorContribution2(ctor);
	}
	export function getEditorContributions(): editorCommon.ICommonEditorContributionDescriptor[] {
		return (<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).getEditorContributions2();
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

class InternalEditorActionDescriptor implements editorCommon.ICommonEditorContributionDescriptor {

	private _descriptor: SyncDescriptor1<editorCommon.ICommonCodeEditor, editorCommon.IEditorContribution>;

	constructor(ctor:editorCommon.IEditorActionContributionCtor, id:string, label:string, alias:string) {
		this._descriptor = createSyncDescriptor(ctor, {
			id,
			label,
			alias
		});
	}

	public createInstance(instService:IInstantiationService, editor:editorCommon.ICommonCodeEditor): editorCommon.IEditorContribution {
		return instService.createInstance(this._descriptor, editor);
	}
}

// Editor extension points
var Extensions = {
	EditorCommonContributions: 'editor.commonContributions'
};

class EditorContributionRegistry {

	private editorContributions: editorCommon.ICommonEditorContributionDescriptor[];
	private editorActions: EditorAction2[];

	constructor() {
		this.editorContributions = [];
		this.editorActions = [];
	}

	public registerEditorContribution2(ctor:editorCommon.ICommonEditorContributionCtor): void {
		this.editorContributions.push(new SimpleEditorContributionDescriptor(ctor));
	}

	public registerEditorAction2(action:EditorAction2) {

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

		if (!action.kbOpts) {
			action.kbOpts = {
				primary: 0
			};
		}

		let commandDesc: ICommandDescriptor = {
			id: action.id,
			handler: action.kbOpts.commandHandler || triggerEditorActionGlobal.bind(null, action.id),
			weight: KeybindingsRegistry.WEIGHT.editorContrib(),
			when: action.kbOpts.kbExpr,
			primary: action.kbOpts.primary,
			secondary: action.kbOpts.secondary,
			win: action.kbOpts.win,
			linux: action.kbOpts.linux,
			mac: action.kbOpts.mac,
		};

		KeybindingsRegistry.registerCommandDesc(commandDesc);

		this.editorActions.push(action);
	}

	public registerEditorAction(desc:EditorActionDescriptor): void {
		let handler = desc.kbOpts.handler;
		if (!handler) {
			// here
			if (desc.kbOpts.context === ContextKey.EditorTextFocus || desc.kbOpts.context === ContextKey.EditorFocus) {
				handler = triggerEditorAction.bind(null, desc.id);
			} else {
				handler = triggerEditorActionGlobal.bind(null, desc.id);
			}
		}

		let when: KbExpr = null;
		if (typeof desc.kbOpts.kbExpr === 'undefined') {
			// here
			if (desc.kbOpts.context === ContextKey.EditorTextFocus) {
				when = KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS);
			} else if (desc.kbOpts.context === ContextKey.EditorFocus) {
				when = KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS);
			}
		} else {
			when = desc.kbOpts.kbExpr;
		}

		if (desc.menuOpts) {
			let {menu, kbExpr, group, order} = desc.menuOpts;
			MenuRegistry.appendMenuItem(menu || MenuId.EditorContext, {
				command: {
					id: desc.id,
					title: desc.label
				},
				when: kbExpr,
				group,
				order
			});
		}

		let commandDesc: ICommandDescriptor = {
			id: desc.id,
			handler: handler,
			weight: KeybindingsRegistry.WEIGHT.editorContrib(),
			when: when,
			primary: desc.kbOpts.primary,
			secondary: desc.kbOpts.secondary,
			win: desc.kbOpts.win,
			linux: desc.kbOpts.linux,
			mac: desc.kbOpts.mac,
		};

		KeybindingsRegistry.registerCommandDesc(commandDesc);
		this.editorContributions.push(new InternalEditorActionDescriptor(desc.ctor, desc.id, desc.label, desc.alias));
	}

	public getEditorContributions2(): editorCommon.ICommonEditorContributionDescriptor[] {
		return this.editorContributions.slice(0);
	}

	public getEditorActions2(): EditorAction2[] {
		return this.editorActions.slice(0);
	}
}
Registry.add(Extensions.EditorCommonContributions, new EditorContributionRegistry());

function triggerEditorAction(actionId: string, accessor: ServicesAccessor, args: any): void {
	withCodeEditorFromCommandHandler(actionId, accessor, (editor) => {
		editor.trigger('keyboard', actionId, args);
	});
}

function triggerEditorActionGlobal(actionId: string, accessor: ServicesAccessor, args: any): void {
	// TODO: this is not necessarily keyboard
	var focusedEditor = findFocusedEditor(actionId, accessor, false);
	if (focusedEditor) {
		focusedEditor.trigger('keyboard', actionId, args);
		return;
	}

	var activeEditor = getActiveEditor(accessor);
	if (activeEditor) {
		var action = activeEditor.getAction(actionId);
		if (action) {
			accessor.get(ITelemetryService).publicLog('editorActionInvoked', {name: action.label} );
			action.run().done(null, onUnexpectedError);
		}
		return;
	}
}

export var defaultEditorActionKeybindingOptions:IEditorActionKeybindingOptions = { primary: null, context: ContextKey.EditorTextFocus };

function whenRule(needsTextFocus: boolean, needsKey: string): KbExpr {

	let base = KbExpr.has(needsTextFocus ? editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS : editorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS);

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
	commandHandler?: ICommandHandler;
}

export abstract class EditorAction2 {

	private _needsWritableEditor: boolean;

	public id: string;
	public label: string;
	public alias: string;
	public kbOpts: IEditorActionKeybindingOptions2;
	public menuOpts: IEditorCommandMenuOptions;

	constructor(id:string, label:string, alias:string, needsWritableEditor:boolean) {
		this.id = id;
		this.label = label;
		this.alias = alias;
		this._needsWritableEditor = needsWritableEditor;
		this.kbOpts = null;
		this.menuOpts = null;
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

export abstract class HandlerEditorAction2 extends EditorAction2 {
	private _handlerId: string;

	constructor(id:string, label:string, alias:string, needsWritableEditor:boolean, handlerId: string) {
		super(id, label, alias, needsWritableEditor);
		this._handlerId = handlerId;
	}

	public run(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): void {
		editor.trigger(this.id, this._handlerId, null);
	}
}

export let EditorKbExpr: {
	TextFocus: KbExpr;
	Focus: KbExpr;

	ReadOnly: KbExpr;
	Writable: KbExpr;

	HasNonEmptySelection: KbExpr;
	HasOnlyEmptySelection: KbExpr;

	HasMultipleSelections: KbExpr;
	HasSingleSelection: KbExpr;

	TabMovesFocus: KbExpr;
	TabDoesNotMoveFocus: KbExpr;
} = {
	TextFocus: KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS),
	Focus: KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS),

	ReadOnly: KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_READONLY),
	Writable: KbExpr.not(editorCommon.KEYBINDING_CONTEXT_EDITOR_READONLY),

	HasNonEmptySelection: KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION),
	HasOnlyEmptySelection: KbExpr.not(editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION),

	HasMultipleSelections: KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS),
	HasSingleSelection: KbExpr.not(editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS),

	TabMovesFocus: KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_TAB_MOVES_FOCUS),
	TabDoesNotMoveFocus: KbExpr.not(editorCommon.KEYBINDING_CONTEXT_EDITOR_TAB_MOVES_FOCUS),
};
