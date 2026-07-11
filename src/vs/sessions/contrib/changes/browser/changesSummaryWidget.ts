/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesSummaryWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, derivedObservableWithCache, derivedOpts, IObservable } from '../../../../base/common/observable.js';
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

		const summaryRawObs = derivedObservableWithCache<ISessionChangesSummary | undefined>(this, (reader, lastValue) => {
			const isLoading = changesViewService.activeSessionLoadingObs.read(reader);
			if (isLoading) {
				return lastValue;
			}

			const entries = changesViewService.activeSessionChangesObs.read(reader);
			if (entries.length === 0) {
				return undefined;
			}

			let additions = 0, deletions = 0;
			for (const entry of entries) {
				additions += entry.insertions;
				deletions += entry.deletions;
			}

			return {
				additions,
				deletions,
				files: entries.length,
			} satisfies ISessionChangesSummary;
		});

		this._summaryObs = derivedOpts<ISessionChangesSummary | undefined>({
			equalsFn: structuralEquals
		}, reader => summaryRawObs.read(reader));
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
