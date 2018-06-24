/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import product from 'vs/platform/node/product';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

import { IRequestService } from 'vs/platform/request/node/request';

import { TPromise } from 'vs/base/common/winjs.base';
import { language } from 'vs/base/common/platform';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { match } from 'vs/base/common/glob';

import { asJson } from 'vs/base/node/request';


import { IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import { ITextFileService, StateChange } from 'vs/workbench/services/textfile/common/textfiles';
import { WorkspaceStats } from 'vs/workbench/parts/stats/node/workspaceStats';
import { Emitter, Event } from 'vs/base/common/event';

// TODO:
// Does changing user probability on the fly work?
// display language: compare before stripping -
// offline should not affect already resolved experiments
// should support opt-out? user can figure out there is an evil scheming experimenter somehwere
// setting for experiments? especially ui?
// Dont show again in one Azure prompt should mean no more future prompts? (store a separate item in local storage and use that)

export interface IExperimentState {
	enabled: boolean;
	runExperiment: boolean;
	editCount?: number;
	lastEditedDate?: string;
	isComplete?: boolean;
}

interface IRawExperiment {
	id: string;
	enabled?: boolean;
	condition?: {
		insidersOnly?: boolean;
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
		userProbability?: number;
		evaluateOnlyOnce?: boolean;
	};
	action?: { type: string; properties: any };
}

export interface IExperimentActionPromptProperties {
	prompt: string;
	commands: IExperimentActionPromptCommand[];
}

interface IExperimentActionPromptCommand {
	text: string;
	externalLink?: string;
	dontShowAgain?: boolean;
	curatedExtensionsKey?: string;
	curatedExtensionsList?: string[];
}

export interface IExperiment {
	id: string;
	enabled: boolean;
	runExperiment: boolean;
	action?: IExperimentAction;
}

export enum ExperimentActionType {
	Custom,
	Prompt,
	AddToRecommendations
}

export interface IExperimentAction {
	type: ExperimentActionType;
	properties: any;
}

export interface IExperimentService {
	_serviceBrand: any;
	getExperimentById(id: string): TPromise<IExperiment>;
	getEligibleExperimentsByType(type: ExperimentActionType): TPromise<IExperiment[]>;
	getCuratedExtensionsList(curatedExtensionsKey: string): TPromise<string[]>;
	markAsCompleted(experimentId: string): void;

	snoozeExperiment(experimentId: string): void;

	onExperimentEnabled: Event<IExperiment>;
}

export const IExperimentService = createDecorator<IExperimentService>('experimentService');

export class ExperimentService extends Disposable implements IExperimentService {
	_serviceBrand: any;
	private _experiments: IExperiment[] = [];
	private _loadExperimentsPromise: TPromise<void>;
	private _curatedMapping = Object.create(null);
	private _disposables: IDisposable[] = [];

	private readonly _onExperimentEnabled: Emitter<IExperiment> = new Emitter<IExperiment>();

	onExperimentEnabled: Event<IExperiment> = this._onExperimentEnabled.event;
	constructor(
		@IStorageService private storageService: IStorageService,
		@IExtensionsWorkbenchService private extensionWorkbenchService: IExtensionsWorkbenchService,
		@ITextFileService private textFileService: ITextFileService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IRequestService private requestService: IRequestService
	) {
		super();

		this._loadExperimentsPromise = TPromise.wrap(this.lifecycleService.when(LifecyclePhase.Eventually)).then(() => this.loadExperiments());
	}

	public getExperimentById(id: string): TPromise<IExperiment> {
		return this._loadExperimentsPromise.then(() => {
			return this._experiments.filter(x => x.id === id)[0];
		});
	}

	public getEligibleExperimentsByType(type: ExperimentActionType): TPromise<IExperiment[]> {
		return this._loadExperimentsPromise.then(() => {
			if (type === ExperimentActionType.Custom) {
				return this._experiments.filter(x => x.enabled && x.runExperiment && (!x.action || x.action.type === type));
			}
			return this._experiments.filter(x => x.enabled && x.runExperiment && x.action && x.action.type === type);
		});
	}

	public getCuratedExtensionsList(curatedExtensionsKey: string): TPromise<string[]> {
		return this._loadExperimentsPromise.then(() => {
			for (let i = 0; i < this._experiments.length; i++) {
				if (this._experiments[i].enabled && this._curatedMapping[this._experiments[i].id] && this._curatedMapping[this._experiments[i].id].curatedExtensionsKey === curatedExtensionsKey) {
					return this._curatedMapping[this._experiments[i].id].curatedExtensionsList;
				}
			}
			return [];
		});
	}

	public markAsCompleted(experimentId: string): void {
		const storageKey = 'experiments.' + experimentId;
		const experimentState: IExperimentState = safeParse(this.storageService.get(storageKey, StorageScope.GLOBAL), {});
		experimentState.isComplete = true;
		this.storageService.store(storageKey, JSON.stringify(experimentState), StorageScope.GLOBAL);
	}


	public snoozeExperiment(experimentId: string): void {
		const storageKey = 'experiments.' + experimentId;
		const experimentState: IExperimentState = safeParse(this.storageService.get(storageKey, StorageScope.GLOBAL), {});
		if (experimentState.isComplete) {
			return;
		}
		experimentState.editCount = 0;
		experimentState.enabled = false;
		this.storageService.store(storageKey, JSON.stringify(experimentState), StorageScope.GLOBAL);
	}

	protected loadExperiments(experiments?: IRawExperiment[]): TPromise<any> {
		let rawExperimentsPromise = TPromise.as(experiments || []);
		if (!experiments && product.experimentsUrl) {
			rawExperimentsPromise = this.requestService.request({ type: 'GET', url: product.experimentsUrl }).then(context => {
				if (context.res.statusCode !== 200) {
					return TPromise.as([]);
				}
				return asJson(context).then(result => {
					return Array.isArray(result['experiments']) ? result['experiments'] : [];
				});
			});
		}

		return rawExperimentsPromise.then(rawExperiments => {
			const enabledExperiments = rawExperiments.filter(experiment => !!experiment.enabled).map(experiment => experiment.id.toLowerCase());
			const allExperiments = safeParse(this.storageService.get('allExperiments', StorageScope.GLOBAL), []);
			if (Array.isArray(allExperiments)) {
				allExperiments.forEach(experiment => {
					if (enabledExperiments.indexOf(experiment) === -1) {
						this.storageService.remove('experiments.' + experiment);
					}
				});
			}
			this.storageService.store('allExperiments', JSON.stringify(enabledExperiments), StorageScope.GLOBAL);

			const promises = rawExperiments.map(experiment => {
				const processedExperiment: IExperiment = {
					id: experiment.id,
					enabled: !!experiment.enabled,
					runExperiment: false
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
				}
				this._experiments.push(processedExperiment);

				const runResult = this.shouldRunExperiment(experiment, processedExperiment);
				return (typeof runResult === 'boolean' ? TPromise.as(runResult) : runResult).then(runit => {
					processedExperiment.runExperiment = runit;
					if (runit && processedExperiment.action && processedExperiment.action.type === ExperimentActionType.Prompt) {
						this._onExperimentEnabled.fire(processedExperiment);
					}
					return TPromise.as(null);
				});

			});
			return TPromise.join(promises).then(() => {
				this.telemetryService.publicLog('experiments', this._experiments);
			});
		});
	}

	private shouldRunExperiment(experiment: IRawExperiment, processedExperiment: IExperiment): TPromise<boolean> | boolean {
		if (!experiment.enabled) {
			return false;
		}

		if (!experiment.condition) {
			return true;
		}

		if (this.environmentService.appQuality === 'stable' && experiment.condition.insidersOnly === true) {
			return false;
		}

		if (typeof experiment.condition.displayLanguage === 'string') {
			let localeToCheck = experiment.condition.displayLanguage.toLowerCase();
			let displayLanguage = language;
			const a = displayLanguage.indexOf('-');
			const b = localeToCheck.indexOf('-');
			if (a > -1) {
				displayLanguage = displayLanguage.substr(0, a);
			}
			if (b > -1) {
				localeToCheck = localeToCheck.substr(0, b);
			}
			if (displayLanguage !== localeToCheck) {
				return false;
			}
		}

		if (!experiment.condition.userProbability) {
			experiment.condition.userProbability = 1;
		}

		const storageKey = 'experiments.' + experiment.id;
		const experimentState: IExperimentState = safeParse(this.storageService.get(storageKey, StorageScope.GLOBAL), {});
		if (experimentState.isComplete) {
			return false;
		}
		if (experiment.condition.evaluateOnlyOnce && (experimentState.runExperiment === true || experimentState.runExperiment === false)) {
			return experimentState.runExperiment;
		}

		let extensionsCheckPromise = TPromise.as(true);
		if (experiment.condition.installedExtensions) {
			extensionsCheckPromise = this.extensionWorkbenchService.queryLocal().then(locals => {
				let includesCheck = true;
				let excludesCheck = true;
				if (Array.isArray(experiment.condition.installedExtensions.includes) && experiment.condition.installedExtensions.includes.length) {
					const extensionIncludes = experiment.condition.installedExtensions.includes.map(e => e.toLowerCase());
					includesCheck = locals.some(e => extensionIncludes.indexOf(e.id.toLowerCase()) > -1);
				}
				if (Array.isArray(experiment.condition.installedExtensions.excludes) && experiment.condition.installedExtensions.excludes.length) {
					const extensionExcludes = experiment.condition.installedExtensions.excludes.map(e => e.toLowerCase());
					excludesCheck = !locals.some(e => extensionExcludes.indexOf(e.id.toLowerCase()) > -1);
				}
				return includesCheck && excludesCheck;
			});
		}

		return extensionsCheckPromise.then(success => {
			if (!success || !experiment.condition.fileEdits || typeof experiment.condition.fileEdits.minEditCount !== 'number') {
				const runExperiment = success && Math.random() < experiment.condition.userProbability;
				experimentState.runExperiment = runExperiment;
				experimentState.enabled = true;
				this.storageService.store(storageKey, JSON.stringify(experimentState), StorageScope.GLOBAL);
				return runExperiment;
			}

			experimentState.editCount = experimentState.editCount || 0;
			if (experimentState.editCount >= experiment.condition.fileEdits.minEditCount) {
				return true;
			}

			const onSaveHandler = this.textFileService.models.onModelsSaved(e => {
				const date = new Date().toDateString();
				const latestExperimentState: IExperimentState = safeParse(this.storageService.get(storageKey, StorageScope.GLOBAL), {});
				if (latestExperimentState.isComplete) {
					onSaveHandler.dispose();
					return;
				}
				e.forEach(event => {
					if (event.kind !== StateChange.SAVED
						|| latestExperimentState.runExperiment
						|| latestExperimentState.isComplete
						|| date === latestExperimentState.lastEditedDate
						|| latestExperimentState.editCount >= experiment.condition.fileEdits.minEditCount) {
						return;
					}
					let filePathCheck = true;
					let workspaceCheck = true;

					if (typeof experiment.condition.fileEdits.filePathPattern === 'string') {
						filePathCheck = match(experiment.condition.fileEdits.filePathPattern, event.resource.fsPath);
					}
					if (Array.isArray(experiment.condition.fileEdits.workspaceIncludes) && experiment.condition.fileEdits.workspaceIncludes.length) {
						workspaceCheck = experiment.condition.fileEdits.workspaceIncludes.some(x => !!WorkspaceStats.tags[x]);
					}
					if (workspaceCheck && Array.isArray(experiment.condition.fileEdits.workspaceExcludes) && experiment.condition.fileEdits.workspaceExcludes.length) {
						workspaceCheck = !experiment.condition.fileEdits.workspaceExcludes.some(x => !!WorkspaceStats.tags[x]);
					}
					if (filePathCheck && workspaceCheck) {
						latestExperimentState.editCount = (latestExperimentState.editCount || 0) + 1;
						latestExperimentState.lastEditedDate = date;
						this.storageService.store(storageKey, JSON.stringify(latestExperimentState), StorageScope.GLOBAL);
					}
				});
				if (latestExperimentState.editCount >= experiment.condition.fileEdits.minEditCount) {
					processedExperiment.runExperiment = latestExperimentState.runExperiment = Math.random() < experiment.condition.userProbability;
					this.storageService.store(storageKey, JSON.stringify(latestExperimentState), StorageScope.GLOBAL);
					if (latestExperimentState.runExperiment && ExperimentActionType[experiment.action.type] === ExperimentActionType.Prompt) {
						this._onExperimentEnabled.fire(processedExperiment);
					}
				}
			});
			this._disposables.push(onSaveHandler);
			return false;
		});
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}
}


function safeParse(text: string, defaultObject: any) {
	try {
		return JSON.parse(text);
	}
	catch (e) {
		return defaultObject;
	}
}