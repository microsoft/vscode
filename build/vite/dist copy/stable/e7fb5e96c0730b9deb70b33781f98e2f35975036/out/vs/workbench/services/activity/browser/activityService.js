/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { IActivityService } from '../common/activity.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { GLOBAL_ACTIVITY_ID, ACCOUNTS_ACTIVITY_ID } from '../../../common/activity.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
let ViewContainerActivityByView = class ViewContainerActivityByView extends Disposable {
    constructor(viewId, viewDescriptorService, activityService) {
        super();
        this.viewId = viewId;
        this.viewDescriptorService = viewDescriptorService;
        this.activityService = activityService;
        this.activity = undefined;
        this.activityDisposable = Disposable.None;
        this._register(Event.filter(this.viewDescriptorService.onDidChangeContainer, e => e.views.some(view => view.id === viewId))(() => this.update()));
        this._register(Event.filter(this.viewDescriptorService.onDidChangeLocation, e => e.views.some(view => view.id === viewId))(() => this.update()));
    }
    setActivity(activity) {
        this.activity = activity;
        this.update();
    }
    clearActivity() {
        this.activity = undefined;
        this.update();
    }
    update() {
        this.activityDisposable.dispose();
        const container = this.viewDescriptorService.getViewContainerByViewId(this.viewId);
        if (container && this.activity) {
            this.activityDisposable = this.activityService.showViewContainerActivity(container.id, this.activity);
        }
    }
    dispose() {
        this.activityDisposable.dispose();
        super.dispose();
    }
};
ViewContainerActivityByView = __decorate([
    __param(1, IViewDescriptorService),
    __param(2, IActivityService)
], ViewContainerActivityByView);
let ActivityService = class ActivityService extends Disposable {
    constructor(viewDescriptorService, instantiationService) {
        super();
        this.viewDescriptorService = viewDescriptorService;
        this.instantiationService = instantiationService;
        this.viewActivities = new Map();
        this._onDidChangeActivity = this._register(new Emitter());
        this.onDidChangeActivity = this._onDidChangeActivity.event;
        this.viewContainerActivities = new Map();
        this.globalActivities = new Map();
    }
    showViewContainerActivity(viewContainerId, activity) {
        const viewContainer = this.viewDescriptorService.getViewContainerById(viewContainerId);
        if (!viewContainer) {
            return Disposable.None;
        }
        let activities = this.viewContainerActivities.get(viewContainerId);
        if (!activities) {
            activities = [];
            this.viewContainerActivities.set(viewContainerId, activities);
        }
        // add activity
        activities.push(activity);
        this._onDidChangeActivity.fire(viewContainer);
        return toDisposable(() => {
            activities.splice(activities.indexOf(activity), 1);
            if (activities.length === 0) {
                this.viewContainerActivities.delete(viewContainerId);
            }
            this._onDidChangeActivity.fire(viewContainer);
        });
    }
    getViewContainerActivities(viewContainerId) {
        const viewContainer = this.viewDescriptorService.getViewContainerById(viewContainerId);
        if (viewContainer) {
            return this.viewContainerActivities.get(viewContainerId) ?? [];
        }
        return [];
    }
    showViewActivity(viewId, activity) {
        let maybeItem = this.viewActivities.get(viewId);
        if (maybeItem) {
            maybeItem.id++;
        }
        else {
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
    showAccountsActivity(activity) {
        return this.showActivity(ACCOUNTS_ACTIVITY_ID, activity);
    }
    showGlobalActivity(activity) {
        return this.showActivity(GLOBAL_ACTIVITY_ID, activity);
    }
    getActivity(id) {
        return this.globalActivities.get(id) ?? [];
    }
    showActivity(id, activity) {
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
};
ActivityService = __decorate([
    __param(0, IViewDescriptorService),
    __param(1, IInstantiationService)
], ActivityService);
export { ActivityService };
registerSingleton(IActivityService, ActivityService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aXZpdHlTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2FjdGl2aXR5L2Jyb3dzZXIvYWN0aXZpdHlTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBYSxNQUFNLHVCQUF1QixDQUFDO0FBQ3BFLE9BQU8sRUFBZSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDN0YsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxzQkFBc0IsRUFBaUIsTUFBTSwwQkFBMEIsQ0FBQztBQUNqRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRW5HLElBQU0sMkJBQTJCLEdBQWpDLE1BQU0sMkJBQTRCLFNBQVEsVUFBVTtJQUtuRCxZQUNrQixNQUFjLEVBQ1AscUJBQThELEVBQ3BFLGVBQWtEO1FBRXBFLEtBQUssRUFBRSxDQUFDO1FBSlMsV0FBTSxHQUFOLE1BQU0sQ0FBUTtRQUNVLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBd0I7UUFDbkQsb0JBQWUsR0FBZixlQUFlLENBQWtCO1FBTjdELGFBQVEsR0FBMEIsU0FBUyxDQUFDO1FBQzVDLHVCQUFrQixHQUFnQixVQUFVLENBQUMsSUFBSSxDQUFDO1FBUXpELElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsb0JBQW9CLEVBQUUsQ0FB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