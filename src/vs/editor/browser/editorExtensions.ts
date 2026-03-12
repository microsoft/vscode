/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../nls.js';
import { URI } from '../../base/common/uri.js';
import { ICodeEditor, IDiffEditor } from './editorBrowser.js';
import { ICodeEditorService } from './services/codeEditorService.js';
import { Position } from '../common/core/position.js';
import { IEditorContribution, IDiffEditorContribution } from '../common/editorCommon.js';
import { ITextModel } from '../common/model.js';
import { IModelService } from '../common/services/model.js';
import { ITextModelService } from '../common/services/resolverService.js';
import { MenuId, MenuRegistry, Action2 } from '../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandMetadata } from '../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService, ContextKeyExpression } from '../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor as InstantiationServicesAccessor, BrandedService, IInstantiationService, IConstructorSignature } from '../../platform/instantiation/common/instantiation.js';
import { IKeybindings, KeybindingsRegistry, KeybindingWeight } from '../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { assertType } from '../../base/common/types.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { IDisposable } from '../../base/common/lifecycle.js';
import { KeyMod, KeyCode } from '../../base/common/keyCodes.js';
import { ILogService } from '../../platform/log/common/log.js';
import { getActiveElement } from '../../base/browser/dom.js';
import { TriggerInlineEditCommandsRegistry } from './triggerInlineEditCommandsRegistry.js';

export type ServicesAccessor = InstantiationServicesAccessor;
export type EditorContributionCtor = IConstructorSignature<IEditorContribution, [ICodeEditor]>;
export type DiffEditorContributionCtor = IConstructorSignature<IDiffEditorContribution, [IDiffEditor]>;

export const enum EditorContributionInstantiation {
	/**
	 * The contribution is created eagerly when the {@linkcode ICodeEditor} is instantiated.
	 * Only Eager contributions can participate in saving or restoring of view state.
	 */
	Eager,

	/**
	 * The contribution is created at the latest 50ms after the first render after attaching a text model.
	 * If the contribution is explicitly requested via `getContribution`, it will be instantiated sooner.
	 * If there is idle time available, it will be instantiated sooner.
	 */
	AfterFirstRender,

	/**
	 * The contribution is created before the editor emits events produced by user interaction (mouse events, keyboard events).
	 * If the contribution is explicitly requested via `getContribution`, it will be instantiated sooner.
	 * If there is idle time available, it will be instantiated sooner.
	 */
	BeforeFirstInteraction,

	/**
	 * The contribution is created when there is idle time available, at the latest 5000ms after the editor creation.
	 * If the contribution is explicitly requested via `getContribution`, it will be instantiated sooner.
	 */
	Eventually,

	/**
	 * The contribution is created only when explicitly requested via `getContribution`.
	 */
	Lazy,
}

export interface IEditorContributionDescription {
	readonly id: string;
	readonly ctor: EditorContributionCtor;
	readonly instantiation: EditorContributionInstantiation;
}

export interface IDiffEditorContributionDescription {
	id: string;
	ctor: DiffEditorContributionCtor;
}

//#region Command

export interface ICommandKeybindingsOptions extends IKeybindings {
	kbExpr?: ContextKeyExpression | null;
	weight: number;
	/**
	 * the default keybinding arguments
	 */
	args?: unknown;
}
export interface ICommandMenuOptions {
	menuId: MenuId;
	group: string;
	order: number;
	when?: ContextKeyExpression;
	title: string;
	icon?: ThemeIcon;
}
export interface ICommandOptions {
	id: string;
	precondition: ContextKeyExpression | undefined;
	kbOpts?: ICommandKeybindingsOptions | ICommandKeybindingsOptions[];
	metadata?: ICommandMetadata;
	menuOpts?: ICommandMenuOptions | ICommandMenuOptions[];
	canTriggerInlineEdits?: boolean;
}
export abstract class Command {
	public readonly id: string;
	public readonly precondition: ContextKeyExpression | undefined;
	private readonly _kbOpts: ICommandKeybindingsOptions | ICommandKeybindingsOptions[] | undefined;
	private readonly _menuOpts: ICommandMenuOptions | ICommandMenuOptions[] | undefined;
	public readonly metadata: ICommandMetadata | undefined;
	public readonly canTriggerInlineEdits: boolean | undefined;

	constructor(opts: ICommandOptions) {
		this.id = opts.id;
		this.precondition = opts.precondition;
		this._kbOpts = opts.kbOpts;
		this._menuOpts = opts.menuOpts;
		this.metadata = opts.metadata;
		this.canTriggerInlineEdits = opts.canTriggerInlineEdits;
	}

	public register(): void {

		if (Array.isArray(this._menuOpts)) {
			this._menuOpts.forEach(this._registerMenuItem, this);
		} else if (this._menuOpts) {
			this._registerMenuItem(this._menuOpts);
		}

		if (this._kbOpts) {
			const kbOptsArr = Array.isArray(this._kbOpts) ? this._kbOpts : [this._kbOpts];
			for (const kbOpts of kbOptsArr) {
				let kbWhen = kbOpts.kbExpr;
				if (this.precondition) {
					if (kbWhen) {
						kbWhen = ContextKeyExpr.and(kbWhen, this.precondition);
					} else {
						kbWhen = this.precondition;
					}
				}

				const desc = {
					id: this.id,
					weight: kbOpts.weight,
					args: kbOpts.args,
					when: kbWhen,
					primary: kbOpts.primary,
					secondary: kbOpts.secondary,
					win: kbOpts.win,
					linux: kbOpts.linux,
					mac: kbOpts.mac,
				};

				KeybindingsRegistry.registerKeybindingRule(desc);
			}
		}

		CommandsRegistry.registerCommand({
			id: this.id,
			handler: (accessor, args) => this.runCommand(accessor, args),
			metadata: this.metadata
		});

		if (this.canTriggerInlineEdits) {
			TriggerInlineEditCommandsRegistry.registerCommand(this.id);
		}
	}

	private _registerMenuItem(item: ICommandMenuOptions): void {
		MenuRegistry.appendMenuItem(item.menuId, {
			group: item.group,
			command: {
				id: this.id,
				title: item.title,
				icon: item.icon,
				precondition: this.precondition
			},
			when: item.when,
			order: item.order
		});
	}

	public abstract runCommand(accessor: ServicesAccessor, args: unknown): void | Promise<void>;
}

//#endregion Command

//#region MultiplexingCommand

/**
 * Potential override for a command.
 *
 * @return `true` or a Promise if the command was successfully run. This stops other overrides from being executed.
 */
export type CommandImplementation = (accessor: ServicesAccessor, args: unknown) => boolean | Promise<void>;

interface ICommandImplementationRegistration {
	priority: number;
	name: string;
	implementation: CommandImplementation;
	when?: ContextKeyExpression;
}

export class MultiCommand extends Command {

	private readonly _implementations: ICommandImplementationRegistration[] = [];

	/**
	 * A higher priority gets to be looked at first
	 */
	public addImplementation(priority: number, name: string, implementation: CommandImplementation, when?: ContextKeyExpression): IDisposable {
		this._implementations.push({ priority, name, implementation, when });
		this._implementations.sort((a, b) => b.priority - a.priority);
		return {
			dispose: () => {
				for (let i = 0; i < this._implementations.length; i++) {
					if (this._implementations[i].implementation === implementation) {
						this._implementations.splice(i, 1);
						return;
					}
				}
			}
		};
	}

	public runCommand(accessor: ServicesAccessor, args: unknown): void | Promise<void> {
		const logService = accessor.get(ILogService);
		const contextKeyService = accessor.get(IContextKeyService);
		logService.trace(`Executing Command '${this.id}' which has ${this._implementations.length} bound.`);
		for (const impl of this._implementations) {
			if (impl.when) {
				const context = contextKeyService.getContext(getActiveElement());
				const value = impl.when.evaluate(context);
				if (!value) {
					continue;
				}
			}
			const result = impl.implementation(accessor, args);
			if (result) {
				logService.trace(`Command '${this.id}' was handled by '${impl.name}'.`);
				if (typeof result === 'boolean') {
					return;
				}
				return result;
			}
		}
		logService.trace(`The Command '${this.id}' was not handled by any implementation.`);
	}
}

//#endregion

/**
 * A command that delegates to another command's implementation.
 *
 * This lets different commands be registered but share the same implementation
 */
export class ProxyCommand extends Command {
	constructor(
		private readonly command: Command,
		opts: ICommandOptions
	) {
		super(opts);
	}

	public runCommand(accessor: ServicesAccessor, args: unknown): void | Promise<void> {
		return this.command.runCommand(accessor, args);
	}
}

//#region EditorCommand

export interface IContributionCommandOptions<T> extends ICommandOptions {
	handler: (controller: T, args: unknown) => void;
}
export interface EditorControllerCommand<T extends IEditorContribution> {
	new(opts: IContributionCommandOptions<T>): EditorCommand;
}
export abstract class EditorCommand extends Command {

	/**
	 * Create a command class that is bound to a certain editor contribution.
	 */
	public static bindToContribution<T extends IEditorContribution>(controllerGetter: (editor: ICodeEditor) => T | null): EditorControllerCommand<T> {
		return class EditorControllerCommandImpl extends EditorCommand {
			private readonly _callback: (controller: T, args: unknown) => void;

			constructor(opts: IContributionCommandOptions<T>) {
				super(opts);

				this._callback = opts.handler;
			}

			public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): void {
				const controller = controllerGetter(editor);
				if (controller) {
					this._callback(controller, args);
				}
			}
		};
	}

	public static runEditorCommand<T = unknown>(
		accessor: ServicesAccessor,
		args: T,
		precondition: ContextKeyExpression | undefined,
		runner: (accessor: ServicesAccessor, editor: ICodeEditor, args: T) => void | Promise<void>
	): void | Promise<void> {
		const codeEditorService = accessor.get(ICodeEditorService);

		// Find the editor with text focus or active
		const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
		if (!editor) {
			// well, at least we tried...
			return;
		}

		return editor.invokeWithinContext((editorAccessor) => {
			const kbService = editorAccessor.get(IContextKeyService);
			if (!kbService.contextMatchesRules(precondition ?? undefined)) {
				// precondition does not hold
				return;
			}

			return runner(editorAccessor, editor, args);
		});
	}

	public runCommand(accessor: ServicesAccessor, args: unknown): void | Promise<void> {
		return EditorCommand.runEditorCommand(accessor, args, this.precondition, (accessor, editor, args) => this.runEditorCommand(accessor, editor, args));
	}

	public abstract runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): void | Promise<void>;
}

//#endregion EditorCommand

//#region EditorAction

export interface IEditorActionContextMenuOptions {
	group: string;
	order: number;
	when?: ContextKeyExpression;
	menuId?: MenuId;
}
export type IActionOptions = ICommandOptions & {
	contextMenuOpts?: IEditorActionContextMenuOptions | IEditorActionContextMenuOptions[];
} & ({
	label: nls.ILocalizedString;
	alias?: string;
} | {
	label: string;
	alias: string;
});

export abstract class EditorAction extends EditorCommand {

	private static convertOptions(opts: IActionOptions): ICommandOptions {

		let menuOpts: ICommandMenuOptions[];
		if (Array.isArray(opts.menuOpts)) {
			menuOpts = opts.menuOpts;
		} else if (opts.menuOpts) {
			menuOpts = [opts.menuOpts];
		} else {
			menuOpts = [];
		}

		function withDefaults(item: Partial<ICommandMenuOptions>): ICommandMenuOptions {
			if (!item.menuId) {
				item.menuId = MenuId.EditorContext;
			}
			if (!item.title) {
				item.title = typeof opts.label === 'string' ? opts.label : opts.label.value;
			}
			item.when = ContextKeyExpr.and(opts.precondition, item.when);
			return <ICommandMenuOptions>item;
		}

		if (Array.isArray(opts.contextMenuOpts)) {
			menuOpts.push(...opts.contextMenuOpts.map(withDefaults));
		} else if (opts.contextMenuOpts) {
			menuOpts.push(withDefaults(opts.contextMenuOpts));
		}

		opts.menuOpts = menuOpts;
		return <ICommandOptions>opts;
	}

	public readonly label: string;
	public readonly alias: string;

	constructor(opts: IActionOptions) {
		super(EditorAction.convertOptions(opts));
		if (typeof opts.label === 'string') {
			this.label = opts.label;
			this.alias = opts.alias ?? opts.label;
		} else {
			this.label = opts.label.value;
			this.alias = opts.alias ?? opts.label.original;
		}
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): void | Promise<void> {
		this.reportTelemetry(accessor, editor);
		return this.run(accessor, editor, args || {});
	}

	protected reportTelemetry(accessor: ServicesAccessor, editor: ICodeEditor) {
		type EditorActionInvokedClassification = {
			owner: 'alexdima';
			comment: 'An editor action has been invoked.';
			name: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The label of the action that was invoked.' };
			id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the action that was invoked.' };
		};
		type EditorActionInvokedEvent = {
			name: string;
			id: string;
		};
		accessor.get(ITelemetryService).publicLog2<EditorActionInvokedEvent, EditorActionInvokedClassification>('editorActionInvoked', { name: this.label, id: this.id });
	}

	public abstract run(accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): void | Promise<void>;
}

export type EditorActionImplementation = (accessor: ServicesAccessor, editor: ICodeEditor, args: unknown) => boolean | Promise<void>;

export class MultiEditorAction extends EditorAction {

	private readonly _implementations: [number, EditorActionImplementation][] = [];

	/**
	 * A higher priority gets to be looked at first
	 */
	public addImplementation(priority: number, implementation: EditorActionImplementation): IDisposable {
		this._implementations.push([priority, implementation]);
		this._implementations.sort((a, b) => b[0] - a[0]);
		return {
			dispose: () => {
				for (let i = 0; i < this._implementations.length; i++) {
					if (this._implementations[i][1] === implementation) {
						this._implementations.splice(i, 1);
						return;
					}
				}
			}
		};
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: unknown): void | Promise<void> {
		for (const impl of this._implementations) {
			const result = impl[1](accessor, editor, args);
			if (result) {
				if (typeof result === 'boolean') {
					return;
				}
				return result;
			}
		}
	}

}

//#endregion EditorAction

//#region EditorAction2

export abstract class EditorAction2 extends Action2 {

	run(accessor: ServicesAccessor, ...args: unknown[]) {
		// Find the editor with text focus or active
		const codeEditorService = accessor.get(ICodeEditorService);
		const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
		if (!editor) {
			// well, at least we tried...
			return;
		}
		// precondition does hold
		return editor.invokeWithinContext((editorAccessor) => {
			const kbService = editorAccessor.get(IContextKeyService);
			const logService = editorAccessor.get(ILogService);
			const enabled = kbService.contextMatchesRules(this.desc.precondition ?? undefined);
			if (!enabled) {
				logService.debug(`[EditorAction2] NOT running command because its precondition is FALSE`, this.desc.id, this.desc.precondition?.serialize());
				return;
			}
			return this.runEditorCommand(editorAccessor, editor, ...args);
		});
	}

	abstract runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: unknown[]): unknown;
}

//#endregion

// --- Registration of commands and actions


export function registerModelAndPositionCommand(id: string, handler: (accessor: ServicesAccessor, model: ITextModel, position: Position, ...args: unknown[]) => unknown) {
	CommandsRegistry.registerCommand(id, function (accessor, ...args) {

		const instaService = accessor.get(IInstantiationService);

		const [resource, position] = args;
		assertType(URI.isUri(resource));
		assertType(Position.isIPosition(position));

		const model = accessor.get(IModelService).getModel(resource);
		if (model) {
			const editorPosition = Position.lift(position);
			return instaService.invokeFunction(handler, model, editorPosition, ...args.slice(2));
		}

		return accessor.get(ITextModelService).createModelReference(resource).then(reference => {
			return new Promise((resolve, reject) => {
				try {
					const result = instaService.invokeFunction(handler, reference.object.textEditorModel, Position.lift(position), args.slice(2));
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

export function registerEditorAction<T extends EditorAction>(ctor: { new(): T }): T {
	const action = new ctor();
	EditorContributionRegistry.INSTANCE.registerEditorAction(action);
	return action;
}

export function registerMultiEditorAction<T extends MultiEditorAction>(action: T): T {
	EditorContributionRegistry.INSTANCE.registerEditorAction(action);
	return action;
}

export function registerInstantiatedEditorAction(editorAction: EditorAction): void {
	EditorContributionRegistry.INSTANCE.registerEditorAction(editorAction);
}

/**
 * Registers an editor contribution. Editor contributions have a lifecycle which is bound
 * to a specific code editor instance.
 */
export function registerEditorContribution<Services extends BrandedService[]>(id: string, ctor: { new(editor: ICodeEditor, ...services: Services): IEditorContribution }, instantiation: EditorContributionInstantiation): void {
	EditorContributionRegistry.INSTANCE.registerEditorContribution(id, ctor, instantiation);
}

/**
 * Registers a diff editor contribution. Diff editor contributions have a lifecycle which
 * is bound to a specific diff editor instance.
 */
export function registerDiffEditorContribution<Services extends BrandedService[]>(id: string, ctor: { new(editor: IDiffEditor, ...services: Services): IEditorContribution }): void {
	EditorContributionRegistry.INSTANCE.registerDiffEditorContribution(id, ctor);
}

export namespace EditorExtensionsRegistry {

	export function getEditorCommand(commandId: string): EditorCommand {
		return EditorContributionRegistry.INSTANCE.getEditorCommand(commandId);
	}

	export function getEditorActions(): Iterable<EditorAction> {
		return EditorContributionRegistry.INSTANCE.getEditorActions();
	}

	export function getEditorContributions(): IEditorContributionDescription[] {
		return EditorContributionRegistry.INSTANCE.getEditorContributions();
	}

	export function getSomeEditorContributions(ids: string[]): IEditorContributionDescription[] {
		return EditorContributionRegistry.INSTANCE.getEditorContributions().filter(c => ids.indexOf(c.id) >= 0);
	}

	export function getDiffEditorContributions(): IDiffEditorContributionDescription[] {
		return EditorContributionRegistry.INSTANCE.getDiffEditorContributions();
	}
}

// Editor extension points
const Extensions = {
	EditorCommonContributions: 'editor.contributions'
};

class EditorContributionRegistry {

	public static readonly INSTANCE = new EditorContributionRegistry();

	private readonly editorContributions: IEditorContributionDescription[] = [];
	private readonly diffEditorContributions: IDiffEditorContributionDescription[] = [];
	private readonly editorActions: EditorAction[] = [];
	private readonly editorCommands: { [commandId: string]: EditorCommand } = Object.create(null);

	constructor() {
	}

	public registerEditorContribution<Services extends BrandedService[]>(id: string, ctor: { new(editor: ICodeEditor, ...services: Services): IEditorContribution }, instantiation: EditorContributionInstantiation): void {
		this.editorContributions.push({ id, ctor: ctor as EditorContributionCtor, instantiation });
	}

	public getEditorContributions(): IEditorContributionDescription[] {
		return this.editorContributions.slice(0);
	}

	public registerDiffEditorContribution<Services extends BrandedService[]>(id: string, ctor: { new(editor: IDiffEditor, ...services: Services): IEditorContribution }): void {
		this.diffEditorContributions.push({ id, ctor: ctor as DiffEditorContributionCtor });
	}

	public getDiffEditorContributions(): IDiffEditorContributionDescription[] {
		return this.diffEditorContributions.slice(0);
	}

	public registerEditorAction(action: EditorAction) {
		action.register();
		this.editorActions.push(action);
	}

	public getEditorActions(): Iterable<EditorAction> {
		return this.editorActions;
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

function registerCommand<T extends Command>(command: T): T {
	command.register();
	return command;
}

export const UndoCommand = registerCommand(new MultiCommand({
	id: 'undo',
	precondition: undefined,
	kbOpts: {
		weight: KeybindingWeight.EditorCore,
		primary: KeyMod.CtrlCmd | KeyCode.KeyZ
	},
	menuOpts: [{
		menuId: MenuId.MenubarEditMenu,
		group: '1_do',
		title: nls.localize({ key: 'miUndo', comment: ['&& denotes a mnemonic'] }, "&&Undo"),
		order: 1
	}, {
		menuId: MenuId.CommandPalette,
		group: '',
		title: nls.localize('undo', "Undo"),
		order: 1
	}, {
		menuId: MenuId.SimpleEditorContext,
		group: '1_do',
		title: nls.localize('undo', "Undo"),
		order: 1
	}]
}));

registerCommand(new ProxyCommand(UndoCommand, { id: 'default:undo', precondition: undefined }));

export const RedoCommand = registerCommand(new MultiCommand({
	id: 'redo',
	precondition: undefined,
	kbOpts: {
		weight: KeybindingWeight.EditorCore,
		primary: KeyMod.CtrlCmd | KeyCode.KeyY,
		secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ],
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ }
	},
	menuOpts: [{
		menuId: MenuId.MenubarEditMenu,
		group: '1_do',
		title: nls.localize({ key: 'miRedo', comment: ['&& denotes a mnemonic'] }, "&&Redo"),
		order: 2
	}, {
		menuId: MenuId.CommandPalette,
		group: '',
		title: nls.localize('redo', "Redo"),
		order: 1
	}, {
		menuId: MenuId.SimpleEditorContext,
		group: '1_do',
		title: nls.localize('redo', "Redo"),
		order: 2
	}]
}));

registerCommand(new ProxyCommand(RedoCommand, { id: 'default:redo', precondition: undefined }));

export const SelectAllCommand = registerCommand(new MultiCommand({
	id: 'editor.action.selectAll',
	precondition: undefined,
	kbOpts: {
		weight: KeybindingWeight.EditorCore,
		kbExpr: null,
		primary: KeyMod.CtrlCmd | KeyCode.KeyA
	},
	menuOpts: [{
		menuId: MenuId.MenubarSelectionMenu,
		group: '1_basic',
		title: nls.localize({ key: 'miSelectAll', comment: ['&& denotes a mnemonic'] }, "&&Select All"),
		order: 1
	}, {
		menuId: MenuId.CommandPalette,
		group: '',
		title: nls.localize('selectAll', "Select All"),
		order: 1
	}, {
		menuId: MenuId.SimpleEditorContext,
		group: '9_select',
		title: nls.localize('selectAll', "Select All"),
		order: 1
	}]
}));
