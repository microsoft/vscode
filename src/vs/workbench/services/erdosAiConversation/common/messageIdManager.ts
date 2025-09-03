/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IMessageIdManager = createDecorator<IMessageIdManager>('messageIdManager');

export interface IMessageIdManager {
	readonly _serviceBrand: undefined;

	setMessageIdGenerator(generator: () => number): void;
	setResetCounterCallback(callback: (maxId: number) => void): void;
	preallocateFunctionMessageIds(functionName: string, callId: string): number;
	getPreallocatedMessageId(callId: string, index?: number): number;
	getNextPreallocatedMessageId(callId: string, index: number): number;
	isFirstFunctionCallInParallelSet(callId: string): boolean;
	clearPreallocatedMessageIds(): void;
	clearPreallocatedIds(): void;
	resetMessageIdCounterForConversation(conversation: any): void;
	clearPreallocationStateForConversationSwitch(): void;
	resetFirstFunctionCallTracking(): void;
}
