/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { watch } from 'vs/base/node/pfs';
import { dirname, join } from 'vs/base/common/path';
import * as resources from 'vs/base/common/resources';
import { ITextModel } from 'vs/editor/common/model';
import { URI } from 'vs/base/common/uri';
import { ThrottledDelayer } from 'vs/base/common/async';
import { IFileService } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { toDisposable, IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { IOutputChannelModel, AbstractFileOutputChannelModel, IOutputChannelModelService, AsbtractOutputChannelModelService, BufferredOutputChannel } from 'vs/workbench/services/output/common/outputChannelModel';
import { OutputAppender } from 'vs/workbench/services/output/node/outputAppender';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { toLocalISOString } from 'vs/base/common/date';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Emitter, Event } from 'vs/base/common/event';

let watchingOutputDir = false;
let callbacks: ((eventType: string, fileName?: string) => void)[] = [];
function watchOutputDirectory(outputDir: string, logService: ILogService, onChange: (eventType: string, fileName: string) => void): IDisposable {
	callbacks.push(onChange);
	if (!watchingOutputDir) {
		const watcherDisposable = watch(outputDir, (eventType, fileName) => {
			for (const callback of callbacks) {
				callback(eventType, fileName);
			}
		}, (error: string) => {
			logService.error(error);
		});
		watchingOutputDir = true;
		return toDisposable(() => {
			callbacks = [];
			watcherDisposable.dispose();
		});
	}
	return toDisposable(() => { });
}

class OutputChannelBackedByFile extends AbstractFileOutputChannelModel implements IOutputChannelModel {

	private appender: OutputAppender;
	private appendedMessage: string;
	private loadingFromFileInProgress: boolean;
	private resettingDelayer: ThrottledDelayer<void>;
	private readonly rotatingFilePath: string;

	constructor(
		id: string,
		modelUri: URI,
		mimeType: string,
		file: URI,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@ILogService logService: ILogService
	) {
		super(modelUri, mimeType, file, fileService, modelService, modeService);
		this.appendedMessage = '';
		this.loadingFromFileInProgress = false;

		// Use one rotating file to check for main file reset
		this.appender = new OutputAppender(id, this.file.fsPath);
		this.rotatingFilePath = `${id}.1.log`;
		this._register(watchOutputDirectory(dirname(this.file.fsPath), logService, (eventType, file) => this.onFileChangedInOutputDirector(eventType, file)));

		this.resettingDelayer = new ThrottledDelayer<void>(50);
	}

	append(message: string): void {
		// update end offset always as message is read
		this.endOffset = this.endOffset + Buffer.from(message).byteLength;
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

	clear(till?: number): void {
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
				if (this.endOffset !== this.startOffset + Buffer.from(content).byteLength) {
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
		return this.fileService.resolveContent(this.file, { position: this.startOffset, encoding: 'utf8' })
			.then(content => this.appendedMessage ? content.value + this.appendedMessage : content.value);
	}

	protected updateModel(): void {
		if (this.model && this.appendedMessage) {
			this.appendToModel(this.appendedMessage);
			this.appendedMessage = '';
		}
	}

	private onFileChangedInOutputDirector(eventType: string, fileName?: string): void {
		// Check if rotating file has changed. It changes only when the main file exceeds its limit.
		if (this.rotatingFilePath === fileName) {
			this.resettingDelayer.trigger(() => this.resetModel());
		}
	}

	private write(content: string): void {
		this.appender.append(content);
	}

	private flush(): void {
		this.appender.flush();
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
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.outputChannelModel = this.createOutputChannelModel(id, modelUri, mimeType, outputDir);
	}

	private async createOutputChannelModel(id: string, modelUri: URI, mimeType: string, outputDirPromise: Promise<URI>): Promise<IOutputChannelModel> {
		let outputChannelModel: IOutputChannelModel;
		try {
			const outputDir = await outputDirPromise;
			const file = resources.joinPath(outputDir, `${id}.log`);
			outputChannelModel = this.instantiationService.createInstance(OutputChannelBackedByFile, id, modelUri, mimeType, file);
		} catch (e) {
			// Do not crash if spdlog rotating logger cannot be loaded (workaround for https://github.com/Microsoft/vscode/issues/47883)
			this.logService.error(e);
			/* __GDPR__
				"output.channel.creation.error" : {}
			*/
			this.telemetryService.publicLog('output.channel.creation.error');
			outputChannelModel = this.instantiationService.createInstance(BufferredOutputChannel, modelUri, mimeType);
		}
		this._register(outputChannelModel);
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

export class OutputChannelModelService extends AsbtractOutputChannelModelService implements IOutputChannelModelService {

	_serviceBrand: any;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWindowService private readonly windowService: IWindowService,
		@IFileService private readonly fileService: IFileService
	) {
		super(instantiationService);
	}

	createOutputChannelModel(id: string, modelUri: URI, mimeType: string, file?: URI): IOutputChannelModel {
		return file ? super.createOutputChannelModel(id, modelUri, mimeType, file) :
			this.instantiationService.createInstance(DelegatedOutputChannelModel, id, modelUri, mimeType, this.outputDir);
	}

	private _outputDir: Promise<URI> | null;
	private get outputDir(): Promise<URI> {
		if (!this._outputDir) {
			const outputDir = URI.file(join(this.environmentService.logsPath, `output_${this.windowService.getCurrentWindowId()}_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`));
			this._outputDir = this.fileService.createFolder(outputDir).then(() => outputDir);
		}
		return this._outputDir;
	}

}

registerSingleton(IOutputChannelModelService, OutputChannelModelService);
