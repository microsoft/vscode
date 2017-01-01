/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { illegalArgument } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ICommandOptions, Command as ConfigBasicCommand, EditorCommand as ConfigEditorCommand } from 'vs/editor/common/config/config';
import { Position } from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IModelService } from 'vs/editor/common/services/modelService';
import { MenuId, MenuRegistry, IMenuItem } from 'vs/platform/actions/common/actions';

export type ServicesAccessor = ServicesAccessor;
export const Command = ConfigBasicCommand;
export const EditorCommand = ConfigEditorCommand;
export type ICommandOptions = ICommandOptions;

export interface IEditorCommandMenuOptions {
	group?: string;
	order?: number;
}
export interface IActionOptions extends ICommandOptions {
	label: string;
	alias: string;
	menuOpts?: IEditorCommandMenuOptions;
}
export abstract class EditorAction extends ConfigEditorCommand {

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
			when: this.precondition,
			group: this.menuOpts.group,
			order: this.menuOpts.order
		};
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void | TPromise<void> {
		this.reportTelemetry(accessor);
		return this.run(accessor, editor, args);
	}

	protected reportTelemetry(accessor: ServicesAccessor) {
		accessor.get(ITelemetryService).publicLog('editorActionInvoked', { name: this.label, id: this.id });
	}

	public abstract run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor, args: any): void | TPromise<void>;
}

export interface IHandlerActionOptions extends IActionOptions {
	handlerId: string;
}
export abstract class HandlerEditorAction extends EditorAction {
	private _handlerId: string;

	constructor(opts: IHandlerActionOptions) {
		super(opts);
		this._handlerId = opts.handlerId;
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		editor.trigger(this.id, this._handlerId, null);
	}
}

// --- Editor Actions

export function editorAction(ctor: { new (): EditorAction; }): void {
	CommonEditorRegistry.registerEditorAction(new ctor());
}

export function commonEditorContribution(ctor: editorCommon.ICommonEditorContributionCtor): void {
	EditorContributionRegistry.INSTANCE.registerEditorContribution(ctor);
}

export module CommonEditorRegistry {

	// --- Editor Actions

	export function registerEditorAction(desc: EditorAction) {
		EditorContributionRegistry.INSTANCE.registerEditorAction(desc);
	}
	export function getEditorActions(): EditorAction[] {
		return EditorContributionRegistry.INSTANCE.getEditorActions();
	}

	// --- Editor Contributions

	export function getEditorContributions(): editorCommon.ICommonEditorContributionCtor[] {
		return EditorContributionRegistry.INSTANCE.getEditorContributions();
	}

	// --- Editor Commands

	export function commandWeight(importance: number = 0): number {
		return KeybindingsRegistry.WEIGHT.editorContrib(importance);
	}

	export function registerEditorCommand(desc: ConfigBasicCommand): void {
		KeybindingsRegistry.registerCommandAndKeybindingRule(desc.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));
	}

	export function registerLanguageCommand(id: string, handler: (accessor: ServicesAccessor, args: { [n: string]: any }) => any) {
		CommandsRegistry.registerCommand(id, (accessor, args) => handler(accessor, args || {}));
	}

	export function registerDefaultLanguageCommand(id: string, handler: (model: editorCommon.IModel, position: Position, args: { [n: string]: any }) => any) {
		registerLanguageCommand(id, function (accessor, args) {

			const {resource, position} = args;
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
}

// Editor extension points
const Extensions = {
	EditorCommonContributions: 'editor.commonContributions'
};

class EditorContributionRegistry {

	public static INSTANCE = new EditorContributionRegistry();

	private editorContributions: editorCommon.ICommonEditorContributionCtor[];
	private editorActions: EditorAction[];

	constructor() {
		this.editorContributions = [];
		this.editorActions = [];
	}

	public registerEditorContribution(ctor: editorCommon.ICommonEditorContributionCtor): void {
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

	public getEditorContributions(): editorCommon.ICommonEditorContributionCtor[] {
		return this.editorContributions.slice(0);
	}

	public getEditorActions(): EditorAction[] {
		return this.editorActions.slice(0);
	}
}
Registry.add(Extensions.EditorCommonContributions, EditorContributionRegistry.INSTANCE);
