/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Event } from '../../../../base/common/event.js';
import { ViewContainer } from '../../../common/views.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { Color } from '../../../../base/common/color.js';
import { registerColor } from '../../../../platform/theme/common/colorUtils.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';

export interface IActivity {
	readonly badge: IBadge;
	readonly priority?: number;
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

class BaseBadge implements IBadge {

	constructor(
		protected readonly descriptorFn: (arg: any) => string,
		private readonly stylesFn: ((theme: IColorTheme) => IBadgeStyles | undefined) | undefined,
	) {
	}

	getDescription(): string {
		return this.descriptorFn(null);
	}

	getColors(theme: IColorTheme): IBadgeStyles | undefined {
		return this.stylesFn?.(theme);
	}
}

export class NumberBadge extends BaseBadge {

	constructor(readonly number: number, descriptorFn: (num: number) => string) {
		super(descriptorFn, undefined);

		this.number = number;
	}

	override getDescription(): string {
		return this.descriptorFn(this.number);
	}
}

export class IconBadge extends BaseBadge {
	constructor(
		readonly icon: ThemeIcon,
		descriptorFn: () => string,
		stylesFn?: (theme: IColorTheme) => IBadgeStyles | undefined,
	) {
		super(descriptorFn, stylesFn);
	}
}

export class ProgressBadge extends BaseBadge {
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

const activityWarningBadgeForeground = registerColor('activityWarningBadge.foreground',
	{ dark: Color.black.lighten(0.2), light: Color.white, hcDark: null, hcLight: Color.black.lighten(0.2) },
	localize('activityWarningBadge.foreground', 'Foreground color of the warning activity badge'));

const activityWarningBadgeBackground = registerColor('activityWarningBadge.background',
	{ dark: '#CCA700', light: '#BF8803', hcDark: null, hcLight: '#CCA700' },
	localize('activityWarningBadge.background', 'Background color of the warning activity badge'));

const activityErrorBadgeForeground = registerColor('activityErrorBadge.foreground',
	{ dark: Color.black.lighten(0.2), light: Color.white, hcDark: null, hcLight: Color.black.lighten(0.2) },
	localize('activityErrorBadge.foreground', 'Foreground color of the error activity badge'));

const activityErrorBadgeBackground = registerColor('activityErrorBadge.background',
	{ dark: '#F14C4C', light: '#E51400', hcDark: null, hcLight: '#F14C4C' },
	localize('activityErrorBadge.background', 'Background color of the error activity badge'));
