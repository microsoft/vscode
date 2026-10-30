/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, errorHandler, isCancellationError, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Range } from '../../../../common/core/range.js';
import { IDocumentDiff, IDocumentDiffProviderOptions } from '../../../../common/diff/documentDiffProvider.js';
import { linesDiffComputers } from '../../../../common/diff/linesDiffComputers.js';
import { StructuralDiff, StructuralDiffClassification, StructuralDiffContext, StructuralDiffNode, StructuralDiffResult, StructuralDiffTag, SymbolKind } from '../../../../common/languages.js';
import { ITextModel } from '../../../../common/model.js';
import { IEditorWorkerService } from '../../../../common/services/editorWorker.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../common/services/textResourceConfiguration.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { StructuralDiffs } from '../../common/structuralDiff.js';
import '../../common/structuralDiff.contribution.js';

suite('Structural diff', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let original: ITextModel;
	let modified: ITextModel;
	let languageFeatures: LanguageFeaturesService;
	let worker: IEditorWorkerService;
	let configuration: ITextResourceConfigurationService;
	let maxComputationTimeSetting: unknown;
	let textDiffTimeBudgets: number[];
	let computations: number;

	setup(() => {
		original = store.add(createTextModel('const value = 1;\n', undefined, undefined, URI.parse('original:/file.ts')));
		modified = store.add(createTextModel('const value = 2;\n', undefined, undefined, URI.parse('modified:/file.ts')));
		languageFeatures = new LanguageFeaturesService();
		computations = 0;
		maxComputationTimeSetting = undefined;
		textDiffTimeBudgets = [];
		configuration = new class extends mock<ITextResourceConfigurationService>() {
			override getValue<T>(resource: URI | undefined): T {
				assert.strictEqual(resource, modified.uri);
				return maxComputationTimeSetting as T;
			}
		};
		worker = new class extends mock<IEditorWorkerService>() {
			override async computeDiff(originalUri: URI, modifiedUri: URI, options: IDocumentDiffProviderOptions): Promise<IDocumentDiff> {
				computations++;
				const { maxComputationTimeMs, ...otherOptions } = options;
				textDiffTimeBudgets.push(maxComputationTimeMs);
				assert.deepStrictEqual([originalUri, modifiedUri, otherOptions], [original.uri, modified.uri, {
					ignoreTrimWhitespace: false,
					computeMoves: false,
				}]);
				const result = linesDiffComputers.getDefault().computeDiff(original.getLinesContent(), modified.getLinesContent(), options);
				return {
					identical: original.getValue() === modified.getValue(),
					quitEarly: result.hitTimeout,
					changes: result.changes,
					moves: result.moves,
				};
			}
		};
	});

	function createResult(context: StructuralDiffContext): StructuralDiff {
		return {
			root: {
				id: 'file',
				original: { name: 'file.ts', kind: SymbolKind.File, range: original.getFullModelRange() },
				modified: { name: 'file.ts', kind: SymbolKind.File, range: modified.getFullModelRange() },
				originalChanges: context.changes.flatMap((change, textChangeIndex) => Range.isEmpty(change.originalRange) ? [] : [{
					textChangeIndex, range: change.originalRange, classification: StructuralDiffClassification.Other,
				}]),
				modifiedChanges: context.changes.flatMap((change, textChangeIndex) => Range.isEmpty(change.modifiedRange) ? [] : [{
					textChangeIndex, range: change.modifiedRange, classification: StructuralDiffClassification.Other,
				}]),
				children: [],
			},
			isIncomplete: false,
		};
	}

	function compute(token: CancellationToken = CancellationToken.None): Promise<StructuralDiffResult | undefined> {
		return StructuralDiffs.compute(worker, configuration, languageFeatures.structuralDiffProvider, original, modified, token);
	}

	test('computes paired character changes and selects using the modified model', async () => {
		const calls: string[] = [];
		let context: StructuralDiffContext | undefined;
		store.add(languageFeatures.structuralDiffProvider.register({ scheme: 'modified' }, {
			provideStructuralDiff: (originalModel, modifiedModel, value) => {
				assert.deepStrictEqual([originalModel, modifiedModel], [original, modified]);
				calls.push('modified');
				context = value;
				return createResult(value);
			},
		}));
		store.add(languageFeatures.structuralDiffProvider.register({ scheme: 'original' }, {
			provideStructuralDiff: () => { throw new Error('Must not select using the original model'); },
		}));
		store.add(languageFeatures.structuralDiffProvider.register('*', {
			provideStructuralDiff: () => {
				calls.push('wildcard');
				return undefined;
			},
		}));

		const result = await compute();
		const expectedContext = {
			changes: [{
				originalRange: new Range(1, 15, 1, 16),
				modifiedRange: new Range(1, 15, 1, 16),
			}]
		};
		assert.deepStrictEqual({ calls, context, result }, {
			calls: ['modified'],
			context: expectedContext,
			result: { ...createResult(expectedContext), context: expectedContext },
		});
	});

	for (const declined of [undefined, null]) {
		test(`tries the next provider after ${declined}`, async () => {
			const calls: string[] = [];
			store.add(languageFeatures.structuralDiffProvider.register('*', {
				provideStructuralDiff: (_original, _modified, context) => {
					calls.push('fallback');
					return createResult(context);
				},
			}));
			store.add(languageFeatures.structuralDiffProvider.register({ scheme: 'modified' }, {
				provideStructuralDiff: () => {
					calls.push('declined');
					return declined;
				},
			}));

			const result = await compute();
			assert.deepStrictEqual({ calls, hasResult: !!result }, { calls: ['declined', 'fallback'], hasResult: true });
		});
	}

	test('reports provider errors and tries the next provider', async () => {
		const failure = new Error('Provider failed');
		const errors: Error[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => errors.push(error));
		try {
			store.add(languageFeatures.structuralDiffProvider.register('*', {
				provideStructuralDiff: (_original, _modified, context) => createResult(context),
			}));
			store.add(languageFeatures.structuralDiffProvider.register({ scheme: 'modified' }, {
				provideStructuralDiff: () => { throw failure; },
			}));
			const result = await compute();
			assert.deepStrictEqual({ errors, hasResult: !!result }, { errors: [failure], hasResult: true });
		} finally {
			setUnexpectedErrorHandler(previousHandler);
		}
	});

	test('reports a result that violates the provider contract and tries the next provider', async () => {
		const errors: string[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => errors.push(error.message));
		try {
			store.add(languageFeatures.structuralDiffProvider.register('*', {
				provideStructuralDiff: (_original, _modified, context) => createResult(context),
			}));
			store.add(languageFeatures.structuralDiffProvider.register({ scheme: 'modified' }, {
				provideStructuralDiff: (_original, _modified, context) => {
					const result = createResult(context);
					return { ...result, root: { ...result.root, children: [result.root] } };
				},
			}));
			const result = await compute();
			assert.deepStrictEqual({ errors, hasResult: !!result }, {
				errors: [`Invalid structural diff: node 'file' must have an identifier that is unique within the result`],
				hasResult: true,
			});
		} finally {
			setUnexpectedErrorHandler(previousHandler);
		}
	});

	test('accepts valid results and describes the first violation of the provider contract', async () => {
		const entity = (name: string, kind: SymbolKind, range: Range, selectionRange?: Range) => ({ name, kind, range, selectionRange });
		const coverage = { textChangeIndex: 0, range: new Range(1, 15, 1, 16), classification: StructuralDiffClassification.Implementation, tags: [StructuralDiffTag.Test] };
		const inner: StructuralDiffNode = {
			id: 'inner',
			original: entity('value', SymbolKind.Variable, new Range(1, 7, 1, 16), new Range(1, 7, 1, 12)),
			modified: entity('value', SymbolKind.Variable, new Range(1, 7, 1, 16), new Range(1, 7, 1, 12)),
			originalChanges: [coverage], modifiedChanges: [coverage], children: [],
		};
		const outer: StructuralDiffNode = {
			id: 'outer',
			original: entity('statement', SymbolKind.Variable, new Range(1, 1, 1, 17)),
			modified: entity('statement', SymbolKind.Variable, new Range(1, 1, 1, 17)),
			originalChanges: [], modifiedChanges: [], children: [inner],
		};
		const valid: StructuralDiff = {
			root: {
				id: 'file',
				original: entity('file.ts', SymbolKind.File, original.getFullModelRange()),
				modified: entity('file.ts', SymbolKind.File, modified.getFullModelRange()),
				originalChanges: [], modifiedChanges: [], children: [outer],
			},
			isIncomplete: false,
		};
		const withRoot = (change: Partial<StructuralDiffNode>): StructuralDiff => ({ ...valid, root: { ...valid.root, ...change } });
		const withOuter = (change: Partial<StructuralDiffNode>): StructuralDiff => withRoot({ children: [{ ...outer, ...change }] });
		const withInner = (change: Partial<StructuralDiffNode>): StructuralDiff => withOuter({ children: [{ ...inner, ...change }] });
		const problem = (id: string, text: string) => `Invalid structural diff: node '${id}' ${text}`;
		const cases: [string, StructuralDiff, string][] = [
			['valid', valid, 'valid'],
			['incomplete results may omit coverage', { ...withInner({ originalChanges: [], modifiedChanges: [] }), isIncomplete: true }, 'valid'],
			['duplicate id', withInner({ id: 'outer' }), problem('outer', 'must have an identifier that is unique within the result')],
			['no entity', withInner({ original: undefined, modified: undefined, originalChanges: [], modifiedChanges: [] }), problem('inner', 'must have an original or a modified entity')],
			['changes without entity', withInner({ original: undefined }), problem('inner', 'has original changes but no original entity')],
			['unknown kind', withInner({ modified: { ...inner.modified!, kind: 99 as SymbolKind } }), problem('inner', 'has an invalid modified entity name or kind')],
			['range outside the document', withInner({ original: { ...inner.original!, range: new Range(1, 7, 9, 1) } }), problem('inner', 'has a range outside the original document')],
			['selection outside the entity', withInner({ modified: { ...inner.modified!, selectionRange: new Range(2, 1, 2, 1) } }), problem('inner', 'has a selection range in the modified document that is invalid or not contained in the entity range')],
			['entity outside its parent', withInner({ modified: { ...inner.modified!, range: new Range(2, 1, 2, 1), selectionRange: undefined } }), problem('inner', 'has an entity in the modified document that is not contained in its parent')],
			['parent missing on a side', withOuter({ original: undefined }), problem('inner', 'has an entity in the original document that is not contained in its parent')],
			['unknown text change', withInner({ modifiedChanges: [{ ...coverage, textChangeIndex: 1 }] }), problem('inner', 'has modified changes that refer to a text change that does not exist')],
			['coverage outside its text change', withInner({ originalChanges: [{ ...coverage, range: new Range(1, 10, 1, 12) }] }), problem('inner', 'has original changes with a range that is empty, invalid or not contained in its text change')],
			['empty coverage', withInner({ originalChanges: [{ ...coverage, range: new Range(1, 15, 1, 15) }] }), problem('inner', 'has original changes with a range that is empty, invalid or not contained in its text change')],
			['unknown classification', withInner({ modifiedChanges: [{ ...coverage, classification: 99 as StructuralDiffClassification }] }), problem('inner', 'has modified changes with an invalid classification or tag')],
			['unknown tag', withInner({ originalChanges: [{ ...coverage, tags: [99 as StructuralDiffTag] }] }), problem('inner', 'has original changes with an invalid classification or tag')],
			['overlapping coverage of ancestor and descendant', withOuter({ modifiedChanges: [coverage] }), 'Invalid structural diff: modified changes [1,15 -> 1,16] and [1,15 -> 1,16] overlap'],
			['root that is not a file', withRoot({ modified: { ...valid.root.modified!, kind: SymbolKind.Class } }), problem('file', 'must be a file on both sides')],
		];

		let reported: string[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => reported.push(error.message));
		try {
			const outcomes: [string, string][] = [];
			for (const [name, result] of cases) {
				reported = [];
				const registration = languageFeatures.structuralDiffProvider.register('*', { provideStructuralDiff: () => result });
				try {
					outcomes.push([name, (await compute()) ? 'valid' : reported.join('\n')]);
				} finally {
					registration.dispose();
				}
			}
			assert.deepStrictEqual(outcomes, cases.map(([name, , expected]) => [name, expected]));
		} finally {
			setUnexpectedErrorHandler(previousHandler);
		}
	});

	test('accepts a partial result without merging providers', async () => {
		store.add(languageFeatures.structuralDiffProvider.register('*', {
			provideStructuralDiff: () => { throw new Error('Must not merge results'); },
		}));
		store.add(languageFeatures.structuralDiffProvider.register({ scheme: 'modified' }, {
			provideStructuralDiff: (_original, _modified, context) => ({ ...createResult(context), isIncomplete: true }),
		}));
		assert.strictEqual((await compute())?.isIncomplete, true);
	});

	test('does not compute a text diff when no provider matches', async () => {
		assert.deepStrictEqual({ result: await compute(), computations }, { result: undefined, computations: 0 });
	});

	test('supplies an empty change list for identical documents', async () => {
		modified.setValue(original.getValue());
		store.add(languageFeatures.structuralDiffProvider.register('*', {
			provideStructuralDiff: (_original, _modified, context) => {
				assert.deepStrictEqual(context.changes, []);
				return createResult(context);
			},
		}));
		assert.deepStrictEqual(await compute(), { ...createResult({ changes: [] }), context: { changes: [] } });
	});

	for (const [originalText, modifiedText] of [
		['', 'new text'],
		['old text', ''],
		['a', 'a\nb'],
		['a\nb', 'a'],
		['a\n', 'a'],
		['const value = 1;', 'const value = 2;'],
	]) {
		test(`keeps insertion, deletion and EOF ranges valid: ${JSON.stringify([originalText, modifiedText])}`, async () => {
			original.setValue(originalText);
			modified.setValue(modifiedText);
			store.add(languageFeatures.structuralDiffProvider.register('*', {
				provideStructuralDiff: (_original, _modified, context) => {
					for (const change of context.changes) {
						assert.deepStrictEqual(change.originalRange, original.validateRange(change.originalRange));
						assert.deepStrictEqual(change.modifiedRange, modified.validateRange(change.modifiedRange));
						assert.ok(!Range.isEmpty(change.originalRange) || !Range.isEmpty(change.modifiedRange));
					}
					assert.ok(context.changes.length > 0);
					return createResult(context);
				},
			}));
			assert.ok(await compute());
		});
	}

	for (const unavailable of [true, false]) {
		test(`rejects ${unavailable ? 'unavailable' : 'incomplete'} text diffs`, async () => {
			worker = new class extends mock<IEditorWorkerService>() {
				override async computeDiff(): Promise<IDocumentDiff | null> {
					return unavailable ? null : { identical: false, quitEarly: true, changes: [], moves: [] };
				}
			};
			store.add(languageFeatures.structuralDiffProvider.register('*', {
				provideStructuralDiff: () => { throw new Error('Must not classify an unavailable text diff'); },
			}));
			await assert.rejects(compute(), unavailable ? /without a complete text diff/ : StructuralDiffs.TimeoutError);
		});
	}

	for (const [setting, expected] of [[undefined, 5000], [1234, 1234], [0, 0], ['nonsense', 5000]] as const) {
		test(`limits the text diff to ${expected} ms when diffEditor.maxComputationTime is ${JSON.stringify(setting)}`, async () => {
			maxComputationTimeSetting = setting;
			store.add(languageFeatures.structuralDiffProvider.register('*', {
				provideStructuralDiff: (_original, _modified, context) => createResult(context),
			}));
			assert.ok(await compute());
			assert.deepStrictEqual(textDiffTimeBudgets, [expected]);
		});
	}

	for (const reason of ['caller', 'original changed', 'modified changed', 'original disposed', 'modified disposed'] as const) {
		test(`cancels a pending provider when ${reason}`, async () => {
			const source = store.add(new CancellationTokenSource());
			const started = new DeferredPromise<CancellationToken>();
			const pending = new DeferredPromise<StructuralDiff | undefined>();
			store.add(languageFeatures.structuralDiffProvider.register('*', {
				provideStructuralDiff: (_original, _modified, _context, token) => {
					started.complete(token);
					return pending.p;
				},
			}));

			const rejected = assert.rejects(compute(source.token), isCancellationError);
			const providerToken = await started.p;
			switch (reason) {
				case 'caller': source.cancel(); break;
				case 'original changed': original.setValue('changed'); break;
				case 'modified changed': modified.setValue('changed'); break;
				case 'original disposed': original.dispose(); break;
				case 'modified disposed': modified.dispose(); break;
			}
			await rejected;
			assert.strictEqual(providerToken.isCancellationRequested, true);
			await pending.complete(undefined);
		});
	}

	test('cancels while computing the text diff', async () => {
		const pending = new DeferredPromise<IDocumentDiff | null>();
		worker = new class extends mock<IEditorWorkerService>() {
			override computeDiff(): Promise<IDocumentDiff | null> {
				return pending.p;
			}
		};
		store.add(languageFeatures.structuralDiffProvider.register('*', {
			provideStructuralDiff: () => { throw new Error('Must not invoke a provider after cancellation'); },
		}));
		const rejected = assert.rejects(compute(), isCancellationError);
		original.setValue('changed');
		await rejected;
		await pending.complete(null);
	});

	test('does not invoke providers for an already cancelled request', async () => {
		store.add(languageFeatures.structuralDiffProvider.register('*', {
			provideStructuralDiff: () => { throw new Error('Must not invoke a provider after cancellation'); },
		}));
		await assert.rejects(compute(CancellationToken.Cancelled), isCancellationError);
		assert.strictEqual(computations, 0);
	});

	test('does not fall back after provider cancellation', async () => {
		store.add(languageFeatures.structuralDiffProvider.register('*', {
			provideStructuralDiff: () => { throw new Error('Must not try another provider after cancellation'); },
		}));
		store.add(languageFeatures.structuralDiffProvider.register({ scheme: 'modified' }, {
			provideStructuralDiff: () => { throw new CancellationError(); },
		}));
		await assert.rejects(compute(), isCancellationError);
	});

	for (const failModifiedResolution of [false, true]) {
		test(`renderer command disposes model references ${failModifiedResolution ? 'on resolution failure' : 'after completion'}`, async () => {
			const released: URI[] = [];
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.set(IEditorWorkerService, worker);
			instantiationService.set(ITextResourceConfigurationService, configuration);
			instantiationService.set(ILanguageFeaturesService, languageFeatures);
			instantiationService.set(ITextModelService, new class extends mock<ITextModelService>() {
				override async createModelReference(resource: URI) {
					if (resource.scheme === 'modified' && failModifiedResolution) {
						throw new Error('Cannot resolve modified document');
					}
					return {
						object: new class extends mock<IResolvedTextEditorModel>() {
							override readonly textEditorModel = resource.scheme === 'original' ? original : modified;
						},
						dispose: () => released.push(resource),
					};
				}
			});
			store.add(languageFeatures.structuralDiffProvider.register('*', {
				provideStructuralDiff: (_original, _modified, context) => createResult(context),
			}));
			const command = CommandsRegistry.getCommand('_executeStructuralDiffProvider');
			assert.ok(command);
			const result = Promise.resolve(instantiationService.invokeFunction(command.handler, original.uri, modified.uri));
			if (failModifiedResolution) {
				await assert.rejects(result, /Cannot resolve modified document/);
			} else {
				assert.ok(await result);
			}
			assert.deepStrictEqual(released, failModifiedResolution ? [original.uri] : [original.uri, modified.uri]);
		});
	}
});
