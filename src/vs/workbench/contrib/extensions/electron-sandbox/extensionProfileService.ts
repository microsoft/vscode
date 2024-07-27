/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableWindowInterval } from 'vs/base/browser/dom';
import { mainWindow } from 'vs/base/browser/window';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { randomPort } from 'vs/base/common/ports';
import * as nls from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ExtensionIdentifier, ExtensionIdentifierMap } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INativeHostService } from 'vs/platform/native/common/native';
import { IProductService } from 'vs/platform/product/common/productService';
import { RuntimeExtensionsInput } from 'vs/workbench/contrib/extensions/common/runtimeExtensionsInput';
import { IExtensionHostProfileService, ProfileSessionState } from 'vs/workbench/contrib/extensions/electron-sandbox/runtimeExtensionsEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ExtensionHostKind } from 'vs/workbench/services/extensions/common/extensionHostKind';
import { IExtensionHostProfile, IExtensionService, ProfileSession } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionHostProfiler } from 'vs/workbench/services/extensions/electron-sandbox/extensionHostProfiler';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';

export class ExtensionHostProfileService extends Disposable implements IExtensionHostProfileService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeState: Event<void> = this._onDidChangeState.event;

	private readonly _onDidChangeLastProfile: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeLastProfile: Event<void> = this._onDidChangeLastProfile.event;

	private readonly _unresponsiveProfiles = new ExtensionIdentifierMap<IExtensionHostProfile>();
	private _profile: IExtensionHostProfile | null;
	private _profileSession: ProfileSession | null;
	private _state: ProfileSessionState = ProfileSessionState.None;

	private profilingStatusBarIndicator: IStatusbarEntryAccessor | undefined;
	private readonly profilingStatusBarIndicatorLabelUpdater = this._register(new MutableDisposable());

	public get state() { return this._state; }
	public get lastProfile() { return this._profile; }

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
		@IProductService private readonly _productService: IProductService
	) {
		super();
		this._profile = null;
		this._profileSession = null;
		this._setState(ProfileSessionState.None);

		CommandsRegistry.registerCommand('workbench.action.extensionHostProfiler.stop', () => {
			this.stopProfiling();
			this._editorService.openEditor(RuntimeExtensionsInput.instance, { pinned: true });
		});
	}

	private _setState(state: ProfileSessionState): void {
		if (this._state === state) {
			return;
		}
		this._state = state;

		if (this._state === ProfileSessionState.Running) {
			this.updateProfilingStatusBarIndicator(true);
		} else if (this._state === ProfileSessionState.Stopping) {
			this.updateProfilingStatusBarIndicator(false);
		}

		this._onDidChangeState.fire(undefined);
	}

	private updateProfilingStatusBarIndicator(visible: boolean): void {
		this.profilingStatusBarIndicatorLabelUpdater.clear();

		if (visible) {
			const indicator: IStatusbarEntry = {
				name: nls.localize('status.profiler', "Extension Profiler"),
				text: nls.localize('profilingExtensionHost', "Profiling Extension Host"),
				showProgress: true,
				ariaLabel: nls.localize('profilingExtensionHost', "Profiling Extension Host"),
				tooltip: nls.localize('selectAndStartDebug', "Click to stop profiling."),
				command: 'workbench.action.extensionHostProfiler.stop'
			};

			const timeStarted = Date.now();
			const handle = disposableWindowInterval(mainWindow, () => {
				this.profilingStatusBarIndicator?.update({ ...indicator, text: nls.localize('profilingExtensionHostTime', "Profiling Extension Host ({0} sec)", Math.round((new Date().getTime() - timeStarted) / 1000)), });
			}, 1000);
			this.profilingStatusBarIndicatorLabelUpdater.value = handle;

			if (!this.profilingStatusBarIndicator) {
				this.profilingStatusBarIndicator = this._statusbarService.addEntry(indicator, 'status.profiler', StatusbarAlignment.RIGHT);
			} else {
				this.profilingStatusBarIndicator.update(indicator);
			}
		} else {
			if (this.profilingStatusBarIndicator) {
				this.profilingStatusBarIndicator.dispose();
				this.profilingStatusBarIndicator = undefined;
			}
		}
	}

	public async startProfiling(): Promise<any> {
		if (this._state !== ProfileSessionState.None) {
			return null;
		}

		const inspectPorts = await this._extensionService.getInspectPorts(ExtensionHostKind.LocalProcess, true);

		if (inspectPorts.length === 0) {
			return this._dialogService.confirm({
				type: 'info',
				message: nls.localize('restart1', "Profile Extensions"),
				detail: nls.localize('restart2', "In order to profile extensions a restart is required. Do you want to restart '{0}' now?", this._productService.nameLong),
				primaryButton: nls.localize({ key: 'restart3', comment: ['&& denotes a mnemonic'] }, "&&Restart")
			}).then(res => {
				if (res.confirmed) {
					this._nativeHostService.relaunch({ addArgs: [`--inspect-extensions=${randomPort()}`] });
				}
			});
		}

		if (inspectPorts.length > 1) {
			// TODO
			console.warn(`There are multiple extension hosts available for profiling. Picking the first one...`);
		}

		this._setState(ProfileSessionState.Starting);

		return this._instantiationService.createInstance(ExtensionHostProfiler, inspectPorts[0].host, inspectPorts[0].port).start().then((value) => {
			this._profileSession = value;
			this._setState(ProfileSessionState.Running);
		}, (err) => {
			onUnexpectedError(err);
			this._setState(ProfileSessionState.None);
		});
	}

	public stopProfiling(): void {
		if (this._state !== ProfileSessionState.Running || !this._profileSession) {
			return;
		}

		this._setState(ProfileSessionState.Stopping);
		this._profileSession.stop().then((result) => {
			this._setLastProfile(result);
			this._setState(ProfileSessionState.None);
		}, (err) => {
			onUnexpectedError(err);
			this._setState(ProfileSessionState.None);
		});
		this._profileSession = null;
	}

	private _setLastProfile(profile: IExtensionHostProfile) {
		this._profile = profile;
		this._onDidChangeLastProfile.fire(undefined);
	}

	getUnresponsiveProfile(extensionId: ExtensionIdentifier): IExtensionHostProfile | undefined {
		return this._unresponsiveProfiles.get(extensionId);
	}

	setUnresponsiveProfile(extensionId: ExtensionIdentifier, profile: IExtensionHostProfile): void {
		this._unresponsiveProfiles.set(extensionId, profile);
		this._setLastProfile(profile);
	}

}
