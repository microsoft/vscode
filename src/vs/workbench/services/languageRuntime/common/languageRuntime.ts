/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILanguageRuntimeMetadata, ILanguageRuntimeService, LanguageStartupBehavior, RuntimeStartupPhase, formatLanguageRuntimeMetadata } from './languageRuntimeService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationNode, } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ISettableObservable } from '../../../../base/common/observableInternal/base.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableValue } from '../../../../base/common/observable.js';

export class LanguageRuntimeService extends Disposable implements ILanguageRuntimeService {
	private readonly _registeredRuntimesByRuntimeId = new Map<string, ILanguageRuntimeMetadata>();
	private readonly _onDidRegisterRuntimeEmitter =
		this._register(new Emitter<ILanguageRuntimeMetadata>);
	private _startupPhase: ISettableObservable<RuntimeStartupPhase>;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();

		this._startupPhase = observableValue(
			'runtime-startup-phase', RuntimeStartupPhase.Initializing);
		this.onDidChangeRuntimeStartupPhase = Event.fromObservable(this._startupPhase);
	}

	setStartupPhase(phase: RuntimeStartupPhase): void {
		this._startupPhase.set(phase, undefined);
	}

	declare readonly _serviceBrand: undefined;

	readonly onDidRegisterRuntime = this._onDidRegisterRuntimeEmitter.event;

	onDidChangeRuntimeStartupPhase: Event<RuntimeStartupPhase>;

	get registeredRuntimes(): ILanguageRuntimeMetadata[] {
		return Array.from(this._registeredRuntimesByRuntimeId.values());
	}

	getRegisteredRuntime(runtimeId: string): ILanguageRuntimeMetadata | undefined {
		return this._registeredRuntimesByRuntimeId.get(runtimeId);
	}

	registerRuntime(metadata: ILanguageRuntimeMetadata): IDisposable {
		if (this._registeredRuntimesByRuntimeId.has(metadata.runtimeId)) {
			return this._register(toDisposable(() => { }));
		}

		const startupBehavior = this._configurationService.getValue<LanguageStartupBehavior>(
			'interpreters.startupBehavior', { overrideIdentifier: metadata.languageId });
		if (startupBehavior === LanguageStartupBehavior.Disabled) {
			this._logService.info(
				`Attempt to register language runtime ${formatLanguageRuntimeMetadata(metadata)}, ` +
				`but language '${metadata.languageId}' is disabled.`);
			throw new Error(`Cannot register '${metadata.runtimeName}' because ` +
				`the '${metadata.languageId}' language is disabled.`);
		}

		this._registeredRuntimesByRuntimeId.set(metadata.runtimeId, metadata);
		this._onDidRegisterRuntimeEmitter.fire(metadata);
		this._logService.trace(`Language runtime ${formatLanguageRuntimeMetadata(metadata)} successfully registered.`);

		return this._register(toDisposable(() => {
			this._registeredRuntimesByRuntimeId.delete(metadata.runtimeId);
		}));
	}

	unregisterRuntime(runtimeId: string): void {
		this._registeredRuntimesByRuntimeId.delete(runtimeId);
	}

	getRuntime(runtimeId: string): ILanguageRuntimeMetadata | undefined {
		return this._registeredRuntimesByRuntimeId.get(runtimeId);
	}

	get startupPhase(): RuntimeStartupPhase {
		return this._startupPhase.get();
	}
}

registerSingleton(ILanguageRuntimeService, LanguageRuntimeService, InstantiationType.Eager);

export const erdosConfigurationNodeBase = Object.freeze<IConfigurationNode>({
	'id': 'erdos',
	'order': 7,
	'title': nls.localize('erdosConfigurationTitle', "Erdos"),
	'type': 'object',
});

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	...erdosConfigurationNodeBase,
	properties: {
		'interpreters.restartOnCrash': {
			scope: ConfigurationScope.MACHINE_OVERRIDABLE,
			type: 'boolean',
			default: true,
			description: nls.localize('erdos.runtime.restartOnCrash', "When enabled, interpreters are automatically restarted after a crash.")
		},
		'interpreters.startupBehavior': {
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
			type: 'string',
			enum: [
				'always',
				'auto',
				'recommended',
				'manual',
				'disabled'
			],
			default: 'auto',
			enumDescriptions: [
				nls.localize(
					'erdos.runtime.startupBehavior.always',
					"An interpreter will always start when a new Erdos window is opened; the last used interpreter will start if available, and a default will be chosen otherwise."),
				nls.localize(
					'erdos.runtime.startupBehavior.auto',
					"An interpreter will start when needed, or if it was previously used in the workspace."),
				nls.localize(
					'erdos.runtime.startupBehavior.recommended',
					"An interpreter will start when the extension providing the interpreter recommends it."),
				nls.localize(
					'erdos.runtime.startupBehavior.manual',
					"Interpreters will only start when manually selected."),
				nls.localize(
					'erdos.runtime.startupBehavior.disabled',
					"Interpreters are disabled. You will not be able to select an interpreter."),
			],
			description: nls.localize(
				'erdos.runtime.automaticStartup',
				"How interpreters are started in new Erdos windows."),
			tags: ['interpreterSettings']
		}
	}
});
