/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IFunctionMessageManager = createDecorator<IFunctionMessageManager>('functionMessageManager');

export interface IFunctionMessageManager {
	readonly _serviceBrand: undefined;

	isStreamingFunction(functionName: string): boolean;
	isInteractiveFunction(functionName: string): boolean;
	generateFunctionCallDisplayMessage(functionCall: any): string;
	saveFunctionCallToConversationLog(functionCall: any, messageId: number, relatedToId: number): Promise<void>;
	createFunctionCallMessageWithCompleteArguments(functionName: string, callId: string, messageId: number, completeArguments: string, requestId: string): Promise<{status?: string, data?: any} | void>;
}

