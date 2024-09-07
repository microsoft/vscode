/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance, ITerminalInstanceService } from './terminal.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IShellLaunchConfig, ITerminalBackend, ITerminalBackendRegistry, ITerminalProfile, TerminalExtensions, TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { TerminalInstance } from './terminalInstance.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { promiseWithResolvers } from '../../../../base/common/async.js';

export class TerminalInstanceService extends Disposable implements ITerminalInstanceService {
	declare _serviceBrand: undefined;
	private _terminalShellTypeContextKey: IContextKey<string>;
	private _terminalInRunCommandPicker: IContextKey<boolean>;
	private _backendRegistration = new Map<string | undefined, { promise: Promise<void>; resolve: () => void }>();

	private readonly _onDidCreateInstance = this._register(new Emitter<ITerminalInstance>());
	get onDidCreateInstance(): Event<ITerminalInstance> { return this._onDidCreateInstance.event; }

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._terminalShellTypeContextKey = TerminalContextKeys.shellType.bindTo(this._contextKeyService);
		this._terminalInRunCommandPicker = TerminalContextKeys.inTerminalRunCommandPicker.bindTo(this._contextKeyService);

		for (const remoteAuthority of [undefined, environmentService.remoteAuthority]) {
			const { promise, resolve } = promiseWithResolvers<void>();
			this._backendRegistration.set(remoteAuthority, { promise, resolve });
		}
	}

	createInstance(profile: ITerminalProfile, target: TerminalLocation): ITerminalInstance;
	createInstance(shellLaunchConfig: IShellLaunchConfig, target: TerminalLocation): ITerminalInstance;
	createInstance(config: IShellLaunchConfig | ITerminalProfile, target: TerminalLocation): ITerminalInstance {
		const shellLaunchConfig = this.convertProfileToShellLaunchConfig(config);
		const instance = this._instantiationService.createInstance(TerminalInstance,
			this._terminalShellTypeContextKey,
			this._terminalInRunCommandPicker,
			shellLaunchConfig
		);
		instance.target = target;
		this._onDidCreateInstance.fire(instance);
		return instance;
	}

	convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile?: IShellLaunchConfig | ITerminalProfile, cwd?: string | URI): IShellLaunchConfig {
		// Profile was provided
		if (shellLaunchConfigOrProfile && 'profileName' in shellLaunchConfigOrProfile) {
			const profile = shellLaunchConfigOrProfile;
			if (!profile.path) {
				return shellLaunchConfigOrProfile;
			}
			return {
				executable: profile.path,
				args: profile.args,
				env: profile.env,
				icon: profile.icon,
				color: profile.color,
				name: profile.overrideName ? profile.profileName : undefined,
				cwd
			};
		}

		// A shell launch config was provided
		if (shellLaunchConfigOrProfile) {
			if (cwd) {
				shellLaunchConfigOrProfile.cwd = cwd;
			}
			return shellLaunchConfigOrProfile;
		}

		// Return empty shell launch config
		return {};
	}

	async getBackend(remoteAuthority?: string): Promise<ITerminalBackend | undefined> {
		let backend = Registry.as<ITerminalBackendRegistry>(TerminalExtensions.Backend).getTerminalBackend(remoteAuthority);
		if (!backend) {
			// Ensure backend is initialized and try again
			await this._backendRegistration.get(remoteAuthority)?.promise;
			backend = Registry.as<ITerminalBackendRegistry>(TerminalExtensions.Backend).getTerminalBackend(remoteAuthority);
		}
		return backend;
	}

	getRegisteredBackends(): IterableIterator<ITerminalBackend> {
		return Registry.as<ITerminalBackendRegistry>(TerminalExtensions.Backend).backends.values();
	}

	didRegisterBackend(remoteAuthority?: string) {
		this._backendRegistration.get(remoteAuthority)?.resolve();
	}
}

registerSingleton(ITerminalInstanceService, TerminalInstanceService, InstantiationType.Delayed);
