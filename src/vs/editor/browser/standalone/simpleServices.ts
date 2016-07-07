/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {toErrorMessage} from 'vs/base/common/errors';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import {Schemas} from 'vs/base/common/network';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ConfigurationService, IContent, IStat} from 'vs/platform/configuration/common/configurationService';
import {IEditor, IEditorInput, IEditorOptions, IEditorService, IResourceInput, ITextEditorModel, Position} from 'vs/platform/editor/common/editor';
import {AbstractExtensionService, ActivatedExtension} from 'vs/platform/extensions/common/abstractExtensionService';
import {IExtensionDescription} from 'vs/platform/extensions/common/extensions';
import {ICommandHandler} from 'vs/platform/commands/common/commands';
import {KeybindingService} from 'vs/platform/keybinding/browser/keybindingServiceImpl';
import {IOSupport} from 'vs/platform/keybinding/common/keybindingResolver';
import {IKeybindingItem} from 'vs/platform/keybinding/common/keybinding';
import {IConfirmation, IMessageService} from 'vs/platform/message/common/message';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ICodeEditor, IDiffEditor} from 'vs/editor/browser/editorBrowser';
import {Selection} from 'vs/editor/common/core/selection';
import {IEventService} from 'vs/platform/event/common/event';

export class SimpleEditor implements IEditor {

	public input:IEditorInput;
	public options:IEditorOptions;
	public position:Position;

	public _widget:editorCommon.IEditor;

	constructor(editor:editorCommon.IEditor) {
		this._widget = editor;
	}

	public getId():string { return 'editor'; }
	public getControl():editorCommon.IEditor { return this._widget; }
	public getSelection():Selection { return this._widget.getSelection(); }
	public focus():void { this._widget.focus(); }

	public withTypedEditor<T>(codeEditorCallback:(editor:ICodeEditor)=>T, diffEditorCallback:(editor:IDiffEditor)=>T): T {
		if (this._widget.getEditorType() === editorCommon.EditorType.ICodeEditor) {
			// Single Editor
			return codeEditorCallback(<ICodeEditor>this._widget);
		} else {
			// Diff Editor
			return diffEditorCallback(<IDiffEditor>this._widget);
		}
	}
}

export class SimpleModel extends EventEmitter implements ITextEditorModel  {

	private model:editorCommon.IModel;

	constructor(model:editorCommon.IModel) {
		super();
		this.model = model;
	}

	public get textEditorModel():editorCommon.IModel {
		return this.model;
	}
}

export interface IOpenEditorDelegate {
	(url:string): boolean;
}

export class SimpleEditorService implements IEditorService {
	public serviceId = IEditorService;

	private editor:SimpleEditor;
	private openEditorDelegate:IOpenEditorDelegate;

	constructor() {
		this.openEditorDelegate = null;
	}

	public setEditor(editor:editorCommon.IEditor): void {
		this.editor = new SimpleEditor(editor);
	}

	public setOpenEditorDelegate(openEditorDelegate:IOpenEditorDelegate): void {
		this.openEditorDelegate = openEditorDelegate;
	}

	public openEditor(typedData:IResourceInput, sideBySide?:boolean): TPromise<IEditor> {
		return TPromise.as(this.editor.withTypedEditor(
			(editor) => this.doOpenEditor(editor, typedData),
			(diffEditor) => (
				this.doOpenEditor(diffEditor.getOriginalEditor(), typedData) ||
				this.doOpenEditor(diffEditor.getModifiedEditor(), typedData)
			)
		));
	}

	private doOpenEditor(editor:editorCommon.ICommonCodeEditor, data:IResourceInput): IEditor {
		var model = this.findModel(editor, data);
		if (!model) {
			if (data.resource) {
				if (this.openEditorDelegate) {
					this.openEditorDelegate(data.resource.toString());
					return null;
				} else {
					var schema = data.resource.scheme;
					if (schema === Schemas.http || schema === Schemas.https) {
						// This is a fully qualified http or https URL
						window.open(data.resource.toString());
						return this.editor;
					}
				}
			}
			return null;
		}


		var selection = <editorCommon.IRange>data.options.selection;
		if (selection) {
			if (typeof selection.endLineNumber === 'number' && typeof selection.endColumn === 'number') {
				editor.setSelection(selection);
				editor.revealRangeInCenter(selection);
			} else {
				var pos = {
					lineNumber: selection.startLineNumber,
					column: selection.startColumn
				};
				editor.setPosition(pos);
				editor.revealPositionInCenter(pos);
			}
		}

		return this.editor;
	}

	private findModel(editor:editorCommon.ICommonCodeEditor, data:IResourceInput): editorCommon.IModel {
		var model = editor.getModel();
		if(model.uri.toString() !== data.resource.toString()) {
			return null;
		}

		return model;
	}

	public resolveEditorModel(typedData: IResourceInput, refresh?: boolean): TPromise<ITextEditorModel> {
		var model: editorCommon.IModel;

		model = this.editor.withTypedEditor(
			(editor) => this.findModel(editor, typedData),
			(diffEditor) => this.findModel(diffEditor.getOriginalEditor(), typedData) || this.findModel(diffEditor.getModifiedEditor(), typedData)
		);

		if (!model) {
			return TPromise.as(null);
		}

		return TPromise.as(new SimpleModel(model));
	}
}

export class SimpleMessageService implements IMessageService {
	public serviceId = IMessageService;

	private static Empty = function() { /* nothing */};

	public show(sev:Severity, message:any):()=>void {

		switch(sev) {
			case Severity.Error:
				console.error(toErrorMessage(message, true));
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

	public hideAll():void {
		// No-op
	}

	public confirm(confirmation:IConfirmation):boolean {
		var messageText = confirmation.message;
		if (confirmation.detail) {
			messageText = messageText + '\n\n' + confirmation.detail;
		}

		return window.confirm(messageText);
	}
}

export class StandaloneKeybindingService extends KeybindingService {
	private static LAST_GENERATED_ID = 0;

	private _dynamicKeybindings: IKeybindingItem[];
	private _dynamicCommands: { [id: string]: ICommandHandler };

	constructor(configurationService: IConfigurationService, messageService: IMessageService, domNode: HTMLElement) {
		super(configurationService, messageService);

		this._dynamicKeybindings = [];
		this._dynamicCommands = Object.create(null);

		this._beginListening(domNode);
	}

	public addDynamicKeybinding(keybinding: number, handler:ICommandHandler, when:string, commandId:string = null): string {
		if (commandId === null) {
			commandId = 'DYNAMIC_' + (++StandaloneKeybindingService.LAST_GENERATED_ID);
		}
		var parsedContext = IOSupport.readKeybindingWhen(when);
		this._dynamicKeybindings.push({
			keybinding: keybinding,
			command: commandId,
			when: parsedContext,
			weight1: 1000,
			weight2: 0
		});
		this._dynamicCommands[commandId] = handler;
		this.updateResolver();
		return commandId;
	}

	protected _getExtraKeybindings(isFirstTime:boolean): IKeybindingItem[] {
		return this._dynamicKeybindings;
	}

	protected _getCommandHandler(commandId:string): ICommandHandler {
		return super._getCommandHandler(commandId) || this._dynamicCommands[commandId];
	}
}

export class SimpleExtensionService extends AbstractExtensionService<ActivatedExtension> {

	constructor() {
		super(true);
	}

	protected _showMessage(severity:Severity, msg:string): void {
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

export class SimpleConfigurationService extends ConfigurationService {

	constructor(contextService: IWorkspaceContextService, eventService: IEventService) {
		super(contextService, eventService);
		this.initialize();
	}

	protected resolveContents(resources: URI[]): TPromise<IContent[]> {
		return TPromise.as(resources.map((resource) => {
			return {
				resource: resource,
				value: ''
			};
		}));
	}

	protected resolveContent(resource: URI): TPromise<IContent> {
		return TPromise.as({
			resource: resource,
			value: ''
		});
	}

	protected resolveStat(resource: URI): TPromise<IStat> {
		return TPromise.as({
			resource: resource,
			isDirectory: false
		});
	}

	setUserConfiguration(key: any, value: any) : Thenable<void> {
		return TPromise.as(null);
	}

}
