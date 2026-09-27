/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesSummaryWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { ISessionChangesSummary } from '../../../services/sessions/common/session.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChangesStatsWidget, IChangesStats } from '../../../../workbench/browser/changesStatsWidget.js';

export class ChangesSummaryWidget extends Disposable {
	private readonly _summaryObs: IObservable<ISessionChangesSummary | undefined>;
	get summary() { return this._summaryObs; }

	constructor(
		@IChangesViewService changesViewService: IChangesViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._summaryObs = changesViewService.activeSessionChangesSummaryObs;
	}

	render(container: HTMLElement): void {
		const element = dom.$('span.changes-summary-widget');
		container.appendChild(element);

		this._register(this._instantiationService.createInstance(ChangesStatsWidget, element, derived(this, reader => {
			const summary = this._summaryObs.read(reader);
			return summary ? toChangesStats(summary) : undefined;
		}), false));
	}
}

function toChangesStats(summary: ISessionChangesSummary): IChangesStats {
	return {
		files: summary.files,
		insertions: summary.additions,
		deletions: summary.deletions,
	};
}
