/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import path from 'path';
import { ToolName } from '../../src/extension/tools/common/toolNames';
import { deserializeWorkbenchState } from '../../src/platform/test/node/promptContextModel';
import { ssuite, stest } from '../base/stest';
import { generateToolTestRunner } from './toolSimTest';
import { shouldSkipAgentTests } from './tools.stest';

interface IFetchWebPageToolParams {
	urls: string[];
	query?: string;
}

ssuite.optional(shouldSkipAgentTests, { title: 'fetchWebPageTool', subtitle: 'toolCalling', location: 'panel' }, () => {
	const scenarioFolder = path.join(__dirname, '..', 'test/scenarios/test-tools');
	const getState = () => deserializeWorkbenchState(scenarioFolder, path.join(scenarioFolder, 'tools.state.json'));

	stest('proper URL validation and query handling', generateToolTestRunner({
		question: 'fetch information about React hooks from https://react.dev/reference/react',
		scenarioFolderPath: '',
		getState,
		expectedToolCalls: ToolName.FetchWebPage,
		tools: {
			[ToolName.FetchWebPage]: true,
			[ToolName.FindFiles]: true,
			[ToolName.FindTextInFiles]: true,
			[ToolName.ReadFile]: true,
			[ToolName.EditFile]: true,
			[ToolName.Codebase]: true,
			[ToolName.ListDirectory]: true,
			[ToolName.SearchWorkspaceSymbols]: true,
		},
	}, {
		allowParallelToolCalls: false,
		toolCallValidators: {
			[ToolName.FetchWebPage]: async (toolCalls) => {
				assert.strictEqual(toolCalls.length, 1, 'should make exactly one fetch webpage tool call');
				const input = toolCalls[0].input as IFetchWebPageToolParams;

				// Should have exactly 1 URL
				assert.ok(Array.isArray(input.urls), 'urls should be an array');
				assert.strictEqual(input.urls.length, 1, 'should have exactly 1 URL');

				// Should be the exact URL from the question
				const expectedUrl = 'https://react.dev/reference/react';
				assert.strictEqual(input.urls[0], expectedUrl, `should have the exact URL: ${expectedUrl}`);

				// Validate query parameter if present
				if (input.query !== undefined) {
					assert.ok(typeof input.query === 'string', 'query should be a string if provided');
					assert.ok(input.query.length > 0, 'query should not be empty if provided');
				}
			}
		}
	}));

	stest('multiple URLs handling', generateToolTestRunner({
		question: 'get content from https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html and https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function about async/await',
		scenarioFolderPath: '',
		getState,
		expectedToolCalls: ToolName.FetchWebPage,
		tools: {
			[ToolName.FetchWebPage]: true,
			[ToolName.FindFiles]: true,
			[ToolName.FindTextInFiles]: true,
			[ToolName.ReadFile]: true,
			[ToolName.EditFile]: true,
			[ToolName.Codebase]: true,
			[ToolName.ListDirectory]: true,
			[ToolName.SearchWorkspaceSymbols]: true,
		},
	}, {
		allowParallelToolCalls: true,
		toolCallValidators: {
			[ToolName.FetchWebPage]: (toolCalls) => {
				const expectedTypescriptUrl = 'https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html';
				const expectedMdnUrl = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function';
				const expectedUrls = [expectedTypescriptUrl, expectedMdnUrl];

				// Allow either 1 tool call with 2 URLs or 2 tool calls with 1 URL each
				assert.ok(toolCalls.length === 1 || toolCalls.length === 2, 'should make either 1 or 2 fetch webpage tool calls');

				if (toolCalls.length === 1) {
					// Single tool call with multiple URLs
					const input = toolCalls[0].input as IFetchWebPageToolParams;

					// Should have exactly 2 URLs
					assert.ok(Array.isArray(input.urls), 'urls should be an array');
					assert.strictEqual(input.urls.length, 2, 'should have exactly 2 URLs');

					// Check that both expected URLs are present
					assert.ok(input.urls.includes(expectedTypescriptUrl), `should include the TypeScript URL: ${expectedTypescriptUrl}`);
					assert.ok(input.urls.includes(expectedMdnUrl), `should include the MDN URL: ${expectedMdnUrl}`);

					// Verify no unexpected URLs
					input.urls.forEach(url => {
						assert.ok(expectedUrls.includes(url), `unexpected URL found: ${url}`);
					});
				} else {
					// Multiple parallel tool calls with one URL each
					const allUrls: string[] = [];
					toolCalls.forEach(toolCall => {
						const input = toolCall.input as IFetchWebPageToolParams;
						assert.ok(Array.isArray(input.urls), 'urls should be an array');
						assert.strictEqual(input.urls.length, 1, 'each tool call should have exactly 1 URL');
						allUrls.push(input.urls[0]);
					});

					// Check that both expected URLs are present across all tool calls
					assert.ok(allUrls.includes(expectedTypescriptUrl), `should include the TypeScript URL: ${expectedTypescriptUrl}`);
					assert.ok(allUrls.includes(expectedMdnUrl), `should include the MDN URL: ${expectedMdnUrl}`);

					// Verify no unexpected URLs
					allUrls.forEach(url => {
						assert.ok(expectedUrls.includes(url), `unexpected URL found: ${url}`);
					});
				}

				// Check query parameter for any tool call that has it
				toolCalls.forEach(toolCall => {
					const input = toolCall.input as IFetchWebPageToolParams;
					if (input.query) {
						assert.ok(
							input.query.toLowerCase().includes('async') || input.query.toLowerCase().includes('await'),
							'query should relate to async/await when specifically requested'
						);
					}
				});
			}
		}
	}));

	stest('query parameter extraction', generateToolTestRunner({
		question: 'find specific information about error handling patterns from https://nodejs.org/en/docs/guides/error-handling/',
		scenarioFolderPath: '',
		getState,
		expectedToolCalls: ToolName.FetchWebPage,
		tools: {
			[ToolName.FetchWebPage]: true,
			[ToolName.FindFiles]: true,
			[ToolName.FindTextInFiles]: true,
			[ToolName.ReadFile]: true,
			[ToolName.EditFile]: true,
			[ToolName.Codebase]: true,
			[ToolName.ListDirectory]: true,
			[ToolName.SearchWorkspaceSymbols]: true,
		},
	}, {
		allowParallelToolCalls: false,
		toolCallValidators: {
			[ToolName.FetchWebPage]: async (toolCalls) => {
				assert.strictEqual(toolCalls.length, 1, 'should make exactly one fetch webpage tool call');
				const input = toolCalls[0].input as IFetchWebPageToolParams;

				// Should have exactly 1 URL
				assert.ok(Array.isArray(input.urls), 'urls should be an array');
				assert.strictEqual(input.urls.length, 1, 'should have exactly 1 URL');

				// Should be the exact URL from the question
				const expectedUrl = 'https://nodejs.org/en/docs/guides/error-handling/';
				assert.strictEqual(input.urls[0], expectedUrl, `should have the exact URL: ${expectedUrl}`);

				// Should extract meaningful query when user asks for specific information
				assert.ok(input.query !== undefined, 'should include a query when user asks for specific information');
				assert.ok(typeof input.query === 'string', 'query should be a string');
				assert.ok(input.query.length > 0, 'query should not be empty');

				// Query should relate to error handling since that's what was requested
				const queryLower = input.query.toLowerCase();
				assert.ok(
					queryLower.includes('error') || queryLower.includes('handling') || queryLower.includes('pattern'),
					'query should relate to error handling patterns when specifically requested'
				);
			}
		}
	}));

	stest('multiple URLs boundary test with 6 URLs', generateToolTestRunner({
		question: 'gather information from these documentation sources: https://react.dev/learn/hooks-overview, https://vuejs.org/guide/essentials/reactivity-fundamentals.html, https://angular.io/guide/component-interaction, https://svelte.dev/docs/introduction, https://solid-js.com/guides/getting-started, and https://lit.dev/docs/ about component state management',
		scenarioFolderPath: '',
		getState,
		expectedToolCalls: ToolName.FetchWebPage,
		tools: {
			[ToolName.FetchWebPage]: true,
			[ToolName.FindFiles]: true,
			[ToolName.FindTextInFiles]: true,
			[ToolName.ReadFile]: true,
			[ToolName.EditFile]: true,
			[ToolName.Codebase]: true,
			[ToolName.ListDirectory]: true,
			[ToolName.SearchWorkspaceSymbols]: true,
		},
	}, {
		allowParallelToolCalls: true,
		toolCallValidators: {
			[ToolName.FetchWebPage]: (toolCalls) => {
				const expectedUrls = [
					'https://react.dev/learn/hooks-overview',
					'https://vuejs.org/guide/essentials/reactivity-fundamentals.html',
					'https://angular.io/guide/component-interaction',
					'https://svelte.dev/docs/introduction',
					'https://solid-js.com/guides/getting-started',
					'https://lit.dev/docs/'
				];

				// Allow anywhere from 1 to 6 tool calls
				assert.ok(toolCalls.length >= 1 && toolCalls.length <= 6, `should make between 1 and 6 fetch webpage tool calls, but got ${toolCalls.length}`);

				// Collect all URLs from all tool calls
				const allUrls: string[] = [];
				let totalUrlCount = 0;

				toolCalls.forEach((toolCall, index) => {
					const input = toolCall.input as IFetchWebPageToolParams;
					assert.ok(Array.isArray(input.urls), `tool call ${index + 1}: urls should be an array`);
					assert.ok(input.urls.length >= 1, `tool call ${index + 1}: should have at least 1 URL`);

					totalUrlCount += input.urls.length;
					allUrls.push(...input.urls);
				});

				// Should have exactly 6 URLs total across all tool calls
				assert.strictEqual(totalUrlCount, 6, 'should have exactly 6 URLs total across all tool calls');
				assert.strictEqual(allUrls.length, 6, 'collected URLs array should have exactly 6 URLs');

				// Check that all expected URLs are present
				expectedUrls.forEach(expectedUrl => {
					assert.ok(allUrls.includes(expectedUrl), `should include the URL: ${expectedUrl}`);
				});

				// Verify no unexpected URLs
				allUrls.forEach(url => {
					assert.ok(expectedUrls.includes(url), `unexpected URL found: ${url}`);
				});

				// Verify no duplicate URLs
				const uniqueUrls = new Set(allUrls);
				assert.strictEqual(uniqueUrls.size, 6, 'should not have duplicate URLs');

				// Check query parameter for any tool call that has it
				toolCalls.forEach((toolCall, index) => {
					const input = toolCall.input as IFetchWebPageToolParams;
					assert.ok(input.query, `tool call ${index + 1}: query should be defined if provided`);
				});
			}
		}
	}));
});
