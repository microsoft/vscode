/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableWindowInterval } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { randomPort } from '../../../../base/common/ports.js';
import * as nls from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier, ExtensionIdentifierMap } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { RuntimeExtensionsInput } from '../common/runtimeExtensionsInput.js';
import { IExtensionHostProfileService, ProfileSessionState } from './runtimeExtensionsEditor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { IExtensionHostProfile, IExtensionService, ProfileSession } from '../../../services/extensions/common/extensions.js';
import { ExtensionHostProfiler } from '../../../services/extensions/electron-sandbox/extensionHostProfiler.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { URI } from '../../../../base/common/uri.js';

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

	public lastProfileSavedTo: URI | undefined;
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
		this.lastProfileSavedTo = undefined;
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
