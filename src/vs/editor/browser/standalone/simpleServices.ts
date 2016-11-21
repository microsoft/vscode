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
import { AbstractExtensionService, ActivatedExtension } from 'vs/platform/extensions/common/abstractExtensionService';
import { IExtensionDescription, IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ICommandService, ICommand, ICommandHandler } from 'vs/platform/commands/common/commands';
import { KeybindingService } from 'vs/platform/keybinding/browser/keybindingServiceImpl';
import { IOSupport } from 'vs/platform/keybinding/common/keybindingResolver';
import { IKeybindingItem } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfirmation, IMessageService } from 'vs/platform/message/common/message';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { Selection } from 'vs/editor/common/core/selection';
import Event, { Emitter } from 'vs/base/common/event';
import { getDefaultValues as getDefaultConfiguration } from 'vs/platform/configuration/common/model';
import { CommandService } from 'vs/platform/commands/common/commandService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { ITextModelResolverService, ITextModelContentProvider, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IDisposable, IReference, ImmortalReference } from 'vs/base/common/lifecycle';

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

export class StandaloneCommandService extends CommandService {

	private _dynamicCommands: { [id: string]: ICommand; };

	constructor(
		instantiationService: IInstantiationService,
		extensionService: IExtensionService
	) {
		super(instantiationService, extensionService);

		this._dynamicCommands = Object.create(null);
	}

	public addCommand(id: string, command: ICommand): void {
		this._dynamicCommands[id] = command;
	}

	protected _getCommand(id: string): ICommand {
		return super._getCommand(id) || this._dynamicCommands[id];
	}
}

export class StandaloneKeybindingService extends KeybindingService {
	private static LAST_GENERATED_ID = 0;

	private _dynamicKeybindings: IKeybindingItem[];

	constructor(
		contextKeyService: IContextKeyService,
		commandService: ICommandService,
		messageService: IMessageService,
		domNode: HTMLElement
	) {
		super(contextKeyService, commandService, messageService);

		this._dynamicKeybindings = [];

		this._beginListening(domNode);
	}

	public addDynamicKeybinding(keybinding: number, handler: ICommandHandler, when: string, commandId: string = null): string {
		if (commandId === null) {
			commandId = 'DYNAMIC_' + (++StandaloneKeybindingService.LAST_GENERATED_ID);
		}
		let parsedContext = IOSupport.readKeybindingWhen(when);
		this._dynamicKeybindings.push({
			keybinding: keybinding,
			command: commandId,
			when: parsedContext,
			weight1: 1000,
			weight2: 0
		});

		let commandService = this._commandService;
		if (commandService instanceof StandaloneCommandService) {
			commandService.addCommand(commandId, {
				handler: handler
			});
		} else {
			throw new Error('Unknown command service!');
		}
		this.updateResolver();
		return commandId;
	}

	protected _getExtraKeybindings(isFirstTime: boolean): IKeybindingItem[] {
		return this._dynamicKeybindings;
	}
}

export class SimpleExtensionService extends AbstractExtensionService<ActivatedExtension> {

	constructor() {
		super(true);
	}

	protected _showMessage(severity: Severity, msg: string): void {
		switch (severity) {
			case Severity.Error:
				console.error(msg);
				break;
			case Severity.Warning:
				console.warn(msg);
				break;
			case Severity.Info:
				console.info(msg);
				break;
			default:
				console.log(msg);
		}
	}

	protected _createFailedExtension(): ActivatedExtension {
		throw new Error('unexpected');
	}

	protected _actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<ActivatedExtension> {
		throw new Error('unexpected');
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

	public getConfiguration<T>(section?: string): T {
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
