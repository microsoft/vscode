/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Color } from '../../../../base/common/color.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { activityErrorBadgeBackground, activityErrorBadgeForeground, activityWarningBadgeBackground, activityWarningBadgeForeground } from '../../../../platform/theme/common/colors/miscColors.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { ViewContainer } from '../../../common/views.js';

export interface IActivity {
	readonly badge: IBadge;
}

/**
 * A pill that follows the title of a view, in its header or, while it is the only view of its container, in the
 * container's title.
 */
export interface IViewTitleBadge {
	readonly icon: ThemeIcon;
	readonly label: string;
	readonly tooltip: string;
	/** Read with the title, as the pill itself is hidden from screen readers. */
	readonly ariaLabel: string;
}

export const IActivityService = createDecorator<IActivityService>('activityService');

export interface IActivityService {

	readonly _serviceBrand: undefined;

	/**
	 * Emitted when activity changes for a view container or when the activity of the global actions change.
	 */
	readonly onDidChangeActivity: Event<string | ViewContainer>;

	/**
	 * Show activity for the given view container
	 */
	showViewContainerActivity(viewContainerId: string, badge: IActivity): IDisposable;

	/**
	 * Returns the activity for the given view container
	 */
	getViewContainerActivities(viewContainerId: string): IActivity[];

	/**
	 * Show activity for the given view
	 */
	showViewActivity(viewId: string, badge: IActivity): IDisposable;

	/**
	 * Emitted with the id of the view whose title badge changed.
	 */
	readonly onDidChangeViewTitleBadge: Event<string>;

	/**
	 * Show the given badge after the title of the given view. The last one shown wins.
	 */
	showViewTitleBadge(viewId: string, badge: IViewTitleBadge): IDisposable;

	/**
	 * Returns the badge shown after the title of the given view
	 */
	getViewTitleBadge(viewId: string): IViewTitleBadge | undefined;

	/**
	 * Show accounts activity
	 */
	showAccountsActivity(activity: IActivity): IDisposable;

	/**
	 * Show global activity
	 */
	showGlobalActivity(activity: IActivity): IDisposable;

	/**
	 * Return the activity for the given action
	 */
	getActivity(id: string): IActivity[];
}

export interface IBadge {
	getDescription(): string;
	getColors(theme: IColorTheme): IBadgeStyles | undefined;
}

export interface IBadgeStyles {
	readonly badgeBackground: Color | undefined;
	readonly badgeForeground: Color | undefined;
	readonly badgeBorder: Color | undefined;
}

class BaseBadge<T = unknown> implements IBadge {

	constructor(
		protected readonly descriptorFn: (arg: T) => string,
		private readonly stylesFn: ((theme: IColorTheme) => IBadgeStyles | undefined) | undefined,
	) {
	}

	getDescription(): string {
		return this.descriptorFn(null as T);
	}

	getColors(theme: IColorTheme): IBadgeStyles | undefined {
		return this.stylesFn?.(theme);
	}
}

export class NumberBadge extends BaseBadge<number> {

	constructor(readonly number: number, descriptorFn: (num: number) => string) {
		super(descriptorFn, undefined);

		this.number = number;
	}

	override getDescription(): string {
		return this.descriptorFn(this.number);
	}
}

export class IconBadge extends BaseBadge<void> {
	constructor(
		readonly icon: ThemeIcon,
		descriptorFn: () => string,
		stylesFn?: (theme: IColorTheme) => IBadgeStyles | undefined,
	) {
		super(descriptorFn, stylesFn);
	}
}

export class ProgressBadge extends BaseBadge<void> {
	constructor(descriptorFn: () => string) {
		super(descriptorFn, undefined);
	}
}

export class WarningBadge extends IconBadge {
	constructor(descriptorFn: () => string) {
		super(Codicon.warning, descriptorFn, (theme: IColorTheme) => ({
			badgeBackground: theme.getColor(activityWarningBadgeBackground),
			badgeForeground: theme.getColor(activityWarningBadgeForeground),
			badgeBorder: undefined,
		}));
	}
}

export class ErrorBadge extends IconBadge {
	constructor(descriptorFn: () => string) {
		super(Codicon.error, descriptorFn, (theme: IColorTheme) => ({
			badgeBackground: theme.getColor(activityErrorBadgeBackground),
			badgeForeground: theme.getColor(activityErrorBadgeForeground),
			badgeBorder: undefined,
		}));
	}
}
