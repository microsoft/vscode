/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { MainContext, MainThreadTimelineShape, ExtHostTimelineShape, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { TimelineOptions, TimelineProviderDescriptor, ITimelineService, Timeline, WorkspaceTimelineProviderDescriptor } from '../../contrib/timeline/common/timeline.js';
import { revive } from '../../../base/common/marshalling.js';

@extHostNamedCustomer(MainContext.MainThreadTimeline)
export class MainThreadTimeline extends Disposable implements MainThreadTimelineShape {
	private readonly _proxy: ExtHostTimelineShape;
	private readonly _providerEmitters = this._register(new DisposableMap<string, Emitter<readonly URI[] | undefined>>());
	private readonly _workspaceProviderEmitters = this._register(new DisposableMap<string, Emitter<void>>());

	constructor(
		context: IExtHostContext,
		@ILogService private readonly logService: ILogService,
		@ITimelineService private readonly _timelineService: ITimelineService
	) {
		super();
		this._proxy = context.getProxy(ExtHostContext.ExtHostTimeline);
	}

	$registerTimelineProvider(provider: TimelineProviderDescriptor): void {
		this.logService.trace(`MainThreadTimeline#registerTimelineProvider: id=${provider.id}`);

		const proxy = this._proxy;

		const emitters = this._providerEmitters;
		let onDidChange = emitters.get(provider.id);
		if (onDidChange === undefined) {
			onDidChange = new Emitter<readonly URI[] | undefined>();
			emitters.set(provider.id, onDidChange);
		}

		this._timelineService.registerTimelineProvider({
			...provider,
			onDidChange: onDidChange.event,
			async provideTimeline(uri: URI, options: TimelineOptions, token: CancellationToken) {
				return revive<Timeline>(await proxy.$getTimeline(provider.id, uri, options, token));
			},
			dispose() {
				emitters.deleteAndDispose(provider.id);
			}
		});
	}

	$unregisterTimelineProvider(id: string): void {
		this.logService.trace(`MainThreadTimeline#unregisterTimelineProvider: id=${id}`);

		this._timelineService.unregisterTimelineProvider(id);
		this._providerEmitters.deleteAndDispose(id);
	}

	$registerWorkspaceTimelineProvider(provider: WorkspaceTimelineProviderDescriptor): void {
		this.logService.trace(`MainThreadTimeline#registerWorkspaceTimelineProvider: id=${provider.id}`);

		const proxy = this._proxy;

		const emitters = this._workspaceProviderEmitters;
		let onDidChange = emitters.get(provider.id);
		if (onDidChange === undefined) {
			onDidChange = new Emitter<void>();
			emitters.set(provider.id, onDidChange);
		}

		this._timelineService.registerWorkspaceTimelineProvider({
			...provider,
			onDidChange: onDidChange.event,
			async provideWorkspaceTimeline(options: TimelineOptions, token: CancellationToken) {
				return revive<Timeline>(await proxy.$getTimeline(provider.id, undefined, options, token));
			},
			dispose() {
				emitters.deleteAndDispose(provider.id);
			}
		});
	}

	$unregisterWorkspaceTimelineProvider(id: string): void {
		this.logService.trace(`MainThreadTimeline#unregisterWorkspaceTimelineProvider: id=${id}`);

		this._timelineService.unregisterWorkspaceTimelineProvider(id);
		this._workspaceProviderEmitters.deleteAndDispose(id);
	}

	$emitTimelineChangeEvent(id: string, uris: UriComponents[] | undefined): void {
		this.logService.trace(`MainThreadTimeline#emitChangeEvent: id=${id}, uris=${uris?.map(uri => URI.revive(uri).toString(true)).join(', ')}`);

		this._providerEmitters.get(id)?.fire(uris?.map(uri => URI.revive(uri)));
	}

	$emitWorkspaceTimelineChangeEvent(id: string): void {
		this.logService.trace(`MainThreadTimeline#emitWorkspaceChangeEvent: id=${id}`);

		this._workspaceProviderEmitters.get(id)?.fire();
	}

	override dispose(): void {
		for (const id of this._providerEmitters.keys()) {
			this.$unregisterTimelineProvider(id);
		}
		for (const id of this._workspaceProviderEmitters.keys()) {
			this.$unregisterWorkspaceTimelineProvider(id);
		}
		super.dispose();
	}
}
