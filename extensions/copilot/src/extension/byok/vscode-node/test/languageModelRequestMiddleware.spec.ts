/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { CancellationError } from '../../../../util/vs/base/common/errors';
import { LanguageModelRequestMiddlewareRegistry, languageModelRequestMiddlewareTimeoutMs } from '../../common/languageModelRequestMiddleware';

describe('LanguageModelRequestMiddlewareRegistry', () => {
	const request = {
		vendor: 'customendpoint',
		modelId: 'model-a',
		url: 'https://gateway.example.com/v1/chat/completions',
		providerGroup: 'Acme Premium',
		requestInitiator: 'core',
		cancellationToken: CancellationToken.None,
	};

	function createRegistry() {
		return new LanguageModelRequestMiddlewareRegistry(new TestLogService());
	}

	afterEach(() => {
		vi.useRealTimers();
	});

	it('resolves headers from matching middleware', async () => {
		const registry = createRegistry();
		registry.register({
			selector: { vendors: ['customendpoint'], modelIds: ['model-a'] },
			provideRequestHeaders: async () => ({ 'x-test': 'value' }),
		});

		expect(await registry.provideRequestHeaders(request)).toEqual({ 'x-test': 'value' });
	});

	it('does not invoke middleware with a non-matching selector', async () => {
		const registry = createRegistry();
		let invocations = 0;
		registry.register({
			selector: { vendors: ['other'] },
			provideRequestHeaders: async () => {
				invocations++;
				return { 'x-test': 'value' };
			},
		});

		expect(await registry.provideRequestHeaders(request)).toEqual({});
		expect(invocations).toBe(0);
	});

	it('matches on provider group', async () => {
		const registry = createRegistry();
		registry.register({
			selector: { providerGroups: ['Acme Premium'] },
			provideRequestHeaders: async () => ({ Authorization: 'Bearer premium' }),
		});
		registry.register({
			selector: { providerGroups: ['Acme Budget'] },
			provideRequestHeaders: async () => ({ Authorization: 'Bearer budget' }),
		});

		expect({
			premium: await registry.provideRequestHeaders(request),
			budget: await registry.provideRequestHeaders({ ...request, providerGroup: 'Acme Budget' }),
		}).toEqual({
			premium: { Authorization: 'Bearer premium' },
			budget: { Authorization: 'Bearer budget' },
		});
	});

	it('does not match a provider group selector when the request has no group', async () => {
		const registry = createRegistry();
		registry.register({
			selector: { providerGroups: ['Acme Premium'] },
			provideRequestHeaders: async () => ({ Authorization: 'Bearer premium' }),
		});

		expect(await registry.provideRequestHeaders({ ...request, providerGroup: undefined })).toEqual({});
	});

	it('merges matching middleware in registration order, case-insensitively', async () => {
		const registry = createRegistry();
		registry.register({
			provideRequestHeaders: async () => ({ 'x-first': 'one', 'X-Shared': 'first' }),
		});
		registry.register({
			provideRequestHeaders: async () => ({ 'x-second': 'two', 'x-shared': 'second' }),
		});

		expect(await registry.provideRequestHeaders(request)).toEqual({
			'x-first': 'one',
			'x-shared': 'second',
			'x-second': 'two',
		});
	});

	it('invokes matching middleware concurrently', async () => {
		const registry = createRegistry();
		let release: () => void = () => { };
		const gate = new Promise<void>(resolve => { release = resolve; });
		registry.register({
			provideRequestHeaders: async () => {
				await gate;
				return { 'x-first': 'one' };
			},
		});
		registry.register({
			provideRequestHeaders: async () => {
				release();
				return { 'x-second': 'two' };
			},
		});

		expect(await registry.provideRequestHeaders(request)).toEqual({ 'x-first': 'one', 'x-second': 'two' });
	});

	it('does not invoke a disposed middleware registration', async () => {
		const registry = createRegistry();
		const registration = registry.register({
			provideRequestHeaders: async () => ({ 'x-test': 'value' }),
		});

		registration.dispose();

		expect(await registry.provideRequestHeaders(request)).toEqual({});
	});

	it('discards headers from a registration disposed while in flight and keeps invoking the others', async () => {
		const registry = createRegistry();
		let release: () => void = () => { };
		const gate = new Promise<void>(resolve => { release = resolve; });
		const registration = registry.register({
			provideRequestHeaders: async () => {
				await gate;
				return { 'x-disposed': 'value' };
			},
		});
		registry.register({
			provideRequestHeaders: async () => ({ 'x-kept': 'value' }),
		});

		const result = registry.provideRequestHeaders(request);
		registration.dispose();
		release();

		expect(await result).toEqual({ 'x-kept': 'value' });
	});

	it('discards the failure of a registration disposed while in flight, even when it requires strict error handling', async () => {
		const registry = createRegistry();
		let fail: () => void = () => { };
		const gate = new Promise<never>((_, reject) => { fail = () => reject(new Error('provider failed')); });
		const registration = registry.register({
			errorBehavior: 'fail',
			provideRequestHeaders: () => gate,
		});
		registry.register({
			provideRequestHeaders: async () => ({ 'x-kept': 'value' }),
		});

		const result = registry.provideRequestHeaders(request);
		registration.dispose();
		fail();

		expect(await result).toEqual({ 'x-kept': 'value' });
	});

	it('continues when a middleware provider fails by default', async () => {
		const registry = createRegistry();
		registry.register({
			provideRequestHeaders: async () => {
				throw new Error('provider failed');
			},
		});
		registry.register({
			provideRequestHeaders: () => {
				throw new Error('provider failed synchronously');
			},
		});
		registry.register({
			provideRequestHeaders: async () => ({ 'x-test': 'value' }),
		});

		expect(await registry.provideRequestHeaders(request)).toEqual({ 'x-test': 'value' });
	});

	it('can fail the request when middleware requires strict error handling', async () => {
		const registry = createRegistry();
		registry.register({
			errorBehavior: 'fail',
			provideRequestHeaders: async () => {
				throw new Error('provider failed');
			},
		});

		await expect(registry.provideRequestHeaders(request)).rejects.toThrow('provider failed');
	});

	it('passes header names through unfiltered, leaving sanitisation to the endpoint', async () => {
		const registry = createRegistry();
		registry.register({
			provideRequestHeaders: async () => ({ Authorization: 'Bearer token', 'X-Metadata': 'value' }),
		});

		expect(await registry.provideRequestHeaders(request)).toEqual({ Authorization: 'Bearer token', 'X-Metadata': 'value' });
	});

	it('times out middleware providers that do not resolve', async () => {
		vi.useFakeTimers();
		const registry = createRegistry();
		registry.register({
			errorBehavior: 'fail',
			provideRequestHeaders: () => new Promise(() => { }),
		});

		const result = expect(registry.provideRequestHeaders(request)).rejects.toThrow('timed out');
		await vi.advanceTimersByTimeAsync(languageModelRequestMiddlewareTimeoutMs);

		await result;
	});

	it('rejects with a cancellation error when the request is cancelled', async () => {
		const cancellation = new CancellationTokenSource();
		const registry = createRegistry();
		registry.register({
			provideRequestHeaders: () => new Promise(() => { }),
		});

		const result = registry.provideRequestHeaders({ ...request, cancellationToken: cancellation.token });
		cancellation.cancel();

		await expect(result).rejects.toBeInstanceOf(CancellationError);
	});

	it('propagates cancellation errors thrown by middleware regardless of error behavior', async () => {
		const registry = createRegistry();
		// Shaped like `vscode.CancellationError`, which is a different class than the vendored one.
		const cancellationError = Object.assign(new Error('Canceled'), { name: 'Canceled' });
		registry.register({
			provideRequestHeaders: async () => {
				throw cancellationError;
			},
		});

		await expect(registry.provideRequestHeaders(request)).rejects.toBe(cancellationError);
	});
});
