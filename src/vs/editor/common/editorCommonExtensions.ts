/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {illegalArgument, onUnexpectedError} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {SyncDescriptor1, createSyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ICommandHandler, IKeybindings, KbExpr} from 'vs/platform/keybinding/common/keybindingService';
import {ICommandDescriptor, KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {Registry} from 'vs/platform/platform';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {findFocusedEditor, getActiveEditor, withCodeEditorFromCommandHandler} from 'vs/editor/common/config/config';
import {Position} from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IModelService} from 'vs/editor/common/services/modelService';

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

// --- Editor Actions
export class EditorActionDescriptor {

	public ctor:editorCommon.IEditorActionContributionCtor;
	public id:string;
	public label:string;

	public kbOpts:IEditorActionKeybindingOptions;

	constructor(ctor:editorCommon.IEditorActionContributionCtor, id:string, label:string, kbOpts: IEditorActionKeybindingOptions = defaultEditorActionKeybindingOptions) {
		this.ctor = ctor;
		this.id = id;
		this.label = label;
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
			context: contextRule(needsTextFocus, needsKey),
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
			handler(accessor, args: any[]) {
				if (args && args.length > 1 || typeof args[0] !== 'object') {
					throw illegalArgument();
				}
				return handler(accessor, args && args[0]);
			},
			weight: KeybindingsRegistry.WEIGHT.editorContrib(),
			primary: undefined,
			context: undefined,
		});
	}

	export function registerDefaultLanguageCommand(id: string, handler: (model: editorCommon.IModel, position: editorCommon.IPosition, args: { [n: string]: any }) => any) {
		registerLanguageCommand(id, function(accessor, args) {

			const {resource, position} = args;
			if (!(resource instanceof URI) || !Position.isIPosition(position)) {
				throw illegalArgument();
			}

			const model = accessor.get(IModelService).getModel(resource);
			if (!model) {
				throw illegalArgument();
			}

			return handler(model, position, args);
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

	constructor(ctor:editorCommon.IEditorActionContributionCtor, id:string, label:string) {
		this._descriptor = createSyncDescriptor(ctor, {
			id: id,
			label: label
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

	constructor() {
		this.editorContributions = [];
	}

	public registerEditorContribution2(ctor:editorCommon.ICommonEditorContributionCtor): void {
		this.editorContributions.push(new SimpleEditorContributionDescriptor(ctor));
	}

	public registerEditorAction(desc:EditorActionDescriptor): void {
		var handler = desc.kbOpts.handler;
		if (!handler) {
			if (desc.kbOpts.context === ContextKey.EditorTextFocus || desc.kbOpts.context === ContextKey.EditorFocus) {
				handler = triggerEditorAction.bind(null, desc.id);
			} else {
				handler = triggerEditorActionGlobal.bind(null, desc.id);
			}
		}

		var context: KbExpr = null;
		if (typeof desc.kbOpts.kbExpr === 'undefined') {
			if (desc.kbOpts.context === ContextKey.EditorTextFocus) {
				context = KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS);
			} else if (desc.kbOpts.context === ContextKey.EditorFocus) {
				context = KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS);
			}
		} else {
			context = desc.kbOpts.kbExpr;
		}

		var commandDesc: ICommandDescriptor = {
			id: desc.id,
			handler: handler,
			weight: KeybindingsRegistry.WEIGHT.editorContrib(),
			context: context,
			primary: desc.kbOpts.primary,
			secondary: desc.kbOpts.secondary,
			win: desc.kbOpts.win,
			linux: desc.kbOpts.linux,
			mac: desc.kbOpts.mac,
		};

		KeybindingsRegistry.registerCommandDesc(commandDesc);
		this.editorContributions.push(new InternalEditorActionDescriptor(desc.ctor, desc.id, desc.label));
	}

	public getEditorContributions2(): editorCommon.ICommonEditorContributionDescriptor[] {
		return this.editorContributions.slice(0);
	}
}
Registry.add(Extensions.EditorCommonContributions, new EditorContributionRegistry());

function triggerEditorAction(actionId: string, accessor: ServicesAccessor, args: any): void {
	withCodeEditorFromCommandHandler(actionId, accessor, args,(editor) => {
		editor.trigger('keyboard', actionId, args);
	});
}

function triggerEditorActionGlobal(actionId: string, accessor: ServicesAccessor, args: any): void {
	// TODO: this is not necessarily keyboard
	var focusedEditor = findFocusedEditor(actionId, accessor, args, false);
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

var defaultEditorActionKeybindingOptions:IEditorActionKeybindingOptions = { primary: null, context: ContextKey.EditorTextFocus };

function contextRule(needsTextFocus: boolean, needsKey: string): KbExpr {

	let base = KbExpr.has(needsTextFocus ? editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS : editorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS);

	if (needsKey) {
		return KbExpr.and(base, KbExpr.has(needsKey));
	}

	return base;
}

function createCommandHandler(commandId: string, handler: IEditorCommandHandler): ICommandHandler {
	return (accessor, args) => {
		withCodeEditorFromCommandHandler(commandId, accessor, args, (editor) => {
			handler(accessor, editor, args);
		});
	};
}