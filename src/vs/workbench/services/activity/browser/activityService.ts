/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActivityService, IActivity } from 'vs/workbench/services/activity/common/activity';
import { IDisposable, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { GLOBAL_ACTIVITY_ID, ACCOUNTS_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';

class ViewContainerActivityByView extends Disposable {

	private activity: IActivity | undefined = undefined;
	private activityDisposable: IDisposable = Disposable.None;

	constructor(
		private readonly viewId: string,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IActivityService private readonly activityService: IActivityService,
	) {
		super();
		this._register(Event.filter(this.viewDescriptorService.onDidChangeContainer, e => e.views.some(view => view.id === viewId))(() => this.update()));
		this._register(Event.filter(this.viewDescriptorService.onDidChangeLocation, e => e.views.some(view => view.id === viewId))(() => this.update()));
	}

	setActivity(activity: IActivity): void {
		this.activity = activity;
		this.update();
	}

	clearActivity(): void {
		this.activity = undefined;
		this.update();
	}

	private update(): void {
		this.activityDisposable.dispose();
		const container = this.viewDescriptorService.getViewContainerByViewId(this.viewId);
		if (container && this.activity) {
			this.activityDisposable = this.activityService.showViewContainerActivity(container.id, this.activity);
		}
	}

	override dispose() {
		this.activityDisposable.dispose();
	}
}

interface IViewActivity {
	id: number;
	readonly activity: ViewContainerActivityByView;
}

export class ActivityService implements IActivityService {

	public _serviceBrand: undefined;

	private viewActivities = new Map<string, IViewActivity>();

	constructor(
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	showViewContainerActivity(viewContainerId: string, { badge, clazz, priority }: IActivity): IDisposable {
		const viewContainer = this.viewDescriptorService.getViewContainerById(viewContainerId);
		if (viewContainer) {
			const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
			if (location !== null) {
				return this.paneCompositeService.showActivity(viewContainer.id, location, badge, clazz, priority);
			}
		}
		return Disposable.None;
	}

	showViewActivity(viewId: string, activity: IActivity): IDisposable {
		let maybeItem = this.viewActivities.get(viewId);

		if (maybeItem) {
			maybeItem.id++;
		} else {
			maybeItem = {
				id: 1,
				activity: this.instantiationService.createInstance(ViewContainerActivityByView, viewId)
			};

			this.viewActivities.set(viewId, maybeItem);
		}

		const id = maybeItem.id;
		maybeItem.activity.setActivity(activity);

		const item = maybeItem;
		return toDisposable(() => {
			if (item.id === id) {
				item.activity.dispose();
				this.viewActivities.delete(viewId);
			}
		});
	}

	showAccountsActivity({ badge, clazz, priority }: IActivity): IDisposable {
		return this.paneCompositeService.showActivity(ACCOUNTS_ACTIVITY_ID, ViewContainerLocation.Sidebar, badge, clazz, priority);
	}

	showGlobalActivity({ badge, clazz, priority }: IActivity): IDisposable {
		return this.paneCompositeService.showActivity(GLOBAL_ACTIVITY_ID, ViewContainerLocation.Sidebar, badge, clazz, priority);
	}
}

registerSingleton(IActivityService, ActivityService, true);
