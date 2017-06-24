/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';

export enum CSSProblem {
	WARNING = 0,
	ERROR = 1
};

export class CSS {

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public openQuickOutline(): any {
		return this.spectron.command('workbench.action.gotoSymbol');
	}

	public toggleProblemsView(): any {
		return this.spectron.command('workbench.actions.view.problems');
	}

	public async getEditorProblem(problemType: CSSProblem): Promise<any> {
		let selector;
		if (problemType === CSSProblem.WARNING) {
			selector = 'greensquiggly';
		} else if (problemType === CSSProblem.ERROR) {
			selector = 'redsquiggly';
		} else {
			throw new Error('No such problem type defined.');
		}

		let el = await this.spectron.client.element(`.view-overlays .cdr.${selector}`);
		if (el.status === 0) {
			return el;
		}

		return undefined;
	}

	public async getProblemsViewsProblem(problemType: CSSProblem): Promise<any> {
		let selector;
		if (problemType === CSSProblem.WARNING) {
			selector = 'warning';
		} else if (problemType === CSSProblem.ERROR) {
			selector = 'error';
		} else {
			throw new Error('No such problem type defined.');
		}

		let el = await this.spectron.client.element(`div[aria-label="Problems grouped by files"] .icon.${selector}`);
		if (el.status === 0) {
			return el;
		}

		return undefined;
	}
}