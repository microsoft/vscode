/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsFeaturesService } from '../experiments/featuresService';
import { ICompletionsLogTargetService, logger } from '../logger';
import { TelemetryWithExp } from '../telemetry';
import { ActiveExperiments } from './contextProviderRegistry';

const MULTI_LANGUAGE_CONTEXT_PROVIDER_ID = 'fallbackContextProvider';

/**
 * Parameters for configuring the multi-language context provider.
 */
interface MultiLanguageContextProviderParams {
	/**
	 * The maximum number of context items to include in the multi-language context.
	 * This controls the number of relevant context entries that can be retrieved
	 * and processed by the provider.
	 */
	mlcpMaxContextItems: number;

	/**
	 * The maximum number of symbol matches to include in the multi-language context.
	 * This determines the upper limit on the number of symbol-based matches that
	 * can be considered by the provider.
	 */
	mlcpMaxSymbolMatches: number;

	/**
	 * Enable imports in the multi-language context provider.
	 * If set to true, the provider will include import statements in the context.
	 */
	mlcpEnableImports: boolean;
}

export const multiLanguageContextProviderParamsDefault: MultiLanguageContextProviderParams = {
	mlcpMaxContextItems: 20,
	mlcpMaxSymbolMatches: 20,
	mlcpEnableImports: false,
};

export function fillInMultiLanguageActiveExperiments(
	accessor: ServicesAccessor,
	matchedContextProviders: string[],
	activeExperiments: ActiveExperiments,
	telemetryData: TelemetryWithExp
): void {
	if (
		(matchedContextProviders.length === 1 && matchedContextProviders[0] === '*') ||
		matchedContextProviders.includes(MULTI_LANGUAGE_CONTEXT_PROVIDER_ID)
	) {
		addActiveExperiments(accessor, activeExperiments, telemetryData);
	}
}

function addActiveExperiments(accessor: ServicesAccessor, activeExperiments: ActiveExperiments, telemetryData: TelemetryWithExp) {
	try {
		const params = getMultiLanguageContextProviderParamsFromExp(accessor, telemetryData);
		for (const [key, value] of Object.entries(params)) { activeExperiments.set(key, value as number); }
	} catch (e) {
		logger.exception(accessor, e, 'fillInMultiLanguageActiveExperiments');
	}
}

function getMultiLanguageContextProviderParamsFromExp(
	accessor: ServicesAccessor,
	telemetryData: TelemetryWithExp
): MultiLanguageContextProviderParams {
	let params = multiLanguageContextProviderParamsDefault;

	const logTarget = accessor.get(ICompletionsLogTargetService);
	const featuresService = accessor.get(ICompletionsFeaturesService);
	const multiLanguageContextProviderParams = featuresService.multiLanguageContextProviderParams(telemetryData);

	if (multiLanguageContextProviderParams) {
		try {
			params = JSON.parse(multiLanguageContextProviderParams) as MultiLanguageContextProviderParams;
		} catch (e) {
			logger.error(logTarget, 'Failed to parse multiLanguageContextProviderParams', e);
		}
	}

	return params;
}

export function getMultiLanguageContextProviderParamsFromActiveExperiments(
	activeExperiments: Map<string, string | number | boolean | string[]>
): MultiLanguageContextProviderParams {
	const params = { ...multiLanguageContextProviderParamsDefault };

	if (activeExperiments.has('mlcpMaxContextItems')) {
		params.mlcpMaxContextItems = Number(activeExperiments.get('mlcpMaxContextItems'));
	}

	if (activeExperiments.has('mlcpMaxSymbolMatches')) {
		params.mlcpMaxSymbolMatches = Number(activeExperiments.get('mlcpMaxSymbolMatches'));
	}

	if (activeExperiments.has('mlcpEnableImports')) {
		params.mlcpEnableImports = String(activeExperiments.get('mlcpEnableImports')) === 'true';
	}

	return params;
}
