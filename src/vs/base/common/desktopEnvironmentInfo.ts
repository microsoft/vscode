/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { env } from 'vs/base/common/process';

// Define the enumeration for Desktop Environments
enum DesktopEnvironment {
	UNKNOWN = 'UNKNOWN',
	CINNAMON = 'CINNAMON',
	DEEPIN = 'DEEPIN',
	GNOME = 'GNOME',
	KDE3 = 'KDE3',
	KDE4 = 'KDE4',
	KDE5 = 'KDE5',
	KDE6 = 'KDE6',
	PANTHEON = 'PANTHEON',
	UNITY = 'UNITY',
	XFCE = 'XFCE',
	UKUI = 'UKUI',
	LXQT = 'LXQT',
}

const kXdgCurrentDesktopEnvVar = 'XDG_CURRENT_DESKTOP';
const kKDESessionEnvVar = 'KDE_SESSION_VERSION';

export function getDesktopEnvironment(): DesktopEnvironment {
	const xdgCurrentDesktop = env[kXdgCurrentDesktopEnvVar];
	if (xdgCurrentDesktop) {
		const values = xdgCurrentDesktop.split(':').map(value => value.trim()).filter(value => value.length > 0);
		for (const value of values) {
			switch (value) {
				case 'Unity': {
					const desktopSessionUnity = env['DESKTOP_SESSION'];
					if (desktopSessionUnity && desktopSessionUnity.includes('gnome-fallback')) {
						return DesktopEnvironment.GNOME;
					}

					return DesktopEnvironment.UNITY;
				}
				case 'Deepin':
					return DesktopEnvironment.DEEPIN;
				case 'GNOME':
					return DesktopEnvironment.GNOME;
				case 'X-Cinnamon':
					return DesktopEnvironment.CINNAMON;
				case 'KDE': {
					const kdeSession = env[kKDESessionEnvVar];
					if (kdeSession === '5') { return DesktopEnvironment.KDE5; }
					if (kdeSession === '6') { return DesktopEnvironment.KDE6; }
					return DesktopEnvironment.KDE4;
				}
				case 'Pantheon':
					return DesktopEnvironment.PANTHEON;
				case 'XFCE':
					return DesktopEnvironment.XFCE;
				case 'UKUI':
					return DesktopEnvironment.UKUI;
				case 'LXQt':
					return DesktopEnvironment.LXQT;
			}
		}
	}

	const desktopSession = env['DESKTOP_SESSION'];
	if (desktopSession) {
		switch (desktopSession) {
			case 'deepin':
				return DesktopEnvironment.DEEPIN;
			case 'gnome':
			case 'mate':
				return DesktopEnvironment.GNOME;
			case 'kde4':
			case 'kde-plasma':
				return DesktopEnvironment.KDE4;
			case 'kde':
				if (kKDESessionEnvVar in env) {
					return DesktopEnvironment.KDE4;
				}
				return DesktopEnvironment.KDE3;
			case 'xfce':
			case 'xubuntu':
				return DesktopEnvironment.XFCE;
			case 'ukui':
				return DesktopEnvironment.UKUI;
		}
	}

	if ('GNOME_DESKTOP_SESSION_ID' in env) {
		return DesktopEnvironment.GNOME;
	}
	if ('KDE_FULL_SESSION' in env) {
		if (kKDESessionEnvVar in env) {
			return DesktopEnvironment.KDE4;
		}
		return DesktopEnvironment.KDE3;
	}

	return DesktopEnvironment.UNKNOWN;
}
