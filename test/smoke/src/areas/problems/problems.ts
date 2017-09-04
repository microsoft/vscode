/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export enum ProblemSeverity {
	WARNING = 0,
	ERROR = 1
};

export class Problems {

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public async showProblemsView(): Promise<any> {
		await this.spectron.command('workbench.actions.view.problems');
		await this.spectron.client.waitForElement('.panel.markers-panel');
	}

	public static getSelectorInProblemsView(problemType: ProblemSeverity): string {
		let selector = problemType === ProblemSeverity.WARNING ? 'warning' : 'error';
		return `div[aria-label="Problems grouped by files"] .icon.${selector}`;
	}

	public static getSelectorInEditor(problemType: ProblemSeverity): string {
		let selector = problemType === ProblemSeverity.WARNING ? 'greensquiggly' : 'redsquiggly';
		return `.view-overlays .cdr.${selector}`;
	}
}