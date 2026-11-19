/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../common/agent.js';
import type { CopilotAccountContext } from '../../common/copilotAccountContext.js';
import { copilotEntraM365Audience, copilotEntraResources } from '../../common/copilotEntraAuthentication.js';
import { AuthRequiredReason } from '../../common/state/sessionActions.js';
import { selectCopilotAuthenticationRequirement, type CopilotReplacedSignIn } from '../../node/copilot/copilotAuthenticationRequirement.js';
import { copilotEntraDiscoveryMetadata } from '../../node/copilot/copilotEntraAuthentication.js';

suite('Copilot authentication requirement', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('asks for one credential at a time and never for the sign-in the user replaced', () => {
		const github = { resource: GITHUB_COPILOT_PROTECTED_RESOURCE, reason: AuthRequiredReason.Expired };
		const microsoft = {
			revoked: { resource: copilotEntraDiscoveryMetadata, reason: AuthRequiredReason.Expired },
			identity: { resource: copilotEntraDiscoveryMetadata, reason: AuthRequiredReason.Required },
			service: { resource: { resource: copilotEntraResources.get(copilotEntraM365Audience)! }, reason: AuthRequiredReason.Expired },
		};
		const gitHubAccount: CopilotAccountContext = { kind: 'legacy' };
		const microsoftAccount: CopilotAccountContext = { kind: 'discovering', entraAccountId: 'selected' };
		const failedMicrosoftSetup: CopilotAccountContext = { kind: 'error', entraAccountId: 'selected', stage: 'discovery' };
		const cases: readonly [name: string, account: CopilotAccountContext, replacedSignIn: CopilotReplacedSignIn | undefined, gitHubPending: boolean, microsoftPending: keyof typeof microsoft | undefined, asked: 'github' | keyof typeof microsoft | undefined][] = [
			['nothing is pending', gitHubAccount, undefined, false, undefined, undefined],
			['GitHub comes before a pending Microsoft request', gitHubAccount, undefined, true, 'identity', 'github'],
			['the runtime asks for a Microsoft identity while GitHub is signed in', gitHubAccount, 'microsoft', false, 'identity', 'identity'],
			['a revoked Microsoft sign-in that nothing replaced', gitHubAccount, undefined, false, 'revoked', 'revoked'],
			['a revoked Microsoft sign-in that GitHub replaced', gitHubAccount, 'microsoft', false, 'revoked', undefined],
			['GitHub is lost after it replaced Microsoft', gitHubAccount, 'microsoft', true, 'revoked', 'github'],
			['GitHub is being replaced by Microsoft', gitHubAccount, 'github', true, undefined, undefined],
			['the runtime asks for a service credential while Microsoft replaces GitHub', gitHubAccount, 'github', true, 'service', 'service'],
			['GitHub is pending on a Microsoft account', microsoftAccount, undefined, true, undefined, undefined],
			['the runtime asks for a service credential on a Microsoft account', microsoftAccount, undefined, true, 'service', 'service'],
			['a Microsoft sign-in is revoked before the account leaves Microsoft', failedMicrosoftSetup, undefined, true, 'revoked', undefined],
		];
		const names = new Map<unknown, string>([[github, 'github'], ...Object.entries(microsoft).map(([name, requirement]) => [requirement, name] as const)]);
		const asked = cases.map(([name, account, replacedSignIn, gitHubPending, microsoftPending]) => [name, names.get(selectCopilotAuthenticationRequirement({
			account, replacedSignIn,
			github: gitHubPending ? github : undefined,
			microsoft: microsoftPending && microsoft[microsoftPending],
		}))]);
		assert.deepStrictEqual(asked, cases.map(([name, , , , , expected]) => [name, expected]));
	});
});
