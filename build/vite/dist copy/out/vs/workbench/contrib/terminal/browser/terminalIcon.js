/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { hash } from '../../../../base/common/hash.js';
import { URI } from '../../../../base/common/uri.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ITerminalProfileResolverService } from '../common/terminal.js';
import { ansiColorMap } from '../common/terminalColorRegistry.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isString } from '../../../../base/common/types.js';
export function getColorClass(terminalOrColorKey) {
    let color = undefined;
    if (isString(terminalOrColorKey)) {
        color = terminalOrColorKey;
    }
    else if (terminalOrColorKey.color) {
        color = terminalOrColorKey.color.replace(/\./g, '_');
    }
    else if (ThemeIcon.isThemeIcon(terminalOrColorKey.icon) && terminalOrColorKey.icon.color) {
        color = terminalOrColorKey.icon.color.id.replace(/\./g, '_');
    }
    if (color) {
        return `terminal-icon-${color.replace(/\./g, '_')}`;
    }
    return undefined;
}
export function getStandardColors(colorTheme) {
    const standardColors = [];
    for (const colorKey in ansiColorMap) {
        const color = colorTheme.getColor(colorKey);
        if (color && !colorKey.toLowerCase().includes('bright')) {
            standardColors.push(colorKey);
        }
    }
    return standardColors;
}
export function createColorStyleElement(colorTheme) {
    const disposable = new DisposableStore();
    const standardColors = getStandardColors(colorTheme);
    const styleElement = createStyleSheet(undefined, undefined, disposable);
    let css = '';
    for (const colorKey of standardColors) {
        const colorClass = getColorClass(colorKey);
        const color = colorTheme.getColor(colorKey);
        if (color) {
            css += (`.monaco-workbench .${colorClass} .codicon:first-child:not(.codicon-split-horizontal):not(.codicon-trashcan):not(.file-icon)` +
                `{ color: ${color} !important; }`);
        }
    }
    styleElement.textContent = css;
    return disposable;
}
export function getColorStyleContent(colorTheme, editor) {
    const standardColors = getStandardColors(colorTheme);
    let css = '';
    for (const colorKey of standardColors) {
        const colorClass = getColorClass(colorKey);
        const color = colorTheme.getColor(colorKey);
        if (color) {
            if (editor) {
                css += (`.monaco-workbench .show-file-icons .predefined-file-icon.terminal-tab.${colorClass}::before,` +
                    `.monaco-workbench .show-file-icons .file-icon.terminal-tab.${colorClass}::before` +
                    `{ color: ${color} !important; }`);
            }
            else {
                css += (`.monaco-workbench .${colorClass} .codicon:first-child:not(.codicon-split-horizontal):not(.codicon-trashcan):not(.file-icon)` +
                    `{ color: ${color} !important; }`);
            }
        }
    }
    return css;
}
export function getUriClasses(terminal, colorScheme, extensionContributed) {
    const icon = terminal.icon;
    if (!icon) {
        return undefined;
    }
    const iconClasses = [];
    let uri = undefined;
    if (extensionContributed) {
        if (isString(icon) && (icon.startsWith('$(') || getIconRegistry().getIcon(icon))) {
            return iconClasses;
        }
        else if (isString(icon)) {
            uri = URI.parse(icon);
        }
    }
    if (URI.isUri(icon)) {
        uri = icon;
    }
    else if (!ThemeIcon.isThemeIcon(icon) && !isString(icon)) {
        uri = isDark(colorScheme) ? icon.dark : icon.light;
    }
    if (uri instanceof URI) {
        const uriIconKey = hash(uri.path).toString(36);
        const className = `terminal-uri-icon-${uriIconKey}`;
        iconClasses.push(className);
        iconClasses.push(`terminal-uri-icon`);
    }
    return iconClasses;
}
export function getIconId(accessor, terminal) {
    if (isString(terminal.icon)) {
        return terminal.icon;
    }
    if (ThemeIcon.isThemeIcon(terminal.icon)) {
        return terminal.icon.id;
    }
    return accessor.get(ITerminalProfileResolverService).getDefaultIcon().id;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxJY29uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEljb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUdyRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDcEYsT0FBTyxFQUFlLE1BQU0sRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRWpGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN4RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQU81RCxNQUFNLFVBQVUsYUFBYSxDQUFDLGtCQUE2RjtJQUMxSCxJQUFJLEtBQUssR0FBRyxTQUFTLENBQUM7SUFDdEIsSUFBSSxRQUFRLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDO1FBQ2xDLEtBQUssR0FBRyxrQkFBa0IsQ0FBQztJQUM1QixDQUFDO1NBQU0sSUFBSSxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNyQyxLQUFLLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDdEQsQ0FBQztT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