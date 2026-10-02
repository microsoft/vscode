/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { getGitHubCopilotRequestTeForToolCall, setGitHubCopilotRequestTeForRound, ToolCallRound } from '../../common/toolCallRound';

describe('getGitHubCopilotRequestTeForToolCall', () => {
	const rounds = [
		setGitHubCopilotRequestTeForRound(new ToolCallRound('', [{ id: 'call_a__vscode-1', name: 'read_file', arguments: '{}' }]), 'false'),
		setGitHubCopilotRequestTeForRound(new ToolCallRound('', [{ id: 'call_b__vscode-2', name: 'apply_patch', arguments: '{}' }]), undefined),
		// Tool call ids can be reused by the model; the newest round wins.
		setGitHubCopilotRequestTeForRound(new ToolCallRound('', [{ id: 'call_a__vscode-3', name: 'read_file', arguments: '{}' }]), ' TRUE '),
	];

	it('returns the value of the round that emitted the tool call, or undefined when it cannot be linked, without storing it on the round', () => {
		expect([
			getGitHubCopilotRequestTeForToolCall(rounds, 'call_a'),
			getGitHubCopilotRequestTeForToolCall(rounds, 'call_b'),
			getGitHubCopilotRequestTeForToolCall(rounds, 'call_unknown'),
			getGitHubCopilotRequestTeForToolCall(rounds, undefined),
			getGitHubCopilotRequestTeForToolCall(undefined, 'call_a'),
			JSON.stringify(rounds).includes('gitHubCopilotRequestTe') || JSON.stringify(rounds).includes('TRUE'),
		]).toEqual([' TRUE ', undefined, undefined, undefined, undefined, false]);
	});
});
