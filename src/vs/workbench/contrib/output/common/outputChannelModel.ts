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
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageSelection } from '../../../../editor/common/languages/language.js';
import { Disposable, toDisposable, IDisposable, MutableDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
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

interface IContentProvider {
	readonly onDidAppend: Event<void>;
	readonly onDidReset: Event<void>;
	reset(): void;
	watch(): IDisposable;
	getContent(): Promise<{ readonly content: string; readonly consume: () => void }>;
}

class FileContentProvider extends Disposable implements IContentProvider {

	private readonly _onDidAppend = new Emitter<void>();
	readonly onDidAppend = this._onDidAppend.event;

	private readonly _onDidReset = new Emitter<void>();
	readonly onDidReset = this._onDidReset.event;

	private watching: boolean = false;
	private syncDelayer: ThrottledDelayer<void>;
	private etag: string | undefined = '';

	private startOffset: number = 0;
	private endOffset: number = 0;

	constructor(
		private readonly file: URI,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.syncDelayer = new ThrottledDelayer<void>(500);
		this._register(toDisposable(() => this.unwatch()));
	}

	reset(offset?: number): void {
		this.endOffset = this.startOffset = offset ?? this.startOffset;
	}

	resetToEnd(): void {
		this.startOffset = this.endOffset;
	}

	watch(): IDisposable {
		if (!this.watching) {
			this.logService.trace('Started polling', this.file.toString());
			this.poll(true);
			this.watching = true;
		}
		return toDisposable(() => this.unwatch());
	}

	private unwatch(): void {
		if (this.watching) {
			this.syncDelayer.cancel();
			this.watching = false;
			this.logService.trace('Stopped polling', this.file.toString());
		}
	}

	private poll(immediate?: boolean): void {
		const loop = () => this.doWatch().then(() => this.poll());
		this.syncDelayer.trigger(loop, immediate ? 0 : undefined).catch(error => {
			if (!isCancellationError(error)) {
				throw error;
			}
		});
	}

	private async doWatch(): Promise<void> {
		try {
			const stat = await this.fileService.stat(this.file);
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

	async getContent(): Promise<{ readonly content: string; readonly consume: () => void }> {
		try {
			const content = await this.fileService.readFile(this.file, { position: this.endOffset });
			let consumed = false;
			return {
				content: content.value.toString(),
				consume: () => {
					if (!consumed) {
						consumed = true;
						this.endOffset += content.value.byteLength;
						this.etag = content.etag;
					}
				}
			};
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
			return {
				content: '',
				consume: () => { /* No Op */ }
			};
		}
	}
}

export abstract class AbstractFileOutputChannelModel extends Disposable implements IOutputChannelModel {

	private readonly _onDispose = this._register(new Emitter<void>());
	readonly onDispose: Event<void> = this._onDispose.event;

	private readonly modelDisposable = this._register(new MutableDisposable<DisposableStore>());
	protected model: ITextModel | null = null;
	private modelUpdateInProgress: boolean = false;
	private readonly modelUpdateCancellationSource = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly appendThrottler = this._register(new ThrottledDelayer(300));
	private replacePromise: Promise<void> | undefined;

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
		if (!this.model) {
			this.modelDisposable.value = new DisposableStore();
			this.model = this.modelService.createModel('', this.language, this.modelUri);
			this.outputContentProvider.getContent()
				.then(({ content, consume }) => {
					if (!this.model || !this.modelDisposable.value) {
						return;
					}
					this.doAppendContent(this.model, content);
					consume();
					this.modelDisposable.value.add(this.outputContentProvider.onDidReset(() => this.onDidContentChange(true, true)));
					this.modelDisposable.value.add(this.outputContentProvider.onDidAppend(() => this.onDidContentChange(false, false)));
					this.modelDisposable.value.add(this.outputContentProvider.watch());
				});
			this.modelDisposable.value.add(this.model.onWillDispose(() => {
				this.outputContentProvider.reset();
				this.modelDisposable.value = undefined;
				this.cancelModelUpdate();
				this.model = null;
			}));
		}
		return this.model;
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
			this.doAppendContent(model, content);
			consume();
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

		if (edits.length) {
			/* Apply Edits */
			model.applyEdits(edits);
		}
		consume();
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
}

export class FileOutputChannelModel extends AbstractFileOutputChannelModel implements IOutputChannelModel {

	private readonly fileOutput: FileContentProvider;

	constructor(
		modelUri: URI,
		language: ILanguageSelection,
		file: URI,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@ILogService logService: ILogService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
	) {
		const fileOutput = new FileContentProvider(file, fileService, logService);
		super(modelUri, language, fileOutput, modelService, editorWorkerService);
		this.fileOutput = this._register(fileOutput);
	}

	override clear(): void {
		this.update(OutputChannelUpdateMode.Clear, undefined, true);
	}

	override update(mode: OutputChannelUpdateMode, till: number | undefined, immediate: boolean): void {
		if (mode === OutputChannelUpdateMode.Clear || mode === OutputChannelUpdateMode.Replace) {
			if (isNumber(till)) {
				this.fileOutput.reset(till);
			} else {
				this.fileOutput.resetToEnd();
			}
		}
		this.doUpdate(mode, immediate);
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
