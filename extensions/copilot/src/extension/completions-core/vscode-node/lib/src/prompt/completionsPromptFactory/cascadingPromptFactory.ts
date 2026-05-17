/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIgnoreService } from '../../../../../../../platform/ignore/common/ignoreService';
import { URI } from '../../../../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsTelemetryService } from '../../../../bridge/src/completionsTelemetryServiceBridge';
import { ComponentStatistics, PromptMetadata } from '../../../../prompt/src/components/components';
import { commentBlockAsSingles } from '../../../../prompt/src/languageMarker';
import { PromptComponentAllocation, PromptComponentId } from '../../../../prompt/src/prompt';
import { TokenizerName } from '../../../../prompt/src/tokenization';
import { CancellationToken } from '../../../../types/src';
import { CompletionState } from '../../completionState';
import { ICompletionsFeaturesService } from '../../experiments/featuresService';
import { ICompletionsLogTargetService, logger } from '../../logger';
import { telemetryException, TelemetryWithExp } from '../../telemetry';
import { TextDocumentContents } from '../../textDocument';
import { ICompletionsContextProviderBridgeService } from '../components/contextProviderBridge';
import {
	renderWithMetadata,
	type RenderedComponent,
	type ValidatedContextItems,
	type VirtualPromptComponent,
} from '../components/virtualComponent';
import {
	ContextProviderTelemetry,
	matchContextItems,
	ResolvedContextItem,
	telemetrizeContextItems,
	useContextProviderAPI,
} from '../contextProviderRegistry';
import { getCodeSnippetsFromContextItems } from '../contextProviders/codeSnippets';
import { CodeSnippetWithId, TraitWithId } from '../contextProviders/contextItemSchemas';
import { getTraitsFromContextItems, ReportTraitsTelemetry } from '../contextProviders/traits';
import { componentStatisticsToPromptMatcher, ICompletionsContextProviderService } from '../contextProviderStatistics';
import {
	_contextTooShort,
	_copilotContentExclusion,
	_promptCancelled,
	_promptError,
	getPromptOptions,
	MIN_PROMPT_CHARS,
	MIN_PROMPT_EXCLUDED_LANGUAGE_IDS,
	PromptResponse,
	trimLastLine,
} from '../prompt';
import {
	CompletionsPromptOptions,
	ICompletionsPromptFactoryService
} from './completionsPromptFactory';

// If the space allocated to the suffix is at least this fraction of the estimated suffix cost,
// we will render the suffix before the prefix and use any surplus suffix budget to fill the prefix.
// Otherwise, we render the prefix first and use any surplus prefix budget to fill the suffix.
const SMALL_SUFFIX_THRESHOLD = 0.8;

export abstract class CascadingPromptFactory implements ICompletionsPromptFactoryService {
	declare _serviceBrand: undefined;
	private renderId = 0;

	constructor(
		protected components: Record<PromptComponentId, VirtualPromptComponent>,
		@IIgnoreService protected readonly ignoreService: IIgnoreService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@ICompletionsFeaturesService protected readonly featuresService: ICompletionsFeaturesService,
		@ICompletionsTelemetryService protected readonly completionsTelemetryService: ICompletionsTelemetryService,
		@ICompletionsContextProviderBridgeService protected readonly contextProviderBridge: ICompletionsContextProviderBridgeService,
		@ICompletionsLogTargetService protected readonly logTargetService: ICompletionsLogTargetService,
		@ICompletionsContextProviderService protected readonly contextProviderStatistics: ICompletionsContextProviderService,
	) { }

	async prompt(opts: CompletionsPromptOptions, cancellationToken?: CancellationToken): Promise<PromptResponse> {
		try {
			return await this.createPromptUnsafe(opts, cancellationToken);
		} catch (e) {
			return this.errorPrompt(e as Error);
		}
	}

	getComponentAllocation(telemetryData: TelemetryWithExp): PromptComponentAllocation {
		const suffixPercent = this.featuresService.suffixPercent(telemetryData);
		const stableContextPercent = this.featuresService.stableContextPercent(telemetryData);
		const volatileContextPercent = this.featuresService.volatileContextPercent(telemetryData);

		if (suffixPercent < 0 || suffixPercent > 100) {
			throw new Error(`suffixPercent must be between 0 and 100, but was ${suffixPercent}`);
		}

		if (stableContextPercent < 0 || stableContextPercent > 100) {
			throw new Error(`stableContextPercent must be between 0 and 100, but was ${stableContextPercent}`);
		}

		if (volatileContextPercent < 0 || volatileContextPercent > 100) {
			throw new Error(`volatileContextPercent must be between 0 and 100, but was ${volatileContextPercent}`);
		}

		const prefixPercent = 100 - suffixPercent - stableContextPercent - volatileContextPercent;
		if (prefixPercent <= 1 || prefixPercent > 100) {
			throw new Error(`prefixPercent must be between 1 and 100, but was ${prefixPercent}`);
		}

		return {
			prefix: prefixPercent / 100,
			suffix: suffixPercent / 100,
			stableContext: stableContextPercent / 100,
			volatileContext: volatileContextPercent / 100,
		};
	}

	private async createPromptUnsafe(
		opts: CompletionsPromptOptions,
		cancellationToken?: CancellationToken
	): Promise<PromptResponse> {
		this.renderId++;
		const { completionId, completionState, telemetryData, promptOpts } = opts;
		const failFastPrompt = await this.failFastPrompt(completionState.textDocument, cancellationToken);
		if (failFastPrompt) {
			return failFastPrompt;
		}

		const languageId = completionState.textDocument.detectedLanguageId;
		const start = performance.now();
		let contextItems;
		if (this.instantiationService.invokeFunction(useContextProviderAPI, languageId, telemetryData)) {
			contextItems = await this.resolveContext(completionId, completionState, telemetryData, cancellationToken);
		}
		const updateDataTimeMs = performance.now() - start;
		const renderedComponents: Partial<Record<PromptComponentId, RenderedComponent>> = {};
		const aggregatedMetadata: PromptMetadata = {
			renderId: this.renderId,
			rendererName: 'w',
			tokenizer: promptOpts?.tokenizer ?? TokenizerName.o200k,
			elisionTimeMs: 0,
			renderTimeMs: 0,
			updateDataTimeMs: updateDataTimeMs,
			componentStatistics: [],
		};

		const { maxPromptLength } = this.instantiationService.invokeFunction(getPromptOptions, telemetryData, languageId);
		const allocation = this.getComponentAllocation(telemetryData);

		const suffixAllocation = allocation.suffix * maxPromptLength;
		const estimatedMaxSuffixCost = this.components.suffix.estimatedCost?.(opts, contextItems);
		let cascadeOrder: PromptComponentId[] = ['stableContext', 'volatileContext', 'prefix', 'suffix'];
		if (suffixAllocation > SMALL_SUFFIX_THRESHOLD * (estimatedMaxSuffixCost ?? 0)) {
			cascadeOrder = ['stableContext', 'volatileContext', 'suffix', 'prefix'];
		}

		let surplusBudget = 0;
		// Allocate excess budget in cascade order
		for (const id of cascadeOrder) {
			const componentBudget = surplusBudget + maxPromptLength * allocation[id];
			const rendered = renderWithMetadata(this.components[id], componentBudget, opts, contextItems);
			surplusBudget = componentBudget - rendered.cost;
			renderedComponents[id] = rendered;
			aggregateMetadata(aggregatedMetadata, rendered.metadata);
		}

		const [prefix, trailingWs] = trimLastLine(renderedComponents.prefix!.text);

		const end = performance.now();
		const contextProvidersTelemetry = this.instantiationService.invokeFunction(useContextProviderAPI, languageId, telemetryData)
			? this.telemetrizeContext(
				completionId,
				aggregatedMetadata.componentStatistics,
				contextItems?.resolvedContextItems ?? []
			)
			: [];

		const context = [
			renderedComponents.stableContext!.text.trim(),
			renderedComponents.volatileContext!.text.trim(),
		];
		const prefixWithContext = promptOpts?.separateContext
			? prefix
			: // This should not happen, since we always separate context. If it does happen,
			// the token counts for the prefix will be wrong, since the workspace context
			// will have comment markers.
			commentBlockAsSingles(context.join('\n'), languageId) + '\n\n' + prefix;

		return {
			type: 'prompt',
			prompt: {
				prefix: prefixWithContext,
				prefixTokens:
					renderedComponents.prefix!.cost +
					renderedComponents.stableContext!.cost +
					renderedComponents.volatileContext!.cost,
				suffix: renderedComponents.suffix!.text,
				suffixTokens: renderedComponents.suffix!.cost,
				context: promptOpts?.separateContext ? context : undefined,
				isFimEnabled: renderedComponents.suffix!.text.length > 0,
			},
			computeTimeMs: end - start,
			trailingWs,
			neighborSource: new Map(),
			metadata: aggregatedMetadata,
			contextProvidersTelemetry,
		};
	}

	private async resolveContext(
		completionId: string,
		completionState: CompletionState,
		telemetryData: TelemetryWithExp,
		cancellationToken?: CancellationToken
	): Promise<ValidatedContextItems & { resolvedContextItems: ResolvedContextItem[] }> {
		const resolvedContextItems: ResolvedContextItem[] = await this.contextProviderBridge.resolution(completionId);
		const { textDocument } = completionState;
		const matchedContextItems = resolvedContextItems.filter(matchContextItems);

		const traits: TraitWithId[] = this.instantiationService.invokeFunction(getTraitsFromContextItems, completionId, matchedContextItems);
		void this.instantiationService.invokeFunction(ReportTraitsTelemetry,
			`contextProvider.traits`,
			traits,
			textDocument.detectedLanguageId,
			textDocument.detectedLanguageId, // TextDocumentContext does not have clientLanguageId
			telemetryData
		);

		const codeSnippets: CodeSnippetWithId[] = await this.instantiationService.invokeFunction(getCodeSnippetsFromContextItems,
			completionId,
			matchedContextItems,
			textDocument.detectedLanguageId
		);
		return { traits, codeSnippets, resolvedContextItems };
	}

	private telemetrizeContext(
		completionId: string,
		componentStatistics: ComponentStatistics[],
		resolvedContextItems: ResolvedContextItem[]
	): ContextProviderTelemetry[] {
		const promptMatcher = componentStatisticsToPromptMatcher(componentStatistics);
		this.contextProviderStatistics.getStatisticsForCompletion(completionId).computeMatch(promptMatcher);
		const contextProvidersTelemetry = telemetrizeContextItems(this.contextProviderStatistics, completionId, resolvedContextItems);
		// To support generating context provider metrics of completion in COffE.
		logger.debug(this.logTargetService, `Context providers telemetry: '${JSON.stringify(contextProvidersTelemetry)}'`);
		return contextProvidersTelemetry;
	}

	private async failFastPrompt(textDocument: TextDocumentContents, cancellationToken: CancellationToken | undefined) {
		if (cancellationToken?.isCancellationRequested) {
			return _promptCancelled;
		}
		if (await this.ignoreService.isCopilotIgnored(URI.parse(textDocument.uri))) {
			return _copilotContentExclusion;
		}

		if (textDocument.getText().length < MIN_PROMPT_CHARS && !MIN_PROMPT_EXCLUDED_LANGUAGE_IDS.includes(textDocument.detectedLanguageId)) {
			// Too short context
			return _contextTooShort;
		}
	}

	private errorPrompt(error: Error): PromptResponse {
		telemetryException(this.completionsTelemetryService, error, 'WorkspaceContextPromptFactory');
		return _promptError;
	}
}

function aggregateMetadata(aggregated: PromptMetadata, metadata: PromptMetadata): void {
	aggregated.elisionTimeMs += metadata.elisionTimeMs;
	aggregated.renderTimeMs += metadata.renderTimeMs;
	aggregated.updateDataTimeMs += metadata.updateDataTimeMs;
	aggregated.componentStatistics.push(...metadata.componentStatistics);
}
