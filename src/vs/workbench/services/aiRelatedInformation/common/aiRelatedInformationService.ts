/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { CancelablePromise, createCancelablePromise, raceCancellablePromises, timeout } from 'vs/base/common/async';
import { IDisposable } from 'vs/base/common/lifecycle';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { StopWatch } from 'vs/base/common/stopwatch';
import { ILogService } from 'vs/platform/log/common/log';
import { IAiRelatedInformationService, IAiRelatedInformationProvider, RelatedInformationType, RelatedInformationResult } from 'vs/workbench/services/aiRelatedInformation/common/aiRelatedInformation';

export class AiRelatedInformationService implements IAiRelatedInformationService {
	readonly _serviceBrand: undefined;

	static readonly DEFAULT_TIMEOUT = 1000 * 10; // 10 seconds

	private readonly _providers: Map<RelatedInformationType, IAiRelatedInformationProvider[]> = new Map();

	constructor(@ILogService private readonly logService: ILogService) { }

	isEnabled(): boolean {
		return this._providers.size > 0;
	}

	registerAiRelatedInformationProvider(type: RelatedInformationType, provider: IAiRelatedInformationProvider): IDisposable {
		const providers = this._providers.get(type) ?? [];
		providers.push(provider);
		this._providers.set(type, providers);


		return {
			dispose: () => {
				const providers = this._providers.get(type) ?? [];
				const index = providers.indexOf(provider);
				if (index !== -1) {
					providers.splice(index, 1);
				}
				if (providers.length === 0) {
					this._providers.delete(type);
				}
			}
		};
	}

	async getRelatedInformation(query: string, types: RelatedInformationType[], token: CancellationToken): Promise<RelatedInformationResult[]> {
		if (this._providers.size === 0) {
			throw new Error('No related information providers registered');
		}

		// get providers for each type
		const providers: IAiRelatedInformationProvider[] = [];
		for (const type of types) {
			const typeProviders = this._providers.get(type);
			if (typeProviders) {
				providers.push(...typeProviders);
			}
		}

		if (providers.length === 0) {
			throw new Error('No related information providers registered for the given types');
		}

		const stopwatch = StopWatch.create();

		const cancellablePromises: Array<CancelablePromise<RelatedInformationResult[]>> = [];

		const timer = timeout(AiRelatedInformationService.DEFAULT_TIMEOUT);
		const disposable = token.onCancellationRequested(() => {
			disposable.dispose();
			timer.cancel();
		});

		for (const provider of providers) {
			cancellablePromises.push(createCancelablePromise(async t => {
				try {
					const result = await provider.provideAiRelatedInformation(query, t);
					// double filter just in case
					return result.filter(r => types.includes(r.type));
				} catch (e) {
					// logged in extension host
				}
				// Wait for the timer to finish to allow for another provider to resolve.
				// Alternatively, if something resolved, or we've timed out, this will throw
				// as expected.
				await timer;
				throw new Error('Related information provider timed out');
			}));
		}

		cancellablePromises.push(createCancelablePromise(async (t) => {
			const disposable = t.onCancellationRequested(() => {
				timer.cancel();
				disposable.dispose();
			});
			await timer;
			throw new Error('Related information provider timed out');
		}));

		try {
			const result = await raceCancellablePromises(cancellablePromises);
			return result;
		} finally {
			stopwatch.stop();
			this.logService.trace(`[AiRelatedInformationService]: getRelatedInformation took ${stopwatch.elapsed()}ms`);
		}
	}
}

registerSingleton(IAiRelatedInformationService, AiRelatedInformationService, InstantiationType.Delayed);
