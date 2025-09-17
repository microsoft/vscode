/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IConversationSummarization = createDecorator<IConversationSummarization>('conversationSummarization');

export interface IConversationSummarization {
	readonly _serviceBrand: undefined;

	countOriginalQueries(conversationLog: any[]): number;
	extractQueryConversationPortion(conversationLog: any[], targetQueryNumber: number): any[];
	shouldTriggerSummarization(conversationLog: any[]): boolean;
	getHighestSummarizedQuery(conversationPaths: any): Promise<number>;
	loadConversationSummaries(conversationPaths: any): Promise<any>;
	saveConversationSummary(conversationPaths: any, queryNumber: number, summaryEntry: any): Promise<boolean>;
	prepareConversationWithSummaries(messages: any[], conversationPaths: any): Promise<{ conversation: any[], summary: any }>;
	startBackgroundSummarization(conversationLog: any[], targetQueryNumber: number, conversationPaths: any, provider?: string, model?: string): Promise<boolean>;
}
