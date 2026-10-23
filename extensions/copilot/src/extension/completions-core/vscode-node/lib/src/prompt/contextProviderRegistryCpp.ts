/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsFeaturesService } from '../experiments/featuresService';
import { ICompletionsLogTargetService, logger } from '../logger';
import { TelemetryWithExp } from '../telemetry';
import { ActiveExperiments } from './contextProviderRegistry';

interface CppContextProviderParams {
	[key: string]: string | number | boolean;
}

const cppContextProviderParamsDefault: CppContextProviderParams = {
	maxSnippetLength: 3000,
	maxSnippetCount: 7,
	enabledFeatures: 'Deferred',
	timeBudgetMs: 7,
	doAggregateSnippets: true,
};

const VSCodeCppContextProviderId = 'ms-vscode.cpptools';

export function fillInCppVSCodeActiveExperiments(
	accessor: ServicesAccessor,
	matchedContextProviders: string[],
	activeExperiments: ActiveExperiments,
	telemetryData: TelemetryWithExp
): void {
	if (
		(matchedContextProviders.length === 1 && matchedContextProviders[0] === '*') ||
		matchedContextProviders.includes(VSCodeCppContextProviderId)
	) {
		addActiveExperiments(accessor, activeExperiments, telemetryData);
	}
}

function addActiveExperiments(accessor: ServicesAccessor, activeExperiments: ActiveExperiments, telemetryData: TelemetryWithExp) {
	try {
		const featuresService = accessor.get(ICompletionsFeaturesService);
		const logTarget = accessor.get(ICompletionsLogTargetService);
		let params = cppContextProviderParamsDefault;
		const cppContextProviderParams = featuresService.cppContextProviderParams(telemetryData);
		if (cppContextProviderParams) {
			try {
				params = JSON.parse(cppContextProviderParams) as CppContextProviderParams;
			} catch (e) {
				logger.error(logTarget, 'Failed to parse cppContextProviderParams', e);
			}
		} else {
			const langSpecific = featuresService.getContextProviderExpSettings('cpp')?.params;
			if (langSpecific) {
				params = { ...langSpecific };
			}
		}
		for (const [key, value] of Object.entries(params)) { activeExperiments.set(key, value); }
	} catch (e) {
		logger.exception(accessor, e, 'fillInCppActiveExperiments');
	}
}
