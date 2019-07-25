/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition } from 'vs/base/browser/ui/contextview/contextview';
import { illegalArgument } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { CommandsRegistry, ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConstructorSignature1, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindings, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { withNullAsUndefined } from 'vs/base/common/types';

export type ServicesAccessor = ServicesAccessor;
export type IEditorContributionCtor = IConstructorSignature1<ICodeEditor, IEditorContribution>;
export type EditorTelemetryDataFragment = {
	target: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	snippet: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
};

//#region Command

export interface ICommandKeybindingsOptions extends IKeybindings {
	kbExpr?: ContextKeyExpr | null;
	weight: number;
}
export interface ICommandMenubarOptions {
	menuId: MenuId;
	group: string;
	order: number;
	when?: ContextKeyExpr;
	title: string;
}
export interface ICommandOptions {
	id: string;
	precondition: ContextKeyExpr | undefined;
	kbOpts?: ICommandKeybindingsOptions;
	description?: ICommandHandlerDescription;
	menubarOpts?: ICommandMenubarOptions;
}
export abstract class Command {
	public readonly id: string;
	public readonly precondition: ContextKeyExpr | undefined;
	private readonly _kbOpts: ICommandKeybindingsOptions | undefined;
	private readonly _menubarOpts: ICommandMenubarOptions | undefined;
	private readonly _description: ICommandHandlerDescription | undefined;

	constructor(opts: ICommandOptions) {
		this.id = opts.id;
		this.precondition = opts.precondition;
		this._kbOpts = opts.kbOpts;
		this._menubarOpts = opts.menubarOpts;
		this._description = opts.description;
	}

	public register(): void {

		if (this._menubarOpts) {
			MenuRegistry.appendMenuItem(this._menubarOpts.menuId, {
				group: this._menubarOpts.group,
				command: {
					id: this.id,
					title: this._menubarOpts.title,
					// precondition: this.precondition
				},
				when: this._menubarOpts.when,
				order: this._menubarOpts.order
			});
		}

		if (this._kbOpts) {
			let kbWhen = this._kbOpts.kbExpr;
			if (this.precondition) {
				if (kbWhen) {
					kbWhen = ContextKeyExpr.and(kbWhen, this.precondition);
				} else {
					kbWhen = this.precondition;
				}
			}

			KeybindingsRegistry.registerCommandAndKeybindingRule({
				id: this.id,
				handler: (accessor, args) => this.runCommand(accessor, args),
				weight: this._kbOpts.weight,
				when: kbWhen,
				primary: this._kbOpts.primary,
				secondary: this._kbOpts.secondary,
				win: this._kbOpts.win,
				linux: this._kbOpts.linux,
				mac: this._kbOpts.mac,
				description: this._description
			});

		} else {

			CommandsRegistry.registerCommand({
				id: this.id,
				handler: (accessor, args) => this.runCommand(accessor, args),
				description: this._description
			});
		}
	}

	public abstract runCommand(accessor: ServicesAccessor, args: any): void | Promise<void>;
}

//#endregion Command

//#region EditorCommand

export interface IContributionCommandOptions<T> extends ICommandOptions {
	handler: (controller: T, args: any) => void;
}
export interface EditorControllerCommand<T extends IEditorContribution> {
	new(opts: IContributionCommandOptions<T>): EditorCommand;
}
export abstract class EditorCommand extends Command {

	/**
	 * Create a command class that is bound to a certain editor contribution.
	 */
	public static bindToContribution<T extends IEditorContribution>(controllerGetter: (editor: ICodeEditor) => T): EditorControllerCommand<T> {
		return class EditorControllerCommandImpl extends EditorCommand {
			private readonly _callback: (controller: T, args: any) => void;

			constructor(opts: IContributionCommandOptions<T>) {
				super(opts);

				this._callback = opts.handler;
			}

			public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
				const controller = controllerGetter(editor);
				if (controller) {
					this._callback(controllerGetter(editor), args);
				}
			}
		};
	}

	public runCommand(accessor: ServicesAccessor, args: any): void | Promise<void> {
		const codeEditorService = accessor.get(ICodeEditorService);

		// Find the editor with text focus or active
		const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
		if (!editor) {
			// well, at least we tried...
			return;
		}

		return editor.invokeWithinContext((editorAccessor) => {
			const kbService = editorAccessor.get(IContextKeyService);
			if (!kbService.contextMatchesRules(withNullAsUndefined(this.precondition))) {
				// precondition does not hold
				return;
			}

			return this.runEditorCommand(editorAccessor, editor!, args);
		});
	}

	public abstract runEditorCommand(accessor: ServicesAccessor | null, editor: ICodeEditor, args: any): void | Promise<void>;
}

//#endregion EditorCommand

//#region EditorAction

export interface IEditorCommandMenuOptions {
	group: string;
	order: number;
	when?: ContextKeyExpr;
}
export interface IActionOptions extends ICommandOptions {
	label: string;
	alias: string;
	menuOpts?: IEditorCommandMenuOptions;
}
export abstract class EditorAction extends EditorCommand {

	public readonly label: string;
	public readonly alias: string;
	private readonly menuOpts: IEditorCommandMenuOptions | undefined;

	constructor(opts: IActionOptions) {
		super(opts);
		this.label = opts.label;
		this.alias = opts.alias;
		this.menuOpts = opts.menuOpts;
	}

	public register(): void {

		if (this.menuOpts) {
			MenuRegistry.appendMenuItem(MenuId.EditorContext, {
				command: {
					id: this.id,
					title: this.label
				},
				when: ContextKeyExpr.and(this.precondition, this.menuOpts.when),
				group: this.menuOpts.group,
				order: this.menuOpts.order
			});
		}

		super.register();
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void | Promise<void> {
		this.reportTelemetry(accessor, editor);
		return this.run(accessor, editor, args || {});
	}

	protected reportTelemetry(accessor: ServicesAccessor, editor: ICodeEditor) {
		type EditorActionInvokedClassification = {
			name: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			id: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
		};
		type EditorActionInvokedEvent = {
			name: string;
			id: string;
		};
		accessor.get(ITelemetryService).publicLog2<EditorActionInvokedEvent, EditorActionInvokedClassification>('editorActionInvoked', { name: this.label, id: this.id });
	}

	public abstract run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void | Promise<void>;
}

//#endregion EditorAction

// --- Registration of commands and actions

export function registerLanguageCommand(id: string, handler: (accessor: ServicesAccessor, args: { [n: string]: any }) => any) {
	CommandsRegistry.registerCommand(id, (accessor, args) => handler(accessor, args || {}));
}

interface IDefaultArgs {
	resource: URI;
	position: IPosition;
	[name: string]: any;
}

export function registerDefaultLanguageCommand(id: string, handler: (model: ITextModel, position: Position, args: IDefaultArgs) => any) {
	registerLanguageCommand(id, function (accessor, args: IDefaultArgs) {

		const { resource, position } = args;
		if (!(resource instanceof URI)) {
			throw illegalArgument('resource');
		}
		if (!Position.isIPosition(position)) {
			throw illegalArgument('position');
		}

		const model = accessor.get(IModelService).getModel(resource);
		if (model) {
			const editorPosition = Position.lift(position);
			return handler(model, editorPosition, args);
		}

		return accessor.get(ITextModelService).createModelReference(resource).then(reference => {
			return new Promise((resolve, reject) => {
				try {
					const result = handler(reference.object.textEditorModel, Position.lift(position), args);
					resolve(result);
				} catch (err) {
					reject(err);
				}
			}).finally(() => {
				reference.dispose();
			});
		});
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

	private readonly editorContributions: IEditorContributionCtor[];
	private readonly editorActions: EditorAction[];
	private readonly editorCommands: { [commandId: string]: EditorCommand; };

	constructor() {
		this.editorContributions = [];
		this.editorActions = [];
		this.editorCommands = Object.create(null);
	}

	public registerEditorContribution(ctor: IEditorContributionCtor): void {
		this.editorContributions.push(ctor);
	}

	public registerEditorAction(action: EditorAction) {
		action.register();
		this.editorActions.push(action);
	}

	public getEditorContributions(): IEditorContributionCtor[] {
		return this.editorContributions.slice(0);
	}

	public getEditorActions(): EditorAction[] {
		return this.editorActions.slice(0);
	}

	public registerEditorCommand(editorCommand: EditorCommand) {
		editorCommand.register();
		this.editorCommands[editorCommand.id] = editorCommand;
	}

	public getEditorCommand(commandId: string): EditorCommand {
		return (this.editorCommands[commandId] || null);
	}

}
Registry.add(Extensions.EditorCommonContributions, EditorContributionRegistry.INSTANCE);
