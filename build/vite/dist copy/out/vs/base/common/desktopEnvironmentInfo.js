/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { env } from './process.js';
// Define the enumeration for Desktop Environments
var DesktopEnvironment;
(function (DesktopEnvironment) {
    DesktopEnvironment["UNKNOWN"] = "UNKNOWN";
    DesktopEnvironment["CINNAMON"] = "CINNAMON";
    DesktopEnvironment["DEEPIN"] = "DEEPIN";
    DesktopEnvironment["GNOME"] = "GNOME";
    DesktopEnvironment["KDE3"] = "KDE3";
    DesktopEnvironment["KDE4"] = "KDE4";
    DesktopEnvironment["KDE5"] = "KDE5";
    DesktopEnvironment["KDE6"] = "KDE6";
    DesktopEnvironment["PANTHEON"] = "PANTHEON";
    DesktopEnvironment["UNITY"] = "UNITY";
    DesktopEnvironment["XFCE"] = "XFCE";
    DesktopEnvironment["UKUI"] = "UKUI";
    DesktopEnvironment["LXQT"] = "LXQT";
})(DesktopEnvironment || (DesktopEnvironment = {}));
const kXdgCurrentDesktopEnvVar = 'XDG_CURRENT_DESKTOP';
const kKDESessionEnvVar = 'KDE_SESSION_VERSION';
export function getDesktopEnvironment() {
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
                    if (kdeSession === '5') {
                        return DesktopEnvironment.KDE5;
                    }
                    if (kdeSession === '6') {
                        return DesktopEnvironment.KDE6;
                    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVza3RvcEVudmlyb25tZW50SW5mby5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2Rlc2t0b3BFbnZpcm9ubWVudEluZm8udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUVuQyxrREFBa0Q7QUFDbEQsSUFBSyxrQkFjSjtBQWRELFdBQUssa0JBQWtCO0lBQ3RCLHlDQUFtQixDQUFBO0lBQ25CLDJDQUFxQixDQUFBO0lBQ3JCLHVDQUFpQixDQUFBO0lBQ2pCLHFDQUFlLENBQUE7SUFDZixtQ0FBYSxDQUFBO0lBQ2IsbUNBQWEsQ0FBQTtJQUNiLG1DQUFhLENBQUE7SUFDYixtQ0FBYSxDQUFBO0lBQ2IsMkNBQXFCLENBQUE7SUFDckIscUNBQWUsQ0FBQTtJQUNmLG1DQUFhLENBQUE7SUFDYixtQ0FBYSxDQUFBO0lBQ2IsbUNBQWEsQ0FBQTtBQUNkLENBQUMsRUFkSSxrQkFBa0IsS0FBbEIsa0JBQWtCLFFBY3RCO0FBRUQsTUFBTSx3QkFBd0IsR0FBRyxxQkFBcUIsQ0FBQztBQUN2RCxNQUFNLGlCQUFpQixHQUFHLHFCQUFxQixDQUFDO0FBRWhELE1BQU0sVUFBVSxxQkFBcUI7SUFDcEMsTUFBTSxpQkFBaUIsR0FBRyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUN4RCxJQUFJLGlCQUFpQixFQUFFLENBQUM7UUFDdkIsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDekcs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