/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isWeb } from '../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ConditionalAuthState, conditionalAuthState, resolveSignedOutWindowGate, shouldShowGitHubWorkspaceGroupSignIn, SignedOutWindowGate } from '../../browser/sessionsAuthGate.js';
import { SessionTypeAuthRequirement } from '../../services/sessions/common/session.js';

suite('Sessions - Auth Gate', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('blocking sign-in allows native providers or initialization without GitHub', () => {
		assert.deepStrictEqual({
			initializesWithoutGitHub: resolveSignedOutWindowGate([SessionTypeAuthRequirement.GitHub], true),
			initializationBeforeProviders: resolveSignedOutWindowGate([], true),
			providersUnresolved: resolveSignedOutWindowGate([]),
			allRequireGitHub: resolveSignedOutWindowGate([SessionTypeAuthRequirement.GitHub, SessionTypeAuthRequirement.GitHub]),
			nativeProvider: resolveSignedOutWindowGate([SessionTypeAuthRequirement.GitHub, SessionTypeAuthRequirement.None]),
			nativeProviderInitializing: resolveSignedOutWindowGate([SessionTypeAuthRequirement.GitHub, SessionTypeAuthRequirement.Unusable]),
		}, {
			initializesWithoutGitHub: SignedOutWindowGate.Proceed,
			initializationBeforeProviders: SignedOutWindowGate.Unresolved,
			providersUnresolved: isWeb ? SignedOutWindowGate.ForceGitHubSignIn : SignedOutWindowGate.Unresolved,
			allRequireGitHub: SignedOutWindowGate.ForceGitHubSignIn,
			nativeProvider: isWeb ? SignedOutWindowGate.ForceGitHubSignIn : SignedOutWindowGate.Proceed,
			nativeProviderInitializing: isWeb ? SignedOutWindowGate.ForceGitHubSignIn : SignedOutWindowGate.Proceed,
		});
	});

	test('GitHub workspace group offers sign-in only for signed-out users', () => {
		assert.deepStrictEqual([
			shouldShowGitHubWorkspaceGroupSignIn(false),
			shouldShowGitHubWorkspaceGroupSignIn(true),
		], [!isWeb, false]);
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
