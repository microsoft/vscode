/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { createWebWorker } from '../../../base/browser/defaultWorkerFactory.js';
import { URI } from '../../../base/common/uri.js';
import { Proxied } from '../../../base/common/worker/simpleWorker.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IV8Profile } from '../common/profiling.js';
import { BottomUpSample } from '../common/profilingModel.js';
import { reportSample } from '../common/profilingTelemetrySpec.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';

export const enum ProfilingOutput {
	Failure,
	Irrelevant,
	Interesting,
}

export interface IScriptUrlClassifier {
	(scriptUrl: string): string;
}

export const IProfileAnalysisWorkerService = createDecorator<IProfileAnalysisWorkerService>('IProfileAnalysisWorkerService');

export interface IProfileAnalysisWorkerService {
	readonly _serviceBrand: undefined;
	analyseBottomUp(profile: IV8Profile, callFrameClassifier: IScriptUrlClassifier, perfBaseline: number, sendAsErrorTelemtry: boolean): Promise<ProfilingOutput>;
	analyseByLocation(profile: IV8Profile, locations: [location: URI, id: string][]): Promise<[category: string, aggregated: number][]>;
}


// ---- impl

class ProfileAnalysisWorkerService implements IProfileAnalysisWorkerService {

	declare _serviceBrand: undefined;

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) { }

	private async _withWorker<R>(callback: (worker: Proxied<IProfileAnalysisWorker>) => Promise<R>): Promise<R> {

		const worker = createWebWorker<IProfileAnalysisWorker>(
			'vs/platform/profiling/electron-sandbox/profileAnalysisWorker',
			'CpuProfileAnalysisWorker'
		);

		try {
			const r = await callback(worker.proxy);
			return r;
		} finally {
			worker.dispose();
		}
	}

	async analyseBottomUp(profile: IV8Profile, callFrameClassifier: IScriptUrlClassifier, perfBaseline: number, sendAsErrorTelemtry: boolean): Promise<ProfilingOutput> {
		return this._withWorker(async worker => {
			const result = await worker.$analyseBottomUp(profile);
			if (result.kind === ProfilingOutput.Interesting) {
				for (const sample of result.samples) {
					reportSample({
						sample,
						perfBaseline,
						source: callFrameClassifier(sample.url)
					}, this._telemetryService, this._logService, sendAsErrorTelemtry);
				}
			}
			return result.kind;
		});
	}

	async analyseByLocation(profile: IV8Profile, locations: [location: URI, id: string][]): Promise<[category: string, aggregated: number][]> {
		return this._withWorker(async worker => {
			const result = await worker.$analyseByUrlCategory(profile, locations);
			return result;
		});
	}
}

// ---- worker contract

export interface BottomUpAnalysis {
	kind: ProfilingOutput;
	samples: BottomUpSample[];
}

export interface CategoryAnalysis {
	category: string;
	percentage: number;
	aggregated: number;
	overallDuration: number;
}

export interface IProfileAnalysisWorker {
	$analyseBottomUp(profile: IV8Profile): BottomUpAnalysis;
	$analyseByUrlCategory(profile: IV8Profile, categories: [url: URI, category: string][]): [category: string, aggregated: number][];
}

registerSingleton(IProfileAnalysisWorkerService, ProfileAnalysisWorkerService, InstantiationType.Delayed);
