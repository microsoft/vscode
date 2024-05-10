/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActivityService, IActivity } from 'vs/workbench/services/activity/common/activity';
import { IDisposable, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IViewDescriptorService, ViewContainer } from 'vs/workbench/common/views';
import { GLOBAL_ACTIVITY_ID, ACCOUNTS_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { Emitter, Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { isUndefined } from 'vs/base/common/types';

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
		super.dispose();
	}
}

interface IViewActivity {
	id: number;
	readonly activity: ViewContainerActivityByView;
}

export class ActivityService extends Disposable implements IActivityService {

	public _serviceBrand: undefined;

	private readonly viewActivities = new Map<string, IViewActivity>();

	private readonly _onDidChangeActivity = this._register(new Emitter<string | ViewContainer>());
	readonly onDidChangeActivity = this._onDidChangeActivity.event;

	private readonly viewContainerActivities = new Map<string, IActivity[]>();
	private readonly globalActivities = new Map<string, IActivity[]>();

	constructor(
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	showViewContainerActivity(viewContainerId: string, activity: IActivity): IDisposable {
		const viewContainer = this.viewDescriptorService.getViewContainerById(viewContainerId);
		if (viewContainer) {
			let activities = this.viewContainerActivities.get(viewContainerId);
			if (!activities) {
				activities = [];
				this.viewContainerActivities.set(viewContainerId, activities);
			}
			for (let i = 0; i <= activities.length; i++) {
				if (i === activities.length || isUndefined(activity.priority)) {
					activities.push(activity);
					break;
				} else if (isUndefined(activities[i].priority) || activities[i].priority! <= activity.priority) {
					activities.splice(i, 0, activity);
					break;
				}
			}
			this._onDidChangeActivity.fire(viewContainer);
			return toDisposable(() => {
				activities.splice(activities.indexOf(activity), 1);
				if (activities.length === 0) {
					this.viewContainerActivities.delete(viewContainerId);
				}
				this._onDidChangeActivity.fire(viewContainer);
			});
		}
		return Disposable.None;
	}

	getViewContainerActivities(viewContainerId: string): IActivity[] {
		const viewContainer = this.viewDescriptorService.getViewContainerById(viewContainerId);
		if (viewContainer) {
			return this.viewContainerActivities.get(viewContainerId) ?? [];
		}
		return [];
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

	showAccountsActivity(activity: IActivity): IDisposable {
		return this.showActivity(ACCOUNTS_ACTIVITY_ID, activity);
	}

	showGlobalActivity(activity: IActivity): IDisposable {
		return this.showActivity(GLOBAL_ACTIVITY_ID, activity);
	}

	getActivity(id: string): IActivity[] {
		return this.globalActivities.get(id) ?? [];
	}

	private showActivity(id: string, activity: IActivity): IDisposable {
		let activities = this.globalActivities.get(id);
		if (!activities) {
			activities = [];
			this.globalActivities.set(id, activities);
		}
		activities.push(activity);
		this._onDidChangeActivity.fire(id);
		return toDisposable(() => {
			activities.splice(activities.indexOf(activity), 1);
			if (activities.length === 0) {
				this.globalActivities.delete(id);
			}
			this._onDidChangeActivity.fire(id);
		});
	}
}

registerSingleton(IActivityService, ActivityService, InstantiationType.Delayed);
