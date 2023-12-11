/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguageDetectionService, ILanguageDetectionStats, LanguageDetectionStatsClassification, LanguageDetectionStatsId } from 'vs/workbench/services/languageDetection/common/languageDetectionWorkerService';
import { AppResourcePath, FileAccess, nodeModulesAsarPath, nodeModulesPath, Schemas } from 'vs/base/common/network';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { URI } from 'vs/base/common/uri';
import { isWeb } from 'vs/base/common/platform';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { LanguageDetectionSimpleWorker } from 'vs/workbench/services/languageDetection/browser/languageDetectionSimpleWorker';
import { IModelService } from 'vs/editor/common/services/model';
import { SimpleWorkerClient } from 'vs/base/common/worker/simpleWorker';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { EditorWorkerClient, EditorWorkerHost } from 'vs/editor/browser/services/editorWorkerService';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { IDiagnosticsService } from 'vs/platform/diagnostics/common/diagnostics';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { LRUCache } from 'vs/base/common/map';
import { ILogService } from 'vs/platform/log/common/log';

const TOP_LANG_COUNTS = 12;

const regexpModuleLocation: AppResourcePath = `${nodeModulesPath}/vscode-regexp-languagedetection`;
const regexpModuleLocationAsar: AppResourcePath = `${nodeModulesAsarPath}/vscode-regexp-languagedetection`;
const moduleLocation: AppResourcePath = `${nodeModulesPath}/@vscode/vscode-languagedetection`;
const moduleLocationAsar: AppResourcePath = `${nodeModulesAsarPath}/@vscode/vscode-languagedetection`;

export class LanguageDetectionService extends Disposable implements ILanguageDetectionService {
	static readonly enablementSettingKey = 'workbench.editor.languageDetection';
	static readonly historyBasedEnablementConfig = 'workbench.editor.historyBasedLanguageDetection';
	static readonly preferHistoryConfig = 'workbench.editor.preferHistoryBasedLanguageDetection';
	static readonly workspaceOpenedLanguagesStorageKey = 'workbench.editor.languageDetectionOpenedLanguages.workspace';
	static readonly globalOpenedLanguagesStorageKey = 'workbench.editor.languageDetectionOpenedLanguages.global';

	_serviceBrand: undefined;

	private _languageDetectionWorkerClient: LanguageDetectionWorkerClient;

	private hasResolvedWorkspaceLanguageIds = false;
	private workspaceLanguageIds = new Set<string>();
	private sessionOpenedLanguageIds = new Set<string>();
	private historicalGlobalOpenedLanguageIds = new LRUCache<string, true>(TOP_LANG_COUNTS);
	private historicalWorkspaceOpenedLanguageIds = new LRUCache<string, true>(TOP_LANG_COUNTS);
	private dirtyBiases: boolean = true;
	private langBiases: Record<string, number> = {};

	constructor(
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ILanguageService languageService: ILanguageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDiagnosticsService private readonly _diagnosticsService: IDiagnosticsService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IModelService modelService: IModelService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService
	) {
		super();

		this._languageDetectionWorkerClient = this._register(new LanguageDetectionWorkerClient(
			modelService,
			languageService,
			telemetryService,
			// TODO: See if it's possible to bundle vscode-languagedetection
			this._environmentService.isBuilt && !isWeb
				? FileAccess.asBrowserUri(`${moduleLocationAsar}/dist/lib/index.js`).toString(true)
				: FileAccess.asBrowserUri(`${moduleLocation}/dist/lib/index.js`).toString(true),
			this._environmentService.isBuilt && !isWeb
				? FileAccess.asBrowserUri(`${moduleLocationAsar}/model/model.json`).toString(true)
				: FileAccess.asBrowserUri(`${moduleLocation}/model/model.json`).toString(true),
			this._environmentService.isBuilt && !isWeb
				? FileAccess.asBrowserUri(`${moduleLocationAsar}/model/group1-shard1of1.bin`).toString(true)
				: FileAccess.asBrowserUri(`${moduleLocation}/model/group1-shard1of1.bin`).toString(true),
			this._environmentService.isBuilt && !isWeb
				? FileAccess.asBrowserUri(`${regexpModuleLocationAsar}/dist/index.js`).toString(true)
				: FileAccess.asBrowserUri(`${regexpModuleLocation}/dist/index.js`).toString(true),
			languageConfigurationService
		));

		this.initEditorOpenedListeners(storageService);
	}

	private async resolveWorkspaceLanguageIds() {
		if (this.hasResolvedWorkspaceLanguageIds) { return; }
		this.hasResolvedWorkspaceLanguageIds = true;
		const fileExtensions = await this._diagnosticsService.getWorkspaceFileExtensions(this._workspaceContextService.getWorkspace());

		let count = 0;
		for (const ext of fileExtensions.extensions) {
			const langId = this._languageDetectionWorkerClient.getLanguageId(ext);
			if (langId && count < TOP_LANG_COUNTS) {
				this.workspaceLanguageIds.add(langId);
				count++;
				if (count > TOP_LANG_COUNTS) { break; }
			}
		}
		this.dirtyBiases = true;
	}

	public isEnabledForLanguage(languageId: string): boolean {
		return !!languageId && this._configurationService.getValue<boolean>(LanguageDetectionService.enablementSettingKey, { overrideIdentifier: languageId });
	}


	private getLanguageBiases(): Record<string, number> {
		if (!this.dirtyBiases) { return this.langBiases; }

		const biases: Record<string, number> = {};

		// Give different weight to the biases depending on relevance of source
		this.sessionOpenedLanguageIds.forEach(lang =>
			biases[lang] = (biases[lang] ?? 0) + 7);

		this.workspaceLanguageIds.forEach(lang =>
			biases[lang] = (biases[lang] ?? 0) + 5);

		[...this.historicalWorkspaceOpenedLanguageIds.keys()].forEach(lang =>
			biases[lang] = (biases[lang] ?? 0) + 3);

		[...this.historicalGlobalOpenedLanguageIds.keys()].forEach(lang =>
			biases[lang] = (biases[lang] ?? 0) + 1);

		this._logService.trace('Session Languages:', JSON.stringify([...this.sessionOpenedLanguageIds]));
		this._logService.trace('Workspace Languages:', JSON.stringify([...this.workspaceLanguageIds]));
		this._logService.trace('Historical Workspace Opened Languages:', JSON.stringify([...this.historicalWorkspaceOpenedLanguageIds.keys()]));
		this._logService.trace('Historical Globally Opened Languages:', JSON.stringify([...this.historicalGlobalOpenedLanguageIds.keys()]));
		this._logService.trace('Computed Language Detection Biases:', JSON.stringify(biases));
		this.dirtyBiases = false;
		this.langBiases = biases;
		return biases;
	}

	async detectLanguage(resource: URI, supportedLangs?: string[]): Promise<string | undefined> {
		const useHistory = this._configurationService.getValue<string[]>(LanguageDetectionService.historyBasedEnablementConfig);
		const preferHistory = this._configurationService.getValue<boolean>(LanguageDetectionService.preferHistoryConfig);
		if (useHistory) {
			await this.resolveWorkspaceLanguageIds();
		}
		const biases = useHistory ? this.getLanguageBiases() : undefined;
		return this._languageDetectionWorkerClient.detectLanguage(resource, biases, preferHistory, supportedLangs);
	}

	// TODO: explore using the history service or something similar to provide this list of opened editors
	// so this service can support delayed instantiation. This may be tricky since it seems the IHistoryService
	// only gives history for a workspace... where this takes advantage of history at a global level as well.
	private initEditorOpenedListeners(storageService: IStorageService) {
		try {
			const globalLangHistoryData = JSON.parse(storageService.get(LanguageDetectionService.globalOpenedLanguagesStorageKey, StorageScope.PROFILE, '[]'));
			this.historicalGlobalOpenedLanguageIds.fromJSON(globalLangHistoryData);
		} catch (e) { console.error(e); }

		try {
			const workspaceLangHistoryData = JSON.parse(storageService.get(LanguageDetectionService.workspaceOpenedLanguagesStorageKey, StorageScope.WORKSPACE, '[]'));
			this.historicalWorkspaceOpenedLanguageIds.fromJSON(workspaceLangHistoryData);
		} catch (e) { console.error(e); }

		this._register(this._editorService.onDidActiveEditorChange(() => {
			const activeLanguage = this._editorService.activeTextEditorLanguageId;
			if (activeLanguage && this._editorService.activeEditor?.resource?.scheme !== Schemas.untitled) {
				this.sessionOpenedLanguageIds.add(activeLanguage);
				this.historicalGlobalOpenedLanguageIds.set(activeLanguage, true);
				this.historicalWorkspaceOpenedLanguageIds.set(activeLanguage, true);
				storageService.store(LanguageDetectionService.globalOpenedLanguagesStorageKey, JSON.stringify(this.historicalGlobalOpenedLanguageIds.toJSON()), StorageScope.PROFILE, StorageTarget.MACHINE);
				storageService.store(LanguageDetectionService.workspaceOpenedLanguagesStorageKey, JSON.stringify(this.historicalWorkspaceOpenedLanguageIds.toJSON()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
				this.dirtyBiases = true;
			}
		}));
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
		type LanguageDetectionStats = { languages: string; confidences: string; timeSpent: number };
		type LanguageDetectionStatsClassification = {
			owner: 'TylerLeonhardt';
			comment: 'Helps understand how effective language detection is via confidences and how long it takes to run';
			languages: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The languages that are guessed' };
			confidences: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The confidences of each language guessed' };
			timeSpent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The time it took to run language detection' };
		};

		this._telemetryService.publicLog2<LanguageDetectionStats, LanguageDetectionStatsClassification>('automaticlanguagedetection.stats', {
			languages: languages.join(','),
			confidences: confidences.join(','),
			timeSpent
		});
	}
}

export class LanguageDetectionWorkerClient extends EditorWorkerClient {
	private workerPromise: Promise<IWorkerClient<LanguageDetectionSimpleWorker>> | undefined;

	constructor(
		modelService: IModelService,
		private readonly _languageService: ILanguageService,
		private readonly _telemetryService: ITelemetryService,
		private readonly _indexJsUri: string,
		private readonly _modelJsonUri: string,
		private readonly _weightsUri: string,
		private readonly _regexpModelUri: string,
		languageConfigurationService: ILanguageConfigurationService,
	) {
		super(modelService, true, 'languageDetectionWorkerService', languageConfigurationService);
	}

	private _getOrCreateLanguageDetectionWorker(): Promise<IWorkerClient<LanguageDetectionSimpleWorker>> {
		if (this.workerPromise) {
			return this.workerPromise;
		}

		this.workerPromise = new Promise((resolve, reject) => {
			resolve(this._register(new SimpleWorkerClient<LanguageDetectionSimpleWorker, EditorWorkerHost>(
				this._workerFactory,
				'vs/workbench/services/languageDetection/browser/languageDetectionSimpleWorker',
				new EditorWorkerHost(this)
			)));
		});

		return this.workerPromise;
	}

	private _guessLanguageIdByUri(uri: URI): string | undefined {
		const guess = this._languageService.guessLanguageIdByFilepathOrFirstLine(uri);
		if (guess && guess !== 'unknown') {
			return guess;
		}
		return undefined;
	}

	protected override async _getProxy(): Promise<LanguageDetectionSimpleWorker> {
		return (await this._getOrCreateLanguageDetectionWorker()).getProxyObject();
	}

	// foreign host request
	public override async fhr(method: string, args: any[]): Promise<any> {
		switch (method) {
			case 'getIndexJsUri':
				return this.getIndexJsUri();
			case 'getModelJsonUri':
				return this.getModelJsonUri();
			case 'getWeightsUri':
				return this.getWeightsUri();
			case 'getRegexpModelUri':
				return this.getRegexpModelUri();
			case 'getLanguageId':
				return this.getLanguageId(args[0]);
			case 'sendTelemetryEvent':
				return this.sendTelemetryEvent(args[0], args[1], args[2]);
			default:
				return super.fhr(method, args);
		}
	}

	async getIndexJsUri() {
		return this._indexJsUri;
	}

	getLanguageId(languageIdOrExt: string | undefined) {
		if (!languageIdOrExt) {
			return undefined;
		}
		if (this._languageService.isRegisteredLanguageId(languageIdOrExt)) {
			return languageIdOrExt;
		}
		const guessed = this._guessLanguageIdByUri(URI.file(`file.${languageIdOrExt}`));
		if (!guessed || guessed === 'unknown') {
			return undefined;
		}
		return guessed;
	}

	async getModelJsonUri() {
		return this._modelJsonUri;
	}

	async getWeightsUri() {
		return this._weightsUri;
	}

	async getRegexpModelUri() {
		return this._regexpModelUri;
	}

	async sendTelemetryEvent(languages: string[], confidences: number[], timeSpent: number): Promise<void> {
		this._telemetryService.publicLog2<ILanguageDetectionStats, LanguageDetectionStatsClassification>(LanguageDetectionStatsId, {
			languages: languages.join(','),
			confidences: confidences.join(','),
			timeSpent
		});
	}

	public async detectLanguage(resource: URI, langBiases: Record<string, number> | undefined, preferHistory: boolean, supportedLangs?: string[]): Promise<string | undefined> {
		const startTime = Date.now();
		const quickGuess = this._guessLanguageIdByUri(resource);
		if (quickGuess) {
			return quickGuess;
		}

		await this._withSyncedResources([resource]);
		const modelId = await (await this._getProxy()).detectLanguage(resource.toString(), langBiases, preferHistory, supportedLangs);
		const languageId = this.getLanguageId(modelId);

		const LanguageDetectionStatsId = 'automaticlanguagedetection.perf';

		interface ILanguageDetectionPerf {
			timeSpent: number;
			detection: string;
		}

		type LanguageDetectionPerfClassification = {
			owner: 'TylerLeonhardt';
			comment: 'Helps understand how effective language detection and how long it takes to run';
			timeSpent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The time it took to run language detection' };
			detection: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The language that was detected' };
		};

		this._telemetryService.publicLog2<ILanguageDetectionPerf, LanguageDetectionPerfClassification>(LanguageDetectionStatsId, {
			timeSpent: Date.now() - startTime,
			detection: languageId || 'unknown',
		});

		return languageId;
	}
}

// For now we use Eager until we handle keeping track of history better.
registerSingleton(ILanguageDetectionService, LanguageDetectionService, InstantiationType.Eager);
