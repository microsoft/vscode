/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IPolicyService } from '../../../../platform/policy/common/policy.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IUserDataSyncAccountService } from '../../../../platform/userDataSync/common/userDataSyncAccount.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUntitledTextResourceEditorInput } from '../../../common/editor.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';

type PolicyDiagnosticsEvent = {
	policyCount: number;
	accountCount: number;
	duration: number;
};

type PolicyDiagnosticsClassification = {
	policyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of policy settings found.' };
	accountCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of signed-in accounts found.' };
	duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time taken to collect diagnostics in milliseconds.' };
	owner: 'copilot';
	comment: 'Tracks usage of the policy diagnostics command.';
};

class DiagnosePolicyConfigurationAction extends Action2 {

	static readonly ID = 'workbench.action.diagnosePolicyConfiguration';

	constructor() {
		super({
			id: DiagnosePolicyConfigurationAction.ID,
			title: localize2('diagnosePolicyConfiguration', 'Diagnose Policy Configuration'),
			category: Categories.Developer,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const startTime = Date.now();
		const configurationService = accessor.get(IConfigurationService);
		const policyService = accessor.get(IPolicyService);
		const authenticationService = accessor.get(IAuthenticationService);
		const userDataSyncAccountService = accessor.get(IUserDataSyncAccountService);
		const logService = accessor.get(ILogService);
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);
		const telemetryService = accessor.get(ITelemetryService);

		logService.info('PolicyDiagnostics: Starting policy configuration diagnosis');

		try {
			const diagnosticsData = await this.collectDiagnostics(
				configurationService,
				policyService,
				authenticationService,
				userDataSyncAccountService,
				logService
			);

			const diagnosticsText = this.formatDiagnostics(diagnosticsData);

			// Open in a new untitled editor
			const input: IUntitledTextResourceEditorInput = {
				forceUntitled: true,
				options: {
					mode: 'json',
					pinned: true
				},
				contents: diagnosticsText
			};

			await editorService.openEditor(input);

			const duration = Date.now() - startTime;
			telemetryService.publicLog2<PolicyDiagnosticsEvent, PolicyDiagnosticsClassification>('policyDiagnostics', {
				policyCount: diagnosticsData.policies.length,
				accountCount: diagnosticsData.accounts.length,
				duration
			});

			logService.info('PolicyDiagnostics: Completed policy configuration diagnosis', { duration, policyCount: diagnosticsData.policies.length, accountCount: diagnosticsData.accounts.length });

		} catch (error) {
			logService.error('PolicyDiagnostics: Error during policy configuration diagnosis', error);
			throw error;
		}
	}

	private async collectDiagnostics(
		configurationService: IConfigurationService,
		policyService: IPolicyService,
		authenticationService: IAuthenticationService,
		userDataSyncAccountService: IUserDataSyncAccountService,
		logService: ILogService
	) {
		logService.trace('PolicyDiagnostics: Collecting policy settings');

		// Collect policy information
		const policyData = policyService.serialize() || {};
		const policies = Object.keys(policyData).map(key => {
			const policy = policyData[key];
			const configValue = configurationService.getValue(key);
			return {
				name: key,
				definition: policy.definition,
				policyValue: policy.value,
				configurationValue: configValue,
				source: this.determinePolicySource(key, policy.value, configValue, logService)
			};
		});

		logService.trace('PolicyDiagnostics: Collecting authentication information');

		// Collect authentication information
		const authProviders = authenticationService.getProviderIds();
		const accounts = [];

		for (const providerId of authProviders) {
			try {
				const sessions = await authenticationService.getSessions(providerId);
				for (const session of sessions) {
					accounts.push({
						providerId,
						accountId: session.account.id,
						accountLabel: session.account.label,
						scopes: Array.from(session.scopes),
						// Note: We don't include the actual token for security reasons
						hasToken: !!session.accessToken,
						tokenLength: session.accessToken?.length || 0,
						hasIdToken: !!session.idToken
					});
				}
			} catch (error) {
				logService.warn('PolicyDiagnostics: Error collecting sessions for provider', providerId, error);
				accounts.push({
					providerId,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		// Add user data sync account if available
		const syncAccount = userDataSyncAccountService.account;
		if (syncAccount) {
			accounts.push({
				providerId: 'userDataSync',
				accountId: syncAccount.authenticationProviderId,
				accountLabel: 'User Data Sync',
				hasToken: !!syncAccount.token,
				tokenLength: syncAccount.token?.length || 0
			});
		}

		logService.trace('PolicyDiagnostics: Collection complete', { policyCount: policies.length, accountCount: accounts.length });

		return {
			timestamp: new Date().toISOString(),
			policies,
			accounts,
			summary: {
				totalPolicies: policies.length,
				activePolicies: policies.filter(p => p.policyValue !== undefined).length,
				totalAccounts: accounts.length,
				authProviders: authProviders.length
			}
		};
	}

	private determinePolicySource(key: string, policyValue: any, configValue: any, logService: ILogService): string {
		if (policyValue !== undefined) {
			logService.trace('PolicyDiagnostics: Policy value found for', key, { policyValue, configValue });
			return 'Policy';
		}
		if (configValue !== undefined) {
			return 'Configuration';
		}
		return 'Default';
	}

	private formatDiagnostics(data: any): string {
		return JSON.stringify(data, null, 2);
	}
}

registerAction2(DiagnosePolicyConfigurationAction);