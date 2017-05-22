/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';

export class JavaScriptDebug {
	private readonly sidebarSelector = '.margin-view-overlays';

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public openDebugViewlet(): Promise<any> {
		return this.spectron.command('workbench.view.debug');
	}

	public async pressConfigureLaunchJson(): Promise<any> {
		await this.spectron.waitFor(this.spectron.client.click, 'ul[aria-label="Debug actions"] .action-label.icon.debug-action.configure');
		await this.spectron.wait();
		await this.spectron.client.keys(['ArrowDown', 'NULL', 'Enter']);
		return this.spectron.wait();
	}

	public getProgramConfigValue(): Promise<any> {
		return this.spectron.client.getText('.view-lines>:nth-child(11) .mtk7');
	}

	public setBreakpointOnLine(lineNumber: number): Promise<any> {
		return this.spectron.client.leftClick(`${this.sidebarSelector}>:nth-child(${lineNumber})`, 5, 5);
	}

	public async verifyBreakpointOnLine(lineNumber: number): Promise<any> {
		let el = await this.spectron.client.element(`${this.sidebarSelector}>:nth-child(${lineNumber}) .cgmr.debug-breakpoint-glyph`);
		if (el.status === 0) {
			return el;
		}

		return undefined;
	}
}