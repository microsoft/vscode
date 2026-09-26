/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { addGitHubEnterpriseUri, getConfiguredGitHubEnterpriseUris, getGitHubEnterpriseUri, gitHubEnterpriseUrisSetting } from '../../common/githubEnterprise.js';

suite('GitHub Enterprise enrollment configuration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function configuration(values: Record<string, unknown> = {}): TestConfigurationService {
		const service = new TestConfigurationService(values);
		store.add(service.onDidChangeConfigurationEmitter);
		return service;
	}

	test('plural takes precedence, including explicit empty, and absent plural falls back to legacy', () => {
		const legacy = 'https://legacy.ghe.com';
		assert.deepStrictEqual([
			{},
			{ 'github-enterprise.uri': legacy },
			{ 'github-enterprise.uri': legacy, [gitHubEnterpriseUrisSetting]: ['https://b.ghe.com', 'https://a.ghe.com'] },
			{ 'github-enterprise.uri': legacy, [gitHubEnterpriseUrisSetting]: [] },
		].map(values => getConfiguredGitHubEnterpriseUris(configuration(values), true)), [
			[], [legacy], ['https://b.ghe.com', 'https://a.ghe.com'], []
		]);
	});

	test('schema defaults do not disable the deprecated setting', () => {
		const service = configuration({ 'github-enterprise.uri': 'https://legacy.ghe.com' });
		sinon.stub(service, 'inspect').returns({ defaultValue: [], value: [] });
		assert.deepStrictEqual(getConfiguredGitHubEnterpriseUris(service, true), ['https://legacy.ghe.com']);
	});

	test('an explicit host list shared across profiles takes precedence over the deprecated setting', () => {
		const uris = ['https://shared.ghe.com'];
		const service = configuration({ 'github-enterprise.uri': 'https://legacy.ghe.com', [gitHubEnterpriseUrisSetting]: uris });
		sinon.stub(service, 'inspect').returns({ applicationValue: uris, value: uris });
		assert.deepStrictEqual(getConfiguredGitHubEnterpriseUris(service, true), uris);
	});

	test('invalid plural configuration never falls back to the deprecated setting', () => {
		const service = configuration({ 'github-enterprise.uri': 'https://legacy.ghe.com', [gitHubEnterpriseUrisSetting]: 'https://invalid.ghe.com' });
		assert.throws(() => getConfiguredGitHubEnterpriseUris(service, true), /must be an array/);
	});

	test('enrollment appends to the effective host list without overwriting it or the legacy setting', async () => {
		const service = configuration({ 'github-enterprise.uri': 'https://legacy.ghe.com' });
		const write = sinon.stub(service, 'updateValue').callsFake((key, value) => service.setUserConfiguration(key, value));
		await addGitHubEnterpriseUri(service, 'https://second.ghe.com', true);
		await addGitHubEnterpriseUri(service, 'https://third.ghe.com', true);
		await addGitHubEnterpriseUri(service, 'https://third.ghe.com', true);
		assert.deepStrictEqual({
			writes: write.getCalls().map(call => call.args),
			legacy: service.getValue('github-enterprise.uri'),
			hosts: getConfiguredGitHubEnterpriseUris(service, true)
		}, {
			writes: [
				[gitHubEnterpriseUrisSetting, ['https://legacy.ghe.com', 'https://second.ghe.com'], ConfigurationTarget.USER],
				[gitHubEnterpriseUrisSetting, ['https://legacy.ghe.com', 'https://second.ghe.com', 'https://third.ghe.com'], ConfigurationTarget.USER]
			],
			legacy: 'https://legacy.ghe.com',
			hosts: ['https://legacy.ghe.com', 'https://second.ghe.com', 'https://third.ghe.com']
		});
	});

	test('enrollment honors an explicitly empty workspace host list instead of writing a shadowed user value', async () => {
		const service = configuration({ 'github-enterprise.uri': 'https://legacy.ghe.com', [gitHubEnterpriseUrisSetting]: [] });
		sinon.stub(service, 'inspect').returns({ workspaceValue: [], value: [] });
		const write = sinon.stub(service, 'updateValue').resolves();
		await addGitHubEnterpriseUri(service, 'https://new.ghe.com', true);
		assert.deepStrictEqual(write.firstCall.args, [gitHubEnterpriseUrisSetting, ['https://new.ghe.com'], ConfigurationTarget.WORKSPACE]);
	});

	for (const scope of ['workspaceValue', 'workspaceFolderValue'] as const) {
		test(`untrusted ${scope} does not disable the legacy user host or redirect enrollment`, async () => {
			const legacy = 'https://legacy.ghe.com';
			const service = configuration({ 'github-enterprise.uri': legacy, [gitHubEnterpriseUrisSetting]: [] });
			sinon.stub(service, 'inspect').returns({ defaultValue: [], [scope]: [], value: [] });
			const write = sinon.stub(service, 'updateValue').resolves();
			const hosts = getConfiguredGitHubEnterpriseUris(service, false);
			await addGitHubEnterpriseUri(service, 'https://new.ghe.com', false);
			assert.deepStrictEqual({
				hosts,
				writes: write.getCalls().map(call => call.args)
			}, { hosts: [legacy], writes: [[gitHubEnterpriseUrisSetting, [legacy, 'https://new.ghe.com'], ConfigurationTarget.USER]] });
		});
	}

	for (const scope of ['applicationValue', 'userValue', 'userLocalValue', 'userRemoteValue'] as const) {
		for (const uris of [[], ['https://user.ghe.com']]) {
			test(`untrusted workspace preserves explicit ${scope} (${JSON.stringify(uris)})`, async () => {
				const service = configuration({ 'github-enterprise.uri': 'https://legacy.ghe.com', [gitHubEnterpriseUrisSetting]: uris });
				sinon.stub(service, 'inspect').returns({ [scope]: uris, workspaceValue: [], value: uris });
				const write = sinon.stub(service, 'updateValue').resolves();
				const hosts = getConfiguredGitHubEnterpriseUris(service, false);
				await addGitHubEnterpriseUri(service, 'https://new.ghe.com', false);
				assert.deepStrictEqual({
					hosts,
					writes: write.getCalls().map(call => call.args)
				}, { hosts: uris, writes: [[gitHubEnterpriseUrisSetting, [...uris, 'https://new.ghe.com'], ConfigurationTarget.USER]] });
			});
		}
	}
});

suite('GitHub Enterprise session provenance', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a missing issuer has no enterprise base', () => {
		assert.strictEqual(getGitHubEnterpriseUri(undefined), undefined);
	});

	test('derives enterprise cloud and server bases from the OAuth issuer', () => {
		assert.deepStrictEqual([
			'https://a.ghe.com/login/oauth',
			'https://b.ghe.com/login/oauth',
			'http://ghe.local:8080/Team/login/oauth',
			'HTTPS://GHE.LOCAL:443/Team/login/oauth',
			'https://ghe.local:443/team/login/oauth',
			'http://[::1]:8080/login/oauth',
		].map(value => getGitHubEnterpriseUri(URI.parse(value))?.toString()), [
			'https://a.ghe.com/',
			'https://b.ghe.com/',
			'http://ghe.local:8080/Team',
			'https://ghe.local:443/Team',
			'https://ghe.local:443/team',
			'http://[::1]:8080/',
		]);
	});

	test('preserves escaped base paths and explicit default ports', () => {
		assert.strictEqual(
			getGitHubEnterpriseUri(URI.parse('https://GHE.LOCAL:443/Team%20One%25/login/oauth'))?.toString(),
			'https://ghe.local:443/Team%20One%25',
		);
	});

	test('public GitHub issuers do not identify an enterprise base', () => {
		const issuers = [
			'https://github.com/login/oauth',
			'https://github.com.:443/login/oauth',
			'https://api.github.com/login/oauth',
			'https://www.github.com/login/oauth',
		];
		assert.deepStrictEqual(issuers.map(value => getGitHubEnterpriseUri(URI.parse(value))), issuers.map(() => undefined));
	});

	test('rejects invalid or non-OAuth provenance', () => {
		const issuers = [
			'https://ghe.local',
			'https://ghe.local/not-an-oauth-server',
			'ftp://ghe.local/login/oauth',
			'https://ghe.local:bad/login/oauth',
			'https://user@ghe.local/login/oauth',
			'https://ghe.local/base//login/oauth',
			'https://ghe.local/../base/login/oauth',
			'https://ghe.local/base/login/oauth?tenant=a',
			'https://ghe.local/base/login/oauth#fragment',
			'https://ghe.local/base/login/oauth//',
		];
		assert.deepStrictEqual(issuers.map(value => getGitHubEnterpriseUri(URI.parse(value))), issuers.map(() => undefined));
	});
});
