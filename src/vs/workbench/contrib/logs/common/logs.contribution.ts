/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SetLogLevelAction } from './logsActions.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IOutputChannelRegistry, IOutputService, Extensions, isMultiSourceOutputChannelDescriptor, isSingleSourceOutputChannelDescriptor } from '../../../services/output/common/output.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CONTEXT_LOG_LEVEL, ILoggerResource, ILoggerService, LogLevel, LogLevelToString, isLogLevel } from '../../../../platform/log/common/log.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { windowLogId, showWindowLogActionId } from '../../../services/log/common/logConstants.js';
import { IDefaultLogLevelsService } from './defaultLogLevels.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { CounterSet } from '../../../../base/common/map.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { Schemas } from '../../../../base/common/network.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SetLogLevelAction.ID,
			title: SetLogLevelAction.TITLE,
			category: Categories.Developer,
			f1: true
		});
	}
	run(servicesAccessor: ServicesAccessor): Promise<void> {
		return servicesAccessor.get(IInstantiationService).createInstance(SetLogLevelAction, SetLogLevelAction.ID, SetLogLevelAction.TITLE.value).run();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.setDefaultLogLevel',
			title: nls.localize2('setDefaultLogLevel', "Set Default Log Level"),
			category: Categories.Developer,
		});
	}
	run(servicesAccessor: ServicesAccessor, logLevel: LogLevel, extensionId?: string): Promise<void> {
		return servicesAccessor.get(IDefaultLogLevelsService).setDefaultLogLevel(logLevel, extensionId);
	}
});

class LogOutputChannels extends Disposable implements IWorkbenchContribution {

	private readonly contextKeys = new CounterSet<string>();
	private readonly outputChannelRegistry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);

	constructor(
		@ILoggerService private readonly loggerService: ILoggerService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();
		const contextKey = CONTEXT_LOG_LEVEL.bindTo(contextKeyService);
		contextKey.set(LogLevelToString(loggerService.getLogLevel()));
		this._register(loggerService.onDidChangeLogLevel(e => {
			if (isLogLevel(e)) {
				contextKey.set(LogLevelToString(loggerService.getLogLevel()));
			}
		}));

		this.onDidAddLoggers(loggerService.getRegisteredLoggers());
		this._register(loggerService.onDidChangeLoggers(({ added, removed }) => {
			this.onDidAddLoggers(added);
			this.onDidRemoveLoggers(removed);
		}));
		this._register(loggerService.onDidChangeVisibility(([resource, visibility]) => {
			const logger = loggerService.getRegisteredLogger(resource);
			if (logger) {
				if (visibility) {
					this.registerLogChannel(logger);
				} else {
					this.deregisterLogChannel(logger);
				}
			}
		}));
		this.registerShowWindowLogAction();
		this._register(Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(this.contextKeys))(() => this.onDidChangeContext()));
	}

	private onDidAddLoggers(loggers: Iterable<ILoggerResource>): void {
		for (const logger of loggers) {
			if (logger.when) {
				const contextKeyExpr = ContextKeyExpr.deserialize(logger.when);
				if (contextKeyExpr) {
					for (const key of contextKeyExpr.keys()) {
						this.contextKeys.add(key);
					}
					if (!this.contextKeyService.contextMatchesRules(contextKeyExpr)) {
						continue;
					}
				}
			}
			if (logger.hidden) {
				continue;
			}
			this.registerLogChannel(logger);
		}
	}

	private onDidChangeContext(): void {
		for (const logger of this.loggerService.getRegisteredLoggers()) {
			if (logger.when) {
				if (this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(logger.when))) {
					this.registerLogChannel(logger);
				} else {
					this.deregisterLogChannel(logger);
				}
			}
		}
	}

	private onDidRemoveLoggers(loggers: Iterable<ILoggerResource>): void {
		for (const logger of loggers) {
			if (logger.when) {
				const contextKeyExpr = ContextKeyExpr.deserialize(logger.when);
				if (contextKeyExpr) {
					for (const key of contextKeyExpr.keys()) {
						this.contextKeys.delete(key);
					}
				}
			}
			this.deregisterLogChannel(logger);
		}
	}

	private registerLogChannel(logger: ILoggerResource): void {
		if (logger.group) {
			this.registerCompoundLogChannel(logger.group.id, logger.group.name, logger);
			return;
		}

		const channel = this.outputChannelRegistry.getChannel(logger.id);
		if (channel && isSingleSourceOutputChannelDescriptor(channel) && this.uriIdentityService.extUri.isEqual(channel.source.resource, logger.resource)) {
			return;
		}

		const existingChannel = this.outputChannelRegistry.getChannel(logger.id);
		const remoteLogger = existingChannel && isSingleSourceOutputChannelDescriptor(existingChannel) && existingChannel.source.resource.scheme === Schemas.vscodeRemote ? this.loggerService.getRegisteredLogger(existingChannel.source.resource) : undefined;
		if (remoteLogger) {
			this.deregisterLogChannel(remoteLogger);
		}
		const hasToAppendRemote = existingChannel && logger.resource.scheme === Schemas.vscodeRemote;
		const id = hasToAppendRemote ? `${logger.id}.remote` : logger.id;
		const label = hasToAppendRemote ? nls.localize('remote name', "{0} (Remote)", logger.name ?? logger.id) : logger.name ?? logger.id;
		this.outputChannelRegistry.registerChannel({ id, label, source: { resource: logger.resource }, log: true, extensionId: logger.extensionId });
	}

	private registerCompoundLogChannel(id: string, name: string, logger: ILoggerResource): void {
		const channel = this.outputChannelRegistry.getChannel(id);
		const source = { resource: logger.resource, name: logger.name ?? logger.id };
		if (channel) {
			if (isMultiSourceOutputChannelDescriptor(channel) && !channel.source.some(({ resource }) => this.uriIdentityService.extUri.isEqual(resource, logger.resource))) {
				this.outputChannelRegistry.updateChannelSources(id, [...channel.source, source]);
			}
		} else {
			this.outputChannelRegistry.registerChannel({ id, label: name, log: true, source: [source] });
		}
	}

	private deregisterLogChannel(logger: ILoggerResource): void {
		if (logger.group) {
			const channel = this.outputChannelRegistry.getChannel(logger.group.id);
			if (channel && isMultiSourceOutputChannelDescriptor(channel)) {
				this.outputChannelRegistry.updateChannelSources(logger.group.id, channel.source.filter(({ resource }) => !this.uriIdentityService.extUri.isEqual(resource, logger.resource)));
			}
		} else {
			this.outputChannelRegistry.removeChannel(logger.id);
		}
	}

	private registerShowWindowLogAction(): void {
		this._register(registerAction2(class ShowWindowLogAction extends Action2 {
			constructor() {
				super({
					id: showWindowLogActionId,
					title: nls.localize2('show window log', "Show Window Log"),
					category: Categories.Developer,
					f1: true
				});
			}
			async run(servicesAccessor: ServicesAccessor): Promise<void> {
				const outputService = servicesAccessor.get(IOutputService);
				outputService.showChannel(windowLogId);
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(LogOutputChannels, LifecyclePhase.Restored);
