/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import './media/sessionActivityPill.css';

/** One entry of a pill, rendered as the button label or as a picker row. */
export interface ISessionActivity {
	readonly label: string;
	readonly icon: ThemeIcon;
}

/** A named section of the picker; sections without activities are skipped. */
export interface ISessionActivityCategory<T extends ISessionActivity> {
	readonly title: string;
	readonly activities: readonly T[];
}

/** The button content when a pill stands for more than one activity. */
export interface ISessionActivitySummary {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly ariaLabel: string;
}

export interface ISessionActivityPillOptions<T extends ISessionActivity> {
	/** Extra class on the pill root, for fixtures and per-pill styling. */
	readonly className: string;
	/** Identifies the pill's picker to the action widget service. */
	readonly widgetId: string;
	/** Accessible name of the picker shown for more than one activity. */
	readonly getWidgetAriaLabel: () => string;
	/** Button content for more than one activity; a single activity renders itself. */
	readonly getSummary: (activities: readonly T[]) => ISessionActivitySummary;
	readonly openActivity: (activity: T) => void | Promise<void>;
}

/**
 * A compact button standing for a set of activities. A single activity is shown
 * with its own icon and label and is opened directly; more than one shows the
 * consumer's summary and opens a picker grouped by category. The widget owns
 * only the presentation — which activities exist, how they are grouped, and how
 * they are labelled is up to the consumer.
 */
export class SessionActivityPill<T extends ISessionActivity> extends Disposable {

	readonly element: HTMLElement;
	readonly isVisible: IObservable<boolean>;

	private readonly _button: Button;
	private readonly _isVisible = observableValue(this, false);
	private _categories: readonly ISessionActivityCategory<T>[] = [];
	private _activities: readonly T[] = [];

	constructor(
		private readonly _options: ISessionActivityPillOptions<T>,
		private readonly _actionWidgetService: IActionWidgetService,
	) {
		super();

		this.element = $(`.session-activity-pill.${_options.className}.hidden`);
		this.isVisible = this._isVisible;
		this._button = this._register(new Button(this.element, { secondary: true, small: true, supportIcons: true, ...defaultButtonStyles }));
		this._button.element.classList.add('session-activity-pill-button');
		this._register(this._button.onDidClick(() => this._onDidClick()));
	}

	setCategories(categories: readonly ISessionActivityCategory<T>[]): void {
		this._categories = categories.filter(category => category.activities.length > 0);
		this._activities = this._categories.flatMap(category => category.activities);
		this._render();
	}

	private _render(): void {
		const count = this._activities.length;
		this._isVisible.set(count > 0, undefined);
		this.element.classList.toggle('hidden', count === 0);
		if (count === 0) {
			return;
		}

		let label: string;
		let accessibleLabel: string;
		if (count === 1) {
			const activity = this._activities[0];
			label = `$(${activity.icon.id}) ${activity.label}`;
			accessibleLabel = localize('sessionActivityPill.open', "Open {0}", activity.label);
		} else {
			const summary = this._options.getSummary(this._activities);
			label = `$(${summary.icon.id}) ${summary.label} $(${Codicon.chevronDown.id})`;
			accessibleLabel = summary.ariaLabel;
		}

		this._button.label = label;
		this._button.setTitle(accessibleLabel);
		this._button.setAriaLabel(accessibleLabel);
	}

	private _onDidClick(): void {
		if (this._activities.length === 1) {
			this._openActivity(this._activities[0]);
			return;
		}
		if (this._activities.length > 1) {
			this._showPicker();
		}
	}

	private _openActivity(activity: T): void {
		Promise.resolve(this._options.openActivity(activity)).catch(onUnexpectedError);
	}

	private _showPicker(): void {
		if (this._actionWidgetService.isVisible) {
			return;
		}

		const items: IActionListItem<T>[] = [];
		for (const category of this._categories) {
			if (items.length > 0) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			items.push({ kind: ActionListItemKind.Header, label: category.title, group: { title: category.title } });
			for (const activity of category.activities) {
				items.push({
					kind: ActionListItemKind.Action,
					label: activity.label,
					group: { title: '', icon: activity.icon },
					item: activity,
				});
			}
		}

		const triggerElement = this._button.element;
		const delegate: IActionListDelegate<T> = {
			onSelect: activity => {
				this._actionWidgetService.hide();
				this._openActivity(activity);
			},
			onHide: () => triggerElement.focus(),
		};
		this._actionWidgetService.show(
			this._options.widgetId,
			false,
			items,
			delegate,
			triggerElement,
			undefined,
			[],
			{
				getAriaLabel: item => item.label ?? '',
				getWidgetAriaLabel: () => this._options.getWidgetAriaLabel(),
			},
			{ minWidth: 220, maxWidth: 420 },
		);
	}
}
