/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import type { TextDocumentValidation } from '../../textDocument';
import { ICompletionsTextDocumentManagerService } from '../../textDocumentManager';
import { ResolvedContextItem } from '../contextProviderRegistry';
import { ICompletionsContextProviderService, type PromptExpectation } from '../contextProviderStatistics';
import { filterContextItemsByType, type DiagnosticBagWithId } from './contextItemSchemas';

const CONTENT_EXCLUDED_EXPECTATION: PromptExpectation = 'content_excluded';

export async function getDiagnosticsFromContextItems(
	accessor: ServicesAccessor,
	completionId: string,
	resolvedContextItems: ResolvedContextItem[]
): Promise<DiagnosticBagWithId[]> {
	const diagnosticBags = filterContextItemsByType(resolvedContextItems, 'DiagnosticBag');

	// Set expectations for the diagnostics provided.
	for (const item of diagnosticBags) {
		setupExpectationsForDiagnosticBags(accessor, completionId, item.data, item.providerId);
	}

	// Flatten and sort the traits by importance.
	// TODO: once we deprecate the old API, importance should also dictate elision.
	const allUris: Set<string> = new Set();
	const diagnosticBagsWithProviderId: { providerId: string; bag: DiagnosticBagWithId }[] = [];
	for (const item of diagnosticBags) {
		for (const diagnosticBag of item.data) {
			allUris.add(diagnosticBag.uri.toString());
			diagnosticBagsWithProviderId.push({ providerId: item.providerId, bag: diagnosticBag });
		}
	}

	if (diagnosticBagsWithProviderId.length === 0) {
		return [];
	}

	const contextProviderStatistics = accessor.get(ICompletionsContextProviderService);
	const tdm = accessor.get(ICompletionsTextDocumentManagerService);

	const validationMap = new Map<string, TextDocumentValidation>();
	await Promise.all(
		Array.from(allUris).map(async uri => {
			validationMap.set(uri, await tdm.getTextDocumentValidation({ uri }));
		})
	);

	const statistics = contextProviderStatistics.getStatisticsForCompletion(completionId);
	const filteredDiagnosticBags = diagnosticBagsWithProviderId
		.filter(item => {
			const isValid = validationMap.get(item.bag.uri.toString())?.status === 'valid';

			// Set expectations regardless of validity
			if (isValid) {
				statistics.addExpectations(item.providerId, [[item.bag, 'included']]);
			} else {
				statistics.addExpectations(item.providerId, [[item.bag, CONTENT_EXCLUDED_EXPECTATION]]);
			}

			return isValid;
		})
		.map(item => item.bag);


	return filteredDiagnosticBags.sort((a, b) => (a.importance ?? 0) - (b.importance ?? 0));
}

function setupExpectationsForDiagnosticBags(accessor: ServicesAccessor, completionId: string, bags: DiagnosticBagWithId[], providerId: string) {
	const statistics = accessor.get(ICompletionsContextProviderService).getStatisticsForCompletion(completionId);

	bags.forEach(bag => {
		statistics.addExpectations(providerId, [[bag, 'included']]);
	});
}