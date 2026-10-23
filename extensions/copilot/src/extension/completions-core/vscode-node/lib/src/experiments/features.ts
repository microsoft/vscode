/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../../../platform/log/common/logService';
import { IExperimentationService } from '../../../../../../platform/telemetry/common/nullExperimentationService';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import {
	DEFAULT_MAX_COMPLETION_LENGTH,
	DEFAULT_MAX_PROMPT_LENGTH,
	DEFAULT_PROMPT_ALLOCATION_PERCENT,
	DEFAULT_SUFFIX_MATCH_THRESHOLD
} from '../../../prompt/src/prompt';
import { CopilotToken, ICompletionsCopilotTokenManager } from '../auth/copilotTokenManager';
import { BlockMode } from '../config';
import { TelemetryData, TelemetryWithExp } from '../telemetry';
import { createCompletionsFilters } from './defaultExpFilters';
import { ExpConfig, ExpTreatmentVariables, ExpTreatmentVariableValue } from './expConfig';
import { CompletionsFiltersInfo, ContextProviderExpSettings, ICompletionsFeaturesService } from './featuresService';
import { Filter, FilterSettings } from './filters';

type InternalContextProviderExpSettings = {
	id?: string;
	ids?: string[];
	includeNeighboringFiles?: boolean;
	excludeRelatedFiles?: boolean;
	timeBudget?: number;
	params?: Record<string, string | boolean | number>;
};

/** General-purpose API for accessing ExP variable values. */
export class Features implements ICompletionsFeaturesService {
	declare _serviceBrand: undefined;

	private readonly includeNeighboringFilesDefault: Map<string, boolean>;
	private readonly excludeRelatedFilesDefault: Map<string, boolean>;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@ICompletionsCopilotTokenManager private readonly copilotTokenManager: ICompletionsCopilotTokenManager,
	) {
		this.includeNeighboringFilesDefault = new Map<string, boolean>();
		this.excludeRelatedFilesDefault = new Map<string, boolean>();
	}

	/**
	 * Central logic for obtaining the assignments of treatment groups
	 * for a given set of filters (i.e. descriptors of who is getting the treatment).
	 * Also gets the values of variables controlled by experiment.
	 *
	 * This function should be called **exactly once** at the start of every
	 * 'completion request' in the client (e.g. ghostText, panel request or chat conversation).
	 *
	 * It is called with an initial set of filters, (FeaturesFilterArgs)
	 * but it adds many of its own.
	 * At first the general background filters like extension version.
	 * Then it will check ExP assignments for the first time, to find out
	 * whether there are any assignments of a special granularity
	 * (i.e. the concept that we want to redraw assignments based on
	 * time bucket, or checksum of time, etc).
	 *
	 * On most calls to this function, the assignment fetches will be the
	 * assignments from previously used filters, so they will be cached and return fast.
	 *
	 * @param telemetryData The base telemetry object to which the experimental filters, ExP
	 * variable values, and experimental assignments will be added. All properties and measurements
	 * of the input telemetryData will be present in the output TelemetryWithExp object.
	 * Every telemetry data used to generate ExP scorecards (e.g. ghostText events) must
	 * include the correct experiment assignments in order to properly create those
	 * scorecards.
	 */
	async updateExPValuesAndAssignments(
		filtersInfo?: CompletionsFiltersInfo,
		telemetryData: TelemetryData = TelemetryData.createAndMarkAsIssued()
	): Promise<TelemetryWithExp> {
		// We should not allow accidentally overwriting existing ExP vals/assignments.
		// This doesn't stop all misuse cases, but should prevent some trivial ones.
		if (telemetryData instanceof TelemetryWithExp) {
			throw new Error('updateExPValuesAndAssignments should not be called with TelemetryWithExp');
		}

		const token = this.copilotTokenManager.token ?? await this.copilotTokenManager.getToken();
		const { filters, exp } = this.createExpConfigAndFilters(token);

		return new TelemetryWithExp(telemetryData.properties, telemetryData.measurements, telemetryData.issuedTime, {
			filters,
			exp: exp,
		});
	}

	/**
	 * Request a Copilot token and use that token to call updateExPValuesAndAssignments. Do NOT call this at startup.
	 * Instead, register a onCopilotToken handler and use that token with updateExPValuesAndAssignments directly.
	 */
	async fetchTokenAndUpdateExPValuesAndAssignments(
		filtersInfo?: CompletionsFiltersInfo,
		telemetryData?: TelemetryData
	) {
		return await this.updateExPValuesAndAssignments(filtersInfo, telemetryData);
	}

	private createExpConfigAndFilters(token: CopilotToken) {

		const exp2: Partial<Record<ExpTreatmentVariables, ExpTreatmentVariableValue>> = {};
		for (const varName of Object.values<ExpTreatmentVariables>(ExpTreatmentVariables)) {
			const value = this.experimentationService.getTreatmentVariable(varName);
			if (value !== undefined) {
				exp2[varName] = value;
			}
		}

		const features = Object.entries(exp2).map(([name, value]) => {
			// Based on what tas-client does in https://github.com/microsoft/tas-client/blob/2bd24c976273b671892aad99139af2c7c7dc3b26/tas-client/src/tas-client/FeatureProvider/TasApiFeatureProvider.ts#L59
			return name + (value ? '' : 'cf');
		});
		const exp = new ExpConfig(exp2, features.join(';'));
		const filterMap = this.instantiationService.invokeFunction(createCompletionsFilters, token);
		const filterRecord: Partial<Record<Filter, string>> = {};
		for (const [key, value] of filterMap.entries()) {
			filterRecord[key] = value;
		}

		const filters = new FilterSettings(filterRecord);
		return { filters, exp };
	}

	/** Get the entries from this.assignments corresponding to given settings. */
	async getFallbackExpAndFilters(): Promise<{ filters: FilterSettings; exp: ExpConfig }> {
		const token = this.copilotTokenManager.token ?? await this.copilotTokenManager.getToken();
		return this.createExpConfigAndFilters(token);
	}

	/** Override for BlockMode to send in the request. */
	overrideBlockMode(telemetryWithExp: TelemetryWithExp): BlockMode | undefined {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.OverrideBlockMode] as BlockMode) ||
			undefined
		);
	}

	/** Functions with arguments, passed via object destructuring */

	/** @returns the string for copilotcustomengine, or "" if none is set. */
	customEngine(telemetryWithExp: TelemetryWithExp): string {
		return (telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.CustomEngine] as string) ?? '';
	}

	/** @returns the string for copilotcustomenginetargetengine, or undefined if none is set. */
	customEngineTargetEngine(telemetryWithExp: TelemetryWithExp): string | undefined {
		return telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.CustomEngineTargetEngine] as string;
	}

	/** @returns the percent of prompt tokens to be allocated to the suffix */
	suffixPercent(telemetryWithExp: TelemetryWithExp): number {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.SuffixPercent] as number) ??
			DEFAULT_PROMPT_ALLOCATION_PERCENT.suffix
		);
	}

	/** @returns the percentage match threshold for using the cached suffix */
	suffixMatchThreshold(telemetryWithExp: TelemetryWithExp): number {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.SuffixMatchThreshold] as number) ??
			DEFAULT_SUFFIX_MATCH_THRESHOLD
		);
	}

	/** @returns whether to enable the inclusion of C++ headers as neighbor files. */
	cppHeadersEnableSwitch(telemetryWithExp: TelemetryWithExp): boolean {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.CppHeadersEnableSwitch] as boolean) ??
			false
		);
	}

	/** @returns whether to use included related files as neighbor files for C# (vscode experiment). */
	relatedFilesVSCodeCSharp(telemetryWithExp: TelemetryWithExp): boolean {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCodeCSharp] as boolean) ??
			false
		);
	}

	/** @returns whether to use included related files as neighbor files for TS/JS (vscode experiment). */
	relatedFilesVSCodeTypeScript(telemetryWithExp: TelemetryWithExp): boolean {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[
				ExpTreatmentVariables.RelatedFilesVSCodeTypeScript
			] as boolean) ?? false
		);
	}

	/** @returns whether to use included related files as neighbor files (vscode experiment). */
	relatedFilesVSCode(telemetryWithExp: TelemetryWithExp): boolean {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.RelatedFilesVSCode] as boolean) ?? false
		);
	}

	/** @returns the list of context providers IDs to enable. The special value `*` enables all context providers. */
	contextProviders(telemetryWithExp: TelemetryWithExp): string[] {
		const providers = (telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.ContextProviders] ??
			'') as string;
		if (!providers) {
			return [];
		}
		return providers.split(',').map(provider => provider.trim());
	}

	contextProviderTimeBudget(languageId: string, telemetryWithExp: TelemetryWithExp): number {
		const client = (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.ContextProviderTimeBudget] as number) ??
			150
		);
		if (client) {
			return client;
		}
		const chat = this.getContextProviderExpSettings(languageId);
		return chat?.timeBudget ?? 150;
	}

	setIncludeNeighboringFilesDefault(languageId: string, include: boolean): void {
		this.includeNeighboringFilesDefault.set(languageId, include);
	}

	includeNeighboringFiles(languageId: string, telemetryWithExp: TelemetryWithExp): boolean {
		const client = (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.IncludeNeighboringFiles] as boolean) ??
			false
		);
		if (client) {
			return true;
		}
		const chat = this.getContextProviderExpSettings(languageId);
		return chat?.includeNeighboringFiles ?? this.includeNeighboringFilesDefault.get(languageId) ?? false;
	}

	setExcludeRelatedFilesDefault(languageId: string, exclude: boolean): void {
		this.excludeRelatedFilesDefault.set(languageId, exclude);
	}

	excludeRelatedFiles(languageId: string, telemetryWithExp: TelemetryWithExp): boolean {
		const client = (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.ExcludeRelatedFiles] as boolean) ??
			false
		);
		if (client) {
			return true;
		}
		const chat = this.getContextProviderExpSettings(languageId);
		return chat?.excludeRelatedFiles ?? this.excludeRelatedFilesDefault.get(languageId) ?? false;
	}

	getContextProviderExpSettings(languageId: string): ContextProviderExpSettings | undefined {
		const value = this.experimentationService.getTreatmentVariable<string>(`config.github.copilot.chat.contextprovider.${languageId}`);
		if (typeof value === 'string') {
			try {
				const parsed: Partial<InternalContextProviderExpSettings> = JSON.parse(value);
				const ids = this.getProviderIDs(parsed);
				delete parsed.id;
				delete parsed.ids;
				return Object.assign({ ids }, { includeNeighboringFiles: false, excludeRelatedFiles: false, timeBudget: 150 }, parsed as Omit<InternalContextProviderExpSettings, 'id' | 'ids'>);
			} catch (err) {
				this.instantiationService.invokeFunction((accessor) => {
					const logService = accessor.get(ILogService);
					logService.error(`Failed to parse context provider exp settings for language ${languageId}`);
				});
				return undefined;
			}
		} else {
			return undefined;
		}
	}

	private getProviderIDs(json: InternalContextProviderExpSettings): string[] {
		const result: string[] = [];
		if (typeof json.id === 'string' && json.id.length > 0) {
			result.push(json.id);
		}
		if (Array.isArray(json.ids)) {
			for (const id of json.ids) {
				if (typeof id === 'string' && id.length > 0) {
					result.push(id);
				}
			}
		}
		return result;
	}

	/** @returns the maximal number of tokens of prompt AND completion */
	maxPromptCompletionTokens(telemetryWithExp: TelemetryWithExp): number {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.MaxPromptCompletionTokens] as number) ??
			DEFAULT_MAX_PROMPT_LENGTH + DEFAULT_MAX_COMPLETION_LENGTH
		);
	}

	stableContextPercent(telemetryWithExp: TelemetryWithExp): number {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.StableContextPercent] as number) ??
			DEFAULT_PROMPT_ALLOCATION_PERCENT.stableContext
		);
	}

	volatileContextPercent(telemetryWithExp: TelemetryWithExp): number {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.VolatileContextPercent] as number) ??
			DEFAULT_PROMPT_ALLOCATION_PERCENT.volatileContext
		);
	}

	/** Custom parameters for language specific Context Providers. */
	cppContextProviderParams(telemetryWithExp: TelemetryWithExp): string | undefined {
		const cppContextProviderParams = telemetryWithExp.filtersAndExp.exp.variables[
			ExpTreatmentVariables.CppContextProviderParams
		] as string;
		return cppContextProviderParams;
	}

	csharpContextProviderParams(telemetryWithExp: TelemetryWithExp): string | undefined {
		const csharpContextProviderParams = telemetryWithExp.filtersAndExp.exp.variables[
			ExpTreatmentVariables.CSharpContextProviderParams
		] as string;
		return csharpContextProviderParams;
	}

	javaContextProviderParams(telemetryWithExp: TelemetryWithExp): string | undefined {
		const javaContextProviderParams = telemetryWithExp.filtersAndExp.exp.variables[
			ExpTreatmentVariables.JavaContextProviderParams
		] as string;
		return javaContextProviderParams;
	}

	multiLanguageContextProviderParams(telemetryWithExp: TelemetryWithExp): string | undefined {
		const multiLanguageContextProviderParams = telemetryWithExp.filtersAndExp.exp.variables[
			ExpTreatmentVariables.MultiLanguageContextProviderParams
		] as string;
		return multiLanguageContextProviderParams;
	}

	tsContextProviderParams(telemetryWithExp: TelemetryWithExp): string | undefined {
		const tsContextProviderParams = telemetryWithExp.filtersAndExp.exp.variables[
			ExpTreatmentVariables.TsContextProviderParams
		] as string;
		return tsContextProviderParams;
	}

	completionsDebounce(telemetryWithExp: TelemetryWithExp): number | undefined {
		return telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.CompletionsDebounce] as
			| number
			| undefined;
	}

	enableElectronFetcher(telemetryWithExp: TelemetryWithExp): boolean {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.ElectronFetcher] as boolean) ?? false
		);
	}

	enableFetchFetcher(telemetryWithExp: TelemetryWithExp): boolean {
		return (telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.FetchFetcher] as boolean) ?? false;
	}

	asyncCompletionsTimeout(telemetryWithExp: TelemetryWithExp): number {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.AsyncCompletionsTimeout] as number) ??
			200
		);
	}

	enableProgressiveReveal(telemetryWithExp: TelemetryWithExp): boolean {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.ProgressiveReveal] as boolean) ?? false
		);
	}

	modelAlwaysTerminatesSingleline(telemetryWithExp: TelemetryWithExp): boolean {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[
				ExpTreatmentVariables.ModelAlwaysTerminatesSingleline
			] as boolean) ?? true
		);
	}

	longLookaheadSize(telemetryWithExp: TelemetryWithExp): number {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[
				ExpTreatmentVariables.ProgressiveRevealLongLookaheadSize
			] as number) ?? 9
		);
	}

	shortLookaheadSize(telemetryWithExp: TelemetryWithExp): number {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[
				ExpTreatmentVariables.ProgressiveRevealShortLookaheadSize
			] as number) ?? 3
		);
	}

	maxMultilineTokens(telemetryWithExp: TelemetryWithExp): number {
		// p50 line length is 19 characters (p95 is 73)
		// average token length is around 4 characters
		// the below value has quite a bit of buffer while bringing the limit in significantly from 500
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.MaxMultilineTokens] as number) ?? 200
		);
	}

	multilineAfterAcceptLines(telemetryWithExp: TelemetryWithExp): number {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.MultilineAfterAcceptLines] as number) ??
			1
		);
	}

	completionsDelay(telemetryWithExp: TelemetryWithExp): number {
		return (telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.CompletionsDelay] as number) ?? 200;
	}

	singleLineUnlessAccepted(telemetryWithExp: TelemetryWithExp): boolean {
		return (
			(telemetryWithExp.filtersAndExp.exp.variables[ExpTreatmentVariables.SingleLineUnlessAccepted] as boolean) ??
			false
		);
	}
}
