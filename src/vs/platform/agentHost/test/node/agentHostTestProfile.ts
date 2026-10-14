/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type AgentHostTestProfile = 'pr' | 'full';

export function getAgentHostTestProfile(value = process.env['AGENT_HOST_TEST_PROFILE']): AgentHostTestProfile {
	if (value === undefined || value === 'full') {
		return 'full';
	}
	if (value === 'pr') {
		return 'pr';
	}
	throw new Error(`Invalid AGENT_HOST_TEST_PROFILE: ${value}; expected pr or full`);
}

/** Registers full-profile coverage without changing its title, fixture identity, or capability gates. */
export function fullOnlyTest(title: string, run: (this: Mocha.Context) => void | PromiseLike<void>, enabled = true): Mocha.Test {
	return (getAgentHostTestProfile() === 'full' && enabled ? test : test.skip)(title, run);
}
