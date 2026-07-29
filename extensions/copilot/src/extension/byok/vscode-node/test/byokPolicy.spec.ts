/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { CopilotToken } from '../../../../platform/authentication/common/copilotToken';
import { EnterpriseManagedError, NotSignedUpError, SubscriptionExpiredError } from '../../../../platform/authentication/vscode-node/copilotTokenManager';
import { resolveClientBYOKAllowed } from '../byokPolicy';

function mockToken(props: { isInternal?: boolean; isIndividual?: boolean; isClientBYOKEnabled?: boolean }): CopilotToken {
	return {
		isInternal: props.isInternal ?? false,
		isIndividual: props.isIndividual ?? false,
		isClientBYOKEnabled: () => props.isClientBYOKEnabled ?? false,
	} as unknown as CopilotToken;
}

function createAuthService(options: { hasCopilotTokenSource?: boolean; token?: CopilotToken; error?: Error }): IAuthenticationService {
	return {
		hasCopilotTokenSource: options.hasCopilotTokenSource ?? true,
		getCopilotToken: vi.fn(async () => {
			if (options.error) {
				throw options.error;
			}
			return options.token ?? mockToken({});
		}),
	} as unknown as IAuthenticationService;
}

describe('resolveClientBYOKAllowed', () => {
	it('allows users without a Copilot token source without resolving a token', async () => {
		const authService = createAuthService({ hasCopilotTokenSource: false });

		const allowed = await resolveClientBYOKAllowed(authService);

		expect(authService.getCopilotToken).not.toHaveBeenCalled();
		expect(allowed).toBe(true);
	});

	it.each([
		{
			name: 'users without Copilot entitlement',
			error: new NotSignedUpError('not signed up'),
		},
		{
			name: 'users whose Copilot subscription expired',
			error: new SubscriptionExpiredError('subscription expired'),
		},
	])('allows $name', async ({ error }) => {
		const authService = createAuthService({ error });

		const allowed = await resolveClientBYOKAllowed(authService);

		expect(allowed).toBe(true);
	});

	it.each([
		{
			name: 'internal users',
			token: mockToken({ isInternal: true }),
			expected: true,
		},
		{
			name: 'individual users',
			token: mockToken({ isIndividual: true }),
			expected: true,
		},
		{
			name: 'managed users with BYOK enabled',
			token: mockToken({ isClientBYOKEnabled: true }),
			expected: true,
		},
		{
			name: 'managed users without BYOK enabled',
			token: mockToken({}),
			expected: false,
		},
	])('resolves live policy for $name', async ({ token, expected }) => {
		const authService = createAuthService({ token });

		const allowed = await resolveClientBYOKAllowed(authService);

		expect(allowed).toBe(expected);
	});

	it.each([
		{
			name: 'enterprise policy errors',
			error: new EnterpriseManagedError('enterprise managed'),
		},
		{
			name: 'unclassified token errors',
			error: new Error('network unavailable'),
		},
	])('denies $name', async ({ error }) => {
		const authService = createAuthService({ error });

		const allowed = await resolveClientBYOKAllowed(authService);

		expect(allowed).toBe(false);
	});
});
