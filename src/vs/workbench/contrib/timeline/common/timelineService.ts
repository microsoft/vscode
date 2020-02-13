/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
// import { basename } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { ITimelineService, TimelineProvider, TimelineItem, TimelineChangeEvent, TimelineProvidersChangeEvent } from './timeline';

export class TimelineService implements ITimelineService {
	_serviceBrand: undefined;

	private readonly _onDidChangeProviders = new Emitter<TimelineProvidersChangeEvent>();
	readonly onDidChangeProviders: Event<TimelineProvidersChangeEvent> = this._onDidChangeProviders.event;

	private readonly _onDidChangeTimeline = new Emitter<TimelineChangeEvent>();
	readonly onDidChangeTimeline: Event<TimelineChangeEvent> = this._onDidChangeTimeline.event;

	private readonly _providers = new Map<string, TimelineProvider>();
	private readonly _providerSubscriptions = new Map<string, IDisposable>();

	constructor(@ILogService private readonly logService: ILogService) {
		// this.registerTimelineProvider({
		// 	id: 'local-history',
		// 	label: 'Local History',
		// 	provideTimeline(uri: URI, token: CancellationToken) {
		// 		return new Promise(resolve => setTimeout(() => {
		// 			resolve([
		// 				{
		// 					id: '1',
		// 					label: 'Slow Timeline1',
		// 					description: basename(uri.fsPath),
		// 					timestamp: Date.now(),
		// 					source: 'local-history'
		// 				},
		// 				{
		// 					id: '2',
		// 					label: 'Slow Timeline2',
		// 					description: basename(uri.fsPath),
		// 					timestamp: new Date(0).getTime(),
		// 					source: 'local-history'
		// 				}
		// 			]);
		// 		}, 3000));
		// 	},
		// 	dispose() { }
		// });

		// this.registerTimelineProvider({
		// 	id: 'slow-history',
		// 	label: 'Slow History',
		// 	provideTimeline(uri: URI, token: CancellationToken) {
		// 		return new Promise(resolve => setTimeout(() => {
		// 			resolve([
		// 				{
		// 					id: '1',
		// 					label: 'VERY Slow Timeline1',
		// 					description: basename(uri.fsPath),
		// 					timestamp: Date.now(),
		// 					source: 'slow-history'
		// 				},
		// 				{
		// 					id: '2',
		// 					label: 'VERY Slow Timeline2',
		// 					description: basename(uri.fsPath),
		// 					timestamp: new Date(0).getTime(),
		// 					source: 'slow-history'
		// 				}
		// 			]);
		// 		}, 6000));
		// 	},
		// 	dispose() { }
		// });
	}

	getSources() {
		return [...this._providers.keys()];
	}

	async getTimeline(uri: URI, token: CancellationToken, predicate?: (provider: TimelineProvider) => boolean) {
		this.logService.trace(`TimelineService#getTimeline(${uri.toString(true)})`);

		const requests: Promise<[string, TimelineItem[]]>[] = [];

		for (const provider of this._providers.values()) {
			if (typeof provider.scheme === 'string') {
				if (provider.scheme !== '*' && provider.scheme !== uri.scheme) {
					continue;
				}
			} else if (!provider.scheme.includes(uri.scheme)) {
				continue;
			}
			if (!(predicate?.(provider) ?? true)) {
				continue;
			}

			requests.push(provider.provideTimeline(uri, token).then(p => [provider.id, p]));
		}

		const timelines = await Promise.all(requests);

		const timeline = [];
		for (const [source, items] of timelines) {
			if (items.length === 0) {
				continue;
			}

			timeline.push(...items.map(item => ({ ...item, source: source })));
		}

		timeline.sort((a, b) => b.timestamp - a.timestamp);
		return timeline;
	}

	getTimelineRequest(id: string, uri: URI, tokenSource: CancellationTokenSource) {
		this.logService.trace(`TimelineService#getTimeline(${id}): uri=${uri.toString(true)}`);

		const provider = this._providers.get(id);
		if (provider === undefined) {
			return undefined;
		}

		if (typeof provider.scheme === 'string') {
			if (provider.scheme !== '*' && provider.scheme !== uri.scheme) {
				return undefined;
			}
		} else if (!provider.scheme.includes(uri.scheme)) {
			return undefined;
		}

		return {
			items: provider.provideTimeline(uri, tokenSource.token)
				.then(items => {
					items = items.map(item => ({ ...item, source: provider.id }));
					items.sort((a, b) => (b.timestamp - a.timestamp) || b.source.localeCompare(a.source, undefined, { numeric: true, sensitivity: 'base' }));

					return items;
				}),
			source: provider.id,
			tokenSource: tokenSource,
			uri: uri
		};
	}

	registerTimelineProvider(provider: TimelineProvider): IDisposable {
		this.logService.trace(`TimelineService#registerTimelineProvider: id=${provider.id}`);

		const id = provider.id;

		const existing = this._providers.get(id);
		if (existing) {
			// For now to deal with https://github.com/microsoft/vscode/issues/89553 allow any overwritting here (still will be blocked in the Extension Host)
			// TODO[ECA]: Ultimately will need to figure out a way to unregister providers when the Extension Host restarts/crashes
			// throw new Error(`Timeline Provider ${id} already exists.`);
			try {
				existing?.dispose();
			}
			catch { }
		}

		this._providers.set(id, provider);
		if (provider.onDidChange) {
			this._providerSubscriptions.set(id, provider.onDidChange(e => this._onDidChangeTimeline.fire(e)));
		}
		this._onDidChangeProviders.fire({ added: [id] });

		return {
			dispose: () => {
				this._providers.delete(id);
				this._onDidChangeProviders.fire({ removed: [id] });
			}
		};
	}

	unregisterTimelineProvider(id: string): void {
		this.logService.trace(`TimelineService#unregisterTimelineProvider: id=${id}`);

		if (!this._providers.has(id)) {
			return;
		}

		this._providers.delete(id);
		this._providerSubscriptions.delete(id);
		this._onDidChangeProviders.fire({ removed: [id] });
	}
}
