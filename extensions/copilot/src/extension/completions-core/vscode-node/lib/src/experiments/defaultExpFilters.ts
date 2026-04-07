/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../../../../platform/authentication/common/authentication';
import { IExperimentationService } from '../../../../../../platform/telemetry/common/nullExperimentationService';
import { IDisposable } from '../../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotToken } from '../auth/copilotTokenManager';
import { getUserKind } from '../auth/orgs';
import {
	BuildInfo,
	BuildType,
	ConfigKey,
	getConfig
} from '../config';
import { getEngineRequestInfo } from '../openai/config';
import { Filter, Release } from './filters';

export function setupCompletionsExperimentationService(accessor: ServicesAccessor): IDisposable {
	const authService = accessor.get(IAuthenticationService);
	const instantiationService = accessor.get(IInstantiationService);

	// Use onDidAuthenticationChange instead of deprecated onDidAccessTokenChange.
	// onDidAuthenticationChange fires AFTER CopilotToken is minted and stored,
	// ensuring copilotTrackingId is available for experiment assignment.
	const disposable = authService.onDidAuthenticationChange(() => {
		instantiationService.invokeFunction(updateCompletionsFilters, authService.copilotToken);
	});

	updateCompletionsFilters(accessor, authService.copilotToken);

	return disposable;
}

function getPluginRelease(accessor: ServicesAccessor): Release {
	if (BuildInfo.getBuildType() === BuildType.NIGHTLY) {
		return Release.Nightly;
	}
	return Release.Stable;
}

function updateCompletionsFilters(accessor: ServicesAccessor, token: Omit<CopilotToken, 'token'> | undefined) {
	const exp = accessor.get(IExperimentationService);

	const filters = createCompletionsFilters(accessor, token);

	exp.setCompletionsFilters(filters);
}

export function createCompletionsFilters(accessor: ServicesAccessor, token: Omit<CopilotToken, 'token'> | undefined) {
	const filters = new Map<Filter, string>();

	filters.set(Filter.ExtensionRelease, getPluginRelease(accessor));
	filters.set(Filter.CopilotOverrideEngine, getConfig(accessor, ConfigKey.DebugOverrideEngine) || getConfig(accessor, ConfigKey.DebugOverrideEngineLegacy));
	filters.set(Filter.CopilotClientVersion, BuildInfo.isProduction() ? BuildInfo.getVersion() : '1.999.0');

	if (token) {
		const userKind = getUserKind(token);
		const customModel = token.getTokenValue('ft') ?? '';
		const orgs = token.getTokenValue('ol') ?? '';
		const customModelNames = token.getTokenValue('cml') ?? '';
		const copilotTrackingId = token.getTokenValue('tid') ?? '';

		filters.set(Filter.CopilotUserKind, userKind);
		filters.set(Filter.CopilotCustomModel, customModel);
		filters.set(Filter.CopilotOrgs, orgs);
		filters.set(Filter.CopilotCustomModelNames, customModelNames);
		filters.set(Filter.CopilotTrackingId, copilotTrackingId);
		filters.set(Filter.CopilotUserKind, getUserKind(token));
	}

	const model = getEngineRequestInfo(accessor).modelId;
	filters.set(Filter.CopilotEngine, model);
	return filters;
}