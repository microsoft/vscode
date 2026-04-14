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
import { DEFAULT_OPTIONS, EarlyDivergenceCancellationMode, LanguageContextLanguages, LintOptionShowCode, LintOptionWarning, ModelConfiguration, PromptingStrategy, ResponseFormat } from '../../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
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
	getPredictionContents,
	mapChatFetcherErrorToNoNextEditReason,
	ModelConfig,
	overrideModelConfig,
	pickSystemPrompt,
	XtabProvider,
} from '../../node/xtabProvider';

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

		it('same-file cursor jump with edit: retry yields edits with isFromCursorJump', async () => {
			const provider = createProvider();
			await configService.setConfig(ConfigKey.InlineEditsNextCursorPredictionEnabled, true);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionModelName, 'test-model');

			// Document with 30 lines; cursor near the top.
			// Cursor is after the inserted '\n' at the end of line 4 → cursorLineOffset=5.
			// Edit window: [max(0,5-2), min(30,5+5+1)) = [3, 11) → lines 3..10.
			const lines = Array.from({ length: 30 }, (_, i) => `line ${i} content`);
			const cursorOffset = lines.slice(0, 5).join('\n').length;
			const request = createRequestWithEdit(lines, {
				insertionOffset: cursorOffset,
				// insertedText defaults to afterText[cursorOffset] = '\n', so documentAfterEdits matches lines
			});

			// 1st call (main LLM): stream back edit-window lines unchanged → no diff
			const mainEditWindowLines = lines.slice(3, 11);
			streamingFetcher.enqueueResponse({
				type: ChatFetchResponseType.Success,
				requestId: 'req-main',
				serverRequestId: 'srv-main',
				usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } },
				value: mainEditWindowLines.join('\n'),
				resolvedModel: 'test-model',
			});

			// 2nd call (cursor prediction): return line 20 (outside the edit window)
			streamingFetcher.enqueueResponse({
				type: ChatFetchResponseType.Success,
				requestId: 'req-cursor',
				serverRequestId: 'srv-cursor',
				usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } },
				value: '20',
				resolvedModel: 'test-model',
			});

			// 3rd call (retry at predicted cursor line 20):
			// Retry edit window: [max(0,20-2), min(30,20+5+1)) = [18, 26) → lines 18..25.
			// Return modified edit-window lines.
			const retryEditWindowLines = lines.slice(18, 26).map((l, i) => i === 2 ? 'MODIFIED line 20 content' : l);
			streamingFetcher.setStreamingLines(retryEditWindowLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			// Edits should have been yielded from the retry
			expect(edits.length).toBeGreaterThan(0);
			// All yielded edits should be marked as from cursor jump
			for (const edit of edits) {
				expect(edit.v.isFromCursorJump).toBe(true);
			}
			// All yielded edits should have an originalWindow (the pre-jump edit window)
			for (const edit of edits) {
				expect(edit.v.originalWindow).toBeDefined();
			}
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
			// 3 total calls: main LLM + cursor prediction + retry
			expect(streamingFetcher.callCount).toBe(3);
		});

		it('cursor jump retry does not double-retry when second call also yields no edits', async () => {
			const provider = createProvider();
			await configService.setConfig(ConfigKey.InlineEditsNextCursorPredictionEnabled, true);
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionModelName, 'test-model');

			const lines = Array.from({ length: 30 }, (_, i) => `line ${i} content`);
			const cursorOffset = lines.slice(0, 5).join('\n').length;
			const request = createRequestWithEdit(lines, {
				insertionOffset: cursorOffset,
			});

			// 1st call (main LLM): edit-window lines unchanged → no edits → cursor jump
			const mainEditWindowLines = lines.slice(3, 11);
			streamingFetcher.enqueueResponse({
				type: ChatFetchResponseType.Success,
				requestId: 'req-main',
				serverRequestId: 'srv-main',
				usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } },
				value: mainEditWindowLines.join('\n'),
				resolvedModel: 'test-model',
			});

			// 2nd call (cursor prediction): return line 20
			streamingFetcher.enqueueResponse({
				type: ChatFetchResponseType.Success,
				requestId: 'req-cursor',
				serverRequestId: 'srv-cursor',
				usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } },
				value: '20',
				resolvedModel: 'test-model',
			});

			// 3rd call (retry at predicted cursor line 20): edit-window lines unchanged → no edits.
			// On the retry, retryState is Retrying so doGetNextEditsWithCursorJump returns
			// NoSuggestions immediately (no further recursion).
			const retryEditWindowLines = lines.slice(18, 26);
			streamingFetcher.setStreamingLines(retryEditWindowLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
			// Exactly 3 calls: main + cursor prediction + retry (no further retry)
			expect(streamingFetcher.callCount).toBe(3);
		});

		it('model fallback retry on NotFound then yields edits on second attempt', async () => {
			const provider = createProvider();

			const lines = ['function foo() {', '  return 1;', '}'];
			const request = createRequestWithEdit(lines, { insertionOffset: 5 });

			// 1st call → NotFound, triggers fallback to default model
			streamingFetcher.enqueueResponse({
				type: ChatFetchResponseType.NotFound,
				reason: 'test',
				requestId: 'req-1',
				serverRequestId: undefined,
			});

			// 2nd call (retry with default model) → success with modification
			const modifiedLines = ['function foo() {', '  return 42;', '}'];
			streamingFetcher.setStreamingLines(modifiedLines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			// Should have produced edits from the retry
			expect(edits.length).toBeGreaterThan(0);
			// Edits are NOT from cursor jump
			for (const edit of edits) {
				expect(edit.v.isFromCursorJump).toBe(false);
			}
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
			expect(streamingFetcher.callCount).toBe(2);
		});

		it('model fallback + identical content → NoSuggestions without looping', async () => {
			const provider = createProvider();
			await configService.setConfig(ConfigKey.InlineEditsNextCursorPredictionEnabled, false);

			const lines = ['const a = 1;', 'const b = 2;', 'const c = 3;'];
			const request = createRequestWithEdit(lines, { insertionOffset: 3 });

			// 1st call → NotFound
			streamingFetcher.enqueueResponse({
				type: ChatFetchResponseType.NotFound,
				reason: 'test',
				requestId: 'req-1',
				serverRequestId: undefined,
			});

			// 2nd call (default model) → identical edit-window content → no edits
			// With cursor prediction disabled, should return NoSuggestions directly
			streamingFetcher.setStreamingLines(lines);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
			// Exactly 2 calls: initial NotFound + retry with default model
			expect(streamingFetcher.callCount).toBe(2);
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

	// ========================================================================
	// Group 10: Cursor-Line Divergence — Early Cancellation
	// ========================================================================

	describe('cursor-line divergence cancellation', () => {

		/**
		 * Creates a request for divergence tests.
		 *
		 * In the real system, `request.documentBeforeEdits` = the current document at
		 * request creation time (i.e. `documentAfterEdits`), and `intermediateUserEdit`
		 * tracks changes after that. `createRequestWithEdit` sets
		 * `request.documentBeforeEdits` to the doc *before* the trigger edit, so we
		 * construct a request with the intended value here to match reality.
		 */
		function createDivergenceRequest(
			docAtRequestTime: string[],
			opts: { insertionOffset: number; insertedText: string },
		): StatelessNextEditRequest {
			const base = createRequestWithEdit(docAtRequestTime, opts);
			return new StatelessNextEditRequest(
				base.headerRequestId,
				base.opportunityId,
				new StringText(docAtRequestTime.join('\n')),
				base.documents,
				base.activeDocumentIdx,
				base.xtabEditHistory,
				new DeferredPromise<Result<unknown, NoNextEditReason>>(),
				base.expandedEditWindowNLines,
				base.isSpeculative,
				base.logContext,
				base.recordingBookmark,
				base.recording,
				base.providerRequestStartDateTime,
			);
		}

		beforeEach(async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsXtabEarlyCursorLineDivergenceCancellation, EarlyDivergenceCancellationMode.Cursor);
		});

		it('cancels when user typed a character that diverges from model output', async () => {
			const provider = createProvider();

			//  Request created with document: `function fi`
			//  User typed `x` after request → document becomes `function fix`
			//  Model replies `function fibonacci(n: number): number`
			//  → "x" not in model's new text → cancel
			const request = createDivergenceRequest(
				['function fi'],
				{ insertionOffset: 10, insertedText: 'i' },
			);
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(11), 'x')
			);

			streamingFetcher.setStreamingLines(['function fibonacci(n: number): number']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
			expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('cursorLineDiverged');
		});

		it('does not cancel when user typed a character consistent with model output', async () => {
			const provider = createProvider();

			//  Request created with document: `function fi`
			//  User typed `b` after request → document becomes `function fib`
			//  Model replies `function fibonacci(n: number): number`
			//  → "b" is in model's new text → no cancel
			const request = createDivergenceRequest(
				['function fi'],
				{ insertionOffset: 10, insertedText: 'i' },
			);
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(11), 'b')
			);

			// Model output is a superset of user's typing
			streamingFetcher.setStreamingLines(['function fibonacci(n: number): number']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			// Should produce an edit (the rest of the completion), not cancel
			expect(edits.length).toBeGreaterThan(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('does not cancel when user has not typed since request started', async () => {
			const provider = createProvider();

			const lines = ['function foo() {', '  return 1;', '}'];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 3,
				insertedText: 'c',
			});

			// intermediateUserEdit is empty → user hasn't typed since request started
			// The default is StringEdit.empty, so no divergence check should trigger

			// Model responds with a completely different line
			streamingFetcher.setStreamingLines(['function bar() {', '  return 2;', '}']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			// Should proceed normally with the edit, not cancel
			expect(edits.length).toBeGreaterThan(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('does not cancel when intermediateUserEdit is undefined (consistency check failed)', async () => {
			const provider = createProvider();

			const lines = ['const x = 1;', 'const y = 2;'];
			const request = createRequestWithEdit(lines, {
				insertionOffset: 3,
				insertedText: 'a',
			});

			// undefined means consistency check failed earlier — we should not
			// attempt the divergence check
			request.intermediateUserEdit = undefined;

			streamingFetcher.setStreamingLines(['completely different', 'content here']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			// Should proceed normally, not cancel via divergence
			expect(edits.length).toBeGreaterThan(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.NoSuggestions);
		});

		it('does not cancel the request token (only the internal fetch token)', async () => {
			const provider = createProvider();

			const request = createDivergenceRequest(
				['hello world'],
				{ insertionOffset: 5, insertedText: ' ' },
			);

			// User typed 'Z', diverging from model
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(11), 'Z')
			);

			streamingFetcher.setStreamingLines(['hello worlQ completely different']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { finalReason } = await collectEdits(gen);

			// The provider should NOT cancel the request's token — it doesn't own it.
			// It creates its own internal CancellationTokenSource for the fetch.
			expect(request.cancellationTokenSource.token.isCancellationRequested).toBe(false);
			// But it should still report the divergence
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
			expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('cursorLineDiverged');
		});

		it('does not false-cancel when user inserted a line above the cursor', async () => {
			const provider = createProvider();

			//  Request created with 3-line document:
			//    line 0: "import foo"
			//    line 1: "function fi"    ← cursor line (line index 1)
			//    line 2: "}"
			//
			//  After the request, the user inserts a blank line after "import foo",
			//  shifting the cursor line down. Without mapping the cursor line
			//  through the edit, the code would read the wrong line ("") at
			//  index 1 and false-cancel.
			//
			//  The user also typed "b" on the cursor line → "function fib"
			//  Model responds with a compatible continuation.
			const request = createDivergenceRequest(
				['import foo', 'function fi', '}'],
				{ insertionOffset: 21, insertedText: 'i' },
			);

			// intermediateUserEdit (in original doc coordinates):
			//   offset 10 = '\n' after "import foo" → insert extra '\n' (new blank line)
			//   offset 22 = '\n' after "function fi" → insert 'b' (user typing)
			request.intermediateUserEdit = StringEdit.create([
				new StringReplacement(OffsetRange.emptyAt(10), '\n'),
				new StringReplacement(OffsetRange.emptyAt(22), 'b'),
			]);

			// Model output: compatible with user's typing ("b" → "bonacci…")
			streamingFetcher.setStreamingLines(['import foo', 'function fibonacci(n): number', '}']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { finalReason } = await collectEdits(gen);

			// The key assertion: no false cancellation due to line-shift
			if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
				expect(finalReason.v.message).not.toBe('cursorLineDiverged');
			}
		});

		it('cancels on divergence when cursor is not on the first line of the edit window', async () => {
			const provider = createProvider();

			//  Doc at request time: "const a = 1;\nfunction fi\n}"
			//  Offsets: "const a = 1;" = 0..11, \n = 12, "function fi" = 13..23, \n = 24, "}" = 25
			//  Cursor on line 1 (0-based), insertionOffset 23 = last 'i' of "function fi"
			//  Edit window: all 3 lines, cursorOriginalLinesOffset = 1
			//
			//  User typed "x" at offset 24 (end of "function fi") → "function fix"
			//  Model responds with "function fibonacci(n): number"
			//  → "x" doesn't match model → cancel
			const request = createDivergenceRequest(
				['const a = 1;', 'function fi', '}'],
				{ insertionOffset: 23, insertedText: 'i' },
			);

			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(24), 'x')
			);

			streamingFetcher.setStreamingLines(['const a = 1;', 'function fibonacci(n): number', '}']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
			expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('cursorLineDiverged');
		});

		it('does not cancel on compatible typing when cursor is not on the first line', async () => {
			const provider = createProvider();

			//  Same setup but user typed "b" → "function fib", compatible with model
			const request = createDivergenceRequest(
				['const a = 1;', 'function fi', '}'],
				{ insertionOffset: 23, insertedText: 'i' },
			);

			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(24), 'b')
			);

			streamingFetcher.setStreamingLines(['const a = 1;', 'function fibonacci(n): number', '}']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { finalReason } = await collectEdits(gen);

			// Should not be cancelled due to cursor-line divergence
			if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
				expect(finalReason.v.message).not.toBe('cursorLineDiverged');
			}
		});

		it('does not cancel when feature is disabled, even with divergent typing', async () => {
			// Explicitly disable the feature
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsXtabEarlyCursorLineDivergenceCancellation, EarlyDivergenceCancellationMode.Off);

			const provider = createProvider();

			const request = createDivergenceRequest(
				['function fi'],
				{ insertionOffset: 10, insertedText: 'i' },
			);
			// User typed 'x' — divergent from model's 'bonacci...'
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(11), 'x')
			);

			streamingFetcher.setStreamingLines(['function fibonacci(n: number): number']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			// With the feature disabled, the divergent typing should NOT cause cancellation
			expect(edits.length).toBeGreaterThan(0);
			if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
				expect(finalReason.v.message).not.toBe('cursorLineDiverged');
			}
		});

		it('does not cancel when model output is shorter than edit window (cursor line never reached)', async () => {
			const provider = createProvider();

			//  Doc: "line0\nline1\nline2"  (3 lines)
			//  Cursor on line 2 (0-indexed), insertionOffset at end of line2
			//  Model only returns 2 lines (line0 and line1) — it never reaches the
			//  cursor line, so divergence check should not fire.
			const request = createDivergenceRequest(
				['line0', 'line1', 'line2'],
				{ insertionOffset: 16, insertedText: '2' },
			);
			// User typed divergently on cursor line
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(17), 'Z')
			);

			// Model only returns first 2 lines (fewer than the 3-line edit window)
			streamingFetcher.setStreamingLines(['line0', 'COMPLETELY DIFFERENT']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { finalReason } = await collectEdits(gen);

			// Should NOT cancel due to cursorLineDiverged — cursor line was never streamed
			if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
				expect(finalReason.v.message).not.toBe('cursorLineDiverged');
			}
		});

		it('does not cancel when getCurrentCursorLine returns undefined (ambiguous mapping)', async () => {
			const provider = createProvider();

			//  Doc: "aaa\nbbb"  (cursor on line 1 = "bbb")
			//  insertionOffset 4 = start of "bbb"
			const request = createDivergenceRequest(
				['aaa', 'bbb'],
				{ insertionOffset: 4, insertedText: 'b' },
			);

			// The intermediateUserEdit replaces a range that spans across
			// the cursor line boundary, making getCurrentCursorLine return undefined.
			// Offsets in "aaa\nbbb": 'a'=0,1,2, '\n'=3, 'b'=4,5,6
			// Replace offsets 2..6 (spans line boundary) with "Z"
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(new OffsetRange(2, 6), 'Z')
			);

			// Model produces different content
			streamingFetcher.setStreamingLines(['aaa', 'COMPLETELY DIFFERENT']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { finalReason } = await collectEdits(gen);

			// Should NOT cancel via cursorLineDiverged — getCurrentCursorLine returned
			// undefined so the divergence check is skipped.
			if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
				expect(finalReason.v.message).not.toBe('cursorLineDiverged');
			}
		});

		it('does not cancel when user edit results in same content as original (net-zero)', async () => {
			const provider = createProvider();

			//  Doc: "hello world"  (single line, cursor on line 0)
			const request = createDivergenceRequest(
				['hello world'],
				{ insertionOffset: 5, insertedText: ' ' },
			);

			// intermediateUserEdit is empty → user's net change is zero
			// (e.g. user typed and then backspaced)
			request.intermediateUserEdit = StringEdit.empty;

			// Model produces completely different content
			streamingFetcher.setStreamingLines(['COMPLETELY DIFFERENT']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			// Empty intermediateUserEdit → isEmpty() returns true → divergence check skipped
			expect(edits.length).toBeGreaterThan(0);
			if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
				expect(finalReason.v.message).not.toBe('cursorLineDiverged');
			}
		});

		it('yields edits for lines before cursor, then cancels at divergent cursor line', async () => {
			const provider = createProvider();

			//  Doc: "const a = 1;\nfunction fi\n}"
			//  Cursor on line 1 (0-indexed), cursorOriginalLinesOffset = 1
			//  Lines before cursor (line 0) should be yielded normally.
			//  Cursor line should trigger divergence cancellation.
			const request = createDivergenceRequest(
				['const a = 1;', 'function fi', '}'],
				{ insertionOffset: 23, insertedText: 'i' },
			);
			// User typed 'x' on the cursor line — divergent
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(24), 'x')
			);

			// Model changes line 0 (so we get an edit yielded) and has divergent cursor line
			streamingFetcher.setStreamingLines(['const b = 2;', 'function fibonacci(n): number', '}']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { finalReason } = await collectEdits(gen);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
			expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('cursorLineDiverged');
		});

		it('compatible with auto-close pair typing end-to-end', async () => {
			const provider = createProvider();

			//  Doc: "foo"  (single line, cursor at end)
			//  User typed `(` which auto-closed to `()` → "foo()"
			//  Model: "foo(x, y)" — fills the parens
			const request = createDivergenceRequest(
				['foo'],
				{ insertionOffset: 2, insertedText: 'o' },
			);
			// User typed "()" (auto-close pair)
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(3), '()')
			);

			streamingFetcher.setStreamingLines(['foo(x, y)']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { finalReason } = await collectEdits(gen);

			// Should NOT cancel — "()" is an auto-close pair and is a subsequence of "(x, y)"
			if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
				expect(finalReason.v.message).not.toBe('cursorLineDiverged');
			}
		});

		it('backward compat: boolean true activates cursor-mode divergence', async () => {
			// Old experiments set the config to `true` (boolean). This should
			// be treated as EarlyDivergenceCancellationMode.Cursor.
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsXtabEarlyCursorLineDivergenceCancellation, true as any);

			const provider = createProvider();

			const request = createDivergenceRequest(
				['function fi'],
				{ insertionOffset: 10, insertedText: 'i' },
			);
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(11), 'x')
			);

			streamingFetcher.setStreamingLines(['function fibonacci(n: number): number']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBe(0);
			expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
			expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('cursorLineDiverged');
		});

		it('backward compat: boolean false disables divergence', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsXtabEarlyCursorLineDivergenceCancellation, false as any);

			const provider = createProvider();
			const request = createDivergenceRequest(
				['function fi'],
				{ insertionOffset: 10, insertedText: 'i' },
			);
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(11), 'x')
			);

			streamingFetcher.setStreamingLines(['function fibonacci(n: number): number']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBeGreaterThan(0);
			if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
				expect(finalReason.v.message).not.toBe('cursorLineDiverged');
			}
		});

		it('backward compat: undefined disables divergence', async () => {
			await configService.setConfig(ConfigKey.TeamInternal.InlineEditsXtabEarlyCursorLineDivergenceCancellation, undefined as any);

			const provider = createProvider();
			const request = createDivergenceRequest(
				['function fi'],
				{ insertionOffset: 10, insertedText: 'i' },
			);
			request.intermediateUserEdit = StringEdit.single(
				new StringReplacement(OffsetRange.emptyAt(11), 'x')
			);

			streamingFetcher.setStreamingLines(['function fibonacci(n: number): number']);

			const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
			const { edits, finalReason } = await collectEdits(gen);

			expect(edits.length).toBeGreaterThan(0);
			if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
				expect(finalReason.v.message).not.toBe('cursorLineDiverged');
			}
		});

		describe('cursor mode — adversarial scenarios', () => {

			it('ignores divergence on line BEFORE the cursor', async () => {
				const provider = createProvider();

				//  Doc: "line0\nline1\nline2"  cursor on line 2
				//  User edited line 0 divergently, but cursor mode only checks cursor line
				const request = createDivergenceRequest(
					['line0', 'line1', 'line2'],
					{ insertionOffset: 16, insertedText: '2' },
				);
				// User inserts 'Z' at offset 4 (in "line0") → "lineZ0"
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(4), 'Z')
				);

				streamingFetcher.setStreamingLines(['line0', 'line1', 'line2']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('cursorLineDiverged');
				}
			});

			it('ignores divergence on line AFTER the cursor', async () => {
				const provider = createProvider();

				//  Doc: "line0\nline1\nline2"  cursor on line 0
				//  User edited line 2 divergently
				const request = createDivergenceRequest(
					['line0', 'line1', 'line2'],
					{ insertionOffset: 4, insertedText: '0' },
				);
				// User inserts 'Z' at offset 16 (in "line2") → "lineZ2"
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(16), 'Z')
				);

				streamingFetcher.setStreamingLines(['line0', 'line1', 'line2']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('cursorLineDiverged');
				}
			});

			it('detects divergence even when cursor is on the last line of the edit window', async () => {
				const provider = createProvider();

				//  Doc: "aaa\nbbb\nccc"  cursor on line 2 = last line
				//  User typed 'X' on cursor line, model has different text
				const request = createDivergenceRequest(
					['aaa', 'bbb', 'ccc'],
					{ insertionOffset: 10, insertedText: 'c' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(11), 'X')
				);

				streamingFetcher.setStreamingLines(['aaa', 'bbb', 'cccY']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('cursorLineDiverged');
			});

			it('does not cancel when user deleted text on cursor line but model matches result', async () => {
				const provider = createProvider();

				//  Doc: "foobar"  cursor on line 0
				//  User deleted "bar" (offsets 3..6) → "foo"
				//  Model also produces "foo"
				const request = createDivergenceRequest(
					['foobar'],
					{ insertionOffset: 5, insertedText: 'r' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(new OffsetRange(3, 6), '')
				);

				streamingFetcher.setStreamingLines(['foo']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('cursorLineDiverged');
				}
			});

			it('cancels when user replaced text on cursor line and model disagrees', async () => {
				const provider = createProvider();

				//  Doc: "hello world"  cursor on line 0
				//  User replaced "world" (5..11) with "earth" → "hello earth"
				//  Model: "hello mars"
				const request = createDivergenceRequest(
					['hello world'],
					{ insertionOffset: 10, insertedText: 'd' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(new OffsetRange(6, 11), 'earth')
				);

				streamingFetcher.setStreamingLines(['hello mars']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('cursorLineDiverged');
			});

			it('does not cancel when user typed multiple compatible chars', async () => {
				const provider = createProvider();

				//  Doc: "let "  cursor on line 0
				//  User typed "abc" → "let abc"
				//  Model: "let abcdef = 1;" — continues the user's text
				const request = createDivergenceRequest(
					['let '],
					{ insertionOffset: 3, insertedText: ' ' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(4), 'abc')
				);

				streamingFetcher.setStreamingLines(['let abcdef = 1;']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('cursorLineDiverged');
				}
			});

			it('cancels when model produces empty line but user typed on cursor', async () => {
				const provider = createProvider();

				//  Doc: "foo"  cursor on line 0
				//  User typed 'b' → "foob"
				//  Model: "" (empty line)
				const request = createDivergenceRequest(
					['foo'],
					{ insertionOffset: 2, insertedText: 'o' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(3), 'b')
				);

				streamingFetcher.setStreamingLines(['']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('cursorLineDiverged');
			});
		});

		describe('editWindow mode', () => {

			beforeEach(async () => {
				await configService.setConfig(ConfigKey.TeamInternal.InlineEditsXtabEarlyCursorLineDivergenceCancellation, EarlyDivergenceCancellationMode.EditWindow);
			});

			// ── Basic divergence detection ──────────────────────────────────

			it('cancels when user edited a non-cursor line that diverges from model', async () => {
				const provider = createProvider();

				//  Doc: "const a = 1;\nfunction fi\n}"
				//  Cursor on line 1 (insertionOffset 23 = last 'i' of "function fi")
				//  User typed "Z" on line 0 (non-cursor line) at offset 11 (end of "const a = 1") → "const a = 1Z;"
				//  Model echoes the original line 0 "const a = 1;" unchanged
				//  → user changed line 0 but model did not → divergence
				const request = createDivergenceRequest(
					['const a = 1;', 'function fi', '}'],
					{ insertionOffset: 23, insertedText: 'i' },
				);

				// User edits line 0 (non-cursor) divergently
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(11), 'Z')
				);

				streamingFetcher.setStreamingLines(['const a = 1;', 'function fibonacci(n): number', '}']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { edits, finalReason } = await collectEdits(gen);

				expect(edits.length).toBe(0);
				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			it('cancels on cursor-line divergence in editWindow mode', async () => {
				const provider = createProvider();

				const request = createDivergenceRequest(
					['function fi'],
					{ insertionOffset: 10, insertedText: 'i' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(11), 'x')
				);

				streamingFetcher.setStreamingLines(['function fibonacci(n: number): number']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { edits, finalReason } = await collectEdits(gen);

				expect(edits.length).toBe(0);
				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			// ── Compatible edits — no cancellation ──────────────────────────

			it('does not cancel when user edited a non-cursor line compatibly with model', async () => {
				const provider = createProvider();

				//  Doc: "const a = 1;\nfunction fi\n}"
				//  Cursor on line 1
				//  User typed "2" at offset 11 (before ";") → "const a = 12;"
				//  Model: "const a = 123;" → compatible continuation
				const request = createDivergenceRequest(
					['const a = 1;', 'function fi', '}'],
					{ insertionOffset: 23, insertedText: 'i' },
				);

				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(11), '2')
				);

				streamingFetcher.setStreamingLines(['const a = 123;', 'function fibonacci(n): number', '}']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			it('does not cancel when no lines were changed by user', async () => {
				const provider = createProvider();

				//  intermediateUserEdit is empty → no user typing since request
				const request = createDivergenceRequest(
					['aaa', 'bbb', 'ccc'],
					{ insertionOffset: 4, insertedText: 'b' },
				);
				// Default: StringEdit.empty (no changes)

				streamingFetcher.setStreamingLines(['COMPLETELY', 'DIFFERENT', 'LINES']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			it('does not cancel when intermediateUserEdit is undefined', async () => {
				const provider = createProvider();

				const request = createDivergenceRequest(
					['aaa', 'bbb'],
					{ insertionOffset: 4, insertedText: 'b' },
				);
				request.intermediateUserEdit = undefined;

				streamingFetcher.setStreamingLines(['COMPLETELY', 'DIFFERENT']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			it('does not cancel when all user edits across multiple lines are compatible', async () => {
				const provider = createProvider();

				//  Doc: "let a\nlet b\nlet c"
				//       offsets: l=0,e=1,t=2, =3,a=4,\n=5,l=6,e=7,t=8, =9,b=10,\n=11,l=12,e=13,t=14, =15,c=16
				//  Cursor on line 1
				//  User typed "1" at offset 5 (after 'a', before '\n') on line 0 → "let a1"
				//  User typed "2" at offset 17 (after 'c', end of doc) on line 2 → "let c2"
				//  Model: "let a12 = 1;\nlet b\nlet c23 = 3;"
				//  Both edits are compatible continuations
				const request = createDivergenceRequest(
					['let a', 'let b', 'let c'],
					{ insertionOffset: 8, insertedText: 'b' },
				);
				request.intermediateUserEdit = StringEdit.create([
					new StringReplacement(OffsetRange.emptyAt(5), '1'),
					new StringReplacement(OffsetRange.emptyAt(17), '2'),
				]);

				streamingFetcher.setStreamingLines(['let a12 = 1;', 'let b', 'let c23 = 3;']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			// ── Divergence on specific lines ────────────────────────────────

			it('cancels on divergence at the very first line (line 0)', async () => {
				const provider = createProvider();

				//  Doc: "aaa\nbbb\nccc"  cursor on line 1
				//  User changed line 0 divergently
				const request = createDivergenceRequest(
					['aaa', 'bbb', 'ccc'],
					{ insertionOffset: 5, insertedText: 'b' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(2), 'Z')
				);

				// Model keeps "aaa" unchanged — diverges from user's "aaZa"
				streamingFetcher.setStreamingLines(['aaa', 'bbb', 'ccc']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { edits, finalReason } = await collectEdits(gen);

				expect(edits.length).toBe(0);
				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			it('cancels on divergence at the very last line of the edit window', async () => {
				const provider = createProvider();

				//  Doc: "aaa\nbbb\nccc"  cursor on line 0
				//  User changed last line (line 2) divergently
				const request = createDivergenceRequest(
					['aaa', 'bbb', 'ccc'],
					{ insertionOffset: 2, insertedText: 'a' },
				);
				// Insert 'Z' at offset 10 (in "ccc") → "ccZc"
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(10), 'Z')
				);

				// Model keeps "ccc" unchanged — diverges from user's "ccZc"
				streamingFetcher.setStreamingLines(['aaa', 'bbb', 'ccc']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			it('cancels at the first divergent line when multiple lines diverge', async () => {
				const provider = createProvider();

				//  Doc: "aaa\nbbb\nccc"  cursor on line 1
				//  User edited BOTH line 0 and line 2 divergently.
				//  Divergence should be detected at line 0 (first streamed line).
				const request = createDivergenceRequest(
					['aaa', 'bbb', 'ccc'],
					{ insertionOffset: 5, insertedText: 'b' },
				);
				request.intermediateUserEdit = StringEdit.create([
					new StringReplacement(OffsetRange.emptyAt(2), 'X'),   // line 0: "aaXa"
					new StringReplacement(OffsetRange.emptyAt(10), 'Y'),  // line 2: "ccYc"
				]);

				// Model keeps both lines unchanged
				streamingFetcher.setStreamingLines(['aaa', 'bbb', 'ccc']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { edits, finalReason } = await collectEdits(gen);

				// Cancelled at line 0 — no edits should have been yielded
				expect(edits.length).toBe(0);
				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			it('cancels on second line when first line is compatible but second diverges', async () => {
				const provider = createProvider();

				//  Doc: "aaa\nbbb\nccc"  cursor on line 2
				//  User edited line 0 compatibly ("a" → "ab...") and line 1 divergently
				const request = createDivergenceRequest(
					['aaa', 'bbb', 'ccc'],
					{ insertionOffset: 10, insertedText: 'c' },
				);
				request.intermediateUserEdit = StringEdit.create([
					new StringReplacement(OffsetRange.emptyAt(3), 'b'),   // line 0: "aaab" — compatible with "aaabcd"
					new StringReplacement(OffsetRange.emptyAt(6), 'Z'),   // line 1: "bbbZ" — diverges from model's "bbb"
				]);

				// Model: line 0 is a continuation, line 1 unchanged
				streamingFetcher.setStreamingLines(['aaabcd', 'bbb', 'ccc']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			// ── Line-shift scenarios ────────────────────────────────────────

			it('does not false-cancel when user inserted a line above, shifting lines down', async () => {
				const provider = createProvider();

				//  Doc: "import foo\nfunction fi\n}"  cursor on line 1
				//  User inserts newline after "import foo" + types "b" on cursor line
				//  Lines shift down but getCurrentLine maps through the edit correctly
				const request = createDivergenceRequest(
					['import foo', 'function fi', '}'],
					{ insertionOffset: 21, insertedText: 'i' },
				);
				request.intermediateUserEdit = StringEdit.create([
					new StringReplacement(OffsetRange.emptyAt(10), '\n'),
					new StringReplacement(OffsetRange.emptyAt(22), 'b'),
				]);

				streamingFetcher.setStreamingLines(['import foo', 'function fibonacci(n): number', '}']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			it('cancels when user deleted a line above, causing content shift on other lines', async () => {
				const provider = createProvider();

				//  Doc: "aaa\nbbb\nccc\nddd"  cursor on line 3
				//  User deletes line 1 ("bbb\n", offsets 4..8)
				//  After deletion: "aaa\nccc\nddd"
				//  getCurrentLine for original line 1 now resolves to "ccc" (shifted up)
				//  Model streams "bbb" for line 1 → "ccc" ≠ "bbb" → divergence
				const request = createDivergenceRequest(
					['aaa', 'bbb', 'ccc', 'ddd'],
					{ insertionOffset: 14, insertedText: 'd' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(new OffsetRange(4, 8), '')
				);

				// Model produces lines matching the original (not the shifted doc)
				streamingFetcher.setStreamingLines(['aaa', 'bbb', 'ccc', 'ddd']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				// In editWindow mode, the shifted content causes divergence at line 1
				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			// ── Ambiguous mapping → skip (no false cancel) ──────────────────

			it('skips divergence check for a line whose start offset falls inside a replacement', async () => {
				const provider = createProvider();

				//  Doc: "aaa\nbbb\nccc"  cursor on line 2
				//  User replaces offsets 2..6 (spanning "a\nbb") with "ZZ"
				//  Result: "aaZZb\nccc"
				//
				//  For line 1 in the original doc, lineStartOffset = 4 which falls
				//  inside the replacement [2,6) → getCurrentLine returns undefined
				//  → divergence check is skipped for that line.
				//
				//  However, line 0 is also affected: "aaa" → "aaZZb", so model
				//  must be compatible with line 0's change.
				const request = createDivergenceRequest(
					['aaa', 'bbb', 'ccc'],
					{ insertionOffset: 10, insertedText: 'c' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(new OffsetRange(2, 6), 'ZZ')
				);

				// Model's line 0 is a compatible continuation of the user's change
				// (user changed "aaa" → "aaZZb", model has "aaZZb..." starting with that)
				streamingFetcher.setStreamingLines(['aaZZb_more', 'ANYTHING', 'ccc']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				// Line 1 is skipped (ambiguous), line 0 is compatible → no cancel
				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			// ── Model output length edge cases ──────────────────────────────

			it('does not cancel when model output has fewer lines than edit window and divergent line is not reached', async () => {
				const provider = createProvider();

				//  Doc: "line0\nline1\nline2"  cursor on line 1
				//  User edited line 2 divergently, but model only streams 2 lines
				const request = createDivergenceRequest(
					['line0', 'line1', 'line2'],
					{ insertionOffset: 10, insertedText: '1' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(16), 'Z')
				);

				// Model only returns 2 lines — line 2 is never streamed
				streamingFetcher.setStreamingLines(['line0', 'line1']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			// ── Deletion / replacement on non-cursor lines ──────────────────

			it('cancels when user deleted text on a non-cursor line and model kept original', async () => {
				const provider = createProvider();

				//  Doc: "foobar\ncursor"  cursor on line 1
				//  User deleted "bar" from line 0 (offsets 3..6) → "foo"
				//  Model echoes "foobar" unchanged
				const request = createDivergenceRequest(
					['foobar', 'cursor'],
					{ insertionOffset: 7, insertedText: 'c' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(new OffsetRange(3, 6), '')
				);

				streamingFetcher.setStreamingLines(['foobar', 'cursor']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			it('does not cancel when user deleted text on non-cursor line and model matches result', async () => {
				const provider = createProvider();

				//  Doc: "foobar\ncursor"  cursor on line 1
				//  User deleted "bar" from line 0 (offsets 3..6) → "foo"
				//  Model also produces "foo" → identical to current state
				const request = createDivergenceRequest(
					['foobar', 'cursor'],
					{ insertionOffset: 7, insertedText: 'c' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(new OffsetRange(3, 6), '')
				);

				streamingFetcher.setStreamingLines(['foo', 'cursor']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			it('cancels when user replaced text on non-cursor line and model disagrees', async () => {
				const provider = createProvider();

				//  Doc: "hello world\ncursor"  cursor on line 1
				//  User replaced "world" (offsets 6..11) with "earth" → "hello earth"
				//  Model: "hello mars"
				const request = createDivergenceRequest(
					['hello world', 'cursor'],
					{ insertionOffset: 13, insertedText: 'u' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(new OffsetRange(6, 11), 'earth')
				);

				streamingFetcher.setStreamingLines(['hello mars', 'cursor']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { edits, finalReason } = await collectEdits(gen);

				expect(edits.length).toBe(0);
				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			// ── Auto-close pairs on non-cursor lines ────────────────────────

			it('does not cancel when user typed auto-close pair on non-cursor line and model fills it', async () => {
				const provider = createProvider();

				//  Doc: "foo\ncursor"  cursor on line 1
				//  User typed "()" on line 0 (auto-close pair) → "foo()"
				//  Model: "foo(x, y)" — fills the parens
				const request = createDivergenceRequest(
					['foo', 'cursor'],
					{ insertionOffset: 5, insertedText: 'u' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(3), '()')
				);

				streamingFetcher.setStreamingLines(['foo(x, y)', 'cursor']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			it('cancels when user typed auto-close pair on non-cursor line but model has no closing char', async () => {
				const provider = createProvider();

				//  Doc: "foo\ncursor"  cursor on line 1
				//  User typed "()" on line 0 → "foo()"
				//  Model: "foo(x, y" — no closing paren
				const request = createDivergenceRequest(
					['foo', 'cursor'],
					{ insertionOffset: 5, insertedText: 'u' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(3), '()')
				);

				streamingFetcher.setStreamingLines(['foo(x, y', 'cursor']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { edits, finalReason } = await collectEdits(gen);

				expect(edits.length).toBe(0);
				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			// ── Single-line edit window ─────────────────────────────────────

			it('cancels on divergence in a single-line edit window', async () => {
				const provider = createProvider();

				const request = createDivergenceRequest(
					['hello'],
					{ insertionOffset: 4, insertedText: 'o' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(5), 'X')
				);

				streamingFetcher.setStreamingLines(['helloY']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			it('does not cancel compatible edit in a single-line edit window', async () => {
				const provider = createProvider();

				const request = createDivergenceRequest(
					['hello'],
					{ insertionOffset: 4, insertedText: 'o' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(5), ' w')
				);

				streamingFetcher.setStreamingLines(['hello world!']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			// ── Model produces empty line vs user typed ─────────────────────

			it('cancels when model produces empty line for a non-cursor line that user edited', async () => {
				const provider = createProvider();

				//  Doc: "foo\ncursor"  cursor on line 1
				//  User typed 'b' on line 0 → "foob"
				//  Model: "" (empty) for line 0
				const request = createDivergenceRequest(
					['foo', 'cursor'],
					{ insertionOffset: 5, insertedText: 'u' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(3), 'b')
				);

				streamingFetcher.setStreamingLines(['', 'cursor']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { edits, finalReason } = await collectEdits(gen);

				expect(edits.length).toBe(0);
				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			// ── Net-zero user edit → no cancellation ────────────────────────

			it('does not cancel when user edit is net-zero (typed then backspaced)', async () => {
				const provider = createProvider();

				const request = createDivergenceRequest(
					['aaa', 'bbb'],
					{ insertionOffset: 5, insertedText: 'b' },
				);
				request.intermediateUserEdit = StringEdit.empty;

				streamingFetcher.setStreamingLines(['COMPLETELY', 'DIFFERENT']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			// ── Whitespace edits ────────────────────────────────────────────

			it('does not cancel when user added indentation and model continues with same indent', async () => {
				const provider = createProvider();

				//  Doc: "return 1;\ncursor"  cursor on line 1
				//  User typed "  " (indent) at start of line 0 → "  return 1;"
				//  Model: "  return 42;" — same indent, different value
				const request = createDivergenceRequest(
					['return 1;', 'cursor'],
					{ insertionOffset: 11, insertedText: 'u' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(0), '  ')
				);

				streamingFetcher.setStreamingLines(['  return 42;', 'cursor']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			// ── Request token not cancelled (only internal fetch token) ──────

			it('does not cancel the request token, only the internal fetch token', async () => {
				const provider = createProvider();

				const request = createDivergenceRequest(
					['aaa', 'bbb'],
					{ insertionOffset: 5, insertedText: 'b' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(2), 'Z')
				);

				streamingFetcher.setStreamingLines(['aaa', 'bbb']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				expect(request.cancellationTokenSource.token.isCancellationRequested).toBe(false);
				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				expect((finalReason.v as NoNextEditReason.GotCancelled).message).toBe('editWindowLineDiverged');
			});

			// ── Mode contrast: cursor mode ignores non-cursor lines ─────────

			it('does not cancel non-cursor line divergence in cursor mode', async () => {
				// Switch to cursor mode — only cursor line should be checked
				await configService.setConfig(ConfigKey.TeamInternal.InlineEditsXtabEarlyCursorLineDivergenceCancellation, EarlyDivergenceCancellationMode.Cursor);

				const provider = createProvider();

				//  Doc: "const a = 1;\nfunction fi\n}"
				//  Cursor on line 1
				//  User typed "Z" on line 0 — does NOT match model's line 0
				//  But in cursor mode, only cursor line is checked → no cancel
				const request = createDivergenceRequest(
					['const a = 1;', 'function fi', '}'],
					{ insertionOffset: 23, insertedText: 'i' },
				);

				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(11), 'Z')
				);

				streamingFetcher.setStreamingLines(['const a = 1;', 'function fibonacci(n): number', '}']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				// Cursor mode: only cursor line is checked, and cursor line wasn't changed
				if (finalReason.v instanceof NoNextEditReason.GotCancelled) {
					expect(finalReason.v.message).not.toBe('cursorLineDiverged');
					expect(finalReason.v.message).not.toBe('editWindowLineDiverged');
				}
			});

			// ── Cancellation reason string ──────────────────────────────────

			it('uses editWindowLineDiverged reason, not cursorLineDiverged', async () => {
				const provider = createProvider();

				// Same simple divergence scenario but verify the reason string specifically
				const request = createDivergenceRequest(
					['abc'],
					{ insertionOffset: 2, insertedText: 'c' },
				);
				request.intermediateUserEdit = StringEdit.single(
					new StringReplacement(OffsetRange.emptyAt(3), 'X')
				);

				streamingFetcher.setStreamingLines(['abcY']);

				const gen = provider.provideNextEdit(request, createMockLogger(), createLogContext(), CancellationToken.None);
				const { finalReason } = await collectEdits(gen);

				expect(finalReason.v).toBeInstanceOf(NoNextEditReason.GotCancelled);
				const msg = (finalReason.v as NoNextEditReason.GotCancelled).message;
				expect(msg).toBe('editWindowLineDiverged');
				expect(msg).not.toBe('cursorLineDiverged');
			});
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
