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

	getOnDidChangeLogLevelEvent(windowId: number | undefined): Event<LogLevel | [URI, LogLevel]>;

	getOnDidChangeVisibilityEvent(windowId: number | undefined): Event<[URI, boolean]>;

	getOnDidChangeLoggersEvent(windowId: number | undefined): Event<DidChangeLoggersEvent>;

	createLogger(resource: URI, options?: ILoggerOptions, windowId?: number): ILogger;

	createLogger(id: string, options?: Omit<ILoggerOptions, 'id'>, windowId?: number): ILogger;

	registerLogger(resource: ILoggerResource, windowId?: number): void;

	deregisterLogger(idOrResource: URI | string, windowId?: number): void;

	getGlobalLoggers(): ILoggerResource[];

	deregisterLoggers(windowId: number): void;

}

export class LoggerMainService extends LoggerService implements ILoggerMainService {

	private readonly loggerOwners = new ResourceMap<Set<number | undefined>>();
	private readonly _onDidChangeOwners = this._register(new Emitter<{ logger: ILoggerResource; previousOwners: ReadonlySet<number | undefined>; owners: ReadonlySet<number | undefined> }>());

	constructor(logLevel: LogLevel, logsHome: URI, loggerResources?: Iterable<ILoggerResource>) {
		super(logLevel, logsHome, loggerResources);
		for (const logger of this.getRegisteredLoggers()) {
			this.loggerOwners.set(logger.resource, new Set([undefined]));
		}
	}

	override createLogger(idOrResource: URI | string, options?: ILoggerOptions, windowId?: number): ILogger {
		let previousOwners: ReadonlySet<number | undefined> | undefined;
		const logger = this.createLoggerWithRegistration(idOrResource, options, info => {
			previousOwners = this.addLoggerOwner(info.resource, windowId);
			super.registerLogger(info);
		});
		// Creation installs the final metadata after the registration callback returns.
		this.notifyOwnerChange(this.toResource(idOrResource), previousOwners);
		return logger;
	}

	override registerLogger(logger: ILoggerResource, windowId?: number): void {
		const previousOwners = this.addLoggerOwner(logger.resource, windowId);
		super.registerLogger(logger);
		this.notifyOwnerChange(logger.resource, previousOwners);
	}

	private addLoggerOwner(resource: URI, windowId: number | undefined): ReadonlySet<number | undefined> | undefined {
		let owners = this.loggerOwners.get(resource);
		if (!owners) {
			owners = new Set<number | undefined>();
			this.loggerOwners.set(resource, owners);
		}
		const previousOwners = owners.size > 0 && !owners.has(windowId) ? new Set(owners) : undefined;
		owners.add(windowId);
		return previousOwners;
	}

	private notifyOwnerChange(resource: URI, previousOwners: ReadonlySet<number | undefined> | undefined): void {
		const logger = this.getRegisteredLogger(resource);
		const owners = this.loggerOwners.get(resource);
		if (previousOwners && logger && owners) {
			this._onDidChangeOwners.fire({ logger, previousOwners, owners: new Set(owners) });
		}
	}

	override deregisterLogger(idOrResource: URI | string, windowId?: number): void {
		const resource = this.toResource(idOrResource);
		const owners = this.loggerOwners.get(resource);
		if (!owners?.has(windowId)) {
			return;
		}
		const previousOwners = new Set(owners);
		owners.delete(windowId);
		if (owners.size > 0) {
			this.notifyOwnerChange(resource, previousOwners);
		} else {
			this.loggerOwners.delete(resource);
			super.deregisterLogger(resource);
		}
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

	getOnDidChangeLogLevelEvent(windowId: number | undefined): Event<LogLevel | [URI, LogLevel]> {
		return Event.filter(this.onDidChangeLogLevel, arg => isLogLevel(arg) || this.isInterestedLoggerResource(arg[0], windowId));
	}

	getOnDidChangeVisibilityEvent(windowId: number | undefined): Event<[URI, boolean]> {
		return Event.filter(this.onDidChangeVisibility, ([resource]) => this.isInterestedLoggerResource(resource, windowId));
	}

	getOnDidChangeLoggersEvent(windowId: number | undefined): Event<DidChangeLoggersEvent> {
		const onDidChangeLoggers = Event.filter(
			Event.map(this.onDidChangeLoggers, e => {
				const r = {
					added: [...e.added].filter(loggerResource => this.isInterestedLoggerResource(loggerResource.resource, windowId)),
					removed: [...e.removed].filter(loggerResource => this.isInterestedLoggerResource(loggerResource.resource, windowId)),
				};
				return r;
			}), e => e.added.length > 0 || e.removed.length > 0);
		const onDidChangeOwners = Event.map(this._onDidChangeOwners.event, ({ logger, previousOwners, owners }) => {
			const wasInterested = previousOwners.has(undefined) || previousOwners.has(windowId);
			const isInterested = owners.has(undefined) || owners.has(windowId);
			// Releasing a local writer also needs to restore any surviving global mirror.
			const releasedOwner = previousOwners.has(windowId) && !owners.has(windowId);
			return {
				added: isInterested && (!wasInterested || releasedOwner) ? [logger] : [],
				removed: wasInterested && !isInterested ? [logger] : []
			};
		});
		return Event.any(onDidChangeLoggers, Event.filter(onDidChangeOwners, e => e.added.length > 0 || e.removed.length > 0));
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

