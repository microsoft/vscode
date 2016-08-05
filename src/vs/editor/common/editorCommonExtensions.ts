/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {illegalArgument} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {ServicesAccessor, IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {KbExpr, IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {CommandsRegistry} from 'vs/platform/commands/common/commands';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {Registry} from 'vs/platform/platform';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {Command as ConfigBasicCommand, EditorCommand as ConfigEditorCommand} from 'vs/editor/common/config/config';
import {Position} from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IModelService} from 'vs/editor/common/services/modelService';
import {MenuId, MenuRegistry} from 'vs/platform/actions/common/actions';

export type ServicesAccessor = ServicesAccessor;
export const Command = ConfigBasicCommand;
export const EditorCommand = ConfigEditorCommand;

// --- Keybinding extensions to make it more concise to express keybindings conditions
export interface IEditorCommandMenuOptions {
	kbExpr: KbExpr;
	menu?: MenuId;
	group?: string;
	order?: number;
}

// --- Editor Actions

// let recorded: EditorAction[] = [];
function record(desc:EditorAction) {
	return;
	// let stack = new Error().stack;
	// desc.callsite = stack.split('\n')[3];
	// recorded.push(desc);
}
function analyze() {
	return;
	// recorded.sort((a, b) => a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
	// recorded.forEach((desc) => {
	// 	let rightpad = (str:string, cnt:number) => {
	// 		while (str.length < cnt) {
	// 			str = str + ' ';
	// 		}
	// 		return str;
	// 	};

	// 	if (typeof desc._precondition === 'undefined') {
	// 		console.warn('MISSING PRECONDITION FOR ' + desc.id + desc.callsite);
	// 	} else {
	// 		let prec = desc._precondition ? desc._precondition.serialize() : 'null';
	// 		if (desc._needsWritableEditor && prec.indexOf('!editorReadonly') === -1) {
	// 			console.warn('BELOW COMMAND DOES NOT PRECONDITION CORRECTLY WRITABLE!');
	// 		}
	// 		console.log(rightpad(desc.id, 50) + '' + desc._needsWritableEditor + '\t\t' + rightpad(prec, 50) + '\t\t' + desc.callsite);
	// 	}
	// });
	// recorded = [];
}

export module CommonEditorRegistry {

	export function registerEditorAction(desc:EditorAction) {
		record(desc);
		(<EditorContributionRegistry>Registry.as(Extensions.EditorCommonContributions)).registerEditorAction(desc);
	}

	export function getEditorActions(): EditorAction[] {
		analyze();
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

	export function registerEditorCommand2(desc: ConfigBasicCommand): void {
		KeybindingsRegistry.registerCommandAndKeybindingRule(desc.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));
	}

	export function registerLanguageCommand(id: string, handler: (accessor: ServicesAccessor, args: { [n: string]: any }) => any) {
		CommandsRegistry.registerCommand(id, (accessor, args) => handler(accessor, args || {}));
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

		KeybindingsRegistry.registerCommandAndKeybindingRule(action.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

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

export abstract class EditorAction extends ConfigEditorCommand {

	private _needsWritableEditor: boolean;

	public label: string;
	public alias: string;
	public menuOpts: IEditorCommandMenuOptions;

	public _precondition: KbExpr;

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
		if (!this.supported(accessor, editor, false)) {
			return false;
		}
		if (this._needsWritableEditor) {
			return !editor.getConfiguration().readOnly;
		}
		return true;
	}

	public supported(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor, forceEditorTextFocus:boolean): boolean {
		const kbService = accessor.get(IKeybindingService);

		let override = null;
		if (forceEditorTextFocus) {
			override = {
				editorTextFocus: true
			};
		}

		return kbService.contextMatchesRules(this._precondition, override);
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
