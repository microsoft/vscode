/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as strings from './strings.js';
export function buildReplaceStringWithCasePreserved(matches, pattern) {
    if (matches && (matches[0] !== '')) {
        const containsHyphens = validateSpecificSpecialCharacter(matches, pattern, '-');
        const containsUnderscores = validateSpecificSpecialCharacter(matches, pattern, '_');
        if (containsHyphens && !containsUnderscores) {
            return buildReplaceStringForSpecificSpecialCharacter(matches, pattern, '-');
        }
        else if (!containsHyphens && containsUnderscores) {
            return buildReplaceStringForSpecificSpecialCharacter(matches, pattern, '_');
        }
        if (matches[0].toUpperCase() === matches[0]) {
            return pattern.toUpperCase();
        }
        else if (matches[0].toLowerCase() === matches[0]) {
            return pattern.toLowerCase();
        }
        else if (strings.containsUppercaseCharacter(matches[0][0]) && pattern.length > 0) {
            return pattern[0].toUpperCase() + pattern.substr(1);
        }
        else if (matches[0][0].toUpperCase() !== matches[0][0] && pattern.length > 0) {
            return pattern[0].toLowerCase() + pattern.substr(1);
        }
        else {
            // we don't understand its pattern yet.
            return pattern;
        }
    }
    else {
        return pattern;
    }
}
function validateSpecificSpecialCharacter(matches, pattern, specialCharacter) {
    const doesContainSpecialCharacter = matches[0].indexOf(specialCharacter) !== -1 && pattern.indexOf(specialCharacter) !== -1;
    return doesContainSpecialCharacter && matches[0].split(specialCharacter).length === pattern.split(specialCharacter).length;
}
function buildReplaceStringForSpecificSpecialCharacter(matches, pattern, specialCharacter) {
    const splitPatternAtSpecialCharacter = pattern.split(specialCharacter);
    const splitMatchAtSpecialCharacter = matches[0].split(specialCharacter);
    let replaceString = '';
    splitPatternAtSpecialCharacter.forEach((splitValue, index) => {
        replaceString += buildReplaceStringWithCasePreserved([splitMatchAtSpecialCharacter[index]], splitValue) + specialCharacter;
    });
    return replaceString.slice(0, -1);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vc2VhcmNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxPQUFPLE1BQU0sY0FBYyxDQUFDO0FBRXhDLE1BQU0sVUFBVSxtQ0FBbUMsQ0FBQyxPQUF3QixFQUFFLE9BQWU7SUFDNUYsSUFBSSxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUNwQyxNQUFNLGVBQWUsR0FBRyxnQ0FBZ0MsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2hGLE1BQU0sbUJBQW1CLEdBQUcsZ0NBQWdDLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNwRixJQUFJLGVBQWUsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDN0MsT0FBTyw2Q0FBNkMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzdFLENBQUM7YUFBTSxJQUFJLENBQUMsZUFBZSxJQUFJLG1CQUFtQixFQUFFLENBQUM7WUFDcEQsT0FBTyw2Q0FBNkMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzdFLENBQUM7UUFDRCxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUM3QyxPQUFPLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUM5QixDQUFDO2FBQU0sSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDcEQsT0FBTyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDOUIsQ0FBQzthQUFNLElBQUksT0FBTyxDQUFDLDBCQUEwQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDcEYsT0FBTyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyRCxDQUFDO2FBQU0sSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDaEYsT0FBTyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyRCxDQUFDO2FBQU0sQ0FBQztZQUNQLHVDQUF1QztZQUN2QyxPQUFPLE9BQU8sQ0FBQztRQUNoQixDQUFDO0lBQ0YsQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsZ0NBQWdDLENBQUMsT0FBaUIsRUFBRSxPQUFlLEVBQUUsZ0JBQXdCO0lBQ3JHLE1BQU0sMkJBQTJCLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUM1SCxPQUFPLDJCQUEyQixJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUM1SCxDQUFDO0FBRUQsU0FBUyw2Q0FBNkMsQ0FBQyxPQUFpQixFQUFFLE9BQWUsRUFBRSxnQkFBd0I7SUFDbEgsTUFBTSw4QkFBOEIsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFDdkUsTUFBTSw0QkFBNEIsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFDeEUsSUFBSSxhQUFhLEdBQVcsRUFBRSxDQUFDO0lBQy9CLDhCQUE4QixDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUM1RCxhQUFhLElBQUksbUNBQW1DLENBQUMsQ0FBQyw0QkFBNEIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxHQUFHLGdCQUFnQixDQUFDO0lBQzVILENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ25DLENBQUMifQ==