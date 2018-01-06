/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { illegalArgument } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ServicesAccessor, IConstructorSignature1 } from 'vs/platform/instantiation/common/instantiation';
import { CommandsRegistry, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { KeybindingsRegistry, ICommandAndKeybindingRule, IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Position } from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/modelService';
import { MenuId, MenuRegistry, IMenuItem } from 'vs/platform/actions/common/actions';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICodeEditorService, getCodeEditor } from 'vs/editor/browser/services/codeEditorService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextModel } from 'vs/editor/common/model';

export type ServicesAccessor = ServicesAccessor;
export type IEditorContributionCtor = IConstructorSignature1<ICodeEditor, editorCommon.IEditorContribution>;

//#region Command

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
	public readonly id: string;
	public readonly precondition: ContextKeyExpr;
	private readonly _kbOpts: ICommandKeybindingsOptions;
	private readonly _description: ICommandHandlerDescription;

	constructor(opts: ICommandOptions) {
		this.id = opts.id;
		this.precondition = opts.precondition;
		this._kbOpts = opts.kbOpts;
		this._description = opts.description;
	}

	public toCommandAndKeybindingRule(defaultWeight: number): ICommandAndKeybindingRule {
		const kbOpts = this._kbOpts || { primary: 0 };

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
			description: this._description
		};
	}

	public abstract runCommand(accessor: ServicesAccessor, args: any): void | TPromise<void>;
}

//#endregion Command

//#region EditorCommand

function getWorkbenchActiveEditor(accessor: ServicesAccessor): ICodeEditor {
	const editorService = accessor.get(IEditorService);
	let activeEditor = (<any>editorService).getActiveEditor && (<any>editorService).getActiveEditor();
	return getCodeEditor(activeEditor);
}

export interface IContributionCommandOptions<T> extends ICommandOptions {
	handler: (controller: T) => void;
}
export interface EditorControllerCommand<T extends editorCommon.IEditorContribution> {
	new(opts: IContributionCommandOptions<T>): EditorCommand;
}
export abstract class EditorCommand extends Command {

	/**
	 * Create a command class that is bound to a certain editor contribution.
	 */
	public static bindToContribution<T extends editorCommon.IEditorContribution>(controllerGetter: (editor: ICodeEditor) => T): EditorControllerCommand<T> {
		return class EditorControllerCommandImpl extends EditorCommand {
			private _callback: (controller: T) => void;

			constructor(opts: IContributionCommandOptions<T>) {
				super(opts);

				this._callback = opts.handler;
			}

			public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
				let controller = controllerGetter(editor);
				if (controller) {
					this._callback(controllerGetter(editor));
				}
			}
		};
	}

	public runCommand(accessor: ServicesAccessor, args: any): void | TPromise<void> {
		const codeEditorService = accessor.get(ICodeEditorService);

		// Find the editor with text focus
		let editor = codeEditorService.getFocusedCodeEditor();

		if (!editor) {
			// Fallback to use what the workbench considers the active editor
			editor = getWorkbenchActiveEditor(accessor);
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

	public abstract runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void | TPromise<void>;
}

//#endregion EditorCommand

//#region EditorAction

export interface IEditorCommandMenuOptions {
	group?: string;
	order?: number;
	when?: ContextKeyExpr;
}
export interface IActionOptions extends ICommandOptions {
	label: string;
	alias: string;
	menuOpts?: IEditorCommandMenuOptions;
}
export abstract class EditorAction extends EditorCommand {

	public label: string;
	public alias: string;
	private menuOpts: IEditorCommandMenuOptions;

	constructor(opts: IActionOptions) {
		super(opts);
		this.label = opts.label;
		this.alias = opts.alias;
		this.menuOpts = opts.menuOpts;
	}

	public toMenuItem(): IMenuItem {
		if (!this.menuOpts) {
			return null;
		}

		return {
			command: {
				id: this.id,
				title: this.label
			},
			when: ContextKeyExpr.and(this.precondition, this.menuOpts.when),
			group: this.menuOpts.group,
			order: this.menuOpts.order
		};
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void | TPromise<void> {
		this.reportTelemetry(accessor, editor);
		return this.run(accessor, editor, args || {});
	}

	protected reportTelemetry(accessor: ServicesAccessor, editor: ICodeEditor) {
		/* __GDPR__
			"editorActionInvoked" : {
				"name" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"id": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"${include}": [
					"${EditorTelemetryData}"
				]
			}
		*/
		accessor.get(ITelemetryService).publicLog('editorActionInvoked', { name: this.label, id: this.id, ...editor.getTelemetryData() });
	}

	public abstract run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void | TPromise<void>;
}

//#endregion EditorAction

// --- Registration of commands and actions

export function registerLanguageCommand(id: string, handler: (accessor: ServicesAccessor, args: { [n: string]: any }) => any) {
	CommandsRegistry.registerCommand(id, (accessor, args) => handler(accessor, args || {}));
}

export function registerDefaultLanguageCommand(id: string, handler: (model: ITextModel, position: Position, args: { [n: string]: any }) => any) {
	registerLanguageCommand(id, function (accessor, args) {

		const { resource, position } = args;
		if (!(resource instanceof URI)) {
			throw illegalArgument('resource');
		}
		if (!Position.isIPosition(position)) {
			throw illegalArgument('position');
		}

		const model = accessor.get(IModelService).getModel(resource);
		if (!model) {
			throw illegalArgument('Can not find open model for ' + resource);
		}

		const editorPosition = Position.lift(position);

		return handler(model, editorPosition, args);
	});
}

export function registerEditorCommand<T extends EditorCommand>(editorCommand: T): T {
	EditorContributionRegistry.INSTANCE.registerEditorCommand(editorCommand);
	return editorCommand;
}

export function registerEditorAction(ctor: { new(): EditorAction; }): void {
	EditorContributionRegistry.INSTANCE.registerEditorAction(new ctor());
}

export function registerInstantiatedEditorAction(editorAction: EditorAction): void {
	EditorContributionRegistry.INSTANCE.registerEditorAction(editorAction);
}

export function registerEditorContribution(ctor: IEditorContributionCtor): void {
	EditorContributionRegistry.INSTANCE.registerEditorContribution(ctor);
}

export namespace EditorExtensionsRegistry {

	export function getEditorCommand(commandId: string): EditorCommand {
		return EditorContributionRegistry.INSTANCE.getEditorCommand(commandId);
	}

	export function getEditorActions(): EditorAction[] {
		return EditorContributionRegistry.INSTANCE.getEditorActions();
	}

	export function getEditorContributions(): IEditorContributionCtor[] {
		return EditorContributionRegistry.INSTANCE.getEditorContributions();
	}
}

// Editor extension points
const Extensions = {
	EditorCommonContributions: 'editor.contributions'
};

class EditorContributionRegistry {

	public static readonly INSTANCE = new EditorContributionRegistry();

	private editorContributions: IEditorContributionCtor[];
	private editorActions: EditorAction[];
	private editorCommands: { [commandId: string]: EditorCommand; };

	constructor() {
		this.editorContributions = [];
		this.editorActions = [];
		this.editorCommands = Object.create(null);
	}

	public registerEditorContribution(ctor: IEditorContributionCtor): void {
		this.editorContributions.push(ctor);
	}

	public registerEditorAction(action: EditorAction) {

		let menuItem = action.toMenuItem();
		if (menuItem) {
			MenuRegistry.appendMenuItem(MenuId.EditorContext, menuItem);
		}

		KeybindingsRegistry.registerCommandAndKeybindingRule(action.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

		this.editorActions.push(action);
	}

	public getEditorContributions(): IEditorContributionCtor[] {
		return this.editorContributions.slice(0);
	}

	public getEditorActions(): EditorAction[] {
		return this.editorActions.slice(0);
	}

	public registerEditorCommand(editorCommand: EditorCommand) {
		KeybindingsRegistry.registerCommandAndKeybindingRule(editorCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));
		this.editorCommands[editorCommand.id] = editorCommand;
	}

	public getEditorCommand(commandId: string): EditorCommand {
		return (this.editorCommands[commandId] || null);
	}

}
Registry.add(Extensions.EditorCommonContributions, EditorContributionRegistry.INSTANCE);
