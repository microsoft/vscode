/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { afterEach, expect, suite, test, vi } from 'vitest';
import { sendChatFeedback } from '../chatFeedbackCommand';

vi.mock('vscode', () => ({
	commands: {
		executeCommand: vi.fn(),
	},
}));

suite('sendChatFeedback', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('opens the Copilot issue reporter instead of the archived feedback repo', async () => {
		const result = Symbol('result');
		const executeCommandStub = vi.mocked(vscode.commands.executeCommand).mockResolvedValue(result);

		await expect(sendChatFeedback()).resolves.toBe(result);
		expect(executeCommandStub).toHaveBeenCalledWith('github.copilot.report', 'Copilot chat feedback');
	});
});
