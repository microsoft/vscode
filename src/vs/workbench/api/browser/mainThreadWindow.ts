/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, ExtHostWindowShape, IExtHostContext, IOpenUriOptions, MainContext, MainThreadWindowShape, IBadge } from '../common/extHost.protocol';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IActivityService, NumberBadge, TextBadge, IconBadge, ProgressBadge } from 'vs/workbench/services/activity/common/activity';

@extHostNamedCustomer(MainContext.MainThreadWindow)
export class MainThreadWindow implements MainThreadWindowShape {

	private readonly proxy: ExtHostWindowShape;
	private readonly disposables = new DisposableStore();
	private readonly resolved = new Map<number, IDisposable>();
	private readonly activities: Map<string, IDisposable> = new Map<string, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IHostService private readonly hostService: IHostService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IActivityService private readonly activityService: IActivityService
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostWindow);

		Event.latch(hostService.onDidChangeFocus)
			(this.proxy.$onDidChangeWindowFocus, this.proxy, this.disposables);
	}

	dispose(): void {
		this.disposables.dispose();

		for (const value of this.resolved.values()) {
			value.dispose();
		}
		this.resolved.clear();
	}

	$getWindowVisibility(): Promise<boolean> {
		return Promise.resolve(this.hostService.hasFocus);
	}

	async $openUri(uriComponents: UriComponents, uriString: string | undefined, options: IOpenUriOptions): Promise<boolean> {
		const uri = URI.from(uriComponents);
		let target: URI | string;
		if (uriString && URI.parse(uriString).toString() === uri.toString()) {
			// called with string and no transformation happened -> keep string
			target = uriString;
		} else {
			// called with URI or transformed -> use uri
			target = uri;
		}
		return this.openerService.open(target, {
			openExternal: true,
			allowTunneling: options.allowTunneling,
			allowContributedOpeners: options.allowContributedOpeners,
		});
	}

	async $asExternalUri(uriComponents: UriComponents, options: IOpenUriOptions): Promise<UriComponents> {
		const result = await this.openerService.resolveExternalUri(URI.revive(uriComponents), options);
		return result.resolved;
	}

	$setActivity(viewId: string, activity: IBadge | null | undefined): void {

		const oldActivity = this.activities.get(viewId);
		if (oldActivity) {
			oldActivity.dispose();
			this.activities.delete(viewId);
		}

		if (!activity) {
			return;
		}

		switch (activity.type) {
			case 'number':
				this.activities.set(viewId,
					this.activityService.showViewActivity(viewId, { badge: new NumberBadge(activity.number, () => activity.label) }));
				break;

			case 'text':
				this.activities.set(viewId,
					this.activityService.showViewActivity(viewId, { badge: new TextBadge(activity.text, () => activity.label) }));
				break;

			case 'icon':
				this.activities.set(viewId,
					this.activityService.showViewActivity(viewId, { badge: new IconBadge({ id: activity.icon.id, color: activity.icon.color }, () => activity.label) }));
				break;

			case 'progress':
				this.activities.set(viewId,
					this.activityService.showViewActivity(viewId, { badge: new ProgressBadge(() => activity.label) }));

		}
	}

}
