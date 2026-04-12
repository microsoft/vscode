/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorOptions } from './editorOptions.js';
import { BareFontInfo } from './fontInfo.js';
export function createBareFontInfoFromValidatedSettings(options, pixelRatio, ignoreEditorZoom) {
    const fontFamily = options.get(58 /* EditorOption.fontFamily */);
    const fontWeight = options.get(62 /* EditorOption.fontWeight */);
    const fontSize = options.get(61 /* EditorOption.fontSize */);
    const fontFeatureSettings = options.get(60 /* EditorOption.fontLigatures */);
    const fontVariationSettings = options.get(63 /* EditorOption.fontVariations */);
    const lineHeight = options.get(75 /* EditorOption.lineHeight */);
    const letterSpacing = options.get(72 /* EditorOption.letterSpacing */);
    return BareFontInfo._create(fontFamily, fontWeight, fontSize, fontFeatureSettings, fontVariationSettings, lineHeight, letterSpacing, pixelRatio, ignoreEditorZoom);
}
export function createBareFontInfoFromRawSettings(opts, pixelRatio, ignoreEditorZoom = false) {
    const fontFamily = EditorOptions.fontFamily.validate(opts.fontFamily);
    const fontWeight = EditorOptions.fontWeight.validate(opts.fontWeight);
    const fontSize = EditorOptions.fontSize.validate(opts.fontSize);
    const fontFeatureSettings = EditorOptions.fontLigatures2.validate(opts.fontLigatures);
    const fontVariationSettings = EditorOptions.fontVariations.validate(opts.fontVariations);
    const lineHeight = EditorOptions.lineHeight.validate(opts.lineHeight);
    const letterSpacing = EditorOptions.letterSpacing.validate(opts.letterSpacing);
    return BareFontInfo._create(fontFamily, fontWeight, fontSize, fontFeatureSettings, fontVariationSettings, lineHeight, letterSpacing, pixelRatio, ignoreEditorZoom);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9udEluZm9Gcm9tU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mb0Zyb21TZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQWdCLGFBQWEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ2pFLE9BQU8sRUFBMkIsWUFBWSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRXRFLE1BQU0sVUFBVSx1Q0FBdUMsQ0FBQyxPQUFnQyxFQUFFLFVBQWtCLEVBQUUsZ0JBQXlCO0lBQ3RJLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLGtDQUF5QixDQUFDO0lBQ3hELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLGtDQUF5QixDQUFDO0lBQ3hELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxHQUFHLGdDQUF1QixDQUFDO0lBQ3BELE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLEdBQUcscUNBQTRCLENBQUM7SUFDcEUsTUFBTSxxQkFBcUIsR0FBRyxPQUFPLENBQUMsR0FBRyxzQ0FBNkIsQ0FBQztJQUN2RSxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsR0FBRyxrQ0FBeUIsQ0FBQztJQUN4RCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsR0FBRyxxQ0FBNEIsQ0FBQztJQUM5RCxPQUFPLFlBQVksQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsbUJBQW1CLEVBQUUscUJBQXFCLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztBQUNwSyxDQUFDO0FBRUQsTUFBTSxVQUFVLGlDQUFpQyxDQUFDLElBUWpELEVBQUUsVUFBa0IsRUFBRSxtQkFBNEIsS0FBSztJQUN2RCxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDdEUsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3RFLE1BQU0sUUFBUSxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNoRSxNQUFNLG1CQUFtQixHQUFHLGFBQWEsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUN0RixNQUFNLHFCQUFxQixHQUFHLGFBQWEsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUN6RixNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDdEUsTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQy9FLE9BQU8sWUFBWSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxtQkFBbUIsRUFBRSxxQkFBcUIsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ3BLLENBQUMifQ==