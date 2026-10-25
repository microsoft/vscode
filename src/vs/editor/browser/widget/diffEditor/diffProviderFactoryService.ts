/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { LineRange } from '../../../common/core/ranges/lineRange.js';
import { IDocumentDiff, IDocumentDiffProvider, IDocumentDiffProviderOptions } from '../../../common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../common/diff/rangeMapping.js';
import { ITextModel } from '../../../common/model.js';
import { DiffAlgorithmName, IEditorWorkerService } from '../../../common/services/editorWorker.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export const IDiffProviderFactoryService = createDecorator<IDiffProviderFactoryService>('diffProviderFactoryService');

export interface IDocumentDiffFactoryOptions {
	readonly diffAlgorithm?: 'legacy' | 'advanced' | 'advanced-external' | 'advanced-wasm';
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
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		this.setOptions(options);
	}

	public dispose(): void {
		this.diffAlgorithmOnDidChangeSubscription?.dispose();
		this.onDidChangeEventEmitter.dispose();
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

		this._compareDiffAlgorithmsSampled(original, modified, options, this.diffAlgorithm);

		// max 10 items in cache
		if (WorkerBasedDocumentDiffProvider.diffCache.size > 10) {
			WorkerBasedDocumentDiffProvider.diffCache.delete(WorkerBasedDocumentDiffProvider.diffCache.keys().next().value!);
		}

		WorkerBasedDocumentDiffProvider.diffCache.set(uriKey, { result, context });
		return result;
	}

	/**
	 * Runs on a sample of diffs, controlled by experiment settings, to compare a candidate diff algorithm
	 * against the configured one. Runs after the diff has been returned and only reports metadata.
	 */
	private _compareDiffAlgorithmsSampled(original: ITextModel, modified: ITextModel, options: IDocumentDiffProviderOptions, primary: DiffAlgorithmName): void {
		const secondary = this.configurationService.getValue<DiffAlgorithmName | 'none'>('diffEditor.experimental.compareDiffAlgorithm');
		const sampleRate = this.configurationService.getValue<number>('diffEditor.experimental.compareDiffAlgorithmSampleRate');
		// Without a time limit, a slow comparison could block the diff worker indefinitely.
		if (!secondary || secondary === 'none' || secondary === primary || !(Math.random() < sampleRate) || options.maxComputationTimeMs === 0) {
			return;
		}
		const originalLineCount = original.getLineCount();
		const modifiedLineCount = modified.getLineCount();

		this.editorWorkerService.compareDiffAlgorithms(original.uri, modified.uri, options, primary, secondary).then(comparison => {
			if (!comparison) {
				return;
			}
			this.telemetryService.publicLog2<DiffAlgorithmComparisonEvent, DiffAlgorithmComparisonClassification>('diffEditor.compareDiffAlgorithms', {
				primaryAlgorithm: primary,
				secondaryAlgorithm: secondary,
				ignoreTrimWhitespace: options.ignoreTrimWhitespace,
				originalLineCount,
				modifiedLineCount,
				isIdentical: comparison.isIdentical,
				primaryTimeMs: comparison.primary.timeMs,
				primaryThrew: comparison.primary.threw,
				primaryHitTimeout: comparison.primary.hitTimeout,
				primaryChangeCount: comparison.primary.changeCount,
				primaryValidity: comparison.primary.validity,
				secondaryTimeMs: comparison.secondary.timeMs,
				secondaryThrew: comparison.secondary.threw,
				secondaryHitTimeout: comparison.secondary.hitTimeout,
				secondaryChangeCount: comparison.secondary.changeCount,
				secondaryValidity: comparison.secondary.validity,
			});
		}, () => { /* comparisons must never affect the diff editor */ });
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
	readonly diffAlgorithm?: 'legacy' | 'advanced' | 'advanced-external' | 'advanced-wasm' | IDocumentDiffProvider;
}

type DiffAlgorithmComparisonEvent = {
	primaryAlgorithm: string;
	secondaryAlgorithm: string;
	ignoreTrimWhitespace: boolean;
	originalLineCount: number;
	modifiedLineCount: number;
	isIdentical: boolean;
	primaryTimeMs: number;
	primaryThrew: boolean;
	primaryHitTimeout: boolean;
	primaryChangeCount: number;
	primaryValidity: string;
	secondaryTimeMs: number;
	secondaryThrew: boolean;
	secondaryHitTimeout: boolean;
	secondaryChangeCount: number;
	secondaryValidity: string;
};

type DiffAlgorithmComparisonClassification = {
	owner: 'hediet';
	comment: 'Compares the speed and correctness of a candidate diff algorithm with the configured one on a sample of diffs, to decide whether the candidate can replace it.';
	primaryAlgorithm: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The configured diff algorithm.' };
	secondaryAlgorithm: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The candidate diff algorithm it is compared with.' };
	ignoreTrimWhitespace: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether leading/trailing whitespace changes were ignored.' };
	originalLineCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Line count of the original document, to relate timings to input size.' };
	modifiedLineCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Line count of the modified document, to relate timings to input size.' };
	isIdentical: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether both algorithms produced the same changes.' };
	primaryTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time the configured algorithm took, in milliseconds.' };
	primaryThrew: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the configured algorithm threw.' };
	primaryHitTimeout: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the configured algorithm hit the time limit.' };
	primaryChangeCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of line changes of the configured algorithm.' };
	primaryValidity: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the configured algorithm\'s changes reproduce the modified document (valid, invalid or unverified).' };
	secondaryTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time the candidate algorithm took, in milliseconds.' };
	secondaryThrew: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the candidate algorithm threw.' };
	secondaryHitTimeout: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the candidate algorithm hit the time limit.' };
	secondaryChangeCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of line changes of the candidate algorithm.' };
	secondaryValidity: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the candidate algorithm\'s changes reproduce the modified document (valid, invalid or unverified).' };
};
