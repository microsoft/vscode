/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { ChatRequest } from '../../../vscodeTypes';

export interface IToolCallIterationIncrease {
	copilotRequestedRoundLimit: number;
}

const isToolCallIterationIncrease = (c: unknown): c is IToolCallIterationIncrease => !!(c && typeof (c as IToolCallIterationIncrease).copilotRequestedRoundLimit === 'number');

export const getRequestedToolCallIterationLimit = (request: ChatRequest) => request.acceptedConfirmationData?.find(isToolCallIterationIncrease)?.copilotRequestedRoundLimit;
export const getRejectedToolCallIterationLimit = (request: ChatRequest) => request.rejectedConfirmationData?.find(isToolCallIterationIncrease)?.copilotRequestedRoundLimit;

// todo@connor4312 improve with the choices API
export const cancelText = () => l10n.t('Pause');
export const isToolCallLimitCancellation = (request: ChatRequest) => !!getRejectedToolCallIterationLimit(request);
export const isToolCallLimitAcceptance = (request: ChatRequest) => !!getRequestedToolCallIterationLimit(request) && !isToolCallLimitCancellation(request);
export interface IContinueOnErrorConfirmation {
	copilotContinueOnError: true;
}

function isContinueOnErrorConfirmation(c: unknown): c is IContinueOnErrorConfirmation {
	return !!(c && (c as IContinueOnErrorConfirmation).copilotContinueOnError === true);
}
export const isContinueOnError = (request: ChatRequest) => !!(request.acceptedConfirmationData?.some(isContinueOnErrorConfirmation));

export interface ISwitchToAutoOnRateLimitConfirmation {
	copilotSwitchToAutoOnRateLimit: true;
	alwaysSwitchToAuto: boolean;
}

function isSwitchToAutoOnRateLimitConfirmation(c: unknown): c is ISwitchToAutoOnRateLimitConfirmation {
	return !!(c && (c as ISwitchToAutoOnRateLimitConfirmation).copilotSwitchToAutoOnRateLimit === true);
}
export const getSwitchToAutoOnRateLimitConfirmation = (request: ChatRequest) => request.acceptedConfirmationData?.find(isSwitchToAutoOnRateLimitConfirmation);
export const isSwitchToAutoOnRateLimit = (request: ChatRequest) => !!(request.acceptedConfirmationData?.some(isSwitchToAutoOnRateLimitConfirmation));
