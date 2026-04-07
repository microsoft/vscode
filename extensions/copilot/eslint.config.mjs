/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import stylisticEslint from '@stylistic/eslint-plugin';
import tsEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importEslint from 'eslint-plugin-import';
import jsdocEslint from 'eslint-plugin-jsdoc';
import fs from 'fs';
import { builtinModules } from 'module';
import path from 'path';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'url';

import headerEslint from 'eslint-plugin-header';
headerEslint.rules.header.meta.schema = false;

import * as localEslint from './.eslintplugin/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ignores = fs.readFileSync(path.join(__dirname, '.eslint-ignore'), 'utf8')
	.toString()
	.split(/\r\n|\n/)
	.filter(line => line && !line.startsWith('#'));

export default tseslint.config(
	// Global ignores
	{
		ignores: [
			...ignores,
			'!**/.eslint-plugin-local/**/*'
		],
	},
	// All js/ts files
	{
		files: [
			'**/*.{js,jsx,mjs,cjs,ts,tsx}',
		],
		ignores: [
			'./src/extension/completions-core/**/testdata/*',
		],
		languageOptions: {
			parser: tsParser,
		},
		plugins: {
			'@stylistic': stylisticEslint,
			'header': headerEslint,
		},
		rules: {
			'indent': [
				'error',
				'tab',
				{
					ignoredNodes: [
						'SwitchCase',
						'ClassDeclaration',
						'TemplateLiteral *', // Conflicts with tsfmt
						'CallExpression > ArrowFunctionExpression', // Conflicts with tsfmt
						'CallExpression > ArrowFunctionExpression > BlockStatement', // Conflicts with tsfmt
						'NewExpression > ArrowFunctionExpression', // Conflicts with tsfmt
						'NewExpression > ArrowFunctionExpression > BlockStatement' // Conflicts with tsfmt
					]
				}
			],
			'constructor-super': 'error',
			'curly': 'error',
			'eqeqeq': 'error',
			'prefer-const': [
				'error',
				{
					destructuring: 'all'
				}
			],
			'no-buffer-constructor': 'error',
			'no-caller': 'error',
			'no-case-declarations': 'error',
			'no-debugger': 'error',
			'no-duplicate-case': 'error',
			'no-duplicate-imports': 'error',
			'no-eval': 'error',
			'no-async-promise-executor': 'error',
			'no-extra-semi': 'error',
			'no-new-wrappers': 'error',
			'no-redeclare': 'off',
			'no-sparse-arrays': 'error',
			'no-throw-literal': 'error',
			'no-unsafe-finally': 'error',
			'no-unused-labels': 'error',
			'no-restricted-globals': [
				'error',
				'name',
				'length',
				'event',
				'closed',
				'external',
				'status',
				'origin',
				'orientation',
				'context'
			], // non-complete list of globals that are easy to access unintentionally
			'no-var': 'error',
			'semi': 'error',
			'header/header': [
				'error',
				'block',
				[
					'---------------------------------------------------------------------------------------------',
					' *  Copyright (c) Microsoft Corporation. All rights reserved.',
					' *  Licensed under the MIT License. See License.txt in the project root for license information.',
					' *--------------------------------------------------------------------------------------------'
				]
			]
		},
		settings: {
			'import/resolver': {
				typescript: {
					extensions: ['.ts', '.tsx']
				}
			}
		},
	},
	// All ts files
	{
		files: [
			'**/*.{ts,tsx}',
		],
		languageOptions: {
			parser: tsParser,
		},
		plugins: {
			'@typescript-eslint': tsEslint,
			'@stylistic': stylisticEslint,
			'jsdoc': jsdocEslint,
		},
		rules: {
			'jsdoc/no-types': 'error',
			'@stylistic/member-delimiter-style': 'error',
			'@typescript-eslint/naming-convention': [
				'error',
				{
					selector: 'class',
					format: ['PascalCase']
				}
			],
		},
		settings: {
			'import/resolver': {
				typescript: {
					extensions: ['.ts', '.tsx']
				}
			}
		},
	},
	// Main extension sources
	{
		files: [
			'src/**/*.{ts,tsx}',
			'test/**/*.{ts,tsx}',
		],
		ignores: [
			'**/.esbuild.ts',
			'./src/extension/completions-core/vscode-node/bridge/src/completionsTelemetryServiceBridge.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'import': importEslint,
			'local': localEslint,
		},
		rules: {
			'no-restricted-imports': [
				'error',
				// node: builtins
				...builtinModules,
				// node: dependencies
				'@humanwhocodes/gitignore-to-minimatch',
				'@vscode/extension-telemetry',
				'applicationinsights',
				'ignore',
				'isbinaryfile',
				'minimatch',
				'source-map-support',
				'vscode-tas-client',
				'web-tree-sitter'
			],
			'import/no-restricted-paths': [
				'error',
				{
					zones: [
						{
							target: '**/common/**',
							from: [
								'**/vscode/**',
								'**/node/**',
								'**/vscode-node/**',
								'**/worker/**',
								'**/vscode-worker/**'
							]
						},
						{
							target: '**/vscode/**',
							from: [
								'**/node/**',
								'**/vscode-node/**',
								'**/worker/**',
								'**/vscode-worker/**'
							]
						},
						{
							target: '**/node/**',
							from: [
								'**/vscode/**',
								'**/vscode-node/**',
								'**/worker/**',
								'**/vscode-worker/**'
							]
						},
						{
							target: '**/vscode-node/**',
							from: [
								'**/worker/**',
								'**/vscode-worker/**'
							]
						},
						{
							target: '**/worker/**',
							from: [
								'**/vscode/**',
								'**/node/**',
								'**/vscode-node/**',
								'**/vscode-worker/**'
							]
						},
						{
							target: '**/vscode-worker/**',
							from: [
								'**/node/**',
								'**/vscode-node/**'
							]
						},
						{
							target: './src/',
							from: './test/'
						},
						{
							target: './src/shared-fetch-utils',
							from: ['./src/extension', './src/platform', './src/util', './src/lib']
						},
						{
							target: './src/util',
							from: ['./src/platform', './src/extension']
						},
						{
							target: './src/platform',
							from: ['./src/extension']
						},
						{
							target: ['./test', '!./test/base/extHostContext/*.ts'],
							from: ['**/vscode-node/**', '**/vscode-worker/**']
						},
						{
							target: 'src/!(lib)/**',
							from: './src/lib'
						}
					]
				}
			],
			'local/no-instanceof-uri': ['error'],
			'local/no-test-imports': ['error'],
			'local/no-runtime-import': [
				'error',
				{
					test: ['vscode'],
					'src/**/common/**/*': ['vscode'],
					'src/**/node/**/*': ['vscode']
				}
			],
			'local/no-funny-filename': ['error'],
			'local/no-bad-gdpr-comment': ['error'],
			'local/no-gdpr-event-name-mismatch': ['error'],
			'local/no-unlayered-files': ['error'],
			'local/no-restricted-copilot-pr-string': [
				'error',
				{
					className: 'GitHubPullRequestProviders',
					string: 'Generate with Copilot'
				}
			],
			'local/no-nls-localize': ['error'],
			'local/no-unexternalized-strings': ['error'],
		}
	},
	{
		files: ['**/{vscode-node,node}/**/*.ts', '**/{vscode-node,node}/**/*.tsx'],
		rules: {
			'no-restricted-imports': 'off'
		}
	},
	{
		files: ['**/*.js'],
		rules: {
			'jsdoc/no-types': 'off'
		}
	},
	{
		files: ['src/extension/**/*.tsx'],
		rules: {
			'local/no-missing-linebreak': 'error'
		}
	},
	{
		files: ['**/*.test.ts', '**/*.test.tsx'],
		rules: {
			'local/no-test-only': 'error'
		}
	},
	{
		files: [
			'test/**',
			'src/vscodeTypes.ts',
			'script/**',
			'src/extension/*.d.ts',
			'build/**'
		],
		rules: {
			'local/no-unlayered-files': 'off',
			'no-restricted-imports': 'off'
		}
	},
	// no-explicit-any
	{
		files: [
			'src/**/*.ts',
		],
		ignores: [
			'src/util/vs/**/*.ts', // vendored code
			'src/**/*.spec.ts', // allow in tests
			'./src/extension/agents/copilotcli/node/nodePtyShim.ts',
			'./src/extension/byok/common/anthropicMessageConverter.ts',
			'./src/extension/byok/common/geminiFunctionDeclarationConverter.ts',
			'./src/extension/byok/common/geminiMessageConverter.ts',
			'./src/extension/byok/vscode-node/anthropicProvider.ts',
			'./src/extension/byok/vscode-node/geminiNativeProvider.ts',
			'./src/extension/byok/vscode-node/ollamaProvider.ts',
			'./src/extension/chatSessions/vscode-node/copilotCloudSessionContentBuilder.ts',
			'./src/extension/chatSessions/vscode-node/copilotCloudSessionsProvider.ts',
			'./src/extension/codeBlocks/node/codeBlockProcessor.ts',
			'./src/extension/codeBlocks/vscode-node/provider.ts',
			'./src/extension/configuration/vscode-node/configurationMigration.ts',
			'./src/extension/context/node/resolvers/genericInlineIntentInvocation.ts',
			'./src/extension/context/node/resolvers/genericPanelIntentInvocation.ts',
			'./src/extension/context/node/resolvers/inlineFixIntentInvocation.ts',
			'./src/extension/context/node/resolvers/promptWorkspaceLabels.ts',
			'./src/extension/contextKeys/vscode-node/contextKeys.contribution.ts',
			'./src/extension/conversation/vscode-node/userActions.ts',
			'./src/extension/extension/vscode/services.ts',
			'./src/extension/inlineChat/node/rendererVisualization.ts',
			'./src/extension/inlineChat/vscode-node/inlineChatCommands.ts',
			'./src/extension/inlineEdits/common/observableWorkspaceRecordingReplayer.ts',
			'./src/extension/inlineEdits/vscode-node/parts/vscodeWorkspace.ts',
			'./src/extension/intents/node/editCodeIntent.ts',
			'./src/extension/intents/node/editCodeStep.ts',
			'./src/extension/intents/node/fixIntent.ts',
			'./src/extension/intents/node/newIntent.ts',
			'./src/extension/intents/node/searchIntent.ts',
			'./src/extension/languageContextProvider/vscode-node/languageContextProviderService.ts',
			'./src/extension/linkify/common/commands.ts',
			'./src/extension/linkify/common/responseStreamWithLinkification.ts',
			'./src/extension/linkify/test/node/util.ts',
			'./src/extension/log/vscode-node/loggingActions.ts',
			'./src/extension/log/vscode-node/requestLogTree.ts',
			'./src/extension/mcp/test/vscode-node/util.ts',
			'./src/extension/mcp/vscode-node/commands.ts',
			'./src/extension/mcp/vscode-node/nuget.ts',
			'./src/extension/onboardDebug/node/copilotDebugWorker/rpc.ts',
			'./src/extension/onboardDebug/node/parseLaunchConfigFromResponse.ts',
			'./src/extension/onboardDebug/vscode-node/copilotDebugCommandHandle.ts',
			'./src/extension/prompt/common/toolCallRound.ts',
			'./src/extension/prompt/node/chatMLFetcher.ts',
			'./src/extension/prompt/node/chatParticipantTelemetry.ts',
			'./src/extension/prompt/node/editGeneration.ts',
			'./src/extension/prompt/node/intents.ts',
			'./src/extension/prompt/node/todoListContextProvider.ts',
			'./src/extension/prompt/vscode-node/endpointProviderImpl.ts',
			'./src/extension/prompt/vscode-node/requestLoggerImpl.ts',
			'./src/extension/prompts/node/agent/promptRegistry.ts',
			'./src/extension/prompts/node/base/promptElement.ts',
			'./src/extension/prompts/node/base/promptRenderer.ts',
			'./src/extension/prompts/node/test/utils.ts',
			'./src/extension/replay/common/chatReplayResponses.ts',
			'./src/extension/replay/node/replayParser.ts',
			'./src/extension/replay/vscode-node/replayDebugSession.ts',
			'./src/extension/review/node/githubReviewAgent.ts',
			'./src/extension/test/node/services.ts',
			'./src/extension/test/vscode-node/extension.test.ts',
			'./src/extension/test/vscode-node/sanity.sanity-test.ts',
			'./src/extension/test/vscode-node/session.test.ts',
			'./src/extension/tools/common/toolSchemaNormalizer.ts',
			'./src/extension/tools/common/toolsService.ts',
			'./src/extension/typescriptContext/common/serverProtocol.ts',
			'./src/extension/typescriptContext/serverPlugin/src/common/baseContextProviders.ts',
			'./src/extension/typescriptContext/serverPlugin/src/common/contextProvider.ts',
			'./src/extension/typescriptContext/serverPlugin/src/common/protocol.ts',
			'./src/extension/typescriptContext/serverPlugin/src/common/typescripts.ts',
			'./src/extension/typescriptContext/serverPlugin/src/common/utils.ts',
			'./src/extension/typescriptContext/vscode-node/inspector.ts',
			'./src/extension/typescriptContext/vscode-node/languageContextService.ts',
			'./src/extension/workspaceRecorder/vscode-node/workspaceListenerService.ts',
			'./src/extension/workspaceSemanticSearch/node/semanticSearchTextSearchProvider.ts',
			'./src/lib/node/chatLibMain.ts',
			'./src/platform/authentication/test/node/simulationTestCopilotTokenManager.ts',
			'./src/platform/chat/common/blockedExtensionService.ts',
			'./src/platform/chunking/common/chunkingEndpointClientImpl.ts',
			'./src/platform/commands/common/mockRunCommandExecutionService.ts',
			'./src/platform/commands/common/runCommandExecutionService.ts',
			'./src/platform/commands/vscode/runCommandExecutionServiceImpl.ts',
			'./src/platform/configuration/common/configurationService.ts',
			'./src/platform/configuration/common/validator.ts',
			'./src/platform/configuration/test/common/inMemoryConfigurationService.ts',
			'./src/platform/configuration/vscode/configurationServiceImpl.ts',
			'./src/platform/customInstructions/common/customInstructionsService.ts',
			'./src/platform/debug/vscode/debugOutputListener.ts',
			'./src/platform/diff/node/diffWorkerMain.ts',
			'./src/platform/editing/common/notebookDocumentSnapshot.ts',
			'./src/platform/editing/common/textDocumentSnapshot.ts',
			'./src/platform/embeddings/common/embeddingsGrouper.ts',
			'./src/platform/embeddings/common/embeddingsIndex.ts',
			'./src/platform/embeddings/common/remoteEmbeddingsComputer.ts',
			'./src/platform/endpoint/node/modelMetadataFetcher.ts',
			'./src/platform/endpoint/test/node/openaiCompatibleEndpoint.ts',
			'./src/platform/env/common/packagejson.ts',
			'./src/platform/extensions/common/extensionsService.ts',
			'./src/platform/filesystem/common/fileSystemService.ts',
			'./src/platform/github/common/githubService.ts',
			'./src/platform/github/common/nullOctokitServiceImpl.ts',
			'./src/platform/inlineEdits/common/dataTypes/edit.ts',
			'./src/platform/inlineEdits/common/dataTypes/textEditLengthHelper/length.ts',
			'./src/platform/inlineEdits/common/editReason.ts',
			'./src/platform/inlineEdits/common/statelessNextEditProvider.ts',
			'./src/platform/inlineEdits/common/utils/observable.ts',
			'./src/platform/languages/common/languageDiagnosticsService.ts',
			'./src/platform/log/common/logExecTime.ts',
			'./src/platform/log/common/logService.ts',
			'./src/platform/log/vscode/outputChannelLogTarget.ts',
			'./src/platform/nesFetch/common/completionsFetchService.ts',
			'./src/platform/nesFetch/node/completionsFetchServiceImpl.ts',
			'./src/platform/networking/common/fetch.ts',
			'./src/platform/networking/common/fetcherService.ts',
			'./src/platform/networking/common/networking.ts',
			'./src/platform/networking/common/openai.ts',
			'./src/platform/networking/node/baseFetchFetcher.ts',
			'./src/platform/networking/node/chatStream.ts',
			'./src/platform/networking/node/fetcherFallback.ts',
			'./src/platform/networking/node/nodeFetchFetcher.ts',
			'./src/platform/networking/node/nodeFetcher.ts',
			'./src/platform/networking/node/stream.ts',
			'./src/platform/networking/node/test/nodeFetcherService.ts',
			'./src/platform/networking/vscode-node/electronFetcher.ts',
			'./src/platform/networking/vscode-node/fetcherServiceImpl.ts',
			'./src/platform/notification/common/notificationService.ts',
			'./src/platform/notification/vscode/notificationServiceImpl.ts',
			'./src/platform/openai/node/fetch.ts',
			'./src/platform/parser/node/nodes.ts',
			'./src/platform/parser/node/parserServiceImpl.ts',
			'./src/platform/parser/node/parserWorker.ts',
			'./src/platform/parser/node/treeSitterQueries.ts',
			'./src/platform/remoteCodeSearch/common/githubCodeSearchService.ts',
			'./src/platform/remoteSearch/node/codeOrDocsSearchClientImpl.ts',
			'./src/platform/review/vscode/reviewServiceImpl.ts',
			'./src/platform/scopeSelection/vscode-node/scopeSelectionImpl.ts',
			'./src/platform/snippy/common/snippyTypes.ts',
			'./src/platform/survey/vscode/surveyServiceImpl.ts',
			'./src/platform/tasks/vscode/tasksService.ts',
			'./src/platform/telemetry/common/failingTelemetryReporter.ts',
			'./src/platform/telemetry/common/telemetryData.ts',
			'./src/platform/telemetry/node/azureInsightsReporter.ts',
			'./src/platform/telemetry/node/spyingTelemetryService.ts',
			'./src/platform/terminal/common/terminalService.ts',
			'./src/platform/terminal/vscode/terminalServiceImpl.ts',
			'./src/platform/test/common/endpointTestFixtures.ts',
			'./src/platform/test/common/testExtensionsService.ts',
			'./src/platform/test/node/extensionContext.ts',
			'./src/platform/test/node/fetcher.ts',
			'./src/platform/test/node/services.ts',
			'./src/platform/test/node/simulationWorkspace.ts',
			'./src/platform/test/node/telemetry.ts',
			'./src/platform/test/node/testWorkbenchService.ts',
			'./src/platform/testing/common/nullWorkspaceMutationManager.ts',
			'./src/platform/tfidf/node/tfidf.ts',
			'./src/platform/tfidf/node/tfidfMessaging.ts',
			'./src/platform/tfidf/node/tfidfWorker.ts',
			'./src/platform/thinking/common/thinking.ts',
			'./src/platform/tokenizer/node/tikTokenizerWorker.ts',
			'./src/platform/tokenizer/node/tokenizer.ts',
			'./src/platform/workbench/common/workbenchService.ts',
			'./src/platform/workbench/vscode/workbenchServiceImpt.ts',
			'./src/platform/workspaceChunkSearch/node/nullWorkspaceFileIndex.ts',
			'./src/platform/workspaceChunkSearch/node/tfidfChunkSearch.ts',
			'./src/platform/workspaceChunkSearch/node/workspaceFileIndex.ts',
			'./src/platform/workspaceRecorder/common/resolvedRecording/resolvedRecording.ts',
			'./src/util/common/async.ts',
			'./src/util/common/cache.ts',
			'./src/util/common/chatResponseStreamImpl.ts',
			'./src/util/common/debounce.ts',
			'./src/util/common/debugValueEditorGlobals.ts',
			'./src/util/common/diff.ts',
			'./src/util/common/progress.ts',
			'./src/util/common/test/shims/chatTypes.ts',
			'./src/util/common/test/shims/editing.ts',
			'./src/util/common/test/shims/l10n.ts',
			'./src/util/common/test/shims/notebookDocument.ts',
			'./src/util/common/test/shims/vscodeTypesShim.ts',
			'./src/util/common/test/simpleMock.ts',
			'./src/util/common/timeTravelScheduler.ts',
			'./src/util/common/types.ts',
			'./src/util/node/worker.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			'@typescript-eslint/no-explicit-any': [
				'warn',
				{
					'fixToUnknown': true
				}
			]
		}
	},
	{
		files: ['./src/lib/node/chatLibMain.ts'],
		rules: {
			'import/no-restricted-paths': 'off'
		}
	},
);
