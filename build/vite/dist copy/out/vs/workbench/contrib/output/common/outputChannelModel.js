/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import * as resources from '../../../../base/common/resources.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Promises, ThrottledDelayer } from '../../../../base/common/async.js';
import { IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { Disposable, toDisposable, MutableDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isNumber } from '../../../../base/common/types.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILoggerService, ILogService, LogLevel } from '../../../../platform/log/common/log.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { LOG_MIME, OutputChannelUpdateMode } from '../../../services/output/common/output.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { TextModel } from '../../../../editor/common/model/textModel.js';
import { binarySearch, sortedDiff } from '../../../../base/common/arrays.js';
const LOG_ENTRY_REGEX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s(\[(info|trace|debug|error|warning)\])\s(\[(.*?)\])?/;
export function parseLogEntryAt(model, lineNumber) {
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
function* logEntryIterator(model, process) {
    for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
        const logEntry = parseLogEntryAt(model, lineNumber);
        if (logEntry) {
            yield process(logEntry);
            lineNumber = logEntry.range.endLineNumber;
        }
    }
}
function changeStartLineNumber(logEntry, lineNumber) {
    return {
        ...logEntry,
        range: new Range(lineNumber, logEntry.range.startColumn, lineNumber + logEntry.range.endLineNumber - logEntry.range.startLineNumber, logEntry.range.endColumn),
        timestampRange: new Range(lineNumber, logEntry.timestampRange.startColumn, lineNumber, logEntry.timestampRange.endColumn),
        logLevelRange: new Range(lineNumber, logEntry.logLevelRange.startColumn, lineNumber, logEntry.logLevelRange.endColumn),
    };
}
function parseLogLevel(level) {
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
let FileContentProvider = class FileContentProvider extends Disposable {
    get onDidAppend() { return this._onDidAppend.event; }
    get onDidReset() { return this._onDidReset.event; }
    constructor({ name, resource }, fileService, instantiationService, logService) {
        super();
        this.fileService = fileService;
        this.instantiationService = instantiationService;
        this.logService = logService;
        this._onDidAppend = this._register(new Emitter());
        this._onDidReset = this._register(new Emitter());
        this.watching = false;
        this.etag = '';
        this.logEntries = [];
        this.startOffset = 0;
        this.endOffset = 0;
        this.name = name ?? '';
        this.resource = resource;
        this.syncDelayer = new ThrottledDelayer(500);
        this._register(toDisposable(() => this.unwatch()));
    }
    reset(offset) {
        this.endOffset = this.startOffset = offset ?? this.startOffset;
        this.logEntries = [];
    }
    resetToEnd() {
        this.startOffset = this.endOffset;
        this.logEntries = [];
    }
    watch() {
        if (!this.watching) {
            this.logService.trace('Started polling', this.resource.toString());
            this.poll();
            this.watching = true;
        }
    }
    unwatch() {
        if (this.watching) {
            this.syncDelayer.cancel();
            this.watching = false;
            this.logService.trace('Stopped polling', this.resource.toString());
        }
    }
    poll() {
        const loop = () => this.doWatch().then(() => this.poll());
        this.syncDelayer.trigger(loop).catch(error => {
            if (!isCancellationError(error)) {
                throw error;
            }
        });
    }
    async doWatch() {
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
                }
                else {
                    this._onDidAppend.fire();
                }
            }
        }
        catch (error) {
            if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                throw error;
            }
        }
    }
    getLogEntries() {
        return this.logEntries;
    }
    async getContent(donotConsumeLogEntries) {
        try {
            if (!this.fileService.hasProvider(this.resource)) {
                return {
                    name: this.name,
                    content: '',
                    consume: () => { }
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
        }
        catch (error) {
            if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                throw error;
            }
            return {
                name: this.name,
                content: '',
                consume: () => { }
            };
        }
    }
    parseLogEntries(content, lastLogEntry) {
        const model = this.instantiationService.createInstance(TextModel, content, LOG_MIME, TextModel.DEFAULT_CREATION_OPTIONS, null);
        try {
            if (!parseLogEntryAt(model, 1)) {
                return [];
            }
            const logEntries = [];
            let logEntryStartLineNumber = lastLogEntry ? lastLogEntry.range.endLineNumber + 1 : 1;
            for (const entry of logEntryIterator(model, (e) => changeStartLineNumber(e, logEntryStartLineNumber))) {
                logEntries.push(entry);
                logEntryStartLineNumber = entry.range.endLineNumber + 1;
            }
            return logEntries;
        }
        finally {
            model.dispose();
        }
    }
};
FileContentProvider = __decorate([
    __param(1, IFileService),
    __param(2, IInstantiationService),
    __param(3, ILogService)
], FileContentProvider);
let MultiFileContentProvider = class MultiFileContentProvider extends Disposable {
    constructor(filesInfos, instantiationService, fileService, logService) {
        super();
        this.instantiationService = instantiationService;
        this.fileService = fileService;
        this.logService = logService;
        this._onDidAppend = this._register(new Emitter());
        this.onDidAppend = this._onDidAppend.event;
        this.onDidReset = Event.None;
        this.logEntries = [];
        this.fileContentProviderItems = [];
        this.watching = false;
        for (const file of filesInfos) {
            this.fileContentProviderItems.push(this.createFileContentProvider(file));
        }
        this._register(toDisposable(() => {
            for (const [, disposables] of this.fileContentProviderItems) {
                disposables.dispose();
            }
        }));
    }
    createFileContentProvider(file) {
        const disposables = new DisposableStore();
        const fileOutput = disposables.add(new FileContentProvider(file, this.fileService, this.instantiationService, this.logService));
        disposables.add(fileOutput.onDidAppend(() => this._onDidAppend.fire()));
        return [fileOutput, disposables];
    }
    watch() {
        if (!this.watching) {
            this.watching = true;
            for (const [output] of this.fileContentProviderItems) {
                output.watch();
            }
        }
    }
    unwatch() {
        if (this.watching) {
            this.watching = false;
            for (const [output] of this.fileContentProviderItems) {
                output.unwatch();
            }
        }
    }
    updateFiles(files) {
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
    reset() {
        for (const [output] of this.fileContentProviderItems) {
            output.reset();
        }
        this.logEntries = [];
    }
    resetToEnd() {
        for (const [output] of this.fileContentProviderItems) {
            output.resetToEnd();
        }
        this.logEntries = [];
    }
    getLogEntries() {
        return this.logEntries;
    }
    async getContent() {
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
    combineLogEntries(outputs, lastEntry) {
        outputs = outputs.filter(output => !!output.content);
        if (outputs.length === 0) {
            return { logEntries: [], content: '' };
        }
        const logEntries = [];
        const contents = [];
        const process = (model, logEntry, name) => {
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
        }
        finally {
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
                        }
                        else {
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
            }
            finally {
                model.dispose();
            }
        }
        let content = '';
        const updatedLogEntries = [];
        let logEntryStartLineNumber = lastEntry ? lastEntry.range.endLineNumber + 1 : 1;
        for (let i = 0; i < logEntries.length; i++) {
            content += contents[i] + '\n';
            const updatedLogEntry = changeStartLineNumber(logEntries[i], logEntryStartLineNumber);
            updatedLogEntries.push(updatedLogEntry);
            logEntryStartLineNumber = updatedLogEntry.range.endLineNumber + 1;
        }
        return { logEntries: updatedLogEntries, content };
    }
};
MultiFileContentProvider = __decorate([
    __param(1, IInstantiationService),
    __param(2, IFileService),
    __param(3, ILogService)
], MultiFileContentProvider);
let AbstractFileOutputChannelModel = class AbstractFileOutputChannelModel extends Disposable {
    constructor(modelUri, language, outputContentProvider, modelService, editorWorkerService) {
        super();
        this.modelUri = modelUri;
        this.language = language;
        this.outputContentProvider = outputContentProvider;
        this.modelService = modelService;
        this.editorWorkerService = editorWorkerService;
        this._onDispose = this._register(new Emitter());
        this.onDispose = this._onDispose.event;
        this.loadModelPromise = null;
        this.modelDisposable = this._register(new MutableDisposable());
        this.model = null;
        this.modelUpdateInProgress = false;
        this.modelUpdateCancellationSource = this._register(new MutableDisposable());
        this.appendThrottler = this._register(new ThrottledDelayer(300));
    }
    async loadModel() {
        this.loadModelPromise = Promises.withAsyncBody(async (c, e) => {
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
            }
            catch (error) {
                e(error);
            }
        });
        return this.loadModelPromise;
    }
    getLogEntries() {
        return this.outputContentProvider.getLogEntries();
    }
    onDidContentChange(reset, appendImmediately) {
        if (reset && !this.modelUpdateInProgress) {
            this.doUpdate(OutputChannelUpdateMode.Clear, true);
        }
        this.doUpdate(OutputChannelUpdateMode.Append, appendImmediately);
    }
    doUpdate(mode, immediate) {
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
    clearContent(model) {
        model.applyEdits([EditOperation.delete(model.getFullModelRange())]);
        this.modelUpdateInProgress = false;
    }
    appendContent(model, immediate, token) {
        this.appendThrottler.trigger(async () => {
            /* Abort if operation is cancelled */
            if (token.isCancellationRequested) {
                return;
            }
            /* Wait for replace to finish */
            if (this.replacePromise) {
                try {
                    await this.replacePromise;
                }
                catch (e) { /* Ignore */ }
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
    doAppendContent(model, content) {
        const lastLine = model.getLineCount();
        const lastLineMaxColumn = model.getLineMaxColumn(lastLine);
        model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), content)]);
    }
    async replaceContent(model, token) {
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
    async getReplaceEdits(model, contentToReplace) {
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
    cancelModelUpdate() {
        this.modelUpdateCancellationSource.value?.cancel();
        this.modelUpdateCancellationSource.value = undefined;
        this.appendThrottler.cancel();
        this.replacePromise = undefined;
        this.modelUpdateInProgress = false;
    }
    isVisible() {
        return !!this.model;
    }
    dispose() {
        this._onDispose.fire();
        super.dispose();
    }
    append(message) { throw new Error('Not supported'); }
    replace(message) { throw new Error('Not supported'); }
};
AbstractFileOutputChannelModel = __decorate([
    __param(3, IModelService),
    __param(4, IEditorWorkerService)
], AbstractFileOutputChannelModel);
export { AbstractFileOutputChannelModel };
let FileOutputChannelModel = class FileOutputChannelModel extends AbstractFileOutputChannelModel {
    constructor(modelUri, language, source, fileService, modelService, instantiationService, logService, editorWorkerService) {
        const fileOutput = new FileContentProvider(source, fileService, instantiationService, logService);
        super(modelUri, language, fileOutput, modelService, editorWorkerService);
        this.source = source;
        this.fileOutput = this._register(fileOutput);
    }
    clear() {
        this.update(OutputChannelUpdateMode.Clear, undefined, true);
    }
    update(mode, till, immediate) {
        const loadModelPromise = this.loadModelPromise ? this.loadModelPromise : Promise.resolve();
        loadModelPromise.then(() => {
            if (mode === OutputChannelUpdateMode.Clear || mode === OutputChannelUpdateMode.Replace) {
                if (isNumber(till)) {
                    this.fileOutput.reset(till);
                }
                else {
                    this.fileOutput.resetToEnd();
                }
            }
            this.doUpdate(mode, immediate);
        });
    }
    updateChannelSources(files) { throw new Error('Not supported'); }
};
FileOutputChannelModel = __decorate([
    __param(3, IFileService),
    __param(4, IModelService),
    __param(5, IInstantiationService),
    __param(6, ILogService),
    __param(7, IEditorWorkerService)
], FileOutputChannelModel);
export { FileOutputChannelModel };
let MultiFileOutputChannelModel = class MultiFileOutputChannelModel extends AbstractFileOutputChannelModel {
    constructor(modelUri, language, source, fileService, modelService, logService, editorWorkerService, instantiationService) {
        const multifileOutput = new MultiFileContentProvider(source, instantiationService, fileService, logService);
        super(modelUri, language, multifileOutput, modelService, editorWorkerService);
        this.source = source;
        this.multifileOutput = this._register(multifileOutput);
    }
    updateChannelSources(files) {
        this.multifileOutput.unwatch();
        this.multifileOutput.updateFiles(files);
        this.multifileOutput.reset();
        this.doUpdate(OutputChannelUpdateMode.Replace, true);
        if (this.isVisible()) {
            this.multifileOutput.watch();
        }
    }
    clear() {
        const loadModelPromise = this.loadModelPromise ? this.loadModelPromise : Promise.resolve();
        loadModelPromise.then(() => {
            this.multifileOutput.resetToEnd();
            this.doUpdate(OutputChannelUpdateMode.Clear, true);
        });
    }
    update(mode, till, immediate) { throw new Error('Not supported'); }
};
MultiFileOutputChannelModel = __decorate([
    __param(3, IFileService),
    __param(4, IModelService),
    __param(5, ILogService),
    __param(6, IEditorWorkerService),
    __param(7, IInstantiationService)
], MultiFileOutputChannelModel);
export { MultiFileOutputChannelModel };
let OutputChannelBackedByFile = class OutputChannelBackedByFile extends FileOutputChannelModel {
    constructor(id, modelUri, language, file, fileService, modelService, loggerService, instantiationService, logService, editorWorkerService) {
        super(modelUri, language, { resource: file, name: '' }, fileService, modelService, instantiationService, logService, editorWorkerService);
        // Donot rotate to check for the file reset
        this.logger = loggerService.createLogger(file, { logLevel: 'always', donotRotate: true, donotUseFormatters: true, hidden: true });
        this._offset = 0;
    }
    append(message) {
        this.write(message);
        this.update(OutputChannelUpdateMode.Append, undefined, this.isVisible());
    }
    replace(message) {
        const till = this._offset;
        this.write(message);
        this.update(OutputChannelUpdateMode.Replace, till, true);
    }
    write(content) {
        this._offset += VSBuffer.fromString(content).byteLength;
        this.logger.info(content);
        if (this.isVisible()) {
            this.logger.flush();
        }
    }
};
OutputChannelBackedByFile = __decorate([
    __param(4, IFileService),
    __param(5, IModelService),
    __param(6, ILoggerService),
    __param(7, IInstantiationService),
    __param(8, ILogService),
    __param(9, IEditorWorkerService)
], OutputChannelBackedByFile);
let DelegatedOutputChannelModel = class DelegatedOutputChannelModel extends Disposable {
    constructor(id, modelUri, language, outputDir, outputDirCreationPromise, instantiationService, fileService) {
        super();
        this.instantiationService = instantiationService;
        this.fileService = fileService;
        this._onDispose = this._register(new Emitter());
        this.onDispose = this._onDispose.event;
        this.outputChannelModel = this.createOutputChannelModel(id, modelUri, language, outputDir, outputDirCreationPromise);
        const resource = resources.joinPath(outputDir, `${id.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
        this.source = { resource };
    }
    async createOutputChannelModel(id, modelUri, language, outputDir, outputDirPromise) {
        await outputDirPromise;
        const file = resources.joinPath(outputDir, `${id.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
        await this.fileService.createFile(file);
        const outputChannelModel = this._register(this.instantiationService.createInstance(OutputChannelBackedByFile, id, modelUri, language, file));
        this._register(outputChannelModel.onDispose(() => this._onDispose.fire()));
        return outputChannelModel;
    }
    getLogEntries() {
        return [];
    }
    append(output) {
        this.outputChannelModel.then(outputChannelModel => outputChannelModel.append(output));
    }
    update(mode, till, immediate) {
        this.outputChannelModel.then(outputChannelModel => outputChannelModel.update(mode, till, immediate));
    }
    loadModel() {
        return this.outputChannelModel.then(outputChannelModel => outputChannelModel.loadModel());
    }
    clear() {
        this.outputChannelModel.then(outputChannelModel => outputChannelModel.clear());
    }
    replace(value) {
        this.outputChannelModel.then(outputChannelModel => outputChannelModel.replace(value));
    }
    updateChannelSources(files) {
        this.outputChannelModel.then(outputChannelModel => outputChannelModel.updateChannelSources(files));
    }
};
DelegatedOutputChannelModel = __decorate([
    __param(5, IInstantiationService),
    __param(6, IFileService)
], DelegatedOutputChannelModel);
export { DelegatedOutputChannelModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0Q2hhbm5lbE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvb3V0cHV0L2NvbW1vbi9vdXRwdXRDaGFubmVsTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxLQUFLLFNBQVMsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM5RSxPQUFPLEVBQXVCLFlBQVksRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3RILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBZSxpQkFBaUIsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqSSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLGFBQWEsRUFBd0IsTUFBTSxpREFBaUQsQ0FBQztBQUN0RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQVcsY0FBYyxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0Ms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