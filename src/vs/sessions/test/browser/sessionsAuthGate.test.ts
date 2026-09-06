/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ConditionalAuthState, conditionalAuthState, resolveSignedOutWindowGate, shouldShowGitHubWorkspaceGroupSignIn, SignedOutWindowGate } from '../../browser/sessionsAuthGate.js';
import { SessionTypeAuthRequirement } from '../../services/sessions/common/session.js';

suite('Sessions - Auth Gate', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('blocking sign-in requires the opt-in and a provider that does not need GitHub', () => {
		assert.deepStrictEqual({
			featureDisabled: resolveSignedOutWindowGate(false, [SessionTypeAuthRequirement.None]),
			providersUnresolved: resolveSignedOutWindowGate(true, []),
			allRequireGitHub: resolveSignedOutWindowGate(true, [SessionTypeAuthRequirement.GitHub, SessionTypeAuthRequirement.GitHub]),
			nativeProvider: resolveSignedOutWindowGate(true, [SessionTypeAuthRequirement.GitHub, SessionTypeAuthRequirement.None]),
			nativeProviderInitializing: resolveSignedOutWindowGate(true, [SessionTypeAuthRequirement.GitHub, SessionTypeAuthRequirement.Unusable]),
		}, {
			featureDisabled: SignedOutWindowGate.ForceGitHubSignIn,
			providersUnresolved: SignedOutWindowGate.Unresolved,
			allRequireGitHub: SignedOutWindowGate.ForceGitHubSignIn,
			nativeProvider: SignedOutWindowGate.Proceed,
			nativeProviderInitializing: SignedOutWindowGate.Proceed,
		});
	});

	test('GitHub workspace group offers sign-in only for signed-out opted-in users', () => {
		assert.deepStrictEqual([
			shouldShowGitHubWorkspaceGroupSignIn(false, false),
			shouldShowGitHubWorkspaceGroupSignIn(false, true),
			shouldShowGitHubWorkspaceGroupSignIn(true, false),
			shouldShowGitHubWorkspaceGroupSignIn(true, true),
		], [false, true, false, false]);
	});

	test('conditionalAuthState treats an unresolved account as unknown, never signed out', () => {
		// The root-cause distinction: before the account resolves, its snapshot is
		// null for signed-in and signed-out users alike, so `accountResolved: false`
		// must map to Unresolved regardless of the (untrustworthy) signedIn snapshot —
		// otherwise the conditional-auth UI flashes a sign-in modal at a signed-in
		// user during startup.
		const cases = [
			{ accountResolved: false, signedIn: false },
			{ accountResolved: false, signedIn: true },
			{ accountResolved: true, signedIn: false },
			{ accountResolved: true, signedIn: true },
		];

		assert.deepStrictEqual(cases.map(c => conditionalAuthState(c.accountResolved, c.signedIn)), [
			ConditionalAuthState.Unresolved,
			ConditionalAuthState.Unresolved,
			ConditionalAuthState.SignedOut,
			ConditionalAuthState.SignedIn,
		]);
	});
});
