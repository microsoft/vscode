/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { COPILOT_COMMUNICATION_SUPPORT_URL_KEY } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { DEFAULT_ORGANIZATION_SUPPORT_URL, getOrganizationSupportActionTooltip, getOrganizationSupportUrl } from '../../common/organizationSupport.js';

suite('Organization support', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('falls back to the default help page unless the organization sets a valid one', () => {
		const resolve = (value: string | undefined) => getOrganizationSupportUrl({ getManagedSettingValue: key => key === COPILOT_COMMUNICATION_SUPPORT_URL_KEY ? value : undefined });
		assert.deepStrictEqual({
			unset: resolve(undefined),
			invalid: resolve('javascript:alert(1)'),
			valid: resolve('https://example.com/copilot-help'),
		}, {
			unset: DEFAULT_ORGANIZATION_SUPPORT_URL,
			invalid: DEFAULT_ORGANIZATION_SUPPORT_URL,
			valid: 'https://example.com/copilot-help',
		});
	});

	test('the default help page is an absolute aka.ms link, and its tooltip does not claim to be the organization\'s page', () => {
		const url = new URL(DEFAULT_ORGANIZATION_SUPPORT_URL);
		assert.deepStrictEqual({
			protocol: url.protocol,
			host: url.host,
			defaultTooltip: getOrganizationSupportActionTooltip(DEFAULT_ORGANIZATION_SUPPORT_URL),
			organizationTooltip: getOrganizationSupportActionTooltip('https://example.com/copilot-help'),
		}, {
			protocol: 'https:',
			host: 'aka.ms',
			defaultTooltip: 'Learn how to contact your administrator (aka.ms)',
			organizationTooltip: 'Opens your organization\'s help page (example.com)',
		});
	});
});
