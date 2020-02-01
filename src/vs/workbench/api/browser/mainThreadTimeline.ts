/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { MainContext, MainThreadTimelineShape, IExtHostContext, ExtHostTimelineShape, ExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ITimelineService, TimelineItem, TimelineProviderDescriptor } from 'vs/workbench/contrib/timeline/common/timeline';

@extHostNamedCustomer(MainContext.MainThreadTimeline)
export class MainThreadTimeline implements MainThreadTimelineShape {
	private readonly _proxy: ExtHostTimelineShape;
	private readonly _providerEmitters = new Map<string, Emitter<URI | undefined>>();

	constructor(
		context: IExtHostContext,
		@ILogService private readonly logService: ILogService,
		@ITimelineService private readonly _timelineService: ITimelineService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostTimeline);
	}

	$getTimeline(uri: URI, token: CancellationToken): Promise<TimelineItem[]> {
		return this._timelineService.getTimeline(uri, token);
	}

	$registerTimelineProvider(provider: TimelineProviderDescriptor): void {
		this.logService.trace(`MainThreadTimeline#registerTimelineProvider: source=${provider.source}`);

		const proxy = this._proxy;

		const emitters = this._providerEmitters;
		let onDidChange = emitters.get(provider.source);
		if (onDidChange === undefined) {
			onDidChange = new Emitter<URI | undefined>();
			emitters.set(provider.source, onDidChange);
		}

		this._timelineService.registerTimelineProvider({
			...provider,
			onDidChange: onDidChange.event,
			provideTimeline(uri: URI, token: CancellationToken) {
				return proxy.$getTimeline(provider.source, uri, token);
			},
			dispose() {
				emitters.delete(provider.source);
				onDidChange?.dispose();
			}
		});
	}

	$unregisterTimelineProvider(source: string): void {
		this.logService.trace(`MainThreadTimeline#unregisterTimelineProvider: source=${source}`);

		this._timelineService.unregisterTimelineProvider(source);
	}

	$emitTimelineChangeEvent(source: string, uri: URI | undefined): void {
		this.logService.trace(`MainThreadTimeline#emitChangeEvent: source=${source}, uri=${uri?.toString(true)}`);

		const emitter = this._providerEmitters.get(source);
		emitter?.fire(uri);
	}

	dispose(): void {
		// noop
	}
}
