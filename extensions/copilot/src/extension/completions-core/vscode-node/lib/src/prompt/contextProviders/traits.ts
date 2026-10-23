/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { Trait } from '../../../../types/src';
import { telemetry, TelemetryProperties, TelemetryWithExp } from '../../telemetry';
import { ResolvedContextItem } from '../contextProviderRegistry';
import { ICompletionsContextProviderService } from '../contextProviderStatistics';
import { filterContextItemsByType, TraitWithId } from './contextItemSchemas';

export function getTraitsFromContextItems(
	accessor: ServicesAccessor,
	completionId: string,
	resolvedContextItems: ResolvedContextItem[]
): TraitWithId[] {
	const traitsContextItems = filterContextItemsByType(resolvedContextItems, 'Trait');

	// Set expectations for the traits
	for (const item of traitsContextItems) {
		setupExpectationsForTraits(accessor, completionId, item.data, item.providerId);
	}

	// Flatten and sort the traits by importance.
	// TODO: once we deprecate the old API, importance should also dictate elision.
	const traits: TraitWithId[] = traitsContextItems.flatMap(p => p.data);
	return traits.sort((a, b) => (a.importance ?? 0) - (b.importance ?? 0));
}

function setupExpectationsForTraits(accessor: ServicesAccessor, completionId: string, traits: TraitWithId[], providerId: string) {
	const statistics = accessor.get(ICompletionsContextProviderService).getStatisticsForCompletion(completionId);

	traits.forEach(t => {
		statistics.addExpectations(providerId, [[t, 'included']]);
	});
}

// Maintain a list of names for traits we'd like to report in telemetry.
// The key is the trait name, and the value is the corresponding name of the telemetry property as listed in the hydro schema.
const traitNamesForTelemetry: Map<string, string> = new Map([
	['TargetFrameworks', 'targetFrameworks'],
	['LanguageVersion', 'languageVersion'],
]);

export function ReportTraitsTelemetry(
	accessor: ServicesAccessor,
	eventName: string,
	traits: Trait[],
	detectedLanguageId: string,
	clientLanguageId: string,
	telemetryData: TelemetryWithExp
) {
	if (traits.length > 0) {
		const properties: TelemetryProperties = {};
		properties.detectedLanguageId = detectedLanguageId;
		properties.languageId = clientLanguageId;

		for (const trait of traits) {
			const mappedTraitName = traitNamesForTelemetry.get(trait.name);
			if (mappedTraitName) {
				properties[mappedTraitName] = trait.value;
			}
		}

		const telemetryDataExt = telemetryData.extendedBy(properties, {});
		return telemetry(accessor, eventName, telemetryDataExt);
	}
}
