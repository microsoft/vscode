/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { TelemetryData, telemetryExpProblem } from '../telemetry';
import { ExpServiceTelemetryNames } from './telemetryNames';

// All variables we pull from Exp and might want to use
export enum ExpTreatmentVariables {
	// the engine we want to request, used in actual experiment(s)
	CustomEngine = 'copilotcustomengine',
	// if set, any custom engine (see previous) will only apply when the current engine matches the value of this variable
	CustomEngineTargetEngine = 'copilotcustomenginetargetengine',

	OverrideBlockMode = 'copilotoverrideblockmode',
	SuffixPercent = 'CopilotSuffixPercent', // the percentage of the prompt tokens to allocate to the suffix
	CppHeadersEnableSwitch = 'copilotcppheadersenableswitch', // whether to enable the inclusion of C++ headers as neighbors in the prompt
	UseSubsetMatching = 'copilotsubsetmatching', // whether to use subset matching instead of jaccard similarity experiment

	// granularity specification
	SuffixMatchThreshold = 'copilotsuffixmatchthreshold', // the threshold that new suffix should match with old suffix

	MaxPromptCompletionTokens = 'maxpromptcompletionTokens', // the maximum tokens of the prompt and completion

	/**
	 * Enable the use of the Workspace Context Coordinator to coordinate context from providers of workspace snippets.
	 */
	StableContextPercent = 'copilotstablecontextpercent', // the percentage of the prompt tokens to allocate to the stable context
	VolatileContextPercent = 'copilotvolatilecontextpercent', // the percentage of the prompt tokens to allocate to the volatile context

	/**
	 * Flags that control the enablement of the related files extensibility for various languages in VSCode.
	 */
	RelatedFilesVSCodeCSharp = 'copilotrelatedfilesvscodecsharp', // whether to include related files as neighbors in the prompt for C#, this takes precedence over RelatedFilesVSCode
	RelatedFilesVSCodeTypeScript = 'copilotrelatedfilesvscodetypescript', // whether to include related files as neighbors in the prompt for TS/JS, this takes precedence over RelatedFilesVSCode
	RelatedFilesVSCode = 'copilotrelatedfilesvscode', // whether to include related files as neighbors in the prompt, vscode experiment

	/**
	 * Flags that control the inclusion of open tab files as neighboring files for various languages.
	 */
	ContextProviders = 'copilotcontextproviders', // comma-separated list of context providers IDs (case sensitive) to enable
	IncludeNeighboringFiles = 'copilotincludeneighboringfiles', // Always include neighboring files alongside context providers
	ExcludeRelatedFiles = 'copilotexcluderelatedfiles', // Exclude related files even if neighboring files are enabled
	ContextProviderTimeBudget = 'copilotcontextprovidertimebudget', // time budget for context providers in milliseconds

	/**
	 * Values to control the ContextProvider API's CodeSnippets provided by the C++ Language Service.
	 */
	CppContextProviderParams = 'copilotcppContextProviderParams',

	/**
	 * Values to control the ContextProvider API's CodeSnippets provided by the C# Language Service.
	 */
	CSharpContextProviderParams = 'copilotcsharpcontextproviderparams',

	/**
	 * Values to control the ContextProvider API's CodeSnippets provided by the Java Language Service.
	 */
	JavaContextProviderParams = 'copilotjavacontextproviderparams',

	/**
	 * Values to control the MultiLanguageContextProvider parameters.
	 */
	MultiLanguageContextProviderParams = 'copilotmultilanguagecontextproviderparams',

	/**
	 * Values to control the TsContextProvider parameters.
	 */
	TsContextProviderParams = 'copilottscontextproviderparams',

	/**
	 * Controls the delay to apply to debouncing of completion requests.
	 */
	CompletionsDebounce = 'copilotcompletionsdebounce',

	/**
	 * Enable the electron networking in VS Code.
	 */
	ElectronFetcher = 'copilotelectronfetcher',
	FetchFetcher = 'copilotfetchfetcher',

	/**
	 * Sets the timeout for waiting for async completions in flight before
	 * issuing a new network request. Set to -1 to disable the timeout entirely.
	 */
	AsyncCompletionsTimeout = 'copilotasynccompletionstimeout',

	/**
	 * Controls whether the prompt context for code completions needs to be split from the document prefix.
	 */
	EnablePromptContextProxyField = 'copilotenablepromptcontextproxyfield',

	/**
	 * Controls progressive reveal of completions.
	 */
	ProgressiveReveal = 'copilotprogressivereveal',
	// part of progressive reveal, controls whether the model or client terminates single-line completions
	ModelAlwaysTerminatesSingleline = 'copilotmodelterminatesingleline',
	// long look-ahead window size (in lines) for progressive reveal
	ProgressiveRevealLongLookaheadSize = 'copilotprogressivereveallonglookaheadsize',
	// short look-ahead window size (in lines) for progressive reveal
	ProgressiveRevealShortLookaheadSize = 'copilotprogressiverevealshortlookaheadsize',
	// maximum token count when requesting multi-line completions
	MaxMultilineTokens = 'copilotmaxmultilinetokens',

	/**
	 * Controls number of lines to trim to after accepting a completion.
	 */
	MultilineAfterAcceptLines = 'copilotmultilineafteracceptlines',

	/**
	 * Add a delay before rendering completions.
	 */
	CompletionsDelay = 'copilotcompletionsdelay',

	/**
	 * Request single line completions unless the previous completion was just accepted.
	 */
	SingleLineUnlessAccepted = 'copilotsinglelineunlessaccepted',
}

export type ExpTreatmentVariableValue = boolean | string | number;

export class ExpConfig {
	variables: Partial<Record<ExpTreatmentVariables, ExpTreatmentVariableValue>>; // for the 'vscode' config
	features: string; // semicolon-separated feature IDs

	constructor(
		variables: Partial<Record<ExpTreatmentVariables, ExpTreatmentVariableValue>>,
		features: string
	) {
		this.variables = variables;
		this.features = features;
	}

	static createFallbackConfig(accessor: ServicesAccessor, reason: string): ExpConfig {
		telemetryExpProblem(accessor, { reason });
		return this.createEmptyConfig();
	}

	static createEmptyConfig() {
		return new ExpConfig({}, '');
	}

	/**
	 * Adds (or overwrites) the given experiment config to the telemetry data.
	 * @param telemetryData telemetryData object. If previous ExpConfigs are already present, they will be overwritten.
	 */
	addToTelemetry(telemetryData: TelemetryData): void {
		telemetryData.properties[ExpServiceTelemetryNames.featuresTelemetryPropertyName] = this.features;
	}
}
