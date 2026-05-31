/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../../prompt/jsx-runtime/ */

import * as assert from 'assert';
import * as sinon from 'sinon';
import dedent from 'ts-dedent';
import { Diagnostic, DiagnosticSeverity, Range, Uri } from 'vscode';
import { CancellationTokenSource, Position } from 'vscode-languageserver-protocol';
import { MutableObservableWorkspace } from '../../../../../../../../platform/inlineEdits/common/observableWorkspace';
import { ILanguageDiagnosticsService } from '../../../../../../../../platform/languages/common/languageDiagnosticsService';
import { TestingServiceCollection } from '../../../../../../../../platform/test/node/services';
import { URI } from '../../../../../../../../util/vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ComponentContext, PromptElementProps, Text } from '../../../../../prompt/src/components/components';
import { Dispatch, StateUpdater } from '../../../../../prompt/src/components/hooks';
import { VirtualPrompt } from '../../../../../prompt/src/components/virtualPrompt';
import { DEFAULT_MAX_COMPLETION_LENGTH } from '../../../../../prompt/src/prompt';
import { getTokenizer, TokenizerName } from '../../../../../prompt/src/tokenization';
import { CodeSnippet, ContextProvider, SupportedContextItem, Trait, type DiagnosticBag } from '../../../../../types/src';
import { ICompletionsObservableWorkspace } from '../../../completionsObservableWorkspace';
import { createCompletionState, type CompletionState } from '../../../completionState';
import { ConfigKey, ICompletionsConfigProvider, InMemoryConfigProvider } from '../../../config';
import { ICompletionsFeaturesService } from '../../../experiments/featuresService';
import { TelemetryWithExp } from '../../../telemetry';
import { createLibTestingContext } from '../../../test/context';
import { withInMemoryTelemetry } from '../../../test/telemetry';
import { createTextDocument, TestTextDocumentManager } from '../../../test/textDocument';
import { ITextDocument } from '../../../textDocument';
import { ICompletionsTextDocumentManagerService } from '../../../textDocumentManager';
import { CompletionsContext } from '../../components/completionsContext';
import { ICompletionsContextProviderBridgeService } from '../../components/contextProviderBridge';
import { CurrentFile } from '../../components/currentFile';
import { ContextProviderTelemetry, ICompletionsContextProviderRegistryService, type DefaultDiagnosticSettings, type ResolvedContextItem } from '../../contextProviderRegistry';
import type { DiagnosticBagWithId } from '../../contextProviders/contextItemSchemas';
import { _contextTooShort, _promptCancelled, _promptError } from '../../prompt';
import { FullRecentEditsProvider, ICompletionsRecentEditsProviderService } from '../../recentEdits/recentEditsProvider';
import { NeighborSource } from '../../similarFiles/neighborFiles';
import {
	DEFAULT_PROMPT_TIMEOUT, IPromptFactory,
	TestCompletionsPromptFactory
} from '../completionsPromptFactory';
import {
	isCompletionRequestData,
	PromptOrdering,
	TestComponentsCompletionsPromptFactory
} from '../componentsCompletionsPromptFactory';

suite('Completions Prompt Factory', function () {
	let telemetryData: TelemetryWithExp;
	let accessor: ServicesAccessor;
	let serviceCollection: TestingServiceCollection;
	let clock: sinon.SinonFakeTimers | undefined;
	let cts: CancellationTokenSource;
	const longPrefix = Array.from({ length: 60 }, (_, i) => `const a${i} = ${i};`).join('\n');
	const defaultTextDocument = createTextDocument(
		'file:///path/basename',
		'typescript',
		0,
		dedent`
			${longPrefix}
			function f|
			const b = 2;
		`
	);
	let promptFactory: IPromptFactory;

	function invokePromptFactory(
		opts: {
			completionId?: string;
			textDocument?: ITextDocument;
			position?: Position;
			separateContext?: boolean;
		} = {},
		factory: IPromptFactory = promptFactory,
	) {
		const textDocument = opts.textDocument ?? defaultTextDocument;
		const position = opts.position ?? textDocument.positionAt(textDocument.getText().indexOf('|'));
		const completionState = createCompletionState(textDocument, position);
		const separateContext = opts.separateContext ?? false;
		const completionId = opts.completionId ?? 'completion_id';
		const contextProviderBridge = accessor.get(ICompletionsContextProviderBridgeService);
		contextProviderBridge.schedule(completionState, completionId, 'opId', telemetryData);
		return factory.prompt(
			{ completionId, completionState, telemetryData, promptOpts: { separateContext } },
			cts.token
		);
	}

	setup(function () {
		serviceCollection = createLibTestingContext();
		accessor = serviceCollection.createTestingAccessor();
		telemetryData = TelemetryWithExp.createEmptyConfigForTesting();
		cts = new CancellationTokenSource();
		promptFactory = accessor.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, undefined, undefined);
	});

	teardown(function () {
		clock?.restore();
		sinon.restore();
		NeighborSource.reset();
	});

	test('prompt should include document marker', async function () {
		const result = await invokePromptFactory();

		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(result.prompt.prefix, `// Path: basename\n${longPrefix}\nfunction f`);
		assert.deepStrictEqual(result.prompt.prefixTokens, 427);
		assert.deepStrictEqual(result.prompt.suffix, 'const b = 2;');
		assert.deepStrictEqual(result.prompt.suffixTokens, 6);
	});

	test('prompt should include neighboring files', async function () {
		const tdm = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
		tdm.setTextDocument('file:///something.ts', 'typescript', '// match function f\nfunction foo() {}');

		const result = await invokePromptFactory();

		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(
			result.prompt.prefix,
			dedent`
				// Path: basename
				// Compare this snippet from something.ts:
				// // match function f
				// function foo() {}
				${longPrefix}
				function f
			`
		);
		assert.deepStrictEqual(result.prompt.prefixTokens, 446);
		assert.deepStrictEqual(result.prompt.suffix, 'const b = 2;');
		assert.deepStrictEqual(result.prompt.suffixTokens, 6);
	});

	test('prompt should include recent edits', async function () {
		const serviceCollectionClone = serviceCollection.clone();
		const workspace = new CompletionsMutableObservableWorkspace();
		serviceCollectionClone.define(ICompletionsObservableWorkspace, workspace);

		// TODO: figure out how to simulate real document update events
		const rep = new MockRecentEditsProvider(undefined, workspace);
		serviceCollectionClone.define(ICompletionsRecentEditsProviderService, rep);

		const accessorClone = serviceCollectionClone.createTestingAccessor();
		const promptFactory = accessorClone.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, undefined, undefined);

		// Ensure the document is open
		const tdm = accessorClone.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
		tdm.setTextDocument(defaultTextDocument.uri, defaultTextDocument.languageId, defaultTextDocument.getText());

		// Update the distance setting to avoid having to create a huge document
		rep.config.activeDocDistanceLimitFromCursor = 10;

		rep.testUpdateRecentEdits(defaultTextDocument.uri, defaultTextDocument.getText());
		rep.testUpdateRecentEdits(
			defaultTextDocument.uri,
			defaultTextDocument.getText().replace('const a0', 'const c1')
		);

		const result = await invokePromptFactory({}, promptFactory);

		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(
			result.prompt.prefix,
			dedent`
				// Path: basename
				// These are recently edited files. Do not suggest code that has been deleted.
				// File: basename
				// --- a/file:///path/basename
				// +++ b/file:///path/basename
				// @@ -1,4 +1,4 @@
				// +const c1 = 0;
				// -const a0 = 0; --- IGNORE ---
				//  const a1 = 1;
				//  const a2 = 2;
				//  const a3 = 3;
				// End of recent edits
				${longPrefix}
				function f
			`
		);
		assert.deepStrictEqual(result.prompt.suffix, 'const b = 2;');
	});

	test('recent edits are removed as a chunk', async function () {
		const serviceCollectionClone = serviceCollection.clone();
		const workspace = new CompletionsMutableObservableWorkspace();
		serviceCollectionClone.define(ICompletionsObservableWorkspace, workspace);
		// TODO: figure out how to simulate real document update events
		const rep = new MockRecentEditsProvider(undefined, workspace);
		serviceCollectionClone.define(ICompletionsRecentEditsProviderService, rep);

		const accessorClone = serviceCollectionClone.createTestingAccessor();
		const promptFactory = accessorClone.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, undefined, undefined);
		const featuresService = accessorClone.get(ICompletionsFeaturesService);

		// Ensure the document is open
		const tdm = accessorClone.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
		tdm.setTextDocument(defaultTextDocument.uri, defaultTextDocument.languageId, defaultTextDocument.getText());

		// Update the distance setting to avoid having to create a huge document
		rep.config.activeDocDistanceLimitFromCursor = 10;

		rep.testUpdateRecentEdits(defaultTextDocument.uri, defaultTextDocument.getText());
		rep.testUpdateRecentEdits(
			defaultTextDocument.uri,
			defaultTextDocument.getText().replace('const a0', 'const c1')
		);

		featuresService.maxPromptCompletionTokens = () => 530 + DEFAULT_MAX_COMPLETION_LENGTH;
		featuresService.suffixPercent = () => 0;

		const result = await invokePromptFactory({}, promptFactory);

		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(
			result.prompt.prefix,
			dedent`
				// Path: basename
				${longPrefix}
				function f
			`
		);
	});

	test('prompt should include context and prefix', async function () {
		const result = await invokePromptFactory({ separateContext: true });

		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(result.prompt.prefix, `${longPrefix}\nfunction f`);
		assert.deepStrictEqual(result.prompt.context, ['Path: basename']);
		assert.deepStrictEqual(result.prompt.suffix, 'const b = 2;');
	});

	test('prompt should include prefix and suffix tokens', async function () {
		const result = await invokePromptFactory();

		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(result.prompt.prefixTokens, 427);
		assert.deepStrictEqual(result.prompt.suffixTokens, 6);
	});

	test('suffix should be cached if similar enough', async function () {
		telemetryData.filtersAndExp.exp.variables.copilotsuffixmatchthreshold = 20;
		// Call it once to cache
		await invokePromptFactory();

		const textDocument = createTextDocument(
			'untitled:',
			'typescript',
			1,
			dedent`
				const a = 1;
				function f|
				const b = 1;
			`
		);

		const result = await invokePromptFactory({ textDocument });

		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(result.prompt.suffix, 'const b = 2;');
	});

	test('produces timeout prompt if timeout is exceeded', async function () {
		clock = sinon.useFakeTimers();
		const TimeoutComponent = (_: PromptElementProps, context: ComponentContext) => {
			context.useData(isCompletionRequestData, async _ => {
				await clock?.tickAsync(DEFAULT_PROMPT_TIMEOUT + 1);
			});
			return <Text>A really cool prompt</Text>;
		};
		const virtualPrompt = new VirtualPrompt(
			(
				<>
					<CompletionsContext>
						<TimeoutComponent />
					</CompletionsContext>
					<CurrentFile />
				</>
			)
		);
		promptFactory = accessor.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, virtualPrompt, undefined);
		const result = await invokePromptFactory();

		assert.deepStrictEqual(result.type, 'promptTimeout');
	});

	test('produces valid prompts with multiple promises racing', async function () {
		const promises = [];
		for (let i = 0; i < 3; i++) {
			const textDocument = createTextDocument(`file:///path/basename${i}`, 'typescript', 0, `const a = ${i}|;`);
			const promise = invokePromptFactory({ textDocument });
			promises.push(promise);
		}

		const results = await Promise.all(promises);

		for (let i = 0; i < 3; i++) {
			const result = results[i];
			assert.deepStrictEqual(result.type, 'prompt');
			assert.deepStrictEqual(result.prompt.prefix, `// Path: basename${i}\nconst a = ${i}`);
		}
	});

	test('handles errors with multiple promises racing', async function () {
		sinon
			.stub(TestComponentsCompletionsPromptFactory.prototype, 'createPromptUnsafe')
			.callThrough()
			.onFirstCall()
			.throws(new Error('Intentional error'));

		const doc = createTextDocument('file:///path/basename', 'typescript', 0, `const a = 1|;`);

		const smallDoc = createTextDocument('file:///path/basename', 'typescript', 0, `c|`);

		const errorPromise = invokePromptFactory({ textDocument: doc });
		const goodPromise = invokePromptFactory({ textDocument: doc });
		const shortContextPromise = invokePromptFactory({ textDocument: smallDoc });

		const results = await Promise.all([errorPromise, goodPromise, shortContextPromise]);

		assert.deepStrictEqual(results[0], _promptError);
		assert.deepStrictEqual(results[2], _contextTooShort);

		const firstResult = results[1];
		assert.deepStrictEqual(firstResult.type, 'prompt');
		assert.deepStrictEqual(firstResult.prompt.prefix, `// Path: basename\nconst a = 1`);
	});

	test('produces valid prompts with sequential context provider calls', async function () {
		const featuresService = accessor.get(ICompletionsFeaturesService);
		featuresService.contextProviders = () => ['traitsProvider'];

		let id = 0;
		const traitsProvider: ContextProvider<Trait> = {
			id: 'traitsProvider',
			selector: [{ language: 'typescript' }],
			resolver: {
				resolve: () => {
					const traitId = id++;
					return Promise.resolve([
						{ name: `test_trait${traitId}`, value: 'test_value', id: `trait${traitId}` },
					]);
				},
			},
		};
		accessor.get(ICompletionsContextProviderRegistryService).registerContextProvider(traitsProvider);

		const promises = [];
		for (let i = 0; i < 3; i++) {
			const textDocument = createTextDocument(`file:///path/basename${i}`, 'typescript', 0, `const a = ${i}|;`);
			const promise = invokePromptFactory({ textDocument, completionId: `completion_id_${i}` });
			promises.push(promise);
		}

		const results = await Promise.all(promises);

		for (let i = 0; i < 3; i++) {
			const result = results[i];
			assert.deepStrictEqual(result.type, 'prompt');
			assert.deepStrictEqual(
				result.prompt.prefix,
				`// Path: basename${i}\n// Consider this related information:\n// test_trait${i}: test_value\nconst a = ${i}`
			);
			assert.deepStrictEqual(result.contextProvidersTelemetry?.length, 1);
			assert.deepStrictEqual(result.contextProvidersTelemetry?.[0].usageDetails?.length, 1);
			assert.deepStrictEqual(result.contextProvidersTelemetry?.[0].usageDetails?.[0].id, `trait${i}`);
		}
	});

	test('produces valid prompts with multiple promises racing, one blocking', async function () {
		clock = sinon.useFakeTimers();
		let timeoutMs = DEFAULT_PROMPT_TIMEOUT + 1;
		const TimeoutComponent = (_: PromptElementProps, context: ComponentContext) => {
			context.useData(isCompletionRequestData, async _ => {
				const timeoutPromise = clock?.tickAsync(timeoutMs);
				timeoutMs = 0;
				await timeoutPromise;
			});

			return <Text>A really cool prompt</Text>;
		};
		const virtualPrompt = new VirtualPrompt(
			(
				<>
					<CompletionsContext>
						<TimeoutComponent />
					</CompletionsContext>
					<CurrentFile />
				</>
			)
		);
		promptFactory = accessor.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, virtualPrompt, undefined);

		const promises = [];
		for (let i = 0; i < 2; i++) {
			const textDocument = createTextDocument(`file:///${i}`, 'typescript', 0, `const a = ${i}|;`);
			const promise = invokePromptFactory({ textDocument });
			promises.push(promise);
		}

		const results = await Promise.all(promises);

		assert.deepStrictEqual(results[0].type, 'promptTimeout');
		assert.deepStrictEqual(results[1].type, 'prompt');
		assert.deepStrictEqual(results[1].prompt.prefix, '// A really cool prompt\nconst a = 1');
	});

	test('token limits can be controlled via EXP', async function () {
		const tokenizer = getTokenizer();
		const longText = Array.from({ length: 1000 }, (_, i) => `const a${i} = ${i};`).join('\n');
		const longTextDocument = createTextDocument(
			'file:///path/basename',
			'typescript',
			0,
			longText + 'function f|\nconst b = 2;'
		);
		const defaultLimitsPrompt = await invokePromptFactory({ textDocument: longTextDocument });

		assert.deepStrictEqual(defaultLimitsPrompt.type, 'prompt');
		assert.deepStrictEqual(tokenizer.tokenLength(defaultLimitsPrompt.prompt.prefix), 7007);
		assert.deepStrictEqual(tokenizer.tokenLength(defaultLimitsPrompt.prompt.suffix), 6);

		// 100 tokens are left for the prompt, 5 are used for the suffix token, so 95 are left
		telemetryData.filtersAndExp.exp.variables.maxpromptcompletionTokens =
			100 + // Prefix + suffix
			5 + // Suffix encoding
			DEFAULT_MAX_COMPLETION_LENGTH;
		telemetryData.filtersAndExp.exp.variables.CopilotSuffixPercent = 2;

		const expLimitsPrompt = await invokePromptFactory({ textDocument: longTextDocument });

		assert.deepStrictEqual(expLimitsPrompt.type, 'prompt');
		assert.deepStrictEqual(tokenizer.tokenLength(expLimitsPrompt.prompt.prefix), 98);
		assert.deepStrictEqual(tokenizer.tokenLength(expLimitsPrompt.prompt.suffix), 2);
	});

	test('produces context too short', async function () {
		const tinyTextDocument = createTextDocument('file:///path/basename', 'typescript', 0, '');
		const result = await invokePromptFactory({ textDocument: tinyTextDocument });

		assert.deepStrictEqual(result, _contextTooShort);
	});

	test('errors when hitting fault barrier', async function () {
		const virtualPrompt = new VirtualPrompt(<></>);
		virtualPrompt.snapshot = sinon.stub().throws(new Error('Intentional snapshot error'));
		promptFactory = accessor.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, virtualPrompt, undefined);

		const result = await invokePromptFactory();

		assert.deepStrictEqual(result, _promptError);
	});

	test('recovers from error when hitting fault barrier', async function () {
		const virtualPrompt = new VirtualPrompt(<></>);
		virtualPrompt.snapshot = sinon.stub().throws(new Error('Intentional snapshot error'));
		promptFactory = accessor.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, virtualPrompt, undefined);

		let result = await invokePromptFactory();
		assert.deepStrictEqual(result, _promptError);

		result = await invokePromptFactory();
		assert.deepStrictEqual(result.type, 'prompt');
	});

	test('errors on snapshot error', async function () {
		const virtualPrompt = new VirtualPrompt(<></>);
		virtualPrompt.snapshot = sinon
			.stub()
			.returns({ snapshot: undefined, status: 'error', error: new Error('Intentional snapshot error') });
		promptFactory = accessor.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, virtualPrompt, undefined);

		const result = await invokePromptFactory();

		assert.deepStrictEqual(result, _promptError);
	});

	test('recovers from error on snapshot error', async function () {
		const virtualPrompt = new VirtualPrompt(<></>);
		virtualPrompt.snapshot = sinon
			.stub()
			.returns({ snapshot: undefined, status: 'error', error: new Error('Intentional snapshot error') });
		promptFactory = accessor.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, virtualPrompt, undefined);

		let result = await invokePromptFactory();
		assert.deepStrictEqual(result, _promptError);

		result = await invokePromptFactory();
		assert.deepStrictEqual(result.type, 'prompt');
	});

	test('handles cancellation', async function () {
		cts.cancel();
		const result = await invokePromptFactory();

		assert.deepStrictEqual(result, _promptCancelled);
	});

	test('handles cancellation during update data', async function () {
		const CancellationComponent = (_: PromptElementProps, context: ComponentContext) => {
			context.useData(isCompletionRequestData, _ => {
				cts.cancel();
			});
			return <Text>A really cool prompt</Text>;
		};
		const virtualPrompt = new VirtualPrompt(
			(
				<>
					<CancellationComponent />
					<CurrentFile />
				</>
			)
		);
		promptFactory = accessor.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, virtualPrompt, undefined);
		const result = await invokePromptFactory();

		assert.deepStrictEqual(result, _promptCancelled);
	});

	test('error in snapshot leads to prompt error', async function () {
		let outerSetShouldThrowError: Dispatch<StateUpdater<boolean>> = () => { };
		const ErrorThrowingComponent = (_props: PromptElementProps, context: ComponentContext) => {
			const [shouldThrowError, setShouldThrowError] = context.useState(false);
			outerSetShouldThrowError = setShouldThrowError;

			if (shouldThrowError) {
				throw new Error('Intentional error');
			}
			return <></>;
		};
		const virtualPrompt = new VirtualPrompt(<ErrorThrowingComponent />);
		promptFactory = accessor.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, virtualPrompt, undefined);

		outerSetShouldThrowError(true);
		const result = await invokePromptFactory();

		assert.deepStrictEqual(result, _promptError);
	});

	test('prompt should not include context provider info if the context provider API is not enabled', async function () {
		const configProvider = accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
		configProvider.setConfig(ConfigKey.ContextProviders, []);

		telemetryData.filtersAndExp.exp.variables.copilotcontextproviders = '';

		const result = await invokePromptFactory();
		assert.deepStrictEqual(result.type, 'prompt');
		assert.ok(result.prompt.prefix.includes('Consider this related information:') === false);
	});

	test('prompt should include traits, diagnostics and code snippets if the context provider API is enabled', async function () {
		telemetryData.filtersAndExp.exp.variables.copilotcontextproviders = 'traitsProvider,diagnosticsProvider,codeSnippetsProvider';

		const traitsProvider: ContextProvider<Trait> = {
			id: 'traitsProvider',
			selector: [{ language: 'typescript' }],
			resolver: {
				resolve: () => Promise.resolve([{ name: 'test_trait', value: 'test_value' }]),
			},
		};
		const diagnosticsProvider: ContextProvider<DiagnosticBag> = {
			id: 'diagnosticsProvider',
			selector: [{ language: 'typescript' }],
			resolver: {
				resolve: () => {
					const diag1 = new Diagnostic(new Range(0, 10, 0, 20), 'type exists', DiagnosticSeverity.Error);
					diag1.code = 1017;
					diag1.source = 'ts';
					const diag2 = new Diagnostic(new Range(0, 20, 0, 25), 'unknown type', DiagnosticSeverity.Warning);
					diag2.code = 2017;
					return Promise.resolve([{ uri: Uri.file('something.ts'), values: [diag1, diag2] }]);
				},
			},
		};
		const codeSnippetsProvider: ContextProvider<CodeSnippet> = {
			id: 'codeSnippetsProvider',
			selector: [{ language: 'typescript' }],
			resolver: {
				resolve: () => Promise.resolve([{ uri: 'file:///something.ts', value: 'function foo() { return 1; }' }]),
			},
		};
		const contextProviderRegistry = accessor.get(ICompletionsContextProviderRegistryService);
		contextProviderRegistry.registerContextProvider(traitsProvider);
		contextProviderRegistry.registerContextProvider(diagnosticsProvider);
		contextProviderRegistry.registerContextProvider(codeSnippetsProvider);

		// Register the documents for content exclusion
		const tdm = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
		tdm.setTextDocument('file:///something.ts', 'typescript', 'does not matter');

		const result = await invokePromptFactory();
		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(
			result.prompt.prefix,
			dedent`
				// Path: basename
				// Consider this related information:
				// test_trait: test_value
				// Consider the following typescript diagnostics from something.ts:
				// 1:11 - error TS1017: type exists
				// 1:21 - warning 2017: unknown type
				// Compare this snippet from something.ts:
				// function foo() { return 1; }
			` + `\n${longPrefix}\nfunction f`
		);
	});

	test('should still produce a prompt if a context provider errors', async function () {
		telemetryData.filtersAndExp.exp.variables.copilotcontextproviders = 'errorProvider,codeSnippetsProvider';

		const errorProvider: ContextProvider<SupportedContextItem> = {
			id: 'errorProvider',
			selector: [{ language: 'typescript' }],
			resolver: {
				resolve: (): Promise<never> => Promise.reject(new Error('Intentional error')),
			},
		};
		const codeSnippetsProvider: ContextProvider<CodeSnippet> = {
			id: 'codeSnippetsProvider',
			selector: [{ language: 'typescript' }],
			resolver: {
				resolve: () => Promise.resolve([{ uri: 'file:///something.ts', value: 'function foo() { return 1; }' }]),
			},
		};
		const contextProviderRegistry = accessor.get(ICompletionsContextProviderRegistryService);
		contextProviderRegistry.registerContextProvider(errorProvider);
		contextProviderRegistry.registerContextProvider(codeSnippetsProvider);

		// Register the documents for content exclusion
		const tdm = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
		tdm.setTextDocument('file:///something.ts', 'typescript', 'does not matter');

		const result = await invokePromptFactory();
		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(
			result.prompt.prefix,
			dedent`
				// Path: basename
				// Compare this snippet from something.ts:
				// function foo() { return 1; }
			` + `\n${longPrefix}\nfunction f`
		);
	});

	test('prompt should include compute time', async function () {
		const result = await invokePromptFactory();

		assert.deepStrictEqual(result.type, 'prompt');
		assert.ok(result.computeTimeMs > 0);
	});

	test('prompt should trim prefix and include trailingWs', async function () {
		const textDocument = createTextDocument(
			'file:///path/basename',
			'typescript',
			0,
			`const a = 1;\nfunction f\n    const b = 2;\n    `
		);
		const result = await invokePromptFactory({ textDocument, position: Position.create(3, 4) });

		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(result.prompt.prefix, '// Path: basename\nconst a = 1;\nfunction f\n    const b = 2;\n');
		assert.deepStrictEqual(result.trailingWs, '    ');
	});

	test('prompt respects context blocks if separateContext is true', async function () {
		function splitContextPrompt() {
			return (
				<>
					<CompletionsContext>
						<Text>First context block</Text>
					</CompletionsContext>
					<CompletionsContext>
						<Text>Second context block</Text>
					</CompletionsContext>
					<CurrentFile />
				</>
			);
		}

		const virtualPrompt = new VirtualPrompt(splitContextPrompt());

		promptFactory = accessor.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, virtualPrompt, PromptOrdering.SplitContext);
		const result = await invokePromptFactory({ separateContext: true });

		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(result.prompt.context, ['First context block', 'Second context block']);
	});

	test('prompt does not output separate context blocks if separateContext is not specified', async function () {
		function splitContextPrompt() {
			return (
				<>
					<CompletionsContext>
						<Text>First context block</Text>
					</CompletionsContext>
					<CompletionsContext>
						<Text>Second context block</Text>
					</CompletionsContext>
					<CurrentFile />
				</>
			);
		}

		const virtualPrompt = new VirtualPrompt(splitContextPrompt());

		promptFactory = accessor.get(IInstantiationService).createInstance(TestCompletionsPromptFactory, virtualPrompt, PromptOrdering.SplitContext);
		const result = await invokePromptFactory();

		assert.deepStrictEqual(result.type, 'prompt');
		assert.deepStrictEqual(result.prompt.context, undefined);
	});

	test('produces metadata', async function () {
		const result = await invokePromptFactory();
		assert.deepStrictEqual(result.type, 'prompt');

		const metadata = result.metadata;
		assert.ok(metadata);
		assert.ok(metadata.renderId === 0);
		assert.ok(metadata.elisionTimeMs > 0);
		assert.ok(metadata.renderTimeMs > 0);
		assert.ok(metadata.updateDataTimeMs > 0);
		assert.deepStrictEqual(metadata.rendererName, 'c');
		assert.deepStrictEqual(metadata.tokenizer, TokenizerName.o200k);

		const componentsUpdateDataTimeMs = metadata.componentStatistics.reduce(
			(acc, { updateDataTimeMs }) => acc + (updateDataTimeMs ?? 0),
			0
		);
		assert.ok(componentsUpdateDataTimeMs > 0);
		const actualStatsFiltered = metadata.componentStatistics.map(stats => {
			if (stats.updateDataTimeMs) {
				stats.updateDataTimeMs = 42;
			}
			return stats;
		});

		assert.deepStrictEqual(actualStatsFiltered, [
			{
				componentPath: '$.f[0].CompletionsContext[0].DocumentMarker',
				updateDataTimeMs: 42,
			},
			{
				componentPath: '$.f[0].CompletionsContext[1].Traits',
				updateDataTimeMs: 42,
			},
			{
				componentPath: '$.f[0].CompletionsContext[2].Diagnostics',
				updateDataTimeMs: 42,
			},
			{
				componentPath: '$.f[0].CompletionsContext[3].CodeSnippets',
				updateDataTimeMs: 42,
			},
			{
				componentPath: '$.f[0].CompletionsContext[4].SimilarFiles',
				updateDataTimeMs: 42,
			},
			{
				componentPath: '$.f[0].CompletionsContext[5].RecentEdits',
				updateDataTimeMs: 42,
			},
			{
				componentPath: '$.f[1].CurrentFile',
				updateDataTimeMs: 42,
			},
			{
				componentPath: '$.f[0].CompletionsContext[0].DocumentMarker[0].PathMarker[0].Text[0]',
				expectedTokens: 5,
				actualTokens: 5,
			},
			{
				componentPath: '$.f[1].CurrentFile[0].f[0].BeforeCursor[0].Text[0]',
				expectedTokens: 422,
				actualTokens: 422,
			},
			{
				componentPath: '$.f[1].CurrentFile[0].f[1].AfterCursor[0].Text[0]',
				expectedTokens: 6,
				actualTokens: 6,
			},
		]);
	});

	test('telemetry should include context providers', async function () {
		telemetryData.filtersAndExp.exp.variables.copilotcontextproviders = 'traitsProvider,codeSnippetsProvider';

		const traitsContextProvider: ContextProvider<Trait> = {
			id: 'traitsProvider',
			selector: [{ language: 'typescript' }],
			resolver: {
				resolve: () => Promise.resolve([{ name: 'test_trait', value: 'test_value', id: 'trait1' }]),
			},
		};
		const codeSnippetsProvider: ContextProvider<CodeSnippet> = {
			id: 'codeSnippetsProvider',
			selector: [{ language: 'typescript' }],
			resolver: {
				resolve: (): Promise<CodeSnippet[]> =>
					Promise.resolve([
						{
							uri: 'file:///something.ts',
							value: dedent`
									function foo() {
										return 1;
									}
								`,
							id: 'cs1',
						},
						{
							uri: 'file:///somethingElse.ts',
							value: dedent`
									function bar() {
										return 'two';
									}
								`,
							id: 'cs2',
							origin: 'update',
						},
					]),
			},
		};
		// Register the documents for content exclusion
		const contextProviderRegistry = accessor.get(ICompletionsContextProviderRegistryService);
		const tdm = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
		tdm.setTextDocument('file:///something.ts', 'typescript', 'does not matter');

		contextProviderRegistry.registerContextProvider(traitsContextProvider);
		contextProviderRegistry.registerContextProvider(codeSnippetsProvider);

		const prompt = await invokePromptFactory();

		const expectedTelemetry: ContextProviderTelemetry[] = [
			{
				providerId: 'traitsProvider',
				resolution: 'full',
				resolutionTimeMs: -1,
				usage: 'full',
				matched: true,
				numResolvedItems: 1,
				numUsedItems: 1,
				numPartiallyUsedItems: 0,
				usageDetails: [{ id: 'trait1', usage: 'full', expectedTokens: 7, actualTokens: 7, type: 'Trait' }],
			},
			{
				providerId: 'codeSnippetsProvider',
				resolution: 'full',
				resolutionTimeMs: -1,
				usage: 'full',
				matched: true,
				numResolvedItems: 2,
				numUsedItems: 2,
				numPartiallyUsedItems: 0,
				usageDetails: [
					{ id: 'cs1', usage: 'full', expectedTokens: 13, actualTokens: 13, type: 'CodeSnippet' },
					{ id: 'cs2', usage: 'full', expectedTokens: 13, actualTokens: 13, type: 'CodeSnippet', origin: 'update' },
				],
			},
		];

		assert.deepStrictEqual(prompt.type, 'prompt');
		assert.deepStrictEqual(
			prompt.contextProvidersTelemetry?.map(pt => {
				pt.resolutionTimeMs = -1;
				return pt;
			}),
			expectedTelemetry
		);
	});

	test('Test only sanctioned traits are included in telemetry', async function () {
		telemetryData.filtersAndExp.exp.variables.copilotcontextproviders = 'traitsProvider';

		const traitsProvider: ContextProvider<Trait> = {
			id: 'traitsProvider',
			selector: [{ language: 'typescript' }],
			resolver: {
				resolve: () =>
					Promise.resolve([
						{ name: 'trait1', value: 'value1' },
						{ name: 'TargetFrameworks', value: 'framework value' },
						{ name: 'trait2', value: 'value2' },
						{ name: 'LanguageVersion', value: 'language version' },
					]),
			},
		};
		const contextProviderRegistry = accessor.get(ICompletionsContextProviderRegistryService);
		contextProviderRegistry.registerContextProvider(traitsProvider);

		const { reporter } = await withInMemoryTelemetry(accessor, async _ => {
			const response = await invokePromptFactory();
			assert.deepStrictEqual(response.type, 'prompt');
			assert.deepStrictEqual(
				response.prompt.prefix,
				dedent`
					// Path: basename
					// Consider this related information:
					// trait1: value1
					// TargetFrameworks: framework value
					// trait2: value2
					// LanguageVersion: language version
				` + `\n${longPrefix}\nfunction f`
			);
		});

		// the event should only contains sanctioned trait with expected property names.
		assert.strictEqual(reporter.hasEvent, true);
		assert.strictEqual(reporter.events.length, 1);

		assert.strictEqual(reporter.events[0].name, 'contextProvider.traits');
		assert.strictEqual(reporter.events[0].properties['targetFrameworks'], 'framework value');
		assert.strictEqual(reporter.events[0].properties['languageVersion'], 'language version');
		assert.strictEqual(reporter.events[0].properties['languageId'], 'typescript');

		assert.strictEqual(reporter.events[0].properties['trait1'], undefined);
		assert.strictEqual(reporter.events[0].properties['trait2'], undefined);

		assert.strictEqual(reporter.hasException, false);
	});
});

suite('getDefaultDiagnostics', function () {
	type PromptFactoryWithDiagnostic = IPromptFactory & {
		addDefaultDiagnosticBag(
			resolvedContextItems: ResolvedContextItem[],
			bags: DiagnosticBagWithId[] | undefined,
			completionId: string,
			completionState: CompletionState,
			settings: DefaultDiagnosticSettings
		): DiagnosticBagWithId[] | undefined;
	};
	let accessor: ServicesAccessor;
	let serviceCollection: TestingServiceCollection;
	let promptFactory: PromptFactoryWithDiagnostic;
	const completionId = 'test-completion-id';

	setup(function () {
		serviceCollection = createLibTestingContext();
		accessor = serviceCollection.createTestingAccessor();
		promptFactory = accessor.get(IInstantiationService).createInstance(TestComponentsCompletionsPromptFactory, undefined, undefined);
	});

	teardown(function () {
		sinon.restore();
	});

	test('should return undefined when diagnostics array is empty', function () {
		const document = createTextDocument('file:///test.ts', 'typescript', 0, 'function foo() {}\n');
		const position = Position.create(0, 10);
		const completionState = createCompletionState(document, position);
		const settings: DefaultDiagnosticSettings = { warnings: 'yes', maxLineDistance: 10, maxDiagnostics: 5 };

		// Set empty diagnostics
		const languageDiagnosticsService = accessor.get(ILanguageDiagnosticsService);
		(languageDiagnosticsService as any).setDiagnostics(Uri.parse(document.uri), []);

		const result = promptFactory.addDefaultDiagnosticBag([], undefined, completionId, completionState, settings);
		assert.strictEqual(result, undefined);
	});

	test('should return undefined when bags already contains document', function () {
		const document = createTextDocument('file:///test.ts', 'typescript', 0, 'function foo() {}\n');
		const position = Position.create(0, 10);
		const completionState = createCompletionState(document, position);
		const settings: DefaultDiagnosticSettings = { warnings: 'yes', maxLineDistance: 10, maxDiagnostics: 5 };

		const bags = [{
			type: 'DiagnosticBag' as const,
			uri: URI.parse(document.uri),
			values: [],
			id: 'test-id'
		}];

		const result = promptFactory.addDefaultDiagnosticBag([], bags, completionId, completionState, settings);
		assert.strictEqual(result, bags);
	});

	test('should filter out diagnostics outside maxLineDistance', function () {
		const document = createTextDocument('file:///test.ts', 'typescript', 0, dedent`
			line 0
			line 1
			line 2
			line 3
			line 4
			line 5
		`);
		const position = Position.create(2, 0); // At line 2
		const completionState = createCompletionState(document, position);
		const settings: DefaultDiagnosticSettings = { warnings: 'yes', maxLineDistance: 1, maxDiagnostics: 5 };

		const diagnostics: Diagnostic[] = [
			{
				range: new Range(0, 0, 0, 5), // Distance: 2, should be filtered out
				message: 'Error at line 0',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(1, 0, 1, 5), // Distance: 1, should be included
				message: 'Error at line 1',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(3, 0, 3, 5), // Distance: 1, should be included
				message: 'Error at line 3',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(5, 0, 5, 5), // Distance: 3, should be filtered out
				message: 'Error at line 5',
				severity: DiagnosticSeverity.Error
			}
		];

		const languageDiagnosticsService = accessor.get(ILanguageDiagnosticsService);
		(languageDiagnosticsService as any).setDiagnostics(Uri.parse(document.uri), diagnostics);

		const result = promptFactory.addDefaultDiagnosticBag([], undefined, completionId, completionState, settings)![0];
		assert.notStrictEqual(result, undefined);
		assert.strictEqual(result!.values.length, 2);
		assert.strictEqual(result!.values[0].message, 'Error at line 1');
		assert.strictEqual(result!.values[1].message, 'Error at line 3');
	});

	test('should only include errors when warnings mode is "no"', function () {
		const document = createTextDocument('file:///test.ts', 'typescript', 0, 'function foo() {}\n');
		const position = Position.create(0, 10);
		const completionState = createCompletionState(document, position);
		const settings: DefaultDiagnosticSettings = { warnings: 'no', maxLineDistance: 10, maxDiagnostics: 5 };

		const diagnostics: Diagnostic[] = [
			{
				range: new Range(0, 0, 0, 5),
				message: 'Error message',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(0, 6, 0, 10),
				message: 'Warning message',
				severity: DiagnosticSeverity.Warning
			}
		];

		const languageDiagnosticsService = accessor.get(ILanguageDiagnosticsService);
		(languageDiagnosticsService as any).setDiagnostics(Uri.parse(document.uri), diagnostics);

		const result = promptFactory.addDefaultDiagnosticBag([], undefined, completionId, completionState, settings)![0];
		assert.notStrictEqual(result, undefined);
		assert.strictEqual(result!.values.length, 1);
		assert.strictEqual(result!.values[0].severity, DiagnosticSeverity.Error);
	});

	test('should include both errors and warnings when warnings mode is "yes"', function () {
		const document = createTextDocument('file:///test.ts', 'typescript', 0, 'function foo() {}\n');
		const position = Position.create(0, 10);
		const completionState = createCompletionState(document, position);
		const settings: DefaultDiagnosticSettings = { warnings: 'yes', maxLineDistance: 10, maxDiagnostics: 5 };

		const diagnostics: Diagnostic[] = [
			{
				range: new Range(0, 0, 0, 5),
				message: 'Error message',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(0, 6, 0, 10),
				message: 'Warning message',
				severity: DiagnosticSeverity.Warning
			}
		];

		const languageDiagnosticsService = accessor.get(ILanguageDiagnosticsService);
		(languageDiagnosticsService as any).setDiagnostics(Uri.parse(document.uri), diagnostics);

		const result = promptFactory.addDefaultDiagnosticBag([], undefined, completionId, completionState, settings)![0];
		assert.notStrictEqual(result, undefined);
		assert.strictEqual(result!.values.length, 2);
		assert.strictEqual(result!.values[0].severity, DiagnosticSeverity.Error);
		assert.strictEqual(result!.values[1].severity, DiagnosticSeverity.Warning);
	});

	test('should include only errors when warnings mode is "yesIfNoErrors" and errors exist', function () {
		const document = createTextDocument('file:///test.ts', 'typescript', 0, 'function foo() {}\n');
		const position = Position.create(0, 10);
		const completionState = createCompletionState(document, position);
		const settings: DefaultDiagnosticSettings = { warnings: 'yesIfNoErrors', maxLineDistance: 10, maxDiagnostics: 5 };

		const diagnostics: Diagnostic[] = [
			{
				range: new Range(0, 0, 0, 5),
				message: 'Error message',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(0, 6, 0, 10),
				message: 'Warning message',
				severity: DiagnosticSeverity.Warning
			}
		];

		const languageDiagnosticsService = accessor.get(ILanguageDiagnosticsService);
		(languageDiagnosticsService as any).setDiagnostics(Uri.parse(document.uri), diagnostics);

		const result = promptFactory.addDefaultDiagnosticBag([], undefined, completionId, completionState, settings)![0];
		assert.notStrictEqual(result, undefined);
		assert.strictEqual(result!.values.length, 1);
		assert.strictEqual(result!.values[0].severity, DiagnosticSeverity.Error);
	});

	test('should include warnings when warnings mode is "yesIfNoErrors" and no errors exist', function () {
		const document = createTextDocument('file:///test.ts', 'typescript', 0, 'function foo() {}\n');
		const position = Position.create(0, 10);
		const completionState = createCompletionState(document, position);
		const settings: DefaultDiagnosticSettings = { warnings: 'yesIfNoErrors', maxLineDistance: 10, maxDiagnostics: 5 };

		const diagnostics: Diagnostic[] = [
			{
				range: new Range(0, 0, 0, 5),
				message: 'Warning message 1',
				severity: DiagnosticSeverity.Warning
			},
			{
				range: new Range(0, 6, 0, 10),
				message: 'Warning message 2',
				severity: DiagnosticSeverity.Warning
			}
		];

		const languageDiagnosticsService = accessor.get(ILanguageDiagnosticsService);
		(languageDiagnosticsService as any).setDiagnostics(Uri.parse(document.uri), diagnostics);

		const result = promptFactory.addDefaultDiagnosticBag([], undefined, completionId, completionState, settings)![0];
		assert.notStrictEqual(result, undefined);
		assert.strictEqual(result!.values.length, 2);
		assert.strictEqual(result!.values[0].severity, DiagnosticSeverity.Warning);
		assert.strictEqual(result!.values[1].severity, DiagnosticSeverity.Warning);
	});

	test('should respect maxDiagnostics limit', function () {
		const document = createTextDocument('file:///test.ts', 'typescript', 0, 'function foo() {}\n');
		const position = Position.create(0, 10);
		const completionState = createCompletionState(document, position);
		const settings: DefaultDiagnosticSettings = { warnings: 'yes', maxLineDistance: 10, maxDiagnostics: 2 };

		const diagnostics: Diagnostic[] = [
			{
				range: new Range(0, 0, 0, 2),
				message: 'Error 1',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(0, 3, 0, 5),
				message: 'Error 2',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(0, 6, 0, 8),
				message: 'Error 3',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(0, 9, 0, 11),
				message: 'Error 4',
				severity: DiagnosticSeverity.Error
			}
		];

		const languageDiagnosticsService = accessor.get(ILanguageDiagnosticsService);
		(languageDiagnosticsService as any).setDiagnostics(Uri.parse(document.uri), diagnostics);

		const result = promptFactory.addDefaultDiagnosticBag([], undefined, completionId, completionState, settings)![0];
		assert.notStrictEqual(result, undefined);
		assert.strictEqual(result!.values.length, 2);
	});

	test('should sort diagnostics by distance from cursor position', function () {
		const document = createTextDocument('file:///test.ts', 'typescript', 0, dedent`
			line 0
			line 1
			line 2
			line 3
			line 4
			line 5
		`);
		const position = Position.create(2, 0); // At line 2
		const completionState = createCompletionState(document, position);
		const settings: DefaultDiagnosticSettings = { warnings: 'yes', maxLineDistance: 5, maxDiagnostics: 10 };

		const diagnostics: Diagnostic[] = [
			{
				range: new Range(5, 0, 5, 5), // Distance: 3
				message: 'Error at line 5',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(2, 0, 2, 5), // Distance: 0 (same line)
				message: 'Error at line 2',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(0, 0, 0, 5), // Distance: 2
				message: 'Error at line 0',
				severity: DiagnosticSeverity.Error
			},
			{
				range: new Range(3, 0, 3, 5), // Distance: 1
				message: 'Error at line 3',
				severity: DiagnosticSeverity.Error
			}
		];

		const languageDiagnosticsService = accessor.get(ILanguageDiagnosticsService);
		(languageDiagnosticsService as any).setDiagnostics(Uri.parse(document.uri), diagnostics);

		const result = promptFactory.addDefaultDiagnosticBag([], undefined, completionId, completionState, settings)![0];
		assert.notStrictEqual(result, undefined);
		assert.strictEqual(result!.values.length, 4);
		// Should be sorted by distance: 0, 1, 2, 3
		assert.strictEqual(result!.values[0].message, 'Error at line 2'); // Distance 0
		assert.strictEqual(result!.values[1].message, 'Error at line 3'); // Distance 1
		assert.strictEqual(result!.values[2].message, 'Error at line 0'); // Distance 2
		assert.strictEqual(result!.values[3].message, 'Error at line 5'); // Distance 3
	});

	test('should return undefined when all diagnostics are filtered out', function () {
		const document = createTextDocument('file:///test.ts', 'typescript', 0, 'function foo() {}\n');
		const position = Position.create(0, 10);
		const completionState = createCompletionState(document, position);
		const settings: DefaultDiagnosticSettings = { warnings: 'no', maxLineDistance: 10, maxDiagnostics: 5 };

		const diagnostics: Diagnostic[] = [
			{
				range: new Range(0, 0, 0, 5),
				message: 'Warning message',
				severity: DiagnosticSeverity.Warning
			},
			{
				range: new Range(0, 6, 0, 10),
				message: 'Info message',
				severity: DiagnosticSeverity.Information
			}
		];

		const languageDiagnosticsService = accessor.get(ILanguageDiagnosticsService);
		(languageDiagnosticsService as any).setDiagnostics(Uri.parse(document.uri), diagnostics);

		const result = promptFactory.addDefaultDiagnosticBag([], undefined, completionId, completionState, settings);
		assert.strictEqual(result, undefined);
	});

	test('should include uri and generate id in result', function () {
		const document = createTextDocument('file:///test.ts', 'typescript', 0, 'function foo() {}\n');
		const position = Position.create(0, 10);
		const completionState = createCompletionState(document, position);
		const settings: DefaultDiagnosticSettings = { warnings: 'yes', maxLineDistance: 10, maxDiagnostics: 5 };

		const diagnostics: Diagnostic[] = [
			{
				range: new Range(0, 0, 0, 5),
				message: 'Error message',
				severity: DiagnosticSeverity.Error
			}
		];

		const languageDiagnosticsService = accessor.get(ILanguageDiagnosticsService);
		(languageDiagnosticsService as any).setDiagnostics(Uri.parse(document.uri), diagnostics);

		const result = promptFactory.addDefaultDiagnosticBag([], undefined, completionId, completionState, settings)![0];
		assert.notStrictEqual(result, undefined);
		assert.strictEqual(result!.type, 'DiagnosticBag');
		assert.strictEqual(result!.uri.toString(), URI.parse(document.uri).toString());
		assert.ok(result!.id); // Should have a generated id
		assert.ok(typeof result!.id === 'string');
	});
});

class MockRecentEditsProvider extends FullRecentEditsProvider {
	testUpdateRecentEdits(docId: string, newContents: string): void {
		return this.updateRecentEdits(docId, newContents);
	}
}

export class CompletionsMutableObservableWorkspace extends MutableObservableWorkspace implements ICompletionsObservableWorkspace {
	declare _serviceBrand: undefined;
}