/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITelemetryService, lastSessionDateStorageKey } from 'vs/platform/telemetry/common/telemetry';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { language } from 'vs/base/common/platform';
import { Disposable } from 'vs/base/common/lifecycle';
import { match } from 'vs/base/common/glob';
import { IRequestService, asJson } from 'vs/platform/request/common/request';
import { ITextFileService, StateChange } from 'vs/workbench/services/textfile/common/textfiles';
import { CancellationToken } from 'vs/base/common/cancellation';
import { distinct } from 'vs/base/common/arrays';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { IProductService } from 'vs/platform/product/common/product';
import { IWorkspaceStatsService } from 'vs/workbench/contrib/stats/common/workspaceStats';

export const enum ExperimentState {
	Evaluating,
	NoRun,
	Run,
	Complete
}

export interface IExperimentAction {
	type: ExperimentActionType;
	properties: any;
}

export enum ExperimentActionType {
	Custom = 'Custom',
	Prompt = 'Prompt',
	AddToRecommendations = 'AddToRecommendations',
	ExtensionSearchResults = 'ExtensionSearchResults'
}

export type LocalizedPromptText = { [locale: string]: string; };

export interface IExperimentActionPromptProperties {
	promptText: string | LocalizedPromptText;
	commands: IExperimentActionPromptCommand[];
}

export interface IExperimentActionPromptCommand {
	text: string | { [key: string]: string };
	externalLink?: string;
	curatedExtensionsKey?: string;
	curatedExtensionsList?: string[];
}

export interface IExperiment {
	id: string;
	enabled: boolean;
	state: ExperimentState;
	action?: IExperimentAction;
}

export interface IExperimentService {
	_serviceBrand: any;
	getExperimentById(id: string): Promise<IExperiment>;
	getExperimentsByType(type: ExperimentActionType): Promise<IExperiment[]>;
	getCuratedExtensionsList(curatedExtensionsKey: string): Promise<string[]>;
	markAsCompleted(experimentId: string): void;

	onExperimentEnabled: Event<IExperiment>;
}

export const IExperimentService = createDecorator<IExperimentService>('experimentService');

interface IExperimentStorageState {
	enabled: boolean;
	state: ExperimentState;
	editCount?: number;
	lastEditedDate?: string;
}

interface IRawExperiment {
	id: string;
	enabled?: boolean;
	condition?: {
		insidersOnly?: boolean;
		newUser?: boolean;
		displayLanguage?: string;
		installedExtensions?: {
			excludes?: string[];
			includes?: string[];
		},
		fileEdits?: {
			filePathPattern?: string;
			workspaceIncludes?: string[];
			workspaceExcludes?: string[];
			minEditCount: number;
		},
		experimentsPreviouslyRun?: {
			excludes?: string[];
			includes?: string[];
		}
		userProbability?: number;
	};
	action?: IExperimentAction;
}

export class ExperimentService extends Disposable implements IExperimentService {
	_serviceBrand: any;
	private _experiments: IExperiment[] = [];
	private _loadExperimentsPromise: Promise<void>;
	private _curatedMapping = Object.create(null);

	private readonly _onExperimentEnabled = this._register(new Emitter<IExperiment>());
	onExperimentEnabled: Event<IExperiment> = this._onExperimentEnabled.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IRequestService private readonly requestService: IRequestService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
		@IWorkspaceStatsService private readonly workspaceStatsService: IWorkspaceStatsService
	) {
		super();

		this._loadExperimentsPromise = Promise.resolve(this.lifecycleService.when(LifecyclePhase.Eventually)).then(() => this.loadExperiments());
	}

	public getExperimentById(id: string): Promise<IExperiment> {
		return this._loadExperimentsPromise.then(() => {
			return this._experiments.filter(x => x.id === id)[0];
		});
	}

	public getExperimentsByType(type: ExperimentActionType): Promise<IExperiment[]> {
		return this._loadExperimentsPromise.then(() => {
			if (type === ExperimentActionType.Custom) {
				return this._experiments.filter(x => x.enabled && (!x.action || x.action.type === type));
			}
			return this._experiments.filter(x => x.enabled && x.action && x.action.type === type);
		});
	}

	public getCuratedExtensionsList(curatedExtensionsKey: string): Promise<string[]> {
		return this._loadExperimentsPromise.then(() => {
			for (const experiment of this._experiments) {
				if (experiment.enabled
					&& experiment.state === ExperimentState.Run
					&& this._curatedMapping[experiment.id]
					&& this._curatedMapping[experiment.id].curatedExtensionsKey === curatedExtensionsKey) {
					return this._curatedMapping[experiment.id].curatedExtensionsList;
				}
			}
			return [];
		});
	}

	public markAsCompleted(experimentId: string): void {
		const storageKey = 'experiments.' + experimentId;
		const experimentState: IExperimentStorageState = safeParse(this.storageService.get(storageKey, StorageScope.GLOBAL), {});
		experimentState.state = ExperimentState.Complete;
		this.storageService.store(storageKey, JSON.stringify(experimentState), StorageScope.GLOBAL);
	}

	protected getExperiments(): Promise<IRawExperiment[]> {
		if (!this.productService.experimentsUrl || this.configurationService.getValue('workbench.enableExperiments') === false) {
			return Promise.resolve([]);
		}
		return this.requestService.request({ type: 'GET', url: this.productService.experimentsUrl }, CancellationToken.None).then(context => {
			if (context.res.statusCode !== 200) {
				return Promise.resolve(null);
			}
			return asJson(context).then((result: any) => {
				return result && Array.isArray(result['experiments']) ? result['experiments'] : [];
			});
		}, () => Promise.resolve(null));
	}

	private loadExperiments(): Promise<any> {
		return this.getExperiments().then(rawExperiments => {
			// Offline mode
			if (!rawExperiments) {
				const allExperimentIdsFromStorage = safeParse(this.storageService.get('allExperiments', StorageScope.GLOBAL), []);
				if (Array.isArray(allExperimentIdsFromStorage)) {
					allExperimentIdsFromStorage.forEach(experimentId => {
						const storageKey = 'experiments.' + experimentId;
						const experimentState: IExperimentStorageState = safeParse(this.storageService.get(storageKey, StorageScope.GLOBAL), null);
						if (experimentState) {
							this._experiments.push({
								id: experimentId,
								enabled: experimentState.enabled,
								state: experimentState.state
							});
						}
					});
				}
				return Promise.resolve(null);
			}

			// Clear disbaled/deleted experiments from storage
			const allExperimentIdsFromStorage = safeParse(this.storageService.get('allExperiments', StorageScope.GLOBAL), []);
			const enabledExperiments = rawExperiments.filter(experiment => !!experiment.enabled).map(experiment => experiment.id.toLowerCase());
			if (Array.isArray(allExperimentIdsFromStorage)) {
				allExperimentIdsFromStorage.forEach(experiment => {
					if (enabledExperiments.indexOf(experiment) === -1) {
						this.storageService.remove(`experiments.${experiment}`, StorageScope.GLOBAL);
					}
				});
			}
			if (enabledExperiments.length) {
				this.storageService.store('allExperiments', JSON.stringify(enabledExperiments), StorageScope.GLOBAL);
			} else {
				this.storageService.remove('allExperiments', StorageScope.GLOBAL);
			}

			const promises = rawExperiments.map(experiment => {
				const processedExperiment: IExperiment = {
					id: experiment.id,
					enabled: !!experiment.enabled,
					state: !!experiment.enabled ? ExperimentState.Evaluating : ExperimentState.NoRun
				};

				if (experiment.action) {
					processedExperiment.action = {
						type: ExperimentActionType[experiment.action.type] || ExperimentActionType.Custom,
						properties: experiment.action.properties
					};
					if (processedExperiment.action.type === ExperimentActionType.Prompt) {
						((<IExperimentActionPromptProperties>processedExperiment.action.properties).commands || []).forEach(x => {
							if (x.curatedExtensionsKey && Array.isArray(x.curatedExtensionsList)) {
								this._curatedMapping[experiment.id] = x;
							}
						});
					}
					if (!processedExperiment.action.properties) {
						processedExperiment.action.properties = {};
					}
				}
				this._experiments.push(processedExperiment);

				if (!processedExperiment.enabled) {
					return Promise.resolve(null);
				}

				const storageKey = 'experiments.' + experiment.id;
				const experimentState: IExperimentStorageState = safeParse(this.storageService.get(storageKey, StorageScope.GLOBAL), {});
				if (!experimentState.hasOwnProperty('enabled')) {
					experimentState.enabled = processedExperiment.enabled;
				}
				if (!experimentState.hasOwnProperty('state')) {
					experimentState.state = processedExperiment.enabled ? ExperimentState.Evaluating : ExperimentState.NoRun;
				} else {
					processedExperiment.state = experimentState.state;
				}

				return this.shouldRunExperiment(experiment, processedExperiment).then((state: ExperimentState) => {
					experimentState.state = processedExperiment.state = state;
					this.storageService.store(storageKey, JSON.stringify(experimentState), StorageScope.GLOBAL);

					if (state === ExperimentState.Run) {
						this.fireRunExperiment(processedExperiment);
					}
					return Promise.resolve(null);
				});

			});
			return Promise.all(promises).then(() => {
				type ExperimentsClassification = {
					experiments: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
				};
				this.telemetryService.publicLog2<{ experiments: IExperiment[] }, ExperimentsClassification>('experiments', { experiments: this._experiments });
			});
		});
	}

	private fireRunExperiment(experiment: IExperiment) {
		this._onExperimentEnabled.fire(experiment);
		const runExperimentIdsFromStorage: string[] = safeParse(this.storageService.get('currentOrPreviouslyRunExperiments', StorageScope.GLOBAL), []);
		if (runExperimentIdsFromStorage.indexOf(experiment.id) === -1) {
			runExperimentIdsFromStorage.push(experiment.id);
		}

		// Ensure we dont store duplicates
		const distinctExperiments = distinct(runExperimentIdsFromStorage);
		if (runExperimentIdsFromStorage.length !== distinctExperiments.length) {
			this.storageService.store('currentOrPreviouslyRunExperiments', JSON.stringify(distinctExperiments), StorageScope.GLOBAL);
		}
	}

	private checkExperimentDependencies(experiment: IRawExperiment): boolean {
		const experimentsPreviouslyRun = experiment.condition ? experiment.condition.experimentsPreviouslyRun : undefined;
		if (experimentsPreviouslyRun) {
			const runExperimentIdsFromStorage: string[] = safeParse(this.storageService.get('currentOrPreviouslyRunExperiments', StorageScope.GLOBAL), []);
			let includeCheck = true;
			let excludeCheck = true;
			const includes = experimentsPreviouslyRun.includes;
			if (Array.isArray(includes)) {
				includeCheck = runExperimentIdsFromStorage.some(x => includes.indexOf(x) > -1);
			}
			const excludes = experimentsPreviouslyRun.excludes;
			if (includeCheck && Array.isArray(excludes)) {
				excludeCheck = !runExperimentIdsFromStorage.some(x => excludes.indexOf(x) > -1);
			}
			if (!includeCheck || !excludeCheck) {
				return false;
			}
		}
		return true;
	}

	private shouldRunExperiment(experiment: IRawExperiment, processedExperiment: IExperiment): Promise<ExperimentState> {
		if (processedExperiment.state !== ExperimentState.Evaluating) {
			return Promise.resolve(processedExperiment.state);
		}

		if (!experiment.enabled) {
			return Promise.resolve(ExperimentState.NoRun);
		}

		const condition = experiment.condition;
		if (!condition) {
			return Promise.resolve(ExperimentState.Run);
		}

		if (!this.checkExperimentDependencies(experiment)) {
			return Promise.resolve(ExperimentState.NoRun);
		}

		if (this.environmentService.appQuality === 'stable' && condition.insidersOnly === true) {
			return Promise.resolve(ExperimentState.NoRun);
		}

		const isNewUser = !this.storageService.get(lastSessionDateStorageKey, StorageScope.GLOBAL);
		if ((condition.newUser === true && !isNewUser)
			|| (condition.newUser === false && isNewUser)) {
			return Promise.resolve(ExperimentState.NoRun);
		}

		if (typeof condition.displayLanguage === 'string') {
			let localeToCheck = condition.displayLanguage.toLowerCase();
			let displayLanguage = language!.toLowerCase();

			if (localeToCheck !== displayLanguage) {
				const a = displayLanguage.indexOf('-');
				const b = localeToCheck.indexOf('-');
				if (a > -1) {
					displayLanguage = displayLanguage.substr(0, a);
				}
				if (b > -1) {
					localeToCheck = localeToCheck.substr(0, b);
				}
				if (displayLanguage !== localeToCheck) {
					return Promise.resolve(ExperimentState.NoRun);
				}
			}
		}

		if (!condition.userProbability) {
			condition.userProbability = 1;
		}

		let extensionsCheckPromise = Promise.resolve(true);
		const installedExtensions = condition.installedExtensions;
		if (installedExtensions) {
			extensionsCheckPromise = this.extensionManagementService.getInstalled(ExtensionType.User).then(locals => {
				let includesCheck = true;
				let excludesCheck = true;
				const localExtensions = locals.map(local => `${local.manifest.publisher.toLowerCase()}.${local.manifest.name.toLowerCase()}`);
				if (Array.isArray(installedExtensions.includes) && installedExtensions.includes.length) {
					const extensionIncludes = installedExtensions.includes.map(e => e.toLowerCase());
					includesCheck = localExtensions.some(e => extensionIncludes.indexOf(e) > -1);
				}
				if (Array.isArray(installedExtensions.excludes) && installedExtensions.excludes.length) {
					const extensionExcludes = installedExtensions.excludes.map(e => e.toLowerCase());
					excludesCheck = !localExtensions.some(e => extensionExcludes.indexOf(e) > -1);
				}
				return includesCheck && excludesCheck;
			});
		}

		const storageKey = 'experiments.' + experiment.id;
		const experimentState: IExperimentStorageState = safeParse(this.storageService.get(storageKey, StorageScope.GLOBAL), {});

		return extensionsCheckPromise.then(success => {
			const fileEdits = condition.fileEdits;
			if (!success || !fileEdits || typeof fileEdits.minEditCount !== 'number') {
				const runExperiment = success && typeof condition.userProbability === 'number' && Math.random() < condition.userProbability;
				return runExperiment ? ExperimentState.Run : ExperimentState.NoRun;
			}

			experimentState.editCount = experimentState.editCount || 0;
			if (experimentState.editCount >= fileEdits.minEditCount) {
				return ExperimentState.Run;
			}

			const onSaveHandler = this.textFileService.models.onModelsSaved(e => {
				const date = new Date().toDateString();
				const latestExperimentState: IExperimentStorageState = safeParse(this.storageService.get(storageKey, StorageScope.GLOBAL), {});
				if (latestExperimentState.state !== ExperimentState.Evaluating) {
					onSaveHandler.dispose();
					return;
				}
				e.forEach(async event => {
					if (event.kind !== StateChange.SAVED
						|| latestExperimentState.state !== ExperimentState.Evaluating
						|| date === latestExperimentState.lastEditedDate
						|| (typeof latestExperimentState.editCount === 'number' && latestExperimentState.editCount >= fileEdits.minEditCount)
					) {
						return;
					}
					let filePathCheck = true;
					let workspaceCheck = true;

					if (typeof fileEdits.filePathPattern === 'string') {
						filePathCheck = match(fileEdits.filePathPattern, event.resource.fsPath);
					}
					if (Array.isArray(fileEdits.workspaceIncludes) && fileEdits.workspaceIncludes.length) {
						const tags = await this.workspaceStatsService.getTags();
						workspaceCheck = !!tags && fileEdits.workspaceIncludes.some(x => !!tags[x]);
					}
					if (workspaceCheck && Array.isArray(fileEdits.workspaceExcludes) && fileEdits.workspaceExcludes.length) {
						const tags = await this.workspaceStatsService.getTags();
						workspaceCheck = !!tags && !fileEdits.workspaceExcludes.some(x => !!tags[x]);
					}
					if (filePathCheck && workspaceCheck) {
						latestExperimentState.editCount = (latestExperimentState.editCount || 0) + 1;
						latestExperimentState.lastEditedDate = date;
						this.storageService.store(storageKey, JSON.stringify(latestExperimentState), StorageScope.GLOBAL);
					}
				});
				if (typeof latestExperimentState.editCount === 'number' && latestExperimentState.editCount >= fileEdits.minEditCount) {
					processedExperiment.state = latestExperimentState.state = (typeof condition.userProbability === 'number' && Math.random() < condition.userProbability && this.checkExperimentDependencies(experiment)) ? ExperimentState.Run : ExperimentState.NoRun;
					this.storageService.store(storageKey, JSON.stringify(latestExperimentState), StorageScope.GLOBAL);
					if (latestExperimentState.state === ExperimentState.Run && experiment.action && ExperimentActionType[experiment.action.type] === ExperimentActionType.Prompt) {
						this.fireRunExperiment(processedExperiment);
					}
				}
			});
			this._register(onSaveHandler);
			return ExperimentState.Evaluating;
		});
	}
}


function safeParse(text: string | undefined, defaultObject: any) {
	try {
		return text ? JSON.parse(text) || defaultObject : defaultObject;
	} catch (e) {
		return defaultObject;
	}
}
