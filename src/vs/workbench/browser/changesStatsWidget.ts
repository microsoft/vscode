/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesStatsWidget.css';
import { $, append } from '../../base/browser/dom.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../base/common/observable.js';
import { localize } from '../../nls.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { AnimatedCounterWidget } from './animatedCounterWidget.js';

export interface IChangesStats {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

export function getChangesStatsFilesLabel(files: number): string {
	return files === 1
		? localize('changesStatsWidget.file', "{0} File", files)
		: localize('changesStatsWidget.files', "{0} Files", files);
}

/**
 * Renders an optional file count followed by animated insertion and deletion counts.
 */
export class ChangesStatsWidget extends Disposable {

	constructor(
		container: HTMLElement,
		stats: IObservable<IChangesStats | undefined>,
		showFiles: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (showFiles) {
			const filesLabel = append(container, $('span.changes-stats-files'));
			this._register(autorun(reader => {
				const value = stats.read(reader);
				filesLabel.textContent = value ? getChangesStatsFilesLabel(value.files) : '';
			}));
		}

		this._register(instantiationService.createInstance(AnimatedCounterWidget, container, {
			prefix: '+',
			direction: 'topToBottom',
			cssClassName: 'changes-stats-added',
			count: derived(this, reader => stats.read(reader)?.insertions),
		}));
		this._register(instantiationService.createInstance(AnimatedCounterWidget, container, {
			prefix: '-',
			direction: 'bottomToTop',
			cssClassName: 'changes-stats-removed',
			count: derived(this, reader => stats.read(reader)?.deletions),
		}));
	}
}
