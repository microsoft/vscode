/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { randomPort } from '../../../../base/common/ports.js';
import * as nls from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IConfig, IDebugService } from '../../debug/common/debug.js';
import { RuntimeExtensionsEditor } from './runtimeExtensionsEditor.js';

export class DebugExtensionHostAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.extensions.action.debugExtensionHost',
			title: { value: nls.localize('debugExtensionHost', "Start Debugging Extension Host In New Window"), original: 'Start Debugging Extension Host In New Window' },
			category: Categories.Developer,
			f1: true,
			icon: Codicon.debugStart,
			menu: {
				id: MenuId.EditorTitle,
				when: ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID),
				group: 'navigation',
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);
		const extensionService = accessor.get(IExtensionService);
		const productService = accessor.get(IProductService);
		const instantiationService = accessor.get(IInstantiationService);
		const hostService = accessor.get(IHostService);

		extensionService.getInspectPorts(ExtensionHostKind.LocalProcess, false).then(async inspectPorts => {
			if (inspectPorts.length === 0) {
				const res = await dialogService.confirm({
					message: nls.localize('restart1', "Debug Extensions"),
					detail: nls.localize('restart2', "In order to debug extensions a restart is required. Do you want to restart '{0}' now?", productService.nameLong),
					primaryButton: nls.localize({ key: 'restart3', comment: ['&& denotes a mnemonic'] }, "&&Restart")
				});
				if (res.confirmed) {
					await nativeHostService.relaunch({ addArgs: [`--inspect-extensions=${randomPort()}`] });
				}
				return;
			}

			if (inspectPorts.length > 1) {
				// TODO
				console.warn(`There are multiple extension hosts available for debugging. Picking the first one...`);
			}

			const s = instantiationService.createInstance(Storage);
			s.storeDebugOnNewWindow(inspectPorts[0].port);

			hostService.openWindow();
		});
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
				// eslint-disable-next-line local/code-no-dangerous-type-assertions
				await this._debugService.startDebugging(undefined, {
					type: 'node',
					name: nls.localize('debugExtensionHost.launch.name', "Attach Extension Host"),
					request: 'attach',
					port,
					trace: true,
					// resolve source maps everywhere:
					resolveSourceMapLocations: null,
					// announces sources eagerly for the loaded scripts view:
					eagerSources: true,
					// source maps of published VS Code are on the CDN and can take a while to load
					timeouts: {
						sourceMapMinPause: 30_000,
						sourceMapCumulativePause: 300_000,
					},
				} as IConfig);
			});
		}
	}
}
