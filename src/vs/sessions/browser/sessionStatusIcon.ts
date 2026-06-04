/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { ThemeIcon, themeColorFromId } from '../../base/common/themables.js';
import { asCssVariable } from '../../platform/theme/common/colorUtils.js';
import { SessionStatus } from '../services/sessions/common/session.js';

// Sentinel cache keys used when the rendered indicator is a pixel spinner (vs. a
// codicon). Distinct per variant so transitions between variants rebuild the DOM,
// while same-variant re-renders only update color and avoid restarting the CSS
// animation. Consumers compare these against their cached selector.
export const PIXEL_SPINNER_GRID_KEY = '__pixel_spinner_grid__';
export const PIXEL_SPINNER_RING_KEY = '__pixel_spinner_ring__';

/**
 * The status-based codicon shown next to a session, used for states that do not
 * render the animated pixel spinner (or when motion is reduced).
 *
 * @param status The session status.
 * @param isRead Whether the session has been read.
 * @param isArchived Whether the session is archived.
 * @param pullRequestIcon Optional pull-request icon to show for non-active sessions.
 */
export function getSessionStatusIcon(status: SessionStatus, isRead: boolean, isArchived: boolean, pullRequestIcon?: ThemeIcon): ThemeIcon {
	switch (status) {
		case SessionStatus.InProgress:
			// When motion is allowed, the pixel spinner replaces this icon; this is the
			// reduced-motion fallback.
			return { ...Codicon.sessionInProgress, color: themeColorFromId('textLink.foreground') };
		case SessionStatus.NeedsInput:
			// Same as above — the pixel spinner replaces this pulsing dot when motion is allowed.
			return { ...Codicon.circleFilled, color: themeColorFromId('list.warningForeground') };
		case SessionStatus.Error:
			return { ...Codicon.error, color: themeColorFromId('errorForeground') };
		default:
			if (pullRequestIcon) {
				return pullRequestIcon;
			}
			if (!isRead && !isArchived) {
				return { ...Codicon.circleFilled, color: themeColorFromId('textLink.foreground') };
			}
			return { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
	}
}

/**
 * Describes how a session's status should be visualized: either an animated pixel
 * spinner (for in-progress / needs-input when motion is allowed) or a static codicon.
 * Both variants carry a `cacheKey` (so consumers can skip rebuilding the DOM when the
 * glyph/variant is unchanged) and a ready-to-apply CSS `color` string.
 */
export type SessionStatusIndicator =
	| { readonly kind: 'spinner'; readonly variant: 'grid' | 'ring'; readonly cacheKey: string; readonly color: string }
	| { readonly kind: 'icon'; readonly icon: ThemeIcon; readonly cacheKey: string; readonly color: string };

/**
 * Resolves the visual indicator for a session status, shared by the sessions list
 * row renderer and the session header so both surfaces stay in sync.
 *
 * @param status The session status.
 * @param isRead Whether the session has been read.
 * @param isArchived Whether the session is archived.
 * @param motionReduced Whether reduced motion is requested (disables the spinner).
 * @param pullRequestIcon Optional pull-request icon to show for non-active sessions.
 */
export function getSessionStatusIndicator(status: SessionStatus, isRead: boolean, isArchived: boolean, motionReduced: boolean, pullRequestIcon?: ThemeIcon): SessionStatusIndicator {
	if ((status === SessionStatus.InProgress || status === SessionStatus.NeedsInput) && !motionReduced) {
		const isNeedsInput = status === SessionStatus.NeedsInput;
		return {
			kind: 'spinner',
			variant: isNeedsInput ? 'ring' : 'grid',
			cacheKey: isNeedsInput ? PIXEL_SPINNER_RING_KEY : PIXEL_SPINNER_GRID_KEY,
			color: isNeedsInput ? asCssVariable('list.warningForeground') : asCssVariable('textLink.foreground'),
		};
	}

	const icon = getSessionStatusIcon(status, isRead, isArchived, pullRequestIcon);
	return {
		kind: 'icon',
		icon,
		cacheKey: ThemeIcon.asCSSSelector(icon),
		color: icon.color ? asCssVariable(icon.color.id) : '',
	};
}
