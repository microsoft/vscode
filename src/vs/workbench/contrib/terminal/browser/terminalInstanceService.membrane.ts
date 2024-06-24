/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';
import { IShellLaunchConfig, ITerminalBackend, ITerminalBackendRegistry, ITerminalProfile, TerminalExtensions, TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';

export class TerminalInstanceService extends Disposable implements ITerminalInstanceService {
	declare _serviceBrand: undefined;
	// private _configHelper: TerminalConfigHelper;
	private _backendRegistration = new Map<string | undefined, { promise: Promise<void>; resolve: () => void }>();

	private readonly _onDidCreateInstance = this._register(new Emitter<ITerminalInstance>());
	get onDidCreateInstance(): Event<ITerminalInstance> { return this._onDidCreateInstance.event; }

	constructor(
		// @IInstantiationService private readonly _instantiationService: IInstantiationService,
		// @IContextKeyService private readonly _contextKeyService: IContextKeyService,
		// @IWorkbenchEnvironmentService readonly _environmentService: IWorkbenchEnvironmentService,
		...args: any[]
	) {
		super();
	}

	createInstance(profile: ITerminalProfile, target: TerminalLocation): ITerminalInstance;
	createInstance(shellLaunchConfig: IShellLaunchConfig, target: TerminalLocation): ITerminalInstance;
	createInstance(config: IShellLaunchConfig | ITerminalProfile, target: TerminalLocation): ITerminalInstance {
		throw new Error('Unimplemented');
	}

	convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile?: IShellLaunchConfig | ITerminalProfile, cwd?: string | URI): IShellLaunchConfig {
		// Return empty shell launch config
		return {};
	}

	async getBackend(remoteAuthority?: string): Promise<ITerminalBackend | undefined> {
		return undefined;
	}

	getRegisteredBackends(): IterableIterator<ITerminalBackend> {
		return Registry.as<ITerminalBackendRegistry>(TerminalExtensions.Backend).backends.values();
	}

	didRegisterBackend(remoteAuthority?: string) {
		this._backendRegistration.get(remoteAuthority)?.resolve();
	}
}

registerSingleton(ITerminalInstanceService, TerminalInstanceService, InstantiationType.Delayed);
