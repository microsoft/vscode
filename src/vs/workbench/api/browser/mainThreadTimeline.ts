/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { MainContext, MainThreadTimelineShape, ExtHostTimelineShape, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { TimelineChangeEvent, TimelineOptions, TimelineProviderDescriptor, ITimelineService, Timeline } from '../../contrib/timeline/common/timeline.js';
import { revive } from '../../../base/common/marshalling.js';

@extHostNamedCustomer(MainContext.MainThreadTimeline)
export class MainThreadTimeline implements MainThreadTimelineShape {
	private readonly _proxy: ExtHostTimelineShape;
	private readonly _providerEmitters = new Map<string, Emitter<TimelineChangeEvent>>();

	constructor(
		context: IExtHostContext,
		@ILogService private readonly logService: ILogService,
		@ITimelineService private readonly _timelineService: ITimelineService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostTimeline);
	}

	$registerTimelineProvider(provider: TimelineProviderDescriptor): void {
		this.logService.trace(`MainThreadTimeline#registerTimelineProvider: id=${provider.id}`);

		const proxy = this._proxy;

		const emitters = this._providerEmitters;
		let onDidChange = emitters.get(provider.id);
		if (onDidChange === undefined) {
			onDidChange = new Emitter<TimelineChangeEvent>();
			emitters.set(provider.id, onDidChange);
		}

		this._timelineService.registerTimelineProvider({
			...provider,
			onDidChange: onDidChange.event,
			async provideTimeline(uri: URI, options: TimelineOptions, token: CancellationToken) {
				return revive<Timeline>(await proxy.$getTimeline(provider.id, uri, options, token));
			},
			dispose() {
				emitters.delete(provider.id);
				onDidChange?.dispose();
			}
		});
	}

	$unregisterTimelineProvider(id: string): void {
		this.logService.trace(`MainThreadTimeline#unregisterTimelineProvider: id=${id}`);

		this._timelineService.unregisterTimelineProvider(id);
	}

	$emitTimelineChangeEvent(e: TimelineChangeEvent): void {
		this.logService.trace(`MainThreadTimeline#emitChangeEvent: id=${e.id}, uri=${e.uri?.toString(true)}`);

		const emitter = this._providerEmitters.get(e.id);
		emitter?.fire(e);
	}

	dispose(): void {
		// noop
	}
}
