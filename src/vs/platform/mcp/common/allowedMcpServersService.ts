/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import * as nls from '../../../nls.js';
import { createCommandUri, IMarkdownString, MarkdownString } from '../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { Emitter } from '../../../base/common/event.js';
import { IAllowedMcpServersService, IGalleryMcpServer, IInstallableMcpServer, ILocalMcpServer, mcpAccessConfig, McpAccessValue } from './mcpManagement.js';

export class AllowedMcpServersService extends Disposable implements IAllowedMcpServersService {

	_serviceBrand: undefined;

	private _onDidChangeAllowedMcpServers = this._register(new Emitter<void>());
	readonly onDidChangeAllowedMcpServers = this._onDidChangeAllowedMcpServers.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(mcpAccessConfig)) {
				this._onDidChangeAllowedMcpServers.fire();
			}
		}));
	}

	isAllowed(mcpServer: IGalleryMcpServer | ILocalMcpServer | IInstallableMcpServer): true | IMarkdownString {
		if (this.configurationService.getValue(mcpAccessConfig) !== McpAccessValue.None) {
			return true;
		}

		const settingsCommandLink = createCommandUri('workbench.action.openSettings', { query: `@id:${mcpAccessConfig}` }).toString();
		return new MarkdownString(nls.localize('mcp servers are not allowed', "Model Context Protocol servers are disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink));
	}
}
