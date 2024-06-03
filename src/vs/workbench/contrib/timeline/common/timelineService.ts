/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { ITimelineService, TimelineChangeEvent, TimelineOptions, TimelineProvidersChangeEvent, TimelineProvider, TimelinePaneId } from './timeline';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const TimelineHasProviderContext = new RawContextKey<boolean>('timelineHasProvider', false);

export class TimelineService implements ITimelineService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProviders = new Emitter<TimelineProvidersChangeEvent>();
	readonly onDidChangeProviders: Event<TimelineProvidersChangeEvent> = this._onDidChangeProviders.event;

	private readonly _onDidChangeTimeline = new Emitter<TimelineChangeEvent>();
	readonly onDidChangeTimeline: Event<TimelineChangeEvent> = this._onDidChangeTimeline.event;
	private readonly _onDidChangeUri = new Emitter<URI>();
	readonly onDidChangeUri: Event<URI> = this._onDidChangeUri.event;

	private readonly hasProviderContext: IContextKey<boolean>;
	private readonly providers = new Map<string, TimelineProvider>();
	private readonly providerSubscriptions = new Map<string, IDisposable>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IViewsService protected viewsService: IViewsService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
	) {
		this.hasProviderContext = TimelineHasProviderContext.bindTo(this.contextKeyService);
		this.updateHasProviderContext();
	}

	getSources() {
		return [...this.providers.values()].map(p => ({ id: p.id, label: p.label }));
	}

	getTimeline(id: string, uri: URI, options: TimelineOptions, tokenSource: CancellationTokenSource) {
		this.logService.trace(`TimelineService#getTimeline(${id}): uri=${uri.toString()}`);

		const provider = this.providers.get(id);
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
			result: provider.provideTimeline(uri, options, tokenSource.token)
				.then(result => {
					if (result === undefined) {
						return undefined;
					}

					result.items = result.items.map(item => ({ ...item, source: provider.id }));
					result.items.sort((a, b) => (b.timestamp - a.timestamp) || b.source.localeCompare(a.source, undefined, { numeric: true, sensitivity: 'base' }));

					return result;
				}),
			options: options,
			source: provider.id,
			tokenSource: tokenSource,
			uri: uri
		};
	}

	registerTimelineProvider(provider: TimelineProvider): IDisposable {
		this.logService.trace(`TimelineService#registerTimelineProvider: id=${provider.id}`);

		const id = provider.id;

		const existing = this.providers.get(id);
		if (existing) {
			// For now to deal with https://github.com/microsoft/vscode/issues/89553 allow any overwritting here (still will be blocked in the Extension Host)
			// TODO@eamodio: Ultimately will need to figure out a way to unregister providers when the Extension Host restarts/crashes
			// throw new Error(`Timeline Provider ${id} already exists.`);
			try {
				existing?.dispose();
			}
			catch { }
		}

		this.providers.set(id, provider);

		this.updateHasProviderContext();

		if (provider.onDidChange) {
			this.providerSubscriptions.set(id, provider.onDidChange(e => this._onDidChangeTimeline.fire(e)));
		}
		this._onDidChangeProviders.fire({ added: [id] });

		return {
			dispose: () => {
				this.providers.delete(id);
				this._onDidChangeProviders.fire({ removed: [id] });
			}
		};
	}

	unregisterTimelineProvider(id: string): void {
		this.logService.trace(`TimelineService#unregisterTimelineProvider: id=${id}`);

		if (!this.providers.has(id)) {
			return;
		}

		this.providers.delete(id);
		this.providerSubscriptions.delete(id);

		this.updateHasProviderContext();

		this._onDidChangeProviders.fire({ removed: [id] });
	}

	setUri(uri: URI) {
		this.viewsService.openView(TimelinePaneId, true);
		this._onDidChangeUri.fire(uri);
	}

	private updateHasProviderContext() {
		this.hasProviderContext.set(this.providers.size !== 0);
	}
}
