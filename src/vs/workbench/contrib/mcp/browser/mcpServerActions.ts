/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { localize } from '../../../../nls.js';
import { IMcpServerContainer, IMcpWorkbenchService, IWorkbenchMcpServer } from '../common/mcpTypes.js';

export abstract class McpServerAction extends Action implements IMcpServerContainer {

	static readonly EXTENSION_ACTION_CLASS = 'mcp-server-action';
	static readonly TEXT_ACTION_CLASS = `${McpServerAction.EXTENSION_ACTION_CLASS} text`;
	static readonly LABEL_ACTION_CLASS = `${McpServerAction.EXTENSION_ACTION_CLASS} label`;
	static readonly PROMINENT_LABEL_ACTION_CLASS = `${McpServerAction.LABEL_ACTION_CLASS} prominent`;
	static readonly ICON_ACTION_CLASS = `${McpServerAction.EXTENSION_ACTION_CLASS} icon`;

	private _mcpServer: IWorkbenchMcpServer | null = null;
	get mcpServer(): IWorkbenchMcpServer | null { return this._mcpServer; }
	set mcpServer(mcpServer: IWorkbenchMcpServer | null) { this._mcpServer = mcpServer; this.update(); }

	abstract update(): void;
}

export class AddAction extends McpServerAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent install`;
	private static readonly HIDE = `${this.CLASS} hide`;

	constructor(
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
	) {
		super('extensions.install', localize('add', "Add"), AddAction.CLASS, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = AddAction.HIDE;
		if (!this.mcpServer) {
			return;
		}
		if (this.mcpServer.local) {
			return;
		}
		this.class = AddAction.CLASS;
		this.enabled = true;
		this.label = localize('add', "Add");
	}

	override async run(): Promise<any> {
		if (!this.mcpServer) {
			return;
		}
		await this.mcpWorkbenchService.install(this.mcpServer);
	}
}
