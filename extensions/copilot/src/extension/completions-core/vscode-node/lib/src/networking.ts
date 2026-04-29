/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-export everything from networking types module for backward compatibility
export * from './networkingTypes';

// Import what we need locally for this module's implementation
import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { IFetcherService } from '../../../../../platform/networking/common/fetcherService';
import { IExperimentationService } from '../../../../../platform/telemetry/common/nullExperimentationService';
import { createServiceIdentifier } from '../../../../../util/common/services';
import { FetchOptions, Response } from './networkingTypes';

export const ICompletionsFetcherService = createServiceIdentifier<ICompletionsFetcherService>('ICompletionsFetcherService');
export interface ICompletionsFetcherService {
	readonly _serviceBrand: undefined;
	getImplementation(): ICompletionsFetcherService | Promise<ICompletionsFetcherService>;
	fetch(url: string, options: FetchOptions): Promise<Response>;
	disconnectAll(): Promise<unknown>;
}

export class CompletionsFetcher implements ICompletionsFetcherService {
	declare _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFetcherService private readonly fetcherService: IFetcherService,
		@IExperimentationService private readonly experimentationService: IExperimentationService
	) { }

	getImplementation(): ICompletionsFetcherService | Promise<ICompletionsFetcherService> {
		return this;
	}

	fetch(url: string, options: FetchOptions): Promise<Response> {
		const useFetcher = this.configurationService.getExperimentBasedConfig(ConfigKey.CompletionsFetcher, this.experimentationService) || undefined;
		const baseOptions = useFetcher ? { ...options, useFetcher } : options;
		return this.fetcherService.fetch(url, {
			...baseOptions,
			callSite: baseOptions.callSite ?? 'completions-core',
		});
	}
	disconnectAll(): Promise<unknown> {
		return this.fetcherService.disconnectAll();
	}
}

/**
 * Encapsulates all the functionality related to making GET/POST/DELETE requests using
 * different libraries (and in the future, different environments like web vs
 * node).
 */
export abstract class Fetcher {
	abstract readonly name: string;
	/**
	 * Returns the real implementation, not a delegator.  Used by diagnostics to ensure the fetcher name and all
	 * reachability checks are aligned.
	 */
	getImplementation(): Fetcher | Promise<Fetcher> {
		return this;
	}
	abstract fetch(url: string, options: FetchOptions): Promise<Response>;
	abstract disconnectAll(): Promise<unknown>;
}

export function isInterruptedNetworkError(error: unknown): boolean {
	if (!(error instanceof Error)) { return false; }
	if (error.message === 'ERR_HTTP2_GOAWAY_SESSION') { return true; }
	if (!('code' in error)) { return false; }
	return error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ERR_HTTP2_INVALID_SESSION';
}
