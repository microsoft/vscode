/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from './codicons.js';
export var ThemeColor;
(function (ThemeColor) {
    function isThemeColor(obj) {
        return !!obj && typeof obj === 'object' && typeof obj.id === 'string';
    }
    ThemeColor.isThemeColor = isThemeColor;
})(ThemeColor || (ThemeColor = {}));
export function themeColorFromId(id) {
    return { id };
}
export var ThemeIcon;
(function (ThemeIcon) {
    ThemeIcon.iconNameSegment = '[A-Za-z0-9]+';
    ThemeIcon.iconNameExpression = '[A-Za-z0-9-]+';
    ThemeIcon.iconModifierExpression = '~[A-Za-z]+';
    ThemeIcon.iconNameCharacter = '[A-Za-z0-9~-]';
    const ThemeIconIdRegex = new RegExp(`^(${ThemeIcon.iconNameExpression})(${ThemeIcon.iconModifierExpression})?$`);
    function asClassNameArray(icon) {
        const match = ThemeIconIdRegex.exec(icon.id);
        if (!match) {
            return asClassNameArray(Codicon.error);
        }
        const [, id, modifier] = match;
        const classNames = ['codicon', 'codicon-' + id];
        if (modifier) {
            classNames.push('codicon-modifier-' + modifier.substring(1));
        }
        return classNames;
    }
    ThemeIcon.asClassNameArray = asClassNameArray;
    function asClassName(icon) {
        return asClassNameArray(icon).join(' ');
    }
    ThemeIcon.asClassName = asClassName;
    function asCSSSelector(icon) {
        return '.' + asClassNameArray(icon).join('.');
    }
    ThemeIcon.asCSSSelector = asCSSSelector;
    function isThemeIcon(obj) {
        return !!obj && typeof obj === 'object' && typeof obj.id === 'string' && (typeof obj.color === 'undefined' || ThemeColor.isThemeColor(obj.color));
    }
    ThemeIcon.isThemeIcon = isThemeIcon;
    const _regexFromString = new RegExp(`^\\$\\((${ThemeIcon.iconNameExpression}(?:${ThemeIcon.iconModifierExpression})?)\\)$`);
    function fromString(str) {
        const match = _regexFromString.exec(str);
        if (!match) {
            return undefined;
        }
        const [, name] = match;
        return { id: name };
    }
    ThemeIcon.fromString = fromString;
    function fromId(id) {
        return { id };
    }
    ThemeIcon.fromId = fromId;
    function modify(icon, modifier) {
        let id = icon.id;
        const tildeIndex = id.lastIndexOf('~');
        if (tildeIndex !== -1) {
            id = id.substring(0, tildeIndex);
        }
        if (modifier) {
            id = `${id}~${modifier}`;
        }
        return { id };
    }
    ThemeIcon.modify = modify;
    function getModifier(icon) {
        const tildeIndex = icon.id.lastIndexOf('~');
        if (tildeIndex !== -1) {
            return icon.id.substring(tildeIndex + 1);
        }
        return undefined;
    }
    ThemeIcon.getModifier = getModifier;
    function isEqual(ti1, ti2) {
        return ti1.id === ti2.id && ti1.color?.id === ti2.color?.id;
    }
    ThemeIcon.isEqual = isEqual;
    /**
     * Returns whether specified icon is defined and has 'file' ID.
     */
    function isFile(icon) {
        return icon?.id === Codicon.file.id;
    }
    ThemeIcon.isFile = isFile;
    /**
     * Returns whether specified icon is defined and has 'folder' ID.
     */
    function isFolder(icon) {
        return icon?.id === Codicon.folder.id;
    }
    ThemeIcon.isFolder = isFolder;
})(ThemeIcon || (ThemeIcon = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWFibGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vdGhlbWFibGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFVeEMsTUFBTSxLQUFXLFVBQVUsQ0FJMUI7QUFKRCxXQUFpQixVQUFVO0lBQzFCLFNBQWdCLFlBQVksQ0FBQyxHQUFZO1FBQ3hDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLElBQUksT0FBb0IsR0FBSSxDQUFDLEVBQUUsS0FBSyxRQUFRLENBQUM7SUFDckYsQ0FBQztJQUZlLHVCQUFZLGVBRTNCLENBQUE7QUFDRixDQUFDLEVBSmdCLFVBQVUsS0FBVixVQUFVLFFBSTFCO0FBRUQsTUFBTSxVQUFVLGdCQUFnQixDQUFDLEVBQW1CO0lBQ25ELE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQztBQUNmLENBQUM7QUFRRCxNQUFNLEtBQVcsU0FBUyxDQXFGekI7QUFyRkQsV0FBaUIsU0FBUztJQUNaLHlCQUFlLEdBQUcsY0FBYyxDQUFDO0lBQ2pDLDRCQUFrQixHQUFHLGVBQWUsQ0FBQztJQUNyQyxnQ0FBc0IsR0FBRyxZQUFZLENBQUM7SUFDdEMsMkJBQWlCLEdBQUcsZUFBZSxDQUFDO0lBRWpELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxNQUFNLENBQUMsS0FBSyxVQUFBLGtCQUFrQixLQUFLLFVBQUEsc0JBQXNCLEtBQUssQ0FBQyxDQUFDO0lBRTdGLFNBQWdCLGdCQUFnQixDQUFDLElBQWU7UUFDL0MsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixPQUFPLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QyxDQUFDO1FBQ0QsTUFBTSxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsQ0FBQyxHQUFHLEtBQUssQ0FBQztRQUMvQixNQUFNLFVBQVUsR0FBRyxDQUFDLFNBQVMsRUFBRSxVQUFVLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDaEQsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNkLFVBQVUsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlELENBQUM7UUFDRCxPQUFPLFVBQVUsQ0FBQztJQUNuQixDQUFDO0lBWGUsMEJBQWdCLG1CQVcvQixDQUFBO0lBRUQsU0FBZ0IsV0FBVyxDQUFDLElBQWU7UUFDMUMsT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUZlLHFCQUFXLGNBRTFCLENBQUE7SUFFRCxTQUFnQixhQUFhLENBQUMsSUFBZTtRQUM1QyxPQUFPLEdBQUcsR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUZlLHVCQUFhLGdCQUU1QixDQUFBO0lBRUQsU0FBZ0IsV0FBVyxDQUFDLEdBQVk7UUFDdkMsT0FBTyxDQUFDLENBQUMsR0FBRyxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsSUFBSSxPQUFtQixHQUFJLENBQUMsRUFBRSxLQUFLLFFBQVEsSUFBSSxDQUFDLE9BQW1CLEdBQUksQ0FBQyxLQUFLLEtBQUssV0FBVyxJQUFJLFVBQVUsQ0FBQyxZQUFZLENBQWEsR0FBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDMUwsQ0FBQztJQUZlLHFCQUFXLGNBRTFCLENBQUE7SUFFRCxNQUFNLGdCQUFnQixHQUFHLElBQUksTUFBTSxDQUFDLFdBQVcsU0FBUyxDQUFDLGtCQUFrQixNQUFNLFNBQVMsQ0FBQyxzQkFBc0IsU0FBUyxDQUFDLENBQUM7SUFFNUgsU0FBZ0IsVUFBVSxDQUFDLEdBQVc7UUFDckMsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxNQUFNLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUM7UUFDdkIsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUNyQixDQUFDO0lBUGUsb0JBQVUsYUFPekIsQ0FBQTtJQUVELFNBQWdCLE1BQU0sQ0FBQyxFQUFVO1FBQ2hDLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUNmLENBQUM7SUFGZSxnQkFBTSxTQUVyQixDQUFBO0lBRUQsU0FBZ0IsTUFBTSxDQUFDLElBQWUsRUFBRSxRQUF5QztRQUNoRixJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ2pCLE1BQU0sVUFBVSxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkMsSUFBSSxVQUFVLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN2QixFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDbEMsQ0FBQztRQUNELElBQUksUUFBUSxFQUFFLENBQUM7WUFDZCxFQUFFLEdBQUcsR0FBRyxFQUFFLElBQUksUUFBUSxFQUFFLENBQUM7UUFDMUIsQ0FBQztRQUNELE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUNmLENBQUM7SUFWZSxnQkFBTSxTQVVyQixDQUFBO0lBRUQsU0FBZ0IsV0FBVyxDQUFDLElBQWU7UUFDMUMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUMsSUFBSSxVQUFVLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN2QixPQUFPLElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMxQyxDQUFDO1FBQ0QsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQU5lLHFCQUFXLGNBTTFCLENBQUE7SUFFRCxTQUFnQixPQUFPLENBQUMsR0FBYyxFQUFFLEdBQWM7UUFDckQsT0FBTyxHQUFHLENBQUMsRUFBRSxLQUFLLEdBQUcsQ0FBQyxFQUFFLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxFQUFFLEtBQUssR0FBRyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUM7SUFDN0QsQ0FBQztJQUZlLGlCQUFPLFVBRXRCLENBQUE7SUFFRDs7T0FFRztJQUNILFNBQWdCLE1BQU0sQ0FBQyxJQUEyQjtRQUNqRCxPQUFPLElBQUksRUFBRSxFQUFFLEtBQUssT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUZlLGdCQUFNLFNBRXJCLENBQUE7SUFFRDs7T0FFRztJQUNILFNBQWdCLFFBQVEsQ0FBQyxJQUEyQjtRQUNuRCxPQUFPLElBQUksRUFBRSxFQUFFLEtBQUssT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7SUFDdkMsQ0FBQztJQUZlLGtCQUFRLFdBRXZCLENBQUE7QUFDRixDQUFDLEVBckZnQixTQUFTLEtBQVQsU0FBUyxRQXFGekIifQ==