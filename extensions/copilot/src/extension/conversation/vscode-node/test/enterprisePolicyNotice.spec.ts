/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { SHOW_ENTERPRISE_POLICY_COMMAND_ID, createEnterprisePolicyNoticeMarkdown } from '../enterprisePolicyNotice';

/**
 * Unit tests for the read-only enterprise policy notice shown at the top of a
 * new chat. These cover only the presentation logic; the policy resolution
 * itself lives in the (unmodified) enterprise managed policy service.
 */
suite('createEnterprisePolicyNoticeMarkdown', () => {
	test('produces no notice when there is no policy', () => {
		for (const policy of [undefined, '', '   ']) {
			expect(createEnterprisePolicyNoticeMarkdown(policy)).toBeUndefined();
		}
	});

	test('renders a short policy inline without an expander', () => {
		const markdown = createEnterprisePolicyNoticeMarkdown('Always reply in pirate speak.');

		expect(markdown).toBe('> **Enterprise policy (set by your administrator):** Always reply in pirate speak.');
	});

	test('collapses whitespace in the inline preview', () => {
		const markdown = createEnterprisePolicyNoticeMarkdown('Reply\n\tin\n  plain   text');

		expect(markdown).toBe('> **Enterprise policy (set by your administrator):** Reply in plain text');
	});

	test('truncates a long policy and links to the full text via an interactive command', () => {
		const longPolicy = 'x'.repeat(500);
		const markdown = createEnterprisePolicyNoticeMarkdown(longPolicy);

		expect(markdown).toContain('Enterprise policy (set by your administrator):');
		expect(markdown).toContain('…');
		expect(markdown).toContain(`[Show full policy](command:${SHOW_ENTERPRISE_POLICY_COMMAND_ID})`);
		// The verbose full policy is not dumped inline; it is behind the command.
		expect(markdown).not.toContain(longPolicy);
	});
});
