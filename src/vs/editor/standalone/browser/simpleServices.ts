/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Schemas } from 'vs/base/common/network';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IConfigurationService, IConfigurationChangeEvent, IConfigurationOverrides } from 'vs/platform/configuration/common/configuration';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IEditor, IEditorInput, IEditorOptions, IEditorService, IResourceInput, Position } from 'vs/platform/editor/common/editor';
import { ICommandService, ICommand, ICommandEvent, ICommandHandler, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { AbstractKeybindingService } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { IKeybindingEvent, KeybindingSource, IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkspaceContextService, IWorkspace, WorkbenchState, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor, IDiffEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import Event, { Emitter } from 'vs/base/common/event';
import { Configuration, DefaultConfigurationModel, ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { ITextModelService, ITextModelContentProvider, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IDisposable, IReference, ImmortalReference, combinedDisposable } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeybindingsRegistry, IKeybindingItem } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { MenuId, IMenu, IMenuService } from 'vs/platform/actions/common/actions';
import { Menu } from 'vs/platform/actions/common/menu';
import { ITelemetryService, ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { ResolvedKeybinding, Keybinding, createKeybinding, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { OS } from 'vs/base/common/platform';
import { IRange } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { INotificationService, INotification, INotificationHandle, NoOpNotification } from 'vs/platform/notification/common/notification';
import { IConfirmation, IConfirmationResult, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IPosition, Position as Pos } from 'vs/editor/common/core/position';

export class SimpleEditor implements IEditor {

	public input: IEditorInput;
	public options: IEditorOptions;
	public position: Position;

	public _widget: editorCommon.IEditor;

	constructor(editor: editorCommon.IEditor) {
		this._widget = editor;
	}

	public getId(): string { return 'editor'; }
	public getControl(): editorCommon.IEditor { return this._widget; }
	public focus(): void { this._widget.focus(); }
	public isVisible(): boolean { return true; }

	public withTypedEditor<T>(codeEditorCallback: (editor: ICodeEditor) => T, diffEditorCallback: (editor: IDiffEditor) => T): T {
		if (isCodeEditor(this._widget)) {
			// Single Editor
			return codeEditorCallback(<ICodeEditor>this._widget);
		} else {
			// Diff Editor
			return diffEditorCallback(<IDiffEditor>this._widget);
		}
	}
}

export class SimpleModel implements ITextEditorModel {

	private model: ITextModel;
	private _onDispose: Emitter<void>;

	constructor(model: ITextModel) {
		this.model = model;
		this._onDispose = new Emitter<void>();
	}

	public get onDispose(): Event<void> {
		return this._onDispose.event;
	}

	public load(): TPromise<SimpleModel> {
		return TPromise.as(this);
	}

	public get textEditorModel(): ITextModel {
		return this.model;
	}

	public dispose(): void {
		this._onDispose.fire();
	}
}

export interface IOpenEditorDelegate {
	(url: string): boolean;
}

export class SimpleEditorService implements IEditorService {
	public _serviceBrand: any;

	private editor: SimpleEditor;
	private openEditorDelegate: IOpenEditorDelegate;

	constructor() {
		this.openEditorDelegate = null;
	}

	public setEditor(editor: editorCommon.IEditor): void {
		this.editor = new SimpleEditor(editor);
	}

	public setOpenEditorDelegate(openEditorDelegate: IOpenEditorDelegate): void {
		this.openEditorDelegate = openEditorDelegate;
	}

	public openEditor(typedData: IResourceInput, sideBySide?: boolean): TPromise<IEditor> {
		return TPromise.as(this.editor.withTypedEditor(
			(editor) => this.doOpenEditor(editor, typedData),
			(diffEditor) => (
				this.doOpenEditor(diffEditor.getOriginalEditor(), typedData) ||
				this.doOpenEditor(diffEditor.getModifiedEditor(), typedData)
			)
		));
	}

	private doOpenEditor(editor: ICodeEditor, data: IResourceInput): IEditor {
		let model = this.findModel(editor, data);
		if (!model) {
			if (data.resource) {
				if (this.openEditorDelegate) {
					this.openEditorDelegate(data.resource.toString());
					return null;
				} else {
					let schema = data.resource.scheme;
					if (schema === Schemas.http || schema === Schemas.https) {
						// This is a fully qualified http or https URL
						dom.windowOpenNoOpener(data.resource.toString());
						return this.editor;
					}
				}
			}
			return null;
		}

		let selection = <IRange>data.options.selection;
		if (selection) {
			if (typeof selection.endLineNumber === 'number' && typeof selection.endColumn === 'number') {
				editor.setSelection(selection);
				editor.revealRangeInCenter(selection, editorCommon.ScrollType.Immediate);
			} else {
				let pos = {
					lineNumber: selection.startLineNumber,
					column: selection.startColumn
				};
				editor.setPosition(pos);
				editor.revealPositionInCenter(pos, editorCommon.ScrollType.Immediate);
			}
		}

		return this.editor;
	}

	private findModel(editor: ICodeEditor, data: IResourceInput): ITextModel {
		let model = editor.getModel();
		if (model.uri.toString() !== data.resource.toString()) {
			return null;
		}

		return model;
	}
}

export class SimpleEditorModelResolverService implements ITextModelService {
	public _serviceBrand: any;

	private editor: SimpleEditor;

	public setEditor(editor: editorCommon.IEditor): void {
		this.editor = new SimpleEditor(editor);
	}

	public createModelReference(resource: URI): TPromise<IReference<ITextEditorModel>> {
		let model: ITextModel;

		model = this.editor.withTypedEditor(
			(editor) => this.findModel(editor, resource),
			(diffEditor) => this.findModel(diffEditor.getOriginalEditor(), resource) || this.findModel(diffEditor.getModifiedEditor(), resource)
		);

		if (!model) {
			return TPromise.as(new ImmortalReference(null));
		}

		return TPromise.as(new ImmortalReference(new SimpleModel(model)));
	}

	public registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
		return {
			dispose: function () { /* no op */ }
		};
	}

	private findModel(editor: ICodeEditor, resource: URI): ITextModel {
		let model = editor.getModel();
		if (model.uri.toString() !== resource.toString()) {
			return null;
		}

		return model;
	}
}

export class SimpleProgressService implements IProgressService {
	_serviceBrand: any;

	private static NULL_PROGRESS_RUNNER: IProgressRunner = {
		done: () => { },
		total: () => { },
		worked: () => { }
	};

	show(infinite: boolean, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;
	show(): IProgressRunner {
		return SimpleProgressService.NULL_PROGRESS_RUNNER;
	}

	showWhile(promise: TPromise<any>, delay?: number): TPromise<void> {
		return null;
	}
}

export class SimpleDialogService implements IDialogService {

	public _serviceBrand: any;

	public confirm(confirmation: IConfirmation): TPromise<IConfirmationResult> {
		return this.doConfirm(confirmation).then(confirmed => {
			return {
				confirmed,
				checkboxChecked: false // unsupported
			} as IConfirmationResult;
		});
	}

	private doConfirm(confirmation: IConfirmation): TPromise<boolean> {
		let messageText = confirmation.message;
		if (confirmation.detail) {
			messageText = messageText + '\n\n' + confirmation.detail;
		}

		return TPromise.wrap(window.confirm(messageText));
	}
}

export class SimpleNotificationService implements INotificationService {

	public _serviceBrand: any;

	private static readonly NO_OP: INotificationHandle = new NoOpNotification();

	public info(message: string): INotificationHandle {
		return this.notify({ severity: Severity.Info, message });
	}

	public warn(message: string): INotificationHandle {
		return this.notify({ severity: Severity.Warning, message });
	}

	public error(error: string | Error): INotificationHandle {
		return this.notify({ severity: Severity.Error, message: error });
	}

	public notify(notification: INotification): INotificationHandle {
		switch (notification.severity) {
			case Severity.Error:
				console.error(notification.message);
				break;
			case Severity.Warning:
				console.warn(notification.message);
				break;
			default:
				console.log(notification.message);
				break;
		}

		return SimpleNotificationService.NO_OP;
	}
}

export class StandaloneCommandService implements ICommandService {
	_serviceBrand: any;

	private readonly _instantiationService: IInstantiationService;
	private _dynamicCommands: { [id: string]: ICommand; };

	private _onWillExecuteCommand: Emitter<ICommandEvent> = new Emitter<ICommandEvent>();
	public readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	constructor(instantiationService: IInstantiationService) {
		this._instantiationService = instantiationService;
		this._dynamicCommands = Object.create(null);
	}

	public addCommand(command: ICommand): IDisposable {
		const { id } = command;
		this._dynamicCommands[id] = command;
		return {
			dispose: () => {
				delete this._dynamicCommands[id];
			}
		};
	}

	public executeCommand<T>(id: string, ...args: any[]): TPromise<T> {
		const command = (CommandsRegistry.getCommand(id) || this._dynamicCommands[id]);
		if (!command) {
			return TPromise.wrapError<T>(new Error(`command '${id}' not found`));
		}

		try {
			this._onWillExecuteCommand.fire({ commandId: id });
			const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler].concat(args));
			return TPromise.as(result);
		} catch (err) {
			return TPromise.wrapError<T>(err);
		}
	}
}

export class StandaloneKeybindingService extends AbstractKeybindingService {
	private _cachedResolver: KeybindingResolver;
	private _dynamicKeybindings: IKeybindingItem[];

	constructor(
		contextKeyService: IContextKeyService,
		commandService: ICommandService,
		telemetryService: ITelemetryService,
		notificationService: INotificationService,
		domNode: HTMLElement
	) {
		super(contextKeyService, commandService, telemetryService, notificationService);

		this._cachedResolver = null;
		this._dynamicKeybindings = [];

		this.toDispose.push(dom.addDisposableListener(domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			let keyEvent = new StandardKeyboardEvent(e);
			let shouldPreventDefault = this._dispatch(keyEvent, keyEvent.target);
			if (shouldPreventDefault) {
				keyEvent.preventDefault();
			}
		}));
	}

	public addDynamicKeybinding(commandId: string, keybinding: number, handler: ICommandHandler, when: ContextKeyExpr): IDisposable {
		let toDispose: IDisposable[] = [];

		this._dynamicKeybindings.push({
			keybinding: createKeybinding(keybinding, OS),
			command: commandId,
			when: when,
			weight1: 1000,
			weight2: 0
		});

		toDispose.push({
			dispose: () => {
				for (let i = 0; i < this._dynamicKeybindings.length; i++) {
					let kb = this._dynamicKeybindings[i];
					if (kb.command === commandId) {
						this._dynamicKeybindings.splice(i, 1);
						this.updateResolver({ source: KeybindingSource.Default });
						return;
					}
				}
			}
		});

		let commandService = this._commandService;
		if (commandService instanceof StandaloneCommandService) {
			toDispose.push(commandService.addCommand({
				id: commandId,
				handler: handler
			}));
		} else {
			throw new Error('Unknown command service!');
		}
		this.updateResolver({ source: KeybindingSource.Default });

		return combinedDisposable(toDispose);
	}

	private updateResolver(event: IKeybindingEvent): void {
		this._cachedResolver = null;
		this._onDidUpdateKeybindings.fire(event);
	}

	protected _getResolver(): KeybindingResolver {
		if (!this._cachedResolver) {
			const defaults = this._toNormalizedKeybindingItems(KeybindingsRegistry.getDefaultKeybindings(), true);
			const overrides = this._toNormalizedKeybindingItems(this._dynamicKeybindings, false);
			this._cachedResolver = new KeybindingResolver(defaults, overrides);
		}
		return this._cachedResolver;
	}

	private _toNormalizedKeybindingItems(items: IKeybindingItem[], isDefault: boolean): ResolvedKeybindingItem[] {
		let result: ResolvedKeybindingItem[] = [], resultLen = 0;
		for (let i = 0, len = items.length; i < len; i++) {
			const item = items[i];
			const when = (item.when ? item.when.normalize() : null);
			const keybinding = item.keybinding;

			if (!keybinding) {
				// This might be a removal keybinding item in user settings => accept it
				result[resultLen++] = new ResolvedKeybindingItem(null, item.command, item.commandArgs, when, isDefault);
			} else {
				const resolvedKeybindings = this.resolveKeybinding(keybinding);
				for (let j = 0; j < resolvedKeybindings.length; j++) {
					result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybindings[j], item.command, item.commandArgs, when, isDefault);
				}
			}
		}

		return result;
	}

	public resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[] {
		return [new USLayoutResolvedKeybinding(keybinding, OS)];
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding {
		let keybinding = new SimpleKeybinding(
			keyboardEvent.ctrlKey,
			keyboardEvent.shiftKey,
			keyboardEvent.altKey,
			keyboardEvent.metaKey,
			keyboardEvent.keyCode
		);
		return new USLayoutResolvedKeybinding(keybinding, OS);
	}

	public resolveUserBinding(userBinding: string): ResolvedKeybinding[] {
		return [];
	}
}

function isConfigurationOverrides(thing: any): thing is IConfigurationOverrides {
	return thing
		&& typeof thing === 'object'
		&& (!thing.overrideIdentifier || typeof thing.overrideIdentifier === 'string')
		&& (!thing.resource || thing.resource instanceof URI);
}

export class SimpleConfigurationService implements IConfigurationService {

	_serviceBrand: any;

	private _onDidChangeConfiguration = new Emitter<IConfigurationChangeEvent>();
	public onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	private _configuration: Configuration;

	constructor() {
		this._configuration = new Configuration(new DefaultConfigurationModel(), new ConfigurationModel());
	}

	private configuration(): Configuration {
		return this._configuration;
	}

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: any, arg2?: any): any {
		const section = typeof arg1 === 'string' ? arg1 : void 0;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : {};
		return this.configuration().getValue(section, overrides, null);
	}

	public updateValue(key: string, value: any, arg3?: any, arg4?: any): TPromise<void> {
		return TPromise.as(null);
	}

	public inspect<C>(key: string, options: IConfigurationOverrides = {}): {
		default: C,
		user: C,
		workspace: C,
		workspaceFolder: C
		value: C,
	} {
		return this.configuration().inspect<C>(key, options, null);
	}

	public keys() {
		return this.configuration().keys(null);
	}

	public reloadConfiguration(): TPromise<void> {
		return TPromise.as(null);
	}

	public getConfigurationData() {
		return null;
	}
}

export class SimpleResourceConfigurationService implements ITextResourceConfigurationService {

	_serviceBrand: any;

	public readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent>;
	private readonly _onDidChangeConfigurationEmitter = new Emitter();

	constructor(private configurationService: SimpleConfigurationService) {
		this.configurationService.onDidChangeConfiguration((e) => {
			this._onDidChangeConfigurationEmitter.fire(e);
		});
	}

	getValue<T>(resource: URI, section?: string): T;
	getValue<T>(resource: URI, position?: IPosition, section?: string): T;
	getValue<T>(resource: any, arg2?: any, arg3?: any) {
		const position: IPosition = Pos.isIPosition(arg2) ? arg2 : null;
		const section: string = position ? (typeof arg3 === 'string' ? arg3 : void 0) : (typeof arg2 === 'string' ? arg2 : void 0);
		return this.configurationService.getValue<T>(section);
	}
}

export class SimpleMenuService implements IMenuService {

	_serviceBrand: any;

	private readonly _commandService: ICommandService;

	constructor(commandService: ICommandService) {
		this._commandService = commandService;
	}

	public createMenu(id: MenuId, contextKeyService: IContextKeyService): IMenu {
		return new Menu(id, TPromise.as(true), this._commandService, contextKeyService);
	}
}

export class StandaloneTelemetryService implements ITelemetryService {
	_serviceBrand: void;

	public isOptedIn = false;

	public publicLog(eventName: string, data?: any): TPromise<void> {
		return TPromise.wrap<void>(null);
	}

	public getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return null;
	}
}

export class SimpleWorkspaceContextService implements IWorkspaceContextService {

	public _serviceBrand: any;

	private static SCHEME: 'inmemory';

	private readonly _onDidChangeWorkspaceName: Emitter<void> = new Emitter<void>();
	public readonly onDidChangeWorkspaceName: Event<void> = this._onDidChangeWorkspaceName.event;

	private readonly _onDidChangeWorkspaceFolders: Emitter<IWorkspaceFoldersChangeEvent> = new Emitter<IWorkspaceFoldersChangeEvent>();
	public readonly onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent> = this._onDidChangeWorkspaceFolders.event;

	private readonly _onDidChangeWorkbenchState: Emitter<WorkbenchState> = new Emitter<WorkbenchState>();
	public readonly onDidChangeWorkbenchState: Event<WorkbenchState> = this._onDidChangeWorkbenchState.event;

	private readonly workspace: IWorkspace;

	constructor() {
		const resource = URI.from({ scheme: SimpleWorkspaceContextService.SCHEME, authority: 'model', path: '/' });
		this.workspace = { id: '4064f6ec-cb38-4ad0-af64-ee6467e63c82', folders: [new WorkspaceFolder({ uri: resource, name: '', index: 0 })], name: resource.fsPath };
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}

	public getWorkbenchState(): WorkbenchState {
		if (this.workspace) {
			if (this.workspace.configuration) {
				return WorkbenchState.WORKSPACE;
			}
			return WorkbenchState.FOLDER;
		}
		return WorkbenchState.EMPTY;
	}

	public getWorkspaceFolder(resource: URI): IWorkspaceFolder {
		return resource && resource.scheme === SimpleWorkspaceContextService.SCHEME ? this.workspace.folders[0] : void 0;
	}

	public isInsideWorkspace(resource: URI): boolean {
		return resource && resource.scheme === SimpleWorkspaceContextService.SCHEME;
	}

	public isCurrentWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): boolean {
		return true;
	}
}
