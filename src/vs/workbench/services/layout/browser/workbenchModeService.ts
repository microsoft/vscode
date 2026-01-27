/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IWorkbenchModeConfiguration, IWorkbenchModeService } from '../common/workbenchModeService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { parse } from '../../../../base/common/json.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IConfigurationDefaults, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export class WorkbenchModeService extends Disposable implements IWorkbenchModeService {

	declare readonly _serviceBrand: undefined;

	private static readonly WORKBENCH_MODE_STORAGE_KEY = 'workbench.mode';

	private _workbenchMode: string | undefined;
	get workbenchMode(): string | undefined { return this._workbenchMode; }

	private readonly _onDidChangeWorkbenchMode = this._register(new Emitter<string | undefined>());
	readonly onDidChangeWorkbenchMode: Event<string | undefined> = this._onDidChangeWorkbenchMode.event;

	private readonly workbenchModeFileWatcherDiposables = this._register(new DisposableStore());
	private readonly configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	private configurationDefaults: IConfigurationDefaults | undefined;

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
		this._workbenchMode = this.workspaceContextService.getWorkspace().isAgentSessionsWorkspace
			? 'agent-sessions'
			: this.storageService.get(WorkbenchModeService.WORKBENCH_MODE_STORAGE_KEY, StorageScope.WORKSPACE);
		this.watchCurrentModeFile();
	}

	async initialize(): Promise<void> {
		return this.updateWorkbenchModeConfiguration();
	}

	private async updateWorkbenchModeConfiguration(): Promise<void> {
		const workbenchModeConfiguration = this._workbenchMode ? await this.getWorkbenchModeConfiguration(this._workbenchMode) : undefined;
		this.updateConfigurationDefaults(workbenchModeConfiguration?.settings);
	}

	private updateConfigurationDefaults(configurationDefaults: IStringDictionary<unknown> | undefined): void {
		if (this.configurationDefaults) {
			this.configurationRegistry.deregisterDefaultConfigurations([this.configurationDefaults]);
		}
		if (configurationDefaults) {
			this.configurationDefaults = { overrides: configurationDefaults, donotCache: true };
			this.configurationRegistry.registerDefaultConfigurations([this.configurationDefaults]);
		} else {
			this.configurationDefaults = undefined;
		}
	}

	private watchCurrentModeFile(): void {
		if (!this._workbenchMode) {
			this.workbenchModeFileWatcherDiposables.clear();
			return;
		}

		const workbenchModeFileUri = this.getWorkbenchModeFileUri(this._workbenchMode);
		if (!workbenchModeFileUri) {
			this.workbenchModeFileWatcherDiposables.clear();
			return;
		}

		this.workbenchModeFileWatcherDiposables.add(this.fileService.watch(workbenchModeFileUri));
		this.workbenchModeFileWatcherDiposables.add(this.fileService.onDidFilesChange(e => {
			if (e.affects(workbenchModeFileUri)) {
				this.updateWorkbenchModeConfiguration();
				this._onDidChangeWorkbenchMode.fire(this._workbenchMode);
			}
		}));
	}

	private getWorkbenchModeFileUri(layoutId: string): URI {
		return this.uriIdentityService.extUri.joinPath(this.environmentService.builtinWorkbenchModesHome, `${layoutId}.code-workbench-mode`);
	}

	async getWorkbenchModeConfiguration(id: string): Promise<IWorkbenchModeConfiguration | undefined> {
		const resource = this.getWorkbenchModeFileUri(id);
		return this.resolveWorkbenchModeConfiguration(resource);
	}

	async getWorkbenchModeConfigurations(): Promise<IWorkbenchModeConfiguration[]> {
		const result: IWorkbenchModeConfiguration[] = [];
		const workbenchModesFolder = this.environmentService.builtinWorkbenchModesHome;
		try {
			const stat = await this.fileService.resolve(workbenchModesFolder);
			if (!stat.children?.length) {
				return result;
			}
			for (const child of stat.children) {
				if (child.isDirectory) {
					continue;
				}
				const workbenchModeConfiguration = await this.resolveWorkbenchModeConfiguration(child.resource);
				if (workbenchModeConfiguration) {
					result.push(workbenchModeConfiguration);
				}
			}
		} catch (error) {
			this.logService.error(`Error while reading workbench mode files from ${workbenchModesFolder.toString()}`, error);
		}
		return result;
	}

	private async resolveWorkbenchModeConfiguration(workbenchConfigurationModeFile: URI): Promise<IWorkbenchModeConfiguration | undefined> {
		if (this.uriIdentityService.extUri.extname(workbenchConfigurationModeFile) !== '.code-workbench-mode') {
			return undefined;
		}
		try {
			const content = (await this.fileService.readFile(workbenchConfigurationModeFile)).value.toString();
			const name = this.uriIdentityService.extUri.basename(workbenchConfigurationModeFile);
			const workbenchModeConfiguration: IWorkbenchModeConfiguration = {
				id: name.substring(0, name.length - '.code-workbench-mode'.length),
				...parse(content)
			};
			return workbenchModeConfiguration;
		} catch (error) {
			this.logService.error(`Error while reading workbench mode file from ${workbenchConfigurationModeFile.toString()}`, error);
			return undefined;
		}
	}

	async setWorkbenchMode(modeId: string | undefined): Promise<void> {
		if (this.workspaceContextService.getWorkspace().isAgentSessionsWorkspace) {
			throw new Error('Cannot set workbench mode in an agent sessions workspace');
		}

		if (this._workbenchMode === modeId) {
			return;
		}

		this.updateWorkbenchMode(modeId);
		await this.updateWorkbenchModeConfiguration();
		this.watchCurrentModeFile();
		this._onDidChangeWorkbenchMode.fire(modeId);
	}

	private updateWorkbenchMode(modeId: string | undefined): void {
		this._workbenchMode = modeId;
		if (modeId === undefined) {
			this.storageService.remove(WorkbenchModeService.WORKBENCH_MODE_STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this.storageService.store(WorkbenchModeService.WORKBENCH_MODE_STORAGE_KEY, modeId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}
}
