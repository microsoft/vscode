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

export class BaseExperimentationService extends Disposable implements IExperimentationService {

	declare _serviceBrand: undefined;
	private readonly _refreshTimer = this._register(new IntervalTimer());
	private readonly _previouslyReadTreatments = new Map<string, boolean | string | number | undefined>();

	protected readonly _delegate: ITASExperimentationService;
	protected readonly _userInfoStore: UserInfoStore;

	protected _onDidTreatmentsChange = this._register(new Emitter<TreatmentsChangeEvent>());
	readonly onDidTreatmentsChange = this._onDidTreatmentsChange.event;

	constructor(
		delegateFn: TASClientDelegateFn,
		@IVSCodeExtensionContext context: IVSCodeExtensionContext,
		@ICopilotTokenStore copilotTokenStore: ICopilotTokenStore,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService
	) {
		super();

		this._userInfoStore = new UserInfoStore(context, copilotTokenStore);

		// Refresh treatments when user info changes
		this._register(this._userInfoStore.onDidChangeUserInfo(async () => {
			await this._delegate.getTreatmentVariableAsync('vscode', 'refresh');
			this._logService.trace(`[BaseExperimentationService] User info changed, refreshed treatments`);
			this._signalTreatmentsChangeEvent();
		}));

		// Refresh treatments every hour
		this._refreshTimer.cancelAndSet(async () => {
			await this._delegate.getTreatmentVariableAsync('vscode', 'refresh');
			this._logService.trace(`[BaseExperimentationService] Refreshed treatments on timer`);
			this._signalTreatmentsChangeEvent();
		}, 60 * 60 * 1000);

		this._delegate = delegateFn(context.globalState, this._userInfoStore);
		this._delegate.initialFetch.then(() => {
			this._logService.trace(`[BaseExperimentationService] Initial fetch completed`);
		});
	}

	private _signalTreatmentsChangeEvent = () => {
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
		await this._delegate.initializePromise;
		return this._delegate.initialFetch;
	}

	getTreatmentVariable<T extends boolean | number | string>(name: string): T | undefined {
		const result = this._delegate.getTreatmentVariable('vscode', name) as T;
		this._previouslyReadTreatments.set(name, result);
		return result;
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

		await this._delegate.initialFetch;
		await this._delegate.getTreatmentVariableAsync('vscode', 'refresh');
		this._signalTreatmentsChangeEvent();
	}

	protected getCompletionsFilters(): Map<string, string> {
		return this._completionsFilters;
	}
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
