/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Commands } from '../workbench/workbench';
import { Code } from '../../vscode/code';

export enum ProblemSeverity {
	WARNING = 0,
	ERROR = 1
}

export class Problems {

	static PROBLEMS_VIEW_SELECTOR = '.panel.markers-panel';

	constructor(private code: Code, private commands: Commands) {
		// noop
	}

	public async showProblemsView(): Promise<any> {
		if (!await this.isVisible()) {
			await this.commands.runCommand('workbench.actions.view.problems');
			await this.waitForProblemsView();
		}
	}

	public async hideProblemsView(): Promise<any> {
		if (await this.isVisible()) {
			await this.commands.runCommand('workbench.actions.view.problems');
			await this.code.waitForElement(Problems.PROBLEMS_VIEW_SELECTOR, el => !el);
		}
	}

	isVisible(): Promise<boolean> {
		return this.code.doesElementExist(Problems.PROBLEMS_VIEW_SELECTOR);
	}

	public async waitForProblemsView(): Promise<void> {
		await this.code.waitForElement(Problems.PROBLEMS_VIEW_SELECTOR);
	}

	public static getSelectorInProblemsView(problemType: ProblemSeverity): string {
		let selector = problemType === ProblemSeverity.WARNING ? 'warning' : 'error';
		return `div[aria-label="Problems grouped by files"] .icon.${selector}`;
	}

	public static getSelectorInEditor(problemType: ProblemSeverity): string {
		let selector = problemType === ProblemSeverity.WARNING ? 'squiggly-warning' : 'squiggly-error';
		return `.view-overlays .cdr.${selector}`;
	}
}
