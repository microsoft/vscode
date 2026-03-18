/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, ToolInvocationPresentation } from '../../../../common/tools/languageModelToolsService.js';

export function shouldKeepToolInvocationVisibleAfterCompletion(invocation: IChatToolInvocation | IChatToolInvocationSerialized): boolean {
	if (invocation.presentation !== ToolInvocationPresentation.HiddenAfterComplete || !IChatToolInvocation.isComplete(invocation)) {
		return false;
	}

	if (hasVisibleToolResult(invocation)) {
		return true;
	}

	return !!invocation.isAttachedToThinking && !IChatToolInvocation.getConfirmationMessages(invocation);
}

export function shouldHideToolInvocationAfterCompletion(invocation: IChatToolInvocation | IChatToolInvocationSerialized): boolean {
	if (invocation.presentation !== ToolInvocationPresentation.HiddenAfterComplete || !IChatToolInvocation.isComplete(invocation)) {
		return false;
	}

	return !shouldKeepToolInvocationVisibleAfterCompletion(invocation);
}

function hasVisibleToolResult(invocation: IChatToolInvocation | IChatToolInvocationSerialized): boolean {
	const resultDetails = IChatToolInvocation.resultDetails(invocation);
	if (Array.isArray(resultDetails) && resultDetails.length > 0) {
		return true;
	}

	if (isToolResultOutputDetails(resultDetails) || isToolResultInputOutputDetails(resultDetails)) {
		return true;
	}

	if (invocation.toolSpecificData?.kind === 'resources' && invocation.toolSpecificData.values.length > 0) {
		return true;
	}

	if (invocation.toolSpecificData?.kind === 'simpleToolInvocation') {
		return true;
	}

	if (invocation.toolSpecificData?.kind === 'input' && !!invocation.toolSpecificData.mcpAppData) {
		return true;
	}

	return false;
}