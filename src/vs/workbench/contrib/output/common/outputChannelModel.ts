/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as resources from 'vs/base/common/resources';
import { ITextModel } from 'vs/editor/common/model';
import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { Promises, RunOnceScheduler, ThrottledDelayer } from 'vs/base/common/async';
import { IFileService } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Disposable, toDisposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { isNumber } from 'vs/base/common/types';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { VSBuffer } from 'vs/base/common/buffer';
import { ILogger, ILoggerService, ILogService } from 'vs/platform/log/common/log';

export interface IOutputChannelModel extends IDisposable {
	readonly onDidAppendedContent: Event<void>;
	readonly onDispose: Event<void>;
	append(output: string): void;
	update(): void;
	loadModel(): Promise<ITextModel>;
	clear(till?: number): void;
}

export const IOutputChannelModelService = createDecorator<IOutputChannelModelService>('outputChannelModelService');

export interface IOutputChannelModelService {
	readonly _serviceBrand: undefined;

	createOutputChannelModel(id: string, modelUri: URI, mimeType: string, file?: URI): IOutputChannelModel;

}

export abstract class AbstractOutputChannelModelService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly outputLocation: URI,
		@IFileService protected readonly fileService: IFileService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService
	) { }

	createOutputChannelModel(id: string, modelUri: URI, mimeType: string, file?: URI): IOutputChannelModel {
		return file ? this.instantiationService.createInstance(FileOutputChannelModel, modelUri, mimeType, file) : this.instantiationService.createInstance(DelegatedOutputChannelModel, id, modelUri, mimeType, this.outputDir);
	}

	private _outputDir: Promise<URI> | null = null;
	private get outputDir(): Promise<URI> {
		if (!this._outputDir) {
			this._outputDir = this.fileService.createFolder(this.outputLocation).then(() => this.outputLocation);
		}
		return this._outputDir;
	}

}

export abstract class AbstractFileOutputChannelModel extends Disposable implements IOutputChannelModel {

	protected readonly _onDidAppendedContent = this._register(new Emitter<void>());
	readonly onDidAppendedContent: Event<void> = this._onDidAppendedContent.event;

	protected readonly _onDispose = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	protected modelUpdater: RunOnceScheduler;
	protected model: ITextModel | null = null;

	protected startOffset: number = 0;
	protected endOffset: number = 0;

	constructor(
		private readonly modelUri: URI,
		private readonly mimeType: string,
		protected readonly file: URI,
		protected fileService: IFileService,
		protected modelService: IModelService,
		protected modeService: IModeService,
	) {
		super();
		this.modelUpdater = new RunOnceScheduler(() => this.updateModel(), 300);
		this._register(toDisposable(() => this.modelUpdater.cancel()));
	}

	clear(till?: number): void {
		if (this.modelUpdater.isScheduled()) {
			this.modelUpdater.cancel();
			this.onUpdateModelCancelled();
		}
		if (this.model) {
			this.model.setValue('');
		}
		this.endOffset = isNumber(till) ? till : this.endOffset;
		this.startOffset = this.endOffset;
	}

	update(): void { }

	protected createModel(content: string): ITextModel {
		if (this.model) {
			this.model.setValue(content);
		} else {
			this.model = this.modelService.createModel(content, this.modeService.create(this.mimeType), this.modelUri);
			this.onModelCreated(this.model);
			const disposable = this.model.onWillDispose(() => {
				this.onModelWillDispose(this.model);
				this.model = null;
				dispose(disposable);
			});
		}
		return this.model;
	}

	appendToModel(content: string): void {
		if (this.model && content) {
			const lastLine = this.model.getLineCount();
			const lastLineMaxColumn = this.model.getLineMaxColumn(lastLine);
			this.model.applyEdits([EditOperation.insert(new Position(lastLine, lastLineMaxColumn), content)]);
			this._onDidAppendedContent.fire();
		}
	}

	abstract loadModel(): Promise<ITextModel>;
	abstract append(message: string): void;

	protected onModelCreated(model: ITextModel) { }
	protected onModelWillDispose(model: ITextModel | null) { }
	protected onUpdateModelCancelled() { }
	protected updateModel() { }

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
class FileOutputChannelModel extends AbstractFileOutputChannelModel implements IOutputChannelModel {

	private readonly fileHandler: OutputFileListener;

	private updateInProgress: boolean = false;
	private etag: string | undefined = '';
	private loadModelPromise: Promise<ITextModel> | null = null;

	constructor(
		modelUri: URI,
		mimeType: string,
		file: URI,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@ILogService logService: ILogService
	) {
		super(modelUri, mimeType, file, fileService, modelService, modeService);

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

	protected override updateModel(): void {
		if (this.model) {
			this.fileService.readFile(this.file, { position: this.endOffset })
				.then(content => {
					this.etag = content.etag;
					if (content.value) {
						this.endOffset = this.endOffset + content.value.byteLength;
						this.appendToModel(content.value.toString());
					}
					this.updateInProgress = false;
				}, () => this.updateInProgress = false);
		} else {
			this.updateInProgress = false;
		}
	}

	protected override onModelCreated(model: ITextModel): void {
		this.fileHandler.watch(this.etag);
	}

	protected override onModelWillDispose(model: ITextModel | null): void {
		this.fileHandler.unwatch();
	}

	protected override onUpdateModelCancelled(): void {
		this.updateInProgress = false;
	}

	protected getByteLength(str: string): number {
		return VSBuffer.fromString(str).byteLength;
	}

	override update(size?: number): void {
		if (this.model) {
			if (!this.updateInProgress) {
				this.updateInProgress = true;
				if (isNumber(size) && this.endOffset > size) { // Reset - Content is removed
					this.startOffset = this.endOffset = 0;
					this.model.setValue('');
				}
				this.modelUpdater.schedule();
			}
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
		@ILoggerService loggerService: ILoggerService
	) {
		super(modelUri, mimeType, file, fileService, modelService, modeService);
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
				if (!this.modelUpdater.isScheduled()) {
					this.modelUpdater.schedule();
				}
			}
		}
	}

	override clear(till?: number): void {
		super.clear(till);
		this.appendedMessage = '';
	}

	loadModel(): Promise<ITextModel> {
		this.loadingFromFileInProgress = true;
		if (this.modelUpdater.isScheduled()) {
			this.modelUpdater.cancel();
		}
		this.appendedMessage = '';
		return this.loadFile()
			.then(content => {
				if (this.endOffset !== this.startOffset + VSBuffer.fromString(content).byteLength) {
					// Queue content is not written into the file
					// Flush it and load file again
					this.flush();
					return this.loadFile();
				}
				return content;
			})
			.then(content => {
				if (this.appendedMessage) {
					this.write(this.appendedMessage);
					this.appendedMessage = '';
				}
				this.loadingFromFileInProgress = false;
				return this.createModel(content);
			});
	}

	private resetModel(): Promise<void> {
		this.startOffset = 0;
		this.endOffset = 0;
		if (this.model) {
			return this.loadModel().then(() => undefined);
		}
		return Promise.resolve(undefined);
	}

	private loadFile(): Promise<string> {
		return this.fileService.readFile(this.file, { position: this.startOffset })
			.then(content => this.appendedMessage ? content.value + this.appendedMessage : content.value.toString());
	}

	protected override updateModel(): void {
		if (this.model && this.appendedMessage) {
			this.appendToModel(this.appendedMessage);
			this.appendedMessage = '';
		}
	}

	private write(content: string): void {
		this.logger.info(content);
	}

	private flush(): void {
		this.logger.flush();
	}
}

class DelegatedOutputChannelModel extends Disposable implements IOutputChannelModel {

	private readonly _onDidAppendedContent: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidAppendedContent: Event<void> = this._onDidAppendedContent.event;

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
		this._register(outputChannelModel.onDidAppendedContent(() => this._onDidAppendedContent.fire()));
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

}
