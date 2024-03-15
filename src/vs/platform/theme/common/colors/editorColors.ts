/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

// Import the effects we need
import { Color, RGBA } from 'vs/base/common/color';
import { registerColor, transparent, lessProminent, darken, lighten } from 'vs/platform/theme/common/colorUtils';

// Import the colors we need
import { foreground, contrastBorder, activeContrastBorder } from 'vs/platform/theme/common/colors/baseColors';
import { scrollbarShadow, badgeBackground } from 'vs/platform/theme/common/colors/miscColors';


// ----- editor

export const editorBackground = registerColor('editor.background',
	{ light: '#ffffff', dark: '#1E1E1E', hcDark: Color.black, hcLight: Color.white },
	nls.localize('editorBackground', "Editor background color."));

export const editorForeground = registerColor('editor.foreground',
	{ light: '#333333', dark: '#BBBBBB', hcDark: Color.white, hcLight: foreground },
	nls.localize('editorForeground', "Editor default foreground color."));


export const editorStickyScrollBackground = registerColor('editorStickyScroll.background',
	{ light: editorBackground, dark: editorBackground, hcDark: editorBackground, hcLight: editorBackground },
	nls.localize('editorStickyScrollBackground', "Background color of sticky scroll in the editor"));

export const editorStickyScrollHoverBackground = registerColor('editorStickyScrollHover.background',
	{ dark: '#2A2D2E', light: '#F0F0F0', hcDark: null, hcLight: Color.fromHex('#0F4A85').transparent(0.1) },
	nls.localize('editorStickyScrollHoverBackground', "Background color of sticky scroll on hover in the editor"));

export const editorStickyScrollBorder = registerColor('editorStickyScroll.border',
	{ dark: null, light: null, hcDark: contrastBorder, hcLight: contrastBorder },
	nls.localize('editorStickyScrollBorder', "Border color of sticky scroll in the editor"));

export const editorStickyScrollShadow = registerColor('editorStickyScroll.shadow',
	{ dark: scrollbarShadow, light: scrollbarShadow, hcDark: scrollbarShadow, hcLight: scrollbarShadow },
	nls.localize('editorStickyScrollShadow', " Shadow color of sticky scroll in the editor"));


export const editorWidgetBackground = registerColor('editorWidget.background',
	{ dark: '#252526', light: '#F3F3F3', hcDark: '#0C141F', hcLight: Color.white },
	nls.localize('editorWidgetBackground', 'Background color of editor widgets, such as find/replace.'));

export const editorWidgetForeground = registerColor('editorWidget.foreground',
	{ dark: foreground, light: foreground, hcDark: foreground, hcLight: foreground },
	nls.localize('editorWidgetForeground', 'Foreground color of editor widgets, such as find/replace.'));

export const editorWidgetBorder = registerColor('editorWidget.border',
	{ dark: '#454545', light: '#C8C8C8', hcDark: contrastBorder, hcLight: contrastBorder },
	nls.localize('editorWidgetBorder', 'Border color of editor widgets. The color is only used if the widget chooses to have a border and if the color is not overridden by a widget.'));

export const editorWidgetResizeBorder = registerColor('editorWidget.resizeBorder',
	{ light: null, dark: null, hcDark: null, hcLight: null },
	nls.localize('editorWidgetResizeBorder', "Border color of the resize bar of editor widgets. The color is only used if the widget chooses to have a resize border and if the color is not overridden by a widget."));


export const editorErrorBackground = registerColor('editorError.background',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	nls.localize('editorError.background', 'Background color of error text in the editor. The color must not be opaque so as not to hide underlying decorations.'), true);

export const editorErrorForeground = registerColor('editorError.foreground',
	{ dark: '#F14C4C', light: '#E51400', hcDark: '#F48771', hcLight: '#B5200D' },
	nls.localize('editorError.foreground', 'Foreground color of error squigglies in the editor.'));

export const editorErrorBorder = registerColor('editorError.border',
	{ dark: null, light: null, hcDark: Color.fromHex('#E47777').transparent(0.8), hcLight: '#B5200D' },
	nls.localize('errorBorder', 'If set, color of double underlines for errors in the editor.'));


export const editorWarningBackground = registerColor('editorWarning.background',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	nls.localize('editorWarning.background', 'Background color of warning text in the editor. The color must not be opaque so as not to hide underlying decorations.'), true);

export const editorWarningForeground = registerColor('editorWarning.foreground',
	{ dark: '#CCA700', light: '#BF8803', hcDark: '#FFD370', hcLight: '#895503' },
	nls.localize('editorWarning.foreground', 'Foreground color of warning squigglies in the editor.'));

export const editorWarningBorder = registerColor('editorWarning.border',
	{ dark: null, light: null, hcDark: Color.fromHex('#FFCC00').transparent(0.8), hcLight: Color.fromHex('#FFCC00').transparent(0.8) },
	nls.localize('warningBorder', 'If set, color of double underlines for warnings in the editor.'));


export const editorInfoBackground = registerColor('editorInfo.background',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	nls.localize('editorInfo.background', 'Background color of info text in the editor. The color must not be opaque so as not to hide underlying decorations.'), true);

export const editorInfoForeground = registerColor('editorInfo.foreground',
	{ dark: '#3794FF', light: '#1a85ff', hcDark: '#3794FF', hcLight: '#1a85ff' },
	nls.localize('editorInfo.foreground', 'Foreground color of info squigglies in the editor.'));

export const editorInfoBorder = registerColor('editorInfo.border',
	{ dark: null, light: null, hcDark: Color.fromHex('#3794FF').transparent(0.8), hcLight: '#292929' },
	nls.localize('infoBorder', 'If set, color of double underlines for infos in the editor.'));


export const editorHintForeground = registerColor('editorHint.foreground',
	{ dark: Color.fromHex('#eeeeee').transparent(0.7), light: '#6c6c6c', hcDark: null, hcLight: null },
	nls.localize('editorHint.foreground', 'Foreground color of hint squigglies in the editor.'));

export const editorHintBorder = registerColor('editorHint.border',
	{ dark: null, light: null, hcDark: Color.fromHex('#eeeeee').transparent(0.8), hcLight: '#292929' },
	nls.localize('hintBorder', 'If set, color of double underlines for hints in the editor.'));


export const editorActiveLinkForeground = registerColor('editorLink.activeForeground',
	{ dark: '#4E94CE', light: Color.blue, hcDark: Color.cyan, hcLight: '#292929' },
	nls.localize('activeLinkForeground', 'Color of active links.'));


// ----- editor selection

export const editorSelectionBackground = registerColor('editor.selectionBackground',
	{ light: '#ADD6FF', dark: '#264F78', hcDark: '#f3f518', hcLight: '#0F4A85' },
	nls.localize('editorSelectionBackground', "Color of the editor selection."));

export const editorSelectionForeground = registerColor('editor.selectionForeground',
	{ light: null, dark: null, hcDark: '#000000', hcLight: Color.white },
	nls.localize('editorSelectionForeground', "Color of the selected text for high contrast."));

export const editorInactiveSelection = registerColor('editor.inactiveSelectionBackground',
	{ light: transparent(editorSelectionBackground, 0.5), dark: transparent(editorSelectionBackground, 0.5), hcDark: transparent(editorSelectionBackground, 0.7), hcLight: transparent(editorSelectionBackground, 0.5) },
	nls.localize('editorInactiveSelection', "Color of the selection in an inactive editor. The color must not be opaque so as not to hide underlying decorations."), true);

export const editorSelectionHighlight = registerColor('editor.selectionHighlightBackground',
	{ light: lessProminent(editorSelectionBackground, editorBackground, 0.3, 0.6), dark: lessProminent(editorSelectionBackground, editorBackground, 0.3, 0.6), hcDark: null, hcLight: null },
	nls.localize('editorSelectionHighlight', 'Color for regions with the same content as the selection. The color must not be opaque so as not to hide underlying decorations.'), true);

export const editorSelectionHighlightBorder = registerColor('editor.selectionHighlightBorder',
	{ light: null, dark: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
	nls.localize('editorSelectionHighlightBorder', "Border color for regions with the same content as the selection."));


// ----- editor find

export const editorFindMatch = registerColor('editor.findMatchBackground',
	{ light: '#A8AC94', dark: '#515C6A', hcDark: null, hcLight: null },
	nls.localize('editorFindMatch', "Color of the current search match."));

export const editorFindMatchHighlight = registerColor('editor.findMatchHighlightBackground',
	{ light: '#EA5C0055', dark: '#EA5C0055', hcDark: null, hcLight: null },
	nls.localize('findMatchHighlight', "Color of the other search matches. The color must not be opaque so as not to hide underlying decorations."), true);

export const editorFindRangeHighlight = registerColor('editor.findRangeHighlightBackground',
	{ dark: '#3a3d4166', light: '#b4b4b44d', hcDark: null, hcLight: null },
	nls.localize('findRangeHighlight', "Color of the range limiting the search. The color must not be opaque so as not to hide underlying decorations."), true);

export const editorFindMatchBorder = registerColor('editor.findMatchBorder',
	{ light: null, dark: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
	nls.localize('editorFindMatchBorder', "Border color of the current search match."));

export const editorFindMatchHighlightBorder = registerColor('editor.findMatchHighlightBorder',
	{ light: null, dark: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
	nls.localize('findMatchHighlightBorder', "Border color of the other search matches."));

export const editorFindRangeHighlightBorder = registerColor('editor.findRangeHighlightBorder',
	{ dark: null, light: null, hcDark: transparent(activeContrastBorder, 0.4), hcLight: transparent(activeContrastBorder, 0.4) },
	nls.localize('findRangeHighlightBorder', "Border color of the range limiting the search. The color must not be opaque so as not to hide underlying decorations."), true);


// ----- editor hover

export const editorHoverHighlight = registerColor('editor.hoverHighlightBackground',
	{ light: '#ADD6FF26', dark: '#264f7840', hcDark: '#ADD6FF26', hcLight: null },
	nls.localize('hoverHighlight', 'Highlight below the word for which a hover is shown. The color must not be opaque so as not to hide underlying decorations.'), true);

export const editorHoverBackground = registerColor('editorHoverWidget.background',
	{ light: editorWidgetBackground, dark: editorWidgetBackground, hcDark: editorWidgetBackground, hcLight: editorWidgetBackground },
	nls.localize('hoverBackground', 'Background color of the editor hover.'));

export const editorHoverForeground = registerColor('editorHoverWidget.foreground',
	{ light: editorWidgetForeground, dark: editorWidgetForeground, hcDark: editorWidgetForeground, hcLight: editorWidgetForeground },
	nls.localize('hoverForeground', 'Foreground color of the editor hover.'));

export const editorHoverBorder = registerColor('editorHoverWidget.border',
	{ light: editorWidgetBorder, dark: editorWidgetBorder, hcDark: editorWidgetBorder, hcLight: editorWidgetBorder },
	nls.localize('hoverBorder', 'Border color of the editor hover.'));

export const editorHoverStatusBarBackground = registerColor('editorHoverWidget.statusBarBackground',
	{ dark: lighten(editorHoverBackground, 0.2), light: darken(editorHoverBackground, 0.05), hcDark: editorWidgetBackground, hcLight: editorWidgetBackground },
	nls.localize('statusBarBackground', "Background color of the editor hover status bar."));


// ----- editor inlay hint

export const editorInlayHintForeground = registerColor('editorInlayHint.foreground',
	{ dark: '#969696', light: '#969696', hcDark: Color.white, hcLight: Color.black },
	nls.localize('editorInlayHintForeground', 'Foreground color of inline hints'));

export const editorInlayHintBackground = registerColor('editorInlayHint.background',
	{ dark: transparent(badgeBackground, .10), light: transparent(badgeBackground, .10), hcDark: transparent(Color.white, .10), hcLight: transparent(badgeBackground, .10) },
	nls.localize('editorInlayHintBackground', 'Background color of inline hints'));

export const editorInlayHintTypeForeground = registerColor('editorInlayHint.typeForeground',
	{ dark: editorInlayHintForeground, light: editorInlayHintForeground, hcDark: editorInlayHintForeground, hcLight: editorInlayHintForeground },
	nls.localize('editorInlayHintForegroundTypes', 'Foreground color of inline hints for types'));

export const editorInlayHintTypeBackground = registerColor('editorInlayHint.typeBackground',
	{ dark: editorInlayHintBackground, light: editorInlayHintBackground, hcDark: editorInlayHintBackground, hcLight: editorInlayHintBackground },
	nls.localize('editorInlayHintBackgroundTypes', 'Background color of inline hints for types'));

export const editorInlayHintParameterForeground = registerColor('editorInlayHint.parameterForeground',
	{ dark: editorInlayHintForeground, light: editorInlayHintForeground, hcDark: editorInlayHintForeground, hcLight: editorInlayHintForeground },
	nls.localize('editorInlayHintForegroundParameter', 'Foreground color of inline hints for parameters'));

export const editorInlayHintParameterBackground = registerColor('editorInlayHint.parameterBackground',
	{ dark: editorInlayHintBackground, light: editorInlayHintBackground, hcDark: editorInlayHintBackground, hcLight: editorInlayHintBackground },
	nls.localize('editorInlayHintBackgroundParameter', 'Background color of inline hints for parameters'));


// ----- editor lightbulb

export const editorLightBulbForeground = registerColor('editorLightBulb.foreground',
	{ dark: '#FFCC00', light: '#DDB100', hcDark: '#FFCC00', hcLight: '#007ACC' },
	nls.localize('editorLightBulbForeground', "The color used for the lightbulb actions icon."));

export const editorLightBulbAutoFixForeground = registerColor('editorLightBulbAutoFix.foreground',
	{ dark: '#75BEFF', light: '#007ACC', hcDark: '#75BEFF', hcLight: '#007ACC' },
	nls.localize('editorLightBulbAutoFixForeground', "The color used for the lightbulb auto fix actions icon."));

export const editorLightBulbAiForeground = registerColor('editorLightBulbAi.foreground',
	{ dark: editorLightBulbForeground, light: editorLightBulbForeground, hcDark: editorLightBulbForeground, hcLight: editorLightBulbForeground },
	nls.localize('editorLightBulbAiForeground', "The color used for the lightbulb AI icon."));


// ----- editor snippet

export const snippetTabstopHighlightBackground = registerColor('editor.snippetTabstopHighlightBackground',
	{ dark: new Color(new RGBA(124, 124, 124, 0.3)), light: new Color(new RGBA(10, 50, 100, 0.2)), hcDark: new Color(new RGBA(124, 124, 124, 0.3)), hcLight: new Color(new RGBA(10, 50, 100, 0.2)) },
	nls.localize('snippetTabstopHighlightBackground', "Highlight background color of a snippet tabstop."));

export const snippetTabstopHighlightBorder = registerColor('editor.snippetTabstopHighlightBorder',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	nls.localize('snippetTabstopHighlightBorder', "Highlight border color of a snippet tabstop."));

export const snippetFinalTabstopHighlightBackground = registerColor('editor.snippetFinalTabstopHighlightBackground',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	nls.localize('snippetFinalTabstopHighlightBackground', "Highlight background color of the final tabstop of a snippet."));

export const snippetFinalTabstopHighlightBorder = registerColor('editor.snippetFinalTabstopHighlightBorder',
	{ dark: '#525252', light: new Color(new RGBA(10, 50, 100, 0.5)), hcDark: '#525252', hcLight: '#292929' },
	nls.localize('snippetFinalTabstopHighlightBorder', "Highlight border color of the final tabstop of a snippet."));


// ----- diff editor

export const defaultInsertColor = new Color(new RGBA(155, 185, 85, .2));
export const defaultRemoveColor = new Color(new RGBA(255, 0, 0, .2));

export const diffInserted = registerColor('diffEditor.insertedTextBackground',
	{ dark: '#9ccc2c33', light: '#9ccc2c40', hcDark: null, hcLight: null },
	nls.localize('diffEditorInserted', 'Background color for text that got inserted. The color must not be opaque so as not to hide underlying decorations.'), true);

export const diffRemoved = registerColor('diffEditor.removedTextBackground',
	{ dark: '#ff000033', light: '#ff000033', hcDark: null, hcLight: null },
	nls.localize('diffEditorRemoved', 'Background color for text that got removed. The color must not be opaque so as not to hide underlying decorations.'), true);


export const diffInsertedLine = registerColor('diffEditor.insertedLineBackground',
	{ dark: defaultInsertColor, light: defaultInsertColor, hcDark: null, hcLight: null },
	nls.localize('diffEditorInsertedLines', 'Background color for lines that got inserted. The color must not be opaque so as not to hide underlying decorations.'), true);

export const diffRemovedLine = registerColor('diffEditor.removedLineBackground',
	{ dark: defaultRemoveColor, light: defaultRemoveColor, hcDark: null, hcLight: null },
	nls.localize('diffEditorRemovedLines', 'Background color for lines that got removed. The color must not be opaque so as not to hide underlying decorations.'), true);


export const diffInsertedLineGutter = registerColor('diffEditorGutter.insertedLineBackground',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	nls.localize('diffEditorInsertedLineGutter', 'Background color for the margin where lines got inserted.'));

export const diffRemovedLineGutter = registerColor('diffEditorGutter.removedLineBackground',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	nls.localize('diffEditorRemovedLineGutter', 'Background color for the margin where lines got removed.'));


export const diffOverviewRulerInserted = registerColor('diffEditorOverview.insertedForeground',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	nls.localize('diffEditorOverviewInserted', 'Diff overview ruler foreground for inserted content.'));

export const diffOverviewRulerRemoved = registerColor('diffEditorOverview.removedForeground',
	{ dark: null, light: null, hcDark: null, hcLight: null },
	nls.localize('diffEditorOverviewRemoved', 'Diff overview ruler foreground for removed content.'));


export const diffInsertedOutline = registerColor('diffEditor.insertedTextBorder',
	{ dark: null, light: null, hcDark: '#33ff2eff', hcLight: '#374E06' },
	nls.localize('diffEditorInsertedOutline', 'Outline color for the text that got inserted.'));

export const diffRemovedOutline = registerColor('diffEditor.removedTextBorder',
	{ dark: null, light: null, hcDark: '#FF008F', hcLight: '#AD0707' },
	nls.localize('diffEditorRemovedOutline', 'Outline color for text that got removed.'));


export const diffBorder = registerColor('diffEditor.border',
	{ dark: null, light: null, hcDark: contrastBorder, hcLight: contrastBorder },
	nls.localize('diffEditorBorder', 'Border color between the two text editors.'));

export const diffDiagonalFill = registerColor('diffEditor.diagonalFill',
	{ dark: '#cccccc33', light: '#22222233', hcDark: null, hcLight: null },
	nls.localize('diffDiagonalFill', "Color of the diff editor's diagonal fill. The diagonal fill is used in side-by-side diff views."));


export const diffUnchangedRegionBackground = registerColor('diffEditor.unchangedRegionBackground',
	{ dark: 'sideBar.background', light: 'sideBar.background', hcDark: 'sideBar.background', hcLight: 'sideBar.background' },
	nls.localize('diffEditor.unchangedRegionBackground', "The background color of unchanged blocks in the diff editor."));

export const diffUnchangedRegionForeground = registerColor('diffEditor.unchangedRegionForeground',
	{ dark: 'foreground', light: 'foreground', hcDark: 'foreground', hcLight: 'foreground' },
	nls.localize('diffEditor.unchangedRegionForeground', "The foreground color of unchanged blocks in the diff editor."));

export const diffUnchangedTextBackground = registerColor('diffEditor.unchangedCodeBackground',
	{ dark: '#74747429', light: '#b8b8b829', hcDark: null, hcLight: null },
	nls.localize('diffEditor.unchangedCodeBackground', "The background color of unchanged code in the diff editor."));


// ----- widget

export const widgetShadow = registerColor('widget.shadow',
	{ dark: transparent(Color.black, .36), light: transparent(Color.black, .16), hcDark: null, hcLight: null },
	nls.localize('widgetShadow', 'Shadow color of widgets such as find/replace inside the editor.'));

export const widgetBorder = registerColor('widget.border',
	{ dark: null, light: null, hcDark: contrastBorder, hcLight: contrastBorder },
	nls.localize('widgetBorder', 'Border color of widgets such as find/replace inside the editor.'));


// ----- toolbar

export const toolbarHoverBackground = registerColor('toolbar.hoverBackground',
	{ dark: '#5a5d5e50', light: '#b8b8b850', hcDark: null, hcLight: null },
	nls.localize('toolbarHoverBackground', "Toolbar background when hovering over actions using the mouse"));

export const toolbarHoverOutline = registerColor('toolbar.hoverOutline',
	{ dark: null, light: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
	nls.localize('toolbarHoverOutline', "Toolbar outline when hovering over actions using the mouse"));

export const toolbarActiveBackground = registerColor('toolbar.activeBackground',
	{ dark: lighten(toolbarHoverBackground, 0.1), light: darken(toolbarHoverBackground, 0.1), hcDark: null, hcLight: null },
	nls.localize('toolbarActiveBackground', "Toolbar background when holding the mouse over actions"));


// ----- breadcumbs

export const breadcrumbsForeground = registerColor('breadcrumb.foreground',
	{ light: transparent(foreground, 0.8), dark: transparent(foreground, 0.8), hcDark: transparent(foreground, 0.8), hcLight: transparent(foreground, 0.8) },
	nls.localize('breadcrumbsFocusForeground', "Color of focused breadcrumb items."));

export const breadcrumbsBackground = registerColor('breadcrumb.background',
	{ light: editorBackground, dark: editorBackground, hcDark: editorBackground, hcLight: editorBackground },
	nls.localize('breadcrumbsBackground', "Background color of breadcrumb items."));

export const breadcrumbsFocusForeground = registerColor('breadcrumb.focusForeground',
	{ light: darken(foreground, 0.2), dark: lighten(foreground, 0.1), hcDark: lighten(foreground, 0.1), hcLight: lighten(foreground, 0.1) },
	nls.localize('breadcrumbsFocusForeground', "Color of focused breadcrumb items."));

export const breadcrumbsActiveSelectionForeground = registerColor('breadcrumb.activeSelectionForeground',
	{ light: darken(foreground, 0.2), dark: lighten(foreground, 0.1), hcDark: lighten(foreground, 0.1), hcLight: lighten(foreground, 0.1) },
	nls.localize('breadcrumbsSelectedForeground', "Color of selected breadcrumb items."));

export const breadcrumbsPickerBackground = registerColor('breadcrumbPicker.background',
	{ light: editorWidgetBackground, dark: editorWidgetBackground, hcDark: editorWidgetBackground, hcLight: editorWidgetBackground },
	nls.localize('breadcrumbsSelectedBackground', "Background color of breadcrumb item picker."));


// ----- merge

const headerTransparency = 0.5;
const currentBaseColor = Color.fromHex('#40C8AE').transparent(headerTransparency);
const incomingBaseColor = Color.fromHex('#40A6FF').transparent(headerTransparency);
const commonBaseColor = Color.fromHex('#606060').transparent(0.4);
const contentTransparency = 0.4;
const rulerTransparency = 1;

export const mergeCurrentHeaderBackground = registerColor('merge.currentHeaderBackground',
	{ dark: currentBaseColor, light: currentBaseColor, hcDark: null, hcLight: null },
	nls.localize('mergeCurrentHeaderBackground', 'Current header background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations.'), true);

export const mergeCurrentContentBackground = registerColor('merge.currentContentBackground',
	{ dark: transparent(mergeCurrentHeaderBackground, contentTransparency), light: transparent(mergeCurrentHeaderBackground, contentTransparency), hcDark: transparent(mergeCurrentHeaderBackground, contentTransparency), hcLight: transparent(mergeCurrentHeaderBackground, contentTransparency) },
	nls.localize('mergeCurrentContentBackground', 'Current content background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations.'), true);

export const mergeIncomingHeaderBackground = registerColor('merge.incomingHeaderBackground',
	{ dark: incomingBaseColor, light: incomingBaseColor, hcDark: null, hcLight: null },
	nls.localize('mergeIncomingHeaderBackground', 'Incoming header background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations.'), true);

export const mergeIncomingContentBackground = registerColor('merge.incomingContentBackground',
	{ dark: transparent(mergeIncomingHeaderBackground, contentTransparency), light: transparent(mergeIncomingHeaderBackground, contentTransparency), hcDark: transparent(mergeIncomingHeaderBackground, contentTransparency), hcLight: transparent(mergeIncomingHeaderBackground, contentTransparency) },
	nls.localize('mergeIncomingContentBackground', 'Incoming content background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations.'), true);

export const mergeCommonHeaderBackground = registerColor('merge.commonHeaderBackground',
	{ dark: commonBaseColor, light: commonBaseColor, hcDark: null, hcLight: null },
	nls.localize('mergeCommonHeaderBackground', 'Common ancestor header background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations.'), true);

export const mergeCommonContentBackground = registerColor('merge.commonContentBackground',
	{ dark: transparent(mergeCommonHeaderBackground, contentTransparency), light: transparent(mergeCommonHeaderBackground, contentTransparency), hcDark: transparent(mergeCommonHeaderBackground, contentTransparency), hcLight: transparent(mergeCommonHeaderBackground, contentTransparency) },
	nls.localize('mergeCommonContentBackground', 'Common ancestor content background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations.'), true);

export const mergeBorder = registerColor('merge.border',
	{ dark: null, light: null, hcDark: '#C3DF6F', hcLight: '#007ACC' },
	nls.localize('mergeBorder', 'Border color on headers and the splitter in inline merge-conflicts.'));


export const overviewRulerCurrentContentForeground = registerColor('editorOverviewRuler.currentContentForeground',
	{ dark: transparent(mergeCurrentHeaderBackground, rulerTransparency), light: transparent(mergeCurrentHeaderBackground, rulerTransparency), hcDark: mergeBorder, hcLight: mergeBorder },
	nls.localize('overviewRulerCurrentContentForeground', 'Current overview ruler foreground for inline merge-conflicts.'));

export const overviewRulerIncomingContentForeground = registerColor('editorOverviewRuler.incomingContentForeground',
	{ dark: transparent(mergeIncomingHeaderBackground, rulerTransparency), light: transparent(mergeIncomingHeaderBackground, rulerTransparency), hcDark: mergeBorder, hcLight: mergeBorder },
	nls.localize('overviewRulerIncomingContentForeground', 'Incoming overview ruler foreground for inline merge-conflicts.'));

export const overviewRulerCommonContentForeground = registerColor('editorOverviewRuler.commonContentForeground',
	{ dark: transparent(mergeCommonHeaderBackground, rulerTransparency), light: transparent(mergeCommonHeaderBackground, rulerTransparency), hcDark: mergeBorder, hcLight: mergeBorder },
	nls.localize('overviewRulerCommonContentForeground', 'Common ancestor overview ruler foreground for inline merge-conflicts.'));

export const overviewRulerFindMatchForeground = registerColor('editorOverviewRuler.findMatchForeground',
	{ dark: '#d186167e', light: '#d186167e', hcDark: '#AB5A00', hcLight: '' },
	nls.localize('overviewRulerFindMatchForeground', 'Overview ruler marker color for find matches. The color must not be opaque so as not to hide underlying decorations.'), true);

export const overviewRulerSelectionHighlightForeground = registerColor('editorOverviewRuler.selectionHighlightForeground',
	{ dark: '#A0A0A0CC', light: '#A0A0A0CC', hcDark: '#A0A0A0CC', hcLight: '#A0A0A0CC' },
	nls.localize('overviewRulerSelectionHighlightForeground', 'Overview ruler marker color for selection highlights. The color must not be opaque so as not to hide underlying decorations.'), true);


// ----- problems

export const problemsErrorIconForeground = registerColor('problemsErrorIcon.foreground',
	{ dark: editorErrorForeground, light: editorErrorForeground, hcDark: editorErrorForeground, hcLight: editorErrorForeground },
	nls.localize('problemsErrorIconForeground', "The color used for the problems error icon."));

export const problemsWarningIconForeground = registerColor('problemsWarningIcon.foreground',
	{ dark: editorWarningForeground, light: editorWarningForeground, hcDark: editorWarningForeground, hcLight: editorWarningForeground },
	nls.localize('problemsWarningIconForeground', "The color used for the problems warning icon."));

export const problemsInfoIconForeground = registerColor('problemsInfoIcon.foreground',
	{ dark: editorInfoForeground, light: editorInfoForeground, hcDark: editorInfoForeground, hcLight: editorInfoForeground },
	nls.localize('problemsInfoIconForeground', "The color used for the problems info icon."));
