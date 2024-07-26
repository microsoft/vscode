/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { IDocumentDiff, IDocumentDiffProvider, IDocumentDiffProviderOptions } from 'vs/editor/common/diff/documentDiffProvider';
import { DetailedLineRangeMapping, RangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { ITextModel } from 'vs/editor/common/model';
import { DiffAlgorithmName, IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export const IDiffProviderFactoryService = createDecorator<IDiffProviderFactoryService>('diffProviderFactoryService');

export interface IDocumentDiffFactoryOptions {
	readonly diffAlgorithm?: 'legacy' | 'advanced';
}

export interface IDiffProviderFactoryService {
	readonly _serviceBrand: undefined;
	createDiffProvider(options: IDocumentDiffFactoryOptions): IDocumentDiffProvider;
}

export class WorkerBasedDiffProviderFactoryService implements IDiffProviderFactoryService {
	readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	createDiffProvider(options: IDocumentDiffFactoryOptions): IDocumentDiffProvider {
		return this.instantiationService.createInstance(WorkerBasedDocumentDiffProvider, options);
	}
}

registerSingleton(IDiffProviderFactoryService, WorkerBasedDiffProviderFactoryService, InstantiationType.Delayed);

export class WorkerBasedDocumentDiffProvider implements IDocumentDiffProvider, IDisposable {
	private onDidChangeEventEmitter = new Emitter<void>();
	public readonly onDidChange: Event<void> = this.onDidChangeEventEmitter.event;

	private diffAlgorithm: DiffAlgorithmName | IDocumentDiffProvider = 'advanced';
	private diffAlgorithmOnDidChangeSubscription: IDisposable | undefined = undefined;

	private static readonly diffCache = new Map<string, { result: IDocumentDiff; context: string }>();

	constructor(
		options: IWorkerBasedDocumentDiffProviderOptions,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		this.setOptions(options);
	}

	public dispose(): void {
		this.diffAlgorithmOnDidChangeSubscription?.dispose();
	}

	async computeDiff(original: ITextModel, modified: ITextModel, options: IDocumentDiffProviderOptions, cancellationToken: CancellationToken): Promise<IDocumentDiff> {
		if (typeof this.diffAlgorithm !== 'string') {
			return this.diffAlgorithm.computeDiff(original, modified, options, cancellationToken);
		}

		if (original.isDisposed() || modified.isDisposed()) {
			// TODO@hediet
			return {
				changes: [],
				identical: true,
				quitEarly: false,
				moves: [],
			};
		}

		// This significantly speeds up the case when the original file is empty
		if (original.getLineCount() === 1 && original.getLineMaxColumn(1) === 1) {
			if (modified.getLineCount() === 1 && modified.getLineMaxColumn(1) === 1) {
				return {
					changes: [],
					identical: true,
					quitEarly: false,
					moves: [],
				};
			}

			return {
				changes: [
					new DetailedLineRangeMapping(
						new LineRange(1, 2),
						new LineRange(1, modified.getLineCount() + 1),
						[
							new RangeMapping(
								original.getFullModelRange(),
								modified.getFullModelRange(),
							)
						]
					)
				],
				identical: false,
				quitEarly: false,
				moves: [],
			};
		}

		const uriKey = JSON.stringify([original.uri.toString(), modified.uri.toString()]);
		const context = JSON.stringify([original.id, modified.id, original.getAlternativeVersionId(), modified.getAlternativeVersionId(), JSON.stringify(options)]);
		const c = WorkerBasedDocumentDiffProvider.diffCache.get(uriKey);
		if (c && c.context === context) {
			return c.result;
		}

		const sw = StopWatch.create();
		const result = await this.editorWorkerService.computeDiff(original.uri, modified.uri, options, this.diffAlgorithm);
		const timeMs = sw.elapsed();

		this.telemetryService.publicLog2<{
			timeMs: number;
			timedOut: boolean;
			detectedMoves: number;
		}, {
			owner: 'hediet';

			timeMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand if the new diff algorithm is slower/faster than the old one' };
			timedOut: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand how often the new diff algorithm times out' };
			detectedMoves: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand how often the new diff algorithm detects moves' };

			comment: 'This event gives insight about the performance of the new diff algorithm.';
		}>('diffEditor.computeDiff', {
			timeMs,
			timedOut: result?.quitEarly ?? true,
			detectedMoves: options.computeMoves ? (result?.moves.length ?? 0) : -1,
		});

		if (cancellationToken.isCancellationRequested) {
			// Text models might be disposed!
			return {
				changes: [],
				identical: false,
				quitEarly: true,
				moves: [],
			};
		}

		if (!result) {
			throw new Error('no diff result available');
		}

		// max 10 items in cache
		if (WorkerBasedDocumentDiffProvider.diffCache.size > 10) {
			WorkerBasedDocumentDiffProvider.diffCache.delete(WorkerBasedDocumentDiffProvider.diffCache.keys().next().value!);
		}

		WorkerBasedDocumentDiffProvider.diffCache.set(uriKey, { result, context });
		return result;
	}

	public setOptions(newOptions: IWorkerBasedDocumentDiffProviderOptions): void {
		let didChange = false;
		if (newOptions.diffAlgorithm) {
			if (this.diffAlgorithm !== newOptions.diffAlgorithm) {
				this.diffAlgorithmOnDidChangeSubscription?.dispose();
				this.diffAlgorithmOnDidChangeSubscription = undefined;

				this.diffAlgorithm = newOptions.diffAlgorithm;
				if (typeof newOptions.diffAlgorithm !== 'string') {
					this.diffAlgorithmOnDidChangeSubscription = newOptions.diffAlgorithm.onDidChange(() => this.onDidChangeEventEmitter.fire());
				}
				didChange = true;
			}
		}
		if (didChange) {
			this.onDidChangeEventEmitter.fire();
		}
	}
}

interface IWorkerBasedDocumentDiffProviderOptions {
	readonly diffAlgorithm?: 'legacy' | 'advanced' | IDocumentDiffProvider;
}
