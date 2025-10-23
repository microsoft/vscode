/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { Event } from '../../../base/common/event.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { DidChangeLoggersEvent, ILogger, ILoggerOptions, ILoggerResource, ILoggerService, LogLevel, isLogLevel } from '../common/log.js';
import { LoggerService } from '../node/loggerService.js';

export const ILoggerMainService = refineServiceDecorator<ILoggerService, ILoggerMainService>(ILoggerService);

export interface ILoggerMainService extends ILoggerService {

	getOnDidChangeLogLevelEvent(windowId: number): Event<LogLevel | [URI, LogLevel]>;

	getOnDidChangeVisibilityEvent(windowId: number): Event<[URI, boolean]>;

	getOnDidChangeLoggersEvent(windowId: number): Event<DidChangeLoggersEvent>;

	createLogger(resource: URI, options?: ILoggerOptions, windowId?: number): ILogger;

	createLogger(id: string, options?: Omit<ILoggerOptions, 'id'>, windowId?: number): ILogger;

	registerLogger(resource: ILoggerResource, windowId?: number): void;

	getGlobalLoggers(): ILoggerResource[];

	deregisterLoggers(windowId: number): void;

}

export class LoggerMainService extends LoggerService implements ILoggerMainService {

	private readonly loggerResourcesByWindow = new ResourceMap<number>();

	override createLogger(idOrResource: URI | string, options?: ILoggerOptions, windowId?: number): ILogger {
		if (windowId !== undefined) {
			this.loggerResourcesByWindow.set(this.toResource(idOrResource), windowId);
		}
		try {
			return super.createLogger(idOrResource, options);
		} catch (error) {
			this.loggerResourcesByWindow.delete(this.toResource(idOrResource));
			throw error;
		}
	}

	override registerLogger(resource: ILoggerResource, windowId?: number): void {
		if (windowId !== undefined) {
			this.loggerResourcesByWindow.set(resource.resource, windowId);
		}
		super.registerLogger(resource);
	}

	override deregisterLogger(resource: URI): void {
		this.loggerResourcesByWindow.delete(resource);
		super.deregisterLogger(resource);
	}

	getGlobalLoggers(): ILoggerResource[] {
		const resources: ILoggerResource[] = [];
		for (const resource of super.getRegisteredLoggers()) {
			if (!this.loggerResourcesByWindow.has(resource.resource)) {
				resources.push(resource);
			}
		}
		return resources;
	}

	getOnDidChangeLogLevelEvent(windowId: number): Event<LogLevel | [URI, LogLevel]> {
		return Event.filter(this.onDidChangeLogLevel, arg => isLogLevel(arg) || this.isInterestedLoggerResource(arg[0], windowId));
	}

	getOnDidChangeVisibilityEvent(windowId: number): Event<[URI, boolean]> {
		return Event.filter(this.onDidChangeVisibility, ([resource]) => this.isInterestedLoggerResource(resource, windowId));
	}

	getOnDidChangeLoggersEvent(windowId: number): Event<DidChangeLoggersEvent> {
		return Event.filter(
			Event.map(this.onDidChangeLoggers, e => {
				const r = {
					added: [...e.added].filter(loggerResource => this.isInterestedLoggerResource(loggerResource.resource, windowId)),
					removed: [...e.removed].filter(loggerResource => this.isInterestedLoggerResource(loggerResource.resource, windowId)),
				};
				return r;
			}), e => e.added.length > 0 || e.removed.length > 0);
	}

	deregisterLoggers(windowId: number): void {
		for (const [resource, resourceWindow] of this.loggerResourcesByWindow) {
			if (resourceWindow === windowId) {
				this.deregisterLogger(resource);
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

