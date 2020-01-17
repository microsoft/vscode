/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadTimelineShape, IExtHostContext, ExtHostTimelineShape, ExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ITimelineService, TimelineItem, TimelineProviderDescriptor } from 'vs/workbench/contrib/timeline/common/timeline';
import { URI } from 'vs/base/common/uri';
import { CancellationToken } from 'vs/base/common/cancellation';

@extHostNamedCustomer(MainContext.MainThreadTimeline)
export class MainThreadTimeline implements MainThreadTimelineShape {
	private readonly _proxy: ExtHostTimelineShape;

	constructor(
		context: IExtHostContext,
		@ITimelineService private readonly _timelineService: ITimelineService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostTimeline);
	}

	$getTimeline(uri: URI, since: number, token: CancellationToken): Promise<TimelineItem[]> {
		return this._timelineService.getTimeline(uri, since, token);
	}

	$registerTimelineProvider(provider: TimelineProviderDescriptor): void {
		console.log(`MainThreadTimeline#registerTimelineProvider: provider=${provider.source}`);

		const proxy = this._proxy;

		this._timelineService.registerTimelineProvider({
			...provider,
			provideTimeline(uri: URI, since: number, token: CancellationToken) {
				return proxy.$getTimeline(provider.source, uri, since, token);
			},
			dispose() { }
		});
	}

	$unregisterTimelineProvider(source: string): void {
		console.log(`MainThreadTimeline#unregisterTimelineProvider: source=${source}`);
		this._timelineService.unregisterTimelineProvider(source);
	}

	dispose(): void {
		// noop
	}
}
