/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITimelineService, Timeline, TimelineChangeEvent, TimelineOptions, TimelineProvidersChangeEvent, TimelineProvider, TimelinePaneId, TimelineEditable, TimelineItemIdentifier, TimelineRequest, TimelineSource, WorkspaceTimelineProvider } from './timeline.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditableData } from '../../../common/views.js';

export const TimelineHasProviderContext = new RawContextKey<boolean>('timelineHasProvider', false);
export const TimelineHasWorkspaceProviderContext = new RawContextKey<boolean>('timelineHasWorkspaceProvider', false);

export class TimelineService extends Disposable implements ITimelineService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProviders = this._register(new Emitter<TimelineProvidersChangeEvent>());
	readonly onDidChangeProviders = this._onDidChangeProviders.event;

	private readonly _onDidChangeTimeline = this._register(new Emitter<TimelineChangeEvent>());
	readonly onDidChangeTimeline = this._onDidChangeTimeline.event;

	private readonly _onDidChangeUri = this._register(new Emitter<URI | undefined>());
	readonly onDidChangeUri = this._onDidChangeUri.event;

	private readonly _onDidChangeEditable = this._register(new Emitter<void>());
	readonly onDidChangeEditable = this._onDidChangeEditable.event;

	private _editable: TimelineEditable | undefined;
	get editable(): TimelineEditable | undefined {
		return this._editable;
	}

	private readonly hasProviderContext: IContextKey<boolean>;
	private readonly hasWorkspaceProviderContext: IContextKey<boolean>;
	private readonly providers = new Map<string, TimelineProvider>();
	private readonly providerSubscriptions = this._register(new DisposableMap<string>());
	private readonly workspaceProviders = new Map<string, WorkspaceTimelineProvider>();
	private readonly workspaceProviderSubscriptions = this._register(new DisposableMap<string>());

	constructor(
		@ILogService private readonly logService: ILogService,
		@IViewsService protected viewsService: IViewsService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
	) {
		super();

		this.hasProviderContext = TimelineHasProviderContext.bindTo(this.contextKeyService);
		this.hasWorkspaceProviderContext = TimelineHasWorkspaceProviderContext.bindTo(this.contextKeyService);
		this.updateHasProviderContext();
	}

	getSources(): TimelineSource[] {
		const sources = new Map<string, TimelineSource>();
		for (const provider of [...this.providers.values(), ...this.workspaceProviders.values()]) {
			if (!sources.has(provider.id)) {
				sources.set(provider.id, { id: provider.id, label: provider.label });
			}
		}
		return [...sources.values()];
	}

	hasWorkspaceProviders(): boolean {
		return this.workspaceProviders.size !== 0;
	}

	getTimeline(id: string, uri: URI | undefined, options: TimelineOptions, tokenSource: CancellationTokenSource): TimelineRequest | undefined {
		this.logService.trace(`TimelineService#getTimeline(${id}): uri=${uri?.toString() ?? 'workspace'}`);

		let result: Promise<Timeline | undefined>;
		if (uri === undefined) {
			const provider = this.workspaceProviders.get(id);
			if (provider === undefined) {
				return undefined;
			}

			result = provider.provideWorkspaceTimeline(options, tokenSource.token);
		} else {
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

			result = provider.provideTimeline(uri, options, tokenSource.token);
		}

		return {
			result: result.then(result => {
				if (result === undefined) {
					return undefined;
				}

				result.items = result.items.map(item => ({ ...item, source: id }));
				result.items.sort((a, b) => (b.timestamp - a.timestamp) || b.source.localeCompare(a.source, undefined, { numeric: true, sensitivity: 'base' }));

				return result;
			}),
			options,
			source: id,
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
			this.providerSubscriptions.set(id, provider.onDidChange(uris => this._onDidChangeTimeline.fire({ id, workspace: false, uris })));
		}
		this._onDidChangeProviders.fire({ added: [id] });

		return {
			dispose: () => {
				if (this.providers.get(id) === provider) {
					this.unregisterTimelineProvider(id);
				}
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

		this.fireProviderRemoved(id);
	}

	registerWorkspaceTimelineProvider(provider: WorkspaceTimelineProvider): IDisposable {
		this.logService.trace(`TimelineService#registerWorkspaceTimelineProvider: id=${provider.id}`);

		const id = provider.id;

		// Like file and folder timeline providers, replace any existing provider (still will be blocked in the Extension Host)
		const existing = this.workspaceProviders.get(id);
		if (existing) {
			try {
				existing.dispose();
			}
			catch { }
		}

		this.workspaceProviders.set(id, provider);

		this.updateHasProviderContext();

		if (provider.onDidChange) {
			this.workspaceProviderSubscriptions.set(id, provider.onDidChange(() => this._onDidChangeTimeline.fire({ id, workspace: true, uris: undefined })));
		}
		this._onDidChangeProviders.fire({ added: [id] });

		return {
			dispose: () => {
				if (this.workspaceProviders.get(id) === provider) {
					this.unregisterWorkspaceTimelineProvider(id);
				}
			}
		};
	}

	unregisterWorkspaceTimelineProvider(id: string): void {
		this.logService.trace(`TimelineService#unregisterWorkspaceTimelineProvider: id=${id}`);

		if (!this.workspaceProviders.has(id)) {
			return;
		}

		this.workspaceProviders.delete(id);
		this.workspaceProviderSubscriptions.deleteAndDispose(id);

		this.updateHasProviderContext();

		this.fireProviderRemoved(id);
	}

	private fireProviderRemoved(id: string): void {
		// A file and a workspace timeline provider can share an id, so when one of them remains, its source is reloaded
		if (this.providers.has(id) || this.workspaceProviders.has(id)) {
			this._onDidChangeProviders.fire({ removed: [id], added: [id] });
		} else {
			this._onDidChangeProviders.fire({ removed: [id] });
		}
	}

	async setUri(uri: URI | undefined): Promise<void> {
		// Wait for the view to be created and visible, otherwise it would miss the new uri or skip loading it
		await this.viewsService.openView(TimelinePaneId, true);
		this._onDidChangeUri.fire(uri);
	}

	setEditable(item: TimelineItemIdentifier, data: IEditableData | null): void {
		this._editable = data ? { item, data } : undefined;
		this._onDidChangeEditable.fire();
	}

	private updateHasProviderContext() {
		this.hasProviderContext.set(this.providers.size !== 0 || this.workspaceProviders.size !== 0);
		this.hasWorkspaceProviderContext.set(this.workspaceProviders.size !== 0);
	}
}
