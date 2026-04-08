/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { ITokenizer, TokenizerType } from '../../../../util/common/tokenizer';
import { AsyncIterableObject } from '../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IChatMLFetcher, Source } from '../../../chat/common/chatMLFetcher';
import { ChatLocation, ChatResponse } from '../../../chat/common/commonTypes';
import { CHAT_MODEL } from '../../../configuration/common/configurationService';
import { ILogService } from '../../../log/common/logService';
import { FinishedCallback, OptionalChatRequestParams } from '../../../networking/common/fetch';
import { Response } from '../../../networking/common/fetcherService';
import { createCapiRequestBody, IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody, IMakeChatRequestOptions } from '../../../networking/common/networking';
import { ChatCompletion } from '../../../networking/common/openai';
import { ITelemetryService, TelemetryProperties } from '../../../telemetry/common/telemetry';
import { TelemetryData } from '../../../telemetry/common/telemetryData';
import { ITokenizerProvider } from '../../../tokenizer/node/tokenizer';

export class MockEndpoint implements IChatEndpoint {
	constructor(
		family: string | undefined,
		@IChatMLFetcher private readonly _chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider private readonly _tokenizerProvider: ITokenizerProvider,
	) {
		if (family !== undefined) {
			this.family = family;
			this.model = family;
		}
	}

	isPremium: boolean = false;
	multiplier: number = 0;
	restrictedToSkus?: string[] | undefined;

	maxOutputTokens: number = 50000;
	model: string = CHAT_MODEL.GPT41;
	modelProvider: string = 'Mock Endpoint';
	supportsToolCalls: boolean = false;
	supportsVision: boolean = false;
	supportsPrediction: boolean = true;
	showInModelPicker: boolean = true;
	isDefault: boolean = false;
	isFallback: boolean = false;
	policy: 'enabled' | { terms: string } = 'enabled';
	urlOrRequestMetadata: string = 'https://microsoft.com';
	modelMaxPromptTokens: number = 50000;
	name: string = 'test';
	family: string = 'test';
	version: string = '1.0';
	tokenizer: TokenizerType = TokenizerType.O200K;

	processResponseFromChatEndpoint(telemetryService: ITelemetryService, logService: ILogService, response: Response, expectedNumChoices: number, finishCallback: FinishedCallback, telemetryData: TelemetryData, cancellationToken?: CancellationToken): Promise<AsyncIterableObject<ChatCompletion>> {
		throw new Error('Method not implemented.');
	}

	acceptChatPolicy(): Promise<boolean> {
		throw new Error('Method not implemented.');
	}

	makeChatRequest2(options: IMakeChatRequestOptions, token: CancellationToken): Promise<ChatResponse> {
		return this._chatMLFetcher.fetchOne({
			requestOptions: {},
			...options,
			endpoint: this,
		}, token);
	}

	createRequestBody(options: ICreateEndpointBodyOptions): IEndpointBody {
		return createCapiRequestBody(options, this.model);
	}

	public async makeChatRequest(
		debugName: string,
		messages: Raw.ChatMessage[],
		finishedCb: FinishedCallback | undefined,
		token: CancellationToken,
		location: ChatLocation,
		source?: Source,
		requestOptions?: Omit<OptionalChatRequestParams, 'n'>,
		userInitiatedRequest?: boolean,
		telemetryProperties?: TelemetryProperties,
	): Promise<ChatResponse> {
		return this.makeChatRequest2({
			debugName,
			messages,
			finishedCb,
			location,
			source,
			requestOptions,
			userInitiatedRequest,
			telemetryProperties,
		}, token);
	}

	cloneWithTokenOverride(modelMaxPromptTokens: number): IChatEndpoint {
		throw new Error('Method not implemented.');
	}

	getExtraHeaders?(): Record<string, string> {
		throw new Error('Method not implemented.');
	}

	interceptBody?(body: IEndpointBody | undefined): void {
		throw new Error('Method not implemented.');
	}

	acquireTokenizer(): ITokenizer {
		return this._tokenizerProvider.acquireTokenizer(this);
	}
}
