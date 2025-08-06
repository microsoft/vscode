/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import * as resources from '../../../../base/common/resources.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { Promises, ThrottledDelayer } from '../../../../base/common/async.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageSelection } from '../../../../editor/common/languages/language.js';
import { Disposable, toDisposable, IDisposable, MutableDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isNumber } from '../../../../base/common/types.js';
import { EditOperation, ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILogger, ILoggerService, ILogService, LogLevel } from '../../../../platform/log/common/log.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ILogEntry, IOutputContentSource, LOG_MIME, OutputChannelUpdateMode } from '../../../services/output/common/output.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { TextModel } from '../../../../editor/common/model/textModel.js';
import { binarySearch, sortedDiff } from '../../../../base/common/arrays.js';

const LOG_ENTRY_REGEX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s(\[(info|trace|debug|error|warning)\])\s(\[(.*?)\])?/;

export function parseLogEntryAt(model: ITextModel, lineNumber: number): ILogEntry | null {
	const lineContent = model.getLineContent(lineNumber);
	const match = LOG_ENTRY_REGEX.exec(lineContent);
	if (match) {
		const timestamp = new Date(match[1]).getTime();
		const timestampRange = new Range(lineNumber, 1, lineNumber, match[1].length);
		const logLevel = parseLogLevel(match[3]);
		const logLevelRange = new Range(lineNumber, timestampRange.endColumn + 1, lineNumber, timestampRange.endColumn + 1 + match[2].length);
		const category = match[5];
		const startLine = lineNumber;
		let endLine = lineNumber;

		const lineCount = model.getLineCount();
		while (endLine < lineCount) {
			const nextLineContent = model.getLineContent(endLine + 1);
			const isLastLine = endLine + 1 === lineCount && nextLineContent === ''; // Last line will be always empty
			if (LOG_ENTRY_REGEX.test(nextLineContent) || isLastLine) {
				break;
			}
			endLine++;
		}
		const range = new Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
		return { range, timestamp, timestampRange, logLevel, logLevelRange, category };
	}
	return null;
}

function* logEntryIterator<T>(model: ITextModel, process: (logEntry: ILogEntry) => T): IterableIterator<T> {
	for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
		const logEntry = parseLogEntryAt(model, lineNumber);
		if (logEntry) {
			yield process(logEntry);
			lineNumber = logEntry.range.endLineNumber;
		}
	}
}

function changeStartLineNumber(logEntry: ILogEntry, lineNumber: number): ILogEntry {
	return {
		...logEntry,
		range: new Range(lineNumber, logEntry.range.startColumn, lineNumber + logEntry.range.endLineNumber - logEntry.range.startLineNumber, logEntry.range.endColumn),
		timestampRange: new Range(lineNumber, logEntry.timestampRange.startColumn, lineNumber, logEntry.timestampRange.endColumn),
		logLevelRange: new Range(lineNumber, logEntry.logLevelRange.startColumn, lineNumber, logEntry.logLevelRange.endColumn),
	};
}

function parseLogLevel(level: string): LogLevel {
	switch (level.toLowerCase()) {
		case 'trace':
			return LogLevel.Trace;
		case 'debug':
			return LogLevel.Debug;
		case 'info':
			return LogLevel.Info;
		case 'warning':
			return LogLevel.Warning;
		case 'error':
			return LogLevel.Error;
		default:
			throw new Error(`Unknown log level: ${level}`);
	}
}

export interface IOutputChannelModel extends IDisposable {
	readonly onDispose: Event<void>;
	readonly source: IOutputContentSource | ReadonlyArray<IOutputContentSource>;
	getLogEntries(): ReadonlyArray<ILogEntry>;
	append(output: string): void;
	update(mode: OutputChannelUpdateMode, till: number | undefined, immediate: boolean): void;
	updateChannelSources(sources: ReadonlyArray<IOutputContentSource>): void;
	loadModel(): Promise<ITextModel>;
	clear(): void;
	replace(value: string): void;
}

interface IContentProvider {
	readonly onDidAppend: Event<void>;
	readonly onDidReset: Event<void>;
	reset(): void;
	watch(): void;
	unwatch(): void;
	getContent(): Promise<{ readonly content: string; readonly consume: () => void }>;
	getLogEntries(): ReadonlyArray<ILogEntry>;
}

class FileContentProvider extends Disposable implements IContentProvider {

	private readonly _onDidAppend = new Emitter<void>();
	readonly onDidAppend = this._onDidAppend.event;

	private readonly _onDidReset = new Emitter<void>();
	readonly onDidReset = this._onDidReset.event;

	private watching: boolean = false;
	private syncDelayer: ThrottledDelayer<void>;
	private etag: string | undefined = '';

	private logEntries: ILogEntry[] = [];
	private startOffset: number = 0;
	private endOffset: number = 0;

	readonly resource: URI;
	readonly name: string;

	constructor(
		{ name, resource }: IOutputContentSource,
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.name = name ?? '';
		this.resource = resource;
		this.syncDelayer = new ThrottledDelayer<void>(500);
		this._register(toDisposable(() => this.unwatch()));
	}

	reset(offset?: number): void {
		this.endOffset = this.startOffset = offset ?? this.startOffset;
		this.logEntries = [];
	}

	resetToEnd(): void {
		this.startOffset = this.endOffset;
		this.logEntries = [];
	}

	watch(): void {
		if (!this.watching) {
			this.logService.trace('Started polling', this.resource.toString());
			this.poll();
			this.watching = true;
		}
	}

	unwatch(): void {
		if (this.watching) {
			this.syncDelayer.cancel();
			this.watching = false;
			this.logService.trace('Stopped polling', this.resource.toString());
		}
	}

	private poll(): void {
		const loop = () => this.doWatch().then(() => this.poll());
		this.syncDelayer.trigger(loop).catch(error => {
			if (!isCancellationError(error)) {
				throw error;
			}
		});
	}

	private async doWatch(): Promise<void> {
		try {
			if (!this.fileService.hasProvider(this.resource)) {
				return;
			}
			const stat = await this.fileService.stat(this.resource);
			if (stat.etag !== this.etag) {
				this.etag = stat.etag;
				if (isNumber(stat.size) && this.endOffset > stat.size) {
					this.reset(0);
					this._onDidReset.fire();
				} else {
					this._onDidAppend.fire();
				}
			}
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
		}
	}

	getLogEntries(): ReadonlyArray<ILogEntry> {
		return this.logEntries;
	}

	async getContent(donotConsumeLogEntries?: boolean): Promise<{ readonly name: string; readonly content: string; readonly consume: () => void }> {
		try {
			if (!this.fileService.hasProvider(this.resource)) {
				return {
					name: this.name,
					content: '',
					consume: () => { /* No Op */ }
				};
			}
			const fileContent = await this.fileService.readFile(this.resource, { position: this.endOffset });
			const content = fileContent.value.toString();
			const logEntries = donotConsumeLogEntries ? [] : this.parseLogEntries(content, this.logEntries[this.logEntries.length - 1]);
			let consumed = false;
			return {
				name: this.name,
				content,
				consume: () => {
					if (!consumed) {
						consumed = true;
						this.endOffset += fileContent.value.byteLength;
						this.etag = fileContent.etag;
						this.logEntries.push(...logEntries);
					}
				}
			};
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
			return {
				name: this.name,
				content: '',
				consume: () => { /* No Op */ }
			};
		}
	}

	private parseLogEntries(content: string, lastLogEntry: ILogEntry | undefined): ILogEntry[] {
		const model = this.instantiationService.createInstance(TextModel, content, LOG_MIME, TextModel.DEFAULT_CREATION_OPTIONS, null);
		try {
			if (!parseLogEntryAt(model, 1)) {
				return [];
			}
			const logEntries: ILogEntry[] = [];
			let logEntryStartLineNumber = lastLogEntry ? lastLogEntry.range.endLineNumber + 1 : 1;
			for (const entry of logEntryIterator(model, (e) => changeStartLineNumber(e, logEntryStartLineNumber))) {
				logEntries.push(entry);
				logEntryStartLineNumber = entry.range.endLineNumber + 1;
			}
			return logEntries;
		} finally {
			model.dispose();
		}
	}
}

class MultiFileContentProvider extends Disposable implements IContentProvider {

	private readonly _onDidAppend = this._register(new Emitter<void>());
	readonly onDidAppend = this._onDidAppend.event;
	readonly onDidReset = Event.None;

	private logEntries: ILogEntry[] = [];
	private readonly fileContentProviderItems: [FileContentProvider, DisposableStore][] = [];

	private watching: boolean = false;

	constructor(
		filesInfos: IOutputContentSource[],
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		for (const file of filesInfos) {
			this.fileContentProviderItems.push(this.createFileContentProvider(file));
		}
		this._register(toDisposable(() => {
			for (const [, disposables] of this.fileContentProviderItems) {
				disposables.dispose();
			}
		}));
	}

	private createFileContentProvider(file: IOutputContentSource): [FileContentProvider, DisposableStore] {
		const disposables = new DisposableStore();
		const fileOutput = disposables.add(new FileContentProvider(file, this.fileService, this.instantiationService, this.logService));
		disposables.add(fileOutput.onDidAppend(() => this._onDidAppend.fire()));
		return [fileOutput, disposables];
	}

	watch(): void {
		if (!this.watching) {
			this.watching = true;
			for (const [output] of this.fileContentProviderItems) {
				output.watch();
			}
		}
	}

	unwatch(): void {
		if (this.watching) {
			this.watching = false;
			for (const [output] of this.fileContentProviderItems) {
				output.unwatch();
			}
		}
	}

	updateFiles(files: IOutputContentSource[]): void {
		const wasWatching = this.watching;
		if (wasWatching) {
			this.unwatch();
		}

		const result = sortedDiff(this.fileContentProviderItems.map(([output]) => output), files, (a, b) => resources.extUri.compare(a.resource, b.resource));
		for (const { start, deleteCount, toInsert } of result) {
			const outputs = toInsert.map(file => this.createFileContentProvider(file));
			const outputsToRemove = this.fileContentProviderItems.splice(start, deleteCount, ...outputs);
			for (const [, disposables] of outputsToRemove) {
				disposables.dispose();
			}
		}

		if (wasWatching) {
			this.watch();
		}
	}

	reset(): void {
		for (const [output] of this.fileContentProviderItems) {
			output.reset();
		}
		this.logEntries = [];
	}

	resetToEnd(): void {
		for (const [output] of this.fileContentProviderItems) {
			output.resetToEnd();
		}
		this.logEntries = [];
	}

	getLogEntries(): ReadonlyArray<ILogEntry> {
		return this.logEntries;
	}

	async getContent(): Promise<{ readonly content: string; readonly consume: () => void }> {
		const outputs = await Promise.all(this.fileContentProviderItems.map(([output]) => output.getContent(true)));
		const { content, logEntries } = this.combineLogEntries(outputs, this.logEntries[this.logEntries.length - 1]);
		let consumed = false;
		return {
			content,
			consume: () => {
				if (!consumed) {
					consumed = true;
					outputs.forEach(({ consume }) => consume());
					this.logEntries.push(...logEntries);
				}
			}
		};
	}

	private combineLogEntries(outputs: { content: string; name: string }[], lastEntry: ILogEntry | undefined): { logEntries: ILogEntry[]; content: string } {

		outputs = outputs.filter(output => !!output.content);

		if (outputs.length === 0) {
			return { logEntries: [], content: '' };
		}

		const logEntries: ILogEntry[] = [];
		const contents: string[] = [];
		const process = (model: ITextModel, logEntry: ILogEntry, name: string): [ILogEntry, string] => {
			const lineContent = model.getValueInRange(logEntry.range);
			const content = name ? `${lineContent.substring(0, logEntry.logLevelRange.endColumn)} [${name}]${lineContent.substring(logEntry.logLevelRange.endColumn)}` : lineContent;
			return [{
				...logEntry,
				category: name,
				range: new Range(logEntry.range.startLineNumber, logEntry.logLevelRange.startColumn, logEntry.range.endLineNumber, name ? logEntry.range.endColumn + name.length + 3 : logEntry.range.endColumn),
			}, content];
		};

		const model = this.instantiationService.createInstance(TextModel, outputs[0].content, LOG_MIME, TextModel.DEFAULT_CREATION_OPTIONS, null);
		try {
			for (const [logEntry, content] of logEntryIterator(model, (e) => process(model, e, outputs[0].name))) {
				logEntries.push(logEntry);
				contents.push(content);
			}
		} finally {
			model.dispose();
		}

		for (let index = 1; index < outputs.length; index++) {
			const { content, name } = outputs[index];
			const model = this.instantiationService.createInstance(TextModel, content, LOG_MIME, TextModel.DEFAULT_CREATION_OPTIONS, null);
			try {
				const iterator = logEntryIterator(model, (e) => process(model, e, name));
				let next = iterator.next();
				while (!next.done) {
					const [logEntry, content] = next.value;
					const logEntriesToAdd = [logEntry];
					const contentsToAdd = [content];

					let insertionIndex;

					// If the timestamp is greater than or equal to the last timestamp,
					// we can just append all the entries at the end
					if (logEntry.timestamp >= logEntries[logEntries.length - 1].timestamp) {
						insertionIndex = logEntries.length;
						for (next = iterator.next(); !next.done; next = iterator.next()) {
							logEntriesToAdd.push(next.value[0]);
							contentsToAdd.push(next.value[1]);
						}
					}
					else {
						if (logEntry.timestamp <= logEntries[0].timestamp) {
							// If the timestamp is less than or equal to the first timestamp
							// then insert at the beginning
							insertionIndex = 0;
						} else {
							// Otherwise, find the insertion index
							const idx = binarySearch(logEntries, logEntry, (a, b) => a.timestamp - b.timestamp);
							insertionIndex = idx < 0 ? ~idx : idx;
						}

						// Collect all entries that have a timestamp less than or equal to the timestamp at the insertion index
						for (next = iterator.next(); !next.done && next.value[0].timestamp <= logEntries[insertionIndex].timestamp; next = iterator.next()) {
							logEntriesToAdd.push(next.value[0]);
							contentsToAdd.push(next.value[1]);
						}
					}

					contents.splice(insertionIndex, 0, ...contentsToAdd);
					logEntries.splice(insertionIndex, 0, ...logEntriesToAdd);
				}
			} finally {
				model.dispose();
			}
		}

		let content = '';
		const updatedLogEntries: ILogEntry[] = [];
		let logEntryStartLineNumber = lastEntry ? lastEntry.range.endLineNumber + 1 : 1;
		for (let i = 0; i < logEntries.length; i++) {
			content += contents[i] + '\n';
			const updatedLogEntry = changeStartLineNumber(logEntries[i], logEntryStartLineNumber);
			updatedLogEntries.push(updatedLogEntry);
			logEntryStartLineNumber = updatedLogEntry.range.endLineNumber + 1;
		}

		return { logEntries: updatedLogEntries, content };
	}

}

export abstract class AbstractFileOutputChannelModel extends Disposable implements IOutputChannelModel {

	private readonly _onDispose = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	protected loadModelPromise: Promise<ITextModel> | null = null;

	private readonly modelDisposable = this._register(new MutableDisposable<DisposableStore>());
	protected model: ITextModel | null = null;
	private modelUpdateInProgress: boolean = false;
	private readonly modelUpdateCancellationSource = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly appendThrottler = this._register(new ThrottledDelayer(300));
	private replacePromise: Promise<void> | undefined;

	abstract readonly source: IOutputContentSource | ReadonlyArray<IOutputContentSource>;

	constructor(
		private readonly modelUri: URI,
		private readonly language: ILanguageSelection,
		private readonly outputContentProvider: IContentProvider,
		@IModelService protected readonly modelService: IModelService,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
	) {
		super();
	}

	async loadModel(): Promise<ITextModel> {
		this.loadModelPromise = Promises.withAsyncBody<ITextModel>(async (c, e) => {
			try {
				this.modelDisposable.value = new DisposableStore();
				this.model = this.modelService.createModel('', this.language, this.modelUri);
				const { content, consume } = await this.outputContentProvider.getContent();
				consume();
				this.doAppendContent(this.model, content);
				this.modelDisposable.value.add(this.outputContentProvider.onDidReset(() => this.onDidContentChange(true, true)));
				this.modelDisposable.value.add(this.outputContentProvider.onDidAppend(() => this.onDidContentChange(false, false)));
				this.outputContentProvider.watch();
				this.modelDisposable.value.add(toDisposable(() => this.outputContentProvider.unwatch()));
				this.modelDisposable.value.add(this.model.onWillDispose(() => {
					this.outputContentProvider.reset();
					this.modelDisposable.value = undefined;
					this.cancelModelUpdate();
					this.model = null;
				}));
				c(this.model);
			} catch (error) {
				e(error);
			}
		});
		return this.loadModelPromise;
	}

	getLogEntries(): readonly ILogEntry[] {
		return this.outputContentProvider.getLogEntries();
	}

	private onDidContentChange(reset: boolean, appendImmediately: boolean): void {
		if (reset && !this.modelUpdateInProgress) {
			this.doUpdate(OutputChannelUpdateMode.Clear, true);
		}
		this.doUpdate(OutputChannelUpdateMode.Append, appendImmediately);
	}

	protected doUpdate(mode: OutputChannelUpdateMode, immediate: boolean): void {
		if (mode === OutputChannelUpdateMode.Clear || mode === OutputChannelUpdateMode.Replace) {
			this.cancelModelUpdate();
		}
		if (!this.model) {
			return;
		}

		this.modelUpdateInProgress = true;
		if (!this.modelUpdateCancellationSource.value) {
			this.modelUpdateCancellationSource.value = new CancellationTokenSource();
		}
		const token = this.modelUpdateCancellationSource.value.token;

		if (mode === OutputChannelUpdateMode.Clear) {
			this.clearContent(this.model);
		}

		else if (mode === OutputChannelUpdateMode.Replace) {
			this.replacePromise = this.replaceContent(this.model, token).finally(() => this.replacePromise = undefined);
		}

		else {
			this.appendContent(this.model, immediate, token);
		}
	}

	private clearContent(model: ITextModel): void {
		model.applyEdits([EditOperation.delete(model.getFullModelRange())]);
		this.modelUpdateInProgress = false;
	}

	private appendContent(model: ITextModel, immediate: boolean, token: CancellationToken): void {
		this.appendThrottler.trigger(async () => {
			/* Abort if operation is cancelled */
			if (token.isCancellationRequested) {
				return;
			}

			/* Wait for replace to finish */
			if (this.replacePromise) {
				try { await this.replacePromise; } catch (e) { /* Ignore */ }
				/* Abort if operation is cancelled */
				if (token.isCancellationRequested) {
					return;
				}
			}

			/* Get content to append */
			const { content, consume } = await this.outputContentProvider.getContent();
			/* Abort if operation is cancelled */
			if (token.isCancellationRequested) {
				return;
			}

			/* Appned Content */
			consume();
			this.doAppendContent(model, content);
			this.modelUpdateInProgress = false;
		}, immediate ? 0 : undefined).catch(error => {
			if (!isCancellationError(error)) {
				throw error;
			}
		});
	}

	private doAppendContent(model: ITextModel, content: string): void {
		const lastLine = model.getLineCount();
		const lastLineMaxColumn = model.getLineMaxColumn(lastLine);
		model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), content)]);
	}

	private async replaceContent(model: ITextModel, token: CancellationToken): Promise<void> {
		/* Get content to replace */
		const { content, consume } = await this.outputContentProvider.getContent();
		/* Abort if operation is cancelled */
		if (token.isCancellationRequested) {
			return;
		}

		/* Compute Edits */
		const edits = await this.getReplaceEdits(model, content.toString());
		/* Abort if operation is cancelled */
		if (token.isCancellationRequested) {
			return;
		}

		consume();
		if (edits.length) {
			/* Apply Edits */
			model.applyEdits(edits);
		}
		this.modelUpdateInProgress = false;
	}

	private async getReplaceEdits(model: ITextModel, contentToReplace: string): Promise<ISingleEditOperation[]> {
		if (!contentToReplace) {
			return [EditOperation.delete(model.getFullModelRange())];
		}
		if (contentToReplace !== model.getValue()) {
			const edits = await this.editorWorkerService.computeMoreMinimalEdits(model.uri, [{ text: contentToReplace.toString(), range: model.getFullModelRange() }]);
			if (edits?.length) {
				return edits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text));
			}
		}
		return [];
	}

	protected cancelModelUpdate(): void {
		this.modelUpdateCancellationSource.value?.cancel();
		this.modelUpdateCancellationSource.value = undefined;
		this.appendThrottler.cancel();
		this.replacePromise = undefined;
		this.modelUpdateInProgress = false;
	}

	protected isVisible(): boolean {
		return !!this.model;
	}

	override dispose(): void {
		this._onDispose.fire();
		super.dispose();
	}

	append(message: string): void { throw new Error('Not supported'); }
	replace(message: string): void { throw new Error('Not supported'); }

	abstract clear(): void;
	abstract update(mode: OutputChannelUpdateMode, till: number | undefined, immediate: boolean): void;
	abstract updateChannelSources(files: IOutputContentSource[]): void;
}

export class FileOutputChannelModel extends AbstractFileOutputChannelModel implements IOutputChannelModel {

	private readonly fileOutput: FileContentProvider;

	constructor(
		modelUri: URI,
		language: ILanguageSelection,
		readonly source: IOutputContentSource,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
	) {
		const fileOutput = new FileContentProvider(source, fileService, instantiationService, logService);
		super(modelUri, language, fileOutput, modelService, editorWorkerService);
		this.fileOutput = this._register(fileOutput);
	}

	override clear(): void {
		this.update(OutputChannelUpdateMode.Clear, undefined, true);
	}

	override update(mode: OutputChannelUpdateMode, till: number | undefined, immediate: boolean): void {
		const loadModelPromise: Promise<any> = this.loadModelPromise ? this.loadModelPromise : Promise.resolve();
		loadModelPromise.then(() => {
			if (mode === OutputChannelUpdateMode.Clear || mode === OutputChannelUpdateMode.Replace) {
				if (isNumber(till)) {
					this.fileOutput.reset(till);
				} else {
					this.fileOutput.resetToEnd();
				}
			}
			this.doUpdate(mode, immediate);
		});
	}

	override updateChannelSources(files: IOutputContentSource[]): void { throw new Error('Not supported'); }
}

export class MultiFileOutputChannelModel extends AbstractFileOutputChannelModel implements IOutputChannelModel {

	private readonly multifileOutput: MultiFileContentProvider;

	constructor(
		modelUri: URI,
		language: ILanguageSelection,
		readonly source: IOutputContentSource[],
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@ILogService logService: ILogService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const multifileOutput = new MultiFileContentProvider(source, instantiationService, fileService, logService);
		super(modelUri, language, multifileOutput, modelService, editorWorkerService);
		this.multifileOutput = this._register(multifileOutput);
	}

	override updateChannelSources(files: IOutputContentSource[]): void {
		this.multifileOutput.unwatch();
		this.multifileOutput.updateFiles(files);
		this.multifileOutput.reset();
		this.doUpdate(OutputChannelUpdateMode.Replace, true);
		if (this.isVisible()) {
			this.multifileOutput.watch();
		}
	}

	override clear(): void {
		const loadModelPromise: Promise<any> = this.loadModelPromise ? this.loadModelPromise : Promise.resolve();
		loadModelPromise.then(() => {
			this.multifileOutput.resetToEnd();
			this.doUpdate(OutputChannelUpdateMode.Clear, true);
		});
	}

	override update(mode: OutputChannelUpdateMode, till: number | undefined, immediate: boolean): void { throw new Error('Not supported'); }
}

class OutputChannelBackedByFile extends FileOutputChannelModel implements IOutputChannelModel {

	private logger: ILogger;
	private _offset: number;

	constructor(
		id: string,
		modelUri: URI,
		language: ILanguageSelection,
		file: URI,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@ILoggerService loggerService: ILoggerService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(modelUri, language, { resource: file, name: '' }, fileService, modelService, instantiationService, logService, editorWorkerService);

		// Donot rotate to check for the file reset
		this.logger = loggerService.createLogger(file, { logLevel: 'always', donotRotate: true, donotUseFormatters: true, hidden: true });
		this._offset = 0;
	}

	override append(message: string): void {
		this.write(message);
		this.update(OutputChannelUpdateMode.Append, undefined, this.isVisible());
	}

	override replace(message: string): void {
		const till = this._offset;
		this.write(message);
		this.update(OutputChannelUpdateMode.Replace, till, true);
	}

	private write(content: string): void {
		this._offset += VSBuffer.fromString(content).byteLength;
		this.logger.info(content);
		if (this.isVisible()) {
			this.logger.flush();
		}
	}

}

export class DelegatedOutputChannelModel extends Disposable implements IOutputChannelModel {

	private readonly _onDispose: Emitter<void> = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	private readonly outputChannelModel: Promise<IOutputChannelModel>;
	readonly source: IOutputContentSource;

	constructor(
		id: string,
		modelUri: URI,
		language: ILanguageSelection,
		outputDir: URI,
		outputDirCreationPromise: Promise<void>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this.outputChannelModel = this.createOutputChannelModel(id, modelUri, language, outputDir, outputDirCreationPromise);
		const resource = resources.joinPath(outputDir, `${id.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
		this.source = { resource };
	}

	private async createOutputChannelModel(id: string, modelUri: URI, language: ILanguageSelection, outputDir: URI, outputDirPromise: Promise<void>): Promise<IOutputChannelModel> {
		await outputDirPromise;
		const file = resources.joinPath(outputDir, `${id.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
		await this.fileService.createFile(file);
		const outputChannelModel = this._register(this.instantiationService.createInstance(OutputChannelBackedByFile, id, modelUri, language, file));
		this._register(outputChannelModel.onDispose(() => this._onDispose.fire()));
		return outputChannelModel;
	}

	getLogEntries(): readonly ILogEntry[] {
		return [];
	}

	append(output: string): void {
		this.outputChannelModel.then(outputChannelModel => outputChannelModel.append(output));
	}

	update(mode: OutputChannelUpdateMode, till: number | undefined, immediate: boolean): void {
		this.outputChannelModel.then(outputChannelModel => outputChannelModel.update(mode, till, immediate));
	}

	loadModel(): Promise<ITextModel> {
		return this.outputChannelModel.then(outputChannelModel => outputChannelModel.loadModel());
	}

	clear(): void {
		this.outputChannelModel.then(outputChannelModel => outputChannelModel.clear());
	}

	replace(value: string): void {
		this.outputChannelModel.then(outputChannelModel => outputChannelModel.replace(value));
	}

	updateChannelSources(files: IOutputContentSource[]): void {
		this.outputChannelModel.then(outputChannelModel => outputChannelModel.updateChannelSources(files));
	}
}
