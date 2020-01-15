/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadTimelineShape, IExtHostContext, ExtHostTimelineShape, ExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ITimelineService, TimelineItem } from 'vs/workbench/contrib/timeline/common/timeline';
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

	$registerTimelineProvider(key: string, id: string): void {
		console.log(`MainThreadTimeline#registerTimelineProvider: key=${key}`);

		const proxy = this._proxy;
		this._timelineService.registerTimelineProvider(key, {
			id: id,
			provideTimeline(uri: URI, since: number, token: CancellationToken) {
				return proxy.$getTimeline(key, uri, since, token);
			}
		});
	}

	$unregisterTimelineProvider(key: string): void {
		console.log(`MainThreadTimeline#unregisterTimelineProvider: key=${key}`);
		this._timelineService.unregisterTimelineProvider(key);
	}

	dispose(): void {
		// noop
	}
}
