/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WebviewThemeDataProvider } from '../../../webview/browser/themeing.js';

export class HelpProxyManager {
	private _proxyServers = new Map<string, string>();
	private _stylesSet = false;

	constructor(
		private readonly _commandService: ICommandService,
		private readonly _instantiationService: IInstantiationService
	) { }

	async activateProxyServer(targetOrigin: string): Promise<string | undefined> {
		let proxyOrigin = this._proxyServers.get(targetOrigin);
		if (proxyOrigin) {
			return proxyOrigin;
		}

		if (!this._stylesSet) {
			await this.applyCurrentTheme();
		}

		proxyOrigin = await this._commandService.executeCommand<string>(
			'erdosProxy.startHelpProxyServer',
			targetOrigin
		);

		if (proxyOrigin) {
			this._proxyServers.set(targetOrigin, proxyOrigin);
		}

		return proxyOrigin;
	}

	async applyCurrentTheme(): Promise<void> {
		const provider = this._instantiationService.createInstance(WebviewThemeDataProvider);
		const { styles } = provider.getWebviewThemeData();
		provider.dispose();

		await this._commandService.executeCommand(
			'erdosProxy.setHelpProxyServerStyles',
			styles
		);
		this._stylesSet = true;
	}

	async deactivateProxyServer(targetOrigin: string): Promise<void> {
		if (this._proxyServers.has(targetOrigin)) {
			await this._commandService.executeCommand(
				'erdosProxy.stopProxyServer',
				targetOrigin
			);
			this._proxyServers.delete(targetOrigin);
		}
	}
}


