/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../../../../../util/common/services';
import { CancellationToken } from '../../../../types/src';
import { CompletionState } from '../../completionState';
import { LRUCacheMap } from '../../helpers/cache';
import { TelemetryWithExp } from '../../telemetry';
import { ICompletionsContextProviderRegistryService, ResolvedContextItem } from '../contextProviderRegistry';

export const ICompletionsContextProviderBridgeService = createServiceIdentifier<ICompletionsContextProviderBridgeService>('ICompletionsContextProviderBridgeService');
export interface ICompletionsContextProviderBridgeService {
	readonly _serviceBrand: undefined;
	schedule(
		completionState: CompletionState,
		completionId: string,
		opportunityId: string,
		telemetryData: TelemetryWithExp,
		cancellationToken?: CancellationToken,
		options?: { data?: unknown }
	): void;

	resolution(id: string): Promise<ResolvedContextItem[]>;
}

export class ContextProviderBridge implements ICompletionsContextProviderBridgeService {
	declare _serviceBrand: undefined;
	private scheduledResolutions = new LRUCacheMap<string, Promise<ResolvedContextItem[]>>(25);

	constructor(@ICompletionsContextProviderRegistryService private readonly contextProviderRegistry: ICompletionsContextProviderRegistryService) { }

	schedule(
		completionState: CompletionState,
		completionId: string,
		opportunityId: string,
		telemetryData: TelemetryWithExp,
		cancellationToken?: CancellationToken,
		options?: { data?: unknown }
	) {
		const { textDocument, originalPosition, originalOffset, originalVersion, editsWithPosition } = completionState;

		const resolutionPromise = this.contextProviderRegistry.resolveAllProviders(
			completionId,
			opportunityId,
			{
				uri: textDocument.uri,
				languageId: textDocument.detectedLanguageId,
				version: originalVersion,
				offset: originalOffset,
				position: originalPosition,
				proposedEdits: editsWithPosition.length > 0 ? editsWithPosition : undefined,
			},
			telemetryData,
			cancellationToken,
			options?.data
		);

		this.scheduledResolutions.set(completionId, resolutionPromise);
		// intentionally not awaiting to avoid blocking
	}

	async resolution(id: string): Promise<ResolvedContextItem[]> {
		const resolutionPromise = this.scheduledResolutions.get(id);
		if (resolutionPromise) {
			return await resolutionPromise;
		}
		return [];
	}
}
