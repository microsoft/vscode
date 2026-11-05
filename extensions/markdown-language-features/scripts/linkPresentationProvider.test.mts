/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { WebviewLinkPresentationProvider } from '../markdown-editor-src/linkPresentationProvider.ts';
import type { RichLinkSubscriptions } from '../src/preview/markdownEditorProtocol.ts';

const href = 'https://example.com/pull/1';
const presentation = { kind: 'pullRequest' as const, title: 'Resolved title', status: { kind: 'merged' as const, label: 'Merged' } };
const cacheDurationMs = 5 * 60_000;

function setup(context: TestContext) {
	context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
	const batches: RichLinkSubscriptions[] = [];
	const provider = new WebviewLinkPresentationProvider([
		{ id: 'pullRequests', source: '^https://example\\.com/pull/', flags: 'g', kind: 'pullRequest' },
	], { richLinkSubscriptions: batch => { batches.push(batch); } });
	context.after(() => {
		provider.dispose();
		context.mock.timers.reset();
	});
	const acquire = (url = href) => {
		const link = provider.createLinkPresentation(url);
		assert.ok(link);
		return link;
	};
	return { provider, batches, acquire };
}

test('shares observables and keeps resolved metadata across synchronous render handoffs', async context => {
	const { provider, batches, acquire } = setup(context);
	const first = acquire();
	const otherOccurrence = acquire();
	assert.equal(first.presentation, otherOccurrence.presentation);
	await Promise.resolve();
	assert.equal(batches.length, 1);
	assert.equal(batches[0].subscribe.length, 1);
	const subscriptionId = batches[0].subscribe[0].subscriptionId;
	provider.updatePresentations([{ subscriptionId, presentation }]);
	first.dispose();
	otherOccurrence.dispose();
	const rebuilt = acquire();
	assert.equal(rebuilt.presentation, first.presentation);
	assert.deepEqual(rebuilt.presentation.get(), presentation);
	await Promise.resolve();
	assert.equal(batches.length, 1, 'rebuilding must not send RPC or lose metadata');
	rebuilt.dispose();
	rebuilt.dispose();
	await Promise.resolve();
	assert.deepEqual(batches[1], { subscribe: [], unsubscribe: [subscriptionId] });
});

test('resubscribes incrementally with cached data and rejects updates from previous subscriptions', async context => {
	const { provider, batches, acquire } = setup(context);
	const first = acquire();
	await Promise.resolve();
	const previousId = batches[0].subscribe[0].subscriptionId;
	provider.updatePresentations([{ subscriptionId: previousId, presentation }]);
	first.dispose();
	await Promise.resolve();
	provider.updatePresentations([{ subscriptionId: previousId, presentation: { kind: 'pullRequest', title: 'Late update' } }]);
	context.mock.timers.tick(cacheDurationMs - 1);
	const restored = acquire();
	assert.equal(restored.presentation, first.presentation);
	assert.deepEqual(restored.presentation.get(), presentation);
	await Promise.resolve();
	const currentId = batches[2].subscribe[0].subscriptionId;
	assert.notEqual(currentId, previousId);
	assert.deepEqual(batches[2], { subscribe: [{ subscriptionId: currentId, href }], unsubscribe: [] });
	provider.updatePresentations([{ subscriptionId: currentId, presentation: { kind: 'pullRequest', isLoading: true } }]);
	provider.updatePresentations([{ subscriptionId: currentId, presentation: { kind: 'pullRequest', isLoading: true } }]);
	assert.deepEqual(restored.presentation.get(), { ...presentation, isLoading: true }, 'loading snapshots must not hide cached metadata');
	provider.updatePresentations([{ subscriptionId: currentId, presentation: { kind: 'pullRequest', title: 'Fresh title' } }]);
	provider.updatePresentations([{ subscriptionId: previousId, presentation }]);
	assert.deepEqual(restored.presentation.get(), { kind: 'pullRequest', title: 'Fresh title' });
	context.mock.timers.tick(1);
	assert.equal(acquire().presentation, restored.presentation, 'active entries must not expire');
});

test('expires idle entries at five minutes and restarts expiry after reuse', async context => {
	const { acquire } = setup(context);
	const first = acquire();
	first.dispose();
	await Promise.resolve();
	context.mock.timers.tick(cacheDurationMs - 1);
	const restored = acquire();
	assert.equal(restored.presentation, first.presentation);
	restored.dispose();
	await Promise.resolve();
	context.mock.timers.tick(cacheDurationMs - 1);
	const again = acquire();
	assert.equal(again.presentation, first.presentation);
	again.dispose();
	await Promise.resolve();
	context.mock.timers.tick(cacheDurationMs);
	const expired = acquire();
	assert.notEqual(expired.presentation, first.presentation);
	assert.deepEqual(expired.presentation.get(), { kind: 'pullRequest', isLoading: true });
});

test('bounds the inactive cache to 256 least-recently-used URLs without evicting active entries', async context => {
	const { acquire } = setup(context);
	const active = acquire('https://example.com/pull/active');
	const idle = Array.from({ length: 256 }, (_, index) => {
		const link = acquire(`https://example.com/pull/${index}`);
		link.dispose();
		return link;
	});
	await Promise.resolve();
	const recent = acquire('https://example.com/pull/0');
	recent.dispose();
	await Promise.resolve();
	const overflow = acquire('https://example.com/pull/256');
	overflow.dispose();
	await Promise.resolve();
	assert.equal(acquire('https://example.com/pull/0').presentation, idle[0].presentation);
	assert.notEqual(acquire('https://example.com/pull/1').presentation, idle[1].presentation);
	assert.equal(acquire('https://example.com/pull/active').presentation, active.presentation);
});

test('batches only changed subscriptions and coalesces links never rendered past the current turn', async context => {
	const { batches, acquire } = setup(context);
	const first = acquire();
	acquire('https://example.com/pull/2');
	const transient = acquire('https://example.com/pull/transient');
	transient.dispose();
	await Promise.resolve();
	assert.deepEqual(batches[0].subscribe.map(value => value.href), [href, 'https://example.com/pull/2']);
	first.dispose();
	acquire('https://example.com/pull/3');
	await Promise.resolve();
	assert.equal(batches[1].subscribe.length, 1);
	assert.equal(batches[1].subscribe[0].href, 'https://example.com/pull/3');
	assert.deepEqual(batches[1].unsubscribe, [batches[0].subscribe[0].subscriptionId]);
});

test('publishes unavailable snapshots, rejects unsupported URLs, and cleans up pending work on disposal', async context => {
	const { provider, batches, acquire } = setup(context);
	assert.equal(provider.createLinkPresentation('https://unsupported.example/'), undefined);
	const link = acquire();
	await Promise.resolve();
	const subscriptionId = batches[0].subscribe[0].subscriptionId;
	provider.updatePresentations([{ subscriptionId, presentation: undefined }]);
	assert.equal(link.presentation.get(), undefined);
	acquire('https://example.com/pull/2');
	provider.dispose();
	provider.dispose();
	await Promise.resolve();
	assert.deepEqual(batches, [
		{ subscribe: [{ subscriptionId, href }], unsubscribe: [] },
		{ subscribe: [], unsubscribe: [subscriptionId] },
	]);
	provider.updatePresentations([{ subscriptionId, presentation }]);
	assert.equal(link.presentation.get(), undefined);
	assert.throws(() => acquire(), /provider is disposed/);
	link.dispose();
});

test('disposing before the first flush does not open a remote subscription', async context => {
	const { provider, batches, acquire } = setup(context);
	acquire();
	provider.dispose();
	await Promise.resolve();
	assert.deepEqual(batches, []);
});

test('updates from an earlier webview cannot populate a new provider for the same URL', async context => {
	const { provider, batches, acquire } = setup(context);
	acquire();
	await Promise.resolve();
	const previousId = batches[0].subscribe[0].subscriptionId;
	provider.dispose();
	const replacement = new WebviewLinkPresentationProvider([
		{ id: 'pullRequests', source: '^https://example\\.com/pull/', flags: '', kind: 'pullRequest' },
	], { richLinkSubscriptions: batch => { batches.push(batch); } });
	context.after(() => replacement.dispose());
	const link = replacement.createLinkPresentation(href)!;
	await Promise.resolve();
	const currentId = batches.at(-1)!.subscribe[0].subscriptionId;
	assert.notEqual(currentId, previousId);
	replacement.updatePresentations([{ subscriptionId: previousId, presentation }]);
	assert.deepEqual(link.presentation.get(), { kind: 'pullRequest', isLoading: true });
	replacement.updatePresentations([{ subscriptionId: currentId, presentation }]);
	assert.deepEqual(link.presentation.get(), presentation);
});
