/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mainWindow } from './window.js';
import { isElectron, isMacintosh, isWindows } from '../common/platform.js';
/**
 * The best font-family to be used in CSS based on the platform:
 * - Windows: Segoe preferred, fallback to sans-serif
 * - macOS: standard system font, fallback to sans-serif
 * - Linux: standard system font preferred, fallback to Ubuntu fonts
 *
 * Note: this currently does not adjust for different locales.
 */
export const DEFAULT_FONT_FAMILY = isWindows ? '"Segoe WPC", "Segoe UI", sans-serif' : isMacintosh ? '-apple-system, BlinkMacSystemFont, sans-serif' : 'system-ui, "Ubuntu", "Droid Sans", sans-serif';
export const getFonts = async () => {
    try {
        // @ts-ignore
        const fonts = await mainWindow.queryLocalFonts();
        const fontsArray = [...fonts];
        const families = fontsArray.map(font => font.family);
        return families;
    }
    catch (error) {
        console.error(`Failed to query fonts: ${error}`);
        return [];
    }
};
export const getFontSnippets = async () => {
    if (!isElectron) {
        return [];
    }
    const fonts = await getFonts();
    const snippets = fonts.map(font => {
        return {
            body: `${font}`
        };
    });
    return snippets;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9udHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvZm9udHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUV6QyxPQUFPLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUUzRTs7Ozs7OztHQU9HO0FBQ0gsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDLENBQUMsK0NBQStDLENBQUM7QUFNdk0sTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFHLEtBQUssSUFBdUIsRUFBRTtJQUNyRCxJQUFJLENBQUM7UUFDSixhQUFhO1FBQ2IsTUFBTSxLQUFLLEdBQUcsTUFBTSxVQUFVLENBQUMsZUFBZSxFQUFnQixDQUFDO1FBQy9ELE1BQU0sVUFBVSxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztRQUM5QixNQUFNLFFBQVEsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JELE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2hCLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDakQsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBR0YsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHLEtBQUssSUFBbUMsRUFBRTtJQUN4RSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDakIsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBQ0QsTUFBTSxLQUFLLEdBQUcsTUFBTSxRQUFRLEVBQUUsQ0FBQztJQUMvQixNQUFNLFFBQVEsR0FBeUIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUN2RCxPQUFPO1lBQ04sSUFBSSxFQUFFLEdBQUcsSUFBSSxFQUFFO1NBQ2YsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0gsT0FBTyxRQUFRLENBQUM7QUFDakIsQ0FBQyxDQUFDIn0=