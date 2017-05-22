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
		const explorerTitles = await this.spectron.client.getText('div[id="workbench.view.explorer"] .title span');
		return explorerTitles[0];
	}

	public openViewlet(type: ViewletType): Promise<any> {
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

		return this.spectron.command(command, false);
	}

	public getOpenedViewletTitle(): Promise<string> {
		return this.spectron.client.getText('div[id="workbench.parts.sidebar"] .title-label span');
	}

	public getExtensionsSearchPlaceholder(): Promise<string> {
		return this.spectron.client.getAttribute('div[id="workbench.view.extensions"] .search-box', 'placeholder');
	}

}