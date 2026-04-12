/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { InlineDocIntent } from '../../src/extension/intents/node/docIntent';
import { ssuite, stest } from '../base/stest';
import { forInline, simulateInlineChatWithStrategy } from '../simulation/inlineChatSimulator';
import { assertContainsAllSnippets } from '../simulation/outcomeValidators';
import { assertInlineEdit, assertOccursOnce, assertSomeStrings, fromFixture } from '../simulation/stestUtil';
import { assertDocLines } from './slashDoc.util';

forInline((strategy, nonExtensionConfigurations, suffix) => {

	ssuite({ title: `/doc${suffix}`, language: 'cpp', location: 'inline' }, () => {

		stest({ description: 'doc comment for C++', language: 'cpp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('cpp/basic/main.cpp'),
				],
				queries: [
					{
						file: 'main.cpp',
						selection: [4, 7],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							const fileContents = outcome.fileContents;

							// no duplication of declaration
							assertOccursOnce(fileContents, 'template<template<typename U, typename V, typename... Args> class ObjectType =');

							// no block bodies with a single comment
							assert.strictEqual(Array.from(fileContents.matchAll(/\/\/ \.\.\./g)).length, 0, 'no // ...');
							assert.strictEqual(Array.from(fileContents.matchAll(/implementation/g)).length, 0);

							// assert it contains doc comments above
							const fileLines = fileContents.split('\n');

							assertDocLines(fileLines, 'template<template<typename U, typename V, typename... Args> class ObjectType =');

							assertOccursOnce(fileContents, 'template<template<typename U, typename V, typename... Args> class ObjectType =');
						},
					},
				],
			});
		});

		stest({ description: 'doc comment for template', language: 'cpp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('cpp/headers/json_fwd.hpp'),
				],
				queries: [
					{
						file: 'json_fwd.hpp',
						selection: [37, 0, 50, 0],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							// Assert we get back a single inline edit that does not remove any existing text from the file.
							assertInlineEdit(outcome);
							assert.strictEqual(outcome.appliedEdits.length, 1, `expected 1 edit`);
							assert.strictEqual(outcome.appliedEdits[0].length, 0, `expected 0 length`);
							assert.strictEqual(outcome.appliedEdits[0].range.start.line, 36, `excpected comment at line 36`);
							assertContainsAllSnippets(outcome.fileContents, ['template class', 'BooleanType']);
							assertSomeStrings(outcome.fileContents, ['JSON structure', 'JSON object']);
							assertSomeStrings(outcome.fileContents, ['Defaults to bool', 'defaults to bool']);
						},
					},
				],
			});
		});

		stest({ description: 'doc comment for macro', language: 'cpp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('cpp/headers/abi_macros.hpp'),
				],
				queries: [
					{
						file: 'abi_macros.hpp',
						selection: [59, 0, 61, 0],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							// Assert we get back a single inline edit that does not remove any existing text from the file.
							assertInlineEdit(outcome);
							assert.strictEqual(outcome.appliedEdits.length, 1, `expected 1 edit`);
							assert.strictEqual(outcome.appliedEdits[0].length, 0, `expected 0 length`);
							assert.strictEqual(outcome.appliedEdits[0].range.start.line, 58, `excpected comment at line 58`);
							assertContainsAllSnippets(outcome.fileContents, ['version', 'major', 'minor', 'patch']);
						},
					},
				],
			});
		});
	});

});
