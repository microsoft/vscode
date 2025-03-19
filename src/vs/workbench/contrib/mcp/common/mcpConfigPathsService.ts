/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { mcpConfigurationSection } from './mcpConfiguration.js';
import { McpCollectionSortOrder } from './mcpTypes.js';

export interface IMcpConfigPath {
	/** Configuration scope that maps to this path.  */
	key: 'userLocalValue' | 'userRemoteValue' | 'workspaceValue';
	/** Display name */
	label: string;
	/** Storage where associated data should be stored. */
	scope: StorageScope;
	/** Configuration target that correspond to this file */
	target: ConfigurationTarget;
	/** Associated workspace folder, for workspace folder values */
	folder?: IWorkspaceFolder;
	/** Order in which the configuration should be displayed */
	order: number;
	/** Config's remote authority */
	remoteAuthority?: string;
	/** Config file URI. */
	uri: URI | undefined;
	/** When MCP config is nested in a config file, the parent nested key. */
	section?: string;
}

export interface IMcpConfigPathsService {
	_serviceBrand: undefined;

	readonly onDidAddPath: Event<IMcpConfigPath>;
	readonly paths: readonly IMcpConfigPath[];
}

export const IMcpConfigPathsService = createDecorator<IMcpConfigPathsService>('IMcpConfigPathsService');

export class McpConfigPathsService extends Disposable implements IMcpConfigPathsService {
	_serviceBrand: undefined;

	private readonly _onDidAddPath = this._register(new Emitter<IMcpConfigPath>());
	public readonly onDidAddPath = this._onDidAddPath.event;

	public readonly paths: IMcpConfigPath[] = [];

	constructor(

		@IProductService productService: IProductService,
		@ILabelService labelService: ILabelService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IPreferencesService preferencesService: IPreferencesService,
	) {
		super();

		this.paths.push(
			{
				key: 'userLocalValue',
				target: ConfigurationTarget.USER_LOCAL,
				label: localize('mcp.configuration.userLocalValue', 'Global in {0}', productService.nameShort),
				scope: StorageScope.PROFILE,
				order: McpCollectionSortOrder.User,
				uri: preferencesService.userSettingsResource,
				section: mcpConfigurationSection,
			},
			{
				key: 'workspaceValue',
				target: ConfigurationTarget.WORKSPACE,
				label: localize('mcp.configuration.workspaceValue', 'From your workspace'),
				scope: StorageScope.WORKSPACE,
				order: McpCollectionSortOrder.Workspace,
				uri: preferencesService.workspaceSettingsResource ? URI.joinPath(preferencesService.workspaceSettingsResource, '../mcp.json') : undefined,
			},
		);

		remoteAgentService.getEnvironment().then((env) => {
			const label = environmentService.remoteAuthority ? labelService.getHostLabel(Schemas.vscodeRemote, environmentService.remoteAuthority) : 'Remote';

			this._addPath({
				key: 'userRemoteValue',
				target: ConfigurationTarget.USER_REMOTE,
				label: localize('mcp.configuration.userRemoteValue', 'From {0}', label),
				scope: StorageScope.PROFILE,
				order: McpCollectionSortOrder.User + McpCollectionSortOrder.RemotePenalty,
				uri: env?.settingsPath,
				remoteAuthority: environmentService.remoteAuthority,
				section: mcpConfigurationSection,
			});
		});
	}

	private _addPath(path: IMcpConfigPath): void {
		this.paths.push(path);
		this._onDidAddPath.fire(path);
	}
}
