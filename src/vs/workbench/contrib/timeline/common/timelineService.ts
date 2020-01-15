/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { ITimelineService, TimelineProvider } from './timeline';

export class TimelineService implements ITimelineService {
	_serviceBrand: undefined;

	private readonly _onDidChangeProviders = new Emitter<void>();
	readonly onDidChangeProviders: Event<void> = this._onDidChangeProviders.event;

	private readonly _providers = new Map<string, TimelineProvider>();

	constructor(@ILogService private readonly logService: ILogService) {
		this.registerTimelineProvider('foo', {
			id: 'bar',
			async provideTimeline(uri: URI, since: number, token: CancellationToken) {
				return [
					{
						id: '1',
						label: '$(git-commit) Timeline1',
						description: uri.toString(true),
						date: Date.now(),
						source: 'internal'
					},
					{
						id: '2',
						label: '$(git-commit) Timeline2',
						description: uri.toString(true),
						date: Date.now() - 100,
						source: 'internal'
					}

				];
			}
		});
	}

	async getTimeline(uri: URI, since: number, token: CancellationToken) {
		this.logService.trace(`TimelineService#getTimeline: uri=${uri.toString(true)}`);
		const requests = [];

		for (const provider of this._providers.values()) {
			requests.push(provider.provideTimeline(uri, since, token));
		}

		const timelines = await raceAll(requests, 5000);

		const timeline = [];
		for (const items of timelines) {
			// eslint-disable-next-line eqeqeq
			if (items == null || items instanceof CancellationError || items.length === 0) {
				continue;
			}

			timeline.push(...items);
		}

		timeline.sort((a, b) => b.date - a.date);
		return timeline;
	}

	registerTimelineProvider(key: string, provider: TimelineProvider): IDisposable {
		this.logService.trace('TimelineService#registerTimelineProvider');

		if (this._providers.has(key)) {
			throw new Error(`Timeline Provider ${key} already exists.`);
		}

		this._providers.set(key, provider);
		this._onDidChangeProviders.fire();

		return {
			dispose: () => {
				this._providers.delete(key);
				this._onDidChangeProviders.fire();
			}
		};
	}

	unregisterTimelineProvider(key: string): void {
		this.logService.trace('TimelineService#unregisterTimelineProvider');

		if (!this._providers.has(key)) {
			return;
		}

		this._providers.delete(key);
		this._onDidChangeProviders.fire();
	}
}

function* map<T, TMapped>(
	source: Iterable<T> | IterableIterator<T>,
	mapper: (item: T) => TMapped
): Iterable<TMapped> {
	for (const item of source) {
		yield mapper(item);
	}
}

class CancellationError<TPromise = any> extends Error {
	constructor(public readonly promise: TPromise, message: string) {
		super(message);
	}
}

class CancellationErrorWithId<T, TPromise = any> extends CancellationError<TPromise> {
	constructor(public readonly id: T, promise: TPromise, message: string) {
		super(promise, message);
	}
}

function raceAll<TPromise>(
	promises: Promise<TPromise>[],
	timeout?: number
): Promise<(TPromise | CancellationError<Promise<TPromise>>)[]>;
function raceAll<TPromise, T>(
	promises: Map<T, Promise<TPromise>>,
	timeout?: number
): Promise<Map<T, TPromise | CancellationErrorWithId<T, Promise<TPromise>>>>;
function raceAll<TPromise, T>(
	ids: Iterable<T>,
	fn: (id: T) => Promise<TPromise>,
	timeout?: number
): Promise<Map<T, TPromise | CancellationErrorWithId<T, Promise<TPromise>>>>;
async function raceAll<TPromise, T>(
	promisesOrIds: Promise<TPromise>[] | Map<T, Promise<TPromise>> | Iterable<T>,
	timeoutOrFn?: number | ((id: T) => Promise<TPromise>),
	timeout?: number
) {
	let promises;
	// eslint-disable-next-line eqeqeq
	if (timeoutOrFn != null && typeof timeoutOrFn !== 'number') {
		promises = new Map(
			map<T, [T, Promise<TPromise>]>(promisesOrIds as Iterable<T>, id => [id, timeoutOrFn(id)])
		);
	} else {
		timeout = timeoutOrFn;
		promises = promisesOrIds as Promise<TPromise>[] | Map<T, Promise<TPromise>>;
	}

	if (promises instanceof Map) {
		return new Map(
			await Promise.all(
				map<
					[T, Promise<TPromise>],
					Promise<[T, TPromise | CancellationErrorWithId<T, Promise<TPromise>>]>
				>(
					promises.entries(),
					// eslint-disable-next-line eqeqeq
					timeout == null
						? ([id, promise]) => promise.then(p => [id, p])
						: ([id, promise]) =>
							Promise.race([
								promise,

								new Promise<CancellationErrorWithId<T, Promise<TPromise>>>(resolve =>
									setTimeout(
										() => resolve(new CancellationErrorWithId(id, promise, 'TIMED OUT')),
										timeout!
									)
								)
							]).then(p => [id, p])
				)
			)
		);
	}

	return Promise.all(
		// eslint-disable-next-line eqeqeq
		timeout == null
			? promises
			: promises.map(p =>
				Promise.race([
					p,
					new Promise<CancellationError<Promise<TPromise>>>(resolve =>
						setTimeout(() => resolve(new CancellationError(p, 'TIMED OUT')), timeout!)
					)
				])
			)
	);
}
