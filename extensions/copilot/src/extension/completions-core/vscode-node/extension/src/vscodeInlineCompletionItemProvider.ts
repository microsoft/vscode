/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from 'path';
import {
	CancellationToken,
	InlineCompletionContext,
	InlineCompletionEndOfLifeReason,
	InlineCompletionItemProvider,
	InlineCompletionList,
	InlineCompletionsDisposeReason,
	InlineCompletionsDisposeReasonKind,
	InlineCompletionTriggerKind,
	PartialAcceptInfo,
	Position,
	TextDocument,
	workspace
} from 'vscode';
import { ILogger, ILogService, LogTarget } from '../../../../../platform/log/common/logService';
import { CapturingToken } from '../../../../../platform/requestLogger/common/capturingToken';
import { IRequestLogger } from '../../../../../platform/requestLogger/node/requestLogger';
import { softAssert } from '../../../../../util/vs/base/common/assert';
import { Disposable } from '../../../../../util/vs/base/common/lifecycle';
import { StopWatch } from '../../../../../util/vs/base/common/stopwatch';
import { LineEdit } from '../../../../../util/vs/editor/common/core/edits/lineEdit';
import { TextEdit, TextReplacement } from '../../../../../util/vs/editor/common/core/edits/textEdit';
import { Range } from '../../../../../util/vs/editor/common/core/range';
import { LineBasedText } from '../../../../../util/vs/editor/common/core/text/abstractText';
import { IInstantiationService, ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { NextEditProviderTelemetryBuilder, TelemetrySender } from '../../../../inlineEdits/node/nextEditProviderTelemetry';
import { InlineEditLogger } from '../../../../inlineEdits/vscode-node/parts/inlineEditLogger';
import { GhostTextLogContext } from '../../../common/ghostTextContext';
import { ICompletionsTelemetryService } from '../../bridge/src/completionsTelemetryServiceBridge';
import { BuildInfo } from '../../lib/src/config';
import { CopilotConfigPrefix } from '../../lib/src/constants';
import { handleException } from '../../lib/src/defaultHandlers';
import { Logger } from '../../lib/src/logger';
import { isCompletionEnabledForDocument } from './config';
import { CopilotCompletionFeedbackTracker, sendCompletionFeedbackCommand } from './copilotCompletionFeedbackTracker';
import { ICompletionsExtensionStatus } from './extensionStatus';
import { GhostTextCompletionItem, GhostTextCompletionList, GhostTextProvider } from './ghostText/ghostTextProvider';

function quickSuggestionsDisabled() {
	const qs = workspace.getConfiguration('editor.quickSuggestions');
	return qs.get('other') !== 'on' && qs.get('comments') !== 'on' && qs.get('strings') !== 'on';
}

const myLogger = new Logger('CopilotInlineCompletionItemProvider');

export function exception(accessor: ServicesAccessor, error: unknown, origin: string, logger?: Logger) {
	if (error instanceof Error && error.name === 'Canceled') {
		// these are VS Code cancellations
		return;
	}
	if (error instanceof Error && error.name === 'CodeExpectedError') {
		// expected errors from VS Code
		return;
	}
	const telemetryService = accessor.get(ICompletionsTelemetryService);
	telemetryService.sendGHTelemetryException(error, 'codeUnification.completions.exception');
	handleException(accessor, error, origin, logger);
}

/** @public */
export class CopilotInlineCompletionItemProvider extends Disposable implements InlineCompletionItemProvider {

	private readonly copilotCompletionFeedbackTracker: CopilotCompletionFeedbackTracker;

	private readonly ghostTextProvider: GhostTextProvider;

	private readonly inlineEditLogger: InlineEditLogger;

	private readonly telemetrySender: TelemetrySender;

	public onDidChange = undefined;

	private readonly logger: ILogger;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICompletionsTelemetryService private readonly telemetryService: ICompletionsTelemetryService,
		@ICompletionsExtensionStatus private readonly extensionStatusService: ICompletionsExtensionStatus,
		@ILogService logService: ILogService,
		@IRequestLogger private readonly requestLogger: IRequestLogger,
	) {
		super();
		this.copilotCompletionFeedbackTracker = this._register(this.instantiationService.createInstance(CopilotCompletionFeedbackTracker));
		this.ghostTextProvider = this.instantiationService.createInstance(GhostTextProvider);
		this.inlineEditLogger = this.instantiationService.createInstance(InlineEditLogger);
		this.telemetrySender = this.instantiationService.createInstance(TelemetrySender, undefined);
		this.logger = logService.createSubLogger(['Ghost', 'CopilotInlineCompletionItemProvider']);
	}

	async provideInlineCompletionItems(
		doc: TextDocument,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken
	): Promise<GhostTextCompletionList | undefined> {

		// it's ok to return an undefined here because we don't want telemetry for when automatic completions are disabled
		if (context.triggerKind === InlineCompletionTriggerKind.Automatic) {
			if (!this.instantiationService.invokeFunction(isCompletionEnabledForDocument, doc)) {
				return;
			}
			if (this.extensionStatusService.kind === 'Error') {
				return;
			}
		}

		const sw = new StopWatch();

		const label = `Ghost | ${basename(doc.uri.toString())} (v${doc.version})`;

		const capturingToken = new CapturingToken(label, undefined);

		return await this.requestLogger.captureInvocation(capturingToken, async () => {

			const logContext = new GhostTextLogContext(doc.uri.toString(), doc.version, context);

			const logger = this.logger.createSubLogger('provideInlineCompletionItems').withExtraTarget(LogTarget.fromCallback((_level, msg) => {
				logContext.trace(`[${Math.floor(sw.elapsed()).toString().padStart(4, ' ')}ms] ${msg}`);
			}));

			const telemetryBuilder = this.createTelemetryBuilder();
			telemetryBuilder.setOpportunityId(context.requestUuid);

			try {
				logger.trace('Started providing inline completion items');
				return await this._provideInlineCompletionItems(doc, position, context, telemetryBuilder, logContext, logger, token);
			} catch (e) {
				logContext.setError(e);
				this.telemetryService.sendGHTelemetryException(e, 'codeUnification.completions.exception');
				const emptyList = { items: [], telemetryBuilder }; // we need to return an empty list, such that vscode invokes endOfLife on it and we send telemetry
				return emptyList;
			} finally {
				this.inlineEditLogger.add(logContext);

				telemetryBuilder.nesBuilder.markEndTime();
			}
		});
	}

	private async _provideInlineCompletionItems(
		doc: TextDocument,
		position: Position,
		context: InlineCompletionContext,
		telemetryBuilder: NextEditProviderTelemetryBuilder,
		logContext: GhostTextLogContext,
		parentLogger: ILogger,
		token: CancellationToken,
	): Promise<GhostTextCompletionList> {

		const copilotConfig = workspace.getConfiguration(CopilotConfigPrefix);
		// Constraining the generated inline completion to match selectedCompletionInfo sandbags Copilot pretty hard, as
		// typically it's just the first entry in the list alphabetically.  But if we generate a result that doesn't
		// match it, VS Code won't show it to the user unless the completion dropdown is dismissed. Historically we've
		// chosen to favor completion quality, but this option allows opting into or out of generating a completion that
		// VS Code will actually show.
		if (!copilotConfig.get('respectSelectedCompletionInfo', quickSuggestionsDisabled() || BuildInfo.isPreRelease())) {
			context = { ...context, selectedCompletionInfo: undefined };
		}


		const emptyList = { items: [], telemetryBuilder }; // we need to return an empty list, such that vscode invokes endOfLife on it and we send telemetry

		try {
			const list = await this.ghostTextProvider.provideInlineCompletionItems(doc, position, context, telemetryBuilder, logContext, parentLogger, token);

			telemetryBuilder.nesBuilder.setHasNextEdit(list !== undefined && list.items.length > 0);

			if (!list) {
				if (token.isCancellationRequested) {
					logContext.setIsSkipped();
				} else {
					logContext.markAsNoSuggestions();
				}

				return emptyList;
			}

			this.logSuggestion(logContext, doc, list);
			logContext.setResponseResults(list.items);

			return {
				...list,
				commands: [sendCompletionFeedbackCommand],
			};
		} catch (e) {
			this.instantiationService.invokeFunction(exception, e, '._provideInlineCompletionItems', myLogger);
			logContext.setError(e);
		}

		return emptyList;
	}

	handleDidShowCompletionItem(item: GhostTextCompletionItem) {
		try {
			item.telemetryBuilder.setAsShown();
			this.copilotCompletionFeedbackTracker.trackItem(item);
			return this.ghostTextProvider.handleDidShowCompletionItem(item);
		} catch (e) {
			this.instantiationService.invokeFunction(exception, e, '.handleDidShowCompletionItem', myLogger);
		}
	}

	handleDidPartiallyAcceptCompletionItem(
		item: GhostTextCompletionItem,
		acceptedLengthOrInfo: number | PartialAcceptInfo
	) {
		try {
			return this.ghostTextProvider.handleDidPartiallyAcceptCompletionItem(item, acceptedLengthOrInfo);
		} catch (e) {
			this.instantiationService.invokeFunction(exception, e, '.handleDidPartiallyAcceptCompletionItem', myLogger);
		}
	}

	handleEndOfLifetime(completionItem: GhostTextCompletionItem, reason: InlineCompletionEndOfLifeReason) {
		try {
			return this.ghostTextProvider.handleEndOfLifetime(completionItem, reason);
		} catch (e) {
			this.instantiationService.invokeFunction(exception, e, '.handleEndOfLifetime', myLogger);
		}
	}

	handleListEndOfLifetime(list: InlineCompletionList, reason: InlineCompletionsDisposeReason): void {
		const ghostTextList = list as GhostTextCompletionList;
		softAssert(ghostTextList.telemetryBuilder !== undefined, 'Expected GhostTextCompletionList to have telemetryBuilder');

		const telemetryBuilder = ghostTextList.telemetryBuilder;

		const disposeReasonStr = InlineCompletionsDisposeReasonKind[reason.kind];
		telemetryBuilder.setDisposalReason(disposeReasonStr);

		this.telemetrySender.sendTelemetryForBuilder(telemetryBuilder);
	}

	private logSuggestion(
		logContext: GhostTextLogContext,
		doc: TextDocument,
		items: InlineCompletionList
	) {
		if (items.items.length === 0) {
			logContext.markAsNoSuggestions();
			logContext.addLog('No inline completion items provided');
			return;
		}
		const firstItem = items.items[0];
		if (!firstItem.range) {
			logContext.addLog('Inline completion item has no range');
			return;
		}
		if (typeof firstItem.insertText !== 'string') {
			logContext.addLog('Inline completion item has non-string insertText');
			return;
		}

		const text = new LineBasedText(lineNumber => doc.lineAt(lineNumber - 1).text, doc.lineCount);

		const lineEdit = LineEdit.fromTextEdit(
			new TextEdit(
				[new TextReplacement(
					new Range(firstItem.range.start.line + 1, firstItem.range.start.character + 1, firstItem.range.end.line + 1, firstItem.range.end.character + 1),
					firstItem.insertText,
				)],
			),
			text
		);

		const patch = lineEdit.humanReadablePatch(text.getLines());

		logContext.setResult(patch);
	}

	private createTelemetryBuilder() {
		return new NextEditProviderTelemetryBuilder(
			undefined,
			undefined,
			undefined,
			'ghostText',
			undefined
		);
	}
}
