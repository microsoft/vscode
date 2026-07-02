/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import type { IExperimentationService as ITASExperimentationService } from 'vscode-tas-client';
import { equals } from '../../../util/vs/base/common/arrays';
import { IntervalTimer } from '../../../util/vs/base/common/async';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { ILogService } from '../../log/common/logService';
import { IExperimentationService, TreatmentsChangeEvent } from '../common/nullExperimentationService';
import { ITelemetryService } from '../common/telemetry';

export class UserInfoStore extends Disposable {
	private _internalOrg: string | undefined;
	private _sku: string | undefined;
	private _isFcv1: boolean | undefined;
	private _isSn: boolean | undefined;
	private _isVscodeTeamMember: boolean | undefined;
	private _organizationList: string[] | undefined;

	private _onDidChangeUserInfo = this._register(new Emitter<void>());
	readonly onDidChangeUserInfo = this._onDidChangeUserInfo.event;

	static INTERNAL_ORG_STORAGE_KEY = 'exp.github.copilot.internalOrg';
	static SKU_STORAGE_KEY = 'exp.github.copilot.sku';
	static IS_FCV1_STORAGE_KEY = 'exp.github.copilot.isFcv1';
	static IS_SN_STORAGE_KEY = 'exp.github.copilot.isSn';
	static IS_VSCODE_TEAM_MEMBER_STORAGE_KEY = 'exp.github.copilot.isVscodeTeamMember';
	static ORGANIZATION_LIST_STORAGE_KEY = 'exp.github.copilot.organizationList';
	constructor(private readonly context: IVSCodeExtensionContext, copilotTokenStore: ICopilotTokenStore) {
		super();

		if (copilotTokenStore) {
			const getInternalOrg = (): string | undefined => {
				if (copilotTokenStore.copilotToken?.isVscodeTeamMember) {
					return 'vscode';
				} else if (copilotTokenStore.copilotToken?.isGitHubInternal) {
					return 'github';
				} else if (copilotTokenStore.copilotToken?.isMicrosoftInternal) {
					return 'microsoft';
				}
				return undefined;
			};

			copilotTokenStore.onDidStoreUpdate(() => {
				this.updateUserInfo(getInternalOrg(), copilotTokenStore.copilotToken?.sku, copilotTokenStore.copilotToken?.isFcv1(), copilotTokenStore.copilotToken?.isSn(), copilotTokenStore.copilotToken?.isVscodeTeamMember, copilotTokenStore.copilotToken?.organizationList);
			});

			if (copilotTokenStore.copilotToken) {
				this.updateUserInfo(getInternalOrg(), copilotTokenStore.copilotToken.sku, copilotTokenStore.copilotToken.isFcv1(), copilotTokenStore.copilotToken.isSn(), copilotTokenStore.copilotToken.isVscodeTeamMember, copilotTokenStore.copilotToken.organizationList);
			} else {
				const cachedInternalValue = this.context.globalState.get<string>(UserInfoStore.INTERNAL_ORG_STORAGE_KEY);
				const cachedSkuValue = this.context.globalState.get<string>(UserInfoStore.SKU_STORAGE_KEY);
				const cachedIsFcv1Value = this.context.globalState.get<boolean>(UserInfoStore.IS_FCV1_STORAGE_KEY);
				const cachedIsSnValue = this.context.globalState.get<boolean>(UserInfoStore.IS_SN_STORAGE_KEY);
				const cachedIsVscodeTeamMemberValue = this.context.globalState.get<boolean>(UserInfoStore.IS_VSCODE_TEAM_MEMBER_STORAGE_KEY);
				const cachedOrganizationListValue = this.context.globalState.get<string[]>(UserInfoStore.ORGANIZATION_LIST_STORAGE_KEY);
				this.updateUserInfo(cachedInternalValue, cachedSkuValue, cachedIsFcv1Value, cachedIsSnValue, cachedIsVscodeTeamMemberValue, cachedOrganizationListValue);
			}
		}
	}

	get internalOrg(): string | undefined {
		return this._internalOrg;
	}

	get sku(): string | undefined {
		return this._sku;
	}

	get isFcv1(): boolean | undefined {
		return this._isFcv1;
	}

	get isSn(): boolean | undefined {
		return this._isSn;
	}

	get isVscodeTeamMember(): boolean | undefined {
		return this._isVscodeTeamMember;
	}

	/**
	 * The list of organization IDs the user belongs to.
	 * This can be used in ExP to target specific organizations via the X-GitHub-Copilot-OrganizationList filter.
	 */
	get organizationList(): string[] | undefined {
		return this._organizationList;
	}

	private updateUserInfo(internalOrg?: string, sku?: string, isFcv1?: boolean, isSn?: boolean, isVscodeTeamMember?: boolean, organizationList?: string[]): void {
		if (this._internalOrg === internalOrg && this._sku === sku && this._isFcv1 === isFcv1 && this._isSn === isSn && this._isVscodeTeamMember === isVscodeTeamMember && equals(this._organizationList, organizationList)) {
			// no change
			return;
		}

		this._internalOrg = internalOrg;
		this._sku = sku;
		this._isFcv1 = isFcv1;
		this._isSn = isSn;
		this._isVscodeTeamMember = isVscodeTeamMember;
		this._organizationList = organizationList;
		void this.context.globalState.update(UserInfoStore.INTERNAL_ORG_STORAGE_KEY, this._internalOrg);
		void this.context.globalState.update(UserInfoStore.SKU_STORAGE_KEY, this._sku);
		void this.context.globalState.update(UserInfoStore.IS_FCV1_STORAGE_KEY, this._isFcv1);
		void this.context.globalState.update(UserInfoStore.IS_SN_STORAGE_KEY, this._isSn);
		void this.context.globalState.update(UserInfoStore.IS_VSCODE_TEAM_MEMBER_STORAGE_KEY, this._isVscodeTeamMember);
		void this.context.globalState.update(UserInfoStore.ORGANIZATION_LIST_STORAGE_KEY, this._organizationList);

		this._onDidChangeUserInfo.fire();
	}
}

export type TASClientDelegateFn = (globalState: vscode.Memento, userInfoStore: UserInfoStore) => ITASExperimentationService;

const AB_EXP_FEATURE_DATA_STORAGE_KEY = 'VSCode.ABExp.FeatureData';
const LAZY_COHORT_EVALUATION_TREATMENT = 'copilotchat.configService.lazyCohortEvaluation';

interface CachedFeatureData {
	readonly configs?: readonly {
		readonly Id?: string;
		readonly Parameters?: Record<string, unknown>;
	}[];
}

interface WrappedCachedFeatureData {
	readonly $$$isWrappedExpValue: true;
	readonly value?: CachedFeatureData;
}

export class BaseExperimentationService extends Disposable implements IExperimentationService {

	declare _serviceBrand: undefined;
	private readonly _refreshTimer = this._register(new IntervalTimer());
	private readonly _previouslyReadTreatments = new Map<string, boolean | string | number | undefined>();
	private readonly _emittedTreatments = new Map<string, boolean | string | number | undefined>();
	private readonly _lazyCohortEvaluation: boolean;
	private readonly _cachedFeatureData: CachedFeatureData | undefined;
	private readonly _delegateFn: TASClientDelegateFn;
	private readonly _context: IVSCodeExtensionContext;

	protected _delegate: ITASExperimentationService | undefined;
	protected readonly _userInfoStore: UserInfoStore;

	protected _onDidTreatmentsChange = this._register(new Emitter<TreatmentsChangeEvent>());
	readonly onDidTreatmentsChange = this._onDidTreatmentsChange.event;

	constructor(
		delegateFn: TASClientDelegateFn,
		@IVSCodeExtensionContext context: IVSCodeExtensionContext,
		@ICopilotTokenStore copilotTokenStore: ICopilotTokenStore,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService
	) {
		super();

		this._delegateFn = delegateFn;
		this._context = context;
		this._userInfoStore = new UserInfoStore(context, copilotTokenStore);
		this._cachedFeatureData = this.readCachedFeatureData(context);
		this._lazyCohortEvaluation = this._cachedFeatureData?.configs?.find(config => config.Id === 'vscode')?.Parameters?.[LAZY_COHORT_EVALUATION_TREATMENT] === true;

		// Refresh treatments when user info changes
		this._register(this._userInfoStore.onDidChangeUserInfo(async () => {
			if (!this._delegate) {
				return;
			}
			await this._delegate.getTreatmentVariableAsync('vscode', 'refresh');
			this._logService.trace(`[BaseExperimentationService] User info changed, refreshed treatments`);
			this._signalTreatmentsChangeEvent();
		}));

		// Refresh treatments every hour
		this._refreshTimer.cancelAndSet(async () => {
			if (!this._delegate) {
				return;
			}
			await this._delegate.getTreatmentVariableAsync('vscode', 'refresh');
			this._logService.trace(`[BaseExperimentationService] Refreshed treatments on timer`);
			this._signalTreatmentsChangeEvent();
		}, 60 * 60 * 1000);

		if (!this._lazyCohortEvaluation) {
			this.ensureDelegate();
		}
	}

	private readCachedFeatureData(context: IVSCodeExtensionContext): CachedFeatureData | undefined {
		const storedFeatureData = context.globalState.get<unknown>(AB_EXP_FEATURE_DATA_STORAGE_KEY);
		const featureData = isWrappedCachedFeatureData(storedFeatureData) ? storedFeatureData.value : storedFeatureData;
		if (!isCachedFeatureData(featureData)) {
			return undefined;
		}
		return featureData;
	}

	private getCachedTreatmentVariable<T extends boolean | number | string>(name: string): T | undefined {
		const vscodeConfig = this._cachedFeatureData?.configs?.find(config => config.Id === 'vscode');
		const value = vscodeConfig?.Parameters?.[name];
		switch (typeof value) {
			case 'boolean':
			case 'number':
			case 'string':
				return value as T;
			default:
				return undefined;
		}
	}

	private shouldDeferMissingLazyTreatment(name: string): boolean {
		return name.startsWith('copilotchat.config.')
			|| name.startsWith('config.github.copilot.')
			|| name === 'copilotchat.notebookVariableFiltering';
	}

	protected ensureDelegate(): ITASExperimentationService {
		if (this._delegate) {
			return this._delegate;
		}
		this._delegate = this._delegateFn(this._context.globalState, this._userInfoStore);
		this._delegate.initialFetch.then(() => {
			this._logService.trace(`[BaseExperimentationService] Initial fetch completed`);
		});
		return this._delegate;
	}

	private _signalTreatmentsChangeEvent = () => {
		if (!this._delegate) {
			return;
		}
		const affectedTreatmentVariables: string[] = [];
		for (const [key, previousValue] of this._previouslyReadTreatments) {
			const currentValue = this._delegate.getTreatmentVariable('vscode', key);
			if (currentValue !== previousValue) {
				this._logService.trace(`[BaseExperimentationService] Treatment changed: ${key} from ${previousValue} to ${currentValue}`);
				this._previouslyReadTreatments.set(key, currentValue);
				affectedTreatmentVariables.push(key);
			}
		}

		if (affectedTreatmentVariables.length > 0) {
			this._onDidTreatmentsChange.fire({
				affectedTreatmentVariables
			});

			this._configurationService.updateExperimentBasedConfiguration(affectedTreatmentVariables);
		}
	};

	async hasTreatments(): Promise<void> {
		if (this._lazyCohortEvaluation) {
			return;
		}
		const delegate = this.ensureDelegate();
		await delegate.initializePromise;
		return delegate.initialFetch;
	}

	getTreatmentVariable<T extends boolean | number | string>(name: string): T | undefined {
		if (this._lazyCohortEvaluation && !this._delegate) {
			const cachedResult = this.getCachedTreatmentVariable<T>(name);
			if (cachedResult !== undefined) {
				this.recordTreatmentEvaluation(name, cachedResult);
				return cachedResult;
			}
			if (this.shouldDeferMissingLazyTreatment(name)) {
				return undefined;
			}
		}
		const delegate = this.ensureDelegate();
		const result = delegate.getTreatmentVariable('vscode', name) as T;
		this._previouslyReadTreatments.set(name, result);
		if (this._lazyCohortEvaluation && result === undefined) {
			void delegate.getTreatmentVariableAsync('vscode', name, true).then(() => this._signalTreatmentsChangeEvent());
		}
		this.recordTreatmentEvaluation(name, result);
		return result;
	}

	private recordTreatmentEvaluation<T extends boolean | number | string>(name: string, result: T | undefined): void {
		this._previouslyReadTreatments.set(name, result);
		const isFirstEmit = !this._emittedTreatments.has(name);
		const previousEmitted = this._emittedTreatments.get(name);
		if (isFirstEmit || previousEmitted !== result) {
			this._emittedTreatments.set(name, result);
			this._telemetryService.sendMSFTTelemetryEvent('copilot.experimentEvaluated', {
				treatmentName: name,
				valueKind: result === undefined ? 'undefined' : typeof result
			}, {
				hasValue: result === undefined ? 0 : 1
			});
		}
	}

	// Note: This is only temporarily until we have fully migrated to the new completions implementation.
	// At that point, we can remove this method and the related code.
	private _completionsFilters: Map<string, string> = new Map<string, string>();
	async setCompletionsFilters(filters: Map<string, string>): Promise<void> {
		if (equalMap(this._completionsFilters, filters)) {
			return;
		}

		this._completionsFilters.clear();
		for (const [key, value] of filters) {
			this._completionsFilters.set(key, value);
		}

		const delegate = this.ensureDelegate();
		await delegate.initialFetch;
		await delegate.getTreatmentVariableAsync('vscode', 'refresh');
		this._signalTreatmentsChangeEvent();
	}

	protected getCompletionsFilters(): Map<string, string> {
		return this._completionsFilters;
	}
}

function isCachedFeatureData(value: unknown): value is CachedFeatureData {
	if (!value || typeof value !== 'object' || !('configs' in value)) {
		return false;
	}
	const configs = (value as CachedFeatureData).configs;
	return configs === undefined || Array.isArray(configs);
}

function isWrappedCachedFeatureData(value: unknown): value is WrappedCachedFeatureData {
	return !!value && typeof value === 'object' && (value as WrappedCachedFeatureData).$$$isWrappedExpValue === true;
}

function equalMap(map1: Map<string, string>, map2: Map<string, string>): boolean {
	if (map1.size !== map2.size) {
		return false;
	}

	for (const [key, value] of map1) {
		if (map2.get(key) !== value) {
			return false;
		}
	}

	return true;
}
