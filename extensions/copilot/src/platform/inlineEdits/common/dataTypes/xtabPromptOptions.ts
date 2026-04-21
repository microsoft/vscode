/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../util/vs/base/common/assert';
import { IValidator, vBoolean, vEnum, vNumber, vObj, vRequired, vString, vUndefined, vUnion } from '../../../configuration/common/validator';

export enum IncludeLineNumbersOption {
	WithSpaceAfter = 'withSpaceAfter',
	WithoutSpace = 'withoutSpaceAfter',
	None = 'none',
}

export enum RecentFileClippingStrategy {
	/** Current behavior: clip from top of file (greedy, most-recent-first). */
	TopToBottom = 'topToBottom',
	/** Center clipping around the edit location in each file (greedy budget). */
	AroundEditRange = 'aroundEditRange',
	/** Proportionally allocate budget across files, centered on edit locations. */
	Proportional = 'proportional',
}

export namespace RecentFileClippingStrategy {
	export const VALIDATOR = vEnum(RecentFileClippingStrategy.TopToBottom, RecentFileClippingStrategy.AroundEditRange, RecentFileClippingStrategy.Proportional);
}

export type RecentlyViewedDocumentsOptions = {
	readonly nDocuments: number;
	readonly maxTokens: number;
	readonly includeViewedFiles: boolean;
	readonly includeLineNumbers: IncludeLineNumbersOption;
	readonly clippingStrategy: RecentFileClippingStrategy;
};

export namespace RecentlyViewedDocumentsOptions {
	export const VALIDATOR: IValidator<Partial<RecentlyViewedDocumentsOptions>> = vObj({
		'nDocuments': vNumber(),
		'maxTokens': vNumber(),
		'includeViewedFiles': vBoolean(),
		'includeLineNumbers': vEnum(IncludeLineNumbersOption.WithSpaceAfter, IncludeLineNumbersOption.WithoutSpace, IncludeLineNumbersOption.None),
		'clippingStrategy': vEnum(RecentFileClippingStrategy.TopToBottom, RecentFileClippingStrategy.AroundEditRange, RecentFileClippingStrategy.Proportional),
	});
}

export type LanguageContextLanguages = { [languageId: string]: boolean };

export type LanguageContextOptions = {
	readonly enabled: boolean;
	readonly maxTokens: number;
	readonly traitPosition: 'before' | 'after';
};

export type DiffHistoryOptions = {
	readonly nEntries: number;
	readonly maxTokens: number;
	readonly onlyForDocsInPrompt: boolean;
	readonly useRelativePaths: boolean;
};

export type PagedClipping = { pageSize: number };

export type CurrentFileOptions = {
	readonly maxTokens: number;
	readonly includeTags: boolean;
	readonly includeLineNumbers: IncludeLineNumbersOption;
	readonly includeCursorTag: boolean;
	readonly prioritizeAboveCursor: boolean;
};

export namespace CurrentFileOptions {
	export const VALIDATOR: IValidator<Partial<CurrentFileOptions>> = vObj({
		'maxTokens': vNumber(),
		'includeTags': vBoolean(),
		'includeLineNumbers': vEnum(IncludeLineNumbersOption.WithSpaceAfter, IncludeLineNumbersOption.WithoutSpace, IncludeLineNumbersOption.None),
		'includeCursorTag': vBoolean(),
		'prioritizeAboveCursor': vBoolean(),
	});
}

export enum LintOptionWarning {
	YES = 'yes',
	NO = 'no',
	YES_IF_NO_ERRORS = 'yesIfNoErrors',
}
export enum LintOptionShowCode {
	YES = 'yes',
	NO = 'no',
	YES_WITH_SURROUNDING = 'yesWithSurroundingLines',
}
export type LintOptions = {
	tagName: string; // name to use in tag e.g "linter diagnostics" => <|linter diagnostics|>...</|linter diagnostics|>
	warnings: LintOptionWarning;
	showCode: LintOptionShowCode;
	maxLints: number;
	maxLineDistance: number;
	/** When set to a value > 0, also include linter diagnostics from the N most recently edited/viewed files. */
	nRecentFiles: number;
};

/**
 * The raw user-facing aggressiveness setting. Includes `Default` to distinguish
 * "user didn't change" from "user explicitly chose medium".
 */
export enum AggressivenessSetting {
	Default = 'auto',
	Low = 'low',
	Medium = 'medium',
	High = 'high',
}

/**
 * The resolved aggressiveness level used in prompts and edit-intent filtering.
 * Does not include `Default` — that is resolved before reaching this type.
 */
export enum AggressivenessLevel {
	Low = 'low',
	Medium = 'medium',
	High = 'high',
}

/**
 * Controls the scope of the early divergence cancellation check.
 *
 * - `Off`: disable early divergence cancellation checks.
 * - `Cursor`: only check the cursor line for divergence (original behavior).
 * - `EditWindow`: check every line in the edit window for divergence.
 */
export enum EarlyDivergenceCancellationMode {
	Cursor = 'cursor',
	EditWindow = 'editWindow',
	Off = 'off',
}

export namespace EarlyDivergenceCancellationMode {
	export const VALIDATOR = vEnum(EarlyDivergenceCancellationMode.Cursor, EarlyDivergenceCancellationMode.EditWindow, EarlyDivergenceCancellationMode.Off);
}

export namespace AggressivenessSetting {
	export const VALIDATOR = vEnum(AggressivenessSetting.Default, AggressivenessSetting.Low, AggressivenessSetting.Medium, AggressivenessSetting.High);

	/** Resolves a non-default setting value to an AggressivenessLevel. Returns undefined for Default. */
	export function toLevel(setting: AggressivenessSetting): AggressivenessLevel | undefined {
		switch (setting) {
			case AggressivenessSetting.Low: return AggressivenessLevel.Low;
			case AggressivenessSetting.Medium: return AggressivenessLevel.Medium;
			case AggressivenessSetting.High: return AggressivenessLevel.High;
			case AggressivenessSetting.Default: return undefined;
		}
	}
}

/**
 * EditIntent indicates the model's confidence level for the suggested edit.
 * The model returns this as <|edit_intent|>value<|/edit_intent|> in the response.
 */
export enum EditIntent {
	NoEdit = 'no_edit',
	Low = 'low',
	Medium = 'medium',
	High = 'high',
}

export namespace EditIntent {
	/**
	 * Converts a string value to EditIntent enum.
	 * Returns High (most permissive) for invalid values.
	 */
	export function fromString(value: string): EditIntent {
		switch (value) {
			case 'no_edit':
				return EditIntent.NoEdit;
			case 'low':
				return EditIntent.Low;
			case 'medium':
				return EditIntent.Medium;
			case 'high':
				return EditIntent.High;
			default:
				// For unknown values, default to High (always show)
				return EditIntent.High;
		}
	}

	/**
	 * Converts a short name (N, L, M, H) to EditIntent enum.
	 * Only uppercase letters are accepted.
	 * Returns undefined for invalid values.
	 */
	export function fromShortName(value: string): EditIntent | undefined {
		switch (value) {
			case 'N':
				return EditIntent.NoEdit;
			case 'L':
				return EditIntent.Low;
			case 'M':
				return EditIntent.Medium;
			case 'H':
				return EditIntent.High;
			default:
				return undefined;
		}
	}

	/**
	 * Determines if the edit should be shown based on the edit intent
	 * and the user's aggressiveness level.
	 *
	 * Filtering logic (edit_intent vs user aggressiveness):
	 * - no_edit: Never show the edit
	 * - high confidence: Show for all aggressiveness levels (high confidence = always show)
	 * - medium confidence: Show only if user aggressiveness is medium or high
	 * - low confidence: Show only if user aggressiveness is high
	 */
	export function shouldShowEdit(editIntent: EditIntent, aggressivenessLevel: AggressivenessLevel): boolean {
		switch (editIntent) {
			case EditIntent.NoEdit:
				return false;
			case EditIntent.High:
				// High confidence edits show for all aggressiveness levels
				return true;
			case EditIntent.Medium:
				// Medium confidence edits show for medium or high aggressiveness
				return aggressivenessLevel === AggressivenessLevel.Medium ||
					aggressivenessLevel === AggressivenessLevel.High;
			case EditIntent.Low:
				// Low confidence edits only show for high aggressiveness
				return aggressivenessLevel === AggressivenessLevel.High;
			default:
				assertNever(editIntent);
		}
	}
}

export type PromptOptions = {
	readonly promptingStrategy: PromptingStrategy | undefined /* default */;
	readonly currentFile: CurrentFileOptions;
	readonly pagedClipping: PagedClipping;
	readonly recentlyViewedDocuments: RecentlyViewedDocumentsOptions;
	readonly languageContext: LanguageContextOptions;
	readonly diffHistory: DiffHistoryOptions;
	readonly includePostScript: boolean;
	readonly lintOptions: LintOptions | undefined;
};

/**
 * Prompt strategies that tweak prompt in a way that's different from current prod prompting strategy.
 */
export enum PromptingStrategy {
	/**
	 * Original Xtab unified model prompting strategy.
	 */
	CopilotNesXtab = 'copilotNesXtab',
	UnifiedModel = 'xtabUnifiedModel',
	Codexv21NesUnified = 'codexv21nesUnified',
	Nes41Miniv3 = 'nes41miniv3',
	SimplifiedSystemPrompt = 'simplifiedSystemPrompt',
	Xtab275 = 'xtab275',
	XtabAggressiveness = 'xtabAggressiveness',
	/**
	 * Xtab275 prompt + aggressiveness level tag.
	 */
	Xtab275Aggressiveness = 'xtab275Aggressiveness',
	PatchBased = 'patchBased',
	PatchBased01 = 'patchBased01',
	PatchBased02 = 'patchBased02',
	/**
	 * Xtab275-based strategy with edit intent tag parsing.
	 * Response format: <|edit_intent|>low|medium|high|no_edit<|/edit_intent|>
	 * followed by the edit window content.
	 */
	Xtab275EditIntent = 'xtab275EditIntent',
	/**
	 * Xtab275-based strategy with short edit intent parsing.
	 * Response format: N|L|M|H (single character on first line)
	 * followed by the edit window content.
	 */
	Xtab275EditIntentShort = 'xtab275EditIntentShort',
}

export function isPromptingStrategy(value: string): value is PromptingStrategy {
	return (Object.values(PromptingStrategy) as string[]).includes(value);
}

export function isAggressivenessStrategy(strategy: PromptingStrategy | undefined): boolean {
	return strategy === PromptingStrategy.XtabAggressiveness
		|| strategy === PromptingStrategy.Xtab275Aggressiveness
		|| strategy === PromptingStrategy.Xtab275EditIntent
		|| strategy === PromptingStrategy.Xtab275EditIntentShort;
}

export enum ResponseFormat {
	CodeBlock = 'codeBlock',
	UnifiedWithXml = 'unifiedWithXml',
	EditWindowOnly = 'editWindowOnly',
	CustomDiffPatch = 'customDiffPatch',
	EditWindowWithEditIntent = 'editWindowWithEditIntent',
	EditWindowWithEditIntentShort = 'editWindowWithEditIntentShort',
}

export namespace ResponseFormat {
	export function fromPromptingStrategy(strategy: PromptingStrategy | undefined): ResponseFormat {
		switch (strategy) {
			case PromptingStrategy.UnifiedModel:
			case PromptingStrategy.Codexv21NesUnified:
			case PromptingStrategy.Nes41Miniv3:
				return ResponseFormat.UnifiedWithXml;
			case PromptingStrategy.Xtab275:
			case PromptingStrategy.XtabAggressiveness:
			case PromptingStrategy.Xtab275Aggressiveness:
				return ResponseFormat.EditWindowOnly;
			case PromptingStrategy.PatchBased:
			case PromptingStrategy.PatchBased01:
			case PromptingStrategy.PatchBased02:
				return ResponseFormat.CustomDiffPatch;
			case PromptingStrategy.Xtab275EditIntent:
				return ResponseFormat.EditWindowWithEditIntent;
			case PromptingStrategy.Xtab275EditIntentShort:
				return ResponseFormat.EditWindowWithEditIntentShort;
			case PromptingStrategy.SimplifiedSystemPrompt:
			case PromptingStrategy.CopilotNesXtab:
			case undefined:
				return ResponseFormat.CodeBlock;
			default:
				assertNever(strategy);
		}
	}
}

export const DEFAULT_OPTIONS: PromptOptions = {
	promptingStrategy: undefined,
	currentFile: {
		maxTokens: 2000,
		includeTags: true,
		includeLineNumbers: IncludeLineNumbersOption.None,
		includeCursorTag: false,
		prioritizeAboveCursor: false,
	},
	pagedClipping: {
		pageSize: 10,
	},
	recentlyViewedDocuments: {
		nDocuments: 5,
		maxTokens: 2000,
		includeViewedFiles: false,
		includeLineNumbers: IncludeLineNumbersOption.None,
		clippingStrategy: RecentFileClippingStrategy.AroundEditRange,
	},
	languageContext: {
		enabled: false,
		maxTokens: 2000,
		traitPosition: 'after',
	},
	diffHistory: {
		nEntries: 25,
		maxTokens: 1000,
		onlyForDocsInPrompt: false,
		useRelativePaths: false,
	},
	lintOptions: undefined,
	includePostScript: true,
};

export const DEFAULT_CURSOR_PREDICTION_LINT_OPTIONS: LintOptions = {
	maxLineDistance: 1000,
	maxLints: 5,
	showCode: LintOptionShowCode.YES_WITH_SURROUNDING,
	tagName: 'linter',
	warnings: LintOptionWarning.YES_IF_NO_ERRORS,
	nRecentFiles: 0,
};

// TODO: consider a better per language setting/experiment approach
export const LANGUAGE_CONTEXT_ENABLED_LANGUAGES: LanguageContextLanguages = {
	'prompt': true,
	'instructions': true,
	'chatagent': true,
};

export interface ModelConfiguration {
	modelName: string;
	promptingStrategy: PromptingStrategy | undefined /* default */;
	includeTagsInCurrentFile: boolean;
	includePostScript?: boolean;
	currentFile?: Partial<CurrentFileOptions>;
	recentlyViewedDocuments?: Partial<RecentlyViewedDocumentsOptions>;
	lintOptions: Partial<LintOptions> | undefined;
	supportsNextCursorLinePrediction?: boolean;
}

export const LINT_OPTIONS_VALIDATOR: IValidator<Partial<LintOptions>> = vObj({
	'tagName': vString(),
	'warnings': vEnum(LintOptionWarning.YES, LintOptionWarning.NO, LintOptionWarning.YES_IF_NO_ERRORS),
	'showCode': vEnum(LintOptionShowCode.NO, LintOptionShowCode.YES, LintOptionShowCode.YES_WITH_SURROUNDING),
	'maxLints': vNumber(),
	'maxLineDistance': vNumber(),
	'nRecentFiles': vNumber(),
});

export const MODEL_CONFIGURATION_VALIDATOR: IValidator<ModelConfiguration> = vObj({
	'modelName': vRequired(vString()),
	'promptingStrategy': vUnion(vEnum(...Object.values(PromptingStrategy)), vUndefined()),
	'includeTagsInCurrentFile': vRequired(vBoolean()),
	'includePostScript': vUnion(vBoolean(), vUndefined()),
	'currentFile': vUnion(CurrentFileOptions.VALIDATOR, vUndefined()),
	'recentlyViewedDocuments': vUnion(RecentlyViewedDocumentsOptions.VALIDATOR, vUndefined()),
	'lintOptions': vUnion(LINT_OPTIONS_VALIDATOR, vUndefined()),
	'supportsNextCursorLinePrediction': vUnion(vBoolean(), vUndefined()),
});

export function parseLintOptionString(optionString: string, defaults: LintOptions): LintOptions {
	try {
		const parsed = JSON.parse(optionString);

		const lintValidation = LINT_OPTIONS_VALIDATOR.validate(parsed);
		if (lintValidation.error) {
			throw new Error(`Lint options validation failed: ${lintValidation.error.message}`);
		}

		return { ...defaults, ...lintValidation.content };
	} catch (e) {
		throw new Error(`Failed to parse lint options string: ${e}`);
	}
}

export interface UserHappinessScoreConfiguration {
	/** Score for accepted actions */
	acceptedScore: number;
	/** Score for rejected actions */
	rejectedScore: number;
	/** Score for ignored/notAccepted actions */
	ignoredScore: number;
	/** Threshold for high aggressiveness level */
	highThreshold: number;
	/** Threshold for medium aggressiveness level */
	mediumThreshold: number;
	/** Whether to include ignored/notAccepted actions in score calculation */
	includeIgnored: boolean;
	/** Maximum number of ignored/notAccepted actions to consider */
	ignoredLimit: number;
	/** Whether to limit consecutive ignored actions */
	limitConsecutiveIgnored: boolean;
	/** Whether to limit total ignored actions */
	limitTotalIgnored: boolean;
}

/**
 * Default configuration for user happiness score calculation. Mimics v1 behavior.
 */
export const DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION: UserHappinessScoreConfiguration = {
	acceptedScore: 1,
	rejectedScore: 0,
	ignoredScore: 0.5,
	highThreshold: 0.7,
	mediumThreshold: 0.4,
	includeIgnored: false,
	ignoredLimit: 0,
	limitConsecutiveIgnored: false,
	limitTotalIgnored: true,
};

/**
 * Basic type validation for happiness config.
 */
const USER_HAPPINESS_SCORE_CONFIGURATION_BASE_VALIDATOR: IValidator<UserHappinessScoreConfiguration> = vObj({
	'acceptedScore': vRequired(vNumber()),
	'rejectedScore': vRequired(vNumber()),
	'ignoredScore': vRequired(vNumber()),
	'highThreshold': vRequired(vNumber()),
	'mediumThreshold': vRequired(vNumber()),
	'includeIgnored': vRequired(vBoolean()),
	'ignoredLimit': vRequired(vNumber()),
	'limitConsecutiveIgnored': vRequired(vBoolean()),
	'limitTotalIgnored': vRequired(vBoolean()),
});

function isInRange(value: number, min: number, max: number): boolean {
	return value >= min && value <= max;
}

/**
 * Value checking for happiness config.
 */
export const USER_HAPPINESS_SCORE_CONFIGURATION_VALIDATOR: IValidator<UserHappinessScoreConfiguration> = {
	validate(content: unknown) {
		const baseResult = USER_HAPPINESS_SCORE_CONFIGURATION_BASE_VALIDATOR.validate(content);
		if (baseResult.error) {
			return baseResult;
		}

		const config = baseResult.content;

		// Validate score ranges [0, 1]
		if (!isInRange(config.acceptedScore, 0, 1)) {
			return { content: undefined, error: { message: 'acceptedScore must be in range [0, 1]' } };
		}
		if (!isInRange(config.rejectedScore, 0, 1)) {
			return { content: undefined, error: { message: 'rejectedScore must be in range [0, 1]' } };
		}
		if (!isInRange(config.ignoredScore, 0, 1)) {
			return { content: undefined, error: { message: 'ignoredScore must be in range [0, 1]' } };
		}

		// Validate threshold ranges [0, 1]
		if (!isInRange(config.highThreshold, 0, 1)) {
			return { content: undefined, error: { message: 'highThreshold must be in range [0, 1]' } };
		}
		if (!isInRange(config.mediumThreshold, 0, 1)) {
			return { content: undefined, error: { message: 'mediumThreshold must be in range [0, 1]' } };
		}

		// Validate acceptedScore > rejectedScore to prevent division by zero
		if (config.acceptedScore <= config.rejectedScore) {
			return { content: undefined, error: { message: 'acceptedScore must be greater than rejectedScore to prevent division by zero' } };
		}

		// Validate acceptedScore >= ignoredScore >= rejectedScore to prevent exceeding bounds
		if (config.ignoredScore < config.rejectedScore) {
			return { content: undefined, error: { message: 'ignoredScore must be greater than or equal to rejectedScore to prevent exceeding bounds' } };
		}
		if (config.acceptedScore < config.ignoredScore) {
			return { content: undefined, error: { message: 'acceptedScore must be greater than or equal to ignoredScore to prevent exceeding bounds' } };
		}

		// Validate highThreshold > mediumThreshold for logical consistency
		if (config.highThreshold <= config.mediumThreshold) {
			return { content: undefined, error: { message: 'highThreshold must be greater than mediumThreshold' } };
		}

		// Validate ignoredLimit >= 0
		if (config.ignoredLimit < 0) {
			return { content: undefined, error: { message: 'ignoredLimit must be non-negative' } };
		}

		return { content: config, error: undefined };
	},
	toSchema() {
		return USER_HAPPINESS_SCORE_CONFIGURATION_BASE_VALIDATOR.toSchema();
	}
};

export function parseUserHappinessScoreConfigurationString(optionString: string): UserHappinessScoreConfiguration {
	try {
		const parsed = JSON.parse(optionString);

		const validation = USER_HAPPINESS_SCORE_CONFIGURATION_VALIDATOR.validate(parsed);
		if (validation.error) {
			throw new Error(`User happiness score configuration validation failed: ${validation.error.message}`);
		}

		return validation.content;
	} catch (e) {
		throw new Error(`Failed to parse user happiness score configuration string: ${e}`);
	}
}

export enum SpeculativeRequestsEnablement {
	On = 'on',
	Off = 'off',
}

export namespace SpeculativeRequestsEnablement {
	export const VALIDATOR = vEnum(SpeculativeRequestsEnablement.On, SpeculativeRequestsEnablement.Off);
}

export enum SpeculativeRequestsCursorPlacement {
	AfterEditApplied = 'afterEditApplied',
	AfterEditWindow = 'afterEditWindow',
}

export namespace SpeculativeRequestsCursorPlacement {
	export const VALIDATOR = vEnum(SpeculativeRequestsCursorPlacement.AfterEditApplied, SpeculativeRequestsCursorPlacement.AfterEditWindow);
}

export enum SpeculativeRequestsAutoExpandEditWindowLines {
	Off = 'off',
	Smart = 'smart',
	Always = 'always',
}

export namespace SpeculativeRequestsAutoExpandEditWindowLines {
	export const VALIDATOR = vEnum(SpeculativeRequestsAutoExpandEditWindowLines.Off, SpeculativeRequestsAutoExpandEditWindowLines.Smart, SpeculativeRequestsAutoExpandEditWindowLines.Always);
}
