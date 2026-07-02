/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../authentication/common/authentication';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { createServiceIdentifier } from '../../../util/common/services';
import { ConfigKey, EnterprisePolicyConfigValue, IConfigurationService } from './configurationService';

const MANAGED_SETTINGS_TIMEOUT_MS = 5_000;
const MANAGED_SETTINGS_CACHE_TTL_MS = 60_000;
const ENTERPRISE_POLICY_KEY = 'github.copilot.enterprisePolicy';

export interface IEnterpriseManagedPolicyService {
	readonly _serviceBrand: undefined;

	getEffectiveEnterprisePolicy(): Promise<string | undefined>;
}

export const IEnterpriseManagedPolicyService = createServiceIdentifier<IEnterpriseManagedPolicyService>('IEnterpriseManagedPolicyService');

export function extractEnterprisePolicyFromManagedSettings(json: unknown): EnterprisePolicyConfigValue | undefined {
	if (!isRecord(json)) {
		return undefined;
	}

	const directValue = json[ENTERPRISE_POLICY_KEY];
	if (isEnterprisePolicyConfigValue(directValue)) {
		return directValue;
	}

	const github = json.github;
	if (!isRecord(github)) {
		return undefined;
	}

	const copilot = github.copilot;
	if (!isRecord(copilot)) {
		return undefined;
	}

	const nestedValue = copilot.enterprisePolicy;
	return isEnterprisePolicyConfigValue(nestedValue) ? nestedValue : undefined;
}

export function normalizeEnterprisePolicyValue(value: EnterprisePolicyConfigValue | undefined): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	return JSON.stringify(value, undefined, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnterprisePolicyConfigValue(value: unknown): value is EnterprisePolicyConfigValue {
	return value === null || typeof value === 'string' || isRecord(value);
}

export class EnterpriseManagedPolicyService implements IEnterpriseManagedPolicyService {
	declare readonly _serviceBrand: undefined;

	private _lastFetchTimestamp = 0;
	private _hasCachedManagedPolicy = false;
	private _cachedManagedPolicy: EnterprisePolicyConfigValue | undefined;
	private _inflightManagedPolicy: Promise<EnterprisePolicyConfigValue | undefined> | undefined;

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ICAPIClientService private readonly capiClientService: ICAPIClientService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFetcherService private readonly fetcherService: IFetcherService,
		@ILogService private readonly logService: ILogService,
	) { }

	async getEffectiveEnterprisePolicy(): Promise<string | undefined> {
		const managedPolicy = await this.getManagedPolicy();
		const normalizedManagedPolicy = normalizeEnterprisePolicyValue(managedPolicy);
		if (normalizedManagedPolicy !== undefined) {
			return normalizedManagedPolicy;
		}

		const localPolicy = this.configurationService.getConfig(ConfigKey.EnterprisePolicy);
		return normalizeEnterprisePolicyValue(localPolicy);
	}

	private async getManagedPolicy(): Promise<EnterprisePolicyConfigValue | undefined> {
		const now = Date.now();
		if (this._hasCachedManagedPolicy && now - this._lastFetchTimestamp < MANAGED_SETTINGS_CACHE_TTL_MS) {
			return this._cachedManagedPolicy;
		}

		if (!this._inflightManagedPolicy) {
			this._inflightManagedPolicy = this.fetchManagedPolicy().finally(() => {
				this._inflightManagedPolicy = undefined;
			});
		}

		return this._inflightManagedPolicy;
	}

	private async fetchManagedPolicy(): Promise<EnterprisePolicyConfigValue | undefined> {
		let managedPolicy: EnterprisePolicyConfigValue | undefined;
		const githubToken = this.authenticationService.anyGitHubSession?.accessToken;
		if (!githubToken) {
			managedPolicy = undefined;
		} else {
			const url = new URL('/copilot_internal/managed_settings', this.capiClientService.dotcomAPIURL).toString();
			try {
				const response = await this.fetcherService.fetch(url, {
					method: 'GET',
					timeout: MANAGED_SETTINGS_TIMEOUT_MS,
					callSite: 'copilot-managed-settings-fetch',
					headers: {
						Authorization: `Bearer ${githubToken}`,
						Accept: 'application/json',
					},
				});

				if (response.ok) {
					try {
						managedPolicy = extractEnterprisePolicyFromManagedSettings(await response.json());
					} catch (error) {
						this.logService.debug(`[EnterpriseManagedPolicyService] Failed to parse managed settings: ${error}`);
						managedPolicy = undefined;
					}
				} else {
					this.logService.debug(`[EnterpriseManagedPolicyService] Managed settings request returned ${response.status}`);
					managedPolicy = undefined;
				}
			} catch (error) {
				this.logService.debug(`[EnterpriseManagedPolicyService] Failed to fetch managed settings: ${error}`);
				managedPolicy = undefined;
			}
		}

		this._cachedManagedPolicy = managedPolicy;
		this._hasCachedManagedPolicy = true;
		this._lastFetchTimestamp = Date.now();
		return managedPolicy;
	}
}
