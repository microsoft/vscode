/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { IDocumentDiff, IDocumentDiffProvider, IDocumentDiffProviderOptions } from 'vs/editor/common/diff/documentDiffProvider';
import { ITextModel } from 'vs/editor/common/model';
import { DiffAlgorithmName, IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class WorkerBasedDocumentDiffProvider implements IDocumentDiffProvider, IDisposable {
	private onDidChangeEventEmitter = new Emitter<void>();
	public readonly onDidChange: Event<void> = this.onDidChangeEventEmitter.event;

	private diffAlgorithm: DiffAlgorithmName | IDocumentDiffProvider = 'advanced';
	private diffAlgorithmOnDidChangeSubscription: IDisposable | undefined = undefined;

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

	async computeDiff(original: ITextModel, modified: ITextModel, options: IDocumentDiffProviderOptions): Promise<IDocumentDiff> {
		if (typeof this.diffAlgorithm !== 'string') {
			return this.diffAlgorithm.computeDiff(original, modified, options);
		}

		const sw = StopWatch.create(true);
		const result = await this.editorWorkerService.computeDiff(original.uri, modified.uri, options, this.diffAlgorithm);
		const timeMs = sw.elapsed();

		this.telemetryService.publicLog2<{
			timeMs: number;
			timedOut: boolean;
		}, {
			owner: 'hediet';

			timeMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'To understand if the new diff algorithm is slower/faster than the old one' };
			timedOut: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'To understand how often the new diff algorithm times out' };

			comment: 'This event gives insight about the performance of the new diff algorithm.';
		}>('diffEditor.computeDiff', {
			timeMs,
			timedOut: result?.quitEarly ?? true,
		});

		if (!result) {
			throw new Error('no diff result available');
		}

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
