/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ResourceMap } from '../../../base/common/map.js';
import { Event } from '../../../base/common/event.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { ILoggerService, isLogLevel } from '../common/log.js';
import { LoggerService } from '../node/loggerService.js';
export const ILoggerMainService = refineServiceDecorator(ILoggerService);
export class LoggerMainService extends LoggerService {
    constructor() {
        super(...arguments);
        this.loggerResourcesByWindow = new ResourceMap();
    }
    createLogger(idOrResource, options, windowId) {
        if (windowId !== undefined) {
            this.loggerResourcesByWindow.set(this.toResource(idOrResource), windowId);
        }
        try {
            return super.createLogger(idOrResource, options);
        }
        catch (error) {
            this.loggerResourcesByWindow.delete(this.toResource(idOrResource));
            throw error;
        }
    }
    registerLogger(resource, windowId) {
        if (windowId !== undefined) {
            this.loggerResourcesByWindow.set(resource.resource, windowId);
        }
        super.registerLogger(resource);
    }
    deregisterLogger(resource) {
        this.loggerResourcesByWindow.delete(resource);
        super.deregisterLogger(resource);
    }
    getGlobalLoggers() {
        const resources = [];
        for (const resource of super.getRegisteredLoggers()) {
            if (!this.loggerResourcesByWindow.has(resource.resource)) {
                resources.push(resource);
            }
        }
        return resources;
    }
    getOnDidChangeLogLevelEvent(windowId) {
        return Event.filter(this.onDidChangeLogLevel, arg => isLogLevel(arg) || this.isInterestedLoggerResource(arg[0], windowId));
    }
    getOnDidChangeVisibilityEvent(windowId) {
        return Event.filter(this.onDidChangeVisibility, ([resource]) => this.isInterestedLoggerResource(resource, windowId));
    }
    getOnDidChangeLoggersEvent(windowId) {
        return Event.filter(Event.map(this.onDidChangeLoggers, e => {
            const r = {
                added: [...e.added].filter(loggerResource => this.isInterestedLoggerResource(loggerResource.resource, windowId)),
                removed: [...e.removed].filter(loggerResource => this.isInterestedLoggerResource(loggerResource.resource, windowId)),
            };
            return r;
        }), e => e.added.length > 0 || e.removed.length > 0);
    }
    deregisterLoggers(windowId) {
        for (const [resource, resourceWindow] of this.loggerResourcesByWindow) {
            if (resourceWindow === windowId) {
                this.deregisterLogger(resource);
            }
        }
    }
    isInterestedLoggerResource(resource, windowId) {
        const loggerWindowId = this.loggerResourcesByWindow.get(resource);
        return loggerWindowId === undefined || loggerWindowId === windowId;
    }
    dispose() {
        super.dispose();
        this.loggerResourcesByWindow.clear();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2VyU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2xvZy9lbGVjdHJvbi1tYWluL2xvZ2dlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRTFELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNyRixPQUFPLEVBQW1FLGNBQWMsRUFBWSxVQUFVLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUN6SSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFekQsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsc0JBQXNCLENBQXFDLGNBQWMsQ0FBQyxDQUFDO0FBc0I3RyxNQUFNLE9BQU8saUJBQWtCLFNBQVEsYUFBYTtJQUFwRDs7UUFFa0IsNEJBQXVCLEdBQUcsSUFBSSxXQUFXLEVBQVUsQ0FBQztJQXdFdEUsQ0FBQztJQXRFUyxZQUFZLENBQUMsWUFBMEIsRUFBRSxPQUF3QixFQUFFLFFBQWlCO1FBQzVGLElBQUksUUFBUSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUMzRSxDQUFDO1FBQ0QsSUFBSSxDQUFDO1lBQ0osT0FBTyxLQUFLLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNsRCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsdUJBQXVCLENBQUMsTUFBTSxDQUFDLElBQUks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