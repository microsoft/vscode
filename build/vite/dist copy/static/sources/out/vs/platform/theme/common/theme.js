/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Color scheme used by the OS and by color themes.
 */
export var ColorScheme;
(function (ColorScheme) {
    ColorScheme["DARK"] = "dark";
    ColorScheme["LIGHT"] = "light";
    ColorScheme["HIGH_CONTRAST_DARK"] = "hcDark";
    ColorScheme["HIGH_CONTRAST_LIGHT"] = "hcLight";
})(ColorScheme || (ColorScheme = {}));
export var ThemeTypeSelector;
(function (ThemeTypeSelector) {
    ThemeTypeSelector["VS"] = "vs";
    ThemeTypeSelector["VS_DARK"] = "vs-dark";
    ThemeTypeSelector["HC_BLACK"] = "hc-black";
    ThemeTypeSelector["HC_LIGHT"] = "hc-light";
})(ThemeTypeSelector || (ThemeTypeSelector = {}));
export function isHighContrast(scheme) {
    return scheme === ColorScheme.HIGH_CONTRAST_DARK || scheme === ColorScheme.HIGH_CONTRAST_LIGHT;
}
export function isDark(scheme) {
    return scheme === ColorScheme.DARK || scheme === ColorScheme.HIGH_CONTRAST_DARK;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEc7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSxXQUtYO0FBTEQsV0FBWSxXQUFXO0lBQ3RCLDRCQUFhLENBQUE7SUFDYiw4QkFBZSxDQUFBO0lBQ2YsNENBQTZCLENBQUE7SUFDN0IsOENBQStCLENBQUE7QUFDaEMsQ0FBQyxFQUxXLFdBQVcsS0FBWCxXQUFXLFFBS3RCO0FBRUQsTUFBTSxDQUFOLElBQVksaUJBS1g7QUFMRCxXQUFZLGlCQUFpQjtJQUM1Qiw4QkFBUyxDQUFBO0lBQ1Qsd0NBQW1CLENBQUE7SUFDbkIsMENBQXFCLENBQUE7SUFDckIsMENBQXFCLENBQUE7QUFDdEIsQ0FBQyxFQUxXLGlCQUFpQixLQUFqQixpQkFBaUIsUUFLNUI7QUFHRCxNQUFNLFVBQVUsY0FBYyxDQUFDLE1BQW1CO0lBQ2pELE9BQU8sTUFBTSxLQUFLLFdBQVcsQ0FBQyxrQkFBa0IsSUFBSSxNQUFNLEtBQUssV0FBVyxDQUFDLG1CQUFtQixDQUFDO0FBQ2hHLENBQUM7QUFFRCxNQUFNLFVBQVUsTUFBTSxDQUFDLE1BQW1CO0lBQ3pDLE9BQU8sTUFBTSxLQUFLLFdBQVcsQ0FBQyxJQUFJLElBQUksTUFBTSxLQUFLLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQztBQUNqRixDQUFDIn0=