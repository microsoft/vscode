/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITimelineService, TimelineChangeEvent, TimelineOptions, TimelineProvidersChangeEvent, TimelineProvider, TimelinePaneId } from './timeline.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const TimelineHasProviderContext = new RawContextKey<boolean>('timelineHasProvider', false);

export class TimelineService extends Disposable implements ITimelineService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProviders = this._register(new Emitter<TimelineProvidersChangeEvent>());
	readonly onDidChangeProviders = this._onDidChangeProviders.event;

	private readonly _onDidChangeTimeline = this._register(new Emitter<TimelineChangeEvent>());
	readonly onDidChangeTimeline = this._onDidChangeTimeline.event;

	private readonly _onDidChangeUri = this._register(new Emitter<URI>());
	readonly onDidChangeUri = this._onDidChangeUri.event;

	private readonly hasProviderContext: IContextKey<boolean>;
	private readonly providers = new Map<string, TimelineProvider>();
	private readonly providerSubscriptions = this._register(new DisposableMap<string>());

	constructor(
		@ILogService private readonly logService: ILogService,
		@IViewsService protected viewsService: IViewsService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
	) {
		super();

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
			options,
			source: provider.id,
			tokenSource,
			uri
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
		this.providerSubscriptions.deleteAndDispose(id);

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
