/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export enum ProblemSeverity {
	WARNING = 0,
	ERROR = 1
}

export class Problems {

	static PROBLEMS_VIEW_SELECTOR = '.panel.markers-panel';

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public async showProblemsView(): Promise<any> {
		if (!await this.isVisible()) {
			await this.spectron.runCommand('workbench.actions.view.problems');
			await this.waitForProblemsView();
		}
	}

	public async hideProblemsView(): Promise<any> {
		if (await this.isVisible()) {
			await this.spectron.runCommand('workbench.actions.view.problems');
			await this.spectron.client.waitForElement(Problems.PROBLEMS_VIEW_SELECTOR, el => !el);
		}
	}

	public async isVisible(): Promise<boolean> {
		const element = await this.spectron.client.element(Problems.PROBLEMS_VIEW_SELECTOR);
		return !!element;
	}

	public async waitForProblemsView(): Promise<void> {
		await this.spectron.client.waitForElement(Problems.PROBLEMS_VIEW_SELECTOR);
	}

	public static getSelectorInProblemsView(problemType: ProblemSeverity): string {
		let selector = problemType === ProblemSeverity.WARNING ? 'warning' : 'error';
		return `div[aria-label="Problems grouped by files"] .icon.${selector}`;
	}

	public static getSelectorInEditor(problemType: ProblemSeverity): string {
		let selector = problemType === ProblemSeverity.WARNING ? 'squiggly-c-warning' : 'squiggly-d-error';
		return `.view-overlays .cdr.${selector}`;
	}
}
