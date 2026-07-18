/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ISyncedCustomization } from '../../../common/agentPluginManager.js';
import { CustomizationLoadStatus, CustomizationType, customizationId } from '../../../common/state/sessionState.js';
import { SessionClientCustomizationsDiff } from '../../../node/claude/customizations/claudeSessionClientCustomizationsModel.js';

function synced(uri: string, opts: { dir?: string; enabled?: boolean; nonce?: string; name?: string } = {}): ISyncedCustomization {
	return {
		customization: {
			type: CustomizationType.Plugin,
			id: customizationId(uri),
			uri,
			name: opts.name ?? uri,
			enabled: opts.enabled ?? true,
			load: { kind: CustomizationLoadStatus.Loaded },
			...(opts.nonce !== undefined ? { nonce: opts.nonce } : {}),
		},
		...(opts.dir !== undefined ? { pluginDir: URI.file(opts.dir) } : {}),
	};
}

suite('SessionClientCustomizationsDiff', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fresh diff is empty and not dirty', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		assert.deepStrictEqual(diff.model.state.get().synced, []);
		assert.strictEqual(diff.hasDifference, false);
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
