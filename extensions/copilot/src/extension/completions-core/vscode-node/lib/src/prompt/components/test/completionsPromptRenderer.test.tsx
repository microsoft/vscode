/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../../prompt/jsx-runtime/ */

import * as assert from 'assert';
import { CancellationTokenSource, Position } from 'vscode-languageserver-protocol';
import { ServicesAccessor } from '../../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { Chunk, PromptElementProps, PromptSnapshotNode, Text } from '../../../../../prompt/src/components/components';
import { VirtualPrompt } from '../../../../../prompt/src/components/virtualPrompt';
import { TokenizerName } from '../../../../../prompt/src/tokenization';
import { createCompletionRequestData } from '../../../test/completionsPrompt';
import { createLibTestingContext } from '../../../test/context';
import { createTextDocument } from '../../../test/textDocument';
import { CodeSnippetWithId, TraitWithId } from '../../contextProviders/contextItemSchemas';
import { CompletionsContext, StableCompletionsContext } from '../completionsContext';
import {
	CompletionsPromptRenderer,
	CompletionsPromptRenderOptions,
} from '../completionsPromptRenderer';
import { CurrentFile } from '../currentFile';

const MyNestedComponent = () => {
	return (
		<>
			<Text weight={0.5}>This goes first</Text>
			<Text weight={0.6}>This goes last</Text>
		</>
	);
};

const AnotherComponent = (props: PromptElementProps & { number: number }) => {
	return <Text>This is a number {props.number ?? 0}</Text>;
};

const renderingOptions: CompletionsPromptRenderOptions = {
	promptTokenLimit: 70,
	suffixPercent: 20,
	delimiter: '\n',
	tokenizer: TokenizerName.o200k,
	languageId: 'typescript',
};

const fullExpectedPrefix =
	'// This is a number 1\n// This goes first\n// This goes last\n// This is a number 2\n// Raw text\n// Another raw text\nconst a = 1;\nfunction f';
const fullExpectedSuffix = 'const b = 2;\nconst c = 3;';

for (const lineEnding of ['\n', '\r\n']) {
	const fileUri = 'file:///path/basename.ts';
	const source = `const a = 1;${lineEnding}function f|${lineEnding}const b = 2;${lineEnding}const c = 3;`;
	const textDocument = createTextDocument(fileUri, 'typescript', 0, source);
	const position: Position = textDocument.positionAt(textDocument.getText().indexOf('|'));
	suite(`Completions Prompt Renderer (line ending: ${JSON.stringify(lineEnding)})`, function () {
		let accessor: ServicesAccessor;
		let renderer: CompletionsPromptRenderer;
		let snapshot: PromptSnapshotNode | undefined;

		setup(async function () {
			accessor = createLibTestingContext().createTestingAccessor();
			renderer = new CompletionsPromptRenderer();
			const vPrompt = new VirtualPrompt(
				(
					<>
						<CompletionsContext>
							<AnotherComponent number={1} />
							<MyNestedComponent />
							{/* This is intentionally placed here so that it's far from the other AnotherComponent*/}
							<AnotherComponent number={2} />
							<>
								{/* This is intentionally in a fragment to check that it's skipped */}
								<Text>Raw text</Text>
							</>
							<>
								<Text>Another raw text</Text>
							</>
						</CompletionsContext>
						<CurrentFile />
					</>
				)
			);
			const pipe = vPrompt.createPipe();
			await pipe.pump(createCompletionRequestData(accessor, textDocument, position));
			({ snapshot } = vPrompt.snapshot());
		});

		test('renders prefix and suffix based on completions doc position', function () {
			const prompt = renderer.render(snapshot!, renderingOptions);

			assert.deepStrictEqual(prompt.status, 'ok');
			assert.deepStrictEqual(prompt.prefix, fullExpectedPrefix);
			assert.deepStrictEqual(prompt.prefixTokens, 43);
			assert.deepStrictEqual(prompt.suffix, fullExpectedSuffix);
			assert.deepStrictEqual(prompt.suffixTokens, 12);
			assert.deepStrictEqual(prompt.context, undefined);
		});

		test('single context with comments', function () {
			const prompt = (
				<>
					<CompletionsContext>
						<Text>This is context</Text>
					</CompletionsContext>
					<CurrentFile />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();
			const rendered = renderer.render(snapshot!, renderingOptions);

			assert.deepStrictEqual(rendered.status, 'ok');
			assert.deepStrictEqual(rendered.prefix, '// This is context\n');
			assert.deepStrictEqual(rendered.context, undefined);
		});

		test('multiple context with comments', function () {
			const prompt = (
				<>
					<CompletionsContext>
						<Text>This is context</Text>
						<Text>This is more context</Text>
					</CompletionsContext>
					<CurrentFile />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();
			const rendered = renderer.render(snapshot!, renderingOptions);

			assert.deepStrictEqual(rendered.status, 'ok');
			assert.deepStrictEqual(rendered.prefix, '// This is context\n// This is more context\n');
			assert.deepStrictEqual(rendered.context, undefined);
		});

		test('multiple context blocks', function () {
			const prompt = (
				<>
					<CompletionsContext>
						<Text>This is context</Text>
						<Text>This is more context</Text>
					</CompletionsContext>
					<CompletionsContext>
						<Text>This is other context</Text>
						<Text>This is extra context</Text>
					</CompletionsContext>
					<CurrentFile />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();
			const rendered = renderer.render(snapshot!, renderingOptions);

			assert.deepStrictEqual(rendered.status, 'ok');
			assert.deepStrictEqual(
				rendered.prefix,
				'// This is context\n// This is more context\n// This is other context\n// This is extra context\n'
			);
			assert.deepStrictEqual(rendered.context, undefined);
		});

		test('multiple types of context blocks ', function () {
			const prompt = (
				<>
					<CompletionsContext>
						<Text>This is context</Text>
						<Text>This is more context</Text>
					</CompletionsContext>
					<StableCompletionsContext>
						<Text>This is other context</Text>
						<Text>This is extra context</Text>
					</StableCompletionsContext>
					<CurrentFile />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();
			const rendered = renderer.render(snapshot!, renderingOptions);

			assert.deepStrictEqual(rendered.status, 'ok');
			assert.deepStrictEqual(
				rendered.prefix,
				'// This is context\n// This is more context\n// This is other context\n// This is extra context\n'
			);
			assert.deepStrictEqual(rendered.context, undefined);
		});

		test('renders prefix and suffix using configured delimiter', function () {
			const expectedPrefix =
				'// This is a number 1?// This goes first?// This goes last?// This is a number 2?// Raw text?// Another raw text?const a = 1;\nfunction f';

			const prompt = renderer.render(snapshot!, { ...renderingOptions, delimiter: '?' });

			assert.deepStrictEqual(prompt.status, 'ok');
			assert.deepStrictEqual(prompt.prefix, expectedPrefix);
			assert.deepStrictEqual(prompt.suffix, fullExpectedSuffix);
			assert.deepStrictEqual(prompt.prefixTokens, 43);
			assert.deepStrictEqual(prompt.suffixTokens, 12);
		});

		test('renders delimiter only if components do not already end with delimiter', function () {
			const expectedPrefix =
				'// This is a number 1text// This goes firsttext// This goes lasttext// This is a number 2text// Raw text// Another raw textconst a = 1;\nfunction f';

			const prompt = renderer.render(snapshot!, { ...renderingOptions, delimiter: 'text' });

			assert.deepStrictEqual(prompt.status, 'ok');
			assert.deepStrictEqual(prompt.prefix, expectedPrefix);
			assert.deepStrictEqual(prompt.suffix, fullExpectedSuffix);
			assert.deepStrictEqual(prompt.prefixTokens, 41);
			assert.deepStrictEqual(prompt.suffixTokens, 12);
		});

		test('uses configured tokenizer', function () {
			const prompt = renderer.render(snapshot!, {
				...renderingOptions,
				tokenizer: TokenizerName.cl100k,
			});

			assert.deepStrictEqual(prompt.status, 'ok');
			assert.deepStrictEqual(prompt.prefixTokens, 43);
			assert.deepStrictEqual(prompt.suffixTokens, 12);
		});

		test('computes metadata with stable updateDataTimeMs tolerance', function () {
			const prompt1 = renderer.render(snapshot!, renderingOptions);
			const prompt2 = renderer.render(snapshot!, renderingOptions);

			assert.deepStrictEqual(prompt1.status, 'ok');
			assert.deepStrictEqual(prompt2.status, 'ok');

			const metadata1 = prompt1.metadata;
			const metadata2 = prompt2.metadata;

			assert.deepStrictEqual(metadata1.renderId, 0);
			assert.deepStrictEqual(metadata2.renderId, 1);
			assert.ok(metadata1.renderTimeMs > 0);
			assert.ok(metadata1.elisionTimeMs > 0);
			const expectedComponents = [
				{
					componentPath: '$.f[1].CurrentFile',
				},
				{
					componentPath: '$.f[0].CompletionsContext[0].AnotherComponent[0].Text[0]',
					expectedTokens: 8,
					actualTokens: 8,
				},
				{
					componentPath: '$.f[0].CompletionsContext[1].MyNestedComponent[0].f[0].Text[0]',
					expectedTokens: 5,
					actualTokens: 5,
				},
				{
					componentPath: '$.f[0].CompletionsContext[1].MyNestedComponent[0].f[1].Text[0]',
					expectedTokens: 5,
					actualTokens: 5,
				},
				{
					componentPath: '$.f[0].CompletionsContext[2].AnotherComponent[0].Text[0]',
					expectedTokens: 8,
					actualTokens: 8,
				},
				{
					componentPath: '$.f[0].CompletionsContext[3].f[0].Text[0]',
					expectedTokens: 4,
					actualTokens: 4,
				},
				{
					componentPath: '$.f[0].CompletionsContext[4].f[0].Text[0]',
					expectedTokens: 5,
					actualTokens: 5,
				},
				{
					componentPath: '$.f[1].CurrentFile[0].f[0].BeforeCursor[0].Text[0]',
					expectedTokens: 8,
					actualTokens: 8,
				},
				{
					componentPath: '$.f[1].CurrentFile[0].f[1].AfterCursor[0].Text[0]',
					expectedTokens: 12,
					actualTokens: 12,
				},
			];

			expectedComponents.forEach(expected => {
				const actual = metadata1.componentStatistics.find(s => s.componentPath === expected.componentPath);
				assert.ok(actual, `Component ${expected.componentPath} not found`);
				assert.strictEqual(
					actual.expectedTokens,
					expected.expectedTokens,
					`Expected tokens for ${expected.componentPath} do not match`
				);
				assert.strictEqual(actual.actualTokens, expected.actualTokens);
				// Instead of a fixed number, just ensure updateDataTimeMs is a non-negative number.
				if (actual.updateDataTimeMs) {
					assert.ok(
						typeof actual.updateDataTimeMs === 'number' && actual.updateDataTimeMs >= 0,
						`Expected updateDataTimeMs for ${expected.componentPath} to be a non-negative number`
					);
				}
			});
		});

		test('computes usage statistics ignoring updateDataTimeMs field', function () {
			const rendered = renderer.render(snapshot!, renderingOptions);
			assert.deepStrictEqual(rendered.status, 'ok');
			const metadata = rendered.metadata;
			// Make updateDataTimeMs a constant value to ensure it doesn't affect the test.
			const actualStatsFiltered = metadata.componentStatistics.map(stats => {
				if (stats.updateDataTimeMs) {
					stats.updateDataTimeMs = 42;
				}
				return stats;
			});
			const expectedStatsFiltered = [
				{
					componentPath: '$.f[1].CurrentFile',
					updateDataTimeMs: 42,
				},
				{
					componentPath: '$.f[0].CompletionsContext[0].AnotherComponent[0].Text[0]',
					expectedTokens: 8,
					actualTokens: 8,
				},
				{
					componentPath: '$.f[0].CompletionsContext[1].MyNestedComponent[0].f[0].Text[0]',
					expectedTokens: 5,
					actualTokens: 5,
				},
				{
					componentPath: '$.f[0].CompletionsContext[1].MyNestedComponent[0].f[1].Text[0]',
					expectedTokens: 5,
					actualTokens: 5,
				},
				{
					componentPath: '$.f[0].CompletionsContext[2].AnotherComponent[0].Text[0]',
					expectedTokens: 8,
					actualTokens: 8,
				},
				{
					componentPath: '$.f[0].CompletionsContext[3].f[0].Text[0]',
					expectedTokens: 4,
					actualTokens: 4,
				},
				{
					componentPath: '$.f[0].CompletionsContext[4].f[0].Text[0]',
					expectedTokens: 5,
					actualTokens: 5,
				},
				{
					componentPath: '$.f[1].CurrentFile[0].f[0].BeforeCursor[0].Text[0]',
					expectedTokens: 8,
					actualTokens: 8,
				},
				{
					componentPath: '$.f[1].CurrentFile[0].f[1].AfterCursor[0].Text[0]',
					expectedTokens: 12,
					actualTokens: 12,
				},
			];
			assert.deepStrictEqual(actualStatsFiltered, expectedStatsFiltered);
		});

		test('propagates source via statistics', function () {
			const trait: TraitWithId = {
				name: 'trait',
				value: 'value',
				id: 'traitid',
				type: 'Trait',
			};
			const codeSnippet: CodeSnippetWithId = {
				uri: 'file://foo.ts',
				value: 'value',
				id: 'traitid',
				type: 'CodeSnippet',
			};
			const prompt = (
				<>
					<CompletionsContext>
						<Text source={trait}>This is a trait</Text>
						<Chunk source={codeSnippet}>
							<Text>This is a code snippet</Text>
						</Chunk>
					</CompletionsContext>
					<CurrentFile />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();

			const renderedPrompt = renderer.render(snapshot!, renderingOptions);
			assert.deepStrictEqual(renderedPrompt.status, 'ok');
			assert.ok(renderedPrompt.metadata.componentStatistics.find(s => s.source === trait));
			assert.ok(renderedPrompt.metadata.componentStatistics.find(s => s.source === codeSnippet));
		});

		test('elides prefix', function () {
			const prompt = renderer.render(snapshot!, {
				...renderingOptions,
				promptTokenLimit: 20,
				suffixPercent: 0,
			});

			assert.deepStrictEqual(prompt.status, 'ok');
			assert.deepStrictEqual(prompt.prefix, '// Raw text\n// Another raw text\nconst a = 1;\nfunction f');
			assert.deepStrictEqual(prompt.suffix, '');
		});

		test('elides suffix (from the end!)', function () {
			const prompt = renderer.render(snapshot!, {
				...renderingOptions,
				promptTokenLimit: 30,
				suffixPercent: 10,
			});

			assert.deepStrictEqual(prompt.status, 'ok');
			assert.deepStrictEqual(prompt.suffix, 'const b =');
		});

		test('elides both prefix and suffix partially', function () {
			// Use tighter token limits to force partial elision on both sides.
			const prompt = renderer.render(snapshot!, {
				...renderingOptions,
				promptTokenLimit: 20,
				suffixPercent: 10,
			});
			// We don't have the exact expected strings, but we verify that both prefix and suffix
			// have been elided compared to the full expectations.
			assert.strictEqual(prompt.status, 'ok');
			// The elided prefix should be shorter than the full expected one.
			assert.ok(prompt.prefix.length < fullExpectedPrefix.length, 'Expected prefix to be elided');
			// The elided suffix should also be shorter than the full expected suffix, if any elision took place.
			if (fullExpectedSuffix.length > 0) {
				assert.ok(prompt.suffix.length < fullExpectedSuffix.length, 'Expected suffix to be elided');
			}
		});

		test('generates prompt metadata', function () {
			const rendered = renderer.render(snapshot!, renderingOptions);
			assert.deepStrictEqual(rendered.status, 'ok');
			const metadata = rendered.metadata;
			assert.ok(metadata.renderId === 0);
			assert.ok(metadata.elisionTimeMs > 0);
			assert.ok(metadata.renderTimeMs > 0);
			assert.ok(metadata.updateDataTimeMs > 0);
			assert.deepStrictEqual(metadata.tokenizer, TokenizerName.o200k);
		});

		test('computes usage statistics after elision', function () {
			const rendered = renderer.render(snapshot!, {
				...renderingOptions,
				promptTokenLimit: 40,
				suffixPercent: 10,
			});
			assert.deepStrictEqual(rendered.status, 'ok');
			const metadata = rendered.metadata;
			const actualStatsFiltered = metadata.componentStatistics.map(stats => {
				if (stats.updateDataTimeMs) {
					stats.updateDataTimeMs = 42;
				}
				return stats;
			});
			assert.deepStrictEqual(
				actualStatsFiltered.reduce((acc, curr) => acc + (curr.actualTokens ?? 0), 0),
				34
			);
			assert.deepStrictEqual(actualStatsFiltered, [
				{
					componentPath: '$.f[1].CurrentFile',
					updateDataTimeMs: 42,
				},
				{
					componentPath: '$.f[0].CompletionsContext[0].AnotherComponent[0].Text[0]',
					expectedTokens: 8,
					actualTokens: 0,
				},
				{
					componentPath: '$.f[0].CompletionsContext[1].MyNestedComponent[0].f[0].Text[0]',
					expectedTokens: 5,
					actualTokens: 5,
				},
				{
					componentPath: '$.f[0].CompletionsContext[1].MyNestedComponent[0].f[1].Text[0]',
					expectedTokens: 5,
					actualTokens: 0,
				},
				{
					componentPath: '$.f[0].CompletionsContext[2].AnotherComponent[0].Text[0]',
					expectedTokens: 8,
					actualTokens: 8,
				},
				{
					componentPath: '$.f[0].CompletionsContext[3].f[0].Text[0]',
					expectedTokens: 4,
					actualTokens: 4,
				},
				{
					componentPath: '$.f[0].CompletionsContext[4].f[0].Text[0]',
					expectedTokens: 5,
					actualTokens: 5,
				},
				{
					componentPath: '$.f[1].CurrentFile[0].f[0].BeforeCursor[0].Text[0]',
					expectedTokens: 8,
					actualTokens: 8,
				},
				{
					componentPath: '$.f[1].CurrentFile[0].f[1].AfterCursor[0].Text[0]',
					expectedTokens: 12,
					actualTokens: 4,
				},
			]);
		});

		function createStringWithNLines(n: number, baseText: string): string {
			let result = '';
			for (let i = 1; i <= n; i++) {
				result += `${baseText}${i}\n`;
			}
			return result;
		}

		test('uses cached suffix if similar enough', async function () {
			const firstSuffix = createStringWithNLines(15, 'a') + createStringWithNLines(10, 'b');
			const secondSuffix = createStringWithNLines(15, 'a') + createStringWithNLines(10, 'c');
			const renderOptionsWithSuffix: CompletionsPromptRenderOptions = {
				...renderingOptions,
				promptTokenLimit: 205,
				suffixPercent: 50,
			};
			const textDocumentWithFirstSuffix = createTextDocument(
				fileUri,
				'typescript',
				0,
				'function f|\n' + firstSuffix
			);
			const position = textDocumentWithFirstSuffix.positionAt(textDocumentWithFirstSuffix.getText().indexOf('|'));
			const prompt = (
				<>
					<CurrentFile />
				</>
			);
			const virtualPrompt = new VirtualPrompt(prompt);
			const pipe = virtualPrompt.createPipe();
			await pipe.pump(createCompletionRequestData(accessor, textDocumentWithFirstSuffix, position));
			// Snapshot caches the suffix
			virtualPrompt.snapshot();

			// The position is the same, since the start of the document doesn't change
			const textDocumentWithSecondSuffix = createTextDocument(
				fileUri,
				'typescript',
				1,
				'function f|\n' + secondSuffix
			);
			await pipe.pump(createCompletionRequestData(accessor, textDocumentWithSecondSuffix, position));
			const { snapshot: snapshotWithDefaultThreshold } = virtualPrompt.snapshot();

			// the first suffix is used, since they are similar enough
			const renderedWithDefaultThreshold = renderer.render(
				snapshotWithDefaultThreshold!,
				renderOptionsWithSuffix
			);
			assert.deepStrictEqual(renderedWithDefaultThreshold.status, 'ok');
			assert.deepStrictEqual(renderedWithDefaultThreshold.suffix, firstSuffix);

			await pipe.pump(
				createCompletionRequestData(
					accessor,
					textDocumentWithSecondSuffix,
					position,
					undefined,
					undefined,
					undefined,
					3
				)
			);
			const { snapshot: snapshotWithLowerThreshold } = virtualPrompt.snapshot();

			// The second suffix is used, since the matching threshold is lower
			const renderedWithLowerThreshold = renderer.render(snapshotWithLowerThreshold!, renderOptionsWithSuffix);
			assert.deepStrictEqual(renderedWithLowerThreshold.status, 'ok');
			assert.deepStrictEqual(renderedWithLowerThreshold.suffix, secondSuffix);
		});

		test('does not use cached suffix if not similar enough', async function () {
			const firstSuffix = createStringWithNLines(15, 'a') + createStringWithNLines(10, 'b');
			const secondSuffix = createStringWithNLines(3, 'a') + createStringWithNLines(22, 'c');
			const renderOptionsWithSuffix: CompletionsPromptRenderOptions = {
				...renderingOptions,
				promptTokenLimit: 205,
				suffixPercent: 50,
			};
			const textDocumentWithFirstSuffix = createTextDocument(
				fileUri,
				'typescript',
				0,
				'function f|\n' + firstSuffix
			);
			const position = textDocumentWithFirstSuffix.positionAt(textDocumentWithFirstSuffix.getText().indexOf('|'));
			const prompt = (
				<>
					<CurrentFile />
				</>
			);
			const virtualPrompt = new VirtualPrompt(prompt);
			const pipe = virtualPrompt.createPipe();
			await pipe.pump(createCompletionRequestData(accessor, textDocumentWithFirstSuffix, position));
			// Snapshot caches the suffix
			virtualPrompt.snapshot();

			// The position is the same, since the start of the document doesn't change
			const textDocumentWithSecondSuffix = createTextDocument(
				fileUri,
				'typescript',
				1,
				'function f|\n' + secondSuffix
			);
			await pipe.pump(createCompletionRequestData(accessor, textDocumentWithSecondSuffix, position));
			const { snapshot } = virtualPrompt.snapshot();

			// the second suffix is used, since they are not similar enough
			const rendered = renderer.render(snapshot!, renderOptionsWithSuffix);
			assert.deepStrictEqual(rendered.status, 'ok');
			assert.deepStrictEqual(rendered.suffix, secondSuffix);
		});

		// captures a test for https://github.com/microsoft/vscode/issues/295450
		test('does not use cached suffix when first token changes due to content shifting to prefix', async function () {
			// Simulates the scenario where user is typing inside a JSDoc comment block.
			// Initially the cursor is on a blank line before a `/**` comment, so the suffix
			// starts with `/**`. After the user types inside the comment, the `/**` moves to
			// the prefix and the suffix should start with `*` (comment continuation), not `/**`.
			const renderOptionsWithSuffix: CompletionsPromptRenderOptions = {
				...renderingOptions,
				promptTokenLimit: 2000,
				suffixPercent: 50,
			};

			// Build a long enough suffix so the ~3 token edit distance at the start
			// falls below the 10% threshold (need 30+ tokens total).
			const longBody = new Array(20).fill(0).map((_, i) => `export function helper${i}(x: number): number { return x + ${i}; }`).join('\n');

			// Step 1: cursor on blank line before the JSDoc comment
			const firstDoc = createTextDocument(
				fileUri,
				'typescript',
				0,
				`function min() { }\n|\n/**\n * Last batch may not match batch size.\n */\n${longBody}`
			);
			const firstPosition = firstDoc.positionAt(firstDoc.getText().indexOf('|'));
			const prompt = (
				<>
					<CurrentFile />
				</>
			);
			const virtualPrompt = new VirtualPrompt(prompt);
			const pipe = virtualPrompt.createPipe();
			await pipe.pump(createCompletionRequestData(accessor, firstDoc, firstPosition));
			// Snapshot caches the suffix (starts with `/**`)
			virtualPrompt.snapshot();

			// Step 2: user typed `/**\n * B` — cursor is now inside the comment block
			// The `/**` is now part of the prefix, and the suffix should NOT start with `/**`
			const secondDoc = createTextDocument(
				fileUri,
				'typescript',
				1,
				`function min() { }\n\n/**\n * B|\n * Last batch may not match batch size.\n */\n${longBody}`
			);
			const secondPosition = secondDoc.positionAt(secondDoc.getText().indexOf('|'));
			await pipe.pump(createCompletionRequestData(accessor, secondDoc, secondPosition));
			const { snapshot } = virtualPrompt.snapshot();

			const rendered = renderer.render(snapshot!, renderOptionsWithSuffix);
			assert.deepStrictEqual(rendered.status, 'ok');
			// The suffix must NOT start with `/**` — that content is now in the prefix
			assert.ok(!rendered.suffix.startsWith('/**'), `Suffix should not start with "/**" but got: "${rendered.suffix.slice(0, 80)}..."`);
			assert.ok(rendered.suffix.startsWith('* Last batch'), `Suffix should start with "* Last batch" but got: "${rendered.suffix.slice(0, 80)}..."`);
		});

		test('suffix can be empty', async function () {
			const textDocumentWithoutSuffix = createTextDocument(fileUri, 'typescript', 0, 'function f|');
			const position = textDocumentWithoutSuffix.positionAt(textDocumentWithoutSuffix.getText().indexOf('|'));
			const prompt = (
				<>
					<CurrentFile />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const pipe = virtualPrompt.createPipe();
			await pipe.pump(createCompletionRequestData(accessor, textDocumentWithoutSuffix, position));
			const { snapshot } = virtualPrompt.snapshot();
			const promptWithoutSuffix = renderer.render(snapshot!, renderingOptions);

			assert.deepStrictEqual(promptWithoutSuffix.status, 'ok');
			assert.deepStrictEqual(promptWithoutSuffix.suffix, '');
			assert.deepStrictEqual(promptWithoutSuffix.prefix, 'function f');
		});

		test('prefix can be empty', async function () {
			const emptyTextDocument = createTextDocument(fileUri, 'typescript', 0, '|\nconst b = 2;');
			const position = emptyTextDocument.positionAt(emptyTextDocument.getText().indexOf('|'));
			const prompt = (
				<>
					<CurrentFile />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const pipe = virtualPrompt.createPipe();
			await pipe.pump(createCompletionRequestData(accessor, emptyTextDocument, position));
			const { snapshot } = virtualPrompt.snapshot();
			const emptyPrompt = renderer.render(snapshot!, renderingOptions);

			assert.deepStrictEqual(emptyPrompt.status, 'ok');
			assert.deepStrictEqual(emptyPrompt.prefix, '');
			assert.deepStrictEqual(emptyPrompt.suffix, 'const b = 2;');
		});

		test('prefix and suffix can be empty', async function () {
			const emptyTextDocument = createTextDocument(fileUri, 'typescript', 0, '');
			const position = emptyTextDocument.positionAt(0);
			const prompt = (
				<>
					<CurrentFile />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const pipe = virtualPrompt.createPipe();
			await pipe.pump(createCompletionRequestData(accessor, emptyTextDocument, position));
			const { snapshot } = virtualPrompt.snapshot();
			const emptyPrompt = renderer.render(snapshot!, renderingOptions);

			assert.deepStrictEqual(emptyPrompt.status, 'ok');
			assert.deepStrictEqual(emptyPrompt.prefix, '');
			assert.deepStrictEqual(emptyPrompt.suffix, '');
		});

		test('cancels rendering when token has been cancelled', function () {
			const cts = new CancellationTokenSource();

			cts.cancel();
			const prompt = renderer.render(snapshot!, renderingOptions, cts.token);

			assert.deepStrictEqual(prompt.status, 'cancelled');
		});

		test('throws error when tree does not contain completions document component', function () {
			const promptCompletionsDocument = (
				<>
					<Text>Whatever</Text>
				</>
			);

			const virtualPrompt = new VirtualPrompt(promptCompletionsDocument);
			const { snapshot } = virtualPrompt.snapshot();
			const prompt = renderer.render(snapshot!, renderingOptions);

			assert.strictEqual(prompt.status, 'error');
			assert.strictEqual(prompt.error.message, `Node of type ${CurrentFile.name} not found`);
		});

		test('renders empty prefix and suffix if no data is sent', function () {
			const prompt = (
				<>
					<CurrentFile />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();
			const emptyPrompt = renderer.render(snapshot!, renderingOptions);

			assert.deepStrictEqual(emptyPrompt.status, 'ok');
			assert.deepStrictEqual(emptyPrompt.prefix, '');
			assert.deepStrictEqual(emptyPrompt.suffix, '');
		});

		test('does not re-render if no data matching the expected structure is sent', async function () {
			const textDocument = createTextDocument(
				fileUri,
				'typescript',
				0,
				`import * from './foo.ts'\n|\nfunction f`
			);
			const position = textDocument.positionAt(textDocument.getText().indexOf('|'));
			const prompt = (
				<>
					<CurrentFile />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const pipe = virtualPrompt.createPipe();

			// First render
			await pipe.pump(createCompletionRequestData(accessor, textDocument, position));
			const { snapshot } = virtualPrompt.snapshot();
			const renderedPrompt = renderer.render(snapshot!, renderingOptions);

			// Second render
			const { snapshot: snapshotTwo } = virtualPrompt.snapshot();
			const renderedPromptTwo = renderer.render(snapshotTwo!, renderingOptions);

			assert.deepStrictEqual(renderedPrompt.status, 'ok');
			assert.deepStrictEqual(renderedPromptTwo.status, 'ok');
			assert.deepStrictEqual(renderedPrompt.prefix, `import * from './foo.ts'\n`);
			assert.deepStrictEqual(renderedPrompt.prefix, renderedPromptTwo.prefix);
			assert.deepStrictEqual(renderedPrompt.suffix, 'function f');
			assert.deepStrictEqual(renderedPrompt.suffix, renderedPromptTwo.suffix);
		});

		test('re-renders if new data matching the expected structure is sent', async function () {
			const textDocument = createTextDocument(
				fileUri,
				'typescript',
				0,
				`import * from './foo.ts'\n|\nfunction f`
			);
			const position = textDocument.positionAt(textDocument.getText().indexOf('|'));
			const prompt = (
				<>
					<CurrentFile />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const pipe = virtualPrompt.createPipe();

			// First render
			await pipe.pump(createCompletionRequestData(accessor, textDocument, position));
			const { snapshot } = virtualPrompt.snapshot();
			const renderedPrompt = renderer.render(snapshot!, renderingOptions);

			// Second render
			const updatedTextDocument = createTextDocument(
				fileUri,
				'typescript',
				1, // Notice version change
				`import * from './bar.ts'\n|\nfunction g`
			);
			const updatedPosition = updatedTextDocument.positionAt(updatedTextDocument.getText().indexOf('|'));

			await pipe.pump(createCompletionRequestData(accessor, updatedTextDocument, updatedPosition));
			const { snapshot: snapshotTwo } = virtualPrompt.snapshot();
			const renderedPromptTwo = renderer.render(snapshotTwo!, renderingOptions);

			assert.deepStrictEqual(renderedPrompt.status, 'ok');
			assert.deepStrictEqual(renderedPromptTwo.status, 'ok');
			assert.deepStrictEqual(renderedPrompt.prefix, `import * from './foo.ts'\n`);
			assert.deepStrictEqual(renderedPromptTwo.prefix, `import * from './bar.ts'\n`);
			assert.deepStrictEqual(renderedPrompt.suffix, 'function f');
			assert.deepStrictEqual(renderedPromptTwo.suffix, 'function g');
		});

		test('Elides Chunk completely', function () {
			const prompt = (
				<>
					<CompletionsContext>
						<Chunk weight={0.5}>
							<Text>Chunk Text 1</Text>
							<Text>Chunk Text 2</Text>
						</Chunk>
						<Text>Outside Text</Text>
					</CompletionsContext>
					<CurrentFile weight={0.9} />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();

			const renderedPrompt = renderer.render(snapshot!, {
				...renderingOptions,
				promptTokenLimit: 10,
				suffixPercent: 0,
			});

			assert.deepStrictEqual(renderedPrompt.status, 'ok');
			assert.deepStrictEqual(renderedPrompt.prefix, '// Outside Text\n');
			assert.deepStrictEqual(renderedPrompt.suffix, '');
		});

		test('Elides Chunk completely while respecting lower weights', function () {
			const prompt = (
				<>
					<CompletionsContext>
						<Text weight={0.7}>Outside Text 1</Text>
						<Chunk weight={0.5}>
							<Text>Chunk Text 1</Text>
							<Text>Chunk Text 2</Text>
						</Chunk>
						<Text weight={0.7}>Outside Text 2</Text>
					</CompletionsContext>
					<CurrentFile weight={0.9} />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();

			const renderedPrompt = renderer.render(snapshot!, {
				...renderingOptions,
				promptTokenLimit: 16,
				suffixPercent: 0,
			});

			assert.deepStrictEqual(renderedPrompt.status, 'ok');
			assert.deepStrictEqual(renderedPrompt.prefix, '// Outside Text 1\n// Outside Text 2\n');
			assert.deepStrictEqual(renderedPrompt.suffix, '');
		});

		test('Elides Chunk completely in case of exceeding the limit even with higher weight', function () {
			const prompt = (
				<>
					<CompletionsContext>
						<Text weight={0.5}>Outside Text 1</Text>
						<Chunk weight={0.7}>
							<Text>Chunk Text 1</Text>
							<Text>Chunk Text 2</Text>
						</Chunk>
						<Text weight={0.8}>Outside Text 2</Text>
					</CompletionsContext>
					<CurrentFile weight={0.9} />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();

			const renderedPrompt = renderer.render(snapshot!, {
				...renderingOptions,
				promptTokenLimit: 14,
				suffixPercent: 0,
			});

			assert.deepStrictEqual(renderedPrompt.status, 'ok');
			assert.deepStrictEqual(renderedPrompt.prefix, '// Outside Text 1\n// Outside Text 2\n');
			assert.deepStrictEqual(renderedPrompt.suffix, '');
		});

		test('Prefers higher weighted Chunk over lower weighted separate components', function () {
			const prompt = (
				<>
					<CompletionsContext>
						<Text weight={0.7}>Outside Text 1</Text>
						<Chunk weight={0.8}>
							<Text>Chunk Text 1</Text>
							<Text>Chunk Text 2</Text>
						</Chunk>
						<Text weight={0.7}>Outside Text 2</Text>
					</CompletionsContext>
					<CurrentFile weight={0.9} />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();

			const renderedPrompt = renderer.render(snapshot!, {
				...renderingOptions,
				promptTokenLimit: 14,
				suffixPercent: 0,
			});

			assert.deepStrictEqual(renderedPrompt.status, 'ok');
			assert.deepStrictEqual(renderedPrompt.prefix, '// Chunk Text 1\n// Chunk Text 2\n');
			assert.deepStrictEqual(renderedPrompt.suffix, '');
		});

		test('If a nested chunk is elided first, the outer chunks is kept', function () {
			const prompt = (
				<>
					<CompletionsContext>
						<Text weight={0.7}>Outside Text 1</Text>
						<Chunk weight={0.5}>
							<Text>Chunk Text 1</Text>
							<Chunk weight={0.5}>
								<Text>Nested Chunk Text 1</Text>
								<Text>Nested Chunk Text 2</Text>
							</Chunk>
							<Text>Chunk Text 2</Text>
						</Chunk>
						<Text weight={0.7}>Outside Text 2</Text>
					</CompletionsContext>
					<CurrentFile weight={0.9} />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();

			const renderedPrompt = renderer.render(snapshot!, {
				...renderingOptions,
				promptTokenLimit: 35,
				suffixPercent: 0,
			});

			assert.deepStrictEqual(renderedPrompt.status, 'ok');
			assert.deepStrictEqual(
				renderedPrompt.prefix,
				'// Outside Text 1\n// Chunk Text 1\n// Chunk Text 2\n// Outside Text 2\n'
			);
			assert.deepStrictEqual(renderedPrompt.suffix, '');
		});

		test('If the outer chunk is elided first, the inner chunk is also elided', function () {
			const prompt = (
				<>
					<CompletionsContext>
						<Text weight={0.7}>Outside Text 1</Text>
						<Chunk weight={0.5}>
							<Text weight={0.5}>Chunk Text 1</Text>
							<Chunk>
								<Text>Nested Chunk Text 1</Text>
								<Text>Nested Chunk Text 2</Text>
							</Chunk>
							<Text>Chunk Text 2</Text>
						</Chunk>
						<Text weight={0.7}>Outside Text 2</Text>
					</CompletionsContext>
					<CurrentFile weight={0.9} />
				</>
			);

			const virtualPrompt = new VirtualPrompt(prompt);
			const { snapshot } = virtualPrompt.snapshot();

			const renderedPrompt = renderer.render(snapshot!, {
				...renderingOptions,
				promptTokenLimit: 37,
				suffixPercent: 0,
			});

			assert.deepStrictEqual(renderedPrompt.status, 'ok');
			assert.deepStrictEqual(renderedPrompt.prefix, '// Outside Text 1\n// Outside Text 2\n');
			assert.deepStrictEqual(renderedPrompt.suffix, '');
		});
	});
}
