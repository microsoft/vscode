/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { Viewlet } from '../workbench/viewlet';

const VIEWLET = 'div[id="workbench.view.debug"]';
const DEBUG_VIEW = `${VIEWLET} .debug-view-content`;
const CONFIGURE = `div[id="workbench.parts.sidebar"] .actions-container .configure`;
const START = `.icon[title="Start Debugging"]`;
const GLYPH_AREA = '.margin-view-overlays>:nth-child';
const BREAKPOINT_GLYPH = '.debug-breakpoint-glyph';
const TOOLBAR = `.debug-actions-widget`;

export class Debug extends Viewlet {

	constructor(spectron: SpectronApplication) {
		super(spectron);
	}

	async openDebugViewlet(): Promise<any> {
		await this.spectron.command('workbench.view.debug');
		await this.spectron.client.waitForElement(DEBUG_VIEW);
	}

	async configure(): Promise<any> {
		await this.spectron.client.click(CONFIGURE);
		await this.spectron.workbench.waitForEditorFocus('launch.json');
	}

	async setBreakpointOnLine(lineNumber: number): Promise<any> {
		await this.spectron.client.leftClick(`${GLYPH_AREA}(${lineNumber})`, 5, 5);
		await this.spectron.client.waitForElement(BREAKPOINT_GLYPH);
	}

	async startDebugging(): Promise<any> {
		await this.spectron.client.click(START);
		await this.spectron.client.waitForElement(TOOLBAR);
	}
}