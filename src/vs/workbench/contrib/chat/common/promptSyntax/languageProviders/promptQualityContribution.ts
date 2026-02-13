/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { IMarkerData, IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ILanguageModelsService } from '../../languageModels.js';
import { getPromptsTypeForLanguageId } from '../promptTypes.js';
import { PromptStaticQualityAnalyzer } from './promptStaticQualityAnalyzer.js';
import { PromptLlmQualityAnalyzer } from './promptLlmQualityAnalyzer.js';
import { IPromptsService } from '../service/promptsService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';

export const QUALITY_MARKERS_OWNER_ID = 'prompt-quality-diagnostics';

/** Debounce for static analysis after typing pauses. */
const STATIC_DEBOUNCE_MS = 400;

/** Debounce for LLM analysis \u2014 longer to avoid excessive API calls. */
const LLM_DEBOUNCE_MS = 3000;

/**
 * Contribution that provides prompt quality diagnostics using both static
 * and LLM-powered analysis. Runs alongside the existing
 * {@link PromptValidatorContribution} which handles header/structural
 * validation.
 */
export class PromptQualityContribution extends Disposable {

	private readonly localDisposables = this._register(new DisposableStore());
	private readonly staticAnalyzer: PromptStaticQualityAnalyzer;
	private readonly llmAnalyzer: PromptLlmQualityAnalyzer;

	constructor(
		@IModelService private readonly modelService: IModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@ILogService logService: ILogService,
	) {
		super();

		this.staticAnalyzer = new PromptStaticQualityAnalyzer();
		this.llmAnalyzer = new PromptLlmQualityAnalyzer(languageModelsService, logService);

		this.updateRegistration();
	}

	private updateRegistration(): void {
		this.localDisposables.clear();

		const trackers = new ResourceMap<QualityModelTracker>();
		this.localDisposables.add(toDisposable(() => {
			trackers.forEach(t => t.dispose());
			trackers.clear();
		}));

		const maybeTrack = (model: ITextModel): void => {
			const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
			if (promptType && !trackers.has(model.uri)) {
				trackers.set(model.uri, this.instantiationService.createInstance(
					QualityModelTracker,
					model,
					this.staticAnalyzer,
					this.llmAnalyzer,
				));
			}
		};

		this.modelService.getModels().forEach(maybeTrack);

		this.localDisposables.add(this.modelService.onModelAdded(maybeTrack));

		this.localDisposables.add(this.modelService.onModelRemoved((model) => {
			const tracker = trackers.get(model.uri);
			if (tracker) {
				tracker.dispose();
				trackers.delete(model.uri);
			}
		}));

		this.localDisposables.add(this.modelService.onModelLanguageChanged(({ model }) => {
			const tracker = trackers.get(model.uri);
			if (tracker) {
				tracker.dispose();
				trackers.delete(model.uri);
			}
			maybeTrack(model);
		}));
	}
}

// ---------------------------------------------------------------------------

/**
 * Per-model tracker that debounces static and LLM quality analysis.
 */
class QualityModelTracker extends Disposable {

	private readonly staticDelayer: Delayer<void>;
	private readonly llmDelayer: Delayer<void>;
	private readonly llmCts = this._register(new MutableDisposable<CancellationTokenSource>());

	/** Last static analysis markers \u2014 used to merge with LLM results. */
	private lastStaticMarkers: IMarkerData[] = [];

	constructor(
		private readonly textModel: ITextModel,
		private readonly staticAnalyzer: PromptStaticQualityAnalyzer,
		private readonly llmAnalyzer: PromptLlmQualityAnalyzer,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMarkerService private readonly markerService: IMarkerService,
	) {
		super();

		this.staticDelayer = this._register(new Delayer(STATIC_DEBOUNCE_MS));
		this.llmDelayer = this._register(new Delayer(LLM_DEBOUNCE_MS));

		this._register(textModel.onDidChangeContent(() => {
			this.runStaticAnalysis();
			this.scheduleLlmAnalysis();
		}));

		// Initial analysis
		this.runStaticAnalysis();
		this.scheduleLlmAnalysis();
	}

	private getBodyStartLine(): number {
		const ast = this.promptsService.getParsedPromptFile(this.textModel);
		if (ast.body) {
			return ast.body.range.startLineNumber;
		}
		return 1;
	}

	private runStaticAnalysis(): void {
		this.staticDelayer.trigger(() => {
			const markers: IMarkerData[] = [];
			const bodyStart = this.getBodyStartLine();
			this.staticAnalyzer.analyze(this.textModel, bodyStart, m => markers.push(m));
			this.lastStaticMarkers = markers;
			this.markerService.changeOne(QUALITY_MARKERS_OWNER_ID, this.textModel.uri, markers);
		});
	}

	private scheduleLlmAnalysis(): void {
		const enabled = this.configurationService.getValue<boolean>('chat.promptQualityAnalysis.llm.enabled');
		if (enabled === false) {
			return;
		}

		this.llmDelayer.trigger(async () => {
			const cts = new CancellationTokenSource();
			this.llmCts.value = cts;

			try {
				const llmMarkers: IMarkerData[] = [];
				const bodyStart = this.getBodyStartLine();
				await this.llmAnalyzer.analyze(this.textModel, bodyStart, cts.token, m => llmMarkers.push(m));

				if (!cts.token.isCancellationRequested) {
					this.markerService.changeOne(
						QUALITY_MARKERS_OWNER_ID,
						this.textModel.uri,
						[...this.lastStaticMarkers, ...llmMarkers],
					);
				}
			} catch {
				// LLM analysis is best-effort
			}
		});
	}

	public override dispose(): void {
		this.markerService.remove(QUALITY_MARKERS_OWNER_ID, [this.textModel.uri]);
		super.dispose();
	}
}
