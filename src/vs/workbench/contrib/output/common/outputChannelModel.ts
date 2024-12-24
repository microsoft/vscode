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
import { IFileService } from '../../../../platform/files/common/files.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageSelection } from '../../../../editor/common/languages/language.js';
import { Disposable, toDisposable, IDisposable, dispose, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isNumber } from '../../../../base/common/types.js';
import { EditOperation, ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILogger, ILoggerService, ILogService } from '../../../../platform/log/common/log.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { OutputChannelUpdateMode } from '../../../services/output/common/output.js';
import { isCancellationError } from '../../../../base/common/errors.js';

export interface IOutputChannelModel extends IDisposable {
	readonly onDispose: Event<void>;
	append(output: string): void;
	update(mode: OutputChannelUpdateMode, till: number | undefined, immediate: boolean): void;
	loadModel(): Promise<ITextModel>;
	clear(): void;
	replace(value: string): void;
}

class OutputFileListener extends Disposable {

	private readonly _onDidContentChange = new Emitter<number | undefined>();
	readonly onDidContentChange: Event<number | undefined> = this._onDidContentChange.event;

	private watching: boolean = false;
	private syncDelayer: ThrottledDelayer<void>;
	private etag: string | undefined;

	constructor(
		private readonly file: URI,
		private readonly fileService: IFileService,
		private readonly logService: ILogService
	) {
		super();
		this.syncDelayer = new ThrottledDelayer<void>(500);
	}

	watch(eTag: string | undefined): void {
		if (!this.watching) {
			this.etag = eTag;
			this.poll();
			this.logService.trace('Started polling', this.file.toString());
			this.watching = true;
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
		const stat = await this.fileService.stat(this.file);
		if (stat.etag !== this.etag) {
			this.etag = stat.etag;
			this._onDidContentChange.fire(stat.size);
		}
	}

	unwatch(): void {
		if (this.watching) {
			this.syncDelayer.cancel();
			this.watching = false;
			this.logService.trace('Stopped polling', this.file.toString());
		}
	}

	override dispose(): void {
		this.unwatch();
		super.dispose();
	}
}

export class FileOutputChannelModel extends Disposable implements IOutputChannelModel {

	private readonly _onDispose = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	private readonly fileHandler: OutputFileListener;
	private etag: string | undefined = '';

	private loadModelPromise: Promise<ITextModel> | null = null;
	private model: ITextModel | null = null;
	private modelUpdateInProgress: boolean = false;
	private readonly modelUpdateCancellationSource = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly appendThrottler = this._register(new ThrottledDelayer(300));
	private replacePromise: Promise<void> | undefined;

	private startOffset: number = 0;
	private endOffset: number = 0;

	constructor(
		private readonly modelUri: URI,
		private readonly language: ILanguageSelection,
		private readonly file: URI,
		@IFileService private readonly fileService: IFileService,
		@IModelService private readonly modelService: IModelService,
		@ILogService logService: ILogService,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
	) {
		super();

		this.fileHandler = this._register(new OutputFileListener(this.file, this.fileService, logService));
		this._register(this.fileHandler.onDidContentChange(size => this.onDidContentChange(size)));
		this._register(toDisposable(() => this.fileHandler.unwatch()));
	}

	append(message: string): void {
		throw new Error('Not supported');
	}

	replace(message: string): void {
		throw new Error('Not supported');
	}

	clear(): void {
		this.update(OutputChannelUpdateMode.Clear, this.endOffset, true);
	}

	update(mode: OutputChannelUpdateMode, till: number | undefined, immediate: boolean): void {
		const loadModelPromise: Promise<any> = this.loadModelPromise ? this.loadModelPromise : Promise.resolve();
		loadModelPromise.then(() => this.doUpdate(mode, till, immediate));
	}

	loadModel(): Promise<ITextModel> {
		this.loadModelPromise = Promises.withAsyncBody<ITextModel>(async (c, e) => {
			try {
				let content = '';
				if (await this.fileService.exists(this.file)) {
					const fileContent = await this.fileService.readFile(this.file, { position: this.startOffset });
					this.endOffset = this.startOffset + fileContent.value.byteLength;
					this.etag = fileContent.etag;
					content = fileContent.value.toString();
				} else {
					this.startOffset = 0;
					this.endOffset = 0;
				}
				c(this.createModel(content));
			} catch (error) {
				e(error);
			}
		});
		return this.loadModelPromise;
	}

	private createModel(content: string): ITextModel {
		if (this.model) {
			this.model.setValue(content);
		} else {
			this.model = this.modelService.createModel(content, this.language, this.modelUri);
			this.fileHandler.watch(this.etag);
			const disposable = this.model.onWillDispose(() => {
				this.cancelModelUpdate();
				this.fileHandler.unwatch();
				this.model = null;
				dispose(disposable);
			});
		}
		return this.model;
	}

	private doUpdate(mode: OutputChannelUpdateMode, till: number | undefined, immediate: boolean): void {
		if (mode === OutputChannelUpdateMode.Clear || mode === OutputChannelUpdateMode.Replace) {
			this.startOffset = this.endOffset = isNumber(till) ? till : this.endOffset;
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
		this.doUpdateModel(model, [EditOperation.delete(model.getFullModelRange())], VSBuffer.fromString(''));
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
			const contentToAppend = await this.getContentToUpdate();
			/* Abort if operation is cancelled */
			if (token.isCancellationRequested) {
				return;
			}

			/* Appned Content */
			const lastLine = model.getLineCount();
			const lastLineMaxColumn = model.getLineMaxColumn(lastLine);
			const edits = [EditOperation.insert(new Position(lastLine, lastLineMaxColumn), contentToAppend.toString())];
			this.doUpdateModel(model, edits, contentToAppend);
		}, immediate ? 0 : undefined).catch(error => {
			if (!isCancellationError(error)) {
				throw error;
			}
		});
	}

	private async replaceContent(model: ITextModel, token: CancellationToken): Promise<void> {
		/* Get content to replace */
		const contentToReplace = await this.getContentToUpdate();
		/* Abort if operation is cancelled */
		if (token.isCancellationRequested) {
			return;
		}

		/* Compute Edits */
		const edits = await this.getReplaceEdits(model, contentToReplace.toString());
		/* Abort if operation is cancelled */
		if (token.isCancellationRequested) {
			return;
		}

		/* Apply Edits */
		this.doUpdateModel(model, edits, contentToReplace);
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

	private doUpdateModel(model: ITextModel, edits: ISingleEditOperation[], content: VSBuffer): void {
		if (edits.length) {
			model.applyEdits(edits);
		}
		this.endOffset = this.endOffset + content.byteLength;
		this.modelUpdateInProgress = false;
	}

	protected cancelModelUpdate(): void {
		this.modelUpdateCancellationSource.value?.cancel();
		this.modelUpdateCancellationSource.value = undefined;
		this.appendThrottler.cancel();
		this.replacePromise = undefined;
		this.modelUpdateInProgress = false;
	}

	private async getContentToUpdate(): Promise<VSBuffer> {
		const content = await this.fileService.readFile(this.file, { position: this.endOffset });
		this.etag = content.etag;
		return content.value;
	}

	private onDidContentChange(size: number | undefined): void {
		if (this.model) {
			if (!this.modelUpdateInProgress) {
				if (isNumber(size) && this.endOffset > size) {
					// Reset - Content is removed
					this.update(OutputChannelUpdateMode.Clear, 0, true);
				}
			}
			this.update(OutputChannelUpdateMode.Append, undefined, false /* Not needed to update immediately. Wait to collect more changes and update. */);
		}
	}

	protected isVisible(): boolean {
		return !!this.model;
	}

	override dispose(): void {
		this._onDispose.fire();
		super.dispose();
	}
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
		@ILogService logService: ILogService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(modelUri, language, file, fileService, modelService, logService, editorWorkerService);

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

	constructor(
		id: string,
		modelUri: URI,
		language: ILanguageSelection,
		outputDir: Promise<URI>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this.outputChannelModel = this.createOutputChannelModel(id, modelUri, language, outputDir);
	}

	private async createOutputChannelModel(id: string, modelUri: URI, language: ILanguageSelection, outputDirPromise: Promise<URI>): Promise<IOutputChannelModel> {
		const outputDir = await outputDirPromise;
		const file = resources.joinPath(outputDir, `${id.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
		await this.fileService.createFile(file);
		const outputChannelModel = this._register(this.instantiationService.createInstance(OutputChannelBackedByFile, id, modelUri, language, file));
		this._register(outputChannelModel.onDispose(() => this._onDispose.fire()));
		return outputChannelModel;
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
}
