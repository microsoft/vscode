/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';
import { QuickAccess } from './quickaccess';

export const enum ProblemSeverity {
	WARNING = 0,
	ERROR = 1
}

export class Problems {

	static PROBLEMS_VIEW_SELECTOR = '.panel .markers-panel';

	constructor(private code: Code, private quickAccess: QuickAccess) { }

	async showProblemsView(): Promise<any> {
		await this.quickAccess.runCommand('workbench.panel.markers.view.focus');
		await this.waitForProblemsView();
	}

	async hideProblemsView(): Promise<any> {
		await this.quickAccess.runCommand('workbench.actions.view.problems');
		await this.code.waitForElement(Problems.PROBLEMS_VIEW_SELECTOR, el => !el);
	}

	async waitForProblemsView(): Promise<void> {
		await this.code.waitForElement(Problems.PROBLEMS_VIEW_SELECTOR);
	}

	static getSelectorInProblemsView(problemType: ProblemSeverity): string {
		const selector = problemType === ProblemSeverity.WARNING ? 'codicon-warning' : 'codicon-error';
		return `div[id="workbench.panel.markers"] .monaco-tl-contents .marker-icon .${selector}`;
	}

	static getSelectorInEditor(problemType: ProblemSeverity): string {
		const selector = problemType === ProblemSeverity.WARNING ? 'squiggly-warning' : 'squiggly-error';
		return `.view-overlays .cdr.${selector}`;
	}
}
