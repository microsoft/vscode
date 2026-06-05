/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import * as vscode from 'vscode';
import { InlineCompletionModelInfo, InlineCompletionProviderOption } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { JointCompletionsProviderStrategy, JointCompletionsProviderTriggerChangeStrategy } from '../../../platform/inlineEdits/common/dataTypes/jointCompletionsProviderOptions';
import { InlineEditRequestLogContext } from '../../../platform/inlineEdits/common/inlineEditLogContext';
import { ObservableGit } from '../../../platform/inlineEdits/common/observableGit';
import { checkIfCursorAtEndOfLine, shortenOpportunityId } from '../../../platform/inlineEdits/common/utils/utils';
import { NesHistoryContextProvider } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';
import { ILogger, ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ErrorUtils } from '../../../util/common/errors';
import { isNotebookCell } from '../../../util/common/notebooks';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { assertNever, softAssert } from '../../../util/vs/base/common/assert';
import { raceCancellation, raceTimeout } from '../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, derived, derivedDisposable, observableFromEvent } from '../../../util/vs/base/common/observable';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { URI } from '../../../util/vs/base/common/uri';
import { StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { Range } from '../../../util/vs/editor/common/core/range';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';
import { registerUnificationCommands } from '../../completions-core/vscode-node/completionsServiceBridges';
import { GhostTextCompletionItem, GhostTextCompletionList } from '../../completions-core/vscode-node/extension/src/ghostText/ghostTextProvider';
import { CopilotInlineCompletionItemProvider } from '../../completions-core/vscode-node/extension/src/vscodeInlineCompletionItemProvider';
import { ICopilotInlineCompletionItemProviderService } from '../../completions/common/copilotInlineCompletionItemProviderService';
import { CompletionsCoreContribution } from '../../completions/vscode-node/completionsCoreContribution';
import { unificationStateObservable } from '../../completions/vscode-node/completionsUnificationContribution';
import { NesChangeHint } from '../common/nesTriggerHint';
import { NESInlineCompletionContext } from '../node/nextEditProvider';
import { TelemetrySender } from '../node/nextEditProviderTelemetry';
import { ExpectedEditCaptureController } from './components/expectedEditCaptureController';
import { InlineEditDebugComponent, reportFeedbackCommandId } from './components/inlineEditDebugComponent';
import { LogContextRecorder } from './components/logContextRecorder';
import { DiagnosticsNextEditProvider } from './features/diagnosticsInlineEditProvider';
import { InlineCompletionProviderImpl, NesCompletionItem, NesCompletionList } from './inlineCompletionProvider';
import { InlineEditModel } from './inlineEditModel';
import { captureExpectedAbortCommandId, captureExpectedConfirmCommandId, captureExpectedStartCommandId, captureExpectedSubmitCommandId, clearCacheCommandId, InlineEditProviderFeature, InlineEditProviderFeatureContribution, learnMoreCommandId, learnMoreLink, reportNotebookNESIssueCommandId } from './inlineEditProviderFeature';
import { InlineEditLogger } from './parts/inlineEditLogger';
import { VSCodeWorkspace } from './parts/vscodeWorkspace';
import { makeSettable } from './utils/observablesUtils';

export class JointCompletionsProviderContribution extends Disposable implements IExtensionContribution {

	private static NES_GROUP_ID = 'nes';
	private static COMPLETIONS_GROUP_ID = 'completions';

	private readonly _inlineEditsProviderId = makeSettable(this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsProviderId, this._expService));

	private readonly _hideInternalInterface = this._configurationService.getConfigObservable(ConfigKey.TeamInternal.InlineEditsHideInternalInterface);
	private readonly _enableDiagnosticsProvider = this._configurationService.getExperimentBasedConfigObservable(ConfigKey.InlineEditsEnableDiagnosticsProvider, this._expService);
	// FIXME@ulugbekna: re-enable when yieldTo is supported
	// private readonly _yieldToCopilot = this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsYieldToCopilot, this._expService);
	private readonly _excludedProviders = this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsExcludedProviders, this._expService).map(v => v ? v.split(',').map(v => v.trim()).filter(v => v !== '') : []);
	private readonly _copilotToken = observableFromEvent(this, this._authenticationService.onDidAuthenticationChange, () => this._authenticationService.copilotToken);

	public readonly inlineEditsEnabled = derived(this, (reader) => {
		const copilotToken = this._copilotToken.read(reader);
		if (copilotToken === undefined) {
			return false;
		}
		if (copilotToken.isCompletionsQuotaExceeded) {
			return false;
		}
		return true;
	});

	private readonly _internalActionsEnabled = derived(this, (reader) => {
		return !!this._copilotToken.read(reader)?.isInternal && !this._hideInternalInterface.read(reader);
	});

	public readonly isInlineEditsLogFileEnabledObservable = this._configurationService.getConfigObservable(ConfigKey.TeamInternal.InlineEditsLogContextRecorderEnabled);

	private readonly _workspace = derivedDisposable(this, _reader => {
		return this._instantiationService.createInstance(VSCodeWorkspace);
	});


	constructor(
		@IVSCodeExtensionContext private readonly _vscodeExtensionContext: IVSCodeExtensionContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICopilotInlineCompletionItemProviderService private readonly _copilotInlineCompletionItemProviderService: ICopilotInlineCompletionItemProviderService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IEnvService private readonly _envService: IEnvService,
	) {
		super();

		const useJointCompletionsProviderObs = _configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsJointCompletionsProviderEnabled, _expService);

		this._register(autorun((reader) => { // FX
			const useJointCompletionsProvider = useJointCompletionsProviderObs.read(reader);
			if (!useJointCompletionsProvider) {
				reader.store.add(_instantiationService.createInstance(InlineEditProviderFeatureContribution));
				reader.store.add(_instantiationService.createInstance(CompletionsCoreContribution));
				return;
			}

			const inlineEditFeature = _instantiationService.createInstance(InlineEditProviderFeature);
			inlineEditFeature.setContext();

			const unificationState = unificationStateObservable(this);

			reader.store.add(autorun((reader) => {
				const unificationStateValue = unificationState.read(reader);

				const excludes = this._excludedProviders.read(reader).slice();

				let inlineEditProvider: InlineCompletionProviderImpl | undefined = undefined;
				if (!excludes.includes(JointCompletionsProviderContribution.NES_GROUP_ID) && this.inlineEditsEnabled.read(reader)) {
					const logger = reader.store.add(this._instantiationService.createInstance(InlineEditLogger));

					const statelessProviderId = this._inlineEditsProviderId.read(reader);

					const workspace = this._workspace.read(reader);
					const git = reader.store.add(this._instantiationService.createInstance(ObservableGit));
					const historyContextProvider = new NesHistoryContextProvider(workspace, git);

					let diagnosticsProvider: DiagnosticsNextEditProvider | undefined = undefined;
					if (this._enableDiagnosticsProvider.read(reader)) {
						diagnosticsProvider = reader.store.add(this._instantiationService.createInstance(DiagnosticsNextEditProvider, workspace, git));
					}

					const model = reader.store.add(this._instantiationService.createInstance(InlineEditModel, statelessProviderId, workspace, historyContextProvider, diagnosticsProvider));

					const recordingDirPath = join(this._vscodeExtensionContext.globalStorageUri.fsPath, 'logContextRecordings');

					const isInlineEditLogFileEnabled = this.isInlineEditsLogFileEnabledObservable.read(reader);

					let logContextRecorder: LogContextRecorder | undefined;
					if (isInlineEditLogFileEnabled) {
						logContextRecorder = reader.store.add(this._instantiationService.createInstance(LogContextRecorder, recordingDirPath, logger));
					} else {
						void LogContextRecorder.cleanupOldRecordings(recordingDirPath);
					}

					const inlineEditDebugComponent = reader.store.add(new InlineEditDebugComponent(this._internalActionsEnabled, this.inlineEditsEnabled, model.debugRecorder, this._inlineEditsProviderId));

					const telemetrySender = reader.store.add(this._instantiationService.createInstance(TelemetrySender, workspace));

					// Create the expected edit capture controller
					const expectedEditCaptureController = reader.store.add(this._instantiationService.createInstance(
						ExpectedEditCaptureController,
						model.debugRecorder
					));

					inlineEditProvider = this._instantiationService.createInstance(InlineCompletionProviderImpl, model, logger, logContextRecorder, inlineEditDebugComponent, telemetrySender, expectedEditCaptureController);

					reader.store.add(vscode.commands.registerCommand(learnMoreCommandId, () => {
						this._envService.openExternal(URI.parse(learnMoreLink));
					}));

					reader.store.add(vscode.commands.registerCommand(clearCacheCommandId, () => {
						model.nextEditProvider.clearCache();
					}));

					reader.store.add(vscode.commands.registerCommand(reportNotebookNESIssueCommandId, () => {
						const activeNotebook = vscode.window.activeNotebookEditor;
						const document = vscode.window.activeTextEditor?.document;
						if (!activeNotebook || !document || !isNotebookCell(document.uri)) {
							return;
						}
						const doc = model.workspace.getDocumentByTextDocument(document);
						const selection = activeNotebook.selection;
						if (!selection || !doc) {
							return;
						}

						const logContext = new InlineEditRequestLogContext(doc.id.uri, document.version, undefined);
						logContext.recordingBookmark = model.debugRecorder.createBookmark();
						void vscode.commands.executeCommand(reportFeedbackCommandId, { logContext });
					}));

					// Register expected edit capture commands
					reader.store.add(vscode.commands.registerCommand(captureExpectedStartCommandId, () => {
						void expectedEditCaptureController.startCapture('manual');
					}));

					reader.store.add(vscode.commands.registerCommand(captureExpectedConfirmCommandId, () => {
						void expectedEditCaptureController.confirmCapture();
					}));

					reader.store.add(vscode.commands.registerCommand(captureExpectedAbortCommandId, () => {
						void expectedEditCaptureController.abortCapture();
					}));

					reader.store.add(vscode.commands.registerCommand(captureExpectedSubmitCommandId, () => {
						void expectedEditCaptureController.submitCaptures();
					}));
				}

				let completionsProvider: CopilotInlineCompletionItemProvider | undefined;
				{
					const configEnabled = this._configurationService.getExperimentBasedConfigObservable<boolean>(ConfigKey.TeamInternal.InlineEditsEnableGhCompletionsProvider, this._expService).read(reader);
					const extensionUnification = unificationStateValue?.extensionUnification ?? false;

					// respect excludes if NES is enabled
					const isExcluded = excludes.includes(JointCompletionsProviderContribution.COMPLETIONS_GROUP_ID) && this.inlineEditsEnabled.read(reader);

					// @ulugbekna: note that we don't want it if modelUnification is on
					const modelUnification = unificationStateValue?.modelUnification ?? false;
					if (
						(!modelUnification || unificationStateValue?.codeUnification || extensionUnification || configEnabled || this._copilotToken.read(reader)?.isNoAuthUser) &&
						!isExcluded
					) {
						completionsProvider = this._copilotInlineCompletionItemProviderService.getOrCreateProvider() as CopilotInlineCompletionItemProvider;
					}

					void vscode.commands.executeCommand('setContext', 'github.copilot.extensionUnification.activated', extensionUnification);

					if (extensionUnification && completionsProvider) {
						const completionsInstaService = this._copilotInlineCompletionItemProviderService.getOrCreateInstantiationService();
						reader.store.add(completionsInstaService.invokeFunction(registerUnificationCommands));
					}
				}

				const singularProvider = reader.store.add(this._instantiationService.createInstance(JointCompletionsProvider, completionsProvider, inlineEditProvider));

				if (unificationStateValue?.modelUnification) {
					if (!excludes.includes('github.copilot')) {
						excludes.push('github.copilot');
					}
				}

				reader.store.add(vscode.languages.registerInlineCompletionItemProvider(
					'*',
					singularProvider,
					{
						displayName: inlineEditProvider?.displayName,
						debounceDelayMs: 0, // set 0 debounce to ensure consistent delays/timings
						groupId: 'nes',
						excludes,
					})
				);

			}));
		}));
	}
}

type SingularCompletionItem =
	| ({ source: 'completions' } & GhostTextCompletionItem)
	| ({ source: 'inlineEdits' } & NesCompletionItem)
	;

type SingularCompletionList =
	| ({ source: 'completions' } & GhostTextCompletionList)
	| ({ source: 'inlineEdits' } & NesCompletionList)
	;

function toCompletionsList(list: GhostTextCompletionList): SingularCompletionList {
	return { ...list, items: list.items.map(item => ({ ...item, source: 'completions' })), source: 'completions' };
}

function toInlineEditsList(list: NesCompletionList): SingularCompletionList {
	return { ...list, items: list.items.map(item => ({ ...item, source: 'inlineEdits' })), source: 'inlineEdits' };
}

type LastNesSuggestion = {
	docUri: vscode.Uri;
	docVersionId: number;
	docWithNesEditApplied: StringText;
	completionItem: NesCompletionItem;
};

class JointCompletionsProvider extends Disposable implements vscode.InlineCompletionItemProvider {

	private readonly _onDidChangeEmitter: vscode.EventEmitter<NesChangeHint> | undefined;
	public readonly onDidChange?: vscode.Event<NesChangeHint> | undefined;

	private _requestsInFlight = new Set<CancellationToken>();
	private _completionsRequestsInFlight = new Set<CancellationToken>();

	private get _isRequestInFlight(): boolean {
		return this._requestsInFlight.size > 0;
	}

	private get _isCompletionsRequestInFlight(): boolean {
		return this._completionsRequestsInFlight.size > 0;
	}

	private _logger: ILogger;

	//#region Model picker
	public readonly onDidChangeModelInfo = this._inlineEditProvider?.onDidChangeModelInfo;
	public readonly setCurrentModelId = this._inlineEditProvider?.setCurrentModelId?.bind(this._inlineEditProvider);
	public get modelInfo(): InlineCompletionModelInfo | undefined {
		return this._inlineEditProvider?.modelInfo;
	}
	//#endregion

	//#region Provider options
	public readonly onDidChangeProviderOptions = this._inlineEditProvider?.onDidChangeProviderOptions;
	public readonly setProviderOptionValue = this._inlineEditProvider?.setProviderOptionValue?.bind(this._inlineEditProvider);
	public get providerOptions(): readonly InlineCompletionProviderOption[] | undefined {
		return this._inlineEditProvider?.providerOptions;
	}
	//#endregion

	constructor(
		private readonly _completionsProvider: CopilotInlineCompletionItemProvider | undefined,
		private readonly _inlineEditProvider: InlineCompletionProviderImpl | undefined,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@ILogService logService: ILogService,
	) {
		super();

		this._logger = logService.createSubLogger(['NES', 'JointCompletionsProvider']);

		// Only set up the onDidChange emitter if the inlineEditProvider has one to channel
		if (this._inlineEditProvider?.onDidChange) {
			this._onDidChangeEmitter = this._register(new vscode.EventEmitter<NesChangeHint>());
			this.onDidChange = this._onDidChangeEmitter.event;

			this._register(this._inlineEditProvider.onDidChange((changeHint) => {
				const strategy = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsJointCompletionsProviderTriggerChangeStrategy, this._expService);
				switch (strategy) {
					case JointCompletionsProviderTriggerChangeStrategy.AlwaysTrigger:
						break;
					case JointCompletionsProviderTriggerChangeStrategy.NoTriggerOnRequestInFlight:
						if (this._isRequestInFlight) {
							this._logger.trace('Skipping onDidChange event firing because request is in flight');
							return;
						}
						break;
					case JointCompletionsProviderTriggerChangeStrategy.NoTriggerOnCompletionsRequestInFlight:
						if (this._isCompletionsRequestInFlight) {
							this._logger.trace('Skipping onDidChange event firing because completions request is in flight');
							return;
						}
						break;
					default:
						assertNever(strategy);
				}
				this._logger.trace('Firing onDidChange event');
				this._onDidChangeEmitter!.fire(changeHint);
			}));
		}

		softAssert(
			_completionsProvider?.onDidChange === undefined,
			'CompletionsProvider does not implement onDidChange'
		);
	}

	public async provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): Promise<SingularCompletionList | undefined> {
		const logger = this._logger.createSubLogger([shortenOpportunityId(context.requestUuid), 'provideInlineCompletionItems']);

		const strategy = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsJointCompletionsProviderStrategy, this._expService);

		switch (strategy) {
			case JointCompletionsProviderStrategy.Regular:
				return this.provideInlineCompletionItemsRegular(document, position, context, token, logger);
			case JointCompletionsProviderStrategy.CursorEndOfLine:
				return this.provideInlineCompletionItemsCursorEndOfLine(document, position, context, token, logger);
			default:
				assertNever(strategy);
		}
	}

	private async provideInlineCompletionItemsCursorEndOfLine(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken, logger: ILogger): Promise<SingularCompletionList | undefined> {
		const sw = new StopWatch();

		this._requestsInFlight.add(token);
		const disp = token.onCancellationRequested(() => {
			this._requestsInFlight.delete(token);
		});
		try {
			if (this._completionsProvider === undefined && this._inlineEditProvider === undefined) {
				logger.trace('Return: neither completions nor NES provider available');
				return undefined;

			} else if (this._completionsProvider === undefined && this._inlineEditProvider !== undefined) {
				logger.trace('only NES provider is available, invoking it');
				const r = await this._invokeNESProvider(logger, document, position, false, context, token, sw);
				return r ? toInlineEditsList(r) : undefined;

			} else if (this._completionsProvider !== undefined && this._inlineEditProvider === undefined) {
				logger.trace('only completions provider is available, invoking it');
				const r = await this._invokeCompletionsProvider(logger, document, position, context, token, sw);
				return r ? toCompletionsList(r) : undefined;
			} else {

				const cursorLine = document.lineAt(position.line).text;
				const isCursorAtEndOfLine = checkIfCursorAtEndOfLine(cursorLine, position.character);

				if (isCursorAtEndOfLine) {
					logger.trace('cursor is at end of line, invoking ghost-text provider only');
					const r = await this._invokeCompletionsProvider(logger, document, position, context, token, sw);
					return r ? toCompletionsList(r) : undefined;
				}

				const r = await this._invokeNESProvider(logger, document, position, false, context, token, sw);
				return r ? toInlineEditsList(r) : undefined;
			}
		} finally {
			if (!token.isCancellationRequested) {
				this._logger.trace('request in flight: false -- due to provider finishing');
				this._requestsInFlight.delete(token);
			}
			disp.dispose();
		}
	}

	private lastNesSuggestion: null | LastNesSuggestion = null;
	private provideInlineCompletionItemsInvocationCount = 0;

	private async provideInlineCompletionItemsRegular(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken, logger: ILogger): Promise<SingularCompletionList | undefined> {

		const invocationId = ++this.provideInlineCompletionItemsInvocationCount;
		const completionsCts = new CancellationTokenSource(token);
		const nesCts = new CancellationTokenSource(token);

		this._requestsInFlight.add(token);
		const disp1 = token.onCancellationRequested(() => {
			logger.trace(`invocation #${invocationId}: request in flight: false -- due to cancellation`);
			this._requestsInFlight.delete(token);
		});
		logger.trace(`invocation #${invocationId} started; request in flight: true`);

		let saveLastNesSuggestion: null | LastNesSuggestion = null;
		try {
			const docSnapshot = new StringText(document.getText());
			const docVersionId = document.version;

			if (this.lastNesSuggestion && this.lastNesSuggestion.docUri.toString() !== document.uri.toString()) {
				logger.trace('last NES suggestion is not for the current document, ignoring');
				this.lastNesSuggestion = null;
			}

			const list = await this._provideInlineCompletionItemsRegular({ document, docSnapshot }, position, this.lastNesSuggestion, context, logger, { coreToken: token, completionsCts, nesCts });

			if (token.isCancellationRequested) {
				return list;
			}

			if (!list || list.source !== 'inlineEdits' || list.items.length === 0) {
				return list;
			}

			const firstItem = (list.items as NesCompletionItem[])[0];
			if (!firstItem.range || typeof firstItem.insertText !== 'string') {
				return list;
			}

			if (firstItem.uri && firstItem.uri.toString() !== document.uri.toString()) {
				logger.trace(`The NES suggestion is for a different document (${firstItem.uri.toString()} vs ${document.uri.toString()}), not saving as last NES suggestion`);
				return list;
			}

			const applied = applyTextEdit(docSnapshot, firstItem.range, firstItem.insertText);
			saveLastNesSuggestion = {
				docUri: document.uri,
				docVersionId,
				docWithNesEditApplied: new StringText(applied),
				completionItem: firstItem,
			};

			return list;
		} finally {
			if (!token.isCancellationRequested) {
				logger.trace(`invocation #${invocationId}: request in flight: false -- due to provider finishing`);
				this._requestsInFlight.delete(token);
			}
			disp1.dispose();

			// Only save the last NES suggestion if this is the latest invocation
			if (invocationId === this.provideInlineCompletionItemsInvocationCount) {
				this.lastNesSuggestion = saveLastNesSuggestion;
				if (this.lastNesSuggestion) {
					logger.trace(`Set the last NES suggestion for document ${this.lastNesSuggestion.docUri.toString()}`);
				} else {
					logger.trace(`Cleared the last NES suggestion`);
				}
			} else {
				logger.trace(`Not setting the last NES suggestion because a newer invocation exists`);
			}

			completionsCts.dispose();
			nesCts.dispose();
		}
	}

	private async _provideInlineCompletionItemsRegular(
		{ document, docSnapshot }: { document: vscode.TextDocument; docSnapshot: StringText },
		position: vscode.Position,
		lastNesSuggestion: null | LastNesSuggestion,
		context: vscode.InlineCompletionContext,
		logger: ILogger,
		tokens: { coreToken: CancellationToken; completionsCts: CancellationTokenSource; nesCts: CancellationTokenSource },
	): Promise<SingularCompletionList | undefined> {

		const sw = new StopWatch();

		if (this._completionsProvider === undefined && this._inlineEditProvider === undefined) {
			logger.trace('Return: neither completions nor NES provider available');
			return undefined;
		}

		logger.trace('requesting completions and/or NES');

		// we don't want to trigger completions on selection change events
		const isTriggeredDueToSelectionChange = context && (context as NESInlineCompletionContext).changeHint !== undefined;

		if (!lastNesSuggestion || !lastNesSuggestion.completionItem.wasShown) {
			// prefer completions unless there are none
			logger.trace(`defaulting to yielding to completions; last NES suggestion is ${lastNesSuggestion ? 'not shown' : 'not available'}`);
			const completionsP = isTriggeredDueToSelectionChange ? undefined : this._invokeCompletionsProvider(logger, document, position, context, tokens.completionsCts.token, sw);
			const nesP = this._invokeNESProvider(logger, document, position, true, context, tokens.nesCts.token, sw);
			return this._returnCompletionsOrOtherwiseNES(completionsP, nesP, docSnapshot, sw, logger, tokens);
		}

		logger.trace(`last NES suggestion is for the current document, checking if it agrees with the current suggestion`);

		const enforceCacheDelay = (lastNesSuggestion.docVersionId !== document.version);
		const nesP = this._invokeNESProvider(logger, document, position, enforceCacheDelay, context, tokens.nesCts.token, sw);
		if (!nesP) {
			logger.trace(`no NES provider`);
			const completionsP = isTriggeredDueToSelectionChange ? undefined : this._invokeCompletionsProvider(logger, document, position, context, tokens.completionsCts.token, sw);
			return this._returnCompletionsOrOtherwiseNES(completionsP, nesP, docSnapshot, sw, logger, tokens);
		}

		const NES_CACHE_WAIT_MS = 10;
		// scoping the variables
		{
			logger.trace(`giving the NES provider ${NES_CACHE_WAIT_MS}ms to return what it has in its cache`);
			const fastNesResult = await raceCancellation(
				raceTimeout(
					nesP,
					NES_CACHE_WAIT_MS
				),
				tokens.coreToken
			);

			// got nes quickly
			if (fastNesResult && this.doesNesSuggestionAgree(docSnapshot, lastNesSuggestion.docWithNesEditApplied, (fastNesResult.items as NesCompletionItem[]).at(0))) {
				logger.trace('last NES suggestion agrees with the current suggestion, using NES');
				const list: SingularCompletionList = toInlineEditsList(fastNesResult);
				logger.trace(`Return: returning NES result in ${sw.elapsed()}ms`);
				return list;
			}

			if (tokens.coreToken.isCancellationRequested) {
				logger.trace(`suggestions request was cancelled`);
				void setEndOfLifeReason(this._completionsProvider, undefined, { kind: vscode.InlineCompletionsDisposeReasonKind.TokenCancellation });
				void setEndOfLifeReason(this._inlineEditProvider, nesP, { kind: vscode.InlineCompletionsDisposeReasonKind.TokenCancellation });
				tokens.completionsCts.cancel();
				tokens.nesCts.cancel();
				return undefined;
			}
		}

		logger.trace(`the NES provider did not return in ${NES_CACHE_WAIT_MS}ms so we are triggering the completions provider too`);
		const completionsP = isTriggeredDueToSelectionChange ? undefined : this._invokeCompletionsProvider(logger, document, position, context, tokens.completionsCts.token, sw);

		const suggestionsList = await raceCancellation(
			Promise.race(coalesce([
				completionsP?.then(res => ({ type: 'completions' as const, res })),
				nesP?.then(res => ({ type: 'nes' as const, res })),
			])),
			tokens.coreToken
		);

		// got cancelled
		if (suggestionsList === undefined) {
			logger.trace(`suggestions request was cancelled`);
			void setEndOfLifeReason(this._completionsProvider, completionsP, { kind: vscode.InlineCompletionsDisposeReasonKind.TokenCancellation });
			void setEndOfLifeReason(this._inlineEditProvider, nesP, { kind: vscode.InlineCompletionsDisposeReasonKind.TokenCancellation });
			tokens.completionsCts.cancel();
			tokens.nesCts.cancel();
			return undefined;
		}

		// got NES first
		if (suggestionsList.type === 'nes' && suggestionsList.res && this.doesNesSuggestionAgree(docSnapshot, lastNesSuggestion.docWithNesEditApplied, (suggestionsList.res.items as NesCompletionItem[]).at(0))) {
			logger.trace('last NES suggestion agrees with the current suggestion, using NES');
			return this._returnNES(suggestionsList.res, { kind: vscode.InlineCompletionsDisposeReasonKind.NotTaken }, completionsP, sw, logger, tokens);
		}

		logger.trace('falling back to the default because completions came first or NES disagreed');
		return this._returnCompletionsOrOtherwiseNES(completionsP, nesP, docSnapshot, sw, logger, tokens);
	}

	private _invokeNESProvider(logger: ILogger, document: vscode.TextDocument, position: vscode.Position, enforceCacheDelay: boolean, context: vscode.InlineCompletionContext, ct: CancellationToken, sw: StopWatch) {
		const changeHint = context.changeHint === undefined || NesChangeHint.is(context.changeHint) ? context.changeHint as NesChangeHint | undefined : undefined;
		const nesContext: NESInlineCompletionContext = { ...context, enforceCacheDelay, changeHint };
		let nesP: Promise<NesCompletionList | undefined> | undefined;
		if (this._inlineEditProvider) {
			logger.trace(`- requesting NES provideInlineCompletionItems`);
			nesP = this._inlineEditProvider.provideInlineCompletionItems(document, position, nesContext, ct);
			nesP.then((nesR) => {
				logger.trace(`got NES response in ${sw.elapsed()}ms -- ${nesR === undefined ? 'undefined' : `with ${nesR.items.length} items`}`);
			}).catch((e) => {
				logger.trace(`NES provider errored after ${sw.elapsed()}ms -- ${ErrorUtils.toString(ErrorUtils.fromUnknown(e))}`);
			});
		} else {
			logger.trace(`- no NES provider`);
			nesP = undefined;
		}
		return nesP;
	}

	private _invokeCompletionsProvider(logger: ILogger, document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, ct: CancellationToken, sw: StopWatch) {
		let completionsP: Promise<GhostTextCompletionList | undefined> | undefined;
		if (this._completionsProvider) {
			this._completionsRequestsInFlight.add(ct);
			const disp = ct.onCancellationRequested(() => this._completionsRequestsInFlight.delete(ct));
			const cleanup = () => {
				this._completionsRequestsInFlight.delete(ct);
				disp.dispose();
			};
			try { // in case the provider throws synchronously
				logger.trace(`- requesting completions provideInlineCompletionItems`);
				completionsP = this._completionsProvider.provideInlineCompletionItems(document, position, context, ct);
				completionsP.then((completionsR) => {
					logger.trace(`got completions response in ${sw.elapsed()}ms -- ${completionsR === undefined ? 'undefined' : `with ${completionsR.items.length} items`}`);
				}).catch((e) => {
					logger.trace(`completions provider errored after ${sw.elapsed()}ms -- ${ErrorUtils.toString(ErrorUtils.fromUnknown(e))}`);
				}).finally(() => {
					cleanup();
				});
			} catch (e) {
				cleanup();
				logger.trace(`completions provider threw synchronously after ${sw.elapsed()}ms -- ${ErrorUtils.toString(ErrorUtils.fromUnknown(e))}`);
				throw e;
			}
		} else {
			logger.trace(`- no completions provider`);
			completionsP = undefined;
		}
		return completionsP;
	}

	private async _returnCompletionsOrOtherwiseNES(
		completionsP: Promise<GhostTextCompletionList | undefined> | undefined,
		nesP: Promise<NesCompletionList | undefined> | undefined,
		docSnapshot: StringText,
		sw: StopWatch,
		logger: ILogger,
		tokens: { coreToken: CancellationToken; completionsCts: CancellationTokenSource; nesCts: CancellationTokenSource },
	): Promise<SingularCompletionList | undefined> {
		logger.trace(`waiting for completions and/or NES responses`);

		const completionsR = completionsP ? await completionsP : undefined;
		logger.trace(`completions response received`);

		if (completionsR && completionsR.items.length > 0) {
			const filteredCompletionR = JointCompletionsProvider.retainOnlyMeaningfulEdits(docSnapshot, completionsR);
			if (filteredCompletionR.items.length === 0) {
				logger.trace(`all completions edits are no-op, ignoring completions response`);
			} else {
				logger.trace(`using completions response, cancelling NES provider`);
				return this._returnCompletions(filteredCompletionR, { kind: vscode.InlineCompletionsDisposeReasonKind.LostRace }, nesP, sw, logger, tokens);
			}
		}

		const nesR = nesP ? await nesP : undefined;
		logger.trace(`NES response received`);

		if (nesR && nesR.items.length > 0) {
			const filteredNesR = JointCompletionsProvider.retainOnlyMeaningfulEdits(docSnapshot, nesR);
			if (filteredNesR.items.length === 0) {
				logger.trace(`all NES edits are no-op, ignoring NES response`);
			} else {
				logger.trace(`using NES response`);
				return this._returnNES(filteredNesR, { kind: vscode.InlineCompletionsDisposeReasonKind.NotTaken }, completionsP, sw, logger, tokens);
			}
		}

		// return empty completions
		return this._returnCompletions(completionsR, { kind: vscode.InlineCompletionsDisposeReasonKind.NotTaken }, nesP, sw, logger, tokens);
	}

	private _returnCompletions(
		completionsR: GhostTextCompletionList | undefined,
		nesDisposeReason: vscode.InlineCompletionsDisposeReason,
		nesP: Promise<NesCompletionList | undefined> | undefined,
		sw: StopWatch,
		logger: ILogger,
		tokens: { coreToken: CancellationToken; completionsCts: CancellationTokenSource; nesCts: CancellationTokenSource },
	): SingularCompletionList | undefined {
		void setEndOfLifeReason(this._inlineEditProvider, nesP, nesDisposeReason);
		tokens.nesCts.cancel(); // cancel NES request if still pending
		if (completionsR === undefined) {
			logger.trace(`Return: no completions to return in ${sw.elapsed()}ms`);
			return undefined;
		}
		const list: SingularCompletionList = toCompletionsList(completionsR);
		logger.trace(`Return: use completions response in ${sw.elapsed()}ms`);
		return list;
	}

	private _returnNES(
		nesR: NesCompletionList,
		completionsDisposeReason: vscode.InlineCompletionsDisposeReason,
		completionsP: Promise<GhostTextCompletionList | undefined> | undefined,
		sw: StopWatch,
		logger: ILogger,
		tokens: { coreToken: CancellationToken; completionsCts: CancellationTokenSource; nesCts: CancellationTokenSource },
	): SingularCompletionList {
		void setEndOfLifeReason(this._completionsProvider, completionsP, completionsDisposeReason);
		tokens.completionsCts.cancel(); // cancel completions request if still pending
		const list: SingularCompletionList = toInlineEditsList(nesR);
		logger.trace(`Return: returning NES result in ${sw.elapsed()}ms`);
		return list;
	}

	private doesNesSuggestionAgree(doc: StringText, docWithNesEditApplied: StringText, nesEdit: NesCompletionItem | undefined): boolean {
		if (nesEdit === undefined || nesEdit.range === undefined || typeof nesEdit.insertText !== 'string') {
			return false;
		}
		const applied = applyTextEdit(doc, nesEdit.range, nesEdit.insertText);
		return applied === docWithNesEditApplied.getValue();
	}

	private static retainOnlyMeaningfulEdits<T extends vscode.InlineCompletionList>(docSnapshot: StringText, list: T): T {
		// meaningful = not noop
		function isMeaningfulEdit(item: T['items'][number]): boolean {
			if (item.range === undefined || // must be a completion with a side-effect, eg a command invocation or something
				typeof item.insertText !== 'string' // shouldn't happen
			) {
				return true;
			}
			const originalSnippet = docSnapshot.getValueOfRange(new Range(
				item.range.start.line + 1,
				item.range.start.character + 1,
				item.range.end.line + 1,
				item.range.end.character + 1,
			));
			return originalSnippet !== item.insertText;
		}
		const filteredEdits = list.items.filter(isMeaningfulEdit);
		if (filteredEdits.length === list.items.length) {
			return list;
		}
		return { ...list, items: filteredEdits };
	}

	public handleDidShowCompletionItem?(completionItem: SingularCompletionItem, updatedInsertText: string): void {
		switch (completionItem.source) {
			case 'completions':
				this._completionsProvider?.handleDidShowCompletionItem?.(completionItem);
				break;
			case 'inlineEdits':
				this._inlineEditProvider?.handleDidShowCompletionItem?.(completionItem, updatedInsertText);
				break;
			default:
				assertNever(completionItem);
		}
	}

	public handleDidPartiallyAcceptCompletionItem?(completionItem: SingularCompletionItem, acceptedLength: number & vscode.PartialAcceptInfo): void {
		switch (completionItem.source) {
			case 'completions':
				this._completionsProvider?.handleDidPartiallyAcceptCompletionItem?.(completionItem, acceptedLength);
				break;
			case 'inlineEdits':
				softAssert(this._inlineEditProvider?.handleDidPartiallyAcceptCompletionItem === undefined, 'InlineEditProvider does not implement handleDidPartiallyAcceptCompletionItem');
				break;
			default:
				assertNever(completionItem);
		}
	}

	public handleEndOfLifetime?(completionItem: SingularCompletionItem, reason: vscode.InlineCompletionEndOfLifeReason): void {
		switch (completionItem.source) {
			case 'completions':
				this._completionsProvider?.handleEndOfLifetime?.(completionItem, reason);
				break;
			case 'inlineEdits':
				this._inlineEditProvider?.handleEndOfLifetime?.(completionItem, reason);
				break;
			default:
				assertNever(completionItem);
		}
	}

	public handleListEndOfLifetime?(list: SingularCompletionList, reason: vscode.InlineCompletionsDisposeReason): void {
		switch (list.source) {
			case 'completions':
				this._completionsProvider?.handleListEndOfLifetime?.(list, reason);
				break;
			case 'inlineEdits':
				this._inlineEditProvider?.handleListEndOfLifetime?.(list, reason);
				break;
			default:
				assertNever(list);
		}
	}

	// neither provider implements this deprecated method
	public handleDidRejectCompletionItem = undefined;
}

function applyTextEdit(doc: StringText, range: vscode.Range, insertText: string): string {
	const rangeOneBased = new Range(range.start.line + 1, range.start.character + 1, range.end.line + 1, range.end.character + 1);
	const offsetRange = doc.getTransformer().getOffsetRange(rangeOneBased);
	const edit = new StringReplacement(offsetRange, insertText);
	const bigEdit = edit.toEdit();
	return bigEdit.apply(doc.getValue());
}

async function setEndOfLifeReason(provider: vscode.InlineCompletionItemProvider | undefined, promise: Promise<vscode.InlineCompletionList | undefined> | undefined, reason: vscode.InlineCompletionsDisposeReason) {
	if (promise === undefined) {
		return;
	}
	const result = await promise;
	if (result === undefined) {
		return;
	}
	for (const item of result.items) {
		provider?.handleEndOfLifetime?.(item, { kind: vscode.InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false });
	}
	provider?.handleListEndOfLifetime?.(result, reason);
}
