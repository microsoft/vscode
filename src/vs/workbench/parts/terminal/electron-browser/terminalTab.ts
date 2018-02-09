/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance, IShellLaunchConfig, ITerminalTab } from 'vs/workbench/parts/terminal/common/terminal';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { TerminalInstance } from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';

export class TerminalTab implements ITerminalTab {
	private _terminalInstances: ITerminalInstance[] = [];
	private _disposables: IDisposable[] = [];

	public get terminalInstances(): ITerminalInstance[] { return this._terminalInstances; }

	private _onDisposed: Emitter<ITerminalTab>;
	public get onDisposed(): Event<ITerminalTab> { return this._onDisposed.event; }

	constructor(
		terminalFocusContextKey: IContextKey<boolean>,
		configHelper: TerminalConfigHelper,
		container: HTMLElement,
		shellLaunchConfig: IShellLaunchConfig,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this._onDisposed = new Emitter<ITerminalTab>();

		const instance = instantiationService.createInstance(TerminalInstance,
			terminalFocusContextKey,
			configHelper,
			container,
			shellLaunchConfig);
		this._terminalInstances.push(instance);
		instance.addDisposable(instance.onDisposed(instance => this._onInstanceDisposed(instance)));
	}

	private _onInstanceDisposed(instance: ITerminalInstance): void {

		// TODO: Listen for disposed on TerminalService and handle appropriately (remove the tab and its instance from the service)

		this._onDisposed.fire(this);
		this._terminalInstances = [];
	}

	public addDisposable(disposable: IDisposable): void {
		this._disposables.push(disposable);
	}
}
