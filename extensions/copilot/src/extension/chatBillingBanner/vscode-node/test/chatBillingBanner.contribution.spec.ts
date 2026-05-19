/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Emitter } from '../../../../util/vs/base/common/event';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';

// ---- vscode mock -----------------------------------------------------------

const executeCommand = vi.fn();

vi.mock('vscode', () => ({
	commands: {
		executeCommand: (...args: unknown[]) => executeCommand(...args),
	},
}));

import { ChatBillingBannerContribution } from '../chatBillingBanner.contribution';

const SET_ENABLED_COMMAND = '_chat.billing.usageBannerSetEnabled';

// ---- helpers ---------------------------------------------------------------

function createAuthService(opts?: { copilotToken?: unknown }) {
	const emitter = new Emitter<void>();
	const hasToken = opts && 'copilotToken' in opts;
	const authService = {
		_serviceBrand: undefined,
		anyGitHubSession: undefined,
		copilotToken: hasToken
			? opts.copilotToken
			: { isUsageBasedBilling: true, username: 'octocat' },
		onDidAuthenticationChange: emitter.event,
	} as unknown as IAuthenticationService;
	return { authService, emitter };
}

// ---- tests -----------------------------------------------------------------

describe('ChatBillingBannerContribution', () => {
	let contribution: ChatBillingBannerContribution;
	let authService: IAuthenticationService;
	let authEmitter: Emitter<void>;

	beforeEach(() => {
		executeCommand.mockClear();
	});

	afterEach(() => {
		contribution?.dispose();
	});

	test('mirrors initial eligibility + accountId on construction', () => {
		const auth = createAuthService();
		authService = auth.authService;
		authEmitter = auth.emitter;
		contribution = new ChatBillingBannerContribution(authService);

		expect(executeCommand).toHaveBeenCalledTimes(1);
		expect(executeCommand).toHaveBeenLastCalledWith(SET_ENABLED_COMMAND, true, 'octocat');
	});

	test('mirrors initial state for a non-UBB user', () => {
		const auth = createAuthService({ copilotToken: { isUsageBasedBilling: false, username: 'octocat' } });
		authService = auth.authService;
		authEmitter = auth.emitter;
		contribution = new ChatBillingBannerContribution(authService);

		expect(executeCommand).toHaveBeenCalledTimes(1);
		expect(executeCommand).toHaveBeenLastCalledWith(SET_ENABLED_COMMAND, false, 'octocat');
	});

	test('mirrors disabled+undefined when signed out', () => {
		const auth = createAuthService({ copilotToken: undefined });
		authService = auth.authService;
		authEmitter = auth.emitter;
		contribution = new ChatBillingBannerContribution(authService);

		expect(executeCommand).toHaveBeenCalledTimes(1);
		expect(executeCommand).toHaveBeenLastCalledWith(SET_ENABLED_COMMAND, false, undefined);
	});

	test('fires on isUsageBasedBilling flip', () => {
		const auth = createAuthService({ copilotToken: { isUsageBasedBilling: false, username: 'octocat' } });
		authService = auth.authService;
		authEmitter = auth.emitter;
		contribution = new ChatBillingBannerContribution(authService);
		executeCommand.mockClear();

		(authService as any).copilotToken = { isUsageBasedBilling: true, username: 'octocat' };
		authEmitter.fire();

		expect(executeCommand).toHaveBeenCalledTimes(1);
		expect(executeCommand).toHaveBeenLastCalledWith(SET_ENABLED_COMMAND, true, 'octocat');
	});

	test('suppresses duplicate calls when nothing changed', () => {
		const auth = createAuthService();
		authService = auth.authService;
		authEmitter = auth.emitter;
		contribution = new ChatBillingBannerContribution(authService);
		executeCommand.mockClear();

		authEmitter.fire();
		authEmitter.fire();
		authEmitter.fire();

		expect(executeCommand).not.toHaveBeenCalled();
	});

	test('fires on accountId change even when eligibility stays the same', () => {
		const auth = createAuthService();
		authService = auth.authService;
		authEmitter = auth.emitter;
		contribution = new ChatBillingBannerContribution(authService);
		executeCommand.mockClear();

		(authService as any).copilotToken = { isUsageBasedBilling: true, username: 'hubot' };
		authEmitter.fire();

		expect(executeCommand).toHaveBeenCalledTimes(1);
		expect(executeCommand).toHaveBeenLastCalledWith(SET_ENABLED_COMMAND, true, 'hubot');
	});

	test('emits disabled+undefined on sign-out', () => {
		const auth = createAuthService();
		authService = auth.authService;
		authEmitter = auth.emitter;
		contribution = new ChatBillingBannerContribution(authService);
		executeCommand.mockClear();

		(authService as any).copilotToken = undefined;
		authEmitter.fire();

		expect(executeCommand).toHaveBeenCalledTimes(1);
		expect(executeCommand).toHaveBeenLastCalledWith(SET_ENABLED_COMMAND, false, undefined);
	});
});
