/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';
import { IShellLaunchConfig, ITerminalProfile, TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { ITerminalBackend, ITerminalBackendRegistry, TerminalExtensions } from 'vs/workbench/contrib/terminal/common/terminal';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { Registry } from 'vs/platform/registry/common/platform';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class TerminalInstanceService extends Disposable implements ITerminalInstanceService {
	declare _serviceBrand: undefined;
	private _terminalFocusContextKey: IContextKey<boolean>;
	private _terminalHasFixedWidth: IContextKey<boolean>;
	private _terminalShellTypeContextKey: IContextKey<string>;
	private _terminalAltBufferActiveContextKey: IContextKey<boolean>;
	private _terminalInRunCommandPicker: IContextKey<boolean>;
	private _terminalShellIntegrationEnabled: IContextKey<boolean>;
	private _configHelper: TerminalConfigHelper;

	private readonly _onDidCreateInstance = new Emitter<ITerminalInstance>();
	get onDidCreateInstance(): Event<ITerminalInstance> { return this._onDidCreateInstance.event; }

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService
	) {
		super();
		this._terminalFocusContextKey = TerminalContextKeys.focus.bindTo(this._contextKeyService);
		this._terminalHasFixedWidth = TerminalContextKeys.terminalHasFixedWidth.bindTo(this._contextKeyService);
		this._terminalShellTypeContextKey = TerminalContextKeys.shellType.bindTo(this._contextKeyService);
		this._terminalAltBufferActiveContextKey = TerminalContextKeys.altBufferActive.bindTo(this._contextKeyService);
		this._terminalInRunCommandPicker = TerminalContextKeys.inTerminalRunCommandPicker.bindTo(this._contextKeyService);
		this._terminalShellIntegrationEnabled = TerminalContextKeys.terminalShellIntegrationEnabled.bindTo(this._contextKeyService);
		this._configHelper = _instantiationService.createInstance(TerminalConfigHelper);
	}

	createInstance(profile: ITerminalProfile, target?: TerminalLocation, resource?: URI): ITerminalInstance;
	createInstance(shellLaunchConfig: IShellLaunchConfig, target?: TerminalLocation, resource?: URI): ITerminalInstance;
	createInstance(config: IShellLaunchConfig | ITerminalProfile, target?: TerminalLocation, resource?: URI): ITerminalInstance {
		const shellLaunchConfig = this.convertProfileToShellLaunchConfig(config);
		const instance = this._instantiationService.createInstance(TerminalInstance,
			this._terminalFocusContextKey,
			this._terminalHasFixedWidth,
			this._terminalShellTypeContextKey,
			this._terminalAltBufferActiveContextKey,
			this._terminalInRunCommandPicker,
			this._terminalShellIntegrationEnabled,
			this._configHelper,
			shellLaunchConfig,
			resource
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
		await this._lifecycleService.when(LifecyclePhase.Restored);
		return Registry.as<ITerminalBackendRegistry>(TerminalExtensions.Backend).getTerminalBackend(remoteAuthority);
	}
}

registerSingleton(ITerminalInstanceService, TerminalInstanceService, true);
