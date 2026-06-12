/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { getPolicyIdentity, isBlockedByPolicy, isCliBucketTrusted, resolveEnterprisePluginId } from '../../../common/plugins/agentPluginServiceImpl.js';
import { IMarketplacePlugin, IMarketplaceReference, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';

suite('AgentPluginService policy enforcement', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const logService = new NullLogService();

	/** Builds a full {@link IMarketplacePlugin} from the few fields the policy gate reads. */
	function marketplacePlugin(name: string, marketplace: string, reference: IMarketplaceReference): IMarketplacePlugin {
		return {
			name,
			description: '',
			version: '1.0.0',
			source: '',
			sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: '' },
			marketplace,
			marketplaceReference: reference,
			marketplaceType: MarketplaceType.Copilot,
		};
	}

	/** A plugin discovered from a marketplace, carrying full provenance metadata. */
	function fromMarketplace(name: string, marketplace: string): { uri: URI; fromMarketplace: IMarketplacePlugin } {
		const reference = parseMarketplaceReference('acme/skills')!;
		return { uri: URI.file('/anywhere/plugin'), fromMarketplace: marketplacePlugin(name, marketplace, reference) };
	}

	/** A plugin discovered from a local path (no marketplace provenance). */
	function fromPath(path: string): { uri: URI; fromMarketplace: undefined } {
		return { uri: URI.file(path), fromMarketplace: undefined };
	}

	const allowAll = { isMarketplaceTrusted: () => true };
	const denyAll = { isMarketplaceTrusted: () => false };

	suite('resolveEnterprisePluginId', () => {

		test('resolves `<plugin>@<marketplace>` to the Copilot CLI install path', () => {
			assert.strictEqual(
				resolveEnterprisePluginId('my-plugin@acme', '/home/me')?.toString(),
				URI.file('/home/me/.copilot/installed-plugins/acme/my-plugin').toString(),
			);
		});

		test('returns undefined for entries that are not in `<plugin>@<marketplace>` form', () => {
			for (const id of ['', 'no-at-sign', 'a@b@c', 'a/b@c', 'a@b/c', 'plug~in@mkt', '@only-marketplace', 'only-plugin@']) {
				assert.strictEqual(resolveEnterprisePluginId(id, '/home/me'), undefined, id);
			}
		});
	});

	suite('getPolicyIdentity', () => {

		test('marketplace provenance yields name/marketplace/reference', () => {
			const reference = parseMarketplaceReference('acme/skills')!;
			const plugin = { uri: URI.file('/anywhere'), fromMarketplace: marketplacePlugin('my-plugin', 'acme', reference) };
			assert.deepStrictEqual(getPolicyIdentity(plugin), { name: 'my-plugin', marketplace: 'acme', marketplaceReference: reference });
		});

		test('marketplace provenance wins even when the URI also looks like a CLI install path', () => {
			const reference = parseMarketplaceReference('acme/skills')!;
			const plugin = { uri: URI.file('/home/me/.copilot/installed-plugins/bucket/p'), fromMarketplace: marketplacePlugin('real', 'real-mkt', reference) };
			assert.deepStrictEqual(getPolicyIdentity(plugin), { name: 'real', marketplace: 'real-mkt', marketplaceReference: reference });
		});

		test('CLI install path yields identity derived from `<marketplace>/<plugin>` segments', () => {
			assert.deepStrictEqual(
				getPolicyIdentity(fromPath('/home/me/.copilot/installed-plugins/acme/my-plugin')),
				{ name: 'my-plugin', marketplace: 'acme' },
			);
		});

		test('reserved `_direct` install bucket is not gated', () => {
			assert.strictEqual(getPolicyIdentity(fromPath('/home/me/.copilot/installed-plugins/_direct/my-plugin')), undefined);
		});

		test('returns undefined for non-file URIs', () => {
			assert.strictEqual(getPolicyIdentity({ uri: URI.parse('https://example.com/x'), fromMarketplace: undefined }), undefined);
		});

		test('returns undefined for file paths outside the CLI install convention', () => {
			assert.strictEqual(getPolicyIdentity(fromPath('/home/me/projects/foo')), undefined);
		});

		test('returns undefined when the install path has the wrong segment depth', () => {
			assert.strictEqual(getPolicyIdentity(fromPath('/home/me/.copilot/installed-plugins/acme')), undefined);
			assert.strictEqual(getPolicyIdentity(fromPath('/home/me/.copilot/installed-plugins/acme/my-plugin/sub')), undefined);
		});
	});

	suite('isCliBucketTrusted', () => {

		test('matches by GitHub repo name tail', () => {
			assert.strictEqual(isCliBucketTrusted('skills', [parseMarketplaceReference('acme/skills')!]), true);
		});

		test('matches by exact displayLabel', () => {
			assert.strictEqual(isCliBucketTrusted('acme/skills', [parseMarketplaceReference('acme/skills')!]), true);
		});

		test('matches a git URI bucket by canonicalId `.git` suffix', () => {
			assert.strictEqual(isCliBucketTrusted('skills', [parseMarketplaceReference('https://git.acme.com/team/skills.git')!]), true);
		});

		test('returns false for an unknown bucket', () => {
			assert.strictEqual(isCliBucketTrusted('unknown', [parseMarketplaceReference('acme/skills')!]), false);
		});

		test('returns false when there are no trusted marketplaces', () => {
			assert.strictEqual(isCliBucketTrusted('skills', []), false);
		});
	});

	suite('isBlockedByPolicy', () => {

		test('plugins without policy identity are never blocked', () => {
			// User filesystem path, strictest possible policy — still allowed.
			assert.strictEqual(isBlockedByPolicy(fromPath('/home/me/projects/foo'), { 'x@y': true }, true, [], denyAll, logService), false);
		});

		suite('enabledPlugins gate', () => {

			test('allows a marketplace plugin explicitly enabled by policy', () => {
				assert.strictEqual(isBlockedByPolicy(fromMarketplace('my-plugin', 'acme'), { 'my-plugin@acme': true }, false, [], allowAll, logService), false);
			});

			test('blocks a marketplace plugin absent from a non-empty policy', () => {
				assert.strictEqual(isBlockedByPolicy(fromMarketplace('my-plugin', 'acme'), { 'other@x': true }, false, [], allowAll, logService), true);
			});

			test('blocks a marketplace plugin explicitly disabled by policy', () => {
				assert.strictEqual(isBlockedByPolicy(fromMarketplace('my-plugin', 'acme'), { 'my-plugin@acme': false }, false, [], allowAll, logService), true);
			});

			test('an empty policy object gates nothing', () => {
				assert.strictEqual(isBlockedByPolicy(fromMarketplace('my-plugin', 'acme'), {}, false, [], allowAll, logService), false);
			});

			test('an undefined policy gates nothing', () => {
				assert.strictEqual(isBlockedByPolicy(fromMarketplace('my-plugin', 'acme'), undefined, false, [], allowAll, logService), false);
			});
		});

		suite('strict marketplace gate', () => {

			test('allows a marketplace plugin from a trusted marketplace', () => {
				assert.strictEqual(isBlockedByPolicy(fromMarketplace('my-plugin', 'acme'), undefined, true, [], allowAll, logService), false);
			});

			test('blocks a marketplace plugin from an untrusted marketplace', () => {
				assert.strictEqual(isBlockedByPolicy(fromMarketplace('my-plugin', 'acme'), undefined, true, [], denyAll, logService), true);
			});

			test('allows a CLI-installed plugin whose bucket is in the trusted extras', () => {
				const plugin = fromPath('/home/me/.copilot/installed-plugins/acme/my-plugin');
				assert.strictEqual(isBlockedByPolicy(plugin, undefined, true, [parseMarketplaceReference('org/acme')!], denyAll, logService), false);
			});

			test('blocks a CLI-installed plugin whose bucket is not trusted', () => {
				const plugin = fromPath('/home/me/.copilot/installed-plugins/acme/my-plugin');
				assert.strictEqual(isBlockedByPolicy(plugin, undefined, true, [], denyAll, logService), true);
			});
		});

		test('both gates apply: enabled by policy but from an untrusted marketplace is blocked', () => {
			assert.strictEqual(isBlockedByPolicy(fromMarketplace('my-plugin', 'acme'), { 'my-plugin@acme': true }, true, [], denyAll, logService), true);
		});

		test('both gates apply: enabled by policy and from a trusted marketplace is allowed', () => {
			assert.strictEqual(isBlockedByPolicy(fromMarketplace('my-plugin', 'acme'), { 'my-plugin@acme': true }, true, [], allowAll, logService), false);
		});
	});
});
