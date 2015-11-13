/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import Errors = require('vs/base/common/errors');
import Network = require('vs/base/common/network');
import EventEmitter = require('vs/base/common/eventEmitter');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Severity from 'vs/base/common/severity';
import Lifecycle = require('vs/base/common/lifecycle');
import KeybindingService = require('vs/platform/keybinding/browser/keybindingServiceImpl');
import {BaseRequestService} from 'vs/platform/request/common/baseRequestService';
import {IEditorInput, IEditorService, IEditorOptions, Position, IEditor, IResourceInput, ITextEditorModel} from 'vs/platform/editor/common/editor';
import {IMessageService, IConfirmation} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IKeybindingContextKey, IKeybindingItem, ICommandHandler, ICommandsMap} from 'vs/platform/keybinding/common/keybindingService';
import {AbstractPluginService} from 'vs/platform/plugins/common/abstractPluginService';
import {IOSupport} from 'vs/platform/keybinding/common/commonKeybindingResolver';
import {PluginsRegistry, PluginsMessageCollector} from 'vs/platform/plugins/common/pluginsRegistry';

export class SimpleEditor implements IEditor {

	public input:IEditorInput;
	public options:IEditorOptions;
	public position:Position;

	public _widget:EditorCommon.IEditor;

	constructor(editor:EditorCommon.IEditor) {
		this._widget = editor;
	}

	public getId():string { return 'editor'; }
	public getControl():EditorCommon.IEditor { return this._widget; }
	public getSelection():EditorCommon.IEditorSelection { return this._widget.getSelection(); }
	public focus():void { this._widget.focus(); }

	public withTypedEditor<T>(codeEditorCallback:(editor:EditorBrowser.ICodeEditor)=>T, diffEditorCallback:(editor:EditorBrowser.IDiffEditor)=>T): T {
		if (this._widget.getEditorType() === EditorCommon.EditorType.ICodeEditor) {
			// Single Editor
			return codeEditorCallback(<EditorBrowser.ICodeEditor>this._widget);
		} else {
			// Diff Editor
			return diffEditorCallback(<EditorBrowser.IDiffEditor>this._widget);
		}
	}
}

export class SimpleModel extends EventEmitter.EventEmitter implements ITextEditorModel  {

	private model:EditorCommon.IModel;

	constructor(model:EditorCommon.IModel) {
		super();
		this.model = model;
	}

	public get textEditorModel():EditorCommon.IModel {
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

	public setEditor(editor:EditorCommon.IEditor): void {
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

	private doOpenEditor(editor:EditorCommon.ICommonCodeEditor, data:IResourceInput): IEditor {
		var model = this.findModel(editor, data);
		if (!model) {
			if (data.resource) {
				if (this.openEditorDelegate) {
					this.openEditorDelegate(data.resource.toString());
					return null;
				} else {
					var schema = data.resource.scheme;
					if (schema === Network.schemas.http || schema === Network.schemas.https) {
						// This is a fully qualified http or https URL
						window.open(data.resource.toString());
						return this.editor;
					}
				}
			}
			return null;
		}


		var selection = <EditorCommon.IRange>data.options.selection;
		if (selection) {
			if (typeof selection.endLineNumber === 'number' && typeof selection.endColumn === 'number') {
				editor.setSelection(selection);
				editor.revealRangeInCenter(selection)
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

	private findModel(editor:EditorCommon.ICommonCodeEditor, data:IResourceInput): EditorCommon.IModel {
		var model = editor.getModel();
		if(!model.getAssociatedResource().equals(data.resource)) {
			return null;
		}

		return model;
	}

	public resolveEditorModel(typedData: IResourceInput, refresh?: boolean): TPromise<ITextEditorModel> {
		var model: EditorCommon.IModel;

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
				console.error(Errors.toErrorMessage(message, true));
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

	public setStatusMessage(message: string, autoDisposeAfter:number = -1): Lifecycle.IDisposable {
		return {
			dispose: () => { /* Nothing to do here */ }
		};
	}
}

export class SimpleEditorRequestService extends BaseRequestService {

	constructor(contextService: IWorkspaceContextService, telemetryService?: ITelemetryService) {
		super(contextService, telemetryService);
	}

	public getPath(service:string, requestUrl:Network.URL):string {
		return requestUrl.toString(); // Standalone Editor talks about  URLs that never have a path
	}
}

export class StandaloneKeybindingService extends KeybindingService.KeybindingService {
	private static LAST_GENERATED_ID = 0;

	private _dynamicKeybindings: IKeybindingItem[];
	private _dynamicCommands: ICommandsMap;

	constructor(domNode: HTMLElement) {
		this._dynamicKeybindings = [];
		this._dynamicCommands = Object.create(null);
		super(domNode);
	}

	public addDynamicKeybinding(keybinding: number, handler:ICommandHandler, context:string, commandId:string = null): string {
		if (commandId === null) {
			commandId = 'DYNAMIC_' + (++StandaloneKeybindingService.LAST_GENERATED_ID);
		}
		var parsedContext = IOSupport.readKeybindingContexts(context);
		this._dynamicKeybindings.push({
			keybinding: keybinding,
			command: commandId,
			context: parsedContext,
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

export class SimplePluginService extends AbstractPluginService {

	constructor() {
		super(true);
		PluginsRegistry.handleExtensionPoints((severity, source, message) => {
			this.showMessage(severity, source, message);
		});
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
}
