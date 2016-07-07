/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	createMainContextProxyIdentifier as createMainId,
	createExtHostContextProxyIdentifier as createExtId,
	ProxyIdentifier, IThreadService
} from 'vs/workbench/services/thread/common/threadService';

import * as vscode from 'vscode';

import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';

import {IMarkerData} from 'vs/platform/markers/common/markers';
import {Position as EditorPosition} from 'vs/platform/editor/common/editor';
import {IMessage, IExtensionDescription} from 'vs/platform/extensions/common/extensions';
import {StatusbarAlignment as MainThreadStatusBarAlignment} from 'vs/platform/statusbar/common/statusbar';
import {ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import {ICommandHandlerDescription} from 'vs/platform/commands/common/commands';

import * as editorCommon from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import {IResourceEdit} from 'vs/editor/common/services/bulkEdit';

import {IPickOpenEntry, IPickOptions} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {ITypeBearing} from 'vs/workbench/parts/search/common/search';
import {TextEditorRevealType, ITextEditorConfigurationUpdate, IResolvedTextEditorConfiguration} from './mainThreadEditorsTracker';
import {EndOfLine} from './extHostTypes';

export interface InstanceSetter<T> {
	set<R extends T>(instance:T): R;
}

export class InstanceCollection {
	private _items: {[id:string]:any;};

	constructor() {
		this._items = Object.create(null);
	}

	public define<T>(id:ProxyIdentifier<T>): InstanceSetter<T> {
		let that = this;
		return new class {
			set(value:T) {
				that._set(id, value);
				return value;
			}
		};
	}

	_set<T>(id:ProxyIdentifier<T>, value:T): void {
		this._items[id.id] = value;
	}

	public finish(isMain:boolean, threadService:IThreadService): void {
		let expected = (isMain ? MainContext : ExtHostContext);
		Object.keys(expected).forEach((key) => {
			let id = expected[key];
			let value = this._items[id.id];

			if (!value) {
				throw new Error(`Missing actor ${key} (isMain: ${id.isMain}, id:  ${id.id})`);
			}
			threadService.set<any>(id, value);
		});
	}
}

function ni() { return new Error('Not implemented'); }

// --- main thread

export abstract class MainThreadCommandsShape {
	$registerCommand(id: string): TPromise<any> { throw ni(); }
	$executeCommand<T>(id: string, args: any[]): Thenable<T> { throw ni(); }
	$getCommands(): Thenable<string[]> { throw ni(); }
}

export abstract class MainThreadConfigurationShape {
}

export abstract class MainThreadDiagnosticsShape {
	$changeMany(owner: string, entries: [URI, IMarkerData[]][]): TPromise<any> { throw ni(); }
	$clear(owner: string): TPromise<any> { throw ni(); }
}

export abstract class MainThreadDocumentsShape {
	_tryOpenDocument(uri: URI): TPromise<any> { throw ni(); }
	$registerTextContentProvider(handle:number, scheme: string): void { throw ni(); }
	$onVirtualDocumentChange(uri: URI, value: string): void { throw ni(); }
	$unregisterTextContentProvider(handle: number): void { throw ni(); }
	_trySaveDocument(uri: URI): TPromise<boolean> { throw ni(); }
}

export abstract class MainThreadEditorsShape {
	_tryShowTextDocument(resource: URI, position: EditorPosition, preserveFocus: boolean): TPromise<string> { throw ni(); }
	_registerTextEditorDecorationType(key: string, options: editorCommon.IDecorationRenderOptions): void { throw ni(); }
	_removeTextEditorDecorationType(key: string): void { throw ni(); }
	_tryShowEditor(id: string, position: EditorPosition): TPromise<void> { throw ni(); }
	_tryHideEditor(id: string): TPromise<void> { throw ni(); }
	_trySetOptions(id: string, options: ITextEditorConfigurationUpdate): TPromise<any> { throw ni(); }
	_trySetDecorations(id: string, key: string, ranges: editorCommon.IDecorationOptions[]): TPromise<any> { throw ni(); }
	_tryRevealRange(id: string, range: editorCommon.IRange, revealType: TextEditorRevealType): TPromise<any> { throw ni(); }
	_trySetSelections(id: string, selections: editorCommon.ISelection[]): TPromise<any> { throw ni(); }
	_tryApplyEdits(id: string, modelVersionId: number, edits: editorCommon.ISingleEditOperation[], setEndOfLine:EndOfLine): TPromise<boolean> { throw ni(); }
}

export abstract class MainThreadErrorsShape {
	onUnexpectedExtHostError(err: any): void { throw ni(); }
}

export abstract class MainThreadLanguageFeaturesShape {
	$unregister(handle: number): TPromise<any> { throw ni(); }
	$registerOutlineSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerCodeLensSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerDeclaractionSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerHoverProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerDocumentHighlightProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerReferenceSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerQuickFixSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerDocumentFormattingSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerRangeFormattingSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerOnTypeFormattingSupport(handle: number, selector: vscode.DocumentSelector, autoFormatTriggerCharacters: string[]): TPromise<any> { throw ni(); }
	$registerNavigateTypeSupport(handle: number): TPromise<any> { throw ni(); }
	$registerRenameSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any> { throw ni(); }
	$registerSuggestSupport(handle: number, selector: vscode.DocumentSelector, triggerCharacters: string[]): TPromise<any> { throw ni(); }
	$registerSignatureHelpProvider(handle: number, selector: vscode.DocumentSelector, triggerCharacter: string[]): TPromise<any> { throw ni(); }
	$setLanguageConfiguration(handle: number, languageId:string, configuration: vscode.LanguageConfiguration): TPromise<any> { throw ni(); }
}

export abstract class MainThreadLanguagesShape {
	_getLanguages(): TPromise<string[]> { throw ni(); }
}

export abstract class MainThreadMessageServiceShape {
	$showMessage(severity: Severity, message: string, commands: { title: string; isCloseAffordance: boolean; handle: number; }[]): Thenable<number> { throw ni(); }
}

export abstract class MainThreadOutputServiceShape {
	append(channelId: string, label: string, value: string): TPromise<void> { throw ni(); }
	clear(channelId: string, label: string): TPromise<void> { throw ni(); }
	reveal(channelId: string, label: string, preserveFocus: boolean): TPromise<void> { throw ni(); }
	close(channelId: string): TPromise<void> { throw ni(); }
}

export interface MyQuickPickItems extends IPickOpenEntry {
	handle: number;
}
export abstract class MainThreadQuickOpenShape {
	$show(options: IPickOptions): Thenable<number> { throw ni(); }
	$setItems(items: MyQuickPickItems[]): Thenable<any> { throw ni(); }
	$setError(error: Error): Thenable<any> { throw ni(); }
	$input(options: vscode.InputBoxOptions, validateInput: boolean): Thenable<string> { throw ni(); }
}

export abstract class MainThreadStatusBarShape {
	setEntry(id: number, text: string, tooltip: string, command: string, color: string, alignment: MainThreadStatusBarAlignment, priority: number): void { throw ni(); }
	dispose(id: number) { throw ni(); }
}

export abstract class MainThreadStorageShape {
	getValue<T>(shared: boolean, key: string): TPromise<T> { throw ni(); }
	setValue(shared: boolean, key: string, value: any): TPromise<any> { throw ni(); }
}

export abstract class MainThreadTelemetryShape {
	$publicLog(eventName: string, data?: any): void { throw ni(); }
	$getTelemetryInfo(): TPromise<ITelemetryInfo> { throw ni(); }
}

export abstract class MainThreadWorkspaceShape {
	$startSearch(include: string, exclude: string, maxResults: number, requestId: number): Thenable<URI[]> { throw ni(); }
	$cancelSearch(requestId: number): Thenable<boolean> { throw ni(); }
	$saveAll(includeUntitled?: boolean): Thenable<boolean> { throw ni(); }
	$applyWorkspaceEdit(edits: IResourceEdit[]): TPromise<boolean> { throw ni(); }
}

export abstract class MainProcessExtensionServiceShape {
	public $onExtensionHostReady(extensionDescriptions: IExtensionDescription[], messages: IMessage[]): TPromise<void> { throw ni(); }
	public $localShowMessage(severity: Severity, msg: string): void { throw ni(); }
	public $onExtensionActivated(extensionId: string): void { throw ni(); }
	public $onExtensionActivationFailed(extensionId: string): void { throw ni(); }
}

// -- extension host

export abstract class ExtHostCommandsShape {
	$executeContributedCommand<T>(id: string, ...args: any[]): Thenable<T> { throw ni(); }
	$getContributedCommandHandlerDescriptions(): TPromise<{ [id: string]: string | ICommandHandlerDescription }> { throw ni(); }
}

export abstract class ExtHostConfigurationShape {
	$acceptConfigurationChanged(config: any) { throw ni(); }
}

export abstract class ExtHostDiagnosticsShape {

}

export interface IModelAddedData {
	url: URI;
	versionId: number;
	value: editorCommon.IRawText;
	modeId: string;
	isDirty: boolean;
}
export abstract class ExtHostDocumentsShape {
	$provideTextDocumentContent(handle: number, uri: URI): TPromise<string> { throw ni(); }
	_acceptModelAdd(initData: IModelAddedData): void { throw ni(); }
	_acceptModelModeChanged(strURL: string, oldModeId: string, newModeId: string): void { throw ni(); }
	_acceptModelSaved(strURL: string): void { throw ni(); }
	_acceptModelDirty(strURL: string): void { throw ni(); }
	_acceptModelReverted(strURL: string): void { throw ni(); }
	_acceptModelRemoved(strURL: string): void { throw ni(); }
	_acceptModelChanged(strURL: string, events: editorCommon.IModelContentChangedEvent2[]): void { throw ni(); }
}

export interface ITextEditorAddData {
	id: string;
	document: URI;
	options: IResolvedTextEditorConfiguration;
	selections: editorCommon.ISelection[];
	editorPosition: EditorPosition;
}
export interface ITextEditorPositionData {
	[id: string]: EditorPosition;
}
export abstract class ExtHostEditorsShape {
	_acceptTextEditorAdd(data: ITextEditorAddData): void { throw ni(); }
	_acceptOptionsChanged(id: string, opts: IResolvedTextEditorConfiguration): void { throw ni(); }
	_acceptSelectionsChanged(id: string, _selections: editorCommon.ISelection[]): void { throw ni(); }
	_acceptActiveEditorAndVisibleEditors(id: string, visibleIds: string[]): void { throw ni(); }
	_acceptEditorPositionData(data: ITextEditorPositionData): void { throw ni(); }
	_acceptTextEditorRemove(id: string): void { throw ni(); }
}

export abstract class ExtHostExtensionServiceShape {
	$localShowMessage(severity: Severity, msg: string): void { throw ni(); }
	$activateExtension(extensionDescription: IExtensionDescription): TPromise<void> { throw ni(); }
}

export interface FileSystemEvents {
	created: URI[];
	changed: URI[];
	deleted: URI[];
}
export abstract class ExtHostFileSystemEventServiceShape {
	_onFileEvent(events: FileSystemEvents) { throw ni(); }
}

export abstract class ExtHostLanguageFeaturesShape {
	$provideDocumentSymbols(handle: number, resource: URI): TPromise<modes.SymbolInformation[]> { throw ni(); }
	$provideCodeLenses(handle: number, resource: URI): TPromise<modes.ICodeLensSymbol[]> { throw ni(); }
	$resolveCodeLens(handle: number, resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICodeLensSymbol> { throw ni(); }
	$provideDefinition(handle: number, resource: URI, position: editorCommon.IPosition): TPromise<modes.Definition> { throw ni(); }
	$provideHover(handle: number, resource: URI, position: editorCommon.IPosition): TPromise<modes.Hover> { throw ni(); }
	$provideDocumentHighlights(handle: number, resource: URI, position: editorCommon.IPosition): TPromise<modes.DocumentHighlight[]> { throw ni(); }
	$provideReferences(handle: number, resource: URI, position: editorCommon.IPosition, context: modes.ReferenceContext): TPromise<modes.Location[]> { throw ni(); }
	$provideCodeActions(handle: number, resource: URI, range: editorCommon.IRange): TPromise<modes.CodeAction[]> { throw ni(); }
	$provideDocumentFormattingEdits(handle: number, resource: URI, options: modes.FormattingOptions): TPromise<editorCommon.ISingleEditOperation[]> { throw ni(); }
	$provideDocumentRangeFormattingEdits(handle: number, resource: URI, range: editorCommon.IRange, options: modes.FormattingOptions): TPromise<editorCommon.ISingleEditOperation[]> { throw ni(); }
	$provideOnTypeFormattingEdits(handle: number, resource: URI, position: editorCommon.IPosition, ch: string, options: modes.FormattingOptions): TPromise<editorCommon.ISingleEditOperation[]> { throw ni(); }
	$getNavigateToItems(handle: number, search: string): TPromise<ITypeBearing[]> { throw ni(); }
	$provideRenameEdits(handle: number, resource: URI, position: editorCommon.IPosition, newName: string): TPromise<modes.WorkspaceEdit> { throw ni(); }
	$provideCompletionItems(handle: number, resource: URI, position: editorCommon.IPosition): TPromise<modes.ISuggestResult[]> { throw ni(); }
	$resolveCompletionItem(handle: number, resource: URI, position: editorCommon.IPosition, suggestion: modes.ISuggestion): TPromise<modes.ISuggestion> { throw ni(); }
	$provideSignatureHelp(handle: number, resource: URI, position: editorCommon.IPosition): TPromise<modes.SignatureHelp> { throw ni(); }
}

export abstract class ExtHostQuickOpenShape {
	$onItemSelected(handle: number): void { throw ni(); }
	$validateInput(input: string): TPromise<string> { throw ni(); }
}

// --- proxy identifiers

export const MainContext = {
	MainThreadCommands: createMainId<MainThreadCommandsShape>('MainThreadCommands', MainThreadCommandsShape),
	MainThreadConfiguration: createMainId<MainThreadConfigurationShape>('MainThreadConfiguration', MainThreadConfigurationShape),
	MainThreadDiagnostics: createMainId<MainThreadDiagnosticsShape>('MainThreadDiagnostics', MainThreadDiagnosticsShape),
	MainThreadDocuments: createMainId<MainThreadDocumentsShape>('MainThreadDocuments', MainThreadDocumentsShape),
	MainThreadEditors: createMainId<MainThreadEditorsShape>('MainThreadEditors', MainThreadEditorsShape),
	MainThreadErrors: createMainId<MainThreadErrorsShape>('MainThreadErrors', MainThreadErrorsShape),
	MainThreadLanguageFeatures: createMainId<MainThreadLanguageFeaturesShape>('MainThreadLanguageFeatures', MainThreadLanguageFeaturesShape),
	MainThreadLanguages: createMainId<MainThreadLanguagesShape>('MainThreadLanguages', MainThreadLanguagesShape),
	MainThreadMessageService: createMainId<MainThreadMessageServiceShape>('MainThreadMessageService', MainThreadMessageServiceShape),
	MainThreadOutputService: createMainId<MainThreadOutputServiceShape>('MainThreadOutputService', MainThreadOutputServiceShape),
	MainThreadQuickOpen: createMainId<MainThreadQuickOpenShape>('MainThreadQuickOpen', MainThreadQuickOpenShape),
	MainThreadStatusBar: createMainId<MainThreadStatusBarShape>('MainThreadStatusBar', MainThreadStatusBarShape),
	MainThreadStorage: createMainId<MainThreadStorageShape>('MainThreadStorage', MainThreadStorageShape),
	MainThreadTelemetry: createMainId<MainThreadTelemetryShape>('MainThreadTelemetry', MainThreadTelemetryShape),
	MainThreadWorkspace: createMainId<MainThreadWorkspaceShape>('MainThreadWorkspace', MainThreadWorkspaceShape),
	MainProcessExtensionService: createMainId<MainProcessExtensionServiceShape>('MainProcessExtensionService', MainProcessExtensionServiceShape),
};

export const ExtHostContext = {
	ExtHostCommands: createExtId<ExtHostCommandsShape>('ExtHostCommands', ExtHostCommandsShape),
	ExtHostConfiguration: createExtId<ExtHostConfigurationShape>('ExtHostConfiguration', ExtHostConfigurationShape),
	ExtHostDiagnostics: createExtId<ExtHostDiagnosticsShape>('ExtHostDiagnostics', ExtHostDiagnosticsShape),
	ExtHostDocuments: createExtId<ExtHostDocumentsShape>('ExtHostDocuments', ExtHostDocumentsShape),
	ExtHostEditors: createExtId<ExtHostEditorsShape>('ExtHostEditors', ExtHostEditorsShape),
	ExtHostFileSystemEventService: createExtId<ExtHostFileSystemEventServiceShape>('ExtHostFileSystemEventService', ExtHostFileSystemEventServiceShape),
	ExtHostLanguageFeatures: createExtId<ExtHostLanguageFeaturesShape>('ExtHostLanguageFeatures', ExtHostLanguageFeaturesShape),
	ExtHostQuickOpen: createExtId<ExtHostQuickOpenShape>('ExtHostQuickOpen', ExtHostQuickOpenShape),
	ExtHostExtensionService: createExtId<ExtHostExtensionServiceShape>('ExtHostExtensionService', ExtHostExtensionServiceShape),
};
