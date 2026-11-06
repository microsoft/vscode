/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ISyncedCustomization } from '../../../common/agentPluginManager.js';
import { CustomizationLoadStatus, CustomizationType, customizationId } from '../../../common/state/sessionState.js';
import { CustomizationEnablementKind, type CustomizationEnablement } from '../../../common/state/protocol/state.js';
import { SessionClientCustomizationsDiff } from '../../../node/claude/customizations/claudeSessionClientCustomizationsModel.js';
import { readCustomizationUriClientId, readCustomizationUriClientIds, toClientPluginSourceUrisMeta, toCustomizationUriClientMeta } from '../../../common/meta/clientPluginCustomizationMeta.js';

function synced(uri: string, opts: { dir?: string; enabled?: boolean; nonce?: string; name?: string; enablement?: readonly CustomizationEnablement[]; childEnablement?: Readonly<Record<string, readonly CustomizationEnablement[]>> } = {}): ISyncedCustomization {
	return {
		customization: {
			type: CustomizationType.Plugin,
			id: customizationId(uri),
			uri,
			name: opts.name ?? uri,
			...(opts.enabled === false ? {
				// TODO: Step 2 selects the persisted enablement scope.
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			} : {}),
			...(opts.enablement !== undefined ? { enablement: [...opts.enablement] } : {}),
			...(opts.childEnablement !== undefined ? { childEnablement: opts.childEnablement } : {}),
			load: { kind: CustomizationLoadStatus.Loaded },
			...(opts.nonce !== undefined ? { nonce: opts.nonce } : {}),
		},
		...(opts.dir !== undefined ? { pluginDir: URI.file(opts.dir) } : {}),
	};
}

function withClientOwner(item: ISyncedCustomization, clientId: string): ISyncedCustomization {
	return {
		...item,
		customization: { ...item.customization, children: item.customization.children?.map(child => ({ ...child, _meta: toCustomizationUriClientMeta(clientId) })) },
	};
}

suite('SessionClientCustomizationsDiff', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fresh diff is empty and not dirty', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		assert.deepStrictEqual(diff.model.state.get().synced, []);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('publishes already-canonical parsed children while retaining runtime directories and enablement', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		const item = synced('vscode-synced-customization:/bundle', { dir: '/cache/plugin' });
		const source = URI.file('/workspace/.github/agents/reviewer.md');
		const child = {
			type: CustomizationType.Agent as const,
			id: 'agent:reviewer',
			name: 'Reviewer',
			uri: source.toString(),
			enabled: false,
		};
		item.customization.children = [child];
		item.customization._meta = toClientPluginSourceUrisMeta({ files: { 'agents/reviewer.md': source } });
		diff.model.setSyncedCustomizations('owner', [withClientOwner(item, 'owner')]);
		const published = diff.model.state.get().synced[0].customization.children![0];

		assert.deepStrictEqual({
			published: { ...published, _meta: undefined },
			owner: readCustomizationUriClientId(published),
			containerOwner: diff.model.state.get().synced[0].customization.clientId,
			runtime: diff.model.state.get().synced[0].pluginDir?.toString(),
		}, {
			published: { ...child, uri: source.toString(), _meta: undefined },
			owner: 'owner',
			containerOwner: 'owner',
			runtime: URI.file('/cache/plugin').toString(),
		});
	});

	test('source metadata and child URI changes invalidate the customization snapshot', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		const first = synced('https://plugin', { dir: '/cache/plugin' });
		first.customization.children = [{ type: CustomizationType.Agent, id: 'agent', name: 'Agent', uri: URI.file('/cache/plugin/agents/a.md').toString() }];
		diff.model.setSyncedCustomizations('owner', [first]);
		diff.consume([]);
		const second = { ...first, customization: { ...first.customization, _meta: toClientPluginSourceUrisMeta({ root: URI.file('/source'), files: {} }) } };
		diff.model.setSyncedCustomizations('owner', [second]);
		const metadataChanged = diff.hasDifference;
		diff.consume([]);
		diff.model.setSyncedCustomizations('owner', [{
			...second,
			customization: { ...second.customization, children: first.customization.children.map(child => ({ ...child, uri: URI.file('/cache/plugin/agents/b.md').toString() })) },
		}]);
		assert.deepStrictEqual([metadataChanged, diff.hasDifference], [true, true]);
	});

	test('a deduplicated plugin changing client ownership invalidates publication', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		const item = synced('https://plugin', { dir: '/cache/plugin' });
		item.customization.children = [{ type: CustomizationType.Agent, id: 'agent', name: 'Agent', uri: URI.file('/cache/plugin/agents/a.md').toString() }];
		diff.model.setSyncedCustomizations('first', [withClientOwner(item, 'first')]);
		diff.model.setSyncedCustomizations('second', [withClientOwner(item, 'second')]);
		diff.consume([]);
		diff.model.removeClient('first');
		const child = diff.model.state.get().synced[0].customization.children![0];

		assert.deepStrictEqual({ changed: diff.hasDifference, owner: readCustomizationUriClientId(child) }, { changed: true, owner: 'second' });
	});

	test('deduplicates runtime plugins without losing a second client source owner', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		const item = synced('synced:/bundle', { dir: '/cache/plugin' });
		item.customization.children = [{ type: CustomizationType.Agent, id: 'agent', name: 'Agent', uri: URI.file('/cache/plugin/agents/a.md').toString() }];
		diff.model.setSyncedCustomizations('first', [withClientOwner(item, 'first')]);
		diff.consume([]);
		diff.model.setSyncedCustomizations('second', [withClientOwner(item, 'second')]);
		const published = diff.model.state.get().synced;
		const changed = diff.hasDifference;
		diff.model.removeClient('first');
		assert.deepStrictEqual({
			changed,
			runtimeCount: diff.model.state.get().synced.length,
			publishedCount: published.length,
			owners: readCustomizationUriClientIds(published[0].customization.children![0]),
			afterDisconnect: readCustomizationUriClientIds(diff.model.state.get().synced[0].customization.children![0]),
		}, { changed: true, runtimeCount: 1, publishedCount: 1, owners: ['first', 'second'], afterDisconnect: ['second'] });
	});

	test('setSyncedCustomizations flips dirty and fires onDidChange', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		let fires = 0;
		disposables.add(diff.onDidChange(() => fires++));
		diff.model.setSyncedCustomizations('c1', [synced('https://a', { dir: '/p/a' })]);
		assert.strictEqual(diff.hasDifference, true);
		assert.strictEqual(fires, 1);
	});

	test('consume records applied paths and detects desired path drift', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations('c1', [synced('https://a', { dir: '/p/a' })]);
		const paths = [URI.file('/p/a')];
		assert.deepStrictEqual(diff.consume(paths), paths);
		assert.deepStrictEqual({
			hasDifference: diff.hasDifferenceFrom(paths),
			hasPathDrift: diff.hasDifferenceFrom([]),
		}, {
			hasDifference: false,
			hasPathDrift: true,
		});
	});

	test('markDirty re-flips after failed downstream reload', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations('c1', [synced('https://a', { dir: '/p/a' })]);
		diff.consume([URI.file('/p/a')]);
		assert.strictEqual(diff.hasDifference, false);
		diff.markDirty();
		assert.strictEqual(diff.hasDifference, true);
	});

	test('structurally-equivalent re-send is deduped (no fire, no dirty)', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations('c1', [synced('https://a', { dir: '/p/a' })]);
		diff.consume([URI.file('/p/a')]);
		let fires = 0;
		disposables.add(diff.onDidChange(() => fires++));
		diff.model.setSyncedCustomizations('c1', [synced('https://a', { dir: '/p/a' })]);
		assert.strictEqual(fires, 0);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('equivalent deserialized enablement snapshots are deduped', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		const enablement: readonly CustomizationEnablement[] = [{ kind: CustomizationEnablementKind.Global, enabled: false }];
		diff.model.setSyncedCustomizations('c1', [synced('https://a', {
			dir: '/p/a',
			enablement,
			childEnablement: {
				first: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
				second: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
			},
		})]);
		diff.consume([URI.file('/p/a')]);
		let fires = 0;
		disposables.add(diff.onDidChange(() => fires++));

		diff.model.setSyncedCustomizations('c1', [synced('https://a', {
			dir: '/p/a',
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			childEnablement: {
				second: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
				first: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			},
		})]);

		assert.deepStrictEqual({ fires, hasDifference: diff.hasDifference }, { fires: 0, hasDifference: false });
	});

	test('child enablement changes flip dirty with the same plugin nonce', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations('c1', [synced('https://a', {
			dir: '/p/a',
			nonce: 'v1',
			childEnablement: { bundled: [{ kind: CustomizationEnablementKind.Global, enabled: false }] },
		})]);
		diff.consume([URI.file('/p/a')]);

		diff.model.setSyncedCustomizations('c1', [synced('https://a', {
			dir: '/p/a',
			nonce: 'v1',
			childEnablement: { bundled: [{ kind: CustomizationEnablementKind.Global, enabled: true }] },
		})]);

		assert.strictEqual(diff.hasDifference, true);
	});

	test('nonce change at same URI / pluginDir flips dirty', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations('c1', [synced('https://a', { dir: '/p/a', nonce: 'v1' })]);
		diff.consume([URI.file('/p/a')]);
		diff.model.setSyncedCustomizations('c1', [synced('https://a', { dir: '/p/a', nonce: 'v2' })]);
		assert.strictEqual(diff.hasDifference, true);
	});

	test('name change at same URI flips dirty (state observable fires for workbench refetch)', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations('c1', [synced('https://a', { dir: '/p/a', name: 'A' })]);
		diff.consume([URI.file('/p/a')]);
		let fires = 0;
		disposables.add(diff.onDidChange(() => fires++));
		diff.model.setSyncedCustomizations('c1', [synced('https://a', { dir: '/p/a', name: 'A renamed' })]);
		assert.strictEqual(fires, 1);
		assert.strictEqual(diff.hasDifference, true);
	});

	test('merges multiple clients and dedupes by id (first client wins); removeClient drops a client', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations('c1', [synced('https://a', { dir: '/p/a' })]);
		diff.model.setSyncedCustomizations('c2', [synced('https://b', { dir: '/p/b' })]);
		assert.deepStrictEqual(
			diff.model.state.get().synced.map(item => item.customization.uri),
			['https://a', 'https://b'],
		);

		diff.model.removeClient('c1');
		assert.deepStrictEqual(
			diff.model.state.get().synced.map(item => item.customization.uri),
			['https://b'],
		);
	});
});
