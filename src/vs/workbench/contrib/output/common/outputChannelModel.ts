/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as resources from 'vs/base/common/resources';
import { IIdentifiedSingleEditOperation, ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { Promises, ThrottledDelayer } from 'vs/base/common/async';
import { IFileService } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Disposable, toDisposable, IDisposable, dispose, MutableDisposable } from 'vs/base/common/lifecycle';
import { isNumber } from 'vs/base/common/types';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { VSBuffer } from 'vs/base/common/buffer';
import { ILogger, ILoggerService, ILogService } from 'vs/platform/log/common/log';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';

export interface IOutputChannelModel extends IDisposable {
	readonly onDispose: Event<void>;
	append(output: string): void;
	update(): void;
	loadModel(): Promise<ITextModel>;
	clear(till?: number): void;
	replaceAll(till: number, value?: string): void;
}

const enum ModelUpdateMode {
	Append = 1,
	Replace,
	Clear
}

export abstract class AbstractFileOutputChannelModel extends Disposable implements IOutputChannelModel {

	protected readonly _onDispose = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	protected model: ITextModel | null = null;
	private modelUpdateInProgress: boolean = false;
	private modelUpdateCancellationSource = this._register(new MutableDisposable<CancellationTokenSource>());
	private appendThrottler = this._register(new ThrottledDelayer(300));
	private replacePromise: Promise<void> | undefined;

	protected startOffset: number = 0;
	protected endOffset: number = 0;

	constructor(
		private readonly modelUri: URI,
		private readonly mimeType: string,
		protected readonly file: URI,
		protected fileService: IFileService,
		protected modelService: IModelService,
		protected modeService: IModeService,
		protected editorWorkerService: IEditorWorkerService,
	) {
		super();
	}

	clear(till?: number): void {
		this.startOffset = this.endOffset = isNumber(till) ? till : this.endOffset;
		this.updateModel(ModelUpdateMode.Clear);
	}

	replaceAll(till: number, message: string): void {
		this.startOffset = this.endOffset = till;
		this.updateModel(ModelUpdateMode.Replace);
	}

	update(): void { }

	protected createModel(content: string): ITextModel {
		if (this.model) {
			this.model.setValue(content);
		} else {
			this.model = this.modelService.createModel(content, this.modeService.create(this.mimeType), this.modelUri);
			this.onModelCreated(this.model);
			const disposable = this.model.onWillDispose(() => {
				this.cancelModelUpdate();
				this.onModelWillDispose(this.model);
				this.model = null;
				dispose(disposable);
			});
		}
		return this.model;
	}

	protected updateModel(mode: ModelUpdateMode): void {
		if (mode !== ModelUpdateMode.Append) {
			this.cancelModelUpdate();
		}
		if (!this.model) {
			return;
		}
		if (!this.modelUpdateCancellationSource.value) {
			this.modelUpdateCancellationSource.value = new CancellationTokenSource();
		}
		this.modelUpdateInProgress = true;
		const token = this.modelUpdateCancellationSource.value.token;
		switch (mode) {
			case ModelUpdateMode.Clear:
				this.clearContent(this.model);
				break;
			case ModelUpdateMode.Replace:
				this.replacePromise = this.replaceContent(this.model, token).finally(() => this.replacePromise = undefined);
				break;
			case ModelUpdateMode.Append:
				this.appendContent(this.model, token);
				break;
		}
	}

	private clearContent(model: ITextModel): void {
		this.doUpdateModel(model, [EditOperation.delete(model.getFullModelRange())], VSBuffer.fromString(''));
	}

	private async appendContent(model: ITextModel, token: CancellationToken): Promise<void> {
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

	private async getReplaceEdits(model: ITextModel, contentToReplace: string): Promise<IIdentifiedSingleEditOperation[]> {
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

	private doUpdateModel(model: ITextModel, edits: IIdentifiedSingleEditOperation[], content: VSBuffer): void {
		if (edits.length) {
			model.applyEdits(edits);
		}
		this.modelUpdateInProgress = false;
		this.onDidModelUpdate(content);
	}

	protected cancelModelUpdate(): void {
		if (this.modelUpdateCancellationSource.value) {
			this.modelUpdateCancellationSource.value.cancel();
		}
		this.modelUpdateCancellationSource.value = undefined;
		this.appendThrottler.cancel();
		this.replacePromise = undefined;
		this.modelUpdateInProgress = false;
	}

	protected isModelUpdateInProgress(): boolean {
		return this.modelUpdateInProgress;
	}

	abstract loadModel(): Promise<ITextModel>;
	abstract append(message: string): void;

	protected onModelCreated(model: ITextModel) { }
	protected onModelWillDispose(model: ITextModel | null) { }
	protected abstract getContentToUpdate(): Promise<VSBuffer>;
	protected abstract onDidModelUpdate(content: VSBuffer): void;

	override dispose(): void {
		this._onDispose.fire();
		super.dispose();
	}
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
		this.syncDelayer.trigger(loop);
	}

	private async doWatch(): Promise<void> {
		const stat = await this.fileService.resolve(this.file, { resolveMetadata: true });
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

/**
 * An output channel driven by a file and does not support appending messages.
 */
export class FileOutputChannelModel extends AbstractFileOutputChannelModel implements IOutputChannelModel {

	private readonly fileHandler: OutputFileListener;

	private etag: string | undefined = '';
	private loadModelPromise: Promise<ITextModel> | null = null;

	constructor(
		modelUri: URI,
		mimeType: string,
		file: URI,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@ILogService logService: ILogService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(modelUri, mimeType, file, fileService, modelService, modeService, editorWorkerService);

		this.fileHandler = this._register(new OutputFileListener(this.file, this.fileService, logService));
		this._register(this.fileHandler.onDidContentChange(size => this.update(size)));
		this._register(toDisposable(() => this.fileHandler.unwatch()));
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

	override clear(till?: number): void {
		const loadModelPromise: Promise<any> = this.loadModelPromise ? this.loadModelPromise : Promise.resolve();
		loadModelPromise.then(() => {
			super.clear(till);
			this.update();
		});
	}

	append(message: string): void {
		throw new Error('Not supported');
	}

	protected async getContentToUpdate(): Promise<VSBuffer> {
		const content = await this.fileService.readFile(this.file, { position: this.endOffset });
		this.etag = content.etag;
		return content.value;
	}

	protected override onDidModelUpdate(content: VSBuffer): void {
		this.endOffset = this.endOffset + content.byteLength;
	}

	protected override onModelCreated(model: ITextModel): void {
		this.fileHandler.watch(this.etag);
	}

	protected override onModelWillDispose(model: ITextModel | null): void {
		this.fileHandler.unwatch();
	}

	override update(size?: number): void {
		if (this.model) {
			if (!this.isModelUpdateInProgress()) {
				if (isNumber(size) && this.endOffset > size) {
					// Reset - Content is removed
					this.startOffset = this.endOffset = 0;
					this.updateModel(ModelUpdateMode.Clear);
				}
			}
			this.updateModel(ModelUpdateMode.Append);
		}
	}
}

class OutputChannelBackedByFile extends AbstractFileOutputChannelModel implements IOutputChannelModel {

	private logger: ILogger;
	private appendedMessage: string;
	private loadingFromFileInProgress: boolean;
	private resettingDelayer: ThrottledDelayer<void>;
	private readonly rotatingFilePath: URI;

	constructor(
		id: string,
		modelUri: URI,
		mimeType: string,
		file: URI,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@ILoggerService loggerService: ILoggerService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(modelUri, mimeType, file, fileService, modelService, modeService, editorWorkerService);
		this.appendedMessage = '';
		this.loadingFromFileInProgress = false;

		// Donot rotate to check for the file reset
		this.logger = loggerService.createLogger(this.file, { always: true, donotRotate: true, donotUseFormatters: true });

		const rotatingFilePathDirectory = resources.dirname(this.file);
		this.rotatingFilePath = resources.joinPath(rotatingFilePathDirectory, `${id}.1.log`);

		this._register(fileService.watch(rotatingFilePathDirectory));
		this._register(fileService.onDidFilesChange(e => {
			if (e.contains(this.rotatingFilePath)) {
				this.resettingDelayer.trigger(() => this.resetModel());
			}
		}));

		this.resettingDelayer = new ThrottledDelayer<void>(50);
	}

	append(message: string): void {
		// update end offset always as message is read
		this.endOffset = this.endOffset + VSBuffer.fromString(message).byteLength;
		if (this.loadingFromFileInProgress) {
			this.appendedMessage += message;
		} else {
			this.write(message);
			if (this.model) {
				this.appendedMessage += message;
				this.updateModel(ModelUpdateMode.Append);
			}
		}
	}

	override replaceAll(till: number, value: string): void {
		this.appendedMessage = value;
		super.replaceAll(till, value);
	}

	override clear(till?: number): void {
		super.clear(till);
		this.appendedMessage = '';
	}

	async loadModel(): Promise<ITextModel> {
		this.loadingFromFileInProgress = true;
		this.cancelModelUpdate();
		this.appendedMessage = '';
		let content = await this.loadFile();
		if (this.endOffset !== this.startOffset + VSBuffer.fromString(content).byteLength) {
			// Queue content is not written into the file
			// Flush it and load file again
			this.flush();
			content = await this.loadFile();
		}
		if (this.appendedMessage) {
			this.write(this.appendedMessage);
			this.appendedMessage = '';
		}
		this.loadingFromFileInProgress = false;
		return this.createModel(content);
	}

	private async resetModel(): Promise<void> {
		this.startOffset = 0;
		this.endOffset = 0;
		if (this.model) {
			await this.loadModel();
		}
	}

	private async loadFile(): Promise<string> {
		const content = await this.fileService.readFile(this.file, { position: this.startOffset });
		return this.appendedMessage ? content.value + this.appendedMessage : content.value.toString();
	}

	protected async getContentToUpdate(): Promise<VSBuffer> {
		return VSBuffer.fromString(this.appendedMessage);
	}

	protected override onDidModelUpdate(content: VSBuffer): void {
		this.appendedMessage = '';
	}

	private write(content: string): void {
		this.logger.info(content);
	}

	private flush(): void {
		this.logger.flush();
	}
}

export class DelegatedOutputChannelModel extends Disposable implements IOutputChannelModel {

	private readonly _onDispose: Emitter<void> = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	private readonly outputChannelModel: Promise<IOutputChannelModel>;

	constructor(
		id: string,
		modelUri: URI,
		mimeType: string,
		outputDir: Promise<URI>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this.outputChannelModel = this.createOutputChannelModel(id, modelUri, mimeType, outputDir);
	}

	private async createOutputChannelModel(id: string, modelUri: URI, mimeType: string, outputDirPromise: Promise<URI>): Promise<IOutputChannelModel> {
		const outputDir = await outputDirPromise;
		const file = resources.joinPath(outputDir, `${id.replace(/[\\/:\*\?"<>\|]/g, '')}.log`);
		await this.fileService.createFile(file);
		const outputChannelModel = this._register(this.instantiationService.createInstance(OutputChannelBackedByFile, id, modelUri, mimeType, file));
		this._register(outputChannelModel.onDispose(() => this._onDispose.fire()));
		return outputChannelModel;
	}

	append(output: string): void {
		this.outputChannelModel.then(outputChannelModel => outputChannelModel.append(output));
	}

	update(): void {
		this.outputChannelModel.then(outputChannelModel => outputChannelModel.update());
	}

	loadModel(): Promise<ITextModel> {
		return this.outputChannelModel.then(outputChannelModel => outputChannelModel.loadModel());
	}

	clear(till?: number): void {
		this.outputChannelModel.then(outputChannelModel => outputChannelModel.clear(till));
	}

	replaceAll(till: number, value: string): void {
		this.outputChannelModel.then(outputChannelModel => outputChannelModel.replaceAll(till, value));
	}
}
