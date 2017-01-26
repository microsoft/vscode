/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Schemas } from 'vs/base/common/network';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IConfigurationService, IConfigurationServiceEvent, IConfigurationValue, getConfigurationValue, IConfigurationKeys } from 'vs/platform/configuration/common/configuration';
import { IEditor, IEditorInput, IEditorOptions, IEditorService, IResourceInput, Position } from 'vs/platform/editor/common/editor';
import { ICommandService, ICommand, ICommandEvent, ICommandHandler, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { AbstractKeybindingService } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { IKeybindingEvent, IKeybindingItem, KeybindingSource } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfirmation, IMessageService } from 'vs/platform/message/common/message';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { Selection } from 'vs/editor/common/core/selection';
import Event, { Emitter } from 'vs/base/common/event';
import { getDefaultValues as getDefaultConfiguration } from 'vs/platform/configuration/common/model';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { ITextModelResolverService, ITextModelContentProvider, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IDisposable, IReference, ImmortalReference, combinedDisposable } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { values } from 'vs/base/common/collections';
import { MenuId, MenuRegistry, ICommandAction, IMenu, IMenuService } from 'vs/platform/actions/common/actions';
import { Menu } from 'vs/platform/actions/common/menu';
import { ITelemetryService, ITelemetryExperiments, ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';

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
	public getSelection(): Selection { return this._widget.getSelection(); }
	public focus(): void { this._widget.focus(); }
	public isVisible(): boolean { return true; }

	public withTypedEditor<T>(codeEditorCallback: (editor: ICodeEditor) => T, diffEditorCallback: (editor: IDiffEditor) => T): T {
		if (this._widget.getEditorType() === editorCommon.EditorType.ICodeEditor) {
			// Single Editor
			return codeEditorCallback(<ICodeEditor>this._widget);
		} else {
			// Diff Editor
			return diffEditorCallback(<IDiffEditor>this._widget);
		}
	}
}

export class SimpleModel implements ITextEditorModel {

	private model: editorCommon.IModel;
	private _onDispose: Emitter<void>;

	constructor(model: editorCommon.IModel) {
		this.model = model;
		this._onDispose = new Emitter<void>();
	}

	public get onDispose(): Event<void> {
		return this._onDispose.event;
	}

	public load(): TPromise<SimpleModel> {
		return TPromise.as(this);
	}

	public get textEditorModel(): editorCommon.IModel {
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

	private doOpenEditor(editor: editorCommon.ICommonCodeEditor, data: IResourceInput): IEditor {
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
						window.open(data.resource.toString());
						return this.editor;
					}
				}
			}
			return null;
		}

		let selection = <editorCommon.IRange>data.options.selection;
		if (selection) {
			if (typeof selection.endLineNumber === 'number' && typeof selection.endColumn === 'number') {
				editor.setSelection(selection);
				editor.revealRangeInCenter(selection);
			} else {
				let pos = {
					lineNumber: selection.startLineNumber,
					column: selection.startColumn
				};
				editor.setPosition(pos);
				editor.revealPositionInCenter(pos);
			}
		}

		return this.editor;
	}

	private findModel(editor: editorCommon.ICommonCodeEditor, data: IResourceInput): editorCommon.IModel {
		let model = editor.getModel();
		if (model.uri.toString() !== data.resource.toString()) {
			return null;
		}

		return model;
	}
}

export class SimpleEditorModelResolverService implements ITextModelResolverService {
	public _serviceBrand: any;

	private editor: SimpleEditor;

	public setEditor(editor: editorCommon.IEditor): void {
		this.editor = new SimpleEditor(editor);
	}

	public createModelReference(resource: URI): TPromise<IReference<ITextEditorModel>> {
		let model: editorCommon.IModel;

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

	private findModel(editor: editorCommon.ICommonCodeEditor, resource: URI): editorCommon.IModel {
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

export class SimpleMessageService implements IMessageService {
	public _serviceBrand: any;

	private static Empty = function () { /* nothing */ };

	public show(sev: Severity, message: any): () => void {

		switch (sev) {
			case Severity.Error:
				console.error(message);
				break;
			case Severity.Warning:
				console.warn(message);
				break;
			default:
				console.log(message);
				break;
		}

		return SimpleMessageService.Empty;
	}

	public hideAll(): void {
		// No-op
	}

	public confirm(confirmation: IConfirmation): boolean {
		let messageText = confirmation.message;
		if (confirmation.detail) {
			messageText = messageText + '\n\n' + confirmation.detail;
		}

		return window.confirm(messageText);
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

	public addCommand(id: string, command: ICommand): IDisposable {
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
			return TPromise.wrapError(new Error(`command '${id}' not found`));
		}

		try {
			this._onWillExecuteCommand.fire({ commandId: id });
			const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler].concat(args));
			return TPromise.as(result);
		} catch (err) {
			return TPromise.wrapError(err);
		}
	}
}

export class StandaloneKeybindingService extends AbstractKeybindingService {
	private _cachedResolver: KeybindingResolver;
	private _dynamicKeybindings: IKeybindingItem[];

	constructor(
		contextKeyService: IContextKeyService,
		commandService: ICommandService,
		messageService: IMessageService,
		domNode: HTMLElement
	) {
		super(contextKeyService, commandService, messageService);

		this._cachedResolver = null;
		this._dynamicKeybindings = [];

		this.toDispose.push(dom.addDisposableListener(domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			let keyEvent = new StandardKeyboardEvent(e);
			let shouldPreventDefault = this._dispatch(keyEvent.toKeybinding(), keyEvent.target);
			if (shouldPreventDefault) {
				keyEvent.preventDefault();
			}
		}));
	}

	public addDynamicKeybinding(commandId: string, keybinding: number, handler: ICommandHandler, when: ContextKeyExpr): IDisposable {
		let toDispose: IDisposable[] = [];

		this._dynamicKeybindings.push({
			keybinding: keybinding,
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
			toDispose.push(commandService.addCommand(commandId, {
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
			this._cachedResolver = new KeybindingResolver(KeybindingsRegistry.getDefaultKeybindings(), this._getExtraKeybindings());
		}
		return this._cachedResolver;
	}

	private _getExtraKeybindings(): IKeybindingItem[] {
		return this._dynamicKeybindings;
	}
}

export class SimpleConfigurationService implements IConfigurationService {

	_serviceBrand: any;

	private _onDidUpdateConfiguration = new Emitter<IConfigurationServiceEvent>();
	public onDidUpdateConfiguration: Event<IConfigurationServiceEvent> = this._onDidUpdateConfiguration.event;

	private _config: any;

	constructor() {
		this._config = getDefaultConfiguration();
	}

	public getConfiguration<T>(section?: any): T {
		return this._config;
	}

	public reloadConfiguration<T>(section?: string): TPromise<T> {
		return TPromise.as(this.getConfiguration(section));
	}

	public lookup<C>(key: string): IConfigurationValue<C> {
		return {
			value: getConfigurationValue<C>(this.getConfiguration(), key),
			default: getConfigurationValue<C>(this.getConfiguration(), key),
			user: getConfigurationValue<C>(this.getConfiguration(), key)
		};
	}

	public keys(): IConfigurationKeys {
		return { default: [], user: [] };
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

	public getCommandActions(): ICommandAction[] {
		return values(MenuRegistry.commands);
	}
}

export class StandaloneTelemetryService implements ITelemetryService {
	_serviceBrand: void;

	public isOptedIn = false;

	public publicLog(eventName: string, data?: any): TPromise<void> {
		return TPromise.as<void>(null);
	}

	public getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return null;
	}

	public getExperiments(): ITelemetryExperiments {
		return null;
	}
}
