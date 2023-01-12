/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { DidChangeLoggerResourceEvent, ILoggerResource, ILoggerService } from 'vs/platform/log/common/log';
import { LoggerService } from 'vs/platform/log/node/loggerService';

export const ILoggerMainService = refineServiceDecorator<ILoggerService, ILoggerMainService>(ILoggerService);

export interface ILoggerMainService extends ILoggerService {

	getOnDidChangeLogLevelEvent(windowId: number): Event<ILoggerResource>;

	getOnDidChangeLoggerResourcesEvent(windowId: number): Event<DidChangeLoggerResourceEvent>;

	registerLoggerResource(resource: ILoggerResource, windowId?: number): void;

	getLoggerResources(windowId?: number): ILoggerResource[];

	deregisterLoggerResources(windowId: number): void;

}

export class LoggerMainService extends LoggerService implements ILoggerMainService {

	private readonly loggerResourcesByWindow = new ResourceMap<number>();

	override registerLoggerResource(resource: ILoggerResource, windowId?: number): void {
		if (windowId !== undefined) {
			this.loggerResourcesByWindow.set(resource.resource, windowId);
		}
		super.registerLoggerResource(resource);
	}

	override deregisterLoggerResource(resource: URI): void {
		this.loggerResourcesByWindow.delete(resource);
		super.deregisterLoggerResource(resource);
	}

	override getLoggerResources(windowId?: number): ILoggerResource[] {
		const resources: ILoggerResource[] = [];
		for (const resource of super.getLoggerResources()) {
			if (this.isInterestedLoggerResource(resource.resource, windowId)) {
				resources.push(resource);
			}
		}
		return resources;
	}

	getOnDidChangeLogLevelEvent(windowId: number): Event<ILoggerResource> {
		return Event.filter(this.onDidChangeLogLevel, e => this.isInterestedLoggerResource(e.resource, windowId));
	}

	getOnDidChangeLoggerResourcesEvent(windowId: number): Event<DidChangeLoggerResourceEvent> {
		return Event.filter(
			Event.map(this.onDidChangeLoggerResources, e => {
				const r = {
					added: [...e.added].filter(loggerResource => this.isInterestedLoggerResource(loggerResource.resource, windowId)),
					removed: [...e.removed].filter(loggerResource => this.isInterestedLoggerResource(loggerResource.resource, windowId)),
				};
				return r;
			}), e => e.added.length > 0 || e.removed.length > 0);
	}

	deregisterLoggerResources(windowId: number): void {
		for (const [resource, resourceWindow] of this.loggerResourcesByWindow) {
			if (resourceWindow === windowId) {
				this.deregisterLoggerResource(resource);
			}
		}
	}

	private isInterestedLoggerResource(resource: URI, windowId: number | undefined): boolean {
		const loggerWindowId = this.loggerResourcesByWindow.get(resource);
		return loggerWindowId === undefined || loggerWindowId === windowId;
	}

	override dispose(): void {
		super.dispose();
		this.loggerResourcesByWindow.clear();
	}
}

