/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { RunOnceWorker } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { match } from 'vs/base/common/glob';
import { Disposable } from 'vs/base/common/lifecycle';
import { equals } from 'vs/base/common/objects';
import { language, OperatingSystem, OS } from 'vs/base/common/platform';
import { isDefined } from 'vs/base/common/types';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProductService } from 'vs/platform/product/common/productService';
import { asJson, IRequestService } from 'vs/platform/request/common/request';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService, lastSessionDateStorageKey } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceTagsService } from 'vs/workbench/contrib/tags/common/workspaceTags';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ITextFileEditorModel, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

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

export type LocalizedPromptText = { [locale: string]: string };

export interface IExperimentActionPromptProperties {
	promptText: string | LocalizedPromptText;
	commands: IExperimentActionPromptCommand[];
}

export interface IExperimentActionPromptCommand {
	text: string | { [key: string]: string };
	externalLink?: string;
	curatedExtensionsKey?: string;
	curatedExtensionsList?: string[];
	codeCommand?: {
		id: string;
		arguments: unknown[];
	};
}

export interface IExperiment {
	id: string;
	enabled: boolean;
	raw: IRawExperiment | undefined;
	state: ExperimentState;
	action?: IExperimentAction;
}

export interface IExperimentService {
	readonly _serviceBrand: undefined;
	getExperimentById(id: string): Promise<IExperiment>;
	getExperimentsByType(type: ExperimentActionType): Promise<IExperiment[]>;
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

/**
 * Current version of the experiment schema in this VS Code build. This *must*
 * be incremented when adding a condition, otherwise experiments might activate
 * on older versions of VS Code where not intended.
 */
export const currentSchemaVersion = 5;

interface IRawExperiment {
	id: string;
	schemaVersion: number;
	enabled?: boolean;
	condition?: {
		insidersOnly?: boolean;
		newUser?: boolean;
		displayLanguage?: string;
		// Evaluates to true iff all the given user settings are deeply equal
		userSetting?: { [key: string]: unknown };
		// Start the experiment if the number of activation events have happened over the last week:
		activationEvent?: {
			event: string | string[];
			uniqueDays?: number;
			minEvents: number;
		};
		os: OperatingSystem[];
		installedExtensions?: {
			excludes?: string[];
			includes?: string[];
		};
		fileEdits?: {
			filePathPattern?: string;
			workspaceIncludes?: string[];
			workspaceExcludes?: string[];
			minEditCount: number;
		};
		experimentsPreviouslyRun?: {
			excludes?: string[];
			includes?: string[];
		};
		userProbability?: number;
	};
	action?: IExperimentAction;
	action2?: IExperimentAction;
}

interface IActivationEventRecord {
	count: number[];
	mostRecentBucket: number;
}

const experimentEventStorageKey = (event: string) => 'experimentEventRecord-' + event.replace(/[^0-9a-z]/ig, '-');

/**
 * Updates the activation record to shift off days outside the window
 * we're interested in.
 */
export const getCurrentActivationRecord = (previous?: IActivationEventRecord, dayWindow = 7): IActivationEventRecord => {
	const oneDay = 1000 * 60 * 60 * 24;
	const now = Date.now();
	if (!previous) {
		return { count: new Array(dayWindow).fill(0), mostRecentBucket: now };
	}

	// get the number of days, up to dayWindow, that passed since the last bucket update
	const shift = Math.min(dayWindow, Math.floor((now - previous.mostRecentBucket) / oneDay));
	if (!shift) {
		return previous;
	}

	return {
		count: new Array(shift).fill(0).concat(previous.count.slice(0, -shift)),
		mostRecentBucket: previous.mostRecentBucket + shift * oneDay,
	};
};

export class ExperimentService extends Disposable implements IExperimentService {
	declare readonly _serviceBrand: undefined;
	private _experiments: IExperiment[] = [];
	private _loadExperimentsPromise: Promise<void>;
	private _curatedMapping = Object.create(null);

	private readonly _onExperimentEnabled = this._register(new Emitter<IExperiment>());
	onExperimentEnabled: Event<IExperiment> = this._onExperimentEnabled.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IRequestService private readonly requestService: IRequestService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
		@IWorkspaceTagsService private readonly workspaceTagsService: IWorkspaceTagsService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		super();

		this._loadExperimentsPromise = Promise.resolve(this.lifecycleService.when(LifecyclePhase.Eventually)).then(() =>
			this.loadExperiments());
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

	public markAsCompleted(experimentId: string): void {
		const storageKey = 'experiments.' + experimentId;
		const experimentState: IExperimentStorageState = safeParse(this.storageService.get(storageKey, StorageScope.APPLICATION), {});
		experimentState.state = ExperimentState.Complete;
		this.storageService.store(storageKey, JSON.stringify(experimentState), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	protected async getExperiments(): Promise<IRawExperiment[] | null> {
		if (this.environmentService.enableSmokeTestDriver || this.environmentService.extensionTestsLocationURI) {
			return []; // TODO@sbatten add CLI argument (https://github.com/microsoft/vscode-internalbacklog/issues/2855)
		}

		const experimentsUrl = this.productService.experimentsUrl;
		if (!experimentsUrl || this.configurationService.getValue('workbench.enableExperiments') === false) {
			return [];
		}

		try {
			const context = await this.requestService.request({ type: 'GET', url: experimentsUrl }, CancellationToken.None);
			if (context.res.statusCode !== 200) {
				return null;
			}
			const result = await asJson<{ experiments?: IRawExperiment }>(context);
			return result && Array.isArray(result.experiments) ? result.experiments : [];
		} catch (_e) {
			// Bad request or invalid JSON
			return null;
		}
	}

	private loadExperiments(): Promise<any> {
		return this.getExperiments().then(rawExperiments => {
			// Offline mode
			if (!rawExperiments) {
				const allExperimentIdsFromStorage = safeParse(this.storageService.get('allExperiments', StorageScope.APPLICATION), []);
				if (Array.isArray(allExperimentIdsFromStorage)) {
					allExperimentIdsFromStorage.forEach(experimentId => {
						const storageKey = 'experiments.' + experimentId;
						const experimentState: IExperimentStorageState = safeParse(this.storageService.get(storageKey, StorageScope.APPLICATION), null);
						if (experimentState) {
							this._experiments.push({
								id: experimentId,
								raw: undefined,
								enabled: experimentState.enabled,
								state: experimentState.state
							});
						}
					});
				}
				return Promise.resolve(null);
			}

			// Don't look at experiments with newer schema versions. We can't
			// understand them, trying to process them might even cause errors.
			rawExperiments = rawExperiments.filter(e => (e.schemaVersion || 0) <= currentSchemaVersion);

			// Clear disbaled/deleted experiments from storage
			const allExperimentIdsFromStorage = safeParse(this.storageService.get('allExperiments', StorageScope.APPLICATION), []);
			const enabledExperiments = rawExperiments.filter(experiment => !!experiment.enabled).map(experiment => experiment.id.toLowerCase());
			if (Array.isArray(allExperimentIdsFromStorage)) {
				allExperimentIdsFromStorage.forEach(experiment => {
					if (enabledExperiments.indexOf(experiment) === -1) {
						this.storageService.remove(`experiments.${experiment}`, StorageScope.APPLICATION);
					}
				});
			}
			if (enabledExperiments.length) {
				this.storageService.store('allExperiments', JSON.stringify(enabledExperiments), StorageScope.APPLICATION, StorageTarget.MACHINE);
			} else {
				this.storageService.remove('allExperiments', StorageScope.APPLICATION);
			}

			const activationEvents = new Set(rawExperiments.map(exp => exp.condition?.activationEvent?.event)
				.filter(isDefined).flatMap(evt => typeof evt === 'string' ? [evt] : []));
			if (activationEvents.size) {
				this._register(this.extensionService.onWillActivateByEvent(evt => {
					if (activationEvents.has(evt.event)) {
						this.recordActivatedEvent(evt.event);
					}
				}));
			}

			const promises = rawExperiments.map(experiment => this.evaluateExperiment(experiment));
			return Promise.all(promises).then(() => {
				type ExperimentsClassification = {
					owner: 'sbatten';
					comment: 'Information about the experiments in this session';
					experiments: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The list of experiments in this session' };
				};
				this.telemetryService.publicLog2<{ experiments: string[] }, ExperimentsClassification>('experiments', { experiments: this._experiments.map(e => e.id) });
			});
		});
	}

	private evaluateExperiment(experiment: IRawExperiment) {
		const processedExperiment: IExperiment = {
			id: experiment.id,
			raw: experiment,
			enabled: !!experiment.enabled,
			state: !!experiment.enabled ? ExperimentState.Evaluating : ExperimentState.NoRun
		};

		const action = experiment.action2 || experiment.action;
		if (action) {
			processedExperiment.action = {
				type: ExperimentActionType[action.type] || ExperimentActionType.Custom,
				properties: action.properties
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

		this._experiments = this._experiments.filter(e => e.id !== processedExperiment.id);
		this._experiments.push(processedExperiment);

		if (!processedExperiment.enabled) {
			return Promise.resolve(null);
		}

		const storageKey = 'experiments.' + experiment.id;
		const experimentState: IExperimentStorageState = safeParse(this.storageService.get(storageKey, StorageScope.APPLICATION), {});
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
			this.storageService.store(storageKey, JSON.stringify(experimentState), StorageScope.APPLICATION, StorageTarget.MACHINE);

			if (state === ExperimentState.Run) {
				this.fireRunExperiment(processedExperiment);
			}

			return Promise.resolve(null);
		});
	}

	private fireRunExperiment(experiment: IExperiment) {
		this._onExperimentEnabled.fire(experiment);
		const runExperimentIdsFromStorage: string[] = safeParse(this.storageService.get('currentOrPreviouslyRunExperiments', StorageScope.APPLICATION), []);
		if (runExperimentIdsFromStorage.indexOf(experiment.id) === -1) {
			runExperimentIdsFromStorage.push(experiment.id);
		}

		// Ensure we dont store duplicates
		const distinctExperiments = distinct(runExperimentIdsFromStorage);
		if (runExperimentIdsFromStorage.length !== distinctExperiments.length) {
			this.storageService.store('currentOrPreviouslyRunExperiments', JSON.stringify(distinctExperiments), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}

	private checkExperimentDependencies(experiment: IRawExperiment): boolean {
		const experimentsPreviouslyRun = experiment.condition?.experimentsPreviouslyRun;
		if (experimentsPreviouslyRun) {
			const runExperimentIdsFromStorage: string[] = safeParse(this.storageService.get('currentOrPreviouslyRunExperiments', StorageScope.APPLICATION), []);
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

	private recordActivatedEvent(event: string) {
		const key = experimentEventStorageKey(event);
		const record = getCurrentActivationRecord(safeParse(this.storageService.get(key, StorageScope.APPLICATION), undefined));
		record.count[0]++;
		this.storageService.store(key, JSON.stringify(record), StorageScope.APPLICATION, StorageTarget.MACHINE);

		this._experiments
			.filter(e => {
				const lookingFor = e.raw?.condition?.activationEvent?.event;
				if (e.state !== ExperimentState.Evaluating || !lookingFor) {
					return false;
				}

				return typeof lookingFor === 'string' ? lookingFor === event : lookingFor?.includes(event);
			})
			.forEach(e => this.evaluateExperiment(e.raw!));
	}

	private checkActivationEventFrequency(experiment: IRawExperiment) {
		const setting = experiment.condition?.activationEvent;
		if (!setting) {
			return true;
		}

		let total = 0;
		let uniqueDays = 0;

		const events = typeof setting.event === 'string' ? [setting.event] : setting.event;
		for (const event of events) {
			const { count } = getCurrentActivationRecord(safeParse(this.storageService.get(experimentEventStorageKey(event), StorageScope.APPLICATION), undefined));

			for (const entry of count) {
				if (entry > 0) {
					uniqueDays++;
					total += entry;
				}
			}
		}

		return total >= setting.minEvents && (!setting.uniqueDays || uniqueDays >= setting.uniqueDays);
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

		if (experiment.condition?.os && !experiment.condition.os.includes(OS)) {
			return Promise.resolve(ExperimentState.NoRun);
		}

		if (!this.checkExperimentDependencies(experiment)) {
			return Promise.resolve(ExperimentState.NoRun);
		}

		for (const [key, value] of Object.entries(experiment.condition?.userSetting || {})) {
			if (!equals(this.configurationService.getValue(key), value)) {
				return Promise.resolve(ExperimentState.NoRun);
			}
		}

		if (!this.checkActivationEventFrequency(experiment)) {
			return Promise.resolve(ExperimentState.Evaluating);
		}

		if (this.productService.quality === 'stable' && condition.insidersOnly === true) {
			return Promise.resolve(ExperimentState.NoRun);
		}

		const isNewUser = !this.storageService.get(lastSessionDateStorageKey, StorageScope.APPLICATION);
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
		const experimentState: IExperimentStorageState = safeParse(this.storageService.get(storageKey, StorageScope.APPLICATION), {});

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

			// Process model-save event every 250ms to reduce load
			const onModelsSavedWorker = this._register(new RunOnceWorker<ITextFileEditorModel>(models => {
				const date = new Date().toDateString();
				const latestExperimentState: IExperimentStorageState = safeParse(this.storageService.get(storageKey, StorageScope.APPLICATION), {});
				if (latestExperimentState.state !== ExperimentState.Evaluating) {
					onSaveHandler.dispose();
					onModelsSavedWorker.dispose();
					return;
				}
				models.forEach(async model => {
					if (latestExperimentState.state !== ExperimentState.Evaluating
						|| date === latestExperimentState.lastEditedDate
						|| (typeof latestExperimentState.editCount === 'number' && latestExperimentState.editCount >= fileEdits.minEditCount)
					) {
						return;
					}
					let filePathCheck = true;
					let workspaceCheck = true;

					if (typeof fileEdits.filePathPattern === 'string') {
						filePathCheck = match(fileEdits.filePathPattern, model.resource.fsPath);
					}
					if (Array.isArray(fileEdits.workspaceIncludes) && fileEdits.workspaceIncludes.length) {
						const tags = await this.workspaceTagsService.getTags();
						workspaceCheck = !!tags && fileEdits.workspaceIncludes.some(x => !!tags[x]);
					}
					if (workspaceCheck && Array.isArray(fileEdits.workspaceExcludes) && fileEdits.workspaceExcludes.length) {
						const tags = await this.workspaceTagsService.getTags();
						workspaceCheck = !!tags && !fileEdits.workspaceExcludes.some(x => !!tags[x]);
					}
					if (filePathCheck && workspaceCheck) {
						latestExperimentState.editCount = (latestExperimentState.editCount || 0) + 1;
						latestExperimentState.lastEditedDate = date;
						this.storageService.store(storageKey, JSON.stringify(latestExperimentState), StorageScope.APPLICATION, StorageTarget.MACHINE);
					}
				});
				if (typeof latestExperimentState.editCount === 'number' && latestExperimentState.editCount >= fileEdits.minEditCount) {
					processedExperiment.state = latestExperimentState.state = (typeof condition.userProbability === 'number' && Math.random() < condition.userProbability && this.checkExperimentDependencies(experiment)) ? ExperimentState.Run : ExperimentState.NoRun;
					this.storageService.store(storageKey, JSON.stringify(latestExperimentState), StorageScope.APPLICATION, StorageTarget.MACHINE);
					if (latestExperimentState.state === ExperimentState.Run && processedExperiment.action && ExperimentActionType[processedExperiment.action.type] === ExperimentActionType.Prompt) {
						this.fireRunExperiment(processedExperiment);
					}
				}
			}, 250));

			const onSaveHandler = this._register(this.textFileService.files.onDidSave(e => onModelsSavedWorker.work(e.model)));
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
