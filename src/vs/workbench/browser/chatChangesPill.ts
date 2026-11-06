/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, reset } from '../../base/browser/dom.js';
import { IActionViewItemOptions } from '../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../base/browser/ui/button/button.js';
import { IAction } from '../../base/common/actions.js';
import { Codicon } from '../../base/common/codicons.js';
import { autorun, IObservable } from '../../base/common/observable.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { localize } from '../../nls.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ChangesStatsWidget, getChangesStatsFilesLabel, IChangesStats } from './changesStatsWidget.js';
import { ChatPillActionViewItemBase } from './chatPills.js';

/** The file and line counts a changes pill reports. */
export type IChatChangesStats = IChangesStats;

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
		reset(
			button.element,
			$(`span.chat-pill-icon${ThemeIcon.asCSSSelector(Codicon.diffMultiple)}`, { 'aria-hidden': 'true' }),
		);

		this._register(this._instantiationService.createInstance(ChangesStatsWidget, button.element, this._statsObs, true));
		button.setTitle(this._action.tooltip || this._action.label);

		this._register(autorun(reader => {
			this._statsObs.read(reader);
			this.updateAriaLabel();
		}));
	}

	protected override getAriaLabel(): string {
		const stats = this._statsObs.get();
		const { files, insertions, deletions } = stats;
		return localize('chatChangesPill.ariaLabel', "{0}: {1}, +{2}, -{3}", this._action.label, getChangesStatsFilesLabel(files), insertions, deletions);
	}
}
