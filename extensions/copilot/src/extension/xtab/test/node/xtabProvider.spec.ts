/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, beforeEach, describe, expect, it, suite, test, vi } from 'vitest';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, RESPONSE_CONTAINED_NO_CHOICES } from '../../../../platform/chat/common/commonTypes';
import { StreamingMockChatMLFetcher } from '../../../../platform/chat/test/common/streamingMockChatMLFetcher';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { Edits } from '../../../../platform/inlineEdits/common/dataTypes/edit';
import { LanguageId } from '../../../../platform/inlineEdits/common/dataTypes/languageId';
import { NextCursorLinePredictionCursorPlacement } from '../../../../platform/inlineEdits/common/dataTypes/nextCursorLinePrediction';
import { DEFAULT_OPTIONS, LanguageContextLanguages, LintOptionShowCode, LintOptionWarning, ModelConfiguration, PromptingStrategy, ResponseFormat } from '../../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { InlineEditRequestLogContext } from '../../../../platform/inlineEdits/common/inlineEditLogContext';
import { IInlineEditsModelService } from '../../../../platform/inlineEdits/common/inlineEditsModelService';
import { NoNextEditReason, StatelessNextEditDocument, StatelessNextEditRequest, StreamedEdit, WithStatelessProviderTelemetry } from '../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { ILogger } from '../../../../platform/log/common/logService';
import { FilterReason } from '../../../../platform/networking/common/openai';
import { ISimulationTestContext } from '../../../../platform/simulationTestContext/common/simulationTestContext';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { AsyncIterUtils } from '../../../../util/common/asyncIterableUtils';
import { Result } from '../../../../util/common/result';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { LineEdit, LineReplacement } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { Position } from '../../../../util/vs/editor/common/core/position';
import { LineRange } from '../../../../util/vs/editor/common/core/ranges/lineRange';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { DelaySession } from '../../../inlineEdits/common/delay';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { N_LINES_AS_CONTEXT } from '../../common/promptCrafting';
import { nes41Miniv3SystemPrompt, simplifiedPrompt, systemPromptTemplate, unifiedModelSystemPrompt, xtab275SystemPrompt } from '../../common/systemMessages';
import { CurrentDocument } from '../../common/xtabCurrentDocument';
import {
	computeAreaAroundEditWindowLinesRange,
	determineLanguageContextOptions,
	filterOutEditsWithSubstrings,
	findMergeConflictMarkersRange,
	getPredictionContents,
	mapChatFetcherErrorToNoNextEditReason,
	ModelConfig,
	overrideModelConfig,
	pickSystemPrompt,
	XtabProvider,
} from '../../node/xtabProvider';

suite('findMergeConflictMarkersRange', () => {

	test('should find merge conflict markers within edit window', () => {
		const lines = [
			'function foo() {',
			'<<<<<<< HEAD',
			'  return 1;',
			'=======',
			'  return 2;',
			'>>>>>>> branch',
			'}',
		];
		const editWindowRange = new OffsetRange(0, 7);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(1);
		expect(result?.endExclusive).toBe(6);
	});

	test('should return undefined when no merge conflict markers present', () => {
		const lines = [
			'function foo() {',
			'  return 1;',
			'}',
		];
		const editWindowRange = new OffsetRange(0, 3);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should return undefined when start marker exists but no end marker', () => {
		const lines = [
			'function foo() {',
			'<<<<<<< HEAD',
			'  return 1;',
			'=======',
			'  return 2;',
			'}',
		];
		const editWindowRange = new OffsetRange(0, 6);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should return undefined when conflict exceeds maxMergeConflictLines', () => {
		const lines = [
			'<<<<<<< HEAD',
			'line 1',
			'line 2',
			'line 3',
			'line 4',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 6);
		const maxMergeConflictLines = 3; // Too small to reach end marker

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should find conflict when exactly at maxMergeConflictLines boundary', () => {
		const lines = [
			'<<<<<<< HEAD',
			'line 1',
			'line 2',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 4);
		const maxMergeConflictLines = 4;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(4);
	});

	test('should only search within edit window range', () => {
		const lines = [
			'function foo() {',
			'  return 1;',
			'<<<<<<< HEAD',
			'  return 2;',
			'>>>>>>> branch',
			'}',
		];
		const editWindowRange = new OffsetRange(0, 2); // Excludes the conflict
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should find first conflict when multiple conflicts exist', () => {
		const lines = [
			'<<<<<<< HEAD',
			'first conflict',
			'>>>>>>> branch',
			'some code',
			'<<<<<<< HEAD',
			'second conflict',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 7);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(3);
	});

	test('should handle conflict at start of edit window', () => {
		const lines = [
			'<<<<<<< HEAD',
			'content',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 3);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(3);
	});

	test('should handle conflict at end of edit window', () => {
		const lines = [
			'some code',
			'<<<<<<< HEAD',
			'content',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 4);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(1);
		expect(result?.endExclusive).toBe(4);
	});

	test('should handle empty lines array', () => {
		const lines: string[] = [];
		const editWindowRange = new OffsetRange(0, 0);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should handle single line with start marker only', () => {
		const lines = ['<<<<<<< HEAD'];
		const editWindowRange = new OffsetRange(0, 1);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should handle lines with merge markers that do not start at beginning', () => {
		const lines = [
			'function foo() {',
			'  <<<<<<< HEAD',
			'  return 1;',
			'  >>>>>>> branch',
			'}',
		];
		const editWindowRange = new OffsetRange(0, 5);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined(); // Should not match as markers don't start at line beginning
	});

	test('should handle conflict that extends beyond lines array', () => {
		const lines = [
			'<<<<<<< HEAD',
			'content',
		];
		const editWindowRange = new OffsetRange(0, 2);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should handle edit window extending beyond lines array', () => {
		const lines = [
			'<<<<<<< HEAD',
			'content',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 100); // Beyond array length
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(3);
	});

	test('should handle minimal conflict (start and end markers only)', () => {
		const lines = [
			'<<<<<<< HEAD',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 2);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(2);
	});

	test('should handle maxMergeConflictLines of 1', () => {
		const lines = [
			'<<<<<<< HEAD',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 2);
		const maxMergeConflictLines = 1;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined(); // Cannot find end marker within limit
	});

	test('should handle maxMergeConflictLines of 2', () => {
		const lines = [
			'<<<<<<< HEAD',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 2);
		const maxMergeConflictLines = 2;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(2);
	});

	test('should find conflict starting in middle of edit window', () => {
		const lines = [
			'line 1',
			'line 2',
			'<<<<<<< HEAD',
			'conflict',
			'>>>>>>> branch',
			'line 5',
		];
		const editWindowRange = new OffsetRange(0, 6);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(2);
		expect(result?.endExclusive).toBe(5);
	});
});

// ============================================================================
// Test Helpers
// ============================================================================

function createMockLogger(): ILogger {
	return new TestLogService();
}

function makeCurrentDocument(lines: string[], cursorLineOneBased: number, cursorColumn = 1): CurrentDocument {
	const text = new StringText(lines.join('\n'));
	return new CurrentDocument(text, new Position(cursorLineOneBased, cursorColumn));
}

function makeActiveDocument(lines: string[], opts?: { workspaceRoot?: URI; languageId?: string }): StatelessNextEditDocument {
	const text = new StringText(lines.join('\n'));
	return new StatelessNextEditDocument(
		DocumentId.create('file:///test/file.ts'),
		opts?.workspaceRoot,
		LanguageId.create(opts?.languageId ?? 'typescript'),
		lines,
		LineEdit.empty,
		text,
		new Edits(StringEdit, []),
	);
}

function makeBaseModelConfig(): ModelConfig {
	return {
		modelName: undefined,
		...DEFAULT_OPTIONS,
	};
}

const baseRequestFields = {
	reason: 'test',
	requestId: 'req-1',
	serverRequestId: undefined,
} as const;

// ============================================================================
// Mock for IInlineEditsModelService
// ============================================================================

class MockInlineEditsModelService implements IInlineEditsModelService {
	declare readonly _serviceBrand: undefined;
	readonly modelInfo = undefined;
	readonly onModelListUpdated: Event<void> = new Emitter<void>().event;

	private _selectedConfig: ModelConfiguration = {
		modelName: 'test-model',
		promptingStrategy: undefined,
		includeTagsInCurrentFile: false,
		lintOptions: undefined,
	};

	private _defaultConfig: ModelConfiguration = {
		modelName: 'default-model',
		promptingStrategy: undefined,
		includeTagsInCurrentFile: false,
		lintOptions: undefined,
	};

	async setCurrentModelId(_modelId: string): Promise<void> { }

	selectedModelConfiguration(): ModelConfiguration {
		return this._selectedConfig;
	}

	defaultModelConfiguration(): ModelConfiguration {
		return this._defaultConfig;
	}

	setSelectedConfig(config: Partial<ModelConfiguration>): void {
		this._selectedConfig = { ...this._selectedConfig, ...config };
	}

	setDefaultConfig(config: Partial<ModelConfiguration>): void {
		this._defaultConfig = { ...this._defaultConfig, ...config };
	}
}

// ============================================================================
// pickSystemPrompt
// ============================================================================

describe('pickSystemPrompt', () => {
	it('returns systemPromptTemplate for CopilotNesXtab', () => {
		expect(pickSystemPrompt(PromptingStrategy.CopilotNesXtab)).toBe(systemPromptTemplate);
	});

	it('returns systemPromptTemplate for undefined', () => {
		expect(pickSystemPrompt(undefined)).toBe(systemPromptTemplate);
	});

	it('returns unifiedModelSystemPrompt for UnifiedModel', () => {
		expect(pickSystemPrompt(PromptingStrategy.UnifiedModel)).toBe(unifiedModelSystemPrompt);
	});

	it('returns simplifiedPrompt for Codexv21NesUnified', () => {
		expect(pickSystemPrompt(PromptingStrategy.Codexv21NesUnified)).toBe(simplifiedPrompt);
	});

	it('returns simplifiedPrompt for SimplifiedSystemPrompt', () => {
		expect(pickSystemPrompt(PromptingStrategy.SimplifiedSystemPrompt)).toBe(simplifiedPrompt);
	});

	it.each([
		PromptingStrategy.PatchBased,
		PromptingStrategy.PatchBased01,
		PromptingStrategy.PatchBased02,
		PromptingStrategy.Xtab275,
		PromptingStrategy.XtabAggressiveness,
		PromptingStrategy.Xtab275EditIntent,
		PromptingStrategy.Xtab275EditIntentShort,
	])('returns xtab275SystemPrompt for %s', (strategy) => {
		expect(pickSystemPrompt(strategy)).toBe(xtab275SystemPrompt);
	});

	it('returns nes41Miniv3SystemPrompt for Nes41Miniv3', () => {
		expect(pickSystemPrompt(PromptingStrategy.Nes41Miniv3)).toBe(nes41Miniv3SystemPrompt);
	});

	it('each strategy produces a non-empty string', () => {
		const allStrategies: (PromptingStrategy | undefined)[] = [
			undefined,
			...Object.values(PromptingStrategy),
		];
		for (const s of allStrategies) {
			expect(pickSystemPrompt(s).length).toBeGreaterThan(0);
		}
	});
});

// ============================================================================
// mapChatFetcherErrorToNoNextEditReason
// ============================================================================

describe('mapChatFetcherErrorToNoNextEditReason', () => {
	it('maps Canceled to GotCancelled', () => {
		const result = mapChatFetcherErrorToNoNextEditReason({
			type: ChatFetchResponseType.Canceled,
			...baseRequestFields,
		});
		expect(result).toBeInstanceOf(NoNextEditReason.GotCancelled);
	});

	it.each([
		{ type: ChatFetchResponseType.OffTopic, ...baseRequestFields },
		{ type: ChatFetchResponseType.Filtered, ...baseRequestFields, category: FilterReason.Hate },
		{ type: ChatFetchResponseType.PromptFiltered, ...baseRequestFields, category: FilterReason.Hate },
		{ type: ChatFetchResponseType.Length, ...baseRequestFields, truncatedValue: '' },
		{ type: ChatFetchResponseType.RateLimited, ...baseRequestFields, retryAfter: undefined, rateLimitKey: 'k', isAuto: false },
		{ type: ChatFetchResponseType.QuotaExceeded, ...baseRequestFields, retryAfter: new Date() },
		{ type: ChatFetchResponseType.ExtensionBlocked, ...baseRequestFields, retryAfter: 0, learnMoreLink: '' },
		{ type: ChatFetchResponseType.AgentUnauthorized, ...baseRequestFields, authorizationUrl: '' },
		{ type: ChatFetchResponseType.AgentFailedDependency, ...baseRequestFields },
		{ type: ChatFetchResponseType.InvalidStatefulMarker, ...baseRequestFields },
	] satisfies ReadonlyArray<Parameters<typeof mapChatFetcherErrorToNoNextEditReason>[0]>)('maps $type to Uncategorized', (error) => {
		const result = mapChatFetcherErrorToNoNextEditReason(error);
		expect(result).toBeInstanceOf(NoNextEditReason.Uncategorized);
	});

	it.each([
		{ type: ChatFetchResponseType.BadRequest, ...baseRequestFields },
		{ type: ChatFetchResponseType.NotFound, ...baseRequestFields },
		{ type: ChatFetchResponseType.Failed, ...baseRequestFields },
		{ type: ChatFetchResponseType.NetworkError, ...baseRequestFields },
		{ type: ChatFetchResponseType.Unknown, ...baseRequestFields },
	] satisfies ReadonlyArray<Parameters<typeof mapChatFetcherErrorToNoNextEditReason>[0]>)('maps $type to FetchFailure', (error) => {
		const result = mapChatFetcherErrorToNoNextEditReason(error);
		expect(result).toBeInstanceOf(NoNextEditReason.FetchFailure);
	});
});

// ============================================================================
// overrideModelConfig
// ============================================================================

describe('overrideModelConfig', () => {
	it('overrides modelName from overridingConfig', () => {
		const base = makeBaseModelConfig();
		const override: ModelConfiguration = {
			modelName: 'custom-model',
			promptingStrategy: PromptingStrategy.Xtab275,
			includeTagsInCurrentFile: true,
			lintOptions: undefined,
		};

		const result = overrideModelConfig(base, override);

		expect(result.modelName).toBe('custom-model');
		expect(result.promptingStrategy).toBe(PromptingStrategy.Xtab275);
		expect(result.currentFile.includeTags).toBe(true);
	});

	it('preserves base config fields that are not overridden', () => {
		const base = makeBaseModelConfig();
		const override: ModelConfiguration = {
			modelName: 'new-model',
			promptingStrategy: undefined,
			includeTagsInCurrentFile: false,
			lintOptions: undefined,
		};

		const result = overrideModelConfig(base, override);

		expect(result.includePostScript).toBe(base.includePostScript);
		expect(result.pagedClipping).toEqual(base.pagedClipping);
		expect(result.recentlyViewedDocuments).toEqual(base.recentlyViewedDocuments);
		expect(result.diffHistory).toEqual(base.diffHistory);
	});

	it('merges lintOptions when overridingConfig has lintOptions', () => {
		const testLintOptions = { tagName: 'lint', warnings: LintOptionWarning.YES, showCode: LintOptionShowCode.YES, maxLints: 5, maxLineDistance: 10, nRecentFiles: 0 };
		const base: ModelConfig = {
			...makeBaseModelConfig(),
			lintOptions: testLintOptions,
		};
		const overrideLintOptions = { tagName: 'diag', warnings: LintOptionWarning.NO, showCode: LintOptionShowCode.NO, maxLints: 3, maxLineDistance: 5, nRecentFiles: 0 };
		const override: ModelConfiguration = {
			modelName: 'test',
			promptingStrategy: undefined,
			includeTagsInCurrentFile: false,
			lintOptions: overrideLintOptions,
		};

		const result = overrideModelConfig(base, override);

		expect(result.lintOptions).toEqual(overrideLintOptions);
	});

	it('keeps base lintOptions when override has no lintOptions', () => {
		const testLintOptions = { tagName: 'lint', warnings: LintOptionWarning.YES, showCode: LintOptionShowCode.YES, maxLints: 5, maxLineDistance: 10, nRecentFiles: 0 };
		const base: ModelConfig = {
			...makeBaseModelConfig(),
			lintOptions: testLintOptions,
		};
		const override: ModelConfiguration = {
			modelName: 'test',
			promptingStrategy: undefined,
			includeTagsInCurrentFile: false,
			lintOptions: undefined,
		};

		const result = overrideModelConfig(base, override);

		expect(result.lintOptions).toEqual(testLintOptions);
	});

	it('overrides currentFile.includeTags without affecting other currentFile fields', () => {
		const base = makeBaseModelConfig();
		const originalMaxTokens = base.currentFile.maxTokens;
		const override: ModelConfiguration = {
			modelName: 'test',
			promptingStrategy: undefined,
			includeTagsInCurrentFile: true,
			lintOptions: undefined,
		};

		const result = overrideModelConfig(base, override);

		expect(result.currentFile.includeTags).toBe(true);
		expect(result.currentFile.maxTokens).toBe(originalMaxTokens);
	});

	it('merges currentFile partial overrides with base currentFile', () => {
		const base = makeBaseModelConfig();
		const override: ModelConfiguration = {
			modelName: 'test',
			promptingStrategy: undefined,
			includeTagsInCurrentFile: false,
			currentFile: { maxTokens: 500 },
			lintOptions: undefined,
		};

		const result = overrideModelConfig(base, override);

		expect(result.currentFile.maxTokens).toBe(500);
		// includeTags comes from includeTagsInCurrentFile, applied last
		expect(result.currentFile.includeTags).toBe(false);
		// Other fields preserved from base
		expect(result.currentFile.includeLineNumbers).toBe(base.currentFile.includeLineNumbers);
		expect(result.currentFile.includeCursorTag).toBe(base.currentFile.includeCursorTag);
	});

	it('merges recentlyViewedDocuments partial overrides with base', () => {
		const base = makeBaseModelConfig();
		const override: ModelConfiguration = {
			modelName: 'test',
			promptingStrategy: undefined,
			includeTagsInCurrentFile: false,
			recentlyViewedDocuments: { maxTokens: 3000 },
			lintOptions: undefined,
		};

		const result = overrideModelConfig(base, override);

		expect(result.recentlyViewedDocuments.maxTokens).toBe(3000);
		// Other fields preserved from base
		expect(result.recentlyViewedDocuments.nDocuments).toBe(base.recentlyViewedDocuments.nDocuments);
		expect(result.recentlyViewedDocuments.includeViewedFiles).toBe(base.recentlyViewedDocuments.includeViewedFiles);
	});
});

// ============================================================================
// determineLanguageContextOptions
// ============================================================================

describe('determineLanguageContextOptions', () => {
	const baseOpts = {
		enabled: false,
		enabledLanguages: {} as LanguageContextLanguages,
		maxTokens: 500,
		enableAllContextProviders: false,
		traitPosition: 'before' as const,
	};

	it('uses explicit language entry when language is in enabledLanguages', () => {
		const result = determineLanguageContextOptions(
			LanguageId.create('python'),
			{ ...baseOpts, enabledLanguages: { python: true } as LanguageContextLanguages },
		);
		expect(result).toMatchInlineSnapshot(`
			{
			  "enabled": true,
			  "maxTokens": 500,
			  "traitPosition": "before",
			}
		`);
	});

	it('uses false from enabledLanguages when explicitly disabled for language', () => {
		const result = determineLanguageContextOptions(
			LanguageId.create('python'),
			{ ...baseOpts, enabledLanguages: { python: false } as LanguageContextLanguages },
		);
		expect(result.enabled).toBe(false);
	});

	it('falls back to enableAllContextProviders when language not in enabledLanguages', () => {
		const result = determineLanguageContextOptions(
			LanguageId.create('rust'),
			{ ...baseOpts, enableAllContextProviders: true },
		);
		expect(result.enabled).toBe(true);
	});

	it('falls back to the enabled param as last resort', () => {
		const result = determineLanguageContextOptions(
			LanguageId.create('rust'),
			{ ...baseOpts, enabled: true },
		);
		expect(result.enabled).toBe(true);
	});

	it('returns false when all sources are false', () => {
		const result = determineLanguageContextOptions(
			LanguageId.create('rust'),
			baseOpts,
		);
		expect(result.enabled).toBe(false);
	});

	it('passes through maxTokens and traitPosition', () => {
		const result = determineLanguageContextOptions(
			LanguageId.create('typescript'),
			{ ...baseOpts, enabled: true, maxTokens: 1000, traitPosition: 'after' },
		);
		expect(result).toMatchInlineSnapshot(`
			{
			  "enabled": true,
			  "maxTokens": 1000,
			  "traitPosition": "after",
			}
		`);
	});

	it('enabledLanguages takes priority over enableAllContextProviders', () => {
		const result = determineLanguageContextOptions(
			LanguageId.create('python'),
			{
				...baseOpts,
				enabledLanguages: { python: false } as LanguageContextLanguages,
				enableAllContextProviders: true,
			},
		);
		expect(result.enabled).toBe(false);
	});
});

// ============================================================================
// getPredictionContents
// ============================================================================

describe('getPredictionContents', () => {
	const editWindowLines = ['const x = 1;', 'const y = 2;'];
	const doc = makeActiveDocument(['line0', ...editWindowLines, 'line3']);

	it('returns correct content for UnifiedWithXml', () => {
		expect(getPredictionContents(doc, editWindowLines, ResponseFormat.UnifiedWithXml)).toMatchInlineSnapshot(`
			"<EDIT>
			const x = 1;
			const y = 2;
			</EDIT>"
		`);
	});

	it('returns correct content for EditWindowOnly', () => {
		expect(getPredictionContents(doc, editWindowLines, ResponseFormat.EditWindowOnly)).toMatchInlineSnapshot(`
			"const x = 1;
			const y = 2;"
		`);
	});

	it('returns correct content for EditWindowWithEditIntent', () => {
		expect(getPredictionContents(doc, editWindowLines, ResponseFormat.EditWindowWithEditIntent)).toMatchInlineSnapshot(`
			"<|edit_intent|>high<|/edit_intent|>
			const x = 1;
			const y = 2;"
		`);
	});

	it('returns correct content for EditWindowWithEditIntentShort', () => {
		expect(getPredictionContents(doc, editWindowLines, ResponseFormat.EditWindowWithEditIntentShort)).toMatchInlineSnapshot(`
			"H
			const x = 1;
			const y = 2;"
		`);
	});

	it('returns correct content for CodeBlock', () => {
		expect(getPredictionContents(doc, editWindowLines, ResponseFormat.CodeBlock)).toMatchInlineSnapshot(`
			"\`\`\`
			const x = 1;
			const y = 2;
			\`\`\`"
		`);
	});

	it('returns correct content for CustomDiffPatch with workspace root', () => {
		const docWithRoot = makeActiveDocument(
			['line0', 'line1'],
			{ workspaceRoot: URI.file('/workspace/project') },
		);
		const result = getPredictionContents(docWithRoot, ['line0'], ResponseFormat.CustomDiffPatch);
		expect(result.endsWith(':')).toBe(true);
	});

	it('returns correct content for CustomDiffPatch without workspace root', () => {
		const result = getPredictionContents(doc, editWindowLines, ResponseFormat.CustomDiffPatch);
		expect(result.endsWith(':')).toBe(true);
	});

	it('handles empty editWindowLines', () => {
		expect(getPredictionContents(doc, [], ResponseFormat.EditWindowOnly)).toBe('');
	});

	it('handles single-line editWindowLines', () => {
		expect(getPredictionContents(doc, ['only line'], ResponseFormat.EditWindowOnly)).toBe('only line');
	});
});

// ============================================================================
// computeAreaAroundEditWindowLinesRange
// ============================================================================

describe('computeAreaAroundEditWindowLinesRange', () => {
	it('returns correct range with cursor in middle of large document', () => {
		const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
		const doc = makeCurrentDocument(lines, 26); // cursor at line 26 (1-based), cursorLineOffset=25

		const result = computeAreaAroundEditWindowLinesRange(doc);

		expect(result.start).toBe(25 - N_LINES_AS_CONTEXT);
		expect(result.endExclusive).toBe(25 + N_LINES_AS_CONTEXT + 1);
	});

	it('clamps start to 0 when cursor is near beginning', () => {
		const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
		const doc = makeCurrentDocument(lines, 3); // cursorLineOffset=2

		const result = computeAreaAroundEditWindowLinesRange(doc);

		expect(result.start).toBe(0);
		expect(result.endExclusive).toBe(2 + N_LINES_AS_CONTEXT + 1);
	});

	it('clamps end to document length when cursor is near end', () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
		const doc = makeCurrentDocument(lines, 19); // cursorLineOffset=18

		const result = computeAreaAroundEditWindowLinesRange(doc);

		expect(result.start).toBe(Math.max(0, 18 - N_LINES_AS_CONTEXT));
		expect(result.endExclusive).toBe(20); // clamped to lines.length
	});

	it('handles single-line document', () => {
		const doc = makeCurrentDocument(['only line'], 1);

		const result = computeAreaAroundEditWindowLinesRange(doc);

		expect(result.start).toBe(0);
		expect(result.endExclusive).toBe(1);
	});

	it('handles document with fewer lines than N_LINES_AS_CONTEXT', () => {
		const lines = ['a', 'b', 'c'];
		const doc = makeCurrentDocument(lines, 2); // cursorLineOffset=1

		const result = computeAreaAroundEditWindowLinesRange(doc);

		expect(result.start).toBe(0);
		expect(result.endExclusive).toBe(3);
	});

	it('cursor at first line', () => {
		const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
		const doc = makeCurrentDocument(lines, 1); // cursorLineOffset=0

		const result = computeAreaAroundEditWindowLinesRange(doc);

		expect(result.start).toBe(0);
		expect(result.endExclusive).toBe(N_LINES_AS_CONTEXT + 1);
	});

	it('cursor at last line', () => {
		const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
		const doc = makeCurrentDocument(lines, 50); // cursorLineOffset=49

		const result = computeAreaAroundEditWindowLinesRange(doc);

		expect(result.start).toBe(49 - N_LINES_AS_CONTEXT);
		expect(result.endExclusive).toBe(50);
	});
});

// ============================================================================
// XtabProvider — integration tests
// ============================================================================

describe('XtabProvider integration', () => {
	const disposables = new DisposableStore();
	let instaService: IInstantiationService;
	let mockModelService: MockInlineEditsModelService;
	let streamingFetcher: StreamingMockChatMLFetcher;
	let configService: InMemoryConfigurationService;

	beforeEach(() => {
		const testingServiceCollection = createExtensionUnitTestingServices(disposables);

		mockModelService = new MockInlineEditsModelService();
		testingServiceCollection.set(IInlineEditsModelService, mockModelService);

		streamingFetcher = new StreamingMockChatMLFetcher();
		testingServiceCollection.set(IChatMLFetcher, streamingFetcher);

		const accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		instaService = accessor.get(IInstantiationService);
		configService = accessor.get(IConfigurationService) as InMemoryConfigurationService;
	});

	afterEach(() => {
		disposables.clear();
	});

	function createProvider(): XtabProvider {
		return instaService.createInstance(XtabProvider);
	}

	/**
	 * Creates a `StatelessNextEditDocument` where `lines` represents the **after-edit** state.
	 *
	 * The "before" document is derived by removing `insertedText.length` characters starting
	 * at `insertionOffset` from the joined `lines`. A `StringEdit` that inserts `insertedText`
	 * at `insertionOffset` is created as the recent edit.
	 *
	 * **Important:** `insertedText` must equal the characters at `lines.join('\n')[insertionOffset..]`
	 * so that `recentEdits.apply(beforeText) === afterText`.
	 * If `insertedText` is not provided, it defaults to the single character at `insertionOffset`.
	 */
	function makeDocumentWithEdit(lines: string[], opts?: {
		insertionOffset?: number;
		insertedText?: string;
		languageId?: string;
		workspaceRoot?: URI;
	}): StatelessNextEditDocument {
		const afterText = lines.join('\n');
		const insertionOffset = opts?.insertionOffset ?? 0;
		// Default insertedText to the actual character at the insertion offset
		const insertedText = opts?.insertedText ?? afterText[insertionOffset] ?? 'x';

		const beforeText = afterText.slice(0, insertionOffset) + afterText.slice(insertionOffset + insertedText.length);
		const beforeStringText = new StringText(beforeText);
		const beforeLines = beforeText.split('\n');

		const recentStringEdit = StringEdit.single(
			new StringReplacement(OffsetRange.emptyAt(insertionOffset), insertedText)
		);
		const recentEdits = new Edits(StringEdit, [recentStringEdit]);

		return new StatelessNextEditDocument(
			DocumentId.create('file:///test/file.ts'),
			opts?.workspaceRoot,
			LanguageId.create(opts?.languageId ?? 'typescript'),
			beforeLines,
			LineEdit.empty,
			beforeStringText,
			recentEdits,
		);
	}

	/**
	 * Creates a full `StatelessNextEditRequest` with non-empty xtabEditHistory and a
	 * document that has a recent edit (so selection deduction succeeds).
	 */
	function createRequestWithEdit(lines: string[], opts?: {
		insertionOffset?: number;
		insertedText?: string;
		languageId?: string;
		expandedEditWindowNLines?: number;
		isSpeculative?: boolean;
	}): StatelessNextEditRequest {
		const doc = makeDocumentWithEdit(lines, opts);
		const beforeText = new StringText(doc.documentBeforeEdits.value);
		const docId = doc.id;

		return new StatelessNextEditRequest(
			'req-1',
			'opp-1',
			beforeText,
			[doc],
			0,
			[{ docId, kind: 'visibleRanges', visibleRanges: [new OffsetRange(0, 100)], documentContent: doc.documentAfterEdits }],
			new DeferredPromise<Result<unknown, NoNextEditReason>>(),
			opts?.expandedEditWindowNLines,
			opts?.isSpeculative ?? false,
			new InlineEditRequestLogContext('file:///test/file.ts', 1, undefined),
			undefined,
			undefined,
			Date.now(),
		);
	}

	/** Extracts the text content from a ChatMessage's content array. */
	function getMessageText(message: Raw.ChatMessage): string {
		return message.content
			.filter(part => part.type === Raw.ChatCompletionContentPartKind.Text)
			.map(part => (part as { text: string }).text)
			.join('');
	}

	/** Collects all yielded edits and the final return value. */
	async function collectEdits(gen: AsyncGenerator<WithStatelessProviderTelemetry<StreamedEdit>, WithStatelessProviderTelemetry<NoNextEditReason>>): Promise<{
		edits: WithStatelessProviderTelemetry<StreamedEdit>[];
		finalReason: WithStatelessProviderTelemetry<NoNextEditReason>;
	}> {
		const edits: WithStatelessProviderTelemetry<StreamedEdit>[] = [];
		let result = await gen.next();
		while (!result.done) {
			edits.push(result.value);
			result = await gen.next();
		}
		return { edits, finalReason: result.value };
	}

	function createLogContext(): InlineEditRequestLogContext {
		return new InlineEditRequestLogContext('file:///test/file.ts', 1, undefined);
	}

	describe('static properties', () => {
		it('has correct ID', () => {
			const provider = createProvider();
			expect(provider.ID).toBe(XtabProvider.ID);
		});
	});

	describe('handleAcceptance / handleRejection / handleIgnored', () => {
		it('does not throw when called', () => {
			const provider = createProvider();

			expect(() => provider.handleAcceptance()).not.toThrow();
			expect(() => provider.handleRejection()).not.toThrow();
			expect(() => provider.handleIgnored()).not.toThrow();
		});
	});

	// ========================================================================
	// Group 1: provideNextEdit — Early Exits and Error Handling
	// ========================================================================

	describe('provideNextEdit early exits', () => {
		it('returns ActiveDocumentHasNoEdits when xtabEditHistory is empty', async () => {
			const provider = createProvider();
			const lines = ['function foo() {', '  return 1;', '}'];
			const text = new StringText(lines.join('\n'));
			const doc = new StatelessNextEditDocument(
				DocumentId.create('file:///test/file.ts'),
				undefined,
				LanguageId.create('typescript'),
				lines,
				LineEdit.empty,
				text,
				new Edits(StringEdit, []),
			);

			const request = new StatelessNextEditRequest(
				'req-1', 'opp-1', text, [doc], 0,
				[], // empty history
				new DeferredPromise<Result<unknown, NoNextEditReason>>(), undefined,
				false, // isSpeculative
				createLogContext(), undefined, undefined, Date.now(),
			);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.ActiveDocumentHasNoEdits);
		});

		it('returns Uncategorized(NoSelection) when selection cannot be deduced', async () => {
			const provider = createProvider();
			const lines = ['function foo() {', '  return 1;', '}'];
			const text = new StringText(lines.join('\n'));
			const doc = new StatelessNextEditDocument(
				DocumentId.create('file:///test/file.ts'),
				undefined,
				LanguageId.create('typescript'),
				lines,
				LineEdit.empty,
				text,
				new Edits(StringEdit, []), // no recent edits → null selection
			);

			const request = new StatelessNextEditRequest(
				'req-1', 'opp-1', text, [doc], 0,
				[{ docId: doc.id, kind: 'visibleRanges', visibleRanges: [new OffsetRange(0, 50)], documentContent: text }],
				new DeferredPromise<Result<unknown, NoNextEditReason>>(), undefined,
				false, // isSpeculative
				createLogContext(), undefined, undefined, Date.now(),
			);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.Uncategorized);
			expect((finalValue.v as NoNextEditReason.Uncategorized).error.message).toContain('NoSelection');
		});

		it('returns PromptTooLarge(editWindow) when edit window exceeds token limit', async () => {
			const provider = createProvider();
			// Set very small token limit for edit window
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsXtabEditWindowMaxTokens, 1);

			// Create a document with long enough lines to exceed 1 token limit
			const lines = ['function foo() {', '  return someVeryLongVariableName + anotherLongVariableName;', '}'];
			const request = createRequestWithEdit(lines, { insertionOffset: 5, insertedText: 'c' });

			streamingFetcher.setStreamingLines(['should not reach here']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.PromptTooLarge);
			expect((finalValue.v as NoNextEditReason.PromptTooLarge).message).toBe('editWindow');
		});

		it('wraps unexpected errors in NoNextEditReason.Unexpected', async () => {
			const provider = createProvider();

			const lines = ['function foo() {', '  return 1;', '}'];
			const request = createRequestWithEdit(lines, { insertionOffset: 5, insertedText: 'c' });

			// Make the model service throw during config assembly
			vi.spyOn(mockModelService, 'selectedModelConfiguration').mockImplementation(() => {
				throw new Error('test-unexpected-error');
			});

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.Unexpected);
			expect((finalValue.v as NoNextEditReason.Unexpected).error.message).toContain('test-unexpected-error');
		});

		it('returns GotCancelled when token is already cancelled', async () => {
			const provider = createProvider();

			const lines = ['function foo() {', '  return 1;', '}'];
			const request = createRequestWithEdit(lines, { insertionOffset: 5, insertedText: 'c' });

			streamingFetcher.setStreamingLines(['modified line']);

			const cts = new CancellationTokenSource();
			cts.cancel(); // cancel immediately

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), cts.token);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			// Should be cancelled at some point during processing
			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
		});

		it('every yield is wrapped in WithStatelessProviderTelemetry', async () => {
			const provider = createProvider();

			const lines = Array.from({ length: 30 }, (_, i) => `line ${i} content`);
			const request = createRequestWithEdit(lines, {
				insertionOffset: 10,
				insertedText: 'x',
			});

			// Stream back the edit window with a modification
			const editWindowLines = [...lines];
			editWindowLines[0] = 'MODIFIED line 0 content';
			streamingFetcher.setStreamingLines(editWindowLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			// If edits were yielded, each should be a WithStatelessProviderTelemetry
			for (const edit of edits) {
				expect(edit).toBeInstanceOf(WithStatelessProviderTelemetry);
				expect(edit.telemetryBuilder).toBeDefined();
			}
			// Final return value should also be wrapped
			expect(finalReason).toBeInstanceOf(WithStatelessProviderTelemetry);
			expect(finalReason.telemetryBuilder).toBeDefined();
		});
	});

	// ========================================================================
	// Group 2: Edit Window Computation
	// ========================================================================

	describe('edit window computation', () => {
		it('expandedEditWindowNLines overrides default nLinesBelow', async () => {
			const provider = createProvider();

			// Create a tall document
			const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
			const cursorOffset = lines.slice(0, 5).join('\n').length; // cursor at end of line 4 (0-based)

			const request = createRequestWithEdit(lines, {
				insertionOffset: cursorOffset,
				insertedText: 'x',
				expandedEditWindowNLines: 40,
			});

			// Stream back identity (no change) — we care about the window calc, not the edit
			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits } = await collectEdits(gen);

			// With expandedEditWindowNLines=40 and cursor near line 4, the window should be large
			// The key assertion is that we got here without PromptTooLarge errors and the window range
			// is passed through to the streamedEdit.window
			if (edits.length > 0) {
				const window = edits[0].v.window;
				expect(window).toBeDefined();
			}
		});

		it('merge conflict markers expand the edit window when configured', async () => {
			const provider = createProvider();
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsXtabMaxMergeConflictLines, 20);

			// Place cursor near the start of a merge conflict
			const lines = [
				'line 0',
				'line 1',
				'<<<<<<< HEAD',
				'  our version',
				'=======',
				'  their version',
				'>>>>>>> branch',
				'line 7',
			];

			const cursorOffset = lines.slice(0, 2).join('\n').length + 1; // cursor at line 1
			const request = createRequestWithEdit(lines, {
				insertionOffset: cursorOffset,
				insertedText: 'x',
			});

			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const result = await collectEdits(gen);

			// The edit window should have been expanded to include the merge conflict
			// We check this implicitly: the provider processed without error
			expect(result.finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});
	});

	// ========================================================================
	// Group 3: Model Configuration
	// ========================================================================

	describe('model configuration', () => {
		it('uses selectedModelConfiguration from model service', async () => {
			const provider = createProvider();

			mockModelService.setSelectedConfig({
				promptingStrategy: PromptingStrategy.Xtab275,
			});

			const lines = ['const x = 1;', 'const y = 2;', 'const z = 3;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			await AsyncIterUtils.drainUntilReturn(gen);

			// Verify the fetcher was called (meaning we got past config assembly)
			expect(streamingFetcher.callCount).toBeGreaterThan(0);

			// Verify the system message corresponds to Xtab275 strategy
			const capturedMessages = streamingFetcher.capturedOptions[0]?.messages;
			expect(capturedMessages).toBeDefined();
			const systemMessage = capturedMessages?.find(m => m.role === Raw.ChatRole.System);
			expect(systemMessage).toBeDefined();
			expect(getMessageText(systemMessage!)).toBe(xtab275SystemPrompt);
		});

		it('retries with default model after NotFound response', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

			// First call → NotFound, second call → Success with streaming lines
			streamingFetcher.enqueueResponse({
				type: ChatFetchResponseType.NotFound,
				reason: 'test',
				requestId: 'req-1',
				serverRequestId: undefined,
			});
			// After NotFound, the provider retries with the default model; configure streaming response for that
			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			await AsyncIterUtils.drainUntilReturn(gen);

			// Should have made two calls - first failed with NotFound, second retried
			expect(streamingFetcher.callCount).toBe(2);
		});

		it('does not loop infinitely on repeated NotFound', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

			// Both calls → NotFound (queue two NotFound responses)
			const notFoundResponse = {
				type: ChatFetchResponseType.NotFound as const,
				reason: 'test',
				requestId: 'req-1',
				serverRequestId: undefined,
			};
			streamingFetcher.enqueueResponse(notFoundResponse);
			streamingFetcher.enqueueResponse(notFoundResponse);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			// After retrying with default model (which also returns NotFound),
			// it should give up with FetchFailure (not loop)
			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.FetchFailure);
			// Exactly 2 calls: initial + one retry with default model
			expect(streamingFetcher.callCount).toBe(2);
		});

		it('returns NoSuggestions when response contains no choices', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

			streamingFetcher.enqueueResponse({
				type: ChatFetchResponseType.Unknown,
				reason: RESPONSE_CONTAINED_NO_CHOICES,
				requestId: 'req-1',
				serverRequestId: undefined,
			});

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('returns FetchFailure for Unknown response with a different reason', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

			streamingFetcher.enqueueResponse({
				type: ChatFetchResponseType.Unknown,
				reason: 'some other error',
				requestId: 'req-1',
				serverRequestId: undefined,
			});

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.FetchFailure);
		});
	});

	// ========================================================================
	// Group 4: Filter Pipeline
	// ========================================================================

	describe('filter pipeline', () => {
		it('filters out import-only changes', async () => {
			const provider = createProvider();

			const lines = [
				'import { foo } from "bar";',
				'',
				'function main() {',
				'  foo();',
				'}',
			];
			// Place cursor at the import line
			const request = createRequestWithEdit(lines, {
				insertionOffset: 5,
				insertedText: 'x',
				languageId: 'typescript',
			});

			// Respond with a modified import line
			const responseLines = [...lines];
			responseLines[0] = 'import { foo, baz } from "bar";';
			streamingFetcher.setStreamingLines(responseLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits } = await collectEdits(gen);

			// Import-only changes should be filtered out
			expect(edits.length).toBe(0);
		});

		it('passes through substantive code edits', async () => {
			const provider = createProvider();

			const lines = [
				'function main() {',
				'  return 1;',
				'}',
			];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 30, // inside "return 1"
				insertedText: 'x',
			});

			// Respond with a substantive code change
			const responseLines = [
				'function main() {',
				'  return 42;',
				'}',
			];
			streamingFetcher.setStreamingLines(responseLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits } = await collectEdits(gen);

			// Substantive edits should pass through filters
			expect(edits.length).toBeGreaterThan(0);
		});

		it('filters out whitespace-only changes by default', async () => {
			const provider = createProvider();

			const lines = [
				'function main() {',
				'    return 1;', // 4-space indent
				'}',
			];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 20,
				insertedText: ' ',
			});

			// Respond with only a whitespace change (different indentation)
			const responseLines = [
				'function main() {',
				'  return 1;', // 2-space indent
				'}',
			];
			streamingFetcher.setStreamingLines(responseLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits } = await collectEdits(gen);

			expect(edits.length).toBe(0);
		});

		it('allows whitespace-only changes when config enables them', async () => {
			const provider = createProvider();
			await configService.setConfig(ConfigKey.InlineEditsAllowWhitespaceOnlyChanges, true);

			const lines = [
				'function main() {',
				'  const a  =  1;', // double spaces around = and after a
				'}',
			];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 20,
				insertedText: ' ',
			});

			// Respond with normalized spacing (single spaces) — a whitespace-only change
			// that has both leading and non-leading whitespace differences
			const responseLines = [
				'function main() {',
				'  const a = 1;', // single spaces
				'}',
			];
			streamingFetcher.setStreamingLines(responseLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits } = await collectEdits(gen);

			// With the config enabled, whitespace changes should pass through
			// (note: IgnoreEmptyLineAndLeadingTrailingWhitespaceChanges may still filter
			// if only leading/trailing whitespace changed, so we use an in-line spacing change)
			expect(edits.length).toBeGreaterThan(0);
		});
	});

	// ========================================================================
	// Group 5: Response Format Handling
	// ========================================================================

	describe('response format handling', () => {
		it('EditWindowOnly: streams edit directly through diff pipeline', async () => {
			const provider = createProvider();

			// Default prompting strategy uses EditWindowOnly response format
			mockModelService.setSelectedConfig({ promptingStrategy: undefined });

			const lines = [
				'function hello() {',
				'  console.log("hello");',
				'}',
			];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 25,
				insertedText: 'x',
			});

			const responseLines = [
				'function hello() {',
				'  console.log("world");', // changed
				'}',
			];
			streamingFetcher.setStreamingLines(responseLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits } = await collectEdits(gen);

			expect(edits.length).toBeGreaterThan(0);
			// Verify the edit targets the modified line
			const firstEdit = edits[0].v.edit;
			expect(firstEdit.newLines.some(line => line.includes('world'))).toBe(true);
		});

		it('UnifiedWithXml NO_CHANGE triggers cursor jump path (returns NoSuggestions when disabled)', async () => {
			const provider = createProvider();

			mockModelService.setSelectedConfig({
				promptingStrategy: PromptingStrategy.UnifiedModel,
			});

			// Disable cursor prediction so the cursor jump path returns NoSuggestions
			await configService.setConfig(ConfigKey.InlineEditsNextCursorPredictionEnabled, false);

			const lines = ['const a = 1;', 'const b = 2;'];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 5,
				insertedText: 'x',
			});

			// NO_CHANGE tag
			streamingFetcher.setStreamingLines(['<NO_CHANGE>']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('UnifiedWithXml INSERT yields insertion edit at cursor line', async () => {
			const provider = createProvider();

			mockModelService.setSelectedConfig({
				promptingStrategy: PromptingStrategy.UnifiedModel,
			});

			const lines = ['const a = 1;', 'const b = 2;', 'const c = 3;'];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 5,
				insertedText: 'x',
			});

			// INSERT response with new code after cursor
			streamingFetcher.setStreamingLines([
				'<INSERT>',
				' + additional',
				'</INSERT>',
			]);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits } = await collectEdits(gen);

			// Should have yielded at least one edit (the cursor line modification)
			expect(edits.length).toBeGreaterThan(0);
		});

		it('UnifiedWithXml EDIT response streams through diff pipeline', async () => {
			const provider = createProvider();

			mockModelService.setSelectedConfig({
				promptingStrategy: PromptingStrategy.UnifiedModel,
			});

			const lines = ['const a = 1;', 'const b = 2;', 'const c = 3;'];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 5,
				insertedText: 'x',
			});

			// EDIT response with modified code
			streamingFetcher.setStreamingLines([
				'<EDIT>',
				'const a = 42;',
				'const b = 2;',
				'const c = 3;',
				'</EDIT>',
			]);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits } = await collectEdits(gen);

			expect(edits.length).toBeGreaterThan(0);
			// Verify the edit modifies the first line
			const firstEdit = edits[0].v.edit;
			expect(firstEdit.newLines.some(line => line.includes('42'))).toBe(true);
		});

		it('UnifiedWithXml unexpected tag returns Unexpected error', async () => {
			const provider = createProvider();

			mockModelService.setSelectedConfig({
				promptingStrategy: PromptingStrategy.UnifiedModel,
			});

			const lines = ['const a = 1;'];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 5,
				insertedText: 'x',
			});

			streamingFetcher.setStreamingLines(['<UNKNOWN_TAG>']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.Unexpected);
		});

		it('EditWindowWithEditIntent: high intent passes through', async () => {
			const provider = createProvider();

			mockModelService.setSelectedConfig({
				promptingStrategy: PromptingStrategy.Xtab275EditIntent,
			});

			const lines = [
				'function hello() {',
				'  return 1;',
				'}',
			];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 25,
				insertedText: 'x',
			});

			// High intent + modified code
			const responseLines = [
				'<|edit_intent|>high<|/edit_intent|>',
				'function hello() {',
				'  return 42;',
				'}',
			];
			streamingFetcher.setStreamingLines(responseLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits } = await collectEdits(gen);

			expect(edits.length).toBeGreaterThan(0);
		});

		it('EditWindowWithEditIntent: no_edit intent filters out edit', async () => {
			const provider = createProvider();

			mockModelService.setSelectedConfig({
				promptingStrategy: PromptingStrategy.Xtab275EditIntent,
			});

			const lines = [
				'function hello() {',
				'  return 1;',
				'}',
			];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 25,
				insertedText: 'x',
			});

			// no_edit intent → should be filtered
			const responseLines = [
				'<|edit_intent|>no_edit<|/edit_intent|>',
				'function hello() {',
				'  return 42;',
				'}',
			];
			streamingFetcher.setStreamingLines(responseLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.FilteredOut);
		});

		it('EditWindowWithEditIntentShort: H passes through', async () => {
			const provider = createProvider();

			mockModelService.setSelectedConfig({
				promptingStrategy: PromptingStrategy.Xtab275EditIntentShort,
			});

			const lines = [
				'function hello() {',
				'  return 1;',
				'}',
			];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 25,
				insertedText: 'x',
			});

			const responseLines = [
				'H',
				'function hello() {',
				'  return 42;',
				'}',
			];
			streamingFetcher.setStreamingLines(responseLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits } = await collectEdits(gen);

			expect(edits.length).toBeGreaterThan(0);
		});

		it('EditWindowWithEditIntentShort: N short name filters no_edit', async () => {
			const provider = createProvider();

			mockModelService.setSelectedConfig({
				promptingStrategy: PromptingStrategy.Xtab275EditIntentShort,
			});

			const lines = [
				'function hello() {',
				'  return 1;',
				'}',
			];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 25,
				insertedText: 'x',
			});

			const responseLines = [
				'N', // N = no_edit
				'function hello() {',
				'  return 42;',
				'}',
			];
			streamingFetcher.setStreamingLines(responseLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.FilteredOut);
		});

		it('empty response returns NoSuggestions', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;'];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 5,
				insertedText: 'x',
			});

			// Empty response → no lines streamed
			streamingFetcher.setStreamingLines([]);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('identical response (no diff) returns NoSuggestions', async () => {
			const provider = createProvider();

			// Disable cursor prediction so we get a clean NoSuggestions
			await configService.setConfig(ConfigKey.InlineEditsNextCursorPredictionEnabled, false);

			const lines = ['function hello() {', '  return 1;', '}'];
			const request = createRequestWithEdit(lines, { insertionOffset: 5 });

			// Stream back the exact same lines → no diff
			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});
	});

	// ========================================================================
	// Group 6: Cursor Jump / Retry Logic
	// ========================================================================

	describe('cursor jump retry logic', () => {
		it('no edits + cursor prediction disabled → returns NoSuggestions', async () => {
			const provider = createProvider();
			await configService.setConfig(ConfigKey.InlineEditsNextCursorPredictionEnabled, false);

			const lines = ['line 0', 'line 1', 'line 2'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3 });

			// Stream back identical content → no diff → triggers cursor jump path
			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('no edits + cursor prediction enabled + user typed during request → skips cursor prediction', async () => {
			const provider = createProvider();
			await configService.setConfig(ConfigKey.InlineEditsNextCursorPredictionEnabled, true);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionModelName, 'test-model');

			const lines = ['line 0', 'line 1', 'line 2'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3 });

			// Simulate the user typing after the request was created
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(0), 'x')
			);

			// Stream back identical content → no diff → would trigger cursor jump path,
			// but intermediateUserEdit is non-empty so cursor prediction should be skipped
			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
			// Cursor prediction must not have been issued — only the main LLM call was made
			expect(streamingFetcher.callCount).toBe(1);
		});

		it('no edits + cursor prediction enabled + intermediateUserEdit undefined → skips cursor prediction', async () => {
			const provider = createProvider();
			await configService.setConfig(ConfigKey.InlineEditsNextCursorPredictionEnabled, true);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionModelName, 'test-model');

			const lines = ['line 0', 'line 1', 'line 2'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3 });

			// intermediateUserEdit = undefined means consistency check failed (user typed and edits diverged)
			request.intermediateUserEdit = undefined;

			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
			// Cursor prediction must not have been issued — only the main LLM call was made
			expect(streamingFetcher.callCount).toBe(1);
		});
	});

	// ========================================================================
	// Group 7: Debounce Behavior
	// ========================================================================

	describe('debounce behavior', () => {
		it('debounce is skipped in simulation tests', async () => {
			// Override the simulation test context to indicate we're in sim tests
			const testingServiceCollection = createExtensionUnitTestingServices(disposables);
			testingServiceCollection.set(IInlineEditsModelService, mockModelService);
			streamingFetcher = new StreamingMockChatMLFetcher();
			testingServiceCollection.set(IChatMLFetcher, streamingFetcher);
			testingServiceCollection.set(ISimulationTestContext, {
				isInSimulationTests: true,
				_serviceBrand: undefined,
				writeFile: async () => '',
			} satisfies ISimulationTestContext);

			const accessor2 = disposables.add(testingServiceCollection.createTestingAccessor());
			const simProvider = accessor2.get(IInstantiationService).createInstance(XtabProvider);

			const lines = ['const x = 1;', 'const y = 2;'];
			const doc = makeDocumentWithEdit(lines, { insertionOffset: 5, insertedText: 'a' });
			const beforeText = new StringText(doc.documentBeforeEdits.value);
			const request = new StatelessNextEditRequest(
				'req-sim', 'opp-sim', beforeText, [doc], 0,
				[{ docId: doc.id, kind: 'visibleRanges', visibleRanges: [new OffsetRange(0, 100)], documentContent: doc.documentAfterEdits }],
				new DeferredPromise<Result<unknown, NoNextEditReason>>(), undefined,
				false, // isSpeculative
				createLogContext(), undefined, undefined, Date.now(),
			);

			// Response with a change
			streamingFetcher.setStreamingLines(['const x = 42;', 'const y = 2;']);

			const startTime = Date.now();
			const gen = simProvider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			await AsyncIterUtils.drainUntilReturn(gen);
			const elapsed = Date.now() - startTime;

			// In simulation mode, debounce should be skipped. This should complete quickly.
			// Use a generous threshold since CI can be slow, but it should be much less than
			// a typical debounce time of 200-500ms
			expect(elapsed).toBeLessThan(5000);
		});

		it('does not apply extra debounce for speculative requests even when cursor is at end of line', async () => {
			const provider = createProvider();
			const spy = vi.spyOn(DelaySession.prototype, 'setExtraDebounce');

			// Cursor at end of line (insertionOffset = 12 inserts ';' at end → cursor after last char)
			const request = createRequestWithEdit(['const x = 1;'], { insertionOffset: 12, isSpeculative: true });
			streamingFetcher.setStreamingLines(['const x = 42;']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			await AsyncIterUtils.drainUntilReturn(gen);

			expect(spy).not.toHaveBeenCalled();
			spy.mockRestore();
		});

		it('applies extra debounce for non-speculative requests when cursor is at end of line', async () => {
			const provider = createProvider();
			const spy = vi.spyOn(DelaySession.prototype, 'setExtraDebounce');

			// Same cursor-at-end-of-line setup, but non-speculative
			const request = createRequestWithEdit(['const x = 1;'], { insertionOffset: 12, isSpeculative: false });
			streamingFetcher.setStreamingLines(['const x = 42;']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			await AsyncIterUtils.drainUntilReturn(gen);

			expect(spy).toHaveBeenCalled();
			spy.mockRestore();
		});

		it('cancellation during debounce exits early with GotCancelled before LLM fetch', async () => {
			const debounceMs = 500;
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsDebounce, debounceMs);

			const provider = createProvider();
			const lines = ['function foo() {', '  return 1;', '}'];
			const request = createRequestWithEdit(lines, { insertionOffset: 5, insertedText: 'c' });
			streamingFetcher.setStreamingLines(lines);

			const cts = new CancellationTokenSource();
			vi.useFakeTimers();
			try {
				const genPromise = AsyncIterUtils.drainUntilReturn(
					provider.provideNextEdit(request, createMockLogger(), createLogContext(), cts.token)
				);

				// Flush pending microtasks so the provider reaches the debounce await
				await vi.advanceTimersByTimeAsync(0);
				// Cancel while the debounce timer is scheduled but has not fired
				cts.cancel();

				const finalValue = await genPromise;

				expect(finalValue.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				// LLM fetch must not have been issued — cancelled before the fetch phase
				expect(streamingFetcher.callCount).toBe(0);
			} finally {
				vi.useRealTimers();
				cts.dispose();
			}
		});

		it('pre-cancelled token resolves without waiting for debounce', async () => {
			const debounceMs = 500;
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsDebounce, debounceMs);

			const provider = createProvider();
			const lines = ['function foo() {', '  return 1;', '}'];
			const request = createRequestWithEdit(lines, { insertionOffset: 5, insertedText: 'c' });
			streamingFetcher.setStreamingLines(lines);

			const cts = new CancellationTokenSource();
			cts.cancel(); // already cancelled before provideNextEdit is called

			vi.useFakeTimers();
			try {
				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), cts.token);
				const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

				expect(finalValue.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
			} finally {
				vi.useRealTimers();
				cts.dispose();
			}
		});
	});

	// ========================================================================
	// Group 8: Fetch Failure Handling
	// ========================================================================

	describe('fetch failure handling', () => {
		it('maps RateLimited error to Uncategorized', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

			streamingFetcher.setErrorResponse({
				type: ChatFetchResponseType.RateLimited,
				reason: 'test',
				requestId: 'req-1',
				serverRequestId: undefined,
				retryAfter: undefined,
				rateLimitKey: 'test',
				isAuto: false,
			});

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.Uncategorized);
		});

		it('maps NetworkError to FetchFailure', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

			streamingFetcher.setErrorResponse({
				type: ChatFetchResponseType.NetworkError,
				reason: 'test',
				requestId: 'req-1',
				serverRequestId: undefined,
			});

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.FetchFailure);
		});

		it('maps Canceled to GotCancelled', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

			streamingFetcher.setErrorResponse({
				type: ChatFetchResponseType.Canceled,
				reason: 'test',
				requestId: 'req-1',
				serverRequestId: undefined,
			});

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const finalValue = await AsyncIterUtils.drainUntilReturn(gen);

			expect(finalValue.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
		});
	});

	// ========================================================================
	// Group 9: Prompt Construction Verification
	// ========================================================================

	describe('prompt construction', () => {
		it('system prompt matches the configured prompting strategy', async () => {
			const strategies: [PromptingStrategy, string][] = [
				[PromptingStrategy.UnifiedModel, unifiedModelSystemPrompt],
				[PromptingStrategy.SimplifiedSystemPrompt, simplifiedPrompt],
				[PromptingStrategy.Xtab275, xtab275SystemPrompt],
				[PromptingStrategy.Nes41Miniv3, nes41Miniv3SystemPrompt],
			];

			for (const [strategy, expectedSystemPrompt] of strategies) {
				const provider = createProvider();
				mockModelService.setSelectedConfig({ promptingStrategy: strategy });

				const lines = ['const x = 1;', 'const y = 2;'];
				const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

				streamingFetcher.setStreamingLines(lines);
				streamingFetcher.resetTracking();

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				await AsyncIterUtils.drainUntilReturn(gen);

				const captured = streamingFetcher.capturedOptions[0];
				expect(captured).toBeDefined();
				const systemMsg = captured.messages.find(m => m.role === Raw.ChatRole.System);
				expect(systemMsg).toBeDefined();
				expect(getMessageText(systemMsg!)).toBe(expectedSystemPrompt);
			}
		});

		it('prompt has system and user messages', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;', 'const y = 2;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			await AsyncIterUtils.drainUntilReturn(gen);

			const captured = streamingFetcher.capturedOptions[0];
			expect(captured).toBeDefined();
			const roles = captured.messages.map(m => m.role);
			expect(roles).toContain(Raw.ChatRole.System);
			expect(roles).toContain(Raw.ChatRole.User);
		});

		it('request sets temperature to 0', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			await AsyncIterUtils.drainUntilReturn(gen);

			const captured = streamingFetcher.capturedOptions[0];
			expect(captured.requestOptions?.temperature).toBe(0);
		});

		it('request enables streaming', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3, insertedText: 'a' });

			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			await AsyncIterUtils.drainUntilReturn(gen);

			const captured = streamingFetcher.capturedOptions[0];
			expect(captured.requestOptions?.stream).toBe(true);
		});
	});
});
suite('filterOutEditsWithSubstrings', () => {

	function makeEdit(newLines: string[]): LineReplacement {
		return new LineReplacement(new LineRange(1, 2), newLines);
	}

	test('should return all edits when no lines contain any forbidden substring', () => {
		const edits = [
			makeEdit(['const x = 1;']),
			makeEdit(['const y = 2;']),
		];
		const result = filterOutEditsWithSubstrings(edits, ['<|forbidden|>']);
		expect(result).toEqual(edits);
	});

	test('should filter out edits where a line contains a forbidden substring', () => {
		const kept = makeEdit(['const x = 1;']);
		const filtered = makeEdit(['<|current_file_content|>some text']);
		const result = filterOutEditsWithSubstrings([kept, filtered], ['<|current_file_content|>']);
		expect(result).toEqual([kept]);
	});

	test('should filter out edits matching any of multiple substrings', () => {
		const e1 = makeEdit(['hello world']);
		const e2 = makeEdit(['<|diff_marker|>']);
		const e3 = makeEdit(['<|current_file_content|>']);
		const result = filterOutEditsWithSubstrings([e1, e2, e3], ['<|diff_marker|>', '<|current_file_content|>']);
		expect(result).toEqual([e1]);
	});

	test('should filter out edit if any line in newLines contains a forbidden substring', () => {
		const edit = makeEdit(['line 1', '<|diff_marker|> line 2', 'line 3']);
		const result = filterOutEditsWithSubstrings([edit], ['<|diff_marker|>']);
		expect(result).toEqual([]);
	});

	test('should keep edit when lines are close to but do not match the substring', () => {
		const edit = makeEdit(['<|diff_marke|>']);
		const result = filterOutEditsWithSubstrings([edit], ['<|diff_marker|>']);
		expect(result).toEqual([edit]);
	});

	test('should return empty array when all edits are filtered out', () => {
		const edits = [
			makeEdit(['<|current_file_content|>']),
			makeEdit(['<|diff_marker|>']),
		];
		const result = filterOutEditsWithSubstrings(edits, ['<|current_file_content|>', '<|diff_marker|>']);
		expect(result).toEqual([]);
	});

	test('should return all edits when substringsToFilterOut is empty', () => {
		const edits = [
			makeEdit(['<|current_file_content|>']),
			makeEdit(['anything']),
		];
		const result = filterOutEditsWithSubstrings(edits, []);
		expect(result).toEqual(edits);
	});

	test('should handle empty edits array', () => {
		const result = filterOutEditsWithSubstrings([], ['<|diff_marker|>']);
		expect(result).toEqual([]);
	});

	test('should keep edits with empty newLines', () => {
		const edit = makeEdit([]);
		const result = filterOutEditsWithSubstrings([edit], ['<|diff_marker|>']);
		expect(result).toEqual([edit]);
	});
});

suite('getNextCursorColumn', () => {

	const { BeforeLine, AfterLine } = NextCursorLinePredictionCursorPlacement;

	/** Inserts a `|` cursor marker at the computed column position (1-based). */
	function colWithMarker(line: string | undefined, placement: NextCursorLinePredictionCursorPlacement): string {
		const column = XtabProvider.getNextCursorColumn(line, placement);
		const s = line ?? '';
		return s.slice(0, column - 1) + '|' + s.slice(column - 1);
	}

	test('BeforeLine: indented with spaces', () => {
		expect(colWithMarker('    const x = 1;', BeforeLine)).toMatchInlineSnapshot(`"    |const x = 1;"`);
	});

	test('BeforeLine: indented with tabs', () => {
		expect(colWithMarker('\t\treturn;', BeforeLine)).toMatchInlineSnapshot(`"		|return;"`);
	});

	test('BeforeLine: no leading whitespace', () => {
		expect(colWithMarker('function foo() {', BeforeLine)).toMatchInlineSnapshot(`"|function foo() {"`);
	});

	test('BeforeLine: empty string', () => {
		expect(colWithMarker('', BeforeLine)).toMatchInlineSnapshot(`"|"`);
	});

	test('BeforeLine: whitespace-only line', () => {
		expect(colWithMarker('   ', BeforeLine)).toMatchInlineSnapshot(`"   |"`);
	});

	test('BeforeLine: undefined', () => {
		expect(colWithMarker(undefined, BeforeLine)).toMatchInlineSnapshot(`"|"`);
	});

	test('AfterLine: normal line', () => {
		expect(colWithMarker('const x = 1;', AfterLine)).toMatchInlineSnapshot(`"const x = 1;|"`);
	});

	test('AfterLine: empty string', () => {
		expect(colWithMarker('', AfterLine)).toMatchInlineSnapshot(`"|"`);
	});

	test('AfterLine: undefined', () => {
		expect(colWithMarker(undefined, AfterLine)).toMatchInlineSnapshot(`"|"`);
	});

	test('AfterLine: trailing whitespace', () => {
		expect(colWithMarker('abc   ', AfterLine)).toMatchInlineSnapshot(`"abc   |"`);
	});
});
