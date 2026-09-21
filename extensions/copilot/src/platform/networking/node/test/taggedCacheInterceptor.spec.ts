/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as undici from 'undici';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('undici', () => {
	const stub = {
		interceptors: { cache: vi.fn() },
	};
	return { ...stub, default: stub };
});

type FakeDispatch = (opts: { headers?: Record<string, string> }, handler: undici.Dispatcher.DispatchHandler) => boolean;
type CacheMiddleware = (dispatch: FakeDispatch) => FakeDispatch;

async function importTagger() {
	vi.resetModules();
	const { taggedCacheInterceptor, VSCODE_CACHE_STATUS_HEADER } = await import('../taggedCacheInterceptor');
	const undiciMock = (await import('undici')) as unknown as { interceptors: { cache: ReturnType<typeof vi.fn> } };
	return { taggedCacheInterceptor, VSCODE_CACHE_STATUS_HEADER, undiciMock };
}

function makeController(): undici.Dispatcher.DispatchController {
	return {} as undici.Dispatcher.DispatchController;
}

async function runTagger(middleware: CacheMiddleware): Promise<{ stamped: string | undefined; downstream: ReturnType<typeof vi.fn> }> {
	const { taggedCacheInterceptor, VSCODE_CACHE_STATUS_HEADER, undiciMock } = await importTagger();
	undiciMock.interceptors.cache.mockReturnValue(middleware);

	const downstream = vi.fn(((_opts: { headers?: Record<string, string> }, _handler: undici.Dispatcher.DispatchHandler) => true) as FakeDispatch);
	const tagger = taggedCacheInterceptor({} as Parameters<typeof undici.interceptors.cache>[0]);
	const intercepted = tagger(downstream as unknown as undici.Dispatcher['dispatch']);

	let stamped: string | undefined;
	intercepted({ headers: {} } as undici.Dispatcher.DispatchOptions, {
		onResponseStart: (_c, _s, headers) => {
			stamped = (headers as Record<string, string>)[VSCODE_CACHE_STATUS_HEADER];
		},
	});
	return { stamped, downstream };
}

describe('taggedCacheInterceptor', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('classifies a cache hit when the downstream dispatch is never invoked', async () => {
		const { stamped, downstream } = await runTagger(() => (_opts, handler) => {
			handler.onResponseStart?.(makeController(), 200, { age: '60' }, 'OK');
			return true;
		});

		expect(stamped).toBe('hit');
		expect(downstream).not.toHaveBeenCalled();
	});

	it('classifies a stale hit when the served response carries a 110 warning', async () => {
		const { stamped } = await runTagger(() => (_opts, handler) => {
			handler.onResponseStart?.(makeController(), 200, { age: '120', warning: '110 - "response is stale"' }, 'OK');
			return true;
		});

		expect(stamped).toBe('stale-hit');
	});

	it('classifies a revalidation when conditional headers reach the origin', async () => {
		const { stamped, downstream } = await runTagger((dispatch) => (_opts, handler) => {
			dispatch({ headers: { 'if-none-match': '"abc"' } }, {} as undici.Dispatcher.DispatchHandler);
			handler.onResponseStart?.(makeController(), 200, {}, 'OK');
			return true;
		});

		expect(stamped).toBe('revalidated');
		expect(downstream).toHaveBeenCalledTimes(1);
	});

	it('classifies a miss when the cache passes the request through unchanged', async () => {
		const { stamped, downstream } = await runTagger((dispatch) => (opts, handler) => {
			dispatch(opts, {} as undici.Dispatcher.DispatchHandler);
			handler.onResponseStart?.(makeController(), 200, {}, 'OK');
			return true;
		});

		expect(stamped).toBe('miss');
		expect(downstream).toHaveBeenCalledTimes(1);
	});

	it('does not throw when response headers are an array (raw wire format)', async () => {
		const { taggedCacheInterceptor, undiciMock } = await importTagger();
		const middleware: CacheMiddleware = () => (_opts, handler) => {
			handler.onResponseStart?.(makeController(), 200, ['age', '60'] as unknown as Record<string, string>, 'OK');
			return true;
		};
		undiciMock.interceptors.cache.mockReturnValue(middleware);

		const tagger = taggedCacheInterceptor({} as Parameters<typeof undici.interceptors.cache>[0]);
		const intercepted = tagger((() => true) as unknown as undici.Dispatcher['dispatch']);
		expect(() => intercepted({ headers: {} } as undici.Dispatcher.DispatchOptions, { onResponseStart: () => { } })).not.toThrow();
	});

	it('forwards prototype-defined handler methods through the tagging proxy', async () => {
		const { taggedCacheInterceptor, undiciMock } = await importTagger();
		const middleware: CacheMiddleware = () => (_opts, handler) => {
			handler.onResponseStart?.(makeController(), 200, {}, 'OK');
			handler.onResponseData?.(makeController(), Buffer.from('chunk'));
			handler.onResponseEnd?.(makeController(), {});
			return true;
		};
		undiciMock.interceptors.cache.mockReturnValue(middleware);

		const calls: string[] = [];
		class ProtoHandler {
			onResponseStart() { calls.push('start'); }
			onResponseData() { calls.push('data'); }
			onResponseEnd() { calls.push('end'); }
		}

		const tagger = taggedCacheInterceptor({} as Parameters<typeof undici.interceptors.cache>[0]);
		const intercepted = tagger((() => true) as unknown as undici.Dispatcher['dispatch']);
		intercepted({ headers: {} } as undici.Dispatcher.DispatchOptions, new ProtoHandler() as unknown as undici.Dispatcher.DispatchHandler);

		expect(calls).toEqual(['start', 'data', 'end']);
	});
});
