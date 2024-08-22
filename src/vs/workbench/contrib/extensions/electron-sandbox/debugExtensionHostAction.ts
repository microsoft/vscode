/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions';
import { Disposable } from '../../../../base/common/lifecycle';
import { randomPort } from '../../../../base/common/ports';
import * as nls from '../../../../nls';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { INativeHostService } from '../../../../platform/native/common/native';
import { IProductService } from '../../../../platform/product/common/productService';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage';
import { IWorkbenchContribution } from '../../../common/contributions';
import { IDebugService } from '../../debug/common/debug';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind';
import { IExtensionService } from '../../../services/extensions/common/extensions';
import { IHostService } from '../../../services/host/browser/host';

export class DebugExtensionHostAction extends Action {
	static readonly ID = 'workbench.extensions.action.debugExtensionHost';
	static readonly LABEL = nls.localize('debugExtensionHost', "Start Debugging Extension Host In New Window");
	static readonly CSS_CLASS = 'debug-extension-host';

	constructor(
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IProductService private readonly productService: IProductService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IHostService private readonly _hostService: IHostService,
	) {
		super(DebugExtensionHostAction.ID, DebugExtensionHostAction.LABEL, DebugExtensionHostAction.CSS_CLASS);
	}

	override async run(_args: unknown): Promise<any> {
		const inspectPorts = await this._extensionService.getInspectPorts(ExtensionHostKind.LocalProcess, false);
		if (inspectPorts.length === 0) {
			const res = await this._dialogService.confirm({
				message: nls.localize('restart1', "Debug Extensions"),
				detail: nls.localize('restart2', "In order to debug extensions a restart is required. Do you want to restart '{0}' now?", this.productService.nameLong),
				primaryButton: nls.localize({ key: 'restart3', comment: ['&& denotes a mnemonic'] }, "&&Restart")
			});
			if (res.confirmed) {
				await this._nativeHostService.relaunch({ addArgs: [`--inspect-extensions=${randomPort()}`] });
			}

			return;
		}

		if (inspectPorts.length > 1) {
			// TODO
			console.warn(`There are multiple extension hosts available for debugging. Picking the first one...`);
		}

		const s = this._instantiationService.createInstance(Storage);
		s.storeDebugOnNewWindow(inspectPorts[0].port);

		this._hostService.openWindow();
	}
}

class Storage {
	constructor(@IStorageService private readonly _storageService: IStorageService,) {
	}

	storeDebugOnNewWindow(targetPort: number) {
		this._storageService.store('debugExtensionHost.debugPort', targetPort, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	getAndDeleteDebugPortIfSet(): number | undefined {
		const port = this._storageService.getNumber('debugExtensionHost.debugPort', StorageScope.APPLICATION);
		if (port !== undefined) {
			this._storageService.remove('debugExtensionHost.debugPort', StorageScope.APPLICATION);
		}
		return port;
	}
}

export class DebugExtensionsContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IDebugService private readonly _debugService: IDebugService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IProgressService _progressService: IProgressService,
	) {
		super();

		const storage = this._instantiationService.createInstance(Storage);
		const port = storage.getAndDeleteDebugPortIfSet();
		if (port !== undefined) {
			_progressService.withProgress({
				location: ProgressLocation.Notification,
				title: nls.localize('debugExtensionHost.progress', "Attaching Debugger To Extension Host"),
			}, async p => {
				await this._debugService.startDebugging(undefined, {
					type: 'node',
					name: nls.localize('debugExtensionHost.launch.name', "Attach Extension Host"),
					request: 'attach',
					port,
				});
			});
		}
	}
}
