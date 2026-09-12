/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module
import { z } from 'zod';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { transaction } from '../../../../../base/common/observable.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { IDiffEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { DocumentSymbol, SymbolKind } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IOutlineModelService } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { createMultiDiffEditorFixtureDocument, createMultiDiffEditorFixtureDocuments, createMultiDiffEditorFixtureServices, createMultiDiffEditorFixtureWidget } from './multiDiffEditorFixtureUtils.js';
// eslint-disable-next-line local/code-import-patterns
import chatInputChanges from './multiDiffEditorChatChanges.json' with { type: 'json' };

import '../../../../../editor/contrib/diffEditorBreadcrumbs/browser/contribution.js';

const breadcrumbRangeSchema = z.object({
	startLineNumber: z.number().int().positive(),
	endLineNumber: z.number().int().positive(),
});

const chatInputChangeData = z.object({
	files: z.array(z.object({
		order: z.number(),
		path: z.string(),
		languageId: z.string(),
		breadcrumbs: z.array(z.object({
			name: z.string(),
			kind: z.enum(['class', 'constructor', 'function', 'method']),
			beforeRange: breadcrumbRangeSchema,
			afterRange: breadcrumbRangeSchema,
		})),
		before: z.string(),
		after: z.string(),
	})),
}).parse(typeof chatInputChanges === 'string' ? JSON.parse(chatInputChanges) : chatInputChanges);

interface IMultiDiffVisualFixtureOptions {
	readonly width?: number;
	readonly height?: number;
	readonly renderSideBySide?: boolean;
	readonly diffEditorOptions?: IDiffEditorOptions;
	readonly collapsed?: readonly number[];
	readonly scrollTop?: number;
	readonly scrollLeft?: number;
	readonly paddingBottom?: number;
	readonly waitForDocumentSymbols?: boolean;
	readonly createDocuments: (
		instantiationService: ReturnType<typeof createMultiDiffEditorFixtureServices>,
		textModels: DisposableStore
	) => readonly RefCounted<IDocumentDiffItem>[];
}

async function renderMultiDiffVisualFixture(context: ComponentFixtureContext, options: IMultiDiffVisualFixtureOptions): Promise<void> {
	const { container, disposableStore, disposableStackStore, theme } = context;
	const width = options.width ?? 800;
	const height = options.height ?? 600;
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;

	const instantiationService = createMultiDiffEditorFixtureServices(disposableStore, theme, new TestDiffProviderFactoryService());
	const textModels = disposableStackStore.add(new DisposableStore());
	const documents = options.createDocuments(instantiationService, textModels);
	const widget = disposableStackStore.add(createMultiDiffEditorFixtureWidget(
		instantiationService,
		container,
		options.diffEditorOptions,
	));
	widget.setRenderSideBySide(options.renderSideBySide ?? true);
	if (options.paddingBottom !== undefined) {
		widget.setPaddingBottom(options.paddingBottom);
	}

	const model: IMultiDiffEditorModel = { documents: ValueWithChangeEvent.const(documents) };
	const viewModel = disposableStackStore.add(widget.createViewModel(model));
	widget.setViewModel(viewModel, { preserveFocus: true });
	disposableStackStore.add(toDisposable(() => widget.setViewModel(undefined)));
	widget.layout(new Dimension(width, height));
	const documentSymbolsReady = options.waitForDocumentSymbols
		? Promise.all(documents.map(document => document.object.modified?.textModel)
			.filter((model): model is ITextModel => model !== undefined)
			.map(model => instantiationService.get(IOutlineModelService).getOrCreate(model, CancellationToken.None)))
		: Promise.resolve([]);
	await Promise.all([viewModel.waitForDiffOr1s(), documentSymbolsReady]);
	transaction(tx => {
		for (const index of options.collapsed ?? []) {
			viewModel.items.get()[index].collapsed.set(true, tx);
		}
	});
	if (options.scrollTop !== undefined || options.scrollLeft !== undefined) {
		widget.setViewState({
			scrollState: { top: options.scrollTop ?? 0, left: options.scrollLeft ?? 0 },
		});
	}
}

function createStandardDocuments(
	instantiationService: ReturnType<typeof createMultiDiffEditorFixtureServices>,
	textModels: DisposableStore
): readonly RefCounted<IDocumentDiffItem>[] {
	const { doc1, doc2, doc3 } = createMultiDiffEditorFixtureDocuments(instantiationService, textModels);
	return [doc1, doc2, doc3];
}

function createChatInputChangeDocuments(
	instantiationService: ReturnType<typeof createMultiDiffEditorFixtureServices>,
	textModels: DisposableStore
): readonly RefCounted<IDocumentDiffItem>[] {
	const filesByPath = new Map(chatInputChangeData.files.map(file => [file.path, file]));
	const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
	textModels.add(languageFeaturesService.documentSymbolProvider.register(
		{ scheme: 'inmemory' },
		{
			provideDocumentSymbols: model => {
				const file = filesByPath.get(model.uri.path.slice(1));
				return file ? createBreadcrumbSymbols(model, file.breadcrumbs) : [];
			}
		}
	));
	return chatInputChangeData.files.toSorted((a, b) => a.order - b.order).map(file => createMultiDiffEditorFixtureDocument(instantiationService, textModels, {
		original: {
			uri: `inmemory://original/${file.path}`,
			text: file.before,
		},
		modified: {
			uri: `inmemory://modified/${file.path}`,
			text: file.after,
		},
		languageId: file.languageId,
	}));
}

function createBreadcrumbSymbols(
	model: ITextModel,
	breadcrumbs: typeof chatInputChangeData.files[number]['breadcrumbs']
): DocumentSymbol[] {
	const kindMap = {
		class: SymbolKind.Class,
		constructor: SymbolKind.Constructor,
		function: SymbolKind.Function,
		method: SymbolKind.Method,
	} as const;
	let children: DocumentSymbol[] = [];
	for (let index = breadcrumbs.length - 1; index >= 0; index--) {
		const breadcrumb = breadcrumbs[index];
		const { startLineNumber, endLineNumber } = model.uri.authority === 'original' ? breadcrumb.beforeRange : breadcrumb.afterRange;
		children = [{
			name: breadcrumb.name,
			detail: '',
			kind: kindMap[breadcrumb.kind],
			tags: [],
			range: { startLineNumber, startColumn: 1, endLineNumber, endColumn: model.getLineMaxColumn(endLineNumber) },
			selectionRange: { startLineNumber, startColumn: 1, endLineNumber: startLineNumber, endColumn: model.getLineMaxColumn(startLineNumber) },
			children,
		}];
	}
	return children;
}

function createLongPathDocuments(
	instantiationService: ReturnType<typeof createMultiDiffEditorFixtureServices>,
	textModels: DisposableStore
): readonly RefCounted<IDocumentDiffItem>[] {
	return [
		createMultiDiffEditorFixtureDocument(instantiationService, textModels, {
			original: {
				uri: 'inmemory://original/packages/application/src/features/preferences/veryLongOriginalConfigurationFileName.ts',
				text: 'export const featureConfiguration = { enabled: false, description: "A deliberately long value for horizontal overflow" };',
			},
			modified: {
				uri: 'inmemory://modified/packages/application/src/features/preferences/veryLongRenamedConfigurationFileName.ts',
				text: 'export const featureConfiguration = { enabled: true, description: "A deliberately longer value for horizontal overflow and rename coverage" };',
			},
		}),
		createMultiDiffEditorFixtureDocument(instantiationService, textModels, {
			original: {
				uri: 'inmemory://original/packages/application/src/features/preferences/secondaryLongFileName.ts',
				text: 'export const timeout = 30;',
			},
			modified: {
				uri: 'inmemory://modified/packages/application/src/features/preferences/secondaryLongFileName.ts',
				text: 'export const timeout = 60;',
			},
		}),
	];
}

function createTallDocuments(
	instantiationService: ReturnType<typeof createMultiDiffEditorFixtureServices>,
	textModels: DisposableStore
): readonly RefCounted<IDocumentDiffItem>[] {
	return Array.from({ length: 4 }, (_, documentIndex) => {
		const original = Array.from({ length: 24 }, (_, lineIndex) => `export const value${documentIndex}_${lineIndex} = { value: ${lineIndex}, description: 'A long configuration value that overflows the editor viewport' };`).join('\n');
		const modified = Array.from({ length: 24 }, (_, lineIndex) => `export const value${documentIndex}_${lineIndex} = { value: ${lineIndex + documentIndex + 1}, description: 'A long configuration value that overflows the editor viewport' };`).join('\n');
		return createMultiDiffEditorFixtureDocument(instantiationService, textModels, {
			original: { uri: `inmemory://original/sticky/file${documentIndex}.ts`, text: original },
			modified: { uri: `inmemory://modified/sticky/file${documentIndex}.ts`, text: modified },
		});
	});
}

function createFileStateDocuments(
	instantiationService: ReturnType<typeof createMultiDiffEditorFixtureServices>,
	textModels: DisposableStore
): readonly RefCounted<IDocumentDiffItem>[] {
	return [
		createMultiDiffEditorFixtureDocument(instantiationService, textModels, {
			modified: { uri: 'inmemory://modified/newFeature.ts', text: 'export const newFeature = true;' },
		}),
		createMultiDiffEditorFixtureDocument(instantiationService, textModels, {
			original: { uri: 'inmemory://original/obsoleteFeature.ts', text: 'export const obsoleteFeature = true;' },
		}),
		createMultiDiffEditorFixtureDocument(instantiationService, textModels, {
			original: { uri: 'inmemory://original/assets/logo.png' },
			modified: { uri: 'inmemory://modified/assets/logo.png' },
		}),
	];
}

function createUnchangedRegionDocuments(
	instantiationService: ReturnType<typeof createMultiDiffEditorFixtureServices>,
	textModels: DisposableStore
): readonly RefCounted<IDocumentDiffItem>[] {
	const unchanged = Array.from({ length: 20 }, (_, i) => `const value${i} = ${i};`).join('\n');
	return [
		createMultiDiffEditorFixtureDocument(instantiationService, textModels, {
			original: {
				uri: 'inmemory://original/settings.ts',
				text: `${unchanged}\nconst changed = 'before';\n${unchanged}`,
			},
			modified: {
				uri: 'inmemory://modified/settings.ts',
				text: `${unchanged}\nconst changed = 'after';\nconst added = true;\n${unchanged}`,
			},
		}),
	];
}

function createLongUnchangedRegionDocuments(
	instantiationService: ReturnType<typeof createMultiDiffEditorFixtureServices>,
	textModels: DisposableStore
): readonly RefCounted<IDocumentDiffItem>[] {
	const original = createWorkspaceSyncCoordinatorSource({
		defaultMaxAttempts: 3,
		concurrency: 4,
		retryDelay: 1000,
		logMessage: 'Prepared workspace synchronization',
	});
	const modified = createWorkspaceSyncCoordinatorSource({
		defaultMaxAttempts: 5,
		concurrency: 8,
		retryDelay: 1500,
		logMessage: 'Prepared incremental workspace synchronization',
	});
	const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
	textModels.add(languageFeaturesService.documentSymbolProvider.register(
		{ language: 'typescript', scheme: 'inmemory' },
		{ provideDocumentSymbols: model => createWorkspaceSyncCoordinatorSymbols(model) }
	));
	return [
		createMultiDiffEditorFixtureDocument(instantiationService, textModels, {
			original: {
				uri: 'inmemory://original/workspaceSyncCoordinator.ts',
				text: original,
			},
			modified: {
				uri: 'inmemory://modified/workspaceSyncCoordinator.ts',
				text: modified,
			},
		}),
	];
}

function createWorkspaceSyncCoordinatorSource(options: {
	readonly defaultMaxAttempts: number;
	readonly concurrency: number;
	readonly retryDelay: number;
	readonly logMessage: string;
}): string {
	const mappingRules = Array.from({ length: 24 }, (_, index) =>
		`\t\t{ source: 'legacy.setting.${index + 1}', target: 'workspace.setting.${index + 1}' },`
	);
	const validationRules = Array.from({ length: 18 }, (_, index) =>
		`\t\tif (snapshot.revision < ${index + 1}) { diagnostics.push('Snapshot predates revision ${index + 1}'); }`
	);
	const retryReasons = Array.from({ length: 16 }, (_, index) =>
		`\t\tcase 'transport-${index + 1}': return ${index + 1} <= attempt;`
	);
	return [
		'import { CancellationToken } from \'./cancellation\';',
		'import { ILogger } from \'./logging\';',
		'import { WorkspaceSnapshot, WorkspaceSyncResult } from \'./workspaceTypes\';',
		'',
		`const DEFAULT_MAX_ATTEMPTS = ${options.defaultMaxAttempts};`,
		'',
		'interface WorkspaceSyncOptions {',
		'\treadonly dryRun: boolean;',
		'\treadonly includeExtensions: boolean;',
		'\treadonly maxAttempts: number;',
		'}',
		'',
		'export class WorkspaceSyncCoordinator {',
		'\tprivate readonly _batchSize = 25;',
		'',
		'\tconstructor(private readonly _logger: ILogger) { }',
		'',
		'\tasync synchronize(snapshot: WorkspaceSnapshot, options: WorkspaceSyncOptions, token: CancellationToken): Promise<WorkspaceSyncResult> {',
		'\t\tconst effectiveMaxAttempts = Math.min(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);',
		'\t\tif (effectiveMaxAttempts < 1) { throw new Error(\'At least one synchronization attempt is required\'); }',
		'\t\tif (!snapshot.workspaceId) { throw new Error(\'Cannot synchronize a snapshot without a workspace ID\'); }',
		'\t\tif (token.isCancellationRequested) { return { applied: 0, skipped: 0, diagnostics: [] }; }',
		'\t\tconst startedAt = Date.now();',
		'\t\tconst sourceRevision = snapshot.revision;',
		'\t\tconst sourceSettingCount = snapshot.settings.size;',
		'\t\tthis._logger.trace(`Synchronizing revision ${sourceRevision}`);',
		'\t\tthis._logger.trace(`Inspecting ${sourceSettingCount} workspace settings`);',
		'\t\tthis._logger.trace(`Using up to ${effectiveMaxAttempts} attempts`);',
		'\t\tthis._logger.trace(`Extensions included: ${options.includeExtensions}`);',
		'\t\tthis._logger.trace(`Synchronization started at ${startedAt}`);',
		`\t\tthis._logger.info('${options.logMessage}');`,
		'\t\tconst diagnostics = this._validateSnapshot(snapshot);',
		'\t\tconst mappedSettings = this._mapSettings(snapshot);',
		'\t\tconst applied = await this._applyInBatches(mappedSettings, options, token);',
		'\t\treturn { applied, skipped: mappedSettings.length - applied, diagnostics };',
		'\t}',
		'',
		'\tprivate _mapSettings(snapshot: WorkspaceSnapshot): Map<string, string> {',
		'\t\tconst rules = [',
		...mappingRules,
		'\t\t] as const;',
		'\t\tconst mapped = new Map<string, string>();',
		'\t\tfor (const rule of rules) {',
		'\t\t\tconst value = snapshot.settings.get(rule.source);',
		'\t\t\tif (value !== undefined) { mapped.set(rule.target, value); }',
		'\t\t}',
		'\t\treturn mapped;',
		'\t}',
		'',
		'\tprivate _validateSnapshot(snapshot: WorkspaceSnapshot): string[] {',
		'\t\tconst diagnostics: string[] = [];',
		...validationRules,
		'\t\treturn diagnostics;',
		'\t}',
		'',
		'\tprivate async _applyInBatches(settings: Map<string, string>, options: WorkspaceSyncOptions, token: CancellationToken): Promise<number> {',
		`\t\tconst concurrency = ${options.concurrency};`,
		'\t\tlet applied = 0;',
		'\t\tconst entries = [...settings.entries()];',
		'\t\tfor (let offset = 0; offset < entries.length; offset += this._batchSize) {',
		'\t\t\tif (token.isCancellationRequested) { break; }',
		'\t\t\tconst batch = entries.slice(offset, offset + this._batchSize);',
		'\t\t\tfor (let index = 0; index < batch.length; index += concurrency) {',
		'\t\t\t\tconst window = batch.slice(index, index + concurrency);',
		'\t\t\t\tif (!options.dryRun) { await Promise.all(window.map(entry => this._applySetting(entry))); }',
		'\t\t\t\tapplied += window.length;',
		'\t\t\t}',
		'\t\t}',
		'\t\treturn applied;',
		'\t}',
		'',
		'\tprivate _shouldRetry(reason: string, attempt: number): boolean {',
		'\t\tswitch (reason) {',
		...retryReasons,
		'\t\tdefault: return false;',
		'\t\t}',
		'\t}',
		'',
		'\tprivate async _applySetting([key, value]: [string, string]): Promise<void> {',
		`\t\tawait this._writeSetting(key, value, ${options.retryDelay});`,
		'\t}',
		'',
		'\tprivate async _writeSetting(key: string, value: string, retryDelay: number): Promise<void> {',
		'\t\tthis._logger.trace(`Writing ${key}=${value}; retry delay ${retryDelay}ms`);',
		'\t}',
		'}',
		'',
		'export function createWorkspaceSyncCoordinator(logger: ILogger): WorkspaceSyncCoordinator {',
		'\treturn new WorkspaceSyncCoordinator(logger);',
		'}',
	].join('\n');
}

function createWorkspaceSyncCoordinatorSymbols(model: ITextModel): DocumentSymbol[] {
	const lineCount = model.getLineCount();
	const symbol = (name: string, kind: SymbolKind, startText: string, endLineNumber: number, children: DocumentSymbol[] = []): DocumentSymbol => {
		const startLineNumber = model.findMatches(startText, false, false, false, null, false)[0].range.startLineNumber;
		return {
			name,
			detail: '',
			kind,
			tags: [],
			range: { startLineNumber, startColumn: 1, endLineNumber, endColumn: model.getLineMaxColumn(endLineNumber) },
			selectionRange: { startLineNumber, startColumn: 1, endLineNumber: startLineNumber, endColumn: model.getLineMaxColumn(startLineNumber) },
			children,
		};
	};
	const factoryStart = model.findMatches('export function createWorkspaceSyncCoordinator', false, false, false, null, false)[0].range.startLineNumber;
	const classEnd = factoryStart - 2;
	const methodStarts = [
		['synchronize', SymbolKind.Method, '\tasync synchronize('],
		['_mapSettings', SymbolKind.Method, '\tprivate _mapSettings('],
		['_validateSnapshot', SymbolKind.Method, '\tprivate _validateSnapshot('],
		['_applyInBatches', SymbolKind.Method, '\tprivate async _applyInBatches('],
		['_shouldRetry', SymbolKind.Method, '\tprivate _shouldRetry('],
		['_applySetting', SymbolKind.Method, '\tprivate async _applySetting('],
		['_writeSetting', SymbolKind.Method, '\tprivate async _writeSetting('],
	] as const;
	const methods = methodStarts.map(([name, kind, startText], index) => {
		const nextStartText = methodStarts[index + 1]?.[2];
		const endLineNumber = nextStartText
			? model.findMatches(nextStartText, false, false, false, null, false)[0].range.startLineNumber - 2
			: classEnd;
		return symbol(name, kind, startText, endLineNumber);
	});
	return [
		symbol('WorkspaceSyncCoordinator', SymbolKind.Class, 'export class WorkspaceSyncCoordinator', classEnd, methods),
		symbol('createWorkspaceSyncCoordinator', SymbolKind.Function, 'export function createWorkspaceSyncCoordinator', lineCount),
	];
}

function createNoCardsFixtures() {
	const fixtureOptions = {
		themes: ['dark'],
	} as const;
	const treatment = 'Headers and editors flush to both viewport edges.';
	return defineThemedFixtureGroup({
		ChatInputChanges: defineComponentFixture({
			...fixtureOptions,
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: [treatment, 'Five realistic VS Code source changes match the Git changes editor order and breadcrumb treatment.'],
			render: context => renderMultiDiffVisualFixture(context, {
				height: 720,
				renderSideBySide: false,
				diffEditorOptions: {
					hideUnchangedRegions: { enabled: true },
				},
				waitForDocumentSymbols: true,
				createDocuments: createChatInputChangeDocuments,
			}),
		}),
		MultiFile: defineComponentFixture({
			...fixtureOptions,
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: [treatment, 'Three side-by-side file diffs; the middle entry is collapsed and the first and last are expanded.'],
			render: context => renderMultiDiffVisualFixture(context, {
				collapsed: [1],
				createDocuments: createStandardDocuments,
			}),
		}),
		NarrowInlineRename: defineComponentFixture({
			...fixtureOptions,
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: [treatment, 'Narrow inline diffs with long renamed file labels truncated within the headers.'],
			render: context => renderMultiDiffVisualFixture(context, {
				width: 420,
				height: 500,
				renderSideBySide: false,
				createDocuments: createLongPathDocuments,
			}),
		}),
		StickyHorizontalOverflow: defineComponentFixture({
			...fixtureOptions,
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: [treatment, 'A sticky file header above vertically and horizontally scrolled code; the beginnings of the long unwrapped lines are out of view.'],
			render: context => renderMultiDiffVisualFixture(context, {
				width: 680,
				height: 480,
				diffEditorOptions: { diffWordWrap: 'off' },
				scrollTop: 420,
				scrollLeft: 180,
				createDocuments: createTallDocuments,
			}),
		}),
		AddedDeletedBinary: defineComponentFixture({
			...fixtureOptions,
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: [treatment, 'Added and deleted file diffs followed by a binary file placeholder.'],
			render: context => renderMultiDiffVisualFixture(context, {
				height: 520,
				createDocuments: createFileStateDocuments,
			}),
		}),
		NarrowInlineHiddenRegions: defineComponentFixture({
			...fixtureOptions,
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: [treatment, 'Narrow inline diffs with expandable unchanged regions.'],
			render: context => renderMultiDiffVisualFixture(context, {
				width: 420,
				height: 500,
				renderSideBySide: false,
				diffEditorOptions: {
					hideUnchangedRegions: { enabled: true },
				},
				paddingBottom: 24,
				createDocuments: createUnchangedRegionDocuments,
			}),
		}),
		LongHiddenRegionsWithBreadcrumbs: defineComponentFixture({
			...fixtureOptions,
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: [treatment, 'A long realistic TypeScript diff with multiple separated edits and hidden unchanged regions labeled with the WorkspaceSyncCoordinator > synchronize symbol path, plus _validateSnapshot and _shouldRetry breadcrumbs.'],
			render: context => renderMultiDiffVisualFixture(context, {
				width: 620,
				height: 720,
				renderSideBySide: false,
				diffEditorOptions: {
					hideUnchangedRegions: { enabled: true },
				},
				paddingBottom: 24,
				waitForDocumentSymbols: true,
				createDocuments: createLongUnchangedRegionDocuments,
			}),
		}),
	});
}

export default defineThemedFixtureGroup({ path: 'editor/multiDiffEditor' }, {
	variants: defineThemedFixtureGroup({
		noCards: createNoCardsFixtures(),
	}),
});
