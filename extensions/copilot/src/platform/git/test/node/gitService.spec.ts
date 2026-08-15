/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { AdoRepoId, getAdoRepoIdFromFetchUrl, getGithubRepoIdFromFetchUrl, GithubRepoId, normalizeFetchUrl, parseRemoteUrl, toGithubWebUrl } from '../../common/gitService';

function assertGitIdEquals(a: GithubRepoId | undefined, b: { org: string; repo: string; host?: string } | undefined, message?: string) {
	assert.strictEqual(a?.org, b?.org, message);
	assert.strictEqual(a?.repo, b?.repo, message);
	if (b?.host !== undefined) {
		assert.strictEqual(a?.host, b.host, message);
	}
}

suite('parseRemoteUrl', () => {
	test('Should handle basic https', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://example.com/owner/repo.git'),
			{ host: 'example.com', rawHost: 'example.com', path: '/owner/repo.git' });
	});

	test('Should find full subdomain with https', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://sub1.sub2.example.com/owner/repo.git'),
			{ host: 'sub1.sub2.example.com', rawHost: 'sub1.sub2.example.com', path: '/owner/repo.git' });
	});

	test('Should handle basic Azure dev ops url', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://test@dev.azure.com/test/project/_git/vscode-stuff'),
			{ host: 'dev.azure.com', rawHost: 'dev.azure.com', path: '/test/project/_git/vscode-stuff' });
	});

	test('Should handle basic visual studio url', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://test.visualstudio.com/project/one/_git/two'),
			{ host: 'test.visualstudio.com', rawHost: 'test.visualstudio.com', path: '/project/one/_git/two' });
	});

	test('Should strip out ports', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://example.com:8080/owner/repo.git'),
			{ host: 'example.com', rawHost: 'example.com', path: '/owner/repo.git' });
	});

	test('Should handle ssh syntax', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('ssh://git@github.com/owner/repo.git'),
			{ host: 'github.com', rawHost: 'github.com', path: '/owner/repo.git' });
	});

	test('Should strip user ids', () => {
		assert.deepStrictEqual(
			parseRemoteUrl('https://myname@github.com/owner/repo.git'),
			{ host: 'github.com', rawHost: 'github.com', path: '/owner/repo.git' },
			'https, name only');

		assert.deepStrictEqual(
			// [SuppressMessage("Microsoft.Security", "CS002:SecretInNextLine", Justification="test credentials")]
			parseRemoteUrl('https://myname:ghp_1234556@github.com/owner/repo.git'),
			{ host: 'github.com', rawHost: 'github.com', path: '/owner/repo.git' },
			'https, with name and PAT');

		assert.deepStrictEqual(
			parseRemoteUrl('https://ghp_1234556@github.com/owner/repo.git'),
			{ host: 'github.com', rawHost: 'github.com', path: '/owner/repo.git' },
			'https, PAT only');

		assert.deepStrictEqual(
			parseRemoteUrl('ssh://name@github.com/owner/repo.git'),
			{ host: 'github.com', rawHost: 'github.com', path: '/owner/repo.git' },
			'ssh, name only');
	});

	test('Should preserve rawHost for SSH alias hostnames', () => {
		const result = parseRemoteUrl('git@my-user-name-github.com:owner/repo.git');
		assert.strictEqual(result?.host, 'github.com');
		assert.strictEqual(result?.rawHost, 'my-user-name-github.com');
	});

	test('Should handle GHE SSH shorthand with alias prefix', () => {
		const result = parseRemoteUrl('msdemo-eu@msdemo-eu.ghe.com:sandbox/repo.git');
		assert.strictEqual(result?.host, 'eu.ghe.com');
		assert.strictEqual(result?.rawHost, 'msdemo-eu.ghe.com');
	});
});

suite('getGithubRepoIdFromFetchUrl', () => {
	test('should return undefined for non-GitHub URLs', () => {
		const url = 'https://example.com/owner/repo.git';
		const result = getGithubRepoIdFromFetchUrl(url);
		assert.strictEqual(result, undefined);
	});

	test('should return the repo name for git shorthand URLs', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('git@github.com:owner/repo.git'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('git@xyz.ghe.com:owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'ghe url');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('org-123@github.com:owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			`non 'git' user name`);

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('org-1234@xyz.github.com:owner-xyz/some-repo.git'),
			{ org: 'owner-xyz', repo: 'some-repo' },
			`non 'git' user name with subdomain alias`);
	});

	test('should return the repo name for HTTPS URLs', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://xyz.ghe.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'ghe url');
	});

	test('should return the repos with trailing slash', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://github.com/owner/repo/'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://github.com/owner/repo.git/'),
			{ org: 'owner', repo: 'repo' });
	});

	test('should return the repo name for URLs without .git extension', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://github.com/owner/repo'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://github.com/owner/repo/'),
			{ org: 'owner', repo: 'repo' },
			'With trailing slash');
	});

	test('should return the repo name for ssh:// URLs', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://git@github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://git@github.com/owner/repo'),
			{ org: 'owner', repo: 'repo' });

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://git@ssh.github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'On ssh.github.com subdomain');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://git@myco.ghe.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'ghe.com subdomain');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://git@github.com:443/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'With port');
	});

	test('should return undefined for invalid GitHub URLs', () => {
		{
			const url = 'https://github.com/owner';
			const result = getGithubRepoIdFromFetchUrl(url);
			assert.deepStrictEqual(result, undefined);
		}
		{
			const url = 'https://github.com/';
			const result = getGithubRepoIdFromFetchUrl(url);
			assert.deepStrictEqual(result, undefined);
		}
	});

	test('should return undefined for invalid URLs', () => {
		const url = 'invalid-url';
		const result = getGithubRepoIdFromFetchUrl(url);
		assert.deepStrictEqual(result, undefined);
	});

	test('should return undefined for unsupported scheme', () => {
		const url = 'gopher://github.com/owner/repo.git';
		const result = getGithubRepoIdFromFetchUrl(url);
		assert.deepStrictEqual(result, undefined);
	});

	test('should support github url that uses www subdomain', () => {
		// Likely a mistake but we can parse it easily
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://www.github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' });
	});

	test('should support github url using http', () => {
		// This is a mistake but we can parse it easily
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('http://github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' });
	});

	test('should support urls with custom user names and PAT in urls', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://myname@github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'https, name only');

		assertGitIdEquals(
			// [SuppressMessage("Microsoft.Security", "CS002:SecretInNextLine", Justification="test credentials")]
			getGithubRepoIdFromFetchUrl('https://myname:ghp_1234556@github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'https, with name and PAT');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('https://ghp_1234556@github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'https, PAT only');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('ssh://name@github.com/owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'ssh, name only');
	});

	test('should support github urls that are likely ssh aliases', () => {
		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('git@my-user-name-github.com:owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'Custom name before github.com');

		assertGitIdEquals(
			getGithubRepoIdFromFetchUrl('git@github.com-my-user-name:owner/repo.git'),
			{ org: 'owner', repo: 'repo' },
			'Custom name after github.com');
	});

	test('should set host to github.com for github.com URLs', () => {
		const result = getGithubRepoIdFromFetchUrl('https://github.com/owner/repo.git');
		assert.strictEqual(result?.host, 'github.com');
	});

	test('should set host to ghe.com subdomain for GHE URLs', () => {
		const result = getGithubRepoIdFromFetchUrl('https://xyz.ghe.com/owner/repo.git');
		assert.strictEqual(result?.host, 'xyz.ghe.com');
	});

	test('should set host to ghe.com subdomain for GHE SSH shorthand URLs', () => {
		const result = getGithubRepoIdFromFetchUrl('git@msdemo-eu.ghe.com:sandbox/repo.git');
		assert.strictEqual(result?.host, 'msdemo-eu.ghe.com');
	});

	test('should set host to github.com for SSH alias URLs', () => {
		const result = getGithubRepoIdFromFetchUrl('git@my-user-name-github.com:owner/repo.git');
		assert.strictEqual(result?.host, 'github.com');
	});

	test('should set host to github.com for ssh:// github.com URLs', () => {
		const result = getGithubRepoIdFromFetchUrl('ssh://git@github.com/owner/repo.git');
		assert.strictEqual(result?.host, 'github.com');
	});

	test('should set host to ghe.com subdomain for ssh:// ghe URLs', () => {
		const result = getGithubRepoIdFromFetchUrl('ssh://git@myco.ghe.com/owner/repo.git');
		assert.strictEqual(result?.host, 'myco.ghe.com');
	});

	test('should set host to github.com for http github.com URLs', () => {
		const result = getGithubRepoIdFromFetchUrl('http://github.com/owner/repo.git');
		assert.strictEqual(result?.host, 'github.com');
	});

	test('should set host to github.com for www.github.com URLs', () => {
		const result = getGithubRepoIdFromFetchUrl('https://www.github.com/owner/repo.git');
		assert.strictEqual(result?.host, 'github.com');
	});

	test('should set host to github.com for SSH alias with suffix', () => {
		const result = getGithubRepoIdFromFetchUrl('git@github.com-my-user-name:owner/repo.git');
		assert.strictEqual(result?.host, 'github.com');
	});

	test('should resolve host and org/repo correctly for real-world GHE SSH shorthand', () => {
		// Real-world scenario: msdemo-eu@msdemo-eu.ghe.com:sandbox/repo.git
		const result = getGithubRepoIdFromFetchUrl('msdemo-eu@msdemo-eu.ghe.com:sandbox/repo.git');
		assert.ok(result, 'Should parse successfully');
		assert.strictEqual(result.org, 'sandbox');
		assert.strictEqual(result.repo, 'repo');
		assert.strictEqual(result.host, 'msdemo-eu.ghe.com');
	});

	test('should resolve host for GHE HTTPS with credentials', () => {
		const result = getGithubRepoIdFromFetchUrl('https://user@myco.ghe.com/org/repo.git');
		assert.ok(result, 'Should parse successfully');
		assert.strictEqual(result.host, 'myco.ghe.com');
		assert.strictEqual(result.org, 'org');
		assert.strictEqual(result.repo, 'repo');
	});

	test('should resolve host for GHE HTTPS without .git extension', () => {
		const result = getGithubRepoIdFromFetchUrl('https://myco.ghe.com/org/repo');
		assert.ok(result, 'Should parse successfully');
		assert.strictEqual(result.host, 'myco.ghe.com');
	});
});

suite('GithubRepoId', () => {
	test('should default host to github.com', () => {
		const id = new GithubRepoId('owner', 'repo');
		assert.strictEqual(id.host, 'github.com');
	});

	test('should accept custom host', () => {
		const id = new GithubRepoId('owner', 'repo', 'myco.ghe.com');
		assert.strictEqual(id.host, 'myco.ghe.com');
	});

	test('toString should return org/repo without host', () => {
		const id = new GithubRepoId('Owner', 'Repo', 'myco.ghe.com');
		assert.strictEqual(id.toString(), 'owner/repo');
	});

	test('parse should default host to github.com', () => {
		const id = GithubRepoId.parse('owner/repo');
		assert.ok(id);
		assert.strictEqual(id.host, 'github.com');
	});

	test('parse should return undefined for invalid nwo', () => {
		assert.strictEqual(GithubRepoId.parse('invalid'), undefined);
		assert.strictEqual(GithubRepoId.parse('a/b/c'), undefined);
		assert.strictEqual(GithubRepoId.parse(''), undefined);
	});

	test('type should be github', () => {
		const id = new GithubRepoId('owner', 'repo');
		assert.strictEqual(id.type, 'github');
	});
});

suite('toGithubWebUrl', () => {
	test('should return github.com URL for default host', () => {
		const id = new GithubRepoId('owner', 'repo');
		assert.strictEqual(toGithubWebUrl(id), 'https://github.com/owner/repo');
	});

	test('should return GHE URL for custom host', () => {
		const id = new GithubRepoId('owner', 'repo', 'myco.ghe.com');
		assert.strictEqual(toGithubWebUrl(id), 'https://myco.ghe.com/owner/repo');
	});

	test('should preserve case in org and repo', () => {
		const id = new GithubRepoId('MyOrg', 'MyRepo', 'myco.ghe.com');
		assert.strictEqual(toGithubWebUrl(id), 'https://myco.ghe.com/MyOrg/MyRepo');
	});

	test('should handle deeply nested GHE subdomain', () => {
		const id = new GithubRepoId('org', 'repo', 'dept.company.ghe.com');
		assert.strictEqual(toGithubWebUrl(id), 'https://dept.company.ghe.com/org/repo');
	});
});

suite('parseRemoteUrl rawHost', () => {
	test('should return matching host and rawHost for plain HTTPS URLs', () => {
		const result = parseRemoteUrl('https://github.com/owner/repo.git');
		assert.strictEqual(result?.host, 'github.com');
		assert.strictEqual(result?.rawHost, 'github.com');
	});

	test('should return matching host and rawHost for GHE HTTPS', () => {
		const result = parseRemoteUrl('https://myco.ghe.com/owner/repo.git');
		assert.strictEqual(result?.host, 'myco.ghe.com');
		assert.strictEqual(result?.rawHost, 'myco.ghe.com');
	});

	test('should return different host and rawHost for SSH alias prefix', () => {
		const result = parseRemoteUrl('git@my-alias-github.com:owner/repo.git');
		assert.strictEqual(result?.rawHost, 'my-alias-github.com');
		assert.strictEqual(result?.host, 'github.com');
	});

	test('should return different host and rawHost for SSH alias suffix', () => {
		const result = parseRemoteUrl('git@github.com-my-alias:owner/repo.git');
		assert.strictEqual(result?.rawHost, 'github.com-my-alias');
		assert.strictEqual(result?.host, 'github.com');
	});

	test('should strip port from rawHost', () => {
		const result = parseRemoteUrl('ssh://git@github.com:443/owner/repo.git');
		assert.strictEqual(result?.rawHost, 'github.com');
	});

	test('should strip user from rawHost', () => {
		const result = parseRemoteUrl('https://user@myco.ghe.com/owner/repo.git');
		assert.strictEqual(result?.rawHost, 'myco.ghe.com');
	});
});

suite('Sanitize Remote Repo Urls', () => {
	test('Https url is unchanged', () => {
		const url = 'https://github.com/owner/repo.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, url);
	});

	test('Http url is converted to https', () => {
		const url = 'http://github.com/owner/repo.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://github.com/owner/repo.git');
	});

	test('Query parameters are removed', () => {
		const url = 'https://github.com/owner/repo.git';
		const urlWithQuery = `${url}?query=param`;
		const result = normalizeFetchUrl(urlWithQuery);
		assert.strictEqual(result, url);
	});

	test('SSH is converted to HTTPS', () => {
		const url = 'git@github.com:owner/repo.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://github.com/owner/repo.git');
	});

	test('Credentials are removed from HTTPs url', () => {
		const url = 'https://user:password@server.com/org/repo';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://server.com/org/repo');
	});

	test('SSH ports are normalized and removed', () => {
		const url = 'ssh://git@bitbucket.company.pl:7999/project/repo.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://bitbucket.company.pl/project/repo.git');
	});

	test('Bitbucket https urls are properly normalized', () => {
		const url = 'https://bitbucket.company.pl/scm/project/repo.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://bitbucket.company.pl/project/repo.git');
	});

	test('Repos named scm by org foo are not improperly truncated', () => {
		const url = 'https://github.com/foo/scm.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://github.com/foo/scm.git');
	});

	test('Repos named scm by user scm are not improperly truncated', () => {
		const url = 'https://github.com/scm/scm.git';
		const result = normalizeFetchUrl(url);
		assert.strictEqual(result, 'https://github.com/scm/scm.git');
	});
});

suite('getAdoRepoIdFromFetchUrl', () => {
	test('should return undefined for non-ADO URLs', () => {
		assert.strictEqual(
			getAdoRepoIdFromFetchUrl('https://example.com/owner/repo.git'),
			undefined);
		assert.strictEqual(
			getAdoRepoIdFromFetchUrl('https://github.com/scm/scm.git'),
			undefined);
	});

	test('should parse https format', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://dev.azure.com/organization/project/_git/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse https format with _optimized', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://dev.azure.com/organization/project/_git/_optimized/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse https format with _full', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://dev.azure.com/organization/project/_git/_full/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy https format', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://organization.visualstudio.com/project/_git/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy https format with _optimized', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://organization.visualstudio.com/project/_git/_optimized/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy https format with _full', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('https://organization.visualstudio.com/project/_git/_full/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse ssh format', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@ssh.dev.azure.com:v3/organization/project/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse ssh format with _optimized', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@ssh.dev.azure.com:v3/organization/project/_optimized/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse ssh format with _full', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@ssh.dev.azure.com:v3/organization/project/_full/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy ssh format', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@organization.visualstudio.com:v3/organization/project/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy ssh format with _optimized', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@organization.visualstudio.com:v3/organization/project/_optimized/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});

	test('should parse legacy ssh format with _full', () => {
		assert.deepStrictEqual(
			getAdoRepoIdFromFetchUrl('git@organization.visualstudio.com:v3/organization/project/_full/repository'),
			new AdoRepoId('organization', 'project', 'repository'));
	});
});
