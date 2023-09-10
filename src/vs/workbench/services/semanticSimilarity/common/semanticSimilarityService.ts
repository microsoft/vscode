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

export const ISemanticSimilarityService = createDecorator<ISemanticSimilarityService>('ISemanticSimilarityService');

export interface ISemanticSimilarityService {
	readonly _serviceBrand: undefined;

	isEnabled(): boolean;
	getSimilarityScore(string1: string, comparisons: string[], token: CancellationToken): Promise<number[]>;
	registerSemanticSimilarityProvider(provider: ISemanticSimilarityProvider): IDisposable;
}

export interface ISemanticSimilarityProvider {
	provideSimilarityScore(string1: string, comparisons: string[], token: CancellationToken): Promise<number[]>;
}

export class SemanticSimilarityService implements ISemanticSimilarityService {
	readonly _serviceBrand: undefined;

	static readonly DEFAULT_TIMEOUT = 1000 * 10; // 10 seconds

	private readonly _providers: ISemanticSimilarityProvider[] = [];

	constructor(@ILogService private readonly logService: ILogService) { }

	isEnabled(): boolean {
		return this._providers.length > 0;
	}

	registerSemanticSimilarityProvider(provider: ISemanticSimilarityProvider): IDisposable {
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

	async getSimilarityScore(string1: string, comparisons: string[], token: CancellationToken): Promise<number[]> {
		if (this._providers.length === 0) {
			throw new Error('No semantic similarity providers registered');
		}

		const stopwatch = StopWatch.create();

		const cancellablePromises: Array<CancelablePromise<number[]>> = [];

		const timer = timeout(SemanticSimilarityService.DEFAULT_TIMEOUT);
		const disposable = token.onCancellationRequested(() => {
			disposable.dispose();
			timer.cancel();
		});

		for (const provider of this._providers) {
			cancellablePromises.push(createCancelablePromise(async t => {
				try {
					return await provider.provideSimilarityScore(string1, comparisons, t);
				} catch (e) {
					// logged in extension host
				}
				// Wait for the timer to finish to allow for another provider to resolve.
				// Alternatively, if something resolved, or we've timed out, this will throw
				// as expected.
				await timer;
				throw new Error('Semantic similarity provider timed out');
			}));
		}

		cancellablePromises.push(createCancelablePromise(async (t) => {
			const disposable = t.onCancellationRequested(() => {
				timer.cancel();
				disposable.dispose();
			});
			await timer;
			throw new Error('Semantic similarity provider timed out');
		}));

		try {
			const result = await raceCancellablePromises(cancellablePromises);
			return result;
		} finally {
			stopwatch.stop();
			this.logService.trace(`[SemanticSimilarityService]: getSimilarityScore took ${stopwatch.elapsed()}ms`);
		}
	}
}

registerSingleton(ISemanticSimilarityService, SemanticSimilarityService, InstantiationType.Delayed);
