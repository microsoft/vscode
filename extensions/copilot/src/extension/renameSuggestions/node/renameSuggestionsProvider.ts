/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IInteractionService } from '../../../platform/chat/common/interactionService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { INotificationService } from '../../../platform/notification/common/notificationService';
import { ISimulationTestContext } from '../../../platform/simulationTestContext/common/simulationTestContext';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { NewSymbolName, NewSymbolNameTag, NewSymbolNameTriggerKind } from '../../../vscodeTypes';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { enforceNamingConvention, guessNamingConvention, NamingConvention } from '../common/namingConvention';
import { RenameSuggestionsPrompt } from './renameSuggestionsPrompt';

/**
 * The format of the reply from the model.
 */
type ReplyFormat =
	/** When the reply was a JSON array of strings as instructed in the prompt */
	| 'jsonStringArray'

	/** When there were multiple JSON array's matched by the regex */
	| 'multiJsonStringArray'

	/** When the reply was an ordered or unordered list */
	| 'list'

	/** When we couldn't parse the response */
	| 'unknown'
	;

enum ProvideCallCancellationReason {
	None = '',
	AfterEnablementCheck = 'afterEnablementCheck',
	AfterRunParametersFetch = 'afterRunParametersFetch',
	AfterPromptCompute = 'afterPromptCompute',
	AfterDelay = 'afterDelay',
	AfterFetchStarted = 'afterFetchStarted',
}

export class RenameSuggestionsProvider implements vscode.NewSymbolNamesProvider {

	public readonly supportsAutomaticTriggerKind: Promise<boolean>;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEndpointProvider private readonly _endpointProvider: IEndpointProvider,
		@ISimulationTestContext private readonly _simulationTestContext: ISimulationTestContext,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IInteractionService private readonly _interactionService: IInteractionService
	) {

		this.supportsAutomaticTriggerKind = Promise.resolve(this.isEnabled(NewSymbolNameTriggerKind.Automatic));
	}

	protected isEnabled(triggerKind: NewSymbolNameTriggerKind) {
		if (triggerKind === NewSymbolNameTriggerKind.Invoke) {
			return true;
		} else if (this._authService.copilotToken?.isFreeUser || this._authService.copilotToken?.isNoAuthUser) {
			return false;
		} else {
			return this._configurationService.getConfig(ConfigKey.AutomaticRenameSuggestions);
		}
	}

	/**
	 * @throws {Error} with `message = 'CopilotFeatureUnavailableOrDisabled' if the feature is not available
	 * @throws {Error} with `message = 'CopilotIgnoredDocument' if the document is Copilot-ignored
	 */
	async provideNewSymbolNames(_document: vscode.TextDocument, range: vscode.Range, triggerKind: NewSymbolNameTriggerKind, token: vscode.CancellationToken): Promise<NewSymbolName[] | null> {
		const document = TextDocumentSnapshot.create(_document);

		let cancellationReason: ProvideCallCancellationReason = ProvideCallCancellationReason.None;

		const beforeDelaySW = new StopWatch();

		// @ulugbekna: capture the symbol name that is being renamed before an await to avoid document being changed under us
		const currentSymbolName = document.getText(range);

		if (!this.isEnabled(triggerKind)) {
			throw new Error('CopilotFeatureUnavailableOrDisabled');
		}

		if (await this._ignoreService.isCopilotIgnored(document.uri)) {
			throw new Error('CopilotIgnoredDocument');
		}

		const languageId = document.languageId;

		let expectedDelayBeforeFetch: number | undefined;
		let timeElapsedBeforeDelay: number | undefined;

		if (token.isCancellationRequested) {
			cancellationReason = ProvideCallCancellationReason.AfterEnablementCheck;
		} else {
			const endpoint = await this._endpointProvider.getChatEndpoint('copilot-fast');
			expectedDelayBeforeFetch = this.delayBeforeFetchMs;

			if (token.isCancellationRequested) {
				cancellationReason = ProvideCallCancellationReason.AfterRunParametersFetch;
			} else {

				const sw = new StopWatch(false);

				sw.reset();
				const promptRenderResult = await this._computePrompt(document, range, endpoint, token);
				const promptConstructionTime = sw.elapsed();

				if (token.isCancellationRequested) {
					cancellationReason = ProvideCallCancellationReason.AfterPromptCompute;
				} else {

					timeElapsedBeforeDelay = beforeDelaySW.elapsed();

					let actualDelayBeforeFetch: number | undefined;
					if (triggerKind === NewSymbolNameTriggerKind.Automatic) {
						actualDelayBeforeFetch = expectedDelayBeforeFetch ? Math.max(0, expectedDelayBeforeFetch - timeElapsedBeforeDelay) : undefined;
						if (actualDelayBeforeFetch !== undefined && actualDelayBeforeFetch > 0) {
							await new Promise(resolve => setTimeout(resolve, actualDelayBeforeFetch));
						}
					}

					if (token.isCancellationRequested) {
						cancellationReason = ProvideCallCancellationReason.AfterDelay;
					} else {

						sw.reset();
						this._interactionService.startInteraction();
						const fetchResult = await endpoint.makeChatRequest(
							'renameSuggestionsProvider',
							promptRenderResult.messages,
							undefined, // TODO@ulugbekna: should we terminate on `]` (closing for JSON array that we expect to receive from the model)
							token,
							ChatLocation.Other,
							undefined,
							{
								top_p: undefined,
								temperature: undefined
							},
							true
						);
						const fetchTime = sw.elapsed();

						if (fetchResult.type === ChatFetchResponseType.QuotaExceeded || (fetchResult.type === ChatFetchResponseType.RateLimited && this._authService.copilotToken?.isNoAuthUser)) {
							await this._notificationService.showQuotaExceededDialog({ isNoAuthUser: this._authService.copilotToken?.isNoAuthUser ?? false });
						}

						if (token.isCancellationRequested) {
							cancellationReason = ProvideCallCancellationReason.AfterFetchStarted;
						}

						switch (fetchResult.type) {
							case ChatFetchResponseType.Success: {
								const reply = fetchResult.value;
								const { replyFormat, symbolNames, redundantCharCount: responseUnusedCharCount } = RenameSuggestionsProvider.parseResponse(reply);
								if (replyFormat === 'unknown') {
									this._sendInternalTelemetry({ languageId, reply });
								}
								this._sendPublicTelemetry({
									triggerKind,
									languageId,
									cancellationReason,
									fetchResultType: fetchResult.type,
									promptConstructionTime,
									promptTokenCount: promptRenderResult.tokenCount,
									expectedDelayBeforeFetch,
									actualDelayBeforeFetch,
									timeElapsedBeforeDelay,
									successResponseCharCount: reply.length,
									responseUnusedCharCount,
									fetchTime,
									replyFormat,
									symbolNamesCount: symbolNames.length,
								});

								const processedSymbolNames = RenameSuggestionsProvider.preprocessSymbolNames({ currentSymbolName, newSymbolNames: symbolNames, languageId });
								return processedSymbolNames.map(symbolName => new NewSymbolName(symbolName, [NewSymbolNameTag.AIGenerated]));
							}
							default: {
								this._sendPublicTelemetry({
									triggerKind,
									languageId,
									cancellationReason,
									fetchResultType: fetchResult.type,
									promptConstructionTime,
									promptTokenCount: promptRenderResult.tokenCount,
									expectedDelayBeforeFetch,
									actualDelayBeforeFetch,
									timeElapsedBeforeDelay,
									fetchTime,
								});
								return null;
							}
						}
					}
				}
			}
		}

		this._sendPublicTelemetry({
			triggerKind,
			languageId,
			cancellationReason,
			expectedDelayBeforeFetch,
			timeElapsedBeforeDelay,
		});
		return null;
	}

	/**
	 * The delay before fetching from the model.
	 */
	private get delayBeforeFetchMs() {
		if (this._simulationTestContext.isInSimulationTests) {
			return 0;
		} else {
			const DELAY_BEFORE_FETCH = 250 /* milliseconds */;
			return DELAY_BEFORE_FETCH;
		}
	}

	// @ulugbekna: notes:
	// - FIXME: currently, we fail with very large definitions such as big classes or functions -- we need summarization by category, e.g., remove method implementations if we're renaming a class
	// - idea: include hover info (i.e., usually type info & corresponding document) of the symbol being renamed in the prompt
	// - idea: include usages of the symbol being renamed in the prompt
	// - idea: include peer symbols (e.g., other methods in the same class) in the prompt for copilot to see conventions in the code
	private _computePrompt(document: TextDocumentSnapshot, range: vscode.Range, chatEndpoint: IChatEndpoint, token: vscode.CancellationToken) {
		const promptRenderer = PromptRenderer.create(
			this._instaService,
			chatEndpoint,
			RenameSuggestionsPrompt,
			{
				document,
				range
			}
		);
		return promptRenderer.render(undefined, token);
	}

	public static preprocessSymbolNames({ currentSymbolName, newSymbolNames, languageId }: { currentSymbolName: string; newSymbolNames: string[]; languageId: string }): string[] {

		const currentNameConvention = guessNamingConvention(currentSymbolName);

		let targetNamingConvention: NamingConvention;
		switch (currentNameConvention) {
			case NamingConvention.LowerCase:
				if (languageId === 'python') {
					targetNamingConvention = NamingConvention.SnakeCase;
				} else {
					targetNamingConvention = NamingConvention.CamelCase;
				}
				break;
			case NamingConvention.Uppercase:
			case NamingConvention.CamelCase:
			case NamingConvention.PascalCase:
			case NamingConvention.SnakeCase:
			case NamingConvention.ScreamingSnakeCase:
			case NamingConvention.CapitalSnakeCase:
			case NamingConvention.KebabCase:
			case NamingConvention.Capitalized:
			case NamingConvention.Unknown:
				targetNamingConvention = currentNameConvention;
				break;
			default: {
				const _exhaustiveCheck: never = currentNameConvention;
				return _exhaustiveCheck;
			}
		}

		if (targetNamingConvention === NamingConvention.Unknown) {
			return newSymbolNames;
		}

		return newSymbolNames.map(newSymbolName => enforceNamingConvention(newSymbolName, targetNamingConvention));
	}

	public static parseResponse(reply: string): { replyFormat: ReplyFormat; redundantCharCount: number; symbolNames: string[] } {

		const parsedAsJSONStringArray = RenameSuggestionsProvider._parseReplyAsJSONStringArray(reply);
		if (parsedAsJSONStringArray !== undefined) {
			return parsedAsJSONStringArray;
		}

		const parsedAsList = RenameSuggestionsProvider._parseReplyAsList(reply);
		if (parsedAsList !== undefined) {
			return parsedAsList;
		}

		return { replyFormat: 'unknown', symbolNames: [], redundantCharCount: reply.length };
	}

	/** try extracting from JSON string array */
	private static _parseReplyAsJSONStringArray(reply: string) {

		const jsonArrayRe = /\[.*?\]/gs; // `s` regex flag allows matching newlines using `.`

		const matches = [...reply.matchAll(jsonArrayRe)];

		for (let i = 0; i < matches.length; i++) {
			const match = matches[i];
			try {
				const parsedJSONArray: unknown = JSON.parse(match[0]);

				if (Array.isArray(parsedJSONArray)) {

					const symbolNames = parsedJSONArray.filter(v => typeof v === 'string');

					if (symbolNames.length > 0) {
						const replyFormat: ReplyFormat = i === 0 ? 'jsonStringArray' : 'multiJsonStringArray';
						const redundantCharCount = reply.length - match[0].length;
						return { replyFormat, redundantCharCount, symbolNames: symbolNames.map(s => s.trim()) } as const;
					}
				}
			} catch (error) {
			}
		}
	}

	private static _parseReplyAsList(reply: string) {
		// try extracting from an ordered or unordered list
		const listLineRe = /(?:\d+[\.|\)]|[\*\-])\s*(.*)/g;
		const matches = reply.matchAll(listLineRe);

		const symbolNames: string[] = [];
		for (const match of matches) {
			let symbolName = match[1].trim();
			const punctuation = ['\'', '"', '`'];
			if (punctuation.includes(symbolName[0])) {
				symbolName = symbolName.slice(1);
			}
			if (punctuation.includes(symbolName[symbolName.length - 1])) {
				symbolName = symbolName.slice(0, -1);
			}
			if (symbolName) {
				symbolNames.push(symbolName);
			}
		}

		if (symbolNames.length === 0) {
			return;
		}

		const redundantCharCount = reply.length - symbolNames.reduce((acc, name) => acc + name.length, 0);

		return { replyFormat: 'list' satisfies ReplyFormat, redundantCharCount, symbolNames } as const;
	}

	private _sendPublicTelemetry({
		triggerKind,
		languageId,
		cancellationReason,
		fetchResultType,
		timeElapsedBeforeDelay,
		promptConstructionTime,
		promptTokenCount,
		expectedDelayBeforeFetch,
		actualDelayBeforeFetch,
		successResponseCharCount,
		responseUnusedCharCount,
		fetchTime,
		replyFormat,
		symbolNamesCount
	}: {
		triggerKind: NewSymbolNameTriggerKind;
		languageId: string;
		cancellationReason: ProvideCallCancellationReason;
		fetchResultType?: ChatFetchResponseType;
		timeElapsedBeforeDelay?: number;
		promptConstructionTime?: number;
		promptTokenCount?: number;
		fetchTime?: number;
		expectedDelayBeforeFetch?: number;
		actualDelayBeforeFetch?: number;
		successResponseCharCount?: number;
		responseUnusedCharCount?: number;
		replyFormat?: ReplyFormat;
		symbolNamesCount?: number;
	}) {
		/* __GDPR__
			"provideRenameSuggestions" : {
				"owner": "ulugbekna",
				"comment": "Telemetry for rename suggestions provided",
				"languageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Language ID of the document." },
				"cancellationReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Specify when exactly during the provider call the cancellation happened. Empty string if the cancellation didn't happen." },
				"fetchResultType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Result of a fetch to endpoint" },
				"replyFormat": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Copilot reply format: 'jsonStringArray' | 'multiJsonStringArray' | 'list' | 'unknown'" },
				"triggerKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Rename suggestion trigger kind - 'automatic' | 'manual'" },
				"promptConstructionTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Time it took to construct the prompt", "isMeasurement": true },
				"timeElapsedBeforeDelay": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Time elapsed before delay starts", "isMeasurement": true },
				"promptTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Token count of the prompt", "isMeasurement": true },
				"expectedDelayBeforeFetch": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Expected delay before fetch dictated by the experiment 'renameSuggestionsDelayBeforeFetch'", "isMeasurement": true },
				"actualDelayBeforeFetch": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Actual delay before fetch computed as 'expectedDelay - promptComputationTime'", "isMeasurement": true },
				"successResponseCharCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Character count in model response (for response.type == 'success')", "isMeasurement": true },
				"responseUnusedCharCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Character count in model response that was unused, e.g., rename explanations, response format overhead", "isMeasurement": true },
				"fetchTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Time it took to fetch from endpoint", "isMeasurement": true },
				"symbolNamesCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of suggested names", "isMeasurement": true }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent(
			'provideRenameSuggestions',
			{
				languageId,
				cancellationReason,
				fetchResultType,
				replyFormat,
				triggerKind: triggerKind === NewSymbolNameTriggerKind.Automatic ? 'automatic' : 'manual',
			},
			{
				promptConstructionTime,
				promptTokenCount,
				expectedDelayBeforeFetch,
				actualDelayBeforeFetch,
				timeElapsedBeforeFetch: timeElapsedBeforeDelay,
				fetchTime,
				successResponseCharCount,
				responseUnusedCharCount,
				symbolNamesCount,
			}
		);
	}

	private _sendInternalTelemetry({ languageId, reply }: { languageId: string; reply: string }) {
		this._telemetryService.sendMSFTTelemetryEvent(
			'provideRenameSuggestionsIncorrectFormatResponse',
			{
				languageId,
				reply
			}
		);
	}

	public static _determinePrefix(name: string): string | undefined {
		const prefix = name.match(/^([\\.\\$\\_]+)/)?.[0];
		return prefix;
	}
}
