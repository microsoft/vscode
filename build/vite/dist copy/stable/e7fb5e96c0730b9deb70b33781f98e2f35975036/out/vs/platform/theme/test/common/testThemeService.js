/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Color } from '../../../../base/common/color.js';
import { Emitter } from '../../../../base/common/event.js';
import { ColorScheme } from '../../common/theme.js';
export class TestColorTheme {
    constructor(colors = {}, type = ColorScheme.DARK, semanticHighlighting = false) {
        this.colors = colors;
        this.type = type;
        this.semanticHighlighting = semanticHighlighting;
        this.label = 'test';
    }
    getColor(color, useDefault) {
        const value = this.colors[color];
        if (value) {
            return Color.fromHex(value);
        }
        return undefined;
    }
    defines(color) {
        throw new Error('Method not implemented.');
    }
    getTokenStyleMetadata(type, modifiers, modelLanguage) {
        return undefined;
    }
    get tokenColorMap() {
        return [];
    }
    get tokenFontMap() {
        return [];
    }
}
class TestFileIconTheme {
    constructor() {
        this.hasFileIcons = false;
        this.hasFolderIcons = false;
        this.hidesExplorerArrows = false;
    }
}
class UnthemedProductIconTheme {
    getIcon(contribution) {
        return undefined;
    }
}
export class TestThemeService {
    constructor(theme = new TestColorTheme(), fileIconTheme = new TestFileIconTheme(), productIconTheme = new UnthemedProductIconTheme()) {
        this._onThemeChange = new Emitter();
        this._onFileIconThemeChange = new Emitter();
        this._onProductIconThemeChange = new Emitter();
        this._colorTheme = theme;
        this._fileIconTheme = fileIconTheme;
        this._productIconTheme = productIconTheme;
    }
    getColorTheme() {
        return this._colorTheme;
    }
    setTheme(theme) {
        this._colorTheme = theme;
        this.fireThemeChange();
    }
    fireThemeChange() {
        this._onThemeChange.fire(this._colorTheme);
    }
    get onDidColorThemeChange() {
        return this._onThemeChange.event;
    }
    getFileIconTheme() {
        return this._fileIconTheme;
    }
    get onDidFileIconThemeChange() {
        return this._onFileIconThemeChange.event;
    }
    getProductIconTheme() {
        return this._productIconTheme;
    }
    get onDidProductIconThemeChange() {
        return this._onProductIconThemeChange.event;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFRoZW1lU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFHcEQsTUFBTSxPQUFPLGNBQWM7SUFJMUIsWUFDUyxTQUErQyxFQUFFLEVBQ2xELE9BQU8sV0FBVyxDQUFDLElBQUksRUFDZCx1QkFBdUIsS0FBSztRQUZwQyxXQUFNLEdBQU4sTUFBTSxDQUEyQztRQUNsRCxTQUFJLEdBQUosSUFBSSxDQUFtQjtRQUNkLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBUTtRQUw3QixVQUFLLEdBQUcsTUFBTSxDQUFDO0lBTTNCLENBQUM7SUFFTCxRQUFRLENBQUMsS0FBYSxFQUFFLFVBQW9CO1FBQzNDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakMsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM3QixDQUFDO1FBQ0QsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELE9BQU8sQ0FBQyxLQUFhO1FBQ3BCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQscUJBQXFCLENBQUMsSUFBWSxFQUFFLFNBQW1CLEVBQUUsYUFBcUI7UUFDN0UsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELElBQUksYUFBYTtRQUNoQixPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxJQUFJLFlBQVk7UUFDZixPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7Q0FDRDtBQUVELE1BQU0saUJBQWlCO0lBQXZCO1FBQ0MsaUJBQVksR0FBRyxLQUFLLENBQUM7UUFDckIsbUJBQWMsR0FBRyxLQUFLLENBQUM7UUFDdkIsd0JBQW1CLEdBQUcsS0FBSyxDQUFDO0lBQzdCLENBQUM7Q0FBQTtBQUVELE1BQU0sd0JBQXdCO0lBQzdCLE9BQU8sQ0FBQyxZQUE4QjtRQUNyQyxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sZ0JBQWdCO0lBVTVCLFlBQVksUUFBcUIsSUFBSSxjQUFjLEVBQUUsRUFBRSxnQkFBZ0MsSUFBSSxpQkFBaUIsRUFBRSxFQUFFLG1CQUFzQyxJQUFJLHdCQUF3QixFQUFFO1FBSnBMLG1CQUFjLEdBQUcsSUFBSSxPQUFPLEVBQWUsQ0FBQztRQUM1QywyQkFBc0IsR0FBRyxJQUFJLE9BQU8sRUFBa0IsQ0FBQztRQUN2RCw4QkFBeUIsR0FBRyxJQUFJLE9BQU8sRUFBcUIsQ0FBQztRQUc1RCxJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUN6QixJQUFJLENBQUMsY0FBYyxHQUFHLGFBQWEsQ0FBQztRQUNwQyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsZ0JBQWdCLENBQUM7SUFDM0MsQ0FBQztJQUVELGFBQWE7UUFDWixPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDekIsQ0FBQztJQUVELFFBQVEsQ0FBQyxLQUFrQjtRQUMxQixJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUN6QixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDeEIsQ0FBQztJQUVELGVBQWU7UUFDZCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELElBQVcscUJBQXFCO1FBQy9CLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUM7SUFDbEMsQ0FBQztJQUVELGdCQUFnQjtRQUNmLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQztJQUM1QixDQUFDO0lBRUQsSUFBVyx3QkFBd0I7UUFDbEMsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDO0lBQzFDLENBQUM7SUFFRCxtQkFBbUI7UUFDbEIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUM7SUFDL0IsQ0FBQztJQUVELElBQVcsMkJBQTJCO1FBQ3JDLE9BQU8sSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQztJQUM3QyxDQUFDO0NBQ0QifQ==