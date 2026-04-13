/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { CancellationToken, Command, EndOfLine, InlineCompletionContext, InlineCompletionDisplayLocation, InlineCompletionDisplayLocationKind, InlineCompletionEndOfLifeReason, InlineCompletionEndOfLifeReasonKind, InlineCompletionItem, InlineCompletionItemProvider, InlineCompletionList, InlineCompletionModelInfo, InlineCompletionProviderOption, InlineCompletionsDisposeReason, InlineCompletionsDisposeReasonKind, NotebookCell, NotebookCellKind, Position, Range, TextDocument, TextDocumentShowOptions, Uri, window, workspace } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IDiffService } from '../../../platform/diff/common/diffService';
import { stringEditFromDiff } from '../../../platform/editing/common/edit';
import { DocumentEditRecorder } from '../../../platform/editSurvivalTracking/common/editComputer';
import { EditSurvivalReporter } from '../../../platform/editSurvivalTracking/common/editSurvivalReporter';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { InlineEditRequestLogContext } from '../../../platform/inlineEdits/common/inlineEditLogContext';
import { IInlineEditsModelService } from '../../../platform/inlineEdits/common/inlineEditsModelService';
import { shortenOpportunityId } from '../../../platform/inlineEdits/common/utils/utils';
import { ILogger, ILogService } from '../../../platform/log/common/logService';
import { getNotebookId } from '../../../platform/notebook/common/helpers';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { CapturingToken } from '../../../platform/requestLogger/common/capturingToken';
import { IRequestLogger } from '../../../platform/requestLogger/common/requestLogger';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { findCell, findNotebook, isNotebookCell } from '../../../util/common/notebooks';
import { assert } from '../../../util/vs/base/common/assert';
import { raceCancellation, timeout } from '../../../util/vs/base/common/async';
import { CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { BugIndicatingError, onUnexpectedError } from '../../../util/vs/base/common/errors';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { clamp } from '../../../util/vs/base/common/numbers';
import { autorun, IObservable, observableFromEvent } from '../../../util/vs/base/common/observable';
import { basename } from '../../../util/vs/base/common/path';
import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LineCheck } from '../../inlineChat/vscode-node/naturalLanguageHint';
import { createCorrelationId } from '../common/correlationId';
import { NesChangeHint } from '../common/nesTriggerHint';
import { NESInlineCompletionContext } from '../node/nextEditProvider';
import { NextEditProviderTelemetryBuilder, TelemetrySender } from '../node/nextEditProviderTelemetry';
import { INextEditResult, NextEditResult } from '../node/nextEditResult';
import { ExpectedEditCaptureController } from './components/expectedEditCaptureController';
import { InlineCompletionCommand, InlineEditDebugComponent } from './components/inlineEditDebugComponent';
import { LogContextRecorder } from './components/logContextRecorder';
import { DiagnosticsNextEditResult } from './features/diagnosticsInlineEditProvider';
import { InlineEditModel } from './inlineEditModel';
import { learnMoreCommandId, learnMoreLink } from './inlineEditProviderFeature';
import { toInlineSuggestion } from './isInlineSuggestion';
import { InlineEditLogger } from './parts/inlineEditLogger';
import { IVSCodeObservableDocument } from './parts/vscodeWorkspace';
import { raceAndAll } from './raceAndAll';
import { toExternalRange } from './utils/translations';

const learnMoreAction: Command = {
	title: l10n.t('Learn More'),
	command: learnMoreCommandId,
	tooltip: learnMoreLink
};

export interface NesCompletionItem extends InlineCompletionItem {
	readonly telemetryBuilder: NextEditProviderTelemetryBuilder;
	readonly info: NesCompletionInfo;
	wasShown: boolean;
	isEditInAnotherDocument?: boolean;
}

export class NesCompletionList extends InlineCompletionList {

	public override enableForwardStability = true;

	constructor(
		public readonly requestUuid: string,
		item: NesCompletionItem | undefined,
		public override readonly commands: InlineCompletionCommand[],
		public readonly telemetryBuilder: NextEditProviderTelemetryBuilder,
	) {
		super(item === undefined ? [] : [item]);
	}
}

abstract class BaseNesCompletionInfo<T extends INextEditResult> {

	public abstract source: string;

	constructor(
		public readonly suggestion: T,
		public readonly documentId: DocumentId,
		public readonly document: TextDocument,
		public readonly requestUuid: string
	) { }
}

class LlmCompletionInfo extends BaseNesCompletionInfo<NextEditResult> {
	public readonly source = 'provider';
}

class DiagnosticsCompletionInfo extends BaseNesCompletionInfo<DiagnosticsNextEditResult> {
	public readonly source = 'diagnostics';
}

type NesCompletionInfo = LlmCompletionInfo | DiagnosticsCompletionInfo;

function isLlmCompletionInfo(item: NesCompletionInfo): item is LlmCompletionInfo {
	return item.source === 'provider';
}

const GoToNextEdit = l10n.t('Go To Inline Suggestion');


export class InlineCompletionProviderImpl extends Disposable implements InlineCompletionItemProvider {
	public readonly displayName = 'Inline Suggestion';

	private readonly _logger: ILogger;

	public readonly onDidChange = this.model.onChange;
	public readonly handleDidPartiallyAcceptCompletionItem = undefined;
	public readonly handleDidRejectCompletionItem = undefined;

	//#region Model picker
	private _isModelPickerEnabled: IObservable<boolean> = this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsModelPickerEnabled, this._expService);

	public modelInfo: InlineCompletionModelInfo | undefined;

	private readonly _onDidChangeModelInfo = this._register(new Emitter<void>());
	public onDidChangeModelInfo = this._onDidChangeModelInfo.event;

	public setCurrentModelId: ((modelId: string) => Thenable<void>) | undefined;
	//#endregion

	//#region Provider options (Eagerness)
	private static readonly _aggressivenessOptionId = 'eagerness';

	providerOptions: readonly InlineCompletionProviderOption[] | undefined;

	private readonly _onDidChangeProviderOptions = this._register(new Emitter<void>());
	readonly onDidChangeProviderOptions = this._onDidChangeProviderOptions.event;

	setProviderOptionValue = async (optionId: string, valueId: string): Promise<void> => {
		if (optionId === InlineCompletionProviderImpl._aggressivenessOptionId) {
			await this._configurationService.setConfig(ConfigKey.Advanced.InlineEditsAggressiveness, valueId);
		}
	};
	//#endregion

	private readonly _displayNextEditorNES: boolean;
	private readonly _renameSymbolSuggestions: IObservable<boolean>;
	private readonly _inlineCompletionsAdvanced: IObservable<boolean>;

	constructor(
		private readonly model: InlineEditModel,
		private readonly logger: InlineEditLogger,
		private readonly logContextRecorder: LogContextRecorder | undefined,
		private readonly inlineEditDebugComponent: InlineEditDebugComponent | undefined,
		private readonly telemetrySender: TelemetrySender,
		private readonly expectedEditCaptureController: ExpectedEditCaptureController,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IDiffService private readonly _diffService: IDiffService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IGitExtensionService private readonly _gitExtensionService: IGitExtensionService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
		@IInlineEditsModelService private readonly _modelService: IInlineEditsModelService,
	) {
		super();
		this._logger = this._logService.createSubLogger(['NES', 'Provider']);
		this._displayNextEditorNES = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.UseAlternativeNESNotebookFormat, this._expService);
		this._renameSymbolSuggestions = this._configurationService.getExperimentBasedConfigObservable(ConfigKey.Advanced.InlineEditsRenameSymbolSuggestions, this._expService);
		this._inlineCompletionsAdvanced = this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsInlineCompletionsAdvanced, this._expService);

		this.setCurrentModelId = (modelId: string) => this._modelService.setCurrentModelId(modelId);

		const modelListUpdatedObs = observableFromEvent(this, this._modelService.onModelListUpdated, () => this._modelService.modelInfo);

		this._register(autorun(reader => {
			this.modelInfo = this._isModelPickerEnabled.read(reader) ? modelListUpdatedObs.read(reader) : undefined;
			this._onDidChangeModelInfo.fire();
		}));

		// Provider options: eagerness
		const aggressivenessObs = this._configurationService.getExperimentBasedConfigObservable(ConfigKey.Advanced.InlineEditsAggressiveness, this._expService);

		this._register(autorun(reader => {
			const current = aggressivenessObs.read(reader);
			this.providerOptions = [{
				id: InlineCompletionProviderImpl._aggressivenessOptionId,
				label: l10n.t('Eagerness'),
				values: [
					{ id: 'auto', label: l10n.t('Auto') },
					{ id: 'low', label: l10n.t('Low') },
					{ id: 'medium', label: l10n.t('Medium') },
					{ id: 'high', label: l10n.t('High') },
				],
				currentValueId: current,
			}];
			this._onDidChangeProviderOptions.fire();
		}));

	}

	// copied from `vscodeWorkspace.ts` `DocumentFilter#_enabledLanguages`
	private _isCompletionsEnabled(document: TextDocument): boolean {
		const enabledLanguages = this._configurationService.getConfig(ConfigKey.Enable);
		const enabledLanguagesMap = new Map(Object.entries(enabledLanguages));
		if (!enabledLanguagesMap.has('*')) {
			enabledLanguagesMap.set('*', false);
		}
		return enabledLanguagesMap.has(document.languageId) ? enabledLanguagesMap.get(document.languageId)! : enabledLanguagesMap.get('*')!;
	}

	public async provideInlineCompletionItems(
		document: TextDocument,
		position: Position,
		context: InlineCompletionContext | NESInlineCompletionContext,
		token: CancellationToken
	): Promise<NesCompletionList | undefined> {
		const label = `NES | ${basename(document.uri.fsPath)} (v${document.version})`;

		const capturingToken = new CapturingToken(label, undefined);

		assert(context.changeHint === undefined || NesChangeHint.is(context.changeHint), 'Expected changeHint to be of type TriggerNes or undefined');
		const changeHint = context.changeHint as NesChangeHint | undefined;
		const nesContext: NESInlineCompletionContext = { enforceCacheDelay: true, ...context, changeHint };

		return this._requestLogger.captureInvocation(capturingToken, () => this._provideInlineCompletionItems(document, position, nesContext, token));
	}

	private async _provideInlineCompletionItems(
		document: TextDocument,
		position: Position,
		context: NESInlineCompletionContext,
		token: CancellationToken
	): Promise<NesCompletionList | undefined> {
		const logger = this._logger.createSubLogger(['provideInlineCompletionItems', shortenOpportunityId(context.requestUuid)]);

		// Disable NES while capture mode is active to avoid interference
		if (this.expectedEditCaptureController.isCaptureActive) {
			logger.trace('Return: capture mode active');
			return undefined;
		}

		const isCompletionsEnabled = this._isCompletionsEnabled(document);

		const unification = this._configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsUnification, this._expService);

		const isInlineEditsEnabled = this._configurationService.getExperimentBasedConfig(ConfigKey.InlineEditsEnabled, this._expService, { languageId: document.languageId });

		const serveAsCompletionsProvider = unification && isCompletionsEnabled && !isInlineEditsEnabled;

		if (!isInlineEditsEnabled && !serveAsCompletionsProvider) {
			logger.trace('Return: inline edits disabled');
			return undefined;
		}

		const ignoreWhenSuggestVisible = this._configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsIgnoreWhenSuggestVisible, this._expService);

		if (ignoreWhenSuggestVisible && context.selectedCompletionInfo && !unification) {
			logger.trace('Return: suggest widget is showing, not providing NES');
			return undefined;
		}

		const doc = this.model.workspace.getDocumentByTextDocument(document);
		if (!doc) {
			logger.trace('Return: document not found in workspace');
			return undefined;
		}

		const documentVersion = (isNotebookCell(document.uri) ? findNotebook(document.uri, workspace.notebookDocuments)?.version : undefined) || document.version;
		const logContext = new InlineEditRequestLogContext(doc.id.uri, documentVersion, context);
		logContext.recordingBookmark = this.model.debugRecorder.createBookmark();
		this.logger.addLive(logContext);

		const telemetryBuilder = new NextEditProviderTelemetryBuilder(this._gitExtensionService, this._notebookService, this._workspaceService, this.model.nextEditProvider.ID, doc, this.model.debugRecorder, logContext.recordingBookmark);
		telemetryBuilder.setOpportunityId(context.requestUuid);
		telemetryBuilder.setConfigIsDiagnosticsNESEnabled(!!this.model.diagnosticsBasedProvider);
		telemetryBuilder.setIsNaturalLanguageDominated(LineCheck.isNaturalLanguageDominated(document, position));

		const requestCancellationTokenSource = new CancellationTokenSource(token);
		let suggestionInfo: NesCompletionInfo | undefined;
		try {
			logger.trace('invoking next edit provider');

			const { first, all } = raceAndAll([
				this.model.nextEditProvider.getNextEdit(doc.id, context, logContext, token, telemetryBuilder.nesBuilder).then(r => ({ kind: 'llm' as const, val: r })),
				(this.model.diagnosticsBasedProvider?.runUntilNextEdit(doc.id, context, logContext, 50, requestCancellationTokenSource.token, telemetryBuilder.diagnosticsBuilder)
					?? raceCancellation(new Promise<undefined>(() => { }), requestCancellationTokenSource.token)).then(r => ({ kind: 'diagnostics' as const, val: r }))
			], onUnexpectedError);

			const [llmSuggestion, diagnosticsSuggestion] = await first;

			let suggestion: {
				kind: 'llm';
				val: NextEditResult;
			} | {
				kind: 'diagnostics';
				val: DiagnosticsNextEditResult | undefined;
			};

			if (llmSuggestion !== undefined) {
				if (llmSuggestion.val.result !== undefined || this.model.diagnosticsBasedProvider === undefined) {
					suggestion = llmSuggestion;
				} else {
					logger.trace('giving some more time to diagnostics provider');
					const remainingTime = clamp(1250 - (Date.now() - context.requestIssuedDateTime), 0, 1250);
					timeout(remainingTime).then(() => requestCancellationTokenSource.cancel());
					[, suggestion] = await all;
				}
			} else if (diagnosticsSuggestion !== undefined) {
				if (diagnosticsSuggestion.val !== undefined && diagnosticsSuggestion.val.result !== undefined) {
					suggestion = diagnosticsSuggestion;
				} else {
					[suggestion] = await all;
				}
			} else {
				throw new BugIndicatingError('At least one of LLM NES or Diagnostics NES must be defined');
			}

			// Cancel ongoing requests
			requestCancellationTokenSource.cancel();

			const emptyList = new NesCompletionList(context.requestUuid, undefined, [], telemetryBuilder);
			const isFromCursorJump = suggestion.kind === 'llm' && (
				// edit came using cursor jump
				!!(suggestion.val.result?.isFromCursorJump) ||
				// no edit but cursor jump suggested jumping to a certain position
				!!(suggestion.val.result?.jumpToPosition)
			);
			const correlationId = createCorrelationId('nes', { isFromCursorJump });

			if (token.isCancellationRequested) {
				logger.trace('Return: lost race to cancellation');
				this.telemetrySender.scheduleSendingEnhancedTelemetry({ requestId: logContext.requestId, result: undefined }, telemetryBuilder);
				return emptyList;
			}

			// Determine which suggestion to use
			if (suggestion.kind === 'diagnostics' && suggestion.val && suggestion.val.result) {
				suggestionInfo = new DiagnosticsCompletionInfo(suggestion.val, doc.id, document, context.requestUuid);
			} else if (suggestion.kind === 'llm') {
				suggestionInfo = new LlmCompletionInfo(suggestion.val, doc.id, document, context.requestUuid);
			} else {
				this.telemetrySender.scheduleSendingEnhancedTelemetry({ requestId: logContext.requestId, result: undefined }, telemetryBuilder);
				return emptyList;
			}

			if (suggestionInfo.source === 'provider' && suggestionInfo.suggestion.result?.jumpToPosition !== undefined) {
				logger.trace('next edit suggestion only has jumpToPosition');
				this.telemetrySender.scheduleSendingEnhancedTelemetry(suggestionInfo.suggestion, telemetryBuilder);
				const positionToJumpOneBased = suggestionInfo.suggestion.result.jumpToPosition;
				const jumpToPosition = new Position(positionToJumpOneBased.lineNumber - 1, positionToJumpOneBased.column - 1);
				const targetDocumentId = suggestionInfo.suggestion.result.targetDocumentId;
				const jumpToPositionCompletionItem: NesCompletionItem = {
					insertText: undefined as unknown as string,
					info: suggestionInfo,
					wasShown: false,
					telemetryBuilder,
					jumpToPosition,
					...(targetDocumentId ? { uri: Uri.parse(targetDocumentId.uri) } : {}),
					correlationId
				};
				return new NesCompletionList(context.requestUuid, jumpToPositionCompletionItem, [], telemetryBuilder);
			}

			// Return and send telemetry if there is no result
			const result = suggestionInfo.suggestion.result;
			if (!result || !result.edit) {
				logger.trace('no next edit suggestion');
				this.telemetrySender.scheduleSendingEnhancedTelemetry(suggestionInfo.suggestion, telemetryBuilder);
				return emptyList;
			}

			logger.trace(`using next edit suggestion from ${suggestionInfo.source}`);
			let isInlineCompletion: boolean = false;
			let completionItem: Omit<NesCompletionItem, 'telemetryBuilder' | 'info' | 'showInlineEditMenu' | 'action' | 'wasShown' | 'isInlineEdit'> | undefined;

			// When the edit targets a different document, resolve the range against the target document
			const targetDocumentId = isLlmCompletionInfo(suggestionInfo) ? suggestionInfo.suggestion.result?.targetDocumentId : undefined;
			let resolveDoc = doc;
			if (targetDocumentId && targetDocumentId !== doc.id) {
				const targetTextDoc = this._workspaceService.textDocuments.find(d => d.uri.toString() === targetDocumentId.uri);
				const targetObsDoc = targetTextDoc ? this.model.workspace.getDocumentByTextDocument(targetTextDoc) : undefined;
				if (targetObsDoc) {
					resolveDoc = targetObsDoc;
				} else {
					logger.trace('no next edit suggestion: cross-file target document not found in workspace');
					this.telemetrySender.scheduleSendingEnhancedTelemetry(suggestionInfo.suggestion, telemetryBuilder);
					return emptyList;
				}
			}
			const documents = resolveDoc.fromOffsetRange(result.edit.replaceRange);
			const [targetDocument, range] = documents.length ? documents[0] : [undefined, undefined];

			addNotebookTelemetry(document, position, result.edit.newText, documents, telemetryBuilder);
			telemetryBuilder.setIsActiveDocument(window.activeTextEditor?.document === targetDocument);

			if (!targetDocument) {
				logger.trace('no next edit suggestion');
			} else if (hasNotebookCellMarker(document, result.edit.newText)) {
				logger.trace('no next edit suggestion, edits contain Notebook Cell Markers');
			} else if (isNotebookCell(targetDocument.uri) && this._displayNextEditorNES && targetDocument !== document) {
				// NES is for a different notebook cell
				completionItem = serveAsCompletionsProvider ?
					undefined :
					this.createNextEditorEditCompletionItem(position, {
						document: targetDocument,
						insertText: result.edit.newText,
						range
					});
			} else if (targetDocument === document) { // NES is for the active document
				const allowInlineCompletions = this.model.inlineEditsInlineCompletionsEnabled.get();
				const inlineSuggestion = allowInlineCompletions ? toInlineSuggestion(position, document, range, result.edit.newText, this._inlineCompletionsAdvanced.get()) : undefined;
				isInlineCompletion = !!inlineSuggestion;
				completionItem = serveAsCompletionsProvider && !isInlineCompletion ?
					undefined :
					this.createCompletionItem(doc, document, inlineSuggestion?.range ?? range, result, inlineSuggestion?.newText);
			} else { // NES is not for the active doc but a different one
				completionItem = serveAsCompletionsProvider ? undefined : {
					range,
					insertText: result.edit.newText,
					command: result.action,
					uri: targetDocument.uri,
				};
			}

			if (!completionItem) {
				this.telemetrySender.scheduleSendingEnhancedTelemetry(suggestionInfo.suggestion, telemetryBuilder);
				return emptyList;
			}

			const menuCommands: InlineCompletionCommand[] = [];
			if (this.inlineEditDebugComponent) {
				menuCommands.push(...this.inlineEditDebugComponent.getCommands(logContext));
			}


			// telemetry
			telemetryBuilder.setPickedNESType(suggestionInfo.source === 'diagnostics' ? 'diagnostics' : 'llm');
			logContext.setPickedNESType(suggestionInfo.source === 'diagnostics' ? 'diagnostics' : 'llm');
			telemetryBuilder.setPostProcessingOutcome({ edit: result.edit, displayLocation: result.displayLocation, isInlineCompletion });
			telemetryBuilder.setHadLlmNES(suggestionInfo.source === 'provider');
			telemetryBuilder.setHadDiagnosticsNES(suggestionInfo.source === 'diagnostics');
			all.then(([llmResult, diagnosticsResult]) => {
				telemetryBuilder.setHadLlmNES(!!llmResult?.val);
				telemetryBuilder.setHadDiagnosticsNES(!!diagnosticsResult?.val);
			});

			this.telemetrySender.scheduleSendingEnhancedTelemetry(suggestionInfo.suggestion, telemetryBuilder);

			const supportsRename = (document.languageId === 'typescript' || document.languageId === 'typescriptreact') && this._renameSymbolSuggestions.get();

			const nesCompletionItem: NesCompletionItem = {
				...completionItem,
				info: suggestionInfo,
				telemetryBuilder,
				action: learnMoreAction,
				isInlineEdit: !isInlineCompletion,
				showInlineEditMenu: !(unification && isInlineCompletion),
				wasShown: false,
				supportsRename,
				correlationId,
			};

			return new NesCompletionList(context.requestUuid, nesCompletionItem, menuCommands, telemetryBuilder);
		} catch (e) {
			logger.trace(`error: ${e}`);
			logContext.setError(e);

			try {
				this.telemetrySender.sendTelemetry(suggestionInfo?.suggestion, telemetryBuilder);
			} finally {
				telemetryBuilder.dispose();
			}

			throw e;
		} finally {
			logContext.markCompleted();
			requestCancellationTokenSource.dispose();
		}
	}

	private createNextEditorEditCompletionItem(requestingPosition: Position,
		nextEdit: { document: TextDocument; range: Range; insertText: string }
	): Omit<NesCompletionItem, 'telemetryBuilder' | 'info' | 'showInlineEditMenu' | 'action' | 'wasShown' | 'isInlineEdit'> {
		// Display the next edit in the current document, but with a command to open the next edit in the other document.
		// & range of this completion item will be the same as the current documents cursor position.
		const range = new Range(requestingPosition, requestingPosition);
		const displayLocation: InlineCompletionDisplayLocation = {
			range,
			label: GoToNextEdit,
			kind: InlineCompletionDisplayLocationKind.Label
		};

		const commandArgs: TextDocumentShowOptions = {
			preserveFocus: false,
			selection: new Range(nextEdit.range.start, nextEdit.range.start)
		};
		const command: Command = {
			command: 'vscode.open',
			title: GoToNextEdit,
			arguments: [nextEdit.document.uri, commandArgs]
		};
		return {
			range,
			insertText: nextEdit.insertText,
			showRange: range,
			command,
			displayLocation,
			isEditInAnotherDocument: true
		};
	}

	private createCompletionItem(
		doc: IVSCodeObservableDocument,
		document: TextDocument,
		range: Range,
		result: NonNullable<(NextEditResult | DiagnosticsNextEditResult)['result']>,
		insertTextOverride?: string,
	): Omit<NesCompletionItem, 'telemetryBuilder' | 'info' | 'showInlineEditMenu' | 'action' | 'wasShown' | 'isInlineEdit'> | undefined {

		if (!result.edit) {
			return undefined;
		}

		const displayLocationRange = result.displayLocation && doc.fromRange(document, toExternalRange(result.displayLocation.range));
		const displayLocation: InlineCompletionDisplayLocation | undefined = result.displayLocation && displayLocationRange ? {
			range: displayLocationRange,
			label: result.displayLocation.label,
			kind: InlineCompletionDisplayLocationKind.Code,
		} : undefined;


		return {
			range,
			insertText: insertTextOverride ?? result.edit.newText,
			displayLocation,
			command: result.action,
		};
	}

	public handleDidShowCompletionItem(completionItem: NesCompletionItem, _updatedInsertText: string): void {
		completionItem.wasShown = true;
		completionItem.telemetryBuilder.setAsShown();

		const info = completionItem.info;
		this.logContextRecorder?.handleShown(info.suggestion);

		if (isLlmCompletionInfo(info)) {
			this.model.nextEditProvider.handleShown(info.suggestion);
		} else {
			this.model.diagnosticsBasedProvider?.handleShown(info.suggestion);
		}
	}

	public handleListEndOfLifetime(list: NesCompletionList, reason: InlineCompletionsDisposeReason): void {
		const logger = this._logger.createSubLogger(['handleListEndOfLifetime', shortenOpportunityId(list.requestUuid)]);
		logger.trace(`List ${list.requestUuid} disposed, reason: ${InlineCompletionsDisposeReasonKind[reason.kind]}`);

		const telemetryBuilder = list.telemetryBuilder;

		const disposeReasonStr = InlineCompletionsDisposeReasonKind[reason.kind];

		telemetryBuilder.setDisposalReason(disposeReasonStr);

		this.telemetrySender.sendTelemetryForBuilder(telemetryBuilder);
	}

	public handleEndOfLifetime(item: NesCompletionItem, reason: InlineCompletionEndOfLifeReason): void {
		const logger = this._logger.createSubLogger(['handleEndOfLifetime', shortenOpportunityId(item.info.requestUuid)]);
		logger.trace(`reason: ${InlineCompletionEndOfLifeReasonKind[reason.kind]}`);

		switch (reason.kind) {
			case InlineCompletionEndOfLifeReasonKind.Accepted: {
				this._handleAcceptance(item);
				break;
			}
			case InlineCompletionEndOfLifeReasonKind.Rejected: {
				this._handleDidRejectCompletionItem(item);

				// Trigger expected edit capture if enabled
				if (this.expectedEditCaptureController.isEnabled && this.expectedEditCaptureController.captureOnReject) {
					// Get endpoint info from the log context if available (LLM suggestions only)
					const endpointInfo = isLlmCompletionInfo(item.info) ? item.info.suggestion.source.log.endpointInfo : undefined;
					const metadata = {
						requestUuid: item.info.requestUuid,
						providerInfo: item.info.source,
						modelName: endpointInfo?.modelName,
						endpointUrl: endpointInfo?.url,
						suggestionText: item.insertText?.toString(),
						suggestionRange: item.range ? [
							item.range.start.line,
							item.range.start.character,
							item.range.end.line,
							item.range.end.character
						] as [number, number, number, number] : undefined,
						documentPath: item.info.documentId.path
					};
					void this.expectedEditCaptureController.startCapture('rejection', metadata);
				}

				break;
			}
			case InlineCompletionEndOfLifeReasonKind.Ignored: {
				const supersededBy = reason.supersededBy ? (reason.supersededBy as NesCompletionItem) : undefined;
				logger.trace(`Superseded by: ${supersededBy?.info.requestUuid || 'none'}, was shown: ${item.wasShown}`);
				if (supersededBy) {
					/* __GDPR__
						"supersededInlineEdit" : {
							"owner": "ulugbekna",
							"comment": "Tracks when an inline edit was superseded by another edit.",
							"opportunityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The opportunity ID of the original inline edit." },
							"supersededByOpportunityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The opportunity ID of the inline edit that superseded the original edit." }
						}
					*/
					this._telemetryService.sendMSFTTelemetryEvent('supersededInlineEdit', { opportunityId: item.info.requestUuid, supersededByOpportunityId: supersededBy.info.requestUuid });
				}
				this._handleDidIgnoreCompletionItem(item, supersededBy);
				break;
			}
		}
	}

	private _handleAcceptance(item: NesCompletionItem) {
		this.logContextRecorder?.handleAcceptance(item.info.suggestion);

		item.telemetryBuilder.setAcceptance('accepted');
		item.telemetryBuilder.setStatus('accepted');

		const info = item.info;
		if (isLlmCompletionInfo(info)) {
			this.model.nextEditProvider.handleAcceptance(info.documentId, info.suggestion);
			if (!item.isEditInAnotherDocument) {
				this._trackSurvivalRate(info);
			}
		} else {
			this.model.diagnosticsBasedProvider?.handleAcceptance(info.documentId, info.suggestion);
		}
	}

	// TODO: Support tracking Diagnostics NES
	private async _trackSurvivalRate(item: LlmCompletionInfo) {
		const result = item.suggestion.result;
		if (!result || !result.edit) {
			return;
		}

		const docBeforeEdits = result.documentBeforeEdits.value;
		const docAfterEdits = result.edit.toEdit().apply(docBeforeEdits);

		const recorder = this._instantiationService.createInstance(DocumentEditRecorder, item.document);

		// Assumption: The user cannot edit the document while the inline edit is being applied
		let userEdits = StringEdit.empty;
		// softAssert(docAfterEdits === userEdits.apply(item.document.getText())); // TODO@hediet

		const diffedNextEdit = await stringEditFromDiff(docBeforeEdits, docAfterEdits, this._diffService);
		const recordedEdits = recorder.getEdits();

		userEdits = userEdits.compose(recordedEdits);

		this._instantiationService.createInstance(
			EditSurvivalReporter,
			item.document,
			result.documentBeforeEdits.value,
			diffedNextEdit,
			userEdits,
			{ includeArc: true },
			res => {
				/* __GDPR__
					"reportInlineEditSurvivalRate" : {
						"owner": "hediet",
						"comment": "Reports the survival rate for an inline edit.",
						"opportunityId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Unique identifier for an opportunity to show an NES." },

						"survivalRateFourGram": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The rate between 0 and 1 of how much of the AI edit is still present in the document." },
						"survivalRateNoRevert": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The rate between 0 and 1 of how much of the ranges the AI touched ended up being reverted." },
						"didBranchChange": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Indicates if the branch changed in the meantime. If the branch changed (value is 1), this event should probably be ignored." },
						"timeDelayMs": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The time delay between the user accepting the edit and measuring the survival rate." },
						"arc": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The accepted and restrained character count." }
					}
				*/
				this._telemetryService.sendTelemetryEvent('reportInlineEditSurvivalRate', { microsoft: true, github: { eventNamePrefix: 'copilot-nes/' } },
					{
						opportunityId: item.requestUuid,
					},
					{
						survivalRateFourGram: res.fourGram,
						survivalRateNoRevert: res.noRevert,
						didBranchChange: res.didBranchChange ? 1 : 0,
						timeDelayMs: res.timeDelayMs,
						arc: res.arc!,
					}
				);

			}
		);
	}

	private _handleDidRejectCompletionItem(completionItem: NesCompletionItem): void {
		this.logContextRecorder?.handleRejection(completionItem.info.suggestion);

		completionItem.telemetryBuilder.setAcceptance('rejected');
		completionItem.telemetryBuilder.setStatus('rejected');

		const info = completionItem.info;
		if (isLlmCompletionInfo(info)) {
			this.model.nextEditProvider.handleRejection(info.documentId, info.suggestion);
		} else {
			this.model.diagnosticsBasedProvider?.handleRejection(info.documentId, info.suggestion);
		}
	}

	private _handleDidIgnoreCompletionItem(item: NesCompletionItem, supersededBy?: NesCompletionItem): void {
		if (supersededBy) {
			item.telemetryBuilder.setSupersededBy(supersededBy.info.requestUuid);
		}

		const info = item.info;
		const supersededBySuggestion = supersededBy ? supersededBy.info.suggestion : undefined;
		if (isLlmCompletionInfo(info)) {
			this.model.nextEditProvider.handleIgnored(info.documentId, info.suggestion, supersededBySuggestion);
		} else {
			this.model.diagnosticsBasedProvider?.handleIgnored(info.documentId, info.suggestion, supersededBySuggestion);
		}
	}
}

function hasNotebookCellMarker(document: TextDocument, newText: string) {
	return isNotebookCell(document.uri) && newText.includes('%% vscode.cell [id=');
}

function addNotebookTelemetry(document: TextDocument, position: Position, newText: string, documents: [TextDocument, Range][], telemetryBuilder: NextEditProviderTelemetryBuilder) {
	const notebook = isNotebookCell(document.uri) ? findNotebook(document.uri, workspace.notebookDocuments) : undefined;
	const cell = notebook ? findCell(document.uri, notebook) : undefined;
	if (!cell || !notebook || !documents.length) {
		return;
	}
	const cellMarkerCount = newText.match(/%% vscode.cell \[id=/g)?.length || 0;
	const cellMarkerIndex = newText.indexOf('#%% vscode.cell [id=');
	const isMultiline = newText.includes('\n');
	const targetEol = documents[0][0].eol === EndOfLine.CRLF ? '\r\n' : '\n';
	const sourceEol = newText.includes('\r\n') ? '\r\n' : (newText.includes('\n') ? '\n' : targetEol);
	const nextEditor = window.visibleTextEditors.find(editor => editor.document === documents[0][0]);
	const isNextEditorRangeVisible = nextEditor && nextEditor.visibleRanges.some(range => range.contains(documents[0][1]));
	const notebookId = getNotebookId(notebook);
	const lineSuffix = `(${position.line}:${position.character})`;
	const suggestionLineSuffix = `(->${documents[0][1].start.line}:${documents[0][1].start.character})`;
	const getCellPrefix = (c: NotebookCell) => {
		if (c === cell) {
			return `*`;
		}
		if (c.document === documents[0][0]) {
			return `+`;
		}
		return '';
	};
	const lineCounts = notebook.getCells()
		.filter(c => c.kind === NotebookCellKind.Code)
		.map(c => `${getCellPrefix(c)}${c.document.lineCount}${c === cell ? lineSuffix : ''}${c.document === documents[0][0] ? suggestionLineSuffix : ''}`).join(',');
	telemetryBuilder.
		setNotebookCellMarkerIndex(cellMarkerIndex)
		.setNotebookCellMarkerCount(cellMarkerCount)
		.setIsMultilineEdit(isMultiline)
		.setIsEolDifferent(targetEol !== sourceEol)
		.setIsNextEditorVisible(!!nextEditor)
		.setIsNextEditorRangeVisible(!!isNextEditorRangeVisible)
		.setNotebookCellLines(lineCounts)
		.setNotebookId(notebookId)
		.setIsNESForOtherEditor(documents[0][0] !== document);
}
