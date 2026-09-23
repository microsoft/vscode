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
import { AnimatedCounterWidget } from '../../../../workbench/browser/animatedCounterWidget.js';

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

	render(container: HTMLElement) {
		const element = dom.$('div.changes-summary-widget');
		container.appendChild(element);

		this._register(this._instantiationService.createInstance(AnimatedCounterWidget, element, {
			prefix: '+',
			direction: 'topToBottom',
			cssClassName: 'changes-summary-lines-added',
			count: derived(this, (reader) => {
				return this._summaryObs.read(reader)?.additions;
			})
		}));

		this._register(this._instantiationService.createInstance(AnimatedCounterWidget, element, {
			prefix: '-',
			direction: 'bottomToTop',
			cssClassName: 'changes-summary-lines-removed',
			count: derived(this, (reader) => {
				return this._summaryObs.read(reader)?.deletions;
			})
		}));
	}
}
