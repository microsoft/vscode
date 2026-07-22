/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ChatSubagentToolInvocationData, ChatToolInvocationPart } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';

export interface ISubagentToolInvocationUpdate {
	description: string;
	agentName: string;
	prompt: string;
	modelName?: string;
	result?: string;
}

export function updateSubagentInvocation(stream: vscode.ChatResponseStream | undefined, toolCallId: string | undefined, toolName: ToolName, data: ISubagentToolInvocationUpdate): void {
	if (!stream || !toolCallId) {
		return;
	}

	const update = new ChatToolInvocationPart(toolName, toolCallId);
	update.enablePartialUpdate = true;
	update.isComplete = false;
	update.toolSpecificData = new ChatSubagentToolInvocationData(data.description, data.agentName, data.prompt, data.result);
	update.toolSpecificData.modelName = data.modelName;
	stream.push(update);
}

export function stripFinalAnswerTags(response: string): string {
	return response.replace('<final_answer>', '').replace('</final_answer>', '').trim();
}
