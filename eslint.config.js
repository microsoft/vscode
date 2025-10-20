/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import fs from 'fs';
import path from 'path';
import tseslint from 'typescript-eslint';

import stylisticTs from '@stylistic/eslint-plugin-ts';
import * as pluginLocal from './.eslint-plugin-local/index.js';
import pluginJsdoc from 'eslint-plugin-jsdoc';

import pluginHeader from 'eslint-plugin-header';
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
			'semi': 'off',
			'local/code-translation-remind': 'warn',
			'local/code-no-native-private': 'warn',
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
			'local/code-no-observable-get-in-reactive-context': 'warn',
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
			'**/*.ts',
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
			'@stylistic/ts/semi': 'warn',
			'@stylistic/ts/member-delimiter-style': 'warn',
			'local/code-no-unused-expressions': [
				'warn',
				{
					'allowTernary': true
				}
			],
			'jsdoc/no-types': 'warn',
			'local/code-no-static-self-ref': 'warn'
		}
	},
	// vscode TS
	{
		files: [
			'src/**/*.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
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
	// vscode TS: strict no explicit `any`
	{
		files: [
			'src/**/*.ts',
		],
		ignores: [
			'src/vs/amdX.ts',
			'src/vs/monaco.d.ts',
			'src/vscode-dts/**',
			// Base
			'src/vs/base/browser/dom.ts',
			'src/vs/base/browser/mouseEvent.ts',
			'src/vs/base/browser/pixelRatio.ts',
			'src/vs/base/browser/trustedTypes.ts',
			'src/vs/base/browser/webWorkerFactory.ts',
			'src/vs/base/node/id.ts',
			'src/vs/base/node/osDisplayProtocolInfo.ts',
			'src/vs/base/node/osReleaseInfo.ts',
			'src/vs/base/node/processes.ts',
			'src/vs/base/common/arrays.ts',
			'src/vs/base/common/async.ts',
			'src/vs/base/common/cancellation.ts',
			'src/vs/base/common/collections.ts',
			'src/vs/base/common/console.ts',
			'src/vs/base/common/controlFlow.ts',
			'src/vs/base/common/decorators.ts',
			'src/vs/base/common/equals.ts',
			'src/vs/base/common/errorMessage.ts',
			'src/vs/base/common/errors.ts',
			'src/vs/base/common/event.ts',
			'src/vs/base/common/history.ts',
			'src/vs/base/common/hotReload.ts',
			'src/vs/base/common/hotReloadHelpers.ts',
			'src/vs/base/common/iterator.ts',
			'src/vs/base/common/json.ts',
			'src/vs/base/common/jsonSchema.ts',
			'src/vs/base/common/lifecycle.ts',
			'src/vs/base/common/linkedList.ts',
			'src/vs/base/common/map.ts',
			'src/vs/base/common/marshalling.ts',
			'src/vs/base/common/network.ts',
			'src/vs/base/common/oauth.ts',
			'src/vs/base/common/objects.ts',
			'src/vs/base/common/performance.ts',
			'src/vs/base/common/platform.ts',
			'src/vs/base/common/processes.ts',
			'src/vs/base/common/resourceTree.ts',
			'src/vs/base/common/skipList.ts',
			'src/vs/base/common/strings.ts',
			'src/vs/base/common/ternarySearchTree.ts',
			'src/vs/base/common/types.ts',
			'src/vs/base/common/uriIpc.ts',
			'src/vs/base/common/verifier.ts',
			'src/vs/base/common/observableInternal/base.ts',
			'src/vs/base/common/observableInternal/changeTracker.ts',
			'src/vs/base/common/observableInternal/debugLocation.ts',
			'src/vs/base/common/observableInternal/debugName.ts',
			'src/vs/base/common/observableInternal/map.ts',
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
			'src/vs/base/browser/ui/tree/abstractTree.ts',
			'src/vs/base/browser/ui/tree/asyncDataTree.ts',
			'src/vs/base/browser/ui/tree/compressedObjectTreeModel.ts',
			'src/vs/base/browser/ui/tree/dataTree.ts',
			'src/vs/base/browser/ui/tree/indexTree.ts',
			'src/vs/base/browser/ui/tree/indexTreeModel.ts',
			'src/vs/base/browser/ui/tree/objectTree.ts',
			'src/vs/base/browser/ui/tree/objectTreeModel.ts',
			'src/vs/base/browser/ui/tree/tree.ts',
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
			'src/vs/platform/accessibility/browser/accessibleView.ts',
			'src/vs/platform/accessibility/common/accessibility.ts',
			'src/vs/platform/action/common/action.ts',
			'src/vs/platform/actionWidget/browser/actionList.ts',
			'src/vs/platform/actions/common/actions.ts',
			'src/vs/platform/assignment/common/assignment.ts',
			'src/vs/platform/browserElements/electron-main/nativeBrowserElementsMainService.ts',
			'src/vs/platform/commands/common/commands.ts',
			'src/vs/platform/configuration/common/configuration.ts',
			'src/vs/platform/configuration/common/configurationModels.ts',
			'src/vs/platform/configuration/common/configurationRegistry.ts',
			'src/vs/platform/configuration/common/configurationService.ts',
			'src/vs/platform/configuration/common/configurations.ts',
			'src/vs/platform/contextkey/browser/contextKeyService.ts',
			'src/vs/platform/contextkey/common/contextkey.ts',
			'src/vs/platform/contextview/browser/contextView.ts',
			'src/vs/platform/contextview/browser/contextViewService.ts',
			'src/vs/platform/debug/common/extensionHostDebugIpc.ts',
			'src/vs/platform/debug/electron-main/extensionHostDebugIpc.ts',
			'src/vs/platform/diagnostics/common/diagnostics.ts',
			'src/vs/platform/diagnostics/node/diagnosticsService.ts',
			'src/vs/platform/download/common/downloadIpc.ts',
			'src/vs/platform/extensionManagement/common/abstractExtensionManagementService.ts',
			'src/vs/platform/extensionManagement/common/allowedExtensionsService.ts',
			'src/vs/platform/extensionManagement/common/extensionGalleryManifestServiceIpc.ts',
			'src/vs/platform/extensionManagement/common/extensionGalleryService.ts',
			'src/vs/platform/extensionManagement/common/extensionManagement.ts',
			'src/vs/platform/extensionManagement/common/extensionManagementIpc.ts',
			'src/vs/platform/extensionManagement/common/extensionManagementUtil.ts',
			'src/vs/platform/extensionManagement/common/extensionNls.ts',
			'src/vs/platform/extensionManagement/common/extensionStorage.ts',
			'src/vs/platform/extensionManagement/common/extensionTipsService.ts',
			'src/vs/platform/extensionManagement/common/extensionsProfileScannerService.ts',
			'src/vs/platform/extensionManagement/common/implicitActivationEvents.ts',
			'src/vs/platform/extensionManagement/node/extensionManagementService.ts',
			'src/vs/platform/extensionRecommendations/common/extensionRecommendationsIpc.ts',
			'src/vs/platform/extensions/common/extensionHostStarter.ts',
			'src/vs/platform/extensions/common/extensionValidator.ts',
			'src/vs/platform/extensions/common/extensions.ts',
			'src/vs/platform/extensions/electron-main/extensionHostStarter.ts',
			'src/vs/platform/externalTerminal/node/externalTerminalService.ts',
			'src/vs/platform/instantiation/common/descriptors.ts',
			'src/vs/platform/instantiation/common/extensions.ts',
			'src/vs/platform/instantiation/common/instantiation.ts',
			'src/vs/platform/instantiation/common/instantiationService.ts',
			'src/vs/platform/instantiation/common/serviceCollection.ts',
			'src/vs/platform/keybinding/common/keybinding.ts',
			'src/vs/platform/keybinding/common/keybindingResolver.ts',
			'src/vs/platform/keybinding/common/keybindingsRegistry.ts',
			'src/vs/platform/keybinding/common/resolvedKeybindingItem.ts',
			'src/vs/platform/keyboardLayout/common/keyboardConfig.ts',
			'src/vs/platform/languagePacks/node/languagePacks.ts',
			'src/vs/platform/list/browser/listService.ts',
			'src/vs/platform/log/browser/log.ts',
			'src/vs/platform/log/common/log.ts',
			'src/vs/platform/log/common/logIpc.ts',
			'src/vs/platform/log/electron-main/logIpc.ts',
			'src/vs/platform/observable/common/wrapInHotClass.ts',
			'src/vs/platform/observable/common/wrapInReloadableClass.ts',
			'src/vs/platform/policy/common/policyIpc.ts',
			'src/vs/platform/policy/node/nativePolicyService.ts',
			'src/vs/platform/profiling/common/profilingTelemetrySpec.ts',
			'src/vs/platform/quickinput/browser/commandsQuickAccess.ts',
			'src/vs/platform/quickinput/browser/quickInputActions.ts',
			'src/vs/platform/quickinput/common/quickAccess.ts',
			'src/vs/platform/quickinput/common/quickInput.ts',
			'src/vs/platform/registry/common/platform.ts',
			'src/vs/platform/remote/browser/browserSocketFactory.ts',
			'src/vs/platform/remote/browser/remoteAuthorityResolverService.ts',
			'src/vs/platform/remote/common/electronRemoteResources.ts',
			'src/vs/platform/remote/common/managedSocket.ts',
			'src/vs/platform/remote/common/remoteAgentConnection.ts',
			'src/vs/platform/remote/common/remoteAuthorityResolver.ts',
			'src/vs/platform/remote/electron-browser/electronRemoteResourceLoader.ts',
			'src/vs/platform/remote/electron-browser/remoteAuthorityResolverService.ts',
			'src/vs/platform/remoteTunnel/node/remoteTunnelService.ts',
			'src/vs/platform/request/common/request.ts',
			'src/vs/platform/request/common/requestIpc.ts',
			'src/vs/platform/request/electron-utility/requestService.ts',
			'src/vs/platform/request/node/proxy.ts',
			'src/vs/platform/telemetry/browser/1dsAppender.ts',
			'src/vs/platform/telemetry/browser/errorTelemetry.ts',
			'src/vs/platform/telemetry/common/1dsAppender.ts',
			'src/vs/platform/telemetry/common/errorTelemetry.ts',
			'src/vs/platform/telemetry/common/gdprTypings.ts',
			'src/vs/platform/telemetry/common/remoteTelemetryChannel.ts',
			'src/vs/platform/telemetry/common/telemetry.ts',
			'src/vs/platform/telemetry/common/telemetryIpc.ts',
			'src/vs/platform/telemetry/common/telemetryLogAppender.ts',
			'src/vs/platform/telemetry/common/telemetryService.ts',
			'src/vs/platform/telemetry/common/telemetryUtils.ts',
			'src/vs/platform/telemetry/node/1dsAppender.ts',
			'src/vs/platform/telemetry/node/errorTelemetry.ts',
			'src/vs/platform/terminal/common/terminal.ts',
			'src/vs/platform/terminal/node/ptyHostService.ts',
			'src/vs/platform/terminal/node/ptyService.ts',
			'src/vs/platform/terminal/node/terminalProcess.ts',
			'src/vs/platform/terminal/node/windowsShellHelper.ts',
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
			'src/vs/platform/userDataSync/common/ignoredExtensions.ts',
			'src/vs/platform/userDataSync/common/settingsMerge.ts',
			'src/vs/platform/userDataSync/common/settingsSync.ts',
			'src/vs/platform/userDataSync/common/userDataAutoSyncService.ts',
			'src/vs/platform/userDataSync/common/userDataSync.ts',
			'src/vs/platform/userDataSync/common/userDataSyncAccount.ts',
			'src/vs/platform/userDataSync/common/userDataSyncEnablementService.ts',
			'src/vs/platform/userDataSync/common/userDataSyncIpc.ts',
			'src/vs/platform/userDataSync/common/userDataSyncLocalStoreService.ts',
			'src/vs/platform/userDataSync/common/userDataSyncMachines.ts',
			'src/vs/platform/userDataSync/common/userDataSyncResourceProvider.ts',
			'src/vs/platform/userDataSync/common/userDataSyncService.ts',
			'src/vs/platform/userDataSync/common/userDataSyncServiceIpc.ts',
			'src/vs/platform/userDataSync/common/userDataSyncStoreService.ts',
			'src/vs/platform/webContentExtractor/electron-main/cdpAccessibilityDomain.ts',
			'src/vs/platform/webview/common/webviewManagerService.ts',
			'src/vs/platform/configuration/test/common/testConfigurationService.ts',
			'src/vs/platform/instantiation/test/common/instantiationServiceMock.ts',
			'src/vs/platform/keybinding/test/common/mockKeybindingService.ts',
			'src/vs/platform/quickinput/browser/tree/quickTree.ts',
			'src/vs/platform/userDataSync/test/common/userDataSyncClient.ts',
			// Editor
			'src/vs/editor/editor.api.ts',
			'src/vs/editor/standalone/browser/standaloneCodeEditor.ts',
			'src/vs/editor/standalone/browser/standaloneEditor.ts',
			'src/vs/editor/standalone/browser/standaloneLanguages.ts',
			'src/vs/editor/standalone/browser/standaloneServices.ts',
			'src/vs/editor/standalone/browser/standaloneWebWorker.ts',
			'src/vs/editor/test/browser/testCodeEditor.ts',
			'src/vs/editor/test/common/testTextModel.ts',
			'src/vs/editor/contrib/bracketMatching/browser/bracketMatching.ts',
			'src/vs/editor/contrib/clipboard/browser/clipboard.ts',
			'src/vs/editor/contrib/codeAction/browser/codeAction.ts',
			'src/vs/editor/contrib/codeAction/browser/codeActionCommands.ts',
			'src/vs/editor/contrib/codeAction/common/types.ts',
			'src/vs/editor/contrib/codelens/browser/codelens.ts',
			'src/vs/editor/contrib/codelens/browser/codelensController.ts',
			'src/vs/editor/contrib/colorPicker/browser/colorDetector.ts',
			'src/vs/editor/contrib/cursorUndo/browser/cursorUndo.ts',
			'src/vs/editor/contrib/diffEditorBreadcrumbs/browser/contribution.ts',
			'src/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorContribution.ts',
			'src/vs/editor/contrib/editorState/browser/editorState.ts',
			'src/vs/editor/contrib/find/browser/findController.ts',
			'src/vs/editor/contrib/find/browser/findModel.ts',
			'src/vs/editor/contrib/find/browser/findWidgetSearchHistory.ts',
			'src/vs/editor/contrib/find/browser/replaceWidgetHistory.ts',
			'src/vs/editor/contrib/folding/browser/folding.ts',
			'src/vs/editor/contrib/format/browser/format.ts',
			'src/vs/editor/contrib/gotoSymbol/browser/goToCommands.ts',
			'src/vs/editor/contrib/gotoSymbol/browser/symbolNavigation.ts',
			'src/vs/editor/contrib/hover/browser/hoverActions.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/structuredLogger.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/utils.ts',
			'src/vs/editor/contrib/insertFinalNewLine/browser/insertFinalNewLine.ts',
			'src/vs/editor/contrib/lineSelection/browser/lineSelection.ts',
			'src/vs/editor/contrib/linesOperations/browser/linesOperations.ts',
			'src/vs/editor/contrib/linkedEditing/browser/linkedEditing.ts',
			'src/vs/editor/contrib/multicursor/browser/multicursor.ts',
			'src/vs/editor/contrib/semanticTokens/browser/viewportSemanticTokens.ts',
			'src/vs/editor/contrib/semanticTokens/common/getSemanticTokens.ts',
			'src/vs/editor/contrib/smartSelect/browser/smartSelect.ts',
			'src/vs/editor/contrib/snippet/browser/snippetParser.ts',
			'src/vs/editor/contrib/stickyScroll/browser/stickyScrollModelProvider.ts',
			'src/vs/editor/contrib/suggest/browser/suggest.ts',
			'src/vs/editor/contrib/suggest/browser/suggestAlternatives.ts',
			'src/vs/editor/contrib/suggest/browser/suggestCommitCharacters.ts',
			'src/vs/editor/contrib/suggest/browser/suggestController.ts',
			'src/vs/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.ts',
			'src/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.ts',
			'src/vs/editor/contrib/wordOperations/browser/wordOperations.ts',
			'src/vs/editor/standalone/common/monarch/monarchCommon.ts',
			'src/vs/editor/standalone/common/monarch/monarchCompile.ts',
			'src/vs/editor/standalone/common/monarch/monarchLexer.ts',
			'src/vs/editor/standalone/common/monarch/monarchTypes.ts',
			'src/vs/editor/contrib/gotoSymbol/browser/peek/referencesController.ts',
			'src/vs/editor/contrib/gotoSymbol/browser/peek/referencesWidget.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/controller/commands.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/model/inlineCompletionsModel.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/model/typingSpeed.ts',
			'src/vs/editor/contrib/inlineCompletions/test/browser/utils.ts',
			'src/vs/editor/contrib/wordPartOperations/test/browser/utils.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/view/ghostText/ghostTextView.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViews/debugVisualization.ts',
			'src/vs/editor/contrib/inlineCompletions/browser/view/inlineEdits/utils/utils.ts',
			// Workbench
			'src/vs/workbench/api/browser/mainThreadChatSessions.ts',
			'src/vs/workbench/api/browser/mainThreadClipboard.ts',
			'src/vs/workbench/api/browser/mainThreadCodeInsets.ts',
			'src/vs/workbench/api/browser/mainThreadComments.ts',
			'src/vs/workbench/api/browser/mainThreadConfiguration.ts',
			'src/vs/workbench/api/browser/mainThreadDebugService.ts',
			'src/vs/workbench/api/browser/mainThreadDocuments.ts',
			'src/vs/workbench/api/browser/mainThreadEditSessionIdentityParticipant.ts',
			'src/vs/workbench/api/browser/mainThreadErrors.ts',
			'src/vs/workbench/api/browser/mainThreadExtensionService.ts',
			'src/vs/workbench/api/browser/mainThreadFileSystem.ts',
			'src/vs/workbench/api/browser/mainThreadLanguageFeatures.ts',
			'src/vs/workbench/api/browser/mainThreadLanguageModels.ts',
			'src/vs/workbench/api/browser/mainThreadNotebook.ts',
			'src/vs/workbench/api/browser/mainThreadNotebookKernels.ts',
			'src/vs/workbench/api/browser/mainThreadNotebookSaveParticipant.ts',
			'src/vs/workbench/api/browser/mainThreadOutputService.ts',
			'src/vs/workbench/api/browser/mainThreadQuickOpen.ts',
			'src/vs/workbench/api/browser/mainThreadSCM.ts',
			'src/vs/workbench/api/browser/mainThreadSaveParticipant.ts',
			'src/vs/workbench/api/browser/mainThreadSearch.ts',
			'src/vs/workbench/api/browser/mainThreadTask.ts',
			'src/vs/workbench/api/browser/mainThreadTelemetry.ts',
			'src/vs/workbench/api/browser/mainThreadTerminalService.ts',
			'src/vs/workbench/api/browser/mainThreadTreeViews.ts',
			'src/vs/workbench/api/browser/statusBarExtensionPoint.ts',
			'src/vs/workbench/api/browser/viewsExtensionPoint.ts',
			'src/vs/workbench/api/common/configurationExtensionPoint.ts',
			'src/vs/workbench/api/common/extHost.api.impl.ts',
			'src/vs/workbench/api/common/extHost.protocol.ts',
			'src/vs/workbench/api/common/extHostChatSessions.ts',
			'src/vs/workbench/api/common/extHostCodeInsets.ts',
			'src/vs/workbench/api/common/extHostCommands.ts',
			'src/vs/workbench/api/common/extHostConfiguration.ts',
			'src/vs/workbench/api/common/extHostConsoleForwarder.ts',
			'src/vs/workbench/api/common/extHostDataChannels.ts',
			'src/vs/workbench/api/common/extHostDebugService.ts',
			'src/vs/workbench/api/common/extHostDiagnostics.ts',
			'src/vs/workbench/api/common/extHostDocumentSaveParticipant.ts',
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
			'src/vs/workbench/api/common/extHostNotebookKernels.ts',
			'src/vs/workbench/api/common/extHostQuickOpen.ts',
			'src/vs/workbench/api/common/extHostRequireInterceptor.ts',
			'src/vs/workbench/api/common/extHostRpcService.ts',
			'src/vs/workbench/api/common/extHostSCM.ts',
			'src/vs/workbench/api/common/extHostSearch.ts',
			'src/vs/workbench/api/common/extHostStatusBar.ts',
			'src/vs/workbench/api/common/extHostStoragePaths.ts',
			'src/vs/workbench/api/common/extHostTelemetry.ts',
			'src/vs/workbench/api/common/extHostTerminalService.ts',
			'src/vs/workbench/api/common/extHostTesting.ts',
			'src/vs/workbench/api/common/extHostTextEditor.ts',
			'src/vs/workbench/api/common/extHostTimeline.ts',
			'src/vs/workbench/api/common/extHostTreeViews.ts',
			'src/vs/workbench/api/common/extHostTypeConverters.ts',
			'src/vs/workbench/api/common/extHostTypes.ts',
			'src/vs/workbench/api/common/extHostTypes/diagnostic.ts',
			'src/vs/workbench/api/common/extHostTypes/es5ClassCompat.ts',
			'src/vs/workbench/api/common/extHostTypes/location.ts',
			'src/vs/workbench/api/common/extHostTypes/markdownString.ts',
			'src/vs/workbench/api/common/extHostTypes/notebooks.ts',
			'src/vs/workbench/api/common/extHostTypes/position.ts',
			'src/vs/workbench/api/common/extHostTypes/range.ts',
			'src/vs/workbench/api/common/extHostTypes/selection.ts',
			'src/vs/workbench/api/common/extHostTypes/snippetString.ts',
			'src/vs/workbench/api/common/extHostTypes/snippetTextEdit.ts',
			'src/vs/workbench/api/common/extHostTypes/symbolInformation.ts',
			'src/vs/workbench/api/common/extHostTypes/textEdit.ts',
			'src/vs/workbench/api/common/extHostTypes/workspaceEdit.ts',
			'src/vs/workbench/api/common/extHostWebview.ts',
			'src/vs/workbench/api/common/extHostWebviewMessaging.ts',
			'src/vs/workbench/api/common/extHostWebviewPanels.ts',
			'src/vs/workbench/api/common/extHostWebviewView.ts',
			'src/vs/workbench/api/common/extHostWorkspace.ts',
			'src/vs/workbench/api/common/extensionHostMain.ts',
			'src/vs/workbench/api/common/shared/tasks.ts',
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
			'src/vs/workbench/contrib/bulkEdit/browser/bulkCellEdits.ts',
			'src/vs/workbench/contrib/bulkEdit/browser/bulkTextEdits.ts',
			'src/vs/workbench/contrib/bulkEdit/browser/opaqueEdits.ts',
			'src/vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPane.ts',
			'src/vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPreview.ts',
			'src/vs/workbench/contrib/callHierarchy/browser/callHierarchy.contribution.ts',
			'src/vs/workbench/contrib/callHierarchy/common/callHierarchy.ts',
			'src/vs/workbench/contrib/chat/browser/actions/chatCodeblockActions.ts',
			'src/vs/workbench/contrib/chat/browser/actions/chatContextActions.ts',
			'src/vs/workbench/contrib/chat/browser/actions/chatToolActions.ts',
			'src/vs/workbench/contrib/chat/browser/chatAttachmentWidgets.ts',
			'src/vs/workbench/contrib/chat/browser/chatContentParts/chatConfirmationWidget.ts',
			'src/vs/workbench/contrib/chat/browser/chatContentParts/chatMultiDiffContentPart.ts',
			'src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingActions.ts',
			'src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingEditorActions.ts',
			'src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingServiceImpl.ts',
			'src/vs/workbench/contrib/chat/browser/chatInputPart.ts',
			'src/vs/workbench/contrib/chat/browser/chatSessions.contribution.ts',
			'src/vs/workbench/contrib/chat/browser/chatSessions/common.ts',
			'src/vs/workbench/contrib/chat/browser/chatSessions/view/sessionsTreeRenderer.ts',
			'src/vs/workbench/contrib/chat/browser/chatWidget.ts',
			'src/vs/workbench/contrib/chat/browser/contrib/chatDynamicVariables.ts',
			'src/vs/workbench/contrib/chat/common/chatAgents.ts',
			'src/vs/workbench/contrib/chat/common/chatModel.ts',
			'src/vs/workbench/contrib/chat/common/chatModes.ts',
			'src/vs/workbench/contrib/chat/common/chatService.ts',
			'src/vs/workbench/contrib/chat/common/chatServiceImpl.ts',
			'src/vs/workbench/contrib/chat/common/chatSessionsService.ts',
			'src/vs/workbench/contrib/chat/common/chatWidgetHistoryService.ts',
			'src/vs/workbench/contrib/chat/common/languageModelToolsService.ts',
			'src/vs/workbench/contrib/chat/common/languageModels.ts',
			'src/vs/workbench/contrib/chat/common/promptSyntax/service/promptsServiceImpl.ts',
			'src/vs/workbench/contrib/chat/common/tools/manageTodoListTool.ts',
			'src/vs/workbench/contrib/chat/test/common/languageModels.ts',
			'src/vs/workbench/contrib/chat/test/common/mockLanguageModelToolsService.ts',
			'src/vs/workbench/contrib/chat/test/common/mockPromptsService.ts',
			'src/vs/workbench/contrib/codeEditor/browser/inspectEditorTokens/inspectEditorTokens.ts',
			'src/vs/workbench/contrib/codeEditor/browser/outline/documentSymbolsOutline.ts',
			'src/vs/workbench/contrib/codeEditor/electron-browser/selectionClipboard.ts',
			'src/vs/workbench/contrib/commands/common/commands.contribution.ts',
			'src/vs/workbench/contrib/comments/browser/commentNode.ts',
			'src/vs/workbench/contrib/comments/browser/commentThreadBody.ts',
			'src/vs/workbench/contrib/comments/browser/commentsAccessibleView.ts',
			'src/vs/workbench/contrib/comments/browser/commentsTreeViewer.ts',
			'src/vs/workbench/contrib/comments/browser/commentsView.ts',
			'src/vs/workbench/contrib/comments/browser/reactionsAction.ts',
			'src/vs/workbench/contrib/customEditor/browser/customEditorInputFactory.ts',
			'src/vs/workbench/contrib/customEditor/browser/customEditors.ts',
			'src/vs/workbench/contrib/customEditor/common/customEditor.ts',
			'src/vs/workbench/contrib/debug/browser/breakpointWidget.ts',
			'src/vs/workbench/contrib/debug/browser/breakpointsView.ts',
			'src/vs/workbench/contrib/debug/browser/callStackView.ts',
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
			'src/vs/workbench/contrib/debug/common/debug.ts',
			'src/vs/workbench/contrib/debug/common/debugModel.ts',
			'src/vs/workbench/contrib/debug/common/debugger.ts',
			'src/vs/workbench/contrib/debug/common/replModel.ts',
			'src/vs/workbench/contrib/debug/test/common/mockDebug.ts',
			'src/vs/workbench/contrib/editSessions/common/editSessionsStorageClient.ts',
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
			'src/vs/workbench/contrib/extensions/electron-browser/extensionProfileService.ts',
			'src/vs/workbench/contrib/extensions/electron-browser/runtimeExtensionsEditor.ts',
			'src/vs/workbench/contrib/format/browser/formatActionsMultiple.ts',
			'src/vs/workbench/contrib/inlineChat/browser/inlineChatActions.ts',
			'src/vs/workbench/contrib/inlineChat/browser/inlineChatController.ts',
			'src/vs/workbench/contrib/inlineChat/browser/inlineChatStrategies.ts',
			'src/vs/workbench/contrib/issue/browser/issueReporterModel.ts',
			'src/vs/workbench/contrib/list/browser/tableColumnResizeQuickPick.ts',
			'src/vs/workbench/contrib/markdown/browser/markdownDocumentRenderer.ts',
			'src/vs/workbench/contrib/markdown/browser/markdownSettingRenderer.ts',
			'src/vs/workbench/contrib/markers/browser/markers.contribution.ts',
			'src/vs/workbench/contrib/markers/browser/markersTable.ts',
			'src/vs/workbench/contrib/markers/browser/markersView.ts',
			'src/vs/workbench/contrib/mergeEditor/browser/commands/commands.ts',
			'src/vs/workbench/contrib/mergeEditor/browser/utils.ts',
			'src/vs/workbench/contrib/mergeEditor/browser/view/editorGutter.ts',
			'src/vs/workbench/contrib/mergeEditor/browser/view/mergeEditor.ts',
			'src/vs/workbench/contrib/notebook/browser/contrib/clipboard/notebookClipboard.ts',
			'src/vs/workbench/contrib/notebook/browser/contrib/find/notebookFind.ts',
			'src/vs/workbench/contrib/notebook/browser/contrib/layout/layoutActions.ts',
			'src/vs/workbench/contrib/notebook/browser/contrib/multicursor/notebookMulticursor.ts',
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
			'src/vs/workbench/contrib/notebook/browser/notebookEditorWidget.ts',
			'src/vs/workbench/contrib/notebook/browser/outputEditor/notebookOutputEditor.ts',
			'src/vs/workbench/contrib/notebook/browser/services/notebookEditorServiceImpl.ts',
			'src/vs/workbench/contrib/notebook/browser/view/notebookCellList.ts',
			'src/vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView.ts',
			'src/vs/workbench/contrib/notebook/browser/view/renderers/webviewMessages.ts',
			'src/vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.ts',
			'src/vs/workbench/contrib/notebook/browser/viewModel/cellEditorOptions.ts',
			'src/vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel.ts',
			'src/vs/workbench/contrib/notebook/browser/viewParts/notebookEditorStickyScroll.ts',
			'src/vs/workbench/contrib/notebook/browser/viewParts/notebookHorizontalTracker.ts',
			'src/vs/workbench/contrib/notebook/browser/viewParts/notebookKernelQuickPickStrategy.ts',
			'src/vs/workbench/contrib/notebook/browser/viewParts/notebookViewZones.ts',
			'src/vs/workbench/contrib/notebook/common/model/notebookCellOutputTextModel.ts',
			'src/vs/workbench/contrib/notebook/common/model/notebookCellTextModel.ts',
			'src/vs/workbench/contrib/notebook/common/model/notebookMetadataTextModel.ts',
			'src/vs/workbench/contrib/notebook/common/model/notebookTextModel.ts',
			'src/vs/workbench/contrib/notebook/common/notebookCommon.ts',
			'src/vs/workbench/contrib/notebook/common/notebookEditorModelResolverServiceImpl.ts',
			'src/vs/workbench/contrib/notebook/common/notebookRange.ts',
			'src/vs/workbench/contrib/notebook/test/browser/testNotebookEditor.ts',
			'src/vs/workbench/contrib/outline/browser/outlinePane.ts',
			'src/vs/workbench/contrib/outline/browser/outlineViewState.ts',
			'src/vs/workbench/contrib/output/browser/outputView.ts',
			'src/vs/workbench/contrib/output/common/outputChannelModel.ts',
			'src/vs/workbench/contrib/performance/electron-browser/startupProfiler.ts',
			'src/vs/workbench/contrib/preferences/browser/keybindingsEditor.ts',
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
			'src/vs/workbench/contrib/search/browser/searchWidget.ts',
			'src/vs/workbench/contrib/search/common/cacheState.ts',
			'src/vs/workbench/contrib/search/test/browser/mockSearchTree.ts',
			'src/vs/workbench/contrib/searchEditor/browser/searchEditor.contribution.ts',
			'src/vs/workbench/contrib/searchEditor/browser/searchEditorActions.ts',
			'src/vs/workbench/contrib/searchEditor/browser/searchEditorInput.ts',
			'src/vs/workbench/contrib/snippets/browser/commands/configureSnippets.ts',
			'src/vs/workbench/contrib/snippets/browser/commands/insertSnippet.ts',
			'src/vs/workbench/contrib/snippets/browser/snippetsFile.ts',
			'src/vs/workbench/contrib/snippets/browser/snippetsService.ts',
			'src/vs/workbench/contrib/tasks/browser/abstractTaskService.ts',
			'src/vs/workbench/contrib/tasks/browser/runAutomaticTasks.ts',
			'src/vs/workbench/contrib/tasks/browser/task.contribution.ts',
			'src/vs/workbench/contrib/tasks/browser/terminalTaskSystem.ts',
			'src/vs/workbench/contrib/tasks/common/jsonSchema_v1.ts',
			'src/vs/workbench/contrib/tasks/common/jsonSchema_v2.ts',
			'src/vs/workbench/contrib/tasks/common/problemMatcher.ts',
			'src/vs/workbench/contrib/tasks/common/taskConfiguration.ts',
			'src/vs/workbench/contrib/tasks/common/taskSystem.ts',
			'src/vs/workbench/contrib/tasks/common/tasks.ts',
			'src/vs/workbench/contrib/terminal/browser/remoteTerminalBackend.ts',
			'src/vs/workbench/contrib/terminal/browser/terminalConfigurationService.ts',
			'src/vs/workbench/contrib/terminal/browser/terminalExtensions.ts',
			'src/vs/workbench/contrib/terminal/browser/terminalProcessExtHostProxy.ts',
			'src/vs/workbench/contrib/terminal/browser/terminalProcessManager.ts',
			'src/vs/workbench/contrib/terminal/browser/terminalProfileQuickpick.ts',
			'src/vs/workbench/contrib/terminal/browser/terminalProfileService.ts',
			'src/vs/workbench/contrib/terminal/browser/xterm/xtermTerminal.ts',
			'src/vs/workbench/contrib/terminal/common/basePty.ts',
			'src/vs/workbench/contrib/terminal/common/remote/remoteTerminalChannel.ts',
			'src/vs/workbench/contrib/terminal/common/terminal.ts',
			'src/vs/workbench/contrib/terminalContrib/links/browser/links.ts',
			'src/vs/workbench/contrib/terminalContrib/suggest/browser/terminalSuggestAddon.ts',
			'src/vs/workbench/contrib/testing/browser/testExplorerActions.ts',
			'src/vs/workbench/contrib/testing/browser/testingExplorerView.ts',
			'src/vs/workbench/contrib/testing/common/storedValue.ts',
			'src/vs/workbench/contrib/testing/common/testItemCollection.ts',
			'src/vs/workbench/contrib/testing/test/browser/testObjectTree.ts',
			'src/vs/workbench/contrib/themes/browser/themes.contribution.ts',
			'src/vs/workbench/contrib/timeline/browser/timelinePane.ts',
			'src/vs/workbench/contrib/typeHierarchy/browser/typeHierarchy.contribution.ts',
			'src/vs/workbench/contrib/typeHierarchy/common/typeHierarchy.ts',
			'src/vs/workbench/contrib/update/browser/update.ts',
			'src/vs/workbench/contrib/userDataSync/browser/userDataSync.ts',
			'src/vs/workbench/contrib/webview/browser/overlayWebview.ts',
			'src/vs/workbench/contrib/webview/browser/webview.ts',
			'src/vs/workbench/contrib/webview/browser/webviewElement.ts',
			'src/vs/workbench/contrib/webviewPanel/browser/webviewEditor.ts',
			'src/vs/workbench/contrib/webviewPanel/browser/webviewEditorInputSerializer.ts',
			'src/vs/workbench/contrib/webviewPanel/browser/webviewWorkbenchService.ts',
			'src/vs/workbench/contrib/webviewView/browser/webviewViewPane.ts',
			'src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts',
			'src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedAccessibleView.ts',
			'src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedService.ts',
			'src/vs/workbench/contrib/welcomeViews/common/newFile.contribution.ts',
			'src/vs/workbench/contrib/welcomeWalkthrough/browser/walkThroughPart.ts',
			'src/vs/workbench/services/accounts/common/defaultAccount.ts',
			'src/vs/workbench/services/actions/common/menusExtensionPoint.ts',
			'src/vs/workbench/services/assignment/common/assignmentFilters.ts',
			'src/vs/workbench/services/authentication/common/authentication.ts',
			'src/vs/workbench/services/authentication/test/browser/authenticationQueryServiceMocks.ts',
			'src/vs/workbench/services/commands/common/commandService.ts',
			'src/vs/workbench/services/configuration/browser/configuration.ts',
			'src/vs/workbench/services/configuration/browser/configurationService.ts',
			'src/vs/workbench/services/configuration/common/configurationModels.ts',
			'src/vs/workbench/services/configuration/common/jsonEditingService.ts',
			'src/vs/workbench/services/configuration/test/common/testServices.ts',
			'src/vs/workbench/services/configurationResolver/browser/baseConfigurationResolverService.ts',
			'src/vs/workbench/services/configurationResolver/common/configurationResolver.ts',
			'src/vs/workbench/services/configurationResolver/common/configurationResolverExpression.ts',
			'src/vs/workbench/services/configurationResolver/common/variableResolver.ts',
			'src/vs/workbench/services/driver/browser/driver.ts',
			'src/vs/workbench/services/extensionManagement/browser/builtinExtensionsScannerService.ts',
			'src/vs/workbench/services/extensionManagement/browser/webExtensionsScannerService.ts',
			'src/vs/workbench/services/extensions/common/extHostCustomers.ts',
			'src/vs/workbench/services/extensions/common/extensionHostManager.ts',
			'src/vs/workbench/services/extensions/common/extensionHostProtocol.ts',
			'src/vs/workbench/services/extensions/common/extensionHostProxy.ts',
			'src/vs/workbench/services/extensions/common/extensionsRegistry.ts',
			'src/vs/workbench/services/extensions/common/lazyPromise.ts',
			'src/vs/workbench/services/extensions/common/polyfillNestedWorker.protocol.ts',
			'src/vs/workbench/services/extensions/common/proxyIdentifier.ts',
			'src/vs/workbench/services/extensions/common/rpcProtocol.ts',
			'src/vs/workbench/services/extensions/electron-browser/cachedExtensionScanner.ts',
			'src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts',
			'src/vs/workbench/services/extensions/worker/polyfillNestedWorker.ts',
			'src/vs/workbench/services/keybinding/browser/keybindingService.ts',
			'src/vs/workbench/services/keybinding/browser/keyboardLayoutService.ts',
			'src/vs/workbench/services/keybinding/common/keybindingEditing.ts',
			'src/vs/workbench/services/keybinding/common/keybindingIO.ts',
			'src/vs/workbench/services/keybinding/common/keymapInfo.ts',
			'src/vs/workbench/services/language/common/languageService.ts',
			'src/vs/workbench/services/languageDetection/browser/languageDetectionWorker.protocol.ts',
			'src/vs/workbench/services/languageStatus/common/languageStatusService.ts',
			'src/vs/workbench/services/outline/browser/outline.ts',
			'src/vs/workbench/services/outline/browser/outlineService.ts',
			'src/vs/workbench/services/preferences/common/preferences.ts',
			'src/vs/workbench/services/preferences/common/preferencesModels.ts',
			'src/vs/workbench/services/preferences/common/preferencesValidation.ts',
			'src/vs/workbench/services/remote/browser/remoteAgentService.ts',
			'src/vs/workbench/services/remote/common/tunnelModel.ts',
			'src/vs/workbench/services/search/common/localFileSearchWorkerTypes.ts',
			'src/vs/workbench/services/search/common/replace.ts',
			'src/vs/workbench/services/search/common/search.ts',
			'src/vs/workbench/services/search/common/searchExtConversionTypes.ts',
			'src/vs/workbench/services/search/common/searchExtTypes.ts',
			'src/vs/workbench/services/search/common/searchService.ts',
			'src/vs/workbench/services/search/node/fileSearch.ts',
			'src/vs/workbench/services/search/node/rawSearchService.ts',
			'src/vs/workbench/services/search/node/ripgrepTextSearchEngine.ts',
			'src/vs/workbench/services/search/worker/localFileSearch.ts',
			'src/vs/workbench/services/telemetry/browser/workbenchCommonProperties.ts',
			'src/vs/workbench/services/terminal/common/embedderTerminalService.ts',
			'src/vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.worker.ts',
			'src/vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateWorkerHost.ts',
			'src/vs/workbench/services/textMate/browser/textMateTokenizationFeatureImpl.ts',
			'src/vs/workbench/services/textMate/common/TMGrammarFactory.ts',
			'src/vs/workbench/services/themes/browser/fileIconThemeData.ts',
			'src/vs/workbench/services/themes/browser/productIconThemeData.ts',
			'src/vs/workbench/services/themes/browser/workbenchThemeService.ts',
			'src/vs/workbench/services/themes/common/colorThemeData.ts',
			'src/vs/workbench/services/themes/common/plistParser.ts',
			'src/vs/workbench/services/themes/common/themeExtensionPoints.ts',
			'src/vs/workbench/services/themes/common/workbenchThemeService.ts',
			'src/vs/workbench/services/userActivity/common/userActivityRegistry.ts',
			'src/vs/workbench/services/userData/browser/userDataInit.ts',
			'src/vs/workbench/services/userDataProfile/browser/userDataProfileInit.ts',
			'src/vs/workbench/services/userDataSync/browser/userDataSyncInit.ts',
			'src/vs/workbench/services/userDataSync/browser/userDataSyncWorkbenchService.ts',
			'src/vs/workbench/services/userDataSync/common/userDataSync.ts',
			'src/vs/workbench/test/browser/workbenchTestServices.ts',
			'src/vs/workbench/test/common/workbenchTestServices.ts',
			'src/vs/workbench/test/electron-browser/workbenchTestServices.ts',
			'src/vs/workbench/workbench.web.main.internal.ts',
			'src/vs/workbench/workbench.web.main.ts',
			// Server
			'src/vs/server/node/extensionHostConnection.ts',
			'src/vs/server/node/remoteAgentEnvironmentImpl.ts',
			'src/vs/server/node/remoteExtensionHostAgentServer.ts',
			'src/vs/server/node/remoteExtensionsScanner.ts',
			'src/vs/server/node/remoteTerminalChannel.ts',
			'src/vs/server/node/server.cli.ts',
			'src/vs/server/node/serverConnectionToken.ts',
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
					'fixToUnknown': true
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
						'change',
						'close',
						'collapse',
						'create',
						'delete',
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
						'@parcel/watcher',
						'@vscode/sqlite3',
						'@vscode/vscode-languagedetection',
						'@vscode/ripgrep',
						'@vscode/iconv-lite-umd',
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
						'minimist',
						'node:module',
						'native-keymap',
						'native-watchdog',
						'net',
						'node-pty',
						'os',
						// 'path', NOT allowed: use src/vs/base/common/path.ts instead
						'perf_hooks',
						'readline',
						'stream',
						'string_decoder',
						'tas-client-umd',
						'tls',
						'undici',
						'undici-types',
						'url',
						'util',
						'v8-inspect-profiler',
						'vscode-regexpp',
						'vscode-textmate',
						'worker_threads',
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
						'zlib'
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
					'target': 'src/vs/platform/*/~',
					'restrictions': [
						'vs/base/~',
						'vs/base/parts/*/~',
						'vs/platform/*/~',
						'tas-client-umd', // node module allowed even in /common/
						'@microsoft/1ds-core-js', // node module allowed even in /common/
						'@microsoft/1ds-post-js', // node module allowed even in /common/
						'@xterm/headless' // node module allowed even in /common/
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
						'tas-client-umd', // node module allowed even in /common/
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
						'vs/workbench/contrib/terminal/terminal.all.js'
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
						'vs/workbench/workbench.common.main.js'
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
					'target': 'src/vs/{loader.d.ts,monaco.d.ts,nls.ts,nls.messages.ts}',
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
				}
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
			'@typescript-eslint/naming-convention': [
				'warn',
				{
					'selector': 'default',
					'modifiers': ['private'],
					'format': null,
					'leadingUnderscore': 'require'
				},
				{
					'selector': 'default',
					'modifiers': ['public'],
					'format': null,
					'leadingUnderscore': 'forbid'
				}
			]
		}
	},
	// Additional extension strictness rules
	{
		files: [
			'extensions/markdown-language-features/**/*.ts',
			'extensions/mermaid-chat-features/**/*.ts',
			'extensions/media-preview/**/*.ts',
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
);
