/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, reset } from '../../base/browser/dom.js';
import { IActionViewItemOptions } from '../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../base/browser/ui/button/button.js';
import { IAction } from '../../base/common/actions.js';
import { Codicon } from '../../base/common/codicons.js';
import { autorun, derived, IObservable } from '../../base/common/observable.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { localize } from '../../nls.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { AnimatedCounterWidget } from './animatedCounterWidget.js';
import { ChatPillActionViewItemBase } from './chatPills.js';

/** The file and line counts a changes pill reports. */
export interface IChatChangesStats {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

export const EMPTY_CHAT_CHANGES_STATS: IChatChangesStats = { files: 0, insertions: 0, deletions: 0 };

export function chatChangesStatsEqual(a: IChatChangesStats, b: IChatChangesStats): boolean {
	return a.files === b.files && a.insertions === b.insertions && a.deletions === b.deletions;
}

/**
 * The changes pill: `<diff-icon> <n> Files +insertions -deletions`. The counters
 * animate between values, so the label structure is built once and updated in
 * place rather than being torn down on every stats change.
 */
export class ChatChangesPillActionViewItem extends ChatPillActionViewItemBase {

	private _filesLabel: HTMLElement | undefined;

	protected override get itemModifierClass(): string { return 'chat-changes-pill'; }
	protected override get buttonModifierClass(): string { return 'chat-changes-pill-button'; }

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly _statsObs: IObservable<IChatChangesStats>,
		private readonly _instantiationService: IInstantiationService,
	) {
		super(undefined, action, options);
	}

	protected override renderContent(button: Button): void {
		this._filesLabel = $('span.chat-pill-label');
		reset(
			button.element,
			$(`span.chat-pill-icon${ThemeIcon.asCSSSelector(Codicon.diffMultiple)}`, { 'aria-hidden': 'true' }),
			this._filesLabel,
		);

		this._register(this._instantiationService.createInstance(AnimatedCounterWidget, button.element, {
			prefix: '+',
			direction: 'topToBottom',
			cssClassName: 'chat-pill-added',
			count: derived(this, reader => this._statsObs.read(reader).insertions),
		}));
		this._register(this._instantiationService.createInstance(AnimatedCounterWidget, button.element, {
			prefix: '-',
			direction: 'bottomToTop',
			cssClassName: 'chat-pill-removed',
			count: derived(this, reader => this._statsObs.read(reader).deletions),
		}));

		this._register(autorun(reader => {
			this._updateLabel(this._statsObs.read(reader));
		}));
	}

	private _updateLabel(stats: IChatChangesStats): void {
		if (!this.button || !this._filesLabel) {
			return;
		}
		const { files, insertions, deletions } = stats;
		const filesLabel = files === 1
			? localize('chatChangesPill.file', "{0} File", files)
			: localize('chatChangesPill.files', "{0} Files", files);
		this._filesLabel.textContent = filesLabel;
		this.button.setTitle(this._action.tooltip || this._action.label);
		this.button.element.setAttribute('aria-label', localize('chatChangesPill.ariaLabel', "{0}: {1}, +{2}, -{3}", this._action.label, filesLabel, insertions, deletions));
	}
}
