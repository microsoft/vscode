/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {toErrorMessage} from 'vs/base/common/errors';
import {IEmitterEvent} from 'vs/base/common/eventEmitter';
import {IModelService} from 'vs/editor/common/services/modelService';
import {PrefixSumComputer, IPrefixSumIndexOfResult} from 'vs/editor/common/viewModel/prefixSumComputer';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import Event, {Emitter} from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {Range, Position} from 'vs/workbench/api/common/extHostTypes';
import {IEventService} from 'vs/platform/event/common/event';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {EventType as FileEventType, LocalFileChangeEvent, ITextFileService} from 'vs/workbench/parts/files/common/files';
import * as TypeConverters from './extHostTypeConverters';
import {TPromise} from 'vs/base/common/winjs.base';
import * as vscode from 'vscode';
import {WordHelper} from 'vs/editor/common/model/textModelWithTokensHelpers';
import {IFileService} from 'vs/platform/files/common/files';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/browser/untitledEditorService';

export interface IModelAddedData {
	url: URI;
	versionId: number;
	value: EditorCommon.IRawText;
	modeId: string;
	isDirty: boolean;
}

const _modeId2WordDefinition: {
	[modeId:string]: RegExp;
} = Object.create(null);

export function setWordDefinitionFor(modeId:string, wordDefinition:RegExp): void {
	_modeId2WordDefinition[modeId] = wordDefinition;
}

export function getWordDefinitionFor(modeId:string):RegExp {
	return _modeId2WordDefinition[modeId];
}

@Remotable.PluginHostContext('ExtHostModelService')
export class ExtHostModelService {

	private _onDidAddDocumentEventEmitter: Emitter<BaseTextDocument>;
	public onDidAddDocument: Event<BaseTextDocument>;

	private _onDidRemoveDocumentEventEmitter: Emitter<BaseTextDocument>;
	public onDidRemoveDocument: Event<BaseTextDocument>;

	private _onDidChangeDocumentEventEmitter: Emitter<vscode.TextDocumentChangeEvent>;
	public onDidChangeDocument: Event<vscode.TextDocumentChangeEvent>;

	private _onDidSaveDocumentEventEmitter: Emitter<BaseTextDocument>;
	public onDidSaveDocument: Event<BaseTextDocument>;

	private _documents: {[modelUri:string]:ExtHostDocument;};

	private _proxy: MainThreadDocuments;

	constructor(@IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadDocuments);

		this._onDidAddDocumentEventEmitter = new Emitter<BaseTextDocument>();
		this.onDidAddDocument = this._onDidAddDocumentEventEmitter.event;

		this._onDidRemoveDocumentEventEmitter = new Emitter<BaseTextDocument>();
		this.onDidRemoveDocument = this._onDidRemoveDocumentEventEmitter.event;

		this._onDidChangeDocumentEventEmitter = new Emitter<vscode.TextDocumentChangeEvent>();
		this.onDidChangeDocument = this._onDidChangeDocumentEventEmitter.event;

		this._onDidSaveDocumentEventEmitter = new Emitter<BaseTextDocument>();
		this.onDidSaveDocument = this._onDidSaveDocumentEventEmitter.event;

		this._documents = Object.create(null);
	}

	public getDocuments(): BaseTextDocument[] {
		let r: BaseTextDocument[] = [];
		for (let key in this._documents) {
			r.push(this._documents[key]);
		}
		return r;
	}

	public getDocument(resource: vscode.Uri): BaseTextDocument {
		if (!resource) {
			return null;
		}
		return this._documents[resource.toString()] || null;
	}

	public openDocument(uriOrFileName: vscode.Uri | string): TPromise<vscode.TextDocument> {

		let uri: URI;
		if (typeof uriOrFileName === 'string') {
			uri = URI.file(uriOrFileName);
		} else if (uriOrFileName instanceof URI) {
			uri = <URI>uriOrFileName;
		} else {
			throw new Error('illegal argument - uriOrFileName');
		}

		let cached = this._documents[uri.toString()];
		if (cached) {
			return TPromise.as(cached);
		}
		return this._proxy._tryOpenDocument(uri).then(() => {
			return this._documents[uri.toString()];
		});
	}

	public _acceptModelAdd(data:IModelAddedData): void {
		let document = new ExtHostDocument(this._proxy, data.url, data.value.lines, data.value.EOL, data.modeId, data.versionId, data.isDirty);
		let key = document.uri.toString();
		if (this._documents[key]) {
			throw new Error('Document `' + key + '` already exists.');
		}
		this._documents[key] = document;
		this._onDidAddDocumentEventEmitter.fire(document);
	}

	public _acceptModelModeChanged(url: URI, oldModeId:string, newModeId:string): void {
		let document = this._documents[url.toString()];

		// Treat a mode change as a remove + add

		this._onDidRemoveDocumentEventEmitter.fire(document);
		document._acceptLanguageId(newModeId);
		this._onDidAddDocumentEventEmitter.fire(document);
	}

	public _acceptModelSaved(url: URI): void {
		let document = this._documents[url.toString()];
		document._acceptIsDirty(false);
		this._onDidSaveDocumentEventEmitter.fire(document);
	}

	public _acceptModelDirty(url: URI): void {
		let document = this._documents[url.toString()];
		document._acceptIsDirty(true);
	}

	public _acceptModelReverted(url: URI): void {
		let document = this._documents[url.toString()];
		document._acceptIsDirty(false);
	}

	public _acceptModelRemoved(url: URI): void {
		let key = url.toString();
		if (!this._documents[key]) {
			throw new Error('Document `' + key + '` does not exist.');
		}
		let document = this._documents[key];
		delete this._documents[key];
		this._onDidRemoveDocumentEventEmitter.fire(document);
		document.dispose();
	}

	public _acceptModelChanged(url: URI, events: EditorCommon.IModelContentChangedEvent2[]): void {
		let document = this._documents[url.toString()];
		document._acceptEvents(events);
		this._onDidChangeDocumentEventEmitter.fire({
			document: document,
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

export class BaseTextDocument implements vscode.TextDocument {
	protected _uri: URI;
	protected _lines: string[];
	protected _eol: string;
	protected _languageId: string;
	protected _versionId: number;
	protected _isDirty: boolean;
	protected _textLines: vscode.TextLine[];
	protected _lineStarts: PrefixSumComputer;

	constructor(uri: URI, lines: string[], eol: string, languageId: string, versionId: number, isDirty:boolean) {
		this._uri = uri;
		this._lines = lines;
		this._textLines = [];
		this._eol = eol;
		this._languageId = languageId;
		this._versionId = versionId;
		this._isDirty = isDirty;
	}

	dispose(): void {
		this._lines.length = 0;
		this._textLines.length = 0;
		this._isDirty = false;
	}

	get uri(): URI {
		return this._uri;
	}

	get fileName(): string {
		return this._uri.fsPath;
	}

	get isUntitled(): boolean {
		return this._uri.scheme !== 'file';
	}

	get languageId(): string {
		return this._languageId;
	}

	get version(): number {
		return this._versionId;
	}

	get isDirty(): boolean {
		return this._isDirty;
	}

	save(): Thenable<boolean> {
		return Promise.reject<boolean>('Not implemented');
	}

	getText(range?: Range): string {
		if (range) {
			return this._getTextInRange(range);
		} else {
			return this._lines.join(this._eol);
		}
	}

	private _getTextInRange(_range: Range): string {
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

	get lineCount(): number {
		return this._lines.length;
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

	offsetAt(position: Position): number {
		position = this.validatePosition(position);
		this._ensureLineStarts();
		return this._lineStarts.getAccumulatedValue(position.line - 1) + position.character;
	}

	positionAt(offset: number): Position {
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		this._ensureLineStarts();
		let out: IPrefixSumIndexOfResult = { index: 0, remainder: 0 };
		this._lineStarts.getIndexOf(offset, out);

		let lineLength = this._lines[out.index].length;

		// Ensure we return a valid position
		return new Position(out.index, Math.min(out.remainder, lineLength));
	}

	private _ensureLineStarts(): void {
		if (!this._lineStarts) {
			const lineStartValues:number[] = [];
			const eolLength = this._eol.length;
			for (let i = 0, len = this._lines.length; i < len; i++) {
				lineStartValues.push(this._lines[i].length + eolLength);
			}
			this._lineStarts = new PrefixSumComputer(lineStartValues);
		}
	}

	// ---- range math

	validateRange(range:Range): Range {
		if (!(range instanceof Range)) {
			throw new Error('Invalid argument');
		}

		let start = this.validatePosition(range.start);
		let end = this.validatePosition(range.end);

		if (start === range.start && end === range.end) {
			return range;
		}
		return new Range(start, end);
	}

	validatePosition(position:Position): Position {
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

	getWordRangeAtPosition(_position:Position): Range {
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

export class ExtHostDocument extends BaseTextDocument {

	private _proxy: MainThreadDocuments;

	constructor(proxy: MainThreadDocuments, uri: URI, lines: string[],
		eol: string, languageId: string, versionId: number, isDirty:boolean) {
		super(uri, lines, eol, languageId, versionId, isDirty);
		this._proxy = proxy;
	}

	save(): Thenable<boolean> {
		return this._proxy._trySaveDocument(this._uri);
	}

	_acceptLanguageId(newLanguageId:string): void {
		this._languageId = newLanguageId;
	}

	_acceptIsDirty(isDirty:boolean): void {
		this._isDirty = isDirty;
	}

	_acceptEvents(events: EditorCommon.IModelContentChangedEvent2[]): void {
		// Update my lines
		let lastVersionId = -1;
		for (let i = 0, len = events.length; i < len; i++) {
			let e = events[i];

			this._acceptDeleteRange(e.range);
			this._acceptInsertText({
				lineNumber: e.range.startLineNumber,
				column: e.range.startColumn
			}, e.text);
			lastVersionId = Math.max(lastVersionId, e.versionId);
		}
		if (lastVersionId !== -1) {
			this._versionId = lastVersionId;
		}
	}

	/**
	 * All changes to a line's text go through this method
	 */
	private _setLineText(lineIndex:number, newValue:string): void {
		this._lines[lineIndex] = newValue;
		if (this._lineStarts) {
			// update prefix sum
			this._lineStarts.changeValue(lineIndex, this._lines[lineIndex].length + this._eol.length);
		}
	}

	private _acceptDeleteRange(range: EditorCommon.IRange): void {

		if (range.startLineNumber === range.endLineNumber) {
			if (range.startColumn === range.endColumn) {
				// Nothing to delete
				return;
			}
			// Delete text on the affected line
			this._setLineText(range.startLineNumber - 1,
				this._lines[range.startLineNumber - 1].substring(0, range.startColumn - 1)
				+ this._lines[range.startLineNumber - 1].substring(range.endColumn - 1)
			);
			return;
		}

		// Take remaining text on last line and append it to remaining text on first line
		this._setLineText(range.startLineNumber - 1,
			this._lines[range.startLineNumber - 1].substring(0, range.startColumn - 1)
			+ this._lines[range.endLineNumber - 1].substring(range.endColumn - 1)
		);

		// Delete middle lines
		this._lines.splice(range.startLineNumber, range.endLineNumber - range.startLineNumber);
		if (this._lineStarts) {
			// update prefix sum
			this._lineStarts.removeValues(range.startLineNumber, range.endLineNumber - range.startLineNumber);
		}
	}

	private _acceptInsertText(position: EditorCommon.IPosition, insertText:string): void {
		if (insertText.length === 0) {
			// Nothing to insert
			return;
		}
		let insertLines = insertText.split(/\r\n|\r|\n/);
		if (insertLines.length === 1) {
			// Inserting text on one line
			this._setLineText(position.lineNumber - 1,
				this._lines[position.lineNumber - 1].substring(0, position.column - 1)
				+ insertLines[0]
				+ this._lines[position.lineNumber - 1].substring(position.column - 1)
			);
			return;
		}

		// Append overflowing text from first line to the end of text to insert
		insertLines[insertLines.length - 1] += this._lines[position.lineNumber - 1].substring(position.column - 1);

		// Delete overflowing text from first line and insert text on first line
		this._setLineText(position.lineNumber - 1,
			this._lines[position.lineNumber - 1].substring(0, position.column - 1)
			+ insertLines[0]
		);

		// Insert new lines & store lengths
		let newLengths:number[] = new Array<number>(insertLines.length - 1);
		for (let i = 1; i < insertLines.length; i++) {
			this._lines.splice(position.lineNumber + i - 1, 0, insertLines[i]);
			newLengths[i - 1] = insertLines[i].length + this._eol.length;
		}

		if (this._lineStarts) {
			// update prefix sum
			this._lineStarts.insertValues(position.lineNumber, newLengths);
		}
	}
}

@Remotable.MainContext('MainThreadDocuments')
export class MainThreadDocuments {
	private _textFileService: ITextFileService;
	private _editorService: IEditorService;
	private _fileService: IFileService;
	private _untitledEditorService: IUntitledEditorService;
	private _toDispose: IDisposable[];
	private _modelToDisposeMap: {[modelUrl:string]:IDisposable;};
	private _proxy: ExtHostModelService;
	private _modelIsSynced: {[modelId:string]:boolean;};

	constructor(
		@IThreadService threadService: IThreadService,
		@IModelService modelService:IModelService,
		@IEventService eventService:IEventService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorService editorService: IEditorService,
		@IFileService fileService: IFileService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService
	) {
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
			this._proxy._acceptModelSaved(e.getAfter().resource);
		}));
		this._toDispose.push(eventService.addListener2(FileEventType.FILE_REVERTED, (e: LocalFileChangeEvent) => {
			this._proxy._acceptModelReverted(e.getAfter().resource);
		}));
		this._toDispose.push(eventService.addListener2(FileEventType.FILE_DIRTY, (e: LocalFileChangeEvent) => {
			this._proxy._acceptModelDirty(e.getAfter().resource);
		}));

		this._modelToDisposeMap = Object.create(null);
	}

	public dispose(): void {
		Object.keys(this._modelToDisposeMap).forEach((modelUrl) => {
			this._modelToDisposeMap[modelUrl].dispose();
		});
		this._modelToDisposeMap = Object.create(null);
		this._toDispose = disposeAll(this._toDispose);
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

	private _onModelModeChanged(event: { model: EditorCommon.IModel; oldModeId: string;}): void {
		let {model, oldModeId} = event;
		let modelUrl = model.getAssociatedResource();
		if (!this._modelIsSynced[modelUrl.toString()]) {
			return;
		}
		this._proxy._acceptModelModeChanged(model.getAssociatedResource(), oldModeId, model.getMode().getId());
	}

	private _onModelRemoved(model: EditorCommon.IModel): void {
		let modelUrl = model.getAssociatedResource();
		if (!this._modelIsSynced[modelUrl.toString()]) {
			return;
		}
		delete this._modelIsSynced[modelUrl.toString()];
		this._modelToDisposeMap[modelUrl.toString()].dispose();
		delete this._modelToDisposeMap[modelUrl.toString()];
		this._proxy._acceptModelRemoved(modelUrl);
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
			this._proxy._acceptModelChanged(modelUrl, changedEvents);
		}
	}

	// --- from plugin host process

	_trySaveDocument(uri: URI): TPromise<boolean> {
		return this._textFileService.save(uri);
	}

	_tryOpenDocument(uri: URI): TPromise<any> {

		if (!uri.scheme || !uri.fsPath) {
			return TPromise.wrapError('Uri must have scheme and path. One or both are missing in: ' + uri.toString());
		}

		let promise: TPromise<boolean>;
		switch (uri.scheme) {
			case 'file':
				promise = this._handleFileScheme(uri);
				break;
			case 'untitled':
				promise = this._handleUnititledScheme(uri);
				break;
			default:
				promise = TPromise.wrapError<boolean>('unsupported URI-scheme: ' + uri.scheme);
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

	private _handleFileScheme(uri: URI): TPromise<boolean> {
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
				return this._proxy._acceptModelDirty(uri); // mark as dirty
			}).then(() => {
				return true;
			});
		});
	}
}