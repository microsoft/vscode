/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {toErrorMessage, onUnexpectedError} from 'vs/base/common/errors';
import {IEmitterEvent} from 'vs/base/common/eventEmitter';
import {IModelService} from 'vs/editor/common/services/modelService';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import {IPrefixSumIndexOfResult} from 'vs/editor/common/viewModel/prefixSumComputer';
import {MirrorModel2} from 'vs/editor/common/model/mirrorModel2';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import Event, {Emitter} from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {Range, Position, Disposable} from 'vs/workbench/api/node/extHostTypes';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {EventType as FileEventType, LocalFileChangeEvent, ITextFileService} from 'vs/workbench/parts/files/common/files';
import * as TypeConverters from './extHostTypeConverters';
import {TPromise} from 'vs/base/common/winjs.base';
import * as vscode from 'vscode';
import {WordHelper} from 'vs/editor/common/model/textModelWithTokensHelpers';
import {IFileService} from 'vs/platform/files/common/files';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {ResourceEditorInput} from 'vs/workbench/common/editor/resourceEditorInput';
import {asWinJsPromise} from 'vs/base/common/async';
import * as weak from 'weak';

export interface IModelAddedData {
	url: URI;
	versionId: number;
	value: EditorCommon.IRawText;
	modeId: string;
	isDirty: boolean;
}

const _modeId2WordDefinition: {
	[modeId: string]: RegExp;
} = Object.create(null);

export function setWordDefinitionFor(modeId: string, wordDefinition: RegExp): void {
	_modeId2WordDefinition[modeId] = wordDefinition;
}

export function getWordDefinitionFor(modeId: string): RegExp {
	return _modeId2WordDefinition[modeId];
}

@Remotable.ExtHostContext('ExtHostModelService')
export class ExtHostModelService {

	private static _handlePool: number = 0;

	private _onDidAddDocumentEventEmitter: Emitter<vscode.TextDocument>;
	public onDidAddDocument: Event<vscode.TextDocument>;

	private _onDidRemoveDocumentEventEmitter: Emitter<vscode.TextDocument>;
	public onDidRemoveDocument: Event<vscode.TextDocument>;

	private _onDidChangeDocumentEventEmitter: Emitter<vscode.TextDocumentChangeEvent>;
	public onDidChangeDocument: Event<vscode.TextDocumentChangeEvent>;

	private _onDidSaveDocumentEventEmitter: Emitter<vscode.TextDocument>;
	public onDidSaveDocument: Event<vscode.TextDocument>;

	private _documentData: { [modelUri: string]: ExtHostDocumentData; };
	private _documentLoader: { [modelUri: string]: TPromise<ExtHostDocumentData> };
	private _documentContentProviders: { [handle: number]: vscode.TextDocumentContentProvider; };

	private _proxy: MainThreadDocuments;

	constructor(@IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadDocuments);

		this._onDidAddDocumentEventEmitter = new Emitter<vscode.TextDocument>();
		this.onDidAddDocument = this._onDidAddDocumentEventEmitter.event;

		this._onDidRemoveDocumentEventEmitter = new Emitter<vscode.TextDocument>();
		this.onDidRemoveDocument = this._onDidRemoveDocumentEventEmitter.event;

		this._onDidChangeDocumentEventEmitter = new Emitter<vscode.TextDocumentChangeEvent>();
		this.onDidChangeDocument = this._onDidChangeDocumentEventEmitter.event;

		this._onDidSaveDocumentEventEmitter = new Emitter<vscode.TextDocument>();
		this.onDidSaveDocument = this._onDidSaveDocumentEventEmitter.event;

		this._documentData = Object.create(null);
		this._documentLoader = Object.create(null);
		this._documentContentProviders = Object.create(null);
	}

	public getAllDocumentData(): ExtHostDocumentData[] {
		const result: ExtHostDocumentData[] = [];
		for (let key in this._documentData) {
			result.push(this._documentData[key]);
		}
		return result;
	}

	public getDocumentData(resource: vscode.Uri): ExtHostDocumentData {
		if (!resource) {
			return;
		}
		const data = this._documentData[resource.toString()];
		if (data) {
			return data;
		}
	}

	public ensureDocumentData(uri: URI): TPromise<ExtHostDocumentData> {

		let cached = this._documentData[uri.toString()];
		if (cached) {
			return TPromise.as(cached);
		}

		let promise = this._documentLoader[uri.toString()];
		if (!promise) {
			promise = this._proxy._tryOpenDocument(uri).then(() => {
				delete this._documentLoader[uri.toString()];
				return this._documentData[uri.toString()];
			}, err => {
				delete this._documentLoader[uri.toString()];
				return TPromise.wrapError(err);
			});
			this._documentLoader[uri.toString()] = promise;
		}

		return promise;
	}

	public registerTextDocumentContentProvider(scheme: string, provider: vscode.TextDocumentContentProvider): vscode.Disposable {
		if (scheme === 'file' || scheme === 'untitled') {
			throw new Error(`scheme '${scheme}' already registered`);
		}

		const handle = ExtHostModelService._handlePool++;

		this._documentContentProviders[handle] = provider;
		this._proxy.$registerTextContentProvider(handle, scheme);

		let subscription: IDisposable;
		if (typeof provider.onDidChange === 'function') {
			subscription = provider.onDidChange(uri => {
				if (this._documentData[uri.toString()]) {
					this.$provideTextDocumentContent(handle, <URI>uri).then(value => {
						return this._proxy.$onVirtualDocumentChange(<URI>uri, value);
					}, onUnexpectedError);
				}
			});
		}
		return new Disposable(() => {
			if (delete this._documentContentProviders[handle]) {
				this._proxy.$unregisterTextContentProvider(handle);
			}
			if (subscription) {
				subscription.dispose();
				subscription = undefined;
			}
		});
	}

	$provideTextDocumentContent(handle: number, uri: URI): TPromise<string> {
		const provider = this._documentContentProviders[handle];
		if (!provider) {
			return TPromise.wrapError<string>(`unsupported uri-scheme: ${uri.scheme}`);
		}
		return asWinJsPromise(token => provider.provideTextDocumentContent(uri, token));
	}

	$isDocumentReferenced(uri: URI): TPromise<boolean> {
		const key = uri.toString();
		const document = this._documentData[key];
		if (document) {
			return TPromise.as(document.isDocumentReferenced);
		}
	}

	public _acceptModelAdd(initData: IModelAddedData): void {
		let data = new ExtHostDocumentData(this._proxy, initData.url, initData.value.lines, initData.value.EOL, initData.modeId, initData.versionId, initData.isDirty);
		let key = data.document.uri.toString();
		if (this._documentData[key]) {
			throw new Error('Document `' + key + '` already exists.');
		}
		this._documentData[key] = data;
		this._onDidAddDocumentEventEmitter.fire(data.document);
	}

	public _acceptModelModeChanged(strURL: string, oldModeId: string, newModeId: string): void {
		let data = this._documentData[strURL];

		// Treat a mode change as a remove + add

		this._onDidRemoveDocumentEventEmitter.fire(data.document);
		data._acceptLanguageId(newModeId);
		this._onDidAddDocumentEventEmitter.fire(data.document);
	}

	public _acceptModelSaved(strURL: string): void {
		let data = this._documentData[strURL];
		data._acceptIsDirty(false);
		this._onDidSaveDocumentEventEmitter.fire(data.document);
	}

	public _acceptModelDirty(strURL: string): void {
		let document = this._documentData[strURL];
		document._acceptIsDirty(true);
	}

	public _acceptModelReverted(strURL: string): void {
		let document = this._documentData[strURL];
		document._acceptIsDirty(false);
	}

	public _acceptModelRemoved(strURL: string): void {
		if (!this._documentData[strURL]) {
			throw new Error('Document `' + strURL + '` does not exist.');
		}
		let data = this._documentData[strURL];
		delete this._documentData[strURL];
		this._onDidRemoveDocumentEventEmitter.fire(data.document);
		data.dispose();
	}

	public _acceptModelChanged(strURL: string, events: EditorCommon.IModelContentChangedEvent2[]): void {
		let data = this._documentData[strURL];
		data.onEvents(events);
		this._onDidChangeDocumentEventEmitter.fire({
			document: data.document,
			contentChanges: events.map((e) => {
				return {
					range: TypeConverters.toRange(e.range),
					rangeLength: e.rangeLength,
					text: e.text
				};
			})
		});
	}
}

export class ExtHostDocumentData extends MirrorModel2 {

	private _proxy: MainThreadDocuments;
	private _languageId: string;
	private _isDirty: boolean;
	private _textLines: vscode.TextLine[];
	private _documentRef: weak.WeakRef & vscode.TextDocument;

	constructor(proxy: MainThreadDocuments, uri: URI, lines: string[], eol: string,
		languageId: string, versionId: number, isDirty: boolean) {

		super(uri, lines, eol, versionId);
		this._proxy = proxy;
		this._languageId = languageId;
		this._isDirty = isDirty;
		this._textLines = [];
	}

	dispose(): void {
		this._textLines.length = 0;
		this._isDirty = false;
		super.dispose();
	}

	get document(): vscode.TextDocument {
		// dereferences or creates the actual document for this
		// document data. keeps a weak reference only such that
		// we later when a document isn't needed anymore

		if (!this.isDocumentReferenced) {
			const data = this;
			const doc = {
				get uri() { return data._uri; },
				get fileName() { return data._uri.fsPath; },
				get isUntitled() { return data._uri.scheme !== 'file'; },
				get languageId() { return data._languageId; },
				get version() { return data._versionId; },
				get isDirty() { return data._isDirty; },
				save() { return data._proxy._trySaveDocument(data._uri); },
				getText(range?) { return range ? data._getTextInRange(range) : data.getText(); },
				get lineCount() { return data._lines.length; },
				lineAt(lineOrPos) { return data.lineAt(lineOrPos); },
				offsetAt(pos) { return data.offsetAt(pos); },
				positionAt(offset) { return data.positionAt(offset); },
				validateRange(ran) { return data.validateRange(ran); },
				validatePosition(pos) { return data.validatePosition(pos); },
				getWordRangeAtPosition(pos) { return data.getWordRangeAtPosition(pos); }
			};
			this._documentRef = weak(doc);
		}
		return weak.get(this._documentRef);
	}

	get isDocumentReferenced(): boolean {
		return this._documentRef && !weak.isDead(this._documentRef);
	}

	_acceptLanguageId(newLanguageId: string): void {
		this._languageId = newLanguageId;
	}

	_acceptIsDirty(isDirty: boolean): void {
		this._isDirty = isDirty;
	}

	private _getTextInRange(_range: vscode.Range): string {
		let range = this.validateRange(_range);

		if (range.isEmpty) {
			return '';
		}

		if (range.isSingleLine) {
			return this._lines[range.start.line].substring(range.start.character, range.end.character);
		}

		let lineEnding = this._eol,
			startLineIndex = range.start.line,
			endLineIndex = range.end.line,
			resultLines: string[] = [];

		resultLines.push(this._lines[startLineIndex].substring(range.start.character));
		for (var i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i]);
		}
		resultLines.push(this._lines[endLineIndex].substring(0, range.end.character));

		return resultLines.join(lineEnding);
	}

	lineAt(lineOrPosition: number | vscode.Position): vscode.TextLine {

		let line: number;
		if (lineOrPosition instanceof Position) {
			line = lineOrPosition.line;
		} else if (typeof lineOrPosition === 'number') {
			line = lineOrPosition;
		}

		if (line < 0 || line >= this._lines.length) {
			throw new Error('Illegal value ' + line + ' for `line`');
		}

		let result = this._textLines[line];
		if (!result || result.lineNumber !== line || result.text !== this._lines[line]) {

			const text = this._lines[line];
			const firstNonWhitespaceCharacterIndex = /^(\s*)/.exec(text)[1].length;
			const range = new Range(line, 0, line, text.length);
			const rangeIncludingLineBreak = new Range(line, 0, line + 1, 0);

			result = Object.freeze({
				lineNumber: line,
				range,
				rangeIncludingLineBreak,
				text,
				firstNonWhitespaceCharacterIndex,
				isEmptyOrWhitespace: firstNonWhitespaceCharacterIndex === text.length
			});

			this._textLines[line] = result;
		}

		return result;
	}

	offsetAt(position: vscode.Position): number {
		position = this.validatePosition(position);
		this._ensureLineStarts();
		return this._lineStarts.getAccumulatedValue(position.line - 1) + position.character;
	}

	positionAt(offset: number): vscode.Position {
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		this._ensureLineStarts();
		let out: IPrefixSumIndexOfResult = { index: 0, remainder: 0 };
		this._lineStarts.getIndexOf(offset, out);

		let lineLength = this._lines[out.index].length;

		// Ensure we return a valid position
		return new Position(out.index, Math.min(out.remainder, lineLength));
	}

	// ---- range math

	validateRange(range: vscode.Range): vscode.Range {
		if (!(range instanceof Range)) {
			throw new Error('Invalid argument');
		}

		let start = this.validatePosition(range.start);
		let end = this.validatePosition(range.end);

		if (start === range.start && end === range.end) {
			return range;
		}
		return new Range(start.line, start.character, end.line, end.character);
	}

	validatePosition(position: vscode.Position): vscode.Position {
		if (!(position instanceof Position)) {
			throw new Error('Invalid argument');
		}

		let {line, character} = position;
		let hasChanged = false;

		if (line < 0) {
			line = 0;
			hasChanged = true;
		}

		if (line >= this._lines.length) {
			line = this._lines.length - 1;
			hasChanged = true;
		}

		if (character < 0) {
			character = 0;
			hasChanged = true;
		}

		let maxCharacter = this._lines[line].length;
		if (character > maxCharacter) {
			character = maxCharacter;
			hasChanged = true;
		}

		if (!hasChanged) {
			return position;
		}
		return new Position(line, character);
	}

	getWordRangeAtPosition(_position: vscode.Position): vscode.Range {
		let position = this.validatePosition(_position);

		let wordAtText = WordHelper._getWordAtText(
			position.character + 1,
			WordHelper.ensureValidWordDefinition(getWordDefinitionFor(this._languageId)),
			this._lines[position.line],
			0
		);

		if (wordAtText) {
			return new Range(position.line, wordAtText.startColumn - 1, position.line, wordAtText.endColumn - 1);
		}
	}
}

@Remotable.MainContext('MainThreadDocuments')
export class MainThreadDocuments {
	private _modelService: IModelService;
	private _modeService: IModeService;
	private _textFileService: ITextFileService;
	private _editorService: IWorkbenchEditorService;
	private _fileService: IFileService;
	private _untitledEditorService: IUntitledEditorService;
	private _toDispose: IDisposable[];
	private _modelToDisposeMap: { [modelUrl: string]: IDisposable; };
	private _proxy: ExtHostModelService;
	private _modelIsSynced: { [modelId: string]: boolean; };
	private _resourceContentProvider: { [handle: number]: IDisposable };
	private _virtualDocumentSet: { [resource: string]: boolean };

	constructor(
		@IThreadService threadService: IThreadService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@IEventService eventService: IEventService,
		@ITextFileService textFileService: ITextFileService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService
	) {
		this._modelService = modelService;
		this._modeService = modeService;
		this._textFileService = textFileService;
		this._editorService = editorService;
		this._fileService = fileService;
		this._untitledEditorService = untitledEditorService;
		this._proxy = threadService.getRemotable(ExtHostModelService);
		this._modelIsSynced = {};

		this._toDispose = [];
		modelService.onModelAdded(this._onModelAdded, this, this._toDispose);
		modelService.onModelRemoved(this._onModelRemoved, this, this._toDispose);
		modelService.onModelModeChanged(this._onModelModeChanged, this, this._toDispose);

		this._toDispose.push(eventService.addListener2(FileEventType.FILE_SAVED, (e: LocalFileChangeEvent) => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy._acceptModelSaved(e.getAfter().resource.toString());
			}
		}));
		this._toDispose.push(eventService.addListener2(FileEventType.FILE_REVERTED, (e: LocalFileChangeEvent) => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy._acceptModelReverted(e.getAfter().resource.toString());
			}
		}));
		this._toDispose.push(eventService.addListener2(FileEventType.FILE_DIRTY, (e: LocalFileChangeEvent) => {
			if (this._shouldHandleFileEvent(e)) {
				this._proxy._acceptModelDirty(e.getAfter().resource.toString());
			}
		}));

		const handle = setInterval(() => this._runDocumentCleanup(), 30 * 1000);
		this._toDispose.push({ dispose() { clearInterval(handle); } });

		this._modelToDisposeMap = Object.create(null);
		this._resourceContentProvider = Object.create(null);
		this._virtualDocumentSet = Object.create(null);
	}

	public dispose(): void {
		Object.keys(this._modelToDisposeMap).forEach((modelUrl) => {
			this._modelToDisposeMap[modelUrl].dispose();
		});
		this._modelToDisposeMap = Object.create(null);
		this._toDispose = disposeAll(this._toDispose);
	}

	private _shouldHandleFileEvent(e: LocalFileChangeEvent): boolean {
		const after = e.getAfter();
		const model = this._modelService.getModel(after.resource);
		return model && !model.isTooLargeForHavingARichMode();
	}

	private _onModelAdded(model: EditorCommon.IModel): void {
		// Same filter as in mainThreadEditors
		if (model.isTooLargeForHavingARichMode()) {
			// don't synchronize too large models
			return null;
		}
		let modelUrl = model.getAssociatedResource();
		this._modelIsSynced[modelUrl.toString()] = true;
		this._modelToDisposeMap[modelUrl.toString()] = model.addBulkListener2((events) => this._onModelEvents(modelUrl, events));
		this._proxy._acceptModelAdd({
			url: model.getAssociatedResource(),
			versionId: model.getVersionId(),
			value: model.toRawText(),
			modeId: model.getMode().getId(),
			isDirty: this._textFileService.isDirty(modelUrl)
		});
	}

	private _onModelModeChanged(event: { model: EditorCommon.IModel; oldModeId: string; }): void {
		let {model, oldModeId} = event;
		let modelUrl = model.getAssociatedResource();
		if (!this._modelIsSynced[modelUrl.toString()]) {
			return;
		}
		this._proxy._acceptModelModeChanged(model.getAssociatedResource().toString(), oldModeId, model.getMode().getId());
	}

	private _onModelRemoved(model: EditorCommon.IModel): void {
		let modelUrl = model.getAssociatedResource();
		if (!this._modelIsSynced[modelUrl.toString()]) {
			return;
		}
		delete this._modelIsSynced[modelUrl.toString()];
		this._modelToDisposeMap[modelUrl.toString()].dispose();
		delete this._modelToDisposeMap[modelUrl.toString()];
		this._proxy._acceptModelRemoved(modelUrl.toString());
	}

	private _onModelEvents(modelUrl: URI, events: IEmitterEvent[]): void {
		let changedEvents: EditorCommon.IModelContentChangedEvent2[] = [];
		for (let i = 0, len = events.length; i < len; i++) {
			let e = events[i];
			switch (e.getType()) {
				case EditorCommon.EventType.ModelContentChanged2:
					changedEvents.push(<EditorCommon.IModelContentChangedEvent2>e.getData());
					break;
			}
		}
		if (changedEvents.length > 0) {
			this._proxy._acceptModelChanged(modelUrl.toString(), changedEvents);
		}
	}

	// --- from extension host process

	_trySaveDocument(uri: URI): TPromise<boolean> {
		return this._textFileService.save(uri);
	}

	_tryOpenDocument(uri: URI): TPromise<any> {

		if (!uri.scheme || !(uri.fsPath || uri.authority)) {
			return TPromise.wrapError(`Invalid uri. Scheme and authority or path must be set.`);
		}

		let promise: TPromise<boolean>;
		switch (uri.scheme) {
			case 'untitled':
				promise = this._handleUnititledScheme(uri);
				break;
			case 'file':
			default:
				promise = this._handleAsResourceInput(uri);
				break;
		}

		return promise.then(success => {
			if (!success) {
				return TPromise.wrapError('cannot open ' + uri.toString());
			}
		}, err => {
			return TPromise.wrapError('cannot open ' + uri.toString() + '. Detail: ' + toErrorMessage(err));
		});
	}

	private _handleAsResourceInput(uri: URI): TPromise<boolean> {
		return this._editorService.resolveEditorModel({ resource: uri }).then(model => {
			return !!model;
		});
	}

	private _handleUnititledScheme(uri: URI): TPromise<boolean> {
		let asFileUri = URI.file(uri.fsPath);
		return this._fileService.resolveFile(asFileUri).then(stats => {
			// don't create a new file ontop of an existing file
			return TPromise.wrapError<boolean>('file already exists on disk');
		}, err => {
			let input = this._untitledEditorService.createOrGet(asFileUri); // using file-uri makes it show in 'Working Files' section
			return input.resolve(true).then(model => {
				if (input.getResource().toString() !== uri.toString()) {
					throw new Error(`expected URI ${uri.toString() } BUT GOT ${input.getResource().toString() }`);
				}
				return this._proxy._acceptModelDirty(uri.toString()); // mark as dirty
			}).then(() => {
				return true;
			});
		});
	}

	// --- virtual document logic

	$registerTextContentProvider(handle:number, scheme: string): void {
		this._resourceContentProvider[handle] = ResourceEditorInput.registerResourceContentProvider(scheme, {
			provideTextContent: (uri: URI): TPromise<EditorCommon.IModel> => {
				return this._proxy.$provideTextDocumentContent(handle, uri).then(value => {
					if (value) {
						this._virtualDocumentSet[uri.toString()] = true;
						const firstLineText = value.substr(0, 1 + value.search(/\r?\n/));
						const mode = this._modeService.getOrCreateModeByFilenameOrFirstLine(uri.fsPath, firstLineText);
						return this._modelService.createModel(value, mode, uri);
					}
				});
			}
		});
	}

	$unregisterTextContentProvider(handle: number): void {
		const registration = this._resourceContentProvider[handle];
		if (registration) {
			registration.dispose();
			delete this._resourceContentProvider[handle];
		}
	}

	$onVirtualDocumentChange(uri: URI, value: string): void {
		const model = this._modelService.getModel(uri);
		if (model) {
			model.setValue(value);
		}
	}

	private _runDocumentCleanup(): void {

		const toBeDisposed: URI[] = [];

		TPromise.join(Object.keys(this._virtualDocumentSet).map(key => {
			let resource = URI.parse(key);
			return this._proxy.$isDocumentReferenced(resource).then(referenced => {
				if (!referenced) {
					return this._editorService.inputToType({ resource }).then(input => {
						if (!this._editorService.isVisible(input, true)) {
							toBeDisposed.push(resource);
						}
					});
				}
			});
		})).then(() => {
			for (let resource of toBeDisposed) {
				this._modelService.destroyModel(resource);
				delete this._virtualDocumentSet[resource.toString()];
			}
		}, onUnexpectedError);
	}
}
