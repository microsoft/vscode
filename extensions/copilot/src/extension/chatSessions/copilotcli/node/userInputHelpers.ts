/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { UserInputRequestedEvent } from '@github/copilot/sdk';
import type { CancellationToken, ChatParticipantToolToken } from 'vscode';
import { createServiceIdentifier } from '../../../../util/common/services';

export type UserInputRequest = Omit<UserInputRequestedEvent['data'], 'requestId'>;

export type UserInputResponse = { answer: string; wasFreeform: boolean };

export const IUserQuestionHandler = createServiceIdentifier<IUserQuestionHandler>('IUserQuestionHandler');

export interface IQuestionOption {
	readonly label: string;
	readonly description?: string;
	readonly recommended?: boolean;
}

export interface IQuestionAnswer {
	readonly selected: string[];
	readonly freeText: string | null;
	readonly skipped: boolean;
}

export interface IQuestion {
	readonly header: string;
	readonly question: string;
	readonly message?: string;
	readonly multiSelect?: boolean;
	readonly options?: IQuestionOption[];
	readonly allowFreeformInput?: boolean;
}

export interface IUserQuestionHandler {
	_serviceBrand: undefined;
	askUserQuestion(question: IQuestion, toolInvocationToken: ChatParticipantToolToken, token: CancellationToken, toolCallId?: string): Promise<IQuestionAnswer | undefined>;
	notifyQuestionCarouselAnswer?(toolCallId: string, question: IQuestion, response: UserInputResponse): Promise<void>;
}
