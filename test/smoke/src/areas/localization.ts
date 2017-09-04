/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';

export enum ViewletType {
	SEARCH = 0,
	SCM = 1,
	DEBUG = 2,
	EXTENSIONS = 3
}

export class Localization {

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public async getOpenEditorsText(): Promise<string> {
		let explorerTitles;
		try {
			explorerTitles = await this.spectron.client.getText('div[id="workbench.view.explorer"] .title span');
		} catch (e) {
			return Promise.reject('Failed to get span of title in explorer viewlet.');
		}

		return explorerTitles[0];
	}

	public async openViewlet(type: ViewletType): Promise<any> {
		let command;

		switch (type) {
			case ViewletType.SEARCH:
				command = 'workbench.view.search';
				break;
			case ViewletType.SCM:
				command = 'workbench.view.scm';
				break;
			case ViewletType.DEBUG:
				command = 'workbench.view.debug';
				break;
			case ViewletType.EXTENSIONS:
				command = 'workbench.view.extensions';
				break;
		}

		await this.spectron.command(command, false);
		return this.spectron.wait();
	}

	public getOpenedViewletTitle(): Promise<string> {
		try {
			return this.spectron.client.getText('div[id="workbench.parts.sidebar"] .title-label span');
		} catch (e) {
			return Promise.reject('Failed to get span of title label in explorer viewlet.');
		}
	}

	public getExtensionsSearchPlaceholder(): Promise<string> {
		try {
			return this.spectron.client.getAttribute('div[id="workbench.view.extensions"] .search-box', 'placeholder');
		} catch (e) {
			return Promise.reject('Failed to get extension viewlet search box placeholder.');
		}
	}

}
