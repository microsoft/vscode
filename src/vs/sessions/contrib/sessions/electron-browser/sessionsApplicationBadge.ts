/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Color } from '../../../../base/common/color.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { isWindows } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IApplicationBadge, INativeHostService } from '../../../../platform/native/common/native.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND } from '../../../../workbench/common/theme.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export const SESSIONS_APPLICATION_BADGE_SETTING = 'sessions.showApplicationBadge';

/**
 * Renders the number of sessions that need the user's attention — unread or
 * waiting for input, archived ones excluded — as a badge on the application
 * icon in the dock (macOS), the launcher (Linux) or the taskbar (Windows).
 */
export class SessionsApplicationBadge extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsApplicationBadge';

	/** Windows renders the taskbar overlay small, so draw at 2x for HiDPI. */
	private static readonly ICON_SIZE = 32;

	/** Beyond this the label no longer fits into a 16x16 overlay. */
	private static readonly MAX_ICON_COUNT = 9;

	private _lastCount = 0;

	private readonly _enabled: IObservable<boolean>;
	private readonly _sessions: IObservable<readonly ISession[]>;
	private readonly _colorTheme: IObservable<IColorTheme>;
	private readonly _count: IObservable<number>;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		this._enabled = observableConfigValue(SESSIONS_APPLICATION_BADGE_SETTING, false, this._configurationService);

		this._sessions = observableFromEvent(this, this._sessionsManagementService.onDidChangeSessions, () => this._sessionsManagementService.getSessions());

		this._colorTheme = observableFromEvent(this, this._themeService.onDidColorThemeChange, () => this._themeService.getColorTheme());

		this._count = derived(this, reader => {
			if (!this._enabled.read(reader)) {
				return 0;
			}

			let count = 0;
			for (const session of this._sessions.read(reader)) {
				if (session.isArchived.read(reader)) {
					continue;
				}

				if (!session.isRead.read(reader) || session.status.read(reader) === SessionStatus.NeedsInput) {
					count++;
				}
			}

			return count;
		});

		this._register(autorun(reader => {
			const count = this._count.read(reader);

			// The Windows overlay icon is drawn here, so it has to follow the theme
			this._setBadge(count, isWindows ? this._colorTheme.read(reader) : undefined);
		}));

		// The badge is application wide on macOS and Linux, so it must not
		// outlive this window.
		this._register(toDisposable(() => this._setBadge(0, undefined)));
	}

	private _setBadge(count: number, colorTheme: IColorTheme | undefined): void {
		if (count === 0 && this._lastCount === 0) {
			return; // nothing to clear
		}
		this._lastCount = count;

		let badge: IApplicationBadge | undefined;
		if (count > 0) {
			const description = count === 1
				? localize('sessions.applicationBadge.single', "1 session needs your attention")
				: localize('sessions.applicationBadge.multiple', "{0} sessions need your attention", count);

			// Leave `iconDataURL` out entirely rather than setting it to
			// `undefined`: the IPC serializes the badge as JSON, which drops
			// undefined valued properties, so the badge arriving in the main
			// process would not match the one sent here.
			const iconDataURL = colorTheme ? this._renderIcon(count, colorTheme) : undefined;
			badge = iconDataURL ? { count, description, iconDataURL } : { count, description };
		}

		this._nativeHostService.setApplicationBadge(badge);
	}

	private _renderIcon(count: number, colorTheme: IColorTheme): string | undefined {
		const size = SessionsApplicationBadge.ICON_SIZE;

		const canvas = mainWindow.document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;

		const context = canvas.getContext('2d');
		if (!context) {
			return undefined;
		}

		context.fillStyle = (colorTheme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND) ?? Color.blue).toString();
		context.beginPath();
		context.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
		context.fill();

		const label = count > SessionsApplicationBadge.MAX_ICON_COUNT ? `${SessionsApplicationBadge.MAX_ICON_COUNT}+` : String(count);
		context.fillStyle = (colorTheme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND) ?? Color.white).toString();
		context.font = `600 ${label.length > 1 ? 17 : 21}px "Segoe UI", sans-serif`;
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillText(label, size / 2, size / 2 + 1);

		return canvas.toDataURL('image/png');
	}
}
