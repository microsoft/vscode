/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancelablePromise, createCancelablePromise, raceCancellablePromises, timeout } from 'vs/base/common/async';
import { IDisposable } from 'vs/base/common/lifecycle';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { StopWatch } from 'vs/base/common/stopwatch';
import { ILogService } from 'vs/platform/log/common/log';

export const IAiEmbeddingVectorService = createDecorator<IAiEmbeddingVectorService>('IAiEmbeddingVectorService');

export interface IAiEmbeddingVectorService {
	readonly _serviceBrand: undefined;

	isEnabled(): boolean;
	getEmbeddingVector(str: string, token: CancellationToken): Promise<number[]>;
	getEmbeddingVector(strings: string[], token: CancellationToken): Promise<number[][]>;
	registerAiEmbeddingVectorProvider(model: string, provider: IAiEmbeddingVectorProvider): IDisposable;
}

export interface IAiEmbeddingVectorProvider {
	provideAiEmbeddingVector(strings: string[], token: CancellationToken): Promise<number[][]>;
}

export class AiEmbeddingVectorService implements IAiEmbeddingVectorService {
	readonly _serviceBrand: undefined;

	static readonly DEFAULT_TIMEOUT = 1000 * 10; // 10 seconds

	private readonly _providers: IAiEmbeddingVectorProvider[] = [];

	constructor(@ILogService private readonly logService: ILogService) { }

	isEnabled(): boolean {
		return this._providers.length > 0;
	}

	registerAiEmbeddingVectorProvider(model: string, provider: IAiEmbeddingVectorProvider): IDisposable {
		this._providers.push(provider);
		return {
			dispose: () => {
				const index = this._providers.indexOf(provider);
				if (index >= 0) {
					this._providers.splice(index, 1);
				}
			}
		};
	}

	getEmbeddingVector(str: string, token: CancellationToken): Promise<number[]>;
	getEmbeddingVector(strings: string[], token: CancellationToken): Promise<number[][]>;
	async getEmbeddingVector(strings: string | string[], token: CancellationToken): Promise<number[] | number[][]> {
		if (this._providers.length === 0) {
			throw new Error('No embedding vector providers registered');
		}

		const stopwatch = StopWatch.create();

		const cancellablePromises: Array<CancelablePromise<number[][]>> = [];

		const timer = timeout(AiEmbeddingVectorService.DEFAULT_TIMEOUT);
		const disposable = token.onCancellationRequested(() => {
			disposable.dispose();
			timer.cancel();
		});

		for (const provider of this._providers) {
			cancellablePromises.push(createCancelablePromise(async t => {
				try {
					return await provider.provideAiEmbeddingVector(
						Array.isArray(strings) ? strings : [strings],
						t
					);
				} catch (e) {
					// logged in extension host
				}
				// Wait for the timer to finish to allow for another provider to resolve.
				// Alternatively, if something resolved, or we've timed out, this will throw
				// as expected.
				await timer;
				throw new Error('Embedding vector provider timed out');
			}));
		}

		cancellablePromises.push(createCancelablePromise(async (t) => {
			const disposable = t.onCancellationRequested(() => {
				timer.cancel();
				disposable.dispose();
			});
			await timer;
			throw new Error('Embedding vector provider timed out');
		}));

		try {
			const result = await raceCancellablePromises(cancellablePromises);

			// If we have a single result, return it directly, otherwise return an array.
			// This aligns with the API overloads.
			if (result.length === 1) {
				return result[0];
			}
			return result;
		} finally {
			stopwatch.stop();
			this.logService.trace(`[AiEmbeddingVectorService]: getEmbeddingVector took ${stopwatch.elapsed()}ms`);
		}
	}
}

registerSingleton(IAiEmbeddingVectorService, AiEmbeddingVectorService, InstantiationType.Delayed);
