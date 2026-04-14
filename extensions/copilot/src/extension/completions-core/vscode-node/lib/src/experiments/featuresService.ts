/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../../../../util/common/services';
import { BlockMode } from '../config';
import { TelemetryData, TelemetryWithExp } from '../telemetry';
import { ExpConfig } from './expConfig';
import { FilterSettings } from './filters';

export type CompletionsFiltersInfo = { uri: string; languageId: string };

export type ContextProviderExpSettings = {
	ids: string[];
	includeNeighboringFiles: boolean;
	excludeRelatedFiles: boolean;
	timeBudget: number;
	params?: Record<string, string | boolean | number>;
}

export const ICompletionsFeaturesService = createServiceIdentifier<ICompletionsFeaturesService>('ICompletionsFeaturesService');
export interface ICompletionsFeaturesService {
	readonly _serviceBrand: undefined;
	updateExPValuesAndAssignments(
		filtersInfo?: CompletionsFiltersInfo,
		telemetryData?: TelemetryData
	): Promise<TelemetryWithExp>;
	fetchTokenAndUpdateExPValuesAndAssignments(
		filtersInfo?: CompletionsFiltersInfo,
		telemetryData?: TelemetryData
	): Promise<TelemetryWithExp>;
	getFallbackExpAndFilters(): Promise<{ filters: FilterSettings; exp: ExpConfig }>;
	overrideBlockMode(telemetryWithExp: TelemetryWithExp): BlockMode | undefined;
	customEngine(telemetryWithExp: TelemetryWithExp): string;
	customEngineTargetEngine(telemetryWithExp: TelemetryWithExp): string | undefined;
	suffixPercent(telemetryWithExp: TelemetryWithExp): number;
	suffixMatchThreshold(telemetryWithExp: TelemetryWithExp): number;
	cppHeadersEnableSwitch(telemetryWithExp: TelemetryWithExp): boolean;
	relatedFilesVSCodeCSharp(telemetryWithExp: TelemetryWithExp): boolean;
	relatedFilesVSCodeTypeScript(telemetryWithExp: TelemetryWithExp): boolean;
	relatedFilesVSCode(telemetryWithExp: TelemetryWithExp): boolean;
	contextProviders(telemetryWithExp: TelemetryWithExp): string[];
	contextProviderTimeBudget(languageId: string, telemetryWithExp: TelemetryWithExp): number;
	setIncludeNeighboringFilesDefault(languageId: string, include: boolean): void;
	includeNeighboringFiles(languageId: string, telemetryWithExp: TelemetryWithExp): boolean;
	setExcludeRelatedFilesDefault(languageId: string, exclude: boolean): void;
	excludeRelatedFiles(languageId: string, telemetryWithExp: TelemetryWithExp): boolean;
	getContextProviderExpSettings(languageId: string): ContextProviderExpSettings | undefined;
	maxPromptCompletionTokens(telemetryWithExp: TelemetryWithExp): number;
	stableContextPercent(telemetryWithExp: TelemetryWithExp): number;
	volatileContextPercent(telemetryWithExp: TelemetryWithExp): number;
	cppContextProviderParams(telemetryWithExp: TelemetryWithExp): string | undefined;
	csharpContextProviderParams(telemetryWithExp: TelemetryWithExp): string | undefined;
	javaContextProviderParams(telemetryWithExp: TelemetryWithExp): string | undefined;
	multiLanguageContextProviderParams(telemetryWithExp: TelemetryWithExp): string | undefined;
	tsContextProviderParams(telemetryWithExp: TelemetryWithExp): string | undefined;
	completionsDebounce(telemetryWithExp: TelemetryWithExp): number | undefined;
	enableElectronFetcher(telemetryWithExp: TelemetryWithExp): boolean;
	enableFetchFetcher(telemetryWithExp: TelemetryWithExp): boolean;
	asyncCompletionsTimeout(telemetryWithExp: TelemetryWithExp): number;
	enableProgressiveReveal(telemetryWithExp: TelemetryWithExp): boolean;
	modelAlwaysTerminatesSingleline(telemetryWithExp: TelemetryWithExp): boolean;
	longLookaheadSize(telemetryWithExp: TelemetryWithExp): number;
	shortLookaheadSize(telemetryWithExp: TelemetryWithExp): number;
	maxMultilineTokens(telemetryWithExp: TelemetryWithExp): number;
	multilineAfterAcceptLines(telemetryWithExp: TelemetryWithExp): number;
	completionsDelay(telemetryWithExp: TelemetryWithExp): number;
	singleLineUnlessAccepted(telemetryWithExp: TelemetryWithExp): boolean;
}