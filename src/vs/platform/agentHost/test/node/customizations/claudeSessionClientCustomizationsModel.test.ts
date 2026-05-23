/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ISyncedCustomization } from '../../../common/agentPluginManager.js';
import { CustomizationStatus } from '../../../common/state/protocol/state.js';
import { SessionClientCustomizationsDiff } from '../../../node/claude/customizations/claudeSessionClientCustomizationsModel.js';

function synced(uri: string, opts: { dir?: string; enabled?: boolean; nonce?: string; displayName?: string } = {}): ISyncedCustomization {
	return {
		customization: {
			customization: {
				uri,
				displayName: opts.displayName ?? uri,
				...(opts.nonce !== undefined ? { nonce: opts.nonce } : {}),
			},
			enabled: opts.enabled ?? true,
			status: CustomizationStatus.Loaded,
		},
		...(opts.dir !== undefined ? { pluginDir: URI.file(opts.dir) } : {}),
	};
}

suite('SessionClientCustomizationsDiff', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fresh diff: empty, not dirty, no enabled paths', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		assert.deepStrictEqual(diff.model.state.get().synced, []);
		assert.strictEqual(diff.hasDifference, false);
		assert.deepStrictEqual(diff.model.enabledPluginPaths.get(), []);
	});

	test('setSyncedCustomizations flips dirty and fires onDidChange', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		let fires = 0;
		disposables.add(diff.onDidChange(() => fires++));
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a' })]);
		assert.strictEqual(diff.hasDifference, true);
		assert.strictEqual(fires, 1);
	});

	test('enabledPluginPaths excludes entries without pluginDir', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations([
			synced('https://a', { dir: '/p/a' }),
			synced('https://b'),
		]);
		assert.deepStrictEqual(diff.model.enabledPluginPaths.get().map(u => u.fsPath), ['/p/a']);
	});

	test('setEnabled(false) removes from enabled paths and flips dirty exactly when value changes', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a' })]);
		diff.consume();
		assert.strictEqual(diff.hasDifference, false);

		let fires = 0;
		disposables.add(diff.onDidChange(() => fires++));

		const uri = 'https://a';
		diff.model.setEnabled(uri, false);
		assert.deepStrictEqual(diff.model.enabledPluginPaths.get(), []);
		assert.strictEqual(diff.hasDifference, true);
		assert.strictEqual(fires, 1);

		diff.model.setEnabled(uri, false); // no change → no fire, stays dirty
		assert.strictEqual(fires, 1);
	});

	test('default enablement is true (absent entry counts as enabled)', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a' })]);
		assert.strictEqual(diff.model.enabledPluginPaths.get().length, 1);
	});

	test('setEnabled(true) is a no-op for default-enabled entries', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a' })]);
		diff.consume();
		let fires = 0;
		disposables.add(diff.onDidChange(() => fires++));
		diff.model.setEnabled('https://a', true);
		assert.strictEqual(fires, 0);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('consume returns current paths and clears dirty', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a' })]);
		const paths = diff.consume();
		assert.strictEqual(paths.length, 1);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('markDirty re-flips after failed downstream reload', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a' })]);
		diff.consume();
		assert.strictEqual(diff.hasDifference, false);
		diff.markDirty();
		assert.strictEqual(diff.hasDifference, true);
	});

	test('structurally-equivalent re-send is deduped (no fire, no dirty)', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a' })]);
		diff.consume();
		let fires = 0;
		disposables.add(diff.onDidChange(() => fires++));
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a' })]);
		assert.strictEqual(fires, 0);
		assert.strictEqual(diff.hasDifference, false);
	});

	test('toggling enablement of customization without pluginDir still flips dirty (no-restart optimisation intentionally given up: rebind is cheap and correctness > efficiency)', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations([synced('https://a')]);
		diff.consume();
		diff.model.setEnabled('https://a', false);
		assert.strictEqual(diff.hasDifference, true);
	});

	test('nonce change at same URI / pluginDir flips dirty', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a', nonce: 'v1' })]);
		diff.consume();
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a', nonce: 'v2' })]);
		assert.strictEqual(diff.hasDifference, true);
	});

	test('displayName change at same URI flips dirty (state observable fires for workbench refetch)', () => {
		const diff = disposables.add(new SessionClientCustomizationsDiff());
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a', displayName: 'A' })]);
		diff.consume();
		let fires = 0;
		disposables.add(diff.onDidChange(() => fires++));
		diff.model.setSyncedCustomizations([synced('https://a', { dir: '/p/a', displayName: 'A renamed' })]);
		assert.strictEqual(fires, 1);
		assert.strictEqual(diff.hasDifference, true);
	});
});
