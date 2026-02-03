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
import { IExtensionHostDebugService } from '../../../../platform/debug/common/extensionHostDebug.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { IExtensionService, IExtensionInspectInfo } from '../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IConfig, IDebugService } from '../../debug/common/debug.js';
import { RuntimeExtensionsEditor } from './runtimeExtensionsEditor.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';

interface IExtensionHostQuickPickItem extends IQuickPickItem {
	portInfo: IExtensionInspectInfo;
}

// Shared helpers for debug actions
async function getExtensionHostPort(
	extensionService: IExtensionService,
	nativeHostService: INativeHostService,
	dialogService: IDialogService,
	productService: IProductService,
): Promise<number | undefined> {
	const inspectPorts = await extensionService.getInspectPorts(ExtensionHostKind.LocalProcess, false);
	if (inspectPorts.length === 0) {
		const res = await dialogService.confirm({
			message: nls.localize('restart1', "Debug Extensions"),
			detail: nls.localize('restart2', "In order to debug extensions a restart is required. Do you want to restart '{0}' now?", productService.nameLong),
			primaryButton: nls.localize({ key: 'restart3', comment: ['&& denotes a mnemonic'] }, "&&Restart")
		});
		if (res.confirmed) {
			await nativeHostService.relaunch({ addArgs: [`--inspect-extensions=${randomPort()}`] });
		}
		return undefined;
	}
	if (inspectPorts.length > 1) {
		console.warn(`There are multiple extension hosts available for debugging. Picking the first one...`);
	}
	return inspectPorts[0].port;
}

async function getRendererDebugPort(
	extensionHostDebugService: IExtensionHostDebugService,
	windowId: number,
): Promise<number | undefined> {
	const result = await extensionHostDebugService.attachToCurrentWindowRenderer(windowId);
	return result.success ? result.port : undefined;
}

export class DebugExtensionHostInDevToolsAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.extensions.action.devtoolsExtensionHost',
			title: nls.localize2('openDevToolsForExtensionHost', 'Debug Extension Host In Dev Tools'),
			category: Categories.Developer,
			f1: true,
			icon: Codicon.debugStart,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const extensionService = accessor.get(IExtensionService);
		const nativeHostService = accessor.get(INativeHostService);
		const quickInputService = accessor.get(IQuickInputService);

		const inspectPorts = await extensionService.getInspectPorts(ExtensionHostKind.LocalProcess, true);

		if (inspectPorts.length === 0) {
			console.log('[devtoolsExtensionHost] No extension host inspect ports found.');
			return;
		}

		const items: IExtensionHostQuickPickItem[] = inspectPorts.filter(portInfo => portInfo.devtoolsUrl).map(portInfo => ({
			label: portInfo.devtoolsLabel ?? `${portInfo.host}:${portInfo.port}`,
			detail: `${portInfo.host}:${portInfo.port}`,
			portInfo: portInfo
		}));

		if (items.length === 1) {
			const portInfo = items[0].portInfo;
			nativeHostService.openDevToolsWindow(portInfo.devtoolsUrl!);
			return;
		}

		const selected = await quickInputService.pick<IExtensionHostQuickPickItem>(items, {
			placeHolder: nls.localize('selectExtensionHost', "Pick extension host"),
			matchOnDetail: true,
		});

		if (selected) {
			const portInfo = selected.portInfo;
			nativeHostService.openDevToolsWindow(portInfo.devtoolsUrl!);
		}
	}
}

export class DebugExtensionHostInNewWindowAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.extensions.action.debugExtensionHost',
			title: nls.localize2('debugExtensionHost', "Debug Extension Host In New Window"),
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

	async run(accessor: ServicesAccessor): Promise<void> {
		const extensionService = accessor.get(IExtensionService);
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);
		const productService = accessor.get(IProductService);
		const instantiationService = accessor.get(IInstantiationService);
		const hostService = accessor.get(IHostService);

		const port = await getExtensionHostPort(extensionService, nativeHostService, dialogService, productService);
		if (port === undefined) {
			return;
		}

		const storage = instantiationService.createInstance(Storage);
		storage.storeDebugOnNewWindow(port);
		hostService.openWindow();
	}
}

export class DebugRendererInNewWindowAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.debugRenderer',
			title: nls.localize2('debugRenderer', "Debug Renderer In New Window"),
			category: Categories.Developer,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const extensionHostDebugService = accessor.get(IExtensionHostDebugService);
		const environmentService = accessor.get(INativeWorkbenchEnvironmentService);
		const instantiationService = accessor.get(IInstantiationService);
		const hostService = accessor.get(IHostService);

		const port = await getRendererDebugPort(extensionHostDebugService, environmentService.window.id);
		if (port === undefined) {
			return;
		}

		const storage = instantiationService.createInstance(Storage);
		storage.storeRendererDebugOnNewWindow(port);
		hostService.openWindow();
	}
}

export class DebugExtensionHostAndRendererAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.debugExtensionHostAndRenderer',
			title: nls.localize2('debugExtensionHostAndRenderer', "Debug Extension Host and Renderer In New Window"),
			category: Categories.Developer,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const extensionService = accessor.get(IExtensionService);
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);
		const productService = accessor.get(IProductService);
		const extensionHostDebugService = accessor.get(IExtensionHostDebugService);
		const environmentService = accessor.get(INativeWorkbenchEnvironmentService);
		const instantiationService = accessor.get(IInstantiationService);
		const hostService = accessor.get(IHostService);

		const [extHostPort, rendererPort] = await Promise.all([
			getExtensionHostPort(extensionService, nativeHostService, dialogService, productService),
			getRendererDebugPort(extensionHostDebugService, environmentService.window.id)
		]);

		if (extHostPort === undefined || rendererPort === undefined) {
			return;
		}

		const storage = instantiationService.createInstance(Storage);
		storage.storeDebugOnNewWindow(extHostPort);
		storage.storeRendererDebugOnNewWindow(rendererPort);
		hostService.openWindow();
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

	storeRendererDebugOnNewWindow(targetPort: number) {
		this._storageService.store('debugRenderer.debugPort', targetPort, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	getAndDeleteRendererDebugPortIfSet(): number | undefined {
		const port = this._storageService.getNumber('debugRenderer.debugPort', StorageScope.APPLICATION);
		if (port !== undefined) {
			this._storageService.remove('debugRenderer.debugPort', StorageScope.APPLICATION);
		}
		return port;
	}
}

const defaultDebugConfig = {
	trace: true,
	resolveSourceMapLocations: null,
	eagerSources: true,
	timeouts: {
		sourceMapMinPause: 30_000,
		sourceMapCumulativePause: 300_000,
	},
};

export class DebugExtensionsContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IDebugService private readonly _debugService: IDebugService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IProgressService _progressService: IProgressService,
	) {
		super();

		const storage = this._instantiationService.createInstance(Storage);
		const extHostPort = storage.getAndDeleteDebugPortIfSet();
		const rendererPort = storage.getAndDeleteRendererDebugPortIfSet();

		// Start both debug sessions in parallel
		const debugPromises: Promise<void>[] = [];

		if (extHostPort !== undefined) {
			debugPromises.push(_progressService.withProgress({
				location: ProgressLocation.Notification,
				title: nls.localize('debugExtensionHost.progress', "Attaching Debugger To Extension Host"),
			}, async () => {
				// eslint-disable-next-line local/code-no-dangerous-type-assertions
				await this._debugService.startDebugging(undefined, {
					type: 'node',
					name: nls.localize('debugExtensionHost.launch.name', "Attach Extension Host"),
					request: 'attach',
					port: extHostPort,
					...defaultDebugConfig,
				} as IConfig);
			}));
		}

		if (rendererPort !== undefined) {
			debugPromises.push(_progressService.withProgress({
				location: ProgressLocation.Notification,
				title: nls.localize('debugRenderer.progress', "Attaching Debugger To Renderer"),
			}, async () => {
				await this._debugService.startDebugging(undefined, {
					type: 'chrome',
					name: nls.localize('debugRenderer.launch.name', "Attach Renderer"),
					request: 'attach',
					port: rendererPort,
					...defaultDebugConfig,
				});
			}));
		}

		Promise.all(debugPromises);
	}
}
