/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { FOLDER_SETTINGS_PATH, IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { mcpConfigurationSection } from './mcpConfiguration.js';
import { McpCollectionSortOrder } from './mcpTypes.js';

export interface IMcpConfigPath {
	/** Short, unique ID for this config. */
	id: string;
	/** Configuration scope that maps to this path.  */
	key: 'userLocalValue' | 'userRemoteValue' | 'workspaceValue' | 'workspaceFolderValue';
	/** Display name */
	label: string;
	/** Storage where associated data should be stored. */
	scope: StorageScope;
	/** Configuration target that correspond to this file */
	target: ConfigurationTarget;
	/** Order in which the configuration should be displayed */
	order: number;
	/** Config's remote authority */
	remoteAuthority?: string;
	/** Config file URI. */
	uri: URI | undefined;
	/** When MCP config is nested in a config file, the parent nested key. */
	section?: string[];
	/** Workspace folder, when the config refers to a workspace folder value. */
	workspaceFolder?: IWorkspaceFolder;
}

export interface IMcpConfigPathsService {
	_serviceBrand: undefined;

	readonly paths: IObservable<readonly IMcpConfigPath[]>;
}

export const IMcpConfigPathsService = createDecorator<IMcpConfigPathsService>('IMcpConfigPathsService');

export class McpConfigPathsService extends Disposable implements IMcpConfigPathsService {
	_serviceBrand: undefined;

	private readonly _paths: ISettableObservable<readonly IMcpConfigPath[]>;

	public get paths(): IObservable<readonly IMcpConfigPath[]> {
		return this._paths;
	}

	constructor(
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IProductService productService: IProductService,
		@ILabelService labelService: ILabelService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IPreferencesService preferencesService: IPreferencesService,
	) {
		super();

		const workspaceConfig = workspaceContextService.getWorkspace().configuration;
		const initialPaths: (IMcpConfigPath | undefined | null)[] = [
			{
				id: 'usrlocal',
				key: 'userLocalValue',
				target: ConfigurationTarget.USER_LOCAL,
				label: localize('mcp.configuration.userLocalValue', 'Global in {0}', productService.nameShort),
				scope: StorageScope.PROFILE,
				order: McpCollectionSortOrder.User,
				uri: preferencesService.userSettingsResource,
				section: [mcpConfigurationSection],
			},
			workspaceConfig && {
				id: 'workspace',
				key: 'workspaceValue',
				target: ConfigurationTarget.WORKSPACE,
				label: basename(workspaceConfig),
				scope: StorageScope.WORKSPACE,
				order: McpCollectionSortOrder.Workspace,
				remoteAuthority: _environmentService.remoteAuthority,
				uri: workspaceConfig,
				section: ['settings', mcpConfigurationSection],
			},
			...workspaceContextService.getWorkspace()
				.folders
				.map(wf => this._fromWorkspaceFolder(wf))
		];

		this._paths = observableValue('mcpConfigPaths', initialPaths.filter(isDefined));

		remoteAgentService.getEnvironment().then((env) => {
			const label = _environmentService.remoteAuthority ? labelService.getHostLabel(Schemas.vscodeRemote, _environmentService.remoteAuthority) : 'Remote';

			this._paths.set([
				...this.paths.get(),
				{
					id: 'usrremote',
					key: 'userRemoteValue',
					target: ConfigurationTarget.USER_REMOTE,
					label,
					scope: StorageScope.PROFILE,
					order: McpCollectionSortOrder.User + McpCollectionSortOrder.RemoteBoost,
					uri: env?.settingsPath,
					remoteAuthority: _environmentService.remoteAuthority,
					section: [mcpConfigurationSection],
				}
			], undefined);
		});

		this._register(workspaceContextService.onDidChangeWorkspaceFolders(e => {
			const next = this._paths.get().slice();
			for (const folder of e.added) {
				next.push(this._fromWorkspaceFolder(folder));
			}
			for (const folder of e.removed) {
				const idx = next.findIndex(c => c.workspaceFolder === folder);
				if (idx !== -1) {
					next.splice(idx, 1);
				}
			}
			this._paths.set(next, undefined);
		}));
	}

	private _fromWorkspaceFolder(workspaceFolder: IWorkspaceFolder): IMcpConfigPath {
		return {
			id: `wf${workspaceFolder.index}`,
			key: 'workspaceFolderValue',
			target: ConfigurationTarget.WORKSPACE_FOLDER,
			label: `${workspaceFolder.name}/.vscode/mcp.json`,
			scope: StorageScope.WORKSPACE,
			remoteAuthority: this._environmentService.remoteAuthority,
			order: McpCollectionSortOrder.WorkspaceFolder,
			uri: URI.joinPath(workspaceFolder.uri, FOLDER_SETTINGS_PATH, '../mcp.json'),
			workspaceFolder,
		};
	}
}
