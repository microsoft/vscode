/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line local/code-layering, local/code-no-restricted-zone-imports -- Pre-existing layering violation found when the zone check started resolving extensionless imports.
import { getUserKind } from '../../../../extension/completions-core/vscode-node/lib/src/auth/orgs';
import { mock } from '../../../../util/common/test/simpleMock';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { platform, PlatformToString } from '../../../../util/vs/base/common/platform';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { CopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { INTEGRATION_ID } from '../../../endpoint/common/licenseAgreement';
import { packageJson } from '../../../env/common/packagejson';
import { ILogService } from '../../../log/common/logService';
import { UserInfoStore } from '../../node/baseExperimentationService';
// eslint-disable-next-line local/code-layering -- Pre-existing layering violation found when the zone check started resolving extensionless imports.
import { CopilotAssignmentsFilterProvider, GitHubAccountFilterProvider } from '../../vscode-node/microsoftExperimentationService';

vi.mock('vscode', async importOriginal => ({
	...await importOriginal<typeof import('vscode')>(),
	env: { appRoot: '.', devDeviceId: 'test-device' },
	workspace: { isAgentSessionsWorkspace: false },
}));

vi.mock('vscode-tas-client', () => ({
	TargetPopulation: { Insiders: 'insider', Public: 'public' },
}));

describe('CopilotAssignmentsFilterProvider', () => {
	const disposables = new DisposableStore();
	afterEach(() => disposables.clear());

	function createProvider() {
		const tokenStore = disposables.add(new CopilotTokenStore());
		tokenStore.authenticationState = 'signedIn';
		const logService = new class extends mock<ILogService>() {
			override trace(): void { }
			override warn(): void { }
		}();
		return { tokenStore, provider: new CopilotAssignmentsFilterProvider(tokenStore, logService) };
	}

	it('emits new TAS parameters without legacy headers or Market', () => {
		const { tokenStore, provider } = createProvider();
		tokenStore.copilotToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'tid=tracking-id;sn=1;fcv1=1',
			sku: 'enterprise',
			organization_list: ['4535c7beffc844b46bb1ed4aa04d759a'],
			enterprise_list: [42],
		}));

		expect(Object.fromEntries(provider.getFilters())).toEqual({
			integratorid: INTEGRATION_ID,
			vscode_core_platform: PlatformToString(platform),
			vscode_core_windowkind: 'editor',
			devdeviceid: 'test-device',
			copilottrackingid: 'tracking-id',
			github_core_organizationid: '4535c7beffc844b46bb1ed4aa04d759a',
			github_core_businessid: '42',
			github_core_isghormsftstaff: '1',
			github_core_ghmsftorexternal: 'github',
			github_core_userkind: '4535c7beffc844b46bb1ed4aa04d759a',
			github_core_copilotsku: 'enterprise',
			github_core_issn: '1',
			github_core_isfcv1: '1',
			vscode_core_copilotchatextensionversion: packageJson.version.split('-')[0],
		});

	});

	it('uses current token values after refresh and clears account values on sign-out', () => {
		const { tokenStore, provider } = createProvider();
		const tokens = [
			new CopilotToken(createTestExtendedTokenInfo({
				token: 'sn=1;fcv1=1',
				sku: 'enterprise',
				organization_list: ['a5db0bcaae94032fe715fb34a5e4bce2'],
			})),
			new CopilotToken(createTestExtendedTokenInfo({ token: 'sn=0;fcv1=0', sku: 'pro', organization_list: ['unrecognized-org'] })),
			new CopilotToken(createTestExtendedTokenInfo({ token: 'tid=test', sku: undefined })),
			undefined,
		];

		expect(tokens.map(token => {
			tokenStore.copilotToken = token;
			const filters = provider.getFilters();
			return [
				filters.get('github_core_userkind'),
				filters.get('github_core_copilotsku'),
				filters.get('github_core_issn'),
				filters.get('github_core_isfcv1'),
			];
		})).toEqual([
			['a5db0bcaae94032fe715fb34a5e4bce2', 'enterprise', '1', '1'],
			[undefined, 'pro', '0', '0'],
			[undefined, undefined, '0', '0'],
			[undefined, undefined, '0', '0'],
		]);
	});

	it('preserves VS Code team targeting and internal organization precedence across token changes', () => {
		const { tokenStore, provider } = createProvider();
		const organizations = [
			['a5db0bcaae94032fe715fb34a5e4bce2'],
			['4535c7beffc844b46bb1ed4aa04d759a'],
			['551cca60ce19654d894e786220822482'],
			['a5db0bcaae94032fe715fb34a5e4bce2', '4535c7beffc844b46bb1ed4aa04d759a', '551cca60ce19654d894e786220822482'],
			['unrecognized-org'],
			[],
		];
		const tokens = [
			...organizations.map(organization_list => new CopilotToken(createTestExtendedTokenInfo({ organization_list }))),
			new CopilotToken(createTestExtendedTokenInfo({ isVscodeTeamMember: true })),
			undefined,
		];

		expect(tokens.map(token => {
			tokenStore.copilotToken = token;
			const filters = provider.getFilters();
			return [
				filters.get('github_core_ghmsftorexternal'),
				filters.get('github_core_isghormsftstaff'),
			];
		})).toEqual([
			['microsoft', '1'],
			['github', '1'],
			['vscode', '1'],
			['vscode', '1'],
			['external', '0'],
			['external', '0'],
			['vscode', '1'],
			['external', '0'],
		]);
	});

	it('preserves legacy CLS user-kind values and precedence', () => {
		const { tokenStore, provider } = createProvider();
		const knownOrganizations = [
			'a5db0bcaae94032fe715fb34a5e4bce2',
			'7184f66dfcee98cb5f08a1cb936d5225',
			'faef89d9169d5eacf1d8c8dde3412e37',
			'4535c7beffc844b46bb1ed4aa04d759a',
		];
		const organizations = [
			...knownOrganizations.map(org => [org]),
			[...knownOrganizations].reverse(),
			['unrecognized-org'],
			[],
		];

		expect(organizations.map(organization_list => {
			const token = new CopilotToken(createTestExtendedTokenInfo({ organization_list }));
			tokenStore.copilotToken = token;
			return [getUserKind(token), provider.getFilters().get('github_core_userkind')];
		})).toEqual([
			...knownOrganizations.map(org => [org, org]),
			[knownOrganizations[0], knownOrganizations[0]],
			['', undefined],
			['', undefined],
		]);
	});
});

describe('GitHubAccountFilterProvider', () => {
	it('emits Proxima only as a legacy TAS header', () => {
		let isProxima = false;
		const userInfoStore = new class extends mock<UserInfoStore>() {
			override get isProxima(): boolean {
				return isProxima;
			}
		}();
		const logService = new class extends mock<ILogService>() {
			override trace(): void { }
		}();
		const provider = new GitHubAccountFilterProvider(userInfoStore, logService);

		expect([false, true].map(value => {
			isProxima = value;
			const filters = provider.getFilters();
			return {
				legacy: filters.get('X-GitHub-Copilot-IsProxima'),
				edge: filters.get('github_core_isproxima'),
			};
		})).toEqual([
			{ legacy: '0', edge: undefined },
			{ legacy: '1', edge: undefined },
		]);
	});
});
