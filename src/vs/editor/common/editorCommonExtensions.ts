/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import {onUnexpectedError, illegalArgument} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {Position} from 'vs/editor/common/core/position';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IModelService} from 'vs/editor/common/services/modelService';
import {Registry} from 'vs/platform/platform';
import {KeybindingsRegistry,ICommandDescriptor} from 'vs/platform/keybinding/common/keybindingsRegistry';
import config = require('vs/editor/common/config/config');
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {SyncDescriptor1, createSyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {IKeybindingContextRule, ICommandHandler, IKeybindings} from 'vs/platform/keybinding/common/keybindingService';

// --- Keybinding extensions to make it more concise to express keybindings conditions
export enum ContextKey {
	None = 0,
	EditorTextFocus = 1,
	EditorFocus = 2
}
export interface IEditorActionKeybindingOptions extends IKeybindings {
	handler?: ICommandHandler;
	context: ContextKey;
}
export interface IEditorCommandKeybindingOptions extends IKeybindings {
	context: ContextKey;
}

// --- Editor Actions
export class EditorActionDescriptor {

	public ctor:EditorCommon.IEditorActionContributionCtor;
	public id:string;
	public label:string;

	public kbOpts:IEditorActionKeybindingOptions;

	constructor(ctor:EditorCommon.IEditorActionContributionCtor, id:string, label:string, kbOpts: IEditorActionKeybindingOptions = defaultEditorActionKeybindingOptions) {
		this.ctor = ctor;
		this.id = id;
		this.label = label;
		this.kbOpts = kbOpts;
	}
}

export interface IEditorCommandHandler {
	(accessor:ServicesAccessor, editor: EditorCommon.ICommonCodeEditor, args: any): void;
}

export module CommonEditorRegistry {

	export function registerEditorAction(desc:EditorActionDescriptor) {
		(<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).registerEditorAction(desc);
	}

	// --- Editor Contributions
	export function registerEditorContribution(ctor:EditorCommon.ICommonEditorContributionCtor): void {
		(<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).registerEditorContribution2(ctor);
	}
	export function getEditorContributions(): EditorCommon.ICommonEditorContributionDescriptor[] {
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

	export function registerDefaultLanguageCommand(id: string, handler: (model: EditorCommon.IModel, position: EditorCommon.IPosition, args: { [n: string]: any }) => any) {
		registerLanguageCommand(id, function(accessor, args) {

			const {resource, position} = args;
			if (!URI.isURI(resource) || !Position.isIPosition(position)) {
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

class SimpleEditorContributionDescriptor implements EditorCommon.ICommonEditorContributionDescriptor {
	private _ctor:EditorCommon.ICommonEditorContributionCtor;

	constructor(ctor:EditorCommon.ICommonEditorContributionCtor) {
		this._ctor = ctor;
	}

	public createInstance(instantiationService: IInstantiationService, editor:EditorCommon.ICommonCodeEditor): EditorCommon.IEditorContribution {
		return instantiationService.createInstance(this._ctor, editor);
	}
}

class InternalEditorActionDescriptor implements EditorCommon.ICommonEditorContributionDescriptor {

	private _descriptor: SyncDescriptor1<EditorCommon.ICommonCodeEditor, EditorCommon.IEditorContribution>;

	constructor(ctor:EditorCommon.IEditorActionContributionCtor, id:string, label:string) {
		this._descriptor = createSyncDescriptor(ctor, {
			id: id,
			label: label
		});
	}

	public createInstance(instService:IInstantiationService, editor:EditorCommon.ICommonCodeEditor): EditorCommon.IEditorContribution {
		return instService.createInstance(this._descriptor, editor);
	}
}

// Editor extension points
var Extensions = {
	EditorCommonContributions: 'editor.commonContributions'
};

class EditorContributionRegistry {

	private editorContributions: EditorCommon.ICommonEditorContributionDescriptor[];

	constructor() {
		this.editorContributions = [];
	}

	public registerEditorContribution2(ctor:EditorCommon.ICommonEditorContributionCtor): void {
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

		var context: IKeybindingContextRule[] = null;
		if (desc.kbOpts.context === ContextKey.EditorTextFocus) {
			context = [{
				key: EditorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS
			}];
		} else if (desc.kbOpts.context === ContextKey.EditorFocus) {
			context = [{
				key: EditorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS
			}];
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

	public getEditorContributions2(): EditorCommon.ICommonEditorContributionDescriptor[] {
		return this.editorContributions.slice(0);
	}
}
Registry.add(Extensions.EditorCommonContributions, new EditorContributionRegistry());

function triggerEditorAction(actionId: string, accessor: ServicesAccessor, args: any): void {
	config.withCodeEditorFromCommandHandler(actionId, accessor, args,(editor) => {
		editor.trigger('keyboard', actionId, args);
	});
}

function triggerEditorActionGlobal(actionId: string, accessor: ServicesAccessor, args: any): void {
	// TODO: this is not necessarily keyboard
	var focusedEditor = config.findFocusedEditor(actionId, accessor, args, false);
	if (focusedEditor) {
		focusedEditor.trigger('keyboard', actionId, args);
		return;
	}

	var activeEditor = config.getActiveEditor(accessor);
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

function contextRule(needsTextFocus: boolean, needsKey: string): IKeybindingContextRule[]{
	if (needsTextFocus) {
		return [
			{ key: EditorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS },
			{ key: needsKey }
		];
	}
	return [
		{ key: EditorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS },
		{ key: needsKey }
	];
}

function createCommandHandler(commandId: string, handler: IEditorCommandHandler): ICommandHandler {
	return (accessor, args) => {
		config.withCodeEditorFromCommandHandler(commandId, accessor, args, (editor) => {
			handler(accessor, editor, args);
		});
	};
}