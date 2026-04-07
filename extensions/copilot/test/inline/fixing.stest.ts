/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Intent } from '../../src/extension/common/constants';
import '../../src/extension/intents/node/allIntents';
import { ssuite, stest } from '../base/stest';
import { KnownDiagnosticProviders } from '../simulation/diagnosticProviders';
import { forInlineAndInlineChatIntent, simulateInlineChatWithStrategy } from '../simulation/inlineChatSimulator';
import { assertLessDiagnosticsAsync, assertNoDiagnosticsAsync, getWorkspaceDiagnostics } from '../simulation/outcomeValidators';
import { assertConversationalOutcome, assertInlineEdit, assertNoOccurrence, assertOccursOnce, fromFixture, toFile } from '../simulation/stestUtil';


forInlineAndInlineChatIntent((strategy, nonExtensionConfigurations, suffix) => {

	ssuite({ title: `fix${suffix}`, subtitle: 'ruff', location: 'inline' }, () => {
		stest({ description: `Ruff(E231) Missing whitespace after ':'`, language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/ruff/ruff_error_E231.py')],
				queries: [
					{
						file: 'ruff_error_E231.py',
						selection: [5, 1, 5, 10],
						query: [
							`/fix Missing whitespace after ':'`,
							`To fix the problem.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'ruff',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'ruff')
					}
				]
			});
		});
	});

	ssuite({ title: `fix${suffix}`, subtitle: 'TSC', location: 'inline' }, () => {
		stest({ description: 'Error 2322 - type undefined is not assignable to type', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2322.ts')],
				queries: [
					{
						file: 'tsc_error_2322.ts',
						selection: [37, 10, 37, 10],
						query: [
							`/fix Type 'RangeMapping[] | undefined' is not assignable to type 'RangeMapping[]'. `,
							`  Type 'undefined' is not assignable to type 'RangeMapping[]'.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: '22222 Error 2322 - type undefined is not assignable to type', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2322.ts')],
				queries: [
					{
						file: 'tsc_error_2322.ts',
						selection: [37, 10, 37, 10],
						query: [
							`/fix Type 'RangeMapping[] | undefined' is not assignable to type 'RangeMapping[]'. `,
							`  Type 'undefined' is not assignable to type 'RangeMapping[]'.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 1015 - parameter cannot have question mark and initializer, with corresponding diagnostics', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_1015.ts')],
				queries: [
					{
						file: 'tsc_error_1015.ts',
						selection: [0, 24, 0, 24],
						query: `/fix Parameter cannot have question mark and initializer.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 1015 - parameter cannot have question mark and initializer, without corresponding diagnostics', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_1015.ts')],
				queries: [
					{
						file: 'tsc_error_1015.ts',
						selection: [0, 24, 0, 24],
						query: `/fix Parameter cannot have question mark and initializer.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 2420 - incorrect interface implementation', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('fixing/typescript/tsc_error_2420/file0.ts'),
					fromFixture('fixing/typescript/tsc_error_2420/file1.ts')
				],
				queries: [
					{
						file: 'file0.ts',
						selection: [2, 6, 2, 6],
						query: [
							`/fix Class 'Far' incorrectly implements interface 'IFar'.`,
							`  Property 'foo' is missing in type 'Far' but required in type 'IFar'.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 2420 - incorrect interface implementation, with related information', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('fixing/typescript/tsc_error_2420/file0.ts'),
					fromFixture('fixing/typescript/tsc_error_2420/file1.ts')
				],
				queries: [
					{
						file: 'file0.ts',
						selection: [2, 6, 9, 1],
						query: [
							`/fix Class 'Far' incorrectly implements interface 'IFar'.`,
							`  Property 'foo' is missing in type 'Far' but required in type 'IFar'.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 2391 - function implementation is missing or not immediately following the declaration', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2391.ts')],
				queries: [
					{
						file: 'tsc_error_2391.ts',
						selection: [6, 4, 6, 13],
						query: [
							`/fix Function implementation is missing or not immediately following the declaration.`,
							`'function1', which lacks return-type annotation, implicitly has an 'any' return type.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 2454 - variable is used before being assigned', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2454.ts')],
				queries: [
					{
						file: 'tsc_error_2454.ts',
						selection: [21, 6, 21, 24],
						query: `/fix Variable 'telemetryEventName' is used before being assigned.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 2339 - property does not exist on type 1', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2339_1.ts')],
				queries: [
					{
						file: 'tsc_error_2339_1.ts',
						selection: [16, 21, 16, 29],
						query: `/fix Property 'response' does not exist on type 'DocContext'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 2554 - expected m arguments, but got n.', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2554.ts')],
				queries: [
					{
						file: 'tsc_error_2554.ts',
						selection: [8, 7, 8, 21],
						query: `/fix Expected 1 arguments, but got 0.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 2341 - property is private and only accessible within class', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2341.ts')],
				queries: [
					{
						file: 'tsc_error_2341.ts',
						selection: [7, 8, 7, 10],
						query: `/fix Property 'hi' is private and only accessible within class 'Bar'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 2355 - a function whose declared type is neither undefined, void, nor any must return a value.', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2355.ts')],
				queries: [
					{
						file: 'tsc_error_2355.ts',
						selection: [2, 37, 2, 44],
						query: `/fix A function whose declared type is neither 'undefined', 'void', nor 'any' must return a value.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		// Inspired by case 55 in /fix dataset version 10
		// The fix in nice_egg_479lg7cb9q was too big, it was not a minimal change, and it was incorrect
		stest({ description: 'Error 2339 - (AML-10-55) property does not exist on type 2', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2339_2.ts')],
				queries: [
					{
						file: 'tsc_error_2339_2.ts',
						selection: [5, 8, 5, 8],
						query: `/fix Property 'send' does not exist on type 'AutoUpdater'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		// Inspired by case 98 in /fix dataset version 10
		// Copilot proposed an incorrect fix, it should have added an additional method, instead it added a catch statement
		stest({ description: 'Error 2339 - (AML-10-98) property does not exist on type 3', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2339_3.ts')],
				queries: [
					{
						file: 'tsc_error_2339_3.ts',
						selection: [65, 11, 65, 11],
						query: `/fix Property 'send' does not exist on type 'IpcRendererWithCommands'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});


		// Add a missing impor at the right place
		stest({ description: 'Error 2304 - can not find name', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('fixing/typescript/tsc_error_2304/file0.ts'),
					fromFixture('fixing/typescript/tsc_error_2304/file1.ts')
				],
				queries: [
					{
						file: 'file0.ts',
						selection: [10, 26, 10, 26],
						query: `/fix Cannot find name 'readFileSync'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => {
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							if (outcome.type === 'inlineEdit') {
								const indexOfFsImport = outcome.fileContents.indexOf(`import { readFileSync } from 'fs';`);
								assert.ok(indexOfFsImport >= 0, 'contains readFileSync import');
								const indexOfDeclare = outcome.fileContents.indexOf(`declare function`);
								assert.ok(indexOfFsImport < indexOfDeclare, 'is before declare function');
							}
						}
					}
				]
			});
		});

		stest({ description: 'Error 2304 - (AML-10-14) can not find module', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2304_1.ts')],
				queries: [
					{
						file: 'tsc_error_2304_1.ts',
						selection: [25, 1, 25, 1],
						query: `/fix Cannot find name 'expect'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => {
							assert.strictEqual(outcome.type, 'inlineEdit');
							const diagnostics = await getWorkspaceDiagnostics(accessor, workspace, 'tsc');
							const filtered = diagnostics.filter(d => d.code !== 2307 && d.code !== 2305); // filter module not found, module has not exported member
							assert.equal(filtered.length, 0, 'only module not found diagnostics');
						}
					}
				]
			});
		});

		stest({ description: 'Error 2307 - can not find module', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2307_can_not_find_module.ts')],
				queries: [
					{
						file: 'tsc_error_2307_can_not_find_module.ts',
						selection: [0, 25, 0, 40],
						query: [
							`/fix Cannot find module '@angular/core' or its corresponding type declarations..`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => {
							assertConversationalOutcome(outcome);
							const match = outcome.chatResponseMarkdown.match(/```(ps|bash)[.\n\r]*npm install.*@angular\/core/);
							assert.ok(match, 'contains npm install @angular/core');
						}
					}
				]
			});
		});

		// Inspired by case 64 of /fix dataset version 10
		// The fix was not correct, it just added a new line and did not resolve the error
		stest({ description: 'Error 18047 - (AML-10-64) possibly null', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_18047.ts')],
				queries: [
					{
						file: 'tsc_error_18047.ts',
						selection: [4, 4, 4, 4],
						query: `/fix 'measurementSpan' is possibly 'null'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		// Inspired by case 23 of /fix dataset version 10
		stest({ description: 'Error 7006 - (AML-10-23) implicitly has any type', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_7006.ts')],
				queries: [
					{
						file: 'tsc_error_7006.ts',
						selection: [1, 53, 1, 53],
						query: `/fix Parameter 'data' implicitly has an 'any' type.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		// Inspired by case 1 of /fix dataset version 8
		stest({ description: 'Error 18047 - (AML-8-1) property does not exist on type window', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2339_4.ts')],
				queries: [
					{
						file: 'tsc_error_2339_4.ts',
						selection: [1, 12, 1, 12],
						query: `/fix Property 'lx' does not exist on type 'Window & typeof globalThis'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		// Inspired by case 86 of /fix dataset version 10
		stest({ description: 'Error 18048 - (AML-10-86) possibly undefined', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_18048.ts')],
				queries: [
					{
						file: 'tsc_error_18048.ts',
						selection: [3, 20, 3, 20],
						query: `/fix 'poppedElement' is possibly 'undefined'`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		// Inspired by case 125 of /fix dataset version 8
		stest({ description: 'Error 2304 - (AML-8-125) can not find name', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2304_2.ts')],
				queries: [
					{
						file: 'tsc_error_2304_2.ts',
						selection: [7, 2, 7, 2],
						query: `/fix Cannot find name 'cy'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => {
							if (outcome.type === 'conversational') {
								const match = outcome.chatResponseMarkdown.match(/```(ps|bash)[.\n\r]*npm install.*cypress/);
								assert.ok(match, 'contains npm install cypress');
							} else if (outcome.type === 'inlineEdit') {
								const diagnostics = await getWorkspaceDiagnostics(accessor, workspace, 'tsc');
								const filtered = diagnostics.filter(d => d.code !== 2307 && d.code !== 2305); // filter module not found, module has not exported member
								assert.equal(filtered.length, 0, 'only module not found diagnostics');
							} else {
								assert.fail('unexpected outcome type');
							}
						}
					}
				]
			});
		});

		stest({ description: 'Error 2304 - (AML-8-125) can not find name 2', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2304_3.ts')],
				queries: [
					{
						file: 'tsc_error_2304_3.ts',
						selection: [1, 10, 1, 10],
						query: `/fix Cannot find name 'promises'. Did you mean 'Promise'?.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		// Inspired by case 25 of /fix dataset version 10
		// The fix was not correct, it just added a new line and did not resolve the error
		stest({ description: `Error 7053 - (AML-10-25) expression of type can't be used to index`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_7053.ts')],
				queries: [
					{
						file: 'tsc_error_7053.ts',
						selection: [9, 2, 9, 2],
						query: [
							`/fix Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ Pi: number; PiTimes2: number; PiOn2: number; PiOn4: number; E: number; }.`,
							`  No index signature with a parameter of type 'string' was found on type '{ Pi: number; PiTimes2: number; PiOn2: number; PiOn4: number; E: number; }'.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		// Inspired by case 31 in /fix dataset version 10
		stest({ description: '(AML-10-31) Parameter data implicitly has an any type.', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_implicit_any.ts')],
				queries: [
					{
						file: 'tsc_implicit_any.ts',
						selection: [7, 38, 7, 42],
						query: `/fix Parameter 'data' implicitly has an 'any' type`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => {
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
						}
					}
				]
			});
		});

		stest({ description: 'declaration or statement expected', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_1128.ts')],
				queries: [
					{
						file: 'tsc_error_1128.ts',
						selection: [8, 0, 8, 1],
						query: `/fix Declaration or statement expected.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => {
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
						}
					}
				]
			});
		});

		stest({ description: 'left side of comma operator is unused', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2695.ts')],
				queries: [
					{
						file: 'tsc_error_2695.ts',
						selection: [3, 9, 3, 10],
						query: `/fix Left side of comma operator is unused and has no side effects.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => {
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
						}
					}
				]
			});
		});

		stest({ description: 'object is possibly undefined', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2532.ts')],
				queries: [
					{
						file: 'tsc_error_2532.ts',
						selection: [2, 12, 2, 15],
						query: `/fix 'obj' is possibly 'undefined'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => {
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
						}
					}
				]
			});
		});

		stest({ description: 'duplicate identifier', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2300.ts')],
				queries: [
					{
						file: 'tsc_error_2300.ts',
						selection: [1, 6, 1, 13],
						query: `/fix Duplicate identifier 'MyArray'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => {
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
						}
					}
				]
			});
		});

		stest({ description: 'Error 2802 - large file - Type Uint32Array can only be iterated through', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_large_onigscanner/tsc_error_2802.ts')],
				queries: [
					{
						file: 'tsc_error_2802.ts',
						selection: [442, 16, 454, 10],
						query: `/fix Type 'Uint32Array' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => {
							if (outcome.type === 'conversational') {
								// change to tsconfig.json
							} else {
								await assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							}
						}
					}
				]
			});
		});

		stest({ description: 'can not assign to parameter of type', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/tsc_error_2345.ts')],
				queries: [
					{
						file: 'tsc_error_2345.ts',
						selection: [1, 22, 1, 31],
						query: `/fix Argument of type 'T' is not assignable to parameter of type 'object | null'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => {
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
						}
					}
				]
			});
		});

		stest({ description: 'Error 2345 - Last two arguments swapped', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			const files = [
				fromFixture('fixing/typescript/tsc_error_2345_2/file0.ts'),
				fromFixture('fixing/typescript/tsc_error_2345_2/file1.ts'),
				fromFixture('fixing/typescript/tsc_error_2345_2/database_mock.ts')
			];
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files,
				queries: [
					{
						file: 'file0.ts',
						selection: [3, 35, 3, 40],
						query: [
							`/fix Argument of type 'boolean' is not assignable to parameter of type 'number'.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 2345 - Got boolean but expected options bag', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			const files = [
				fromFixture('fixing/typescript/tsc_error_2345_3/file0.ts'),
				fromFixture('fixing/typescript/tsc_error_2345_3/database_mock.ts')
			];
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files,
				queries: [
					{
						file: 'file0.ts',
						selection: [3, 41, 3, 46],
						query: [
							`/fix Argument of type 'boolean' is not assignable to parameter of type '{ timeout?: number | undefined; loose: boolean; }'.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Error 2554 - Got two args but expected options bag', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('fixing/typescript/tsc_error_2554/legacy_database.ts'),
					fromFixture('fixing/typescript/tsc_error_2554/file1.ts'),
					fromFixture('fixing/typescript/tsc_error_2554/database_mock.ts')
				],
				queries: [
					{
						file: 'legacy_database.ts',
						selection: [9, 37, 9, 42],
						query: `/fix Expected 1-2 arguments, but got 3.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'tsc',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Issue 6571', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/inlineChatSimulator.ts')],
				queries: [
					{
						file: 'inlineChatSimulator.ts',
						selection: [302, 16, 302, 27],
						query: `/fix Cannot find name 'startOffset'.`,
						diagnostics: 'tsc',
						expectedIntent: 'fix',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc')
					}
				]
			});
		});

		stest({ description: 'Issue #7300', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [toFile({
					fileName: 'textureAtlasAllocator.test.ts',
					fileContents: `/*---------------------------------------------------------------------------------------------\r\n *  Copyright (c) Microsoft Corporation. All rights reserved.\r\n *  Licensed under the MIT License. See License.txt in the project root for license information.\r\n *--------------------------------------------------------------------------------------------*/\r\n\r\nimport { deepStrictEqual, strictEqual } from 'assert';\r\nimport { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';\r\nimport { TextureAtlasShelfAllocator } from 'vs/editor/browser/view/gpu/atlas/textureAtlasAllocator';\r\nimport { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';\r\nimport type { IRasterizedGlyph } from 'vs/editor/browser/view/gpu/raster/glyphRasterizer';\r\n\r\nconst blackInt = 0x000000FF;\r\nconst blackArr = [0x00, 0x00, 0x00, 0xFF];\r\n\r\nconst pixel1x1 = createRasterizedGlyph(1, 1, [...blackArr]);\r\nconst pixel2x1 = createRasterizedGlyph(2, 1, [...blackArr, ...blackArr]);\r\nconst pixel1x2 = createRasterizedGlyph(1, 2, [...blackArr, ...blackArr]);\r\n\r\nfunction initAllocator(w: number, h: number): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D; allocator: TextureAtlasShelfAllocator } {\r\n\tconst canvas = new OffscreenCanvas(w, h);\r\n\tconst ctx = ensureNonNullable(canvas.getContext('2d'));\r\n\tconst allocator = new TextureAtlasShelfAllocator(canvas, ctx);\r\n\treturn { canvas, ctx, allocator };\r\n}\r\n\r\nfunction createRasterizedGlyph(w: number, h: number, data: ArrayLike<number>): IRasterizedGlyph {\r\n\tstrictEqual(w * h * 4, data.length);\r\n\tconst source = new OffscreenCanvas(w, h);\r\n\tconst imageData = new ImageData(w, h);\r\n\timageData.data.set(data);\r\n\tensureNonNullable(source.getContext('2d')).putImageData(imageData, 0, 0);\r\n\treturn {\r\n\t\tsource,\r\n\t\tboundingBox: { top: 0, left: 0, bottom: h - 1, right: w - 1 },\r\n\t\toriginOffset: { x: 0, y: 0 },\r\n\t};\r\n}\r\n\r\nsuite('TextureAtlasShelfAllocator', () => {\r\n\tensureNoDisposablesAreLeakedInTestSuite();\r\n\r\n\tlet lastUniqueGlyph: string | undefined;\r\n\tfunction getUniqueGlyphId(): [string, number] {\r\n\t\tif (!lastUniqueGlyph) {\r\n\t\t\tlastUniqueGlyph = 'a';\r\n\t\t} else {\r\n\t\t\tlastUniqueGlyph = String.fromCharCode(lastUniqueGlyph.charCodeAt(0) + 1);\r\n\t\t}\r\n\t\treturn [lastUniqueGlyph, blackInt];\r\n\t}\r\n\r\n\tsuiteSetup(() => {\r\n\t\tlastUniqueGlyph = undefined;\r\n\t});\r\n\r\n\ttest('single allocation', () => {\r\n\t\tconst { allocator } = initAllocator(2, 2);\r\n\t\t// 1o\r\n\t\t// oo\r\n\t\tdeepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x1), {\r\n\t\t\tindex: 0,\r\n\t\t\tx: 0, y: 0,\r\n\t\t\tw: 1, h: 1,\r\n\t\t\toriginOffsetX: 0, originOffsetY: 0,\r\n\t\t});\r\n\t});\r\n\ttest('wrapping', () => {\r\n\t\tconst { allocator } = initAllocator(5, 4);\r\n\t\t// 1oooo\r\n\t\t// ooooo\r\n\t\t// ooooo\r\n\t\t// ooooo\r\n\t\tdeepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x1), {\r\n\t\t\tindex: 0,\r\n\t\t\tx: 0, y: 0,\r\n\t\t\tw: 1, h: 1,\r\n\t\t\toriginOffsetX: 0, originOffsetY: 0,\r\n\t\t});\r\n\t\t// 12ooo\r\n\t\t// o2ooo\r\n\t\t// ooooo\r\n\t\t// ooooo\r\n\t\tdeepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x2), {\r\n\t\t\tindex: 1,\r\n\t\t\tx: 1, y: 0,\r\n\t\t\tw: 1, h: 2,\r\n\t\t\toriginOffsetX: 0, originOffsetY: 0,\r\n\t\t});\r\n\t\t// 1233o\r\n\t\t// o2ooo\r\n\t\t// ooooo\r\n\t\t// ooooo\r\n\t\tdeepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel2x1), {\r\n\t\t\tindex: 2,\r\n\t\t\tx: 2, y: 0,\r\n\t\t\tw: 2, h: 1,\r\n\t\t\toriginOffsetX: 0, originOffsetY: 0,\r\n\t\t});\r\n\t\t// 1233x\r\n\t\t// x2xxx\r\n\t\t// 44ooo\r\n\t\t// ooooo\r\n\t\tdeepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel2x1), {\r\n\t\t\tindex: 3,\r\n\t\t\tx: 0, y: 2,\r\n\t\t\tw: 2, h: 1,\r\n\t\t\toriginOffsetX: 0, originOffsetY: 0,\r\n\t\t}, 'should wrap to next line as there\\'s no room left');\r\n\t\t// 1233x\r\n\t\t// x2xxx\r\n\t\t// 4455o\r\n\t\t// ooooo\r\n\t\tdeepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel2x1), {\r\n\t\t\tindex: 4,\r\n\t\t\tx: 2, y: 2,\r\n\t\t\tw: 2, h: 1,\r\n\t\t\toriginOffsetX: 0, originOffsetY: 0,\r\n\t\t});\r\n\t\t// 1233x\r\n\t\t// x2xxx\r\n\t\t// 44556\r\n\t\t// ooooo\r\n\t\tdeepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x1), {\r\n\t\t\tindex: 5,\r\n\t\t\tx: 4, y: 2,\r\n\t\t\tw: 1, h: 1,\r\n\t\t\toriginOffsetX: 0, originOffsetY: 0,\r\n\t\t});\r\n\t\t// 1233x\r\n\t\t// x2xxx\r\n\t\t// 44556\r\n\t\t// 7oooo\r\n\t\tdeepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x1), {\r\n\t\t\tindex: 6,\r\n\t\t\tx: 0, y: 3,\r\n\t\t\tw: 1, h: 1,\r\n\t\t\toriginOffsetX: 0, originOffsetY: 0,\r\n\t\t}, 'should wrap to next line as there\\'s no room left');\r\n\t});\r\n\ttest('full', () => {\r\n\t\tconst { allocator } = initAllocator(3, 2);\r\n\t\t// 1oo\r\n\t\t// 1oo\r\n\t\tdeepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x2), {\r\n\t\t\tindex: 0,\r\n\t\t\tx: 0, y: 0,\r\n\t\t\tw: 1, h: 2,\r\n\t\t\toriginOffsetX: 0, originOffsetY: 0,\r\n\t\t});\r\n\t\t// 122\r\n\t\t// 1oo\r\n\t\tdeepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel2x1), {\r\n\t\t\tindex: 1,\r\n\t\t\tx: 1, y: 0,\r\n\t\t\tw: 2, h: 1,\r\n\t\t\toriginOffsetX: 0, originOffsetY: 0,\r\n\t\t});\r\n\t\tdeepStrictEqual(allocator.allocate(...getUniqueGlyphId(), pixel1x1), undefined, 'should return undefined when the canvas is full');\r\n\t});\r\n});\r\n\r\nsuite('TextureAtlasSlabAllocator', () => {\r\n\ttest('a', () => {\r\n\t});\r\n});\r\n`
				})],
				queries: [
					{
						file: 'textureAtlasAllocator.test.ts',
						selection: [161, 0, 164, 2],
						query: '/fix Suites should include a call to `ensureNoDisposablesAreLeakedInTestSuite()` to ensure no disposables are leaked in tests.',
						diagnostics: 'tsc',
						expectedIntent: 'fix',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, KnownDiagnosticProviders.tscIgnoreImportErrors);
						}
					}
				]
			});
		});
	});

	ssuite({ title: `fix${suffix}`, subtitle: 'eslint', location: 'inline' }, () => {
		stest({ description: 'unexpected token', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_unexpected_token.ts')],
				queries: [
					{
						file: 'eslint_unexpected_token.ts',
						selection: [14, 4, 14, 4],
						query: `/fix Parsing error: Expression expected.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		// Inspired by case 52 of /fix dataset version 10
		// The fix was not correct, it just added a new line and did not resolve the error
		stest({ description: '(AML-10-52) expected conditional expression', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_expected_conditional_expression.ts')],
				queries: [
					{
						file: 'eslint_expected_conditional_expression.ts',
						selection: [8, 6, 8, 6],
						query: `/fix`,
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		// Inspired by case 1 in /fix dataset version 10
		stest({ description: '(AML-10-1) do not access hasOwnProperty', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_do_not_access_hasOwnProperty.ts')],
				queries: [
					{
						file: 'eslint_do_not_access_hasOwnProperty.ts',
						selection: [9, 23, 9, 23],
						query: `/fix Do not access Object.prototype method 'hasOwnProperty' from target object.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `comma expected`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_comma_expected.ts')],
				queries: [
					{
						file: 'eslint_comma_expected.ts',
						selection: [8, 2, 8, 2],
						query: [
							`/fix Parsing error: ',' expected.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		// Inspired by case 10 of /fix dataset version 17
		stest({ description: `(AML-17-10) unexpected constant condition 1`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_unexpected_constant_condition_1.ts')],
				queries: [
					{
						file: 'eslint_unexpected_constant_condition_1.ts',
						selection: [1, 4, 1, 4],
						query: [
							`/fix Unexpected constant condition.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		// Inspired by case 152 of /fix dataset version 17
		stest({ description: `(AML-17-152) unreachable code`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_unreachable_code.ts')],
				queries: [
					{
						file: 'eslint_unreachable_code.ts',
						selection: [5, 3, 5, 3],
						query: [
							`/fix Unreachable code.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		// Inspired by case 166 of /fix dataset version 17
		stest({ description: `(AML-17-166) unexpected control character`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_unexpected_control_character.ts')],
				queries: [
					{
						file: 'eslint_unexpected_control_character.ts',
						selection: [0, 11, 0, 11],
						query: [
							`/fix Unexpected control character(s) in regular expression: \\x00.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		// Inspired by case 243 of /fix dataset version 17
		stest({ description: `(AML-17-243) unexpected constant condition 2`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_unexpected_constant_condition_2.ts')],
				queries: [
					{
						file: 'eslint_unexpected_constant_condition_2.ts',
						selection: [4, 9, 4, 9],
						query: [
							`/fix Unexpected constant condition.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `class-methods-use-this with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_class_methods_use_this.ts')],
				queries: [
					{
						file: 'eslint_class_methods_use_this.ts',
						selection: [14, 1, 14, 7],
						query: [
							`/fix Expected 'this' to be used by class method 'append'.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `consistent-this with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_consistent_this.ts')],
				queries: [
					{
						file: 'eslint_consistent_this.ts',
						selection: [8, 8, 8, 19],
						query: [
							`/fix Unexpected alias 'self' for 'this'.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `constructor-super with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_constructor_super.ts')],
				queries: [
					{
						file: 'eslint_constructor_super.ts',
						selection: [22, 1, 25, 2],
						query: [
							`/fix Expected to call 'super()'.`,
							`Constructors for derived classes must contain a 'super' call.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `func-names with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_func_names.ts')],
				queries: [
					{
						file: 'eslint_func_names.ts',
						selection: [4, 25, 4, 34],
						query: [
							`/fix Unexpected unnamed function.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `func-style with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_func_style.ts')],
				queries: [
					{
						file: 'eslint_func_style.ts',
						selection: [4, 7, 10, 1],
						query: [
							`/fix Expected a function expression.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});
		stest({ description: `max-lines-per-function with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_max_lines_per_function.ts')],
				queries: [
					{
						file: 'eslint_max_lines_per_function.ts',
						selection: [4, 7, 58, 1],
						query: [
							`/fix Function 'fastMark' has too many lines (55). Maximum allowed is 50.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `max-params with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_max_params.ts')],
				queries: [
					{
						file: 'eslint_max_params.ts',
						selection: [10, 1, 10, 12],
						query: [
							`/fix Constructor has too many parameters (5). Maximum allowed is 3.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});
		stest({ description: `max-statements with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_max_statements.ts')],
				queries: [
					{
						file: 'eslint_max_statements.ts',
						selection: [5, 7, 59, 1],
						query: [
							`/fix Function 'fastMark' has too many statements (34). Maximum allowed is 10.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `no-case-declarations with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_case_declarations.ts')],
				queries: [
					{
						file: 'eslint_no_case_declarations.ts',
						selection: [9, 3, 9, 61],
						query: [
							`/fix Unexpected lexical declaration in case block.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `no-dupe-else-if with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_dupe_else_if.ts')],
				queries: [
					{
						file: 'eslint_no_dupe_else_if.ts',
						selection: [11, 13, 11, 34],
						query: [
							`/fix This branch can never execute. Its condition is a duplicate or covered by previous conditions in the if-else-if chain.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});
		stest({ description: `no-duplicate-case with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_duplicate_case.ts')],
				queries: [
					{
						file: 'eslint_no_duplicate_case.ts',
						selection: [20, 1, 21, 137],
						query: [
							`/fix Please fix the problem at the location`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `no-duplicate-imports with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_duplicate_imports.ts')],
				queries: [
					{
						file: 'eslint_no_duplicate_imports.ts',
						selection: [7, 0, 7, 55],
						query: [
							`/fix './eslint_no_duplicate_case'' import is duplicated.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});
		stest({ description: `no-fallthrough with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_fallthrough.ts')],
				queries: [
					{
						file: 'eslint_no_fallthrough.ts',
						selection: [9, 2, 9, 9],
						query: [
							`/fix Expected a 'break' statement before 'case'.`,
							`Constructors for derived classes must contain a 'super' call.`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `no-inner-declarations with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_inner_declarations.ts')],
				queries: [
					{
						file: 'eslint_no_inner_declarations.ts',
						selection: [11, 2, 15, 3],
						query: [
							`/fix Move function declaration to function body root.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `no-multi-assign with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_multi_assign.ts')],
				queries: [
					{
						file: 'eslint_no_multi_assign.ts',
						selection: [10, 8, 10, 8],
						query: [
							`/fix Unexpected chained assignment.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `no-negated-condition with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_negated_condition.ts')],
				queries: [
					{
						file: 'eslint_no_negated_condition.ts',
						selection: [8, 8, 8, 53],
						query: [
							`/fix Unexpected negated condition.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `no-negated-condition 2 with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_negated_condition_2.ts')],
				queries: [
					{
						file: 'eslint_no_negated_condition_2.ts',
						selection: [6, 2, 11, 3],
						query: [
							`/fix Unexpected negated condition.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `no-new with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_new.ts')],
				queries: [
					{
						file: 'eslint_no_new.ts',
						selection: [38, 0, 38, 30],
						query: [
							`/fix Please fix the problem at the location`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});
		stest({ description: `no-sequences with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_sequences.ts')],
				queries: [
					{
						file: 'eslint_no_sequences.ts',
						selection: [16, 26, 16, 27],
						query: [
							`/fix Please fix the problem at the location`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `no-sparse-arrays with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_sparse_arrays.ts')],
				queries: [
					{
						file: 'eslint_no_sparse_arrays.ts',
						selection: [4, 25, 4, 30],
						query: [
							`/fix Unexpected comma in middle of array.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});
		stest({ description: `no-sparse-arrays 2 with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_sparse_arrays_2.ts')],
				queries: [
					{
						file: 'eslint_no_sparse_arrays_2.ts',
						selection: [4, 29, 4, 66],
						query: [
							`/fix Unexpected comma in middle of array.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `no-sparse-arrays 3 with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_no_sparse_arrays_3.ts')],
				queries: [
					{
						file: 'eslint_no_sparse_arrays_3.ts',
						selection: [4, 26, 4, 56],
						query: [
							`/fix Unexpected comma in middle of array.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: `require-await with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_require_await.ts')],
				queries: [
					{
						file: 'eslint_require_await.ts',
						selection: [6, 7, 6, 32],
						query: [
							`/fix Async function 'readConfig' has no 'await' expression.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});
		stest({ description: `sort-keys with cookbook`, language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/typescript/eslint_sort_keys.ts')],
				queries: [
					{
						file: 'eslint_sort_keys.ts',
						selection: [21, 2, 21, 10],
						query: [
							`/fix Expected object keys to be in ascending order. 'extended' should be before 'value'.`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'eslint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'eslint')
					}
				]
			});
		});

		stest({ description: 'Issue #7544', language: 'typescript', nonExtensionConfigurations }, (accessor) => {
			return simulateInlineChatWithStrategy(strategy, accessor, {
				files: [toFile({
					filePath: fromFixture('fix/issue-7544/notebookMulticursor.ts')
				})],
				queries: [
					{
						file: 'notebookMulticursor.ts',
						selection: [262, 41, 262, 41],
						query: 'fix the error',
						diagnostics: 'tsc',
						expectedIntent: 'fix',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertOccursOnce(outcome.fileContents, '\tundoRedo?: {\n\t\telements: IPastFutureElements;\n\t};');
						}
					}
				]
			});
		});
	});

	ssuite({ title: `fix${suffix}`, subtitle: 'pylint', location: 'inline' }, () => {

		stest({ description: 'unecessary parenthesis', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pylint_unecessary_parenthesis.py')],
				queries: [
					{
						file: 'pylint_unecessary_parenthesis.py',
						selection: [7, 0, 7, 0],
						query: `/fix Unnecessary parens after 'if' keyword`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pylint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pylint')
					}
				]
			});
		});

		stest({ description: 'unused module imported', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pylint_unused_import.py')],
				queries: [
					{
						file: 'pylint_unused_import.py',
						selection: [0, 0, 0, 0],
						query: `/fix Unused Path imported from pathlib`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pylint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pylint')
					}
				]
			});
		});

		stest({ description: `line-too-long cookbook 1 function definition with long parameters`, language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pylint_line_too_long_1.py')],
				queries: [
					{
						file: 'pylint_line_too_long_1.py',
						selection: [8, 0, 8, 2],
						query: [
							`/fix`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'pylint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pylint')
					}
				]
			});
		});

		stest({ description: `line-too-long cookbook 2 long print statememt`, language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pylint_line_too_long_2.py')],
				queries: [
					{
						file: 'pylint_line_too_long_2.py',
						selection: [7, 0, 7, 0],
						query: [
							`/fix`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'pylint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pylint')
					}
				]
			});
		});

		stest({ description: `line-too-long cookbook 3 long dictionary / list`, language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pylint_line_too_long_3.py')],
				queries: [
					{
						file: 'pylint_line_too_long_3.py',
						selection: [8, 0, 8, 0],
						query: [
							`/fix`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'pylint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pylint')
					}
				]
			});
		});

		stest({ description: `line-too-long cookbook 4 long if condition and function call`, language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pylint_line_too_long_4.py')],
				queries: [
					{
						file: 'pylint_line_too_long_4.py',
						selection: [15, 0, 15, 2],
						query: [
							`/fix`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'pylint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pylint')
					}
				]
			});
		});

		stest({ description: `line-too-long cookbook 5 multi-line docstring`, language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pylint_line_too_long_5.py')],
				queries: [
					{
						file: 'pylint_line_too_long_5.py',
						selection: [7, 8, 9, 8],
						query: [
							`/fix`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'pylint',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pylint')
					}
				]
			});
		});

	});

	ssuite({ title: `fix${suffix}`, subtitle: 'pyright', location: 'inline' }, () => {

		stest({ description: 'cannot instantiate abstract class', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_no_abstract_class_instantiation.py')],
				queries: [
					{
						file: 'pyright_no_abstract_class_instantiation.py',
						selection: [9, 4, 9, 4],
						query: `/fix Cannot instantiate abstract class "Base"\n  "Base.foo" is abstract`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		stest({ description: 'all Annotated types should include at least two type arguments', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_annotated_types_missing_argument.py')],
				queries: [
					{
						file: 'pyright_annotated_types_missing_argument.py',
						selection: [4, 3, 4, 3],
						query: `/fix Expected one type argument and one or more annotations for "Annotated"`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		stest({ description: 'should not generate an error for variables declared in outer scopes', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_assignment_scopes.py')],
				queries: [
					{
						file: 'pyright_assignment_scopes.py',
						selection: [24, 8, 24, 8],
						query: `/fix "d" is not defined`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		stest({ description: 'async cannot be used in a non-async function', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_async_in_non_async_function.py')],
				queries: [
					{
						file: 'pyright_async_in_non_async_function.py',
						selection: [17, 4, 17, 4],
						query: `/fix Use of "async" not allowed outside of async function`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		stest({ description: 'await cannot be used in a non-async function', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_await_in_non_async_function.py')],
				queries: [
					{
						file: 'pyright_await_in_non_async_function.py',
						selection: [14, 0, 14, 0],
						query: `/fix "await" allowed only within async function`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		stest({ description: 'bad token', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_badtoken.py')],
				queries: [
					{
						file: 'pyright_badtoken.py',
						selection: [4, 7, 4, 7],
						query: `/fix Invalid character in identifier`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		stest({ description: 'Bar does not define a do_something2 method', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_missing_method.py')],
				queries: [
					{
						file: 'pyright_missing_method.py',
						selection: [28, 0, 28, 0],
						query: [
							`/fix Cannot access member "do_something2" for type "Bar"`,
							`  Member "do_something2" is unknown`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		// Inspired by case 2 in /fix dataset version 10
		// Copilot misunderstood the directive and did a non-null check on the wrong variable
		stest({ description: '(AML-10-2) can not be assigned 1', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_can_not_be_assigned_to_1.py')],
				queries: [
					{
						file: 'pyright_can_not_be_assigned_to_1.py',
						selection: [13, 15, 13, 15],
						query: [
							`/fix Expression of type "tuple[str | None, Path]" cannot be assigned to return type "Tuple[str, Path]`,
							`  Type "str | None" cannot be assigned to type "str"`,
							`    Type "None" cannot be assigned to type "str"`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertLessDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		// Inspired by case 15 in /fix dataset version 10
		// The error was that Copilot was not able to localize exactly the code that is causing the error and it didn't provide any edit
		// This test has three times the error
		stest({ description: '(AML-10-15) object not subscriptable', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_object_not_subscriptable.py')],
				queries: [
					{
						file: 'pyright_object_not_subscriptable.py',
						selection: [17, 8, 17, 8],
						query: `/fix Object of type "None" is not subscriptable`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertLessDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		// Inspired by case 35 of /fix dataset version 10
		// In the AML run, copilot did not understand the error and did not fix it
		stest({ description: '(AML-10-35) can not access member', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_can_not_access_member.py')],
				queries: [
					{
						file: 'pyright_can_not_access_member.py',
						selection: [2, 23, 2, 23],
						query: [
							`/fix Cannot access member "includes" for type "set[Unknown]"`,
							`  Member "includes" is unknown`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		// Inspired by case 36 of /fix dataset version 10
		// In the AML run, copilot did not understand the error and did not fix it
		stest({ description: '(AML-10-36) can not be assigned 2', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_can_not_be_assigned_to_2.py')],
				queries: [
					{
						file: 'pyright_can_not_be_assigned_to_2.py',
						selection: [4, 19, 4, 19],
						query: `/fix Expression of type "list[None]" cannot be assigned to declared type "List[int] | None"`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		// Inspired by case 4 of /fix dataset version 10
		// In the AML run, copilot did not understand the error and did not fix it
		stest({ description: '(AML-10-4) parameter already assigned', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_parameter_already_assigned.py')],
				queries: [
					{
						file: 'pyright_parameter_already_assigned.py',
						selection: [7, 33, 7, 33],
						query: `/fix Parameter "input_shape" is already assigned`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		// Inspired by case 48 of /fix dataset version 10
		// In the AML run, copilot did not understand the error and did not fix it
		stest({ description: '(AML-10-48) can not be assigned 3', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_can_not_be_assigned_to_3.py')],
				queries: [
					{
						file: 'pyright_can_not_be_assigned_to_3.py',
						selection: [9, 14, 9, 14],
						query: [
							`/fix Argument of type "dict[str, int]" cannot be assigned to parameter "platforms" of type "list[str] | str" in function "setup"`,
							`  Type "dict[str, int]" cannot be assigned to type "list[str] | str"`,
							`    "dict[str, int]" is incompatible with "list[str]"`,
							`    "dict[str, int]" is incompatible with "str"`,
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		// Inspired by case 58 of /fix dataset version 10
		// The AML run has removed a big part of the code and replaced with non-minimal edits, this initial issue was not resolved
		stest({ description: '(AML-10-58) not defined', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_not_defined.py')],
				queries: [
					{
						file: 'pyright_not_defined.py',
						selection: [7, 20, 7, 20],
						query: `/fix "T_Or" is not defined`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		// Inspired by case 29 of /fix dataset version 10
		stest({ description: '(AML-10-29) instance of bool has no to_string member', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_no_to_string_member.py')],
				queries: [
					{
						file: 'pyright_no_to_string_member.py',
						selection: [1, 19, 1, 19],
						query: `/fix`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		// Inspired by case 110 of /fix dataset version 8
		stest({ description: '(AML-8-110) not defined', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_self_as_first_argument.py')],
				queries: [
					{
						file: 'pyright_self_as_first_argument.py',
						selection: [7, 20, 7, 20],
						query: `/fix Instance methods should take a "self" parameter`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});


		// Inspired by case 73 of /fix dataset version 8
		stest({ description: '(AML-8-73) no value for argument in function call', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_no_value_for_argument.py')],
				queries: [
					{
						file: 'pyright_no_value_for_argument.py',
						selection: [12, 16, 12, 16],
						query: `/fix Argument missing for parameter "error_message"`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		stest({ description: 'undefined variable', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_undefined_variable.py')],
				queries: [
					{
						file: 'pyright_undefined_variable.py',
						selection: [0, 0, 0, 4],
						query: `/fix "Play" is not defined`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		stest({ description: 'import missing', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_missing_import.py')],
				queries: [
					{
						file: 'pyright_missing_import.py',
						selection: [3, 26, 3, 34],
						query: `/fix "unittest" is not defined`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		stest({ description: 'general type issue', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_general_type_issue.py')],
				queries: [
					{
						file: 'pyright_general_type_issue.py',
						selection: [29, 22, 29, 25],
						query: [
							`/fix Argument of type "Msg[Foo]" cannot be assigned to parameter "msg" of type "Msg[FooBar]" in function "handle"`,
							`  "Msg[Foo]" is incompatible with "Msg[FooBar]"`,
							`    Type parameter "T@Msg" is invariant, but "Foo" is not the same as "FooBar"`
						].join('\n'),
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		stest({ description: 'optional member access', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_optional_member_access.py')],
				queries: [
					{
						file: 'pyright_optional_member_access.py',
						selection: [12, 23, 12, 28],
						query: `/fix "upper" is not a known member of "None"`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});

		stest({ description: 'unbound variable', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/python/pyright_unbound_variable.py')],
				queries: [
					{
						file: 'pyright_unbound_variable.py',
						selection: [4, 11, 4, 12],
						query: `/fix "a" is possibly unbound`,
						expectedIntent: Intent.Fix,
						diagnostics: 'pyright',
						validate: async (outcome, workspace, accessor) => assertNoDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
					}
				]
			});
		});
	});

	ssuite({ title: `fix${suffix}`, subtitle: 'cpp', location: 'inline' }, () => {
		stest({ description: 'code fix for C++', language: 'cpp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('fixing/cpp/basic/main.cpp'),
				],
				queries: [
					{
						file: 'main.cpp',
						selection: [5, 32],
						query: '/fix too few arguments in function call',
						expectedIntent: Intent.Fix,
						diagnostics: 'cpp',
						validate: async (outcome, workspace, accessor) => {
							assert.strictEqual(outcome.type, 'inlineEdit');
							assertNoOccurrence(outcome.fileContents, 'getName();');
							await assertLessDiagnosticsAsync(accessor, outcome, workspace, 'cpp');
						},
					},
				],
			});
		});
	});

	/**
 * This method validates the outcome by finding if after the edit, there remain errors
 */
	ssuite({ title: `fix${suffix}`, subtitle: 'roslyn', location: 'inline' }, () => {

		// Inspired by case 28 of /fix dataset version 10
		// Final edit does not correspond to fetched response
		stest({ description: '(AML-10-28) field is never used', language: 'csharp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/csharp/roslyn_field_never_used.cs')],
				queries: [
					{
						file: 'roslyn_field_never_used.cs',
						selection: [29, 37, 29, 37],
						query: `/fix "The event 'Class3.event3' is never used"`,
						expectedIntent: Intent.Fix,
						diagnostics: 'roslyn',
						validate: async (outcome, workspace, accessor) => assertLessDiagnosticsAsync(accessor, outcome, workspace, 'roslyn')
					}
				]
			});
		});

		// Inspired by case 57 of /fix dataset version 10
		stest({ description: '(AML-10-57) call is not awaited, execution continues', language: 'csharp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/csharp/roslyn_call_not_awaited.cs')],
				queries: [
					{
						file: 'roslyn_call_not_awaited.cs',
						selection: [5, 12, 5, 12],
						query: `/fix Because this call is not awaited, execution of the current method continues before the call is completed. Consider applying the 'await' operator to the result of the call.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'roslyn',
						validate: async (outcome, workspace, accessor) => assertLessDiagnosticsAsync(accessor, outcome, workspace, 'roslyn')
					}
				]
			});
		});

		// Inspired by case 3523 of /fix dataset version 17
		stest({ description: '(AML-17-3523) has same name as', language: 'csharp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/csharp/roslyn_has_same_name_as.cs')],
				queries: [
					{
						file: 'roslyn_has_same_name_as.cs',
						selection: [3, 23, 3, 24],
						query: `/fix Type parameter 'W' has the same name as the type parameter from outer type 'Class1<T, U>.Class11<V, W, X, Y>'.`,
						expectedIntent: Intent.Fix,
						diagnostics: 'roslyn',
						validate: async (outcome, workspace, accessor) => assertLessDiagnosticsAsync(accessor, outcome, workspace, 'roslyn')
					}
				]
			});
		});

		stest({ description: 'does not exist', language: 'csharp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/csharp/roslyn_does_not_exist.cs')],
				queries: [
					{
						file: 'roslyn_does_not_exist.cs',
						selection: [3, 26, 3, 32],
						query: `/fix The name 'mesage' does not exist in the current context`,
						expectedIntent: Intent.Fix,
						diagnostics: 'roslyn',
						validate: async (outcome, workspace, accessor) => assertLessDiagnosticsAsync(accessor, outcome, workspace, 'roslyn')
					}
				]
			});
		});

		stest({ description: 'does not contain a definition', language: 'csharp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/csharp/roslyn_does_not_contain_definition_for.cs')],
				queries: [
					{
						file: 'roslyn_does_not_contain_definition_for.cs',
						selection: [4, 23, 4, 28],
						query: `/fix 'C' does not contain a definition for 'Field'`,
						expectedIntent: Intent.Fix,
						diagnostics: 'roslyn',
						validate: async (outcome, workspace, accessor) => assertLessDiagnosticsAsync(accessor, outcome, workspace, 'roslyn')
					}
				]
			});
		});

		stest({ description: 'no argument given', language: 'csharp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/csharp/roslyn_no_argument_given.cs')],
				queries: [
					{
						file: 'roslyn_no_argument_given.cs',
						selection: [6, 19, 6, 20],
						query: `/fix There is no argument given that corresponds to the required parameter 'count' of 'C.C(int)'`,
						expectedIntent: Intent.Fix,
						diagnostics: 'roslyn',
						validate: async (outcome, workspace, accessor) => assertLessDiagnosticsAsync(accessor, outcome, workspace, 'roslyn')
					}
				]
			});
		});

		stest({ description: 'missing using directive', language: 'csharp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/csharp/roslyn_missing_using_directive.cs')],
				queries: [
					{
						file: 'roslyn_missing_using_directive.cs',
						selection: [2, 5, 2, 16],
						query: `/fix The type or namespace name 'ConditionalAttribute' could not be found (are you missing a using directive or an assembly reference?)`,
						expectedIntent: Intent.Fix,
						diagnostics: 'roslyn',
						validate: async (outcome, workspace, accessor) => assertLessDiagnosticsAsync(accessor, outcome, workspace, 'roslyn')
					}
				]
			});
		});

		stest({ description: 'semi-colon expected', language: 'csharp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('fixing/csharp/roslyn_semi_colon_expected.cs')],
				queries: [
					{
						file: 'roslyn_semi_colon_expected.cs',
						selection: [4, 11, 4, 11],
						query: `/fix ; expected`,
						expectedIntent: Intent.Fix,
						diagnostics: 'roslyn',
						validate: async (outcome, workspace, accessor) => assertLessDiagnosticsAsync(accessor, outcome, workspace, 'roslyn')
					}
				]
			});
		});


	});

	ssuite({ title: `fix${suffix}`, subtitle: 'powershell', location: 'inline' }, () => {
		stest({ description: 'Issue #7894', language: 'powershell', nonExtensionConfigurations }, (accessor) => {
			return simulateInlineChatWithStrategy(strategy, accessor, {
				files: [toFile({
					filePath: fromFixture('fix/issue-7894/shellIntegration.ps1')
				})],
				queries: [
					{
						file: 'shellIntegration.ps1',
						selection: [175, 0, 175, 3],
						query: '[psscriptanalyzer:Error]: MissingEndCurlyBrace: MissingEndCurlyBrace (in fix/issue-7894/shellIntegration.ps1)',
						expectedIntent: 'fix',
						validate: async (outcome, workspace) => {
							assertInlineEdit(outcome);
							const newText = outcome.appliedEdits.map(e => e.newText).join('');
							assert.strictEqual(newText.includes('param'), true);
						}
					}
				]
			});
		});
	});

});
