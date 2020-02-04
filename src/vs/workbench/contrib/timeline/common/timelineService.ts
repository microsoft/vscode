/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { ITimelineService, TimelineProvider, TimelineItem } from './timeline';

export class TimelineService implements ITimelineService {
	_serviceBrand: undefined;

	private readonly _onDidChangeProviders = new Emitter<void>();
	readonly onDidChangeProviders: Event<void> = this._onDidChangeProviders.event;

	private readonly _onDidChangeTimeline = new Emitter<URI | undefined>();
	readonly onDidChangeTimeline: Event<URI | undefined> = this._onDidChangeTimeline.event;

	private readonly _providers = new Map<string, TimelineProvider>();
	private readonly _providerSubscriptions = new Map<string, IDisposable>();

	constructor(@ILogService private readonly logService: ILogService) {
		// this.registerTimelineProvider({
		// 	source: 'local-history',
		// 	sourceDescription: 'Local History',
		// 	async provideTimeline(uri: URI, token: CancellationToken) {
		// 		return [
		// 			{
		// 				id: '1',
		// 				label: 'Undo Timeline1',
		// 				description: uri.toString(true),
		// 				date: Date.now()
		// 			},
		// 			{
		// 				id: '2',
		// 				label: 'Undo Timeline2',
		// 				description: uri.toString(true),
		// 				date: Date.now() - 100
		// 			}
		// 		];
		// 	},
		// 	dispose() { }
		// });
	}

	async getTimeline(uri: URI, token: CancellationToken, sources?: Set<string>) {
		this.logService.trace(`TimelineService#getTimeline(${uri.toString(true)})`);

		const requests: Promise<[string, TimelineItem[]]>[] = [];

		for (const provider of this._providers.values()) {
			if (sources && !sources.has(provider.source)) {
				continue;
			}

			requests.push(provider.provideTimeline(uri, token).then(p => [provider.source, p]));
		}

		const timelines = await Promise.all(requests);

		const timeline = [];
		for (const [source, items] of timelines) {
			if (items.length === 0) {
				continue;
			}

			timeline.push(...items.map(item => ({ ...item, source: source })));
		}

		// const requests = new Map<string, Promise<TimelineItem[] | CancellationErrorWithId<string>>>();

		// for (const provider of this._providers.values()) {
		// 	if (sources && !sources.has(provider.source)) {
		// 		continue;
		// 	}

		// 	requests.set(provider.source, provider.provideTimeline(uri, token));
		// }

		// // TODO[ECA]: What should the timeout be for waiting for individual providers?
		// const timelines = await raceAll(requests /*, 5000*/);

		// const timeline = [];
		// for (const [source, items] of timelines) {
		// 	if (items instanceof CancellationError) {
		// 		this.logService.trace(`TimelineService#getTimeline(${uri.toString(true)}) source=${source} cancelled`);
		// 		continue;
		// 	}

		// 	if (items.length === 0) {
		// 		continue;
		// 	}

		// 	timeline.push(...items.map(item => ({ ...item, source: source })));
		// }

		timeline.sort((a, b) => b.timestamp - a.timestamp);
		return timeline;
	}

	registerTimelineProvider(provider: TimelineProvider): IDisposable {
		this.logService.trace(`TimelineService#registerTimelineProvider: source=${provider.source}`);

		const source = provider.source;

		const existing = this._providers.get(source);
		// For now to deal with https://github.com/microsoft/vscode/issues/89553 allow any overwritting here (still will be blocked in the Extension Host)
		// TODO[ECA]: Ultimately will need to figure out a way to unregister providers when the Extension Host restarts/crashes
		// if (existing && !existing.replaceable) {
		// 	throw new Error(`Timeline Provider ${source} already exists.`);
		// }
		if (existing) {
			try {
				existing?.dispose();
			}
			catch { }
		}

		this._providers.set(source, provider);
		if (provider.onDidChange) {
			this._providerSubscriptions.set(source, provider.onDidChange(uri => this.onProviderTimelineChanged(provider.source, uri)));
		}
		this._onDidChangeProviders.fire();

		return {
			dispose: () => {
				this._providers.delete(source);
				this._onDidChangeProviders.fire();
			}
		};
	}

	unregisterTimelineProvider(source: string): void {
		this.logService.trace(`TimelineService#unregisterTimelineProvider: source=${source}`);

		if (!this._providers.has(source)) {
			return;
		}

		this._providers.delete(source);
		this._providerSubscriptions.delete(source);
		this._onDidChangeProviders.fire();
	}

	private onProviderTimelineChanged(source: string, uri: URI | undefined) {
		// console.log(`TimelineService.onProviderTimelineChanged: source=${source} uri=${uri?.toString(true)}`);

		this._onDidChangeTimeline.fire(uri);
	}
}

// function* map<T, TMapped>(source: Iterable<T> | IterableIterator<T>, mapper: (item: T) => TMapped): Iterable<TMapped> {
// 	for (const item of source) {
// 		yield mapper(item);
// 	}
// }

// class CancellationError<TPromise = any> extends Error {
// 	constructor(public readonly promise: TPromise, message: string) {
// 		super(message);
// 	}
// }

// class CancellationErrorWithId<T, TPromise = any> extends CancellationError<TPromise> {
// 	constructor(public readonly id: T, promise: TPromise, message: string) {
// 		super(promise, message);
// 	}
// }

// function raceAll<TPromise>(
// 	promises: Promise<TPromise>[],
// 	timeout?: number
// ): Promise<(TPromise | CancellationError<Promise<TPromise>>)[]>;
// function raceAll<TPromise, T>(
// 	promises: Map<T, Promise<TPromise>>,
// 	timeout?: number
// ): Promise<Map<T, TPromise | CancellationErrorWithId<T, Promise<TPromise>>>>;
// function raceAll<TPromise, T>(
// 	ids: Iterable<T>,
// 	fn: (id: T) => Promise<TPromise>,
// 	timeout?: number
// ): Promise<Map<T, TPromise | CancellationErrorWithId<T, Promise<TPromise>>>>;
// async function raceAll<TPromise, T>(
// 	promisesOrIds: Promise<TPromise>[] | Map<T, Promise<TPromise>> | Iterable<T>,
// 	timeoutOrFn?: number | ((id: T) => Promise<TPromise>),
// 	timeout?: number
// ) {
// 	let promises;
// 	if (timeoutOrFn !== undefined && typeof timeoutOrFn !== 'number') {
// 		promises = new Map(
// 			map<T, [T, Promise<TPromise>]>(promisesOrIds as Iterable<T>, id => [id, timeoutOrFn(id)])
// 		);
// 	} else {
// 		timeout = timeoutOrFn;
// 		promises = promisesOrIds as Promise<TPromise>[] | Map<T, Promise<TPromise>>;
// 	}

// 	if (promises instanceof Map) {
// 		return new Map(
// 			await Promise.all(
// 				map<[T, Promise<TPromise>], Promise<[T, TPromise | CancellationErrorWithId<T, Promise<TPromise>>]>>(
// 					promises.entries(),
// 					timeout === undefined
// 						? ([id, promise]) => promise.then(p => [id, p])
// 						: ([id, promise]) =>
// 							Promise.race([
// 								promise,

// 								new Promise<CancellationErrorWithId<T, Promise<TPromise>>>(resolve =>
// 									setTimeout(() => resolve(new CancellationErrorWithId(id, promise, 'TIMED OUT')), timeout!)
// 								)
// 							]).then(p => [id, p])
// 				)
// 			)
// 		);
// 	}

// 	return Promise.all(
// 		timeout === undefined
// 			? promises
// 			: promises.map(p =>
// 				Promise.race([
// 					p,
// 					new Promise<CancellationError<Promise<TPromise>>>(resolve =>
// 						setTimeout(() => resolve(new CancellationError(p, 'TIMED OUT')), timeout!)
// 					)
// 				])
// 			)
// 	);
// }
