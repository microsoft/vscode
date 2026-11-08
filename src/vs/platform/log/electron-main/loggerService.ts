/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { Emitter, Event } from '../../../base/common/event.js';
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

	deregisterLogger(idOrResource: URI | string, windowId?: number): void;

	getGlobalLoggers(): ILoggerResource[];

	deregisterLoggers(windowId: number): void;

}

export class LoggerMainService extends LoggerService implements ILoggerMainService {

	private readonly loggerOwners = new ResourceMap<Set<number | undefined>>();
	private readonly _onDidAddGlobalOwner = this._register(new Emitter<{ logger: ILoggerResource; previousOwners: ReadonlySet<number | undefined> }>());

	constructor(logLevel: LogLevel, logsHome: URI, loggerResources?: Iterable<ILoggerResource>) {
		super(logLevel, logsHome, loggerResources);
		for (const logger of this.getRegisteredLoggers()) {
			this.loggerOwners.set(logger.resource, new Set([undefined]));
		}
	}

	override createLogger(idOrResource: URI | string, options?: ILoggerOptions, windowId?: number): ILogger {
		return this.createLoggerWithRegistration(idOrResource, options, info => this.registerLogger(info, windowId));
	}

	override registerLogger(resource: ILoggerResource, windowId?: number): void {
		let owners = this.loggerOwners.get(resource.resource);
		if (!owners) {
			owners = new Set<number | undefined>();
			this.loggerOwners.set(resource.resource, owners);
		}
		const previousOwners = windowId === undefined && owners.size > 0 && !owners.has(undefined) ? new Set(owners) : undefined;
		owners.add(windowId);
		super.registerLogger(resource);
		const logger = this.getRegisteredLogger(resource.resource);
		if (previousOwners && logger) {
			this._onDidAddGlobalOwner.fire({ logger, previousOwners });
		}
	}

	override deregisterLogger(idOrResource: URI | string, windowId?: number): void {
		const resource = this.toResource(idOrResource);
		const owners = this.loggerOwners.get(resource);
		if (!owners?.delete(windowId) || owners.size > 0) {
			return;
		}
		this.loggerOwners.delete(resource);
		super.deregisterLogger(resource);
	}

	getGlobalLoggers(): ILoggerResource[] {
		const resources: ILoggerResource[] = [];
		for (const resource of super.getRegisteredLoggers()) {
			if (this.loggerOwners.get(resource.resource)?.has(undefined)) {
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
		const onDidChangeLoggers = Event.filter(
			Event.map(this.onDidChangeLoggers, e => {
				const r = {
					added: [...e.added].filter(loggerResource => this.isInterestedLoggerResource(loggerResource.resource, windowId)),
					removed: [...e.removed].filter(loggerResource => this.isInterestedLoggerResource(loggerResource.resource, windowId)),
				};
				return r;
			}), e => e.added.length > 0 || e.removed.length > 0);
		const onDidAddGlobalLogger = Event.map(
			Event.filter(this._onDidAddGlobalOwner.event, e => !e.previousOwners.has(windowId)),
			e => ({ added: [e.logger], removed: [] }));
		return Event.any(onDidChangeLoggers, onDidAddGlobalLogger);
	}

	deregisterLoggers(windowId: number): void {
		for (const resource of this.loggerOwners.keys()) {
			this.deregisterLogger(resource, windowId);
		}
	}

	private isInterestedLoggerResource(resource: URI, windowId: number | undefined): boolean {
		const owners = this.loggerOwners.get(resource);
		return !owners || owners.has(undefined) || owners.has(windowId);
	}

	override dispose(): void {
		super.dispose();
		this.loggerOwners.clear();
	}
}

