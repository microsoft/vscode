/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguageDetectionService } from 'vs/workbench/services/languageDetection/common/languageDetectionWorkerService';
import { FileAccess } from 'vs/base/common/network';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IModeService } from 'vs/editor/common/services/modeService';
import { URI } from 'vs/base/common/uri';
import { isWeb } from 'vs/base/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { LanguageDetectionSimpleWorker } from 'vs/workbench/services/languageDetection/browser/languageDetectionSimpleWorker';
import { IModelService } from 'vs/editor/common/services/modelService';
import { SimpleWorkerClient } from 'vs/base/common/worker/simpleWorker';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { EditorWorkerClient, EditorWorkerHost } from 'vs/editor/common/services/editorWorkerServiceImpl';

const moduleLocation = '../../../../../../node_modules/@vscode/vscode-languagedetection';
const moduleLocationAsar = '../../../../../../node_modules.asar/@vscode/vscode-languagedetection';
export class LanguageDetectionService extends Disposable implements ILanguageDetectionService {
	static readonly enablementSettingKey = 'workbench.editor.untitled.experimentalLanguageDetection';

	_serviceBrand: undefined;

	private _languageDetectionWorkerClient: LanguageDetectionWorkerClient;

	constructor(
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IModeService private readonly _modeService: IModeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IModelService modelService: IModelService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		this._languageDetectionWorkerClient = new LanguageDetectionWorkerClient(
			modelService,
			telemetryService,
			// TODO: See if it's possible to bundle vscode-languagedetection
			this._environmentService.isBuilt && !isWeb
				? FileAccess.asBrowserUri(`${moduleLocationAsar}/dist/lib/index.js`, require).toString(true)
				: FileAccess.asBrowserUri(`${moduleLocation}/dist/lib/index.js`, require).toString(true),
			this._environmentService.isBuilt && !isWeb
				? FileAccess.asBrowserUri(`${moduleLocationAsar}/model/model.json`, require).toString(true)
				: FileAccess.asBrowserUri(`${moduleLocation}/model/model.json`, require).toString(true),
			this._environmentService.isBuilt && !isWeb
				? FileAccess.asBrowserUri(`${moduleLocationAsar}/model/group1-shard1of1.bin`, require).toString(true)
				: FileAccess.asBrowserUri(`${moduleLocation}/model/group1-shard1of1.bin`, require).toString(true));
	}

	public isEnabledForMode(modeId: string): boolean {
		return !!modeId && this._configurationService.getValue<boolean>(LanguageDetectionService.enablementSettingKey, { overrideIdentifier: modeId });
	}

	private getModeId(language: string | undefined): string | undefined {
		if (!language) {
			return undefined;
		}
		return this._modeService.getModeIdByFilepathOrFirstLine(URI.file(`file.${language}`)) ?? undefined;
	}

	async detectLanguage(resource: URI): Promise<string | undefined> {
		const language = await this._languageDetectionWorkerClient.detectLanguage(resource);
		if (language) {
			return this.getModeId(language);
		}
		return undefined;
	}

	async detectLanguages(resource: URI): Promise<string[]> {
		const languages: Array<string | undefined> = await this._languageDetectionWorkerClient.detectLanguages(resource);
		for (let i = 0; i < languages.length; i++) {
			const modeId = this.getModeId(languages[i]);
			languages[i] = modeId ? modeId : undefined;
		}

		return languages.filter(<T>(l?: T): l is T => Boolean(l));
	}
}

export interface IWorkerClient<W> {
	getProxyObject(): Promise<W>;
	dispose(): void;
}

export class LanguageDetectionWorkerHost {
	constructor(
		private _indexJsUri: string,
		private _modelJsonUri: string,
		private _weightsUri: string,
		private _telemetryService: ITelemetryService,
	) {
	}

	async getIndexJsUri() {
		return this._indexJsUri;
	}

	async getModelJsonUri() {
		return this._modelJsonUri;
	}

	async getWeightsUri() {
		return this._weightsUri;
	}

	async sendTelemetryEvent(languages: string[], confidences: number[], timeSpent: number): Promise<void> {
		type LanguageDetectionStats = { languages: string; confidences: string; timeSpent: number; };
		type LanguageDetectionStatsClassification = {
			languages: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			confidences: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			timeSpent: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
		};

		this._telemetryService.publicLog2<LanguageDetectionStats, LanguageDetectionStatsClassification>('automaticlanguagedetection.stats', {
			languages: languages.join(','),
			confidences: confidences.join(','),
			timeSpent
		});
	}
}

export class LanguageDetectionWorkerClient extends EditorWorkerClient {
	private worker: IWorkerClient<LanguageDetectionSimpleWorker> | undefined;

	constructor(
		modelService: IModelService,
		private readonly _telemetryService: ITelemetryService,
		private readonly _indexJsUri: string,
		private readonly _modelJsonUri: string,
		private readonly _weightsUri: string) {
		super(modelService, true, 'languageDetectionWorkerService');


	}

	private _getOrCreateLanguageDetectionWorker(): IWorkerClient<LanguageDetectionSimpleWorker> {
		if (!this.worker) {

			this.worker = this._register(new SimpleWorkerClient<LanguageDetectionSimpleWorker, EditorWorkerHost>(
				this._workerFactory,
				'vs/workbench/services/languageDetection/browser/languageDetectionSimpleWorker',
				new EditorWorkerHost(this)
			));
		}
		return this.worker;
	}

	override async _getProxy(): Promise<LanguageDetectionSimpleWorker> {
		return await this._getOrCreateLanguageDetectionWorker().getProxyObject();
	}

	// foreign host request
	public override fhr(method: string, args: any[]): Promise<any> {
		switch (method) {
			case 'getIndexJsUri':
				return Promise.resolve(this.getIndexJsUri());
			case 'getModelJsonUri':
				return Promise.resolve(this.getModelJsonUri());
			case 'getWeightsUri':
				return Promise.resolve(this.getWeightsUri());
			case 'sendTelemetryEvent':
				return Promise.resolve(this.sendTelemetryEvent(args[0], args[1], args[2]));
			default:
				return super.fhr(method, args);
		}
	}

	async getIndexJsUri() {
		return this._indexJsUri;
	}

	async getModelJsonUri() {
		return this._modelJsonUri;
	}

	async getWeightsUri() {
		return this._weightsUri;
	}

	async sendTelemetryEvent(languages: string[], confidences: number[], timeSpent: number): Promise<void> {
		type LanguageDetectionStats = { languages: string; confidences: string; timeSpent: number; };
		type LanguageDetectionStatsClassification = {
			languages: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			confidences: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			timeSpent: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
		};

		this._telemetryService.publicLog2<LanguageDetectionStats, LanguageDetectionStatsClassification>('automaticlanguagedetection.stats', {
			languages: languages.join(','),
			confidences: confidences.join(','),
			timeSpent
		});
	}

	public async detectLanguage(resource: URI): Promise<string | undefined> {
		await this._withSyncedResources([resource]);
		return (await this._getProxy()).detectLanguage(resource.toString());
	}
	public async detectLanguages(resource: URI): Promise<string[]> {
		await this._withSyncedResources([resource]);
		return (await this._getProxy()).detectLanguages(resource.toString());
	}
}

registerSingleton(ILanguageDetectionService, LanguageDetectionService);
