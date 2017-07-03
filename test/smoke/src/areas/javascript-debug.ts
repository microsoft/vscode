/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';
var stripJsonComments = require('strip-json-comments');

export class JavaScriptDebug {
	private readonly sidebarSelector = '.margin-view-overlays';

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public openDebugViewlet(): Promise<any> {
		return this.spectron.command('workbench.view.debug');
	}

	public async pressConfigureLaunchJson(): Promise<any> {
		try {
			await this.spectron.waitFor(this.spectron.client.click, 'ul[aria-label="Debug actions"] .action-label.icon.debug-action.configure');
		} catch (e) {
			return Promise.reject('Clicking on debug configuration gear failed.');
		}
		await this.spectron.wait();
		await this.spectron.client.keys(['ArrowDown', 'NULL', 'Enter']);
		return this.spectron.wait();
	}

	public async getProgramConfigValue(): Promise<any> {
		const lines = stripJsonComments(await this.spectron.client.getText('.view-lines'));
		const json = JSON.parse(lines);
		return json.configurations[0].program;
	}

	public setBreakpointOnLine(lineNumber: number): Promise<any> {
		try {
			return this.spectron.client.leftClick(`${this.sidebarSelector}>:nth-child(${lineNumber})`, 5, 5);
		} catch (e) {
			return Promise.reject('Setting breakpoint failed: ' + e);
		}
	}

	public async verifyBreakpointOnLine(lineNumber: number): Promise<any> {
		let el = await this.spectron.client.element(`${this.sidebarSelector}>:nth-child(${lineNumber}) .cgmr.debug-breakpoint-glyph`);
		if (el.status === 0) {
			return el;
		}

		return undefined;
	}
}