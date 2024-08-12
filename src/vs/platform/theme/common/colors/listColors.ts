/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

// Import the effects we need
import { Color } from 'vs/base/common/color';
import { registerColor, darken, lighten, transparent, ifDefinedThenElse } from 'vs/platform/theme/common/colorUtils';

// Import the colors we need
import { foreground, contrastBorder, activeContrastBorder, focusBorder, iconForeground } from 'vs/platform/theme/common/colors/baseColors';
import { editorWidgetBackground, editorFindMatchHighlightBorder, editorFindMatchHighlight, widgetShadow, editorWidgetForeground } from 'vs/platform/theme/common/colors/editorColors';


export const listFocusBackground = registerColor('list.focusBackground',
	null,
	nls.localize('listFocusBackground', "List/Tree background color for the focused item when the list/tree is active. An active list/tree has keyboard focus, an inactive does not."));

export const listFocusForeground = registerColor('list.focusForeground',
	null,
	nls.localize('listFocusForeground', "List/Tree foreground color for the focused item when the list/tree is active. An active list/tree has keyboard focus, an inactive does not."));

export const listFocusOutline = registerColor('list.focusOutline',
	{ dark: focusBorder, light: focusBorder, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
	nls.localize('listFocusOutline', "List/Tree outline color for the focused item when the list/tree is active. An active list/tree has keyboard focus, an inactive does not."));

export const listFocusAndSelectionOutline = registerColor('list.focusAndSelectionOutline',
	null,
	nls.localize('listFocusAndSelectionOutline', "List/Tree outline color for the focused item when the list/tree is active and selected. An active list/tree has keyboard focus, an inactive does not."));

export const listActiveSelectionBackground = registerColor('list.activeSelectionBackground',
	{ dark: '#04395E', light: '#0060C0', hcDark: null, hcLight: Color.fromHex('#0F4A85').transparent(0.1) },
	nls.localize('listActiveSelectionBackground', "List/Tree background color for the selected item when the list/tree is active. An active list/tree has keyboard focus, an inactive does not."));

export const listActiveSelectionForeground = registerColor('list.activeSelectionForeground',
	{ dark: Color.white, light: Color.white, hcDark: null, hcLight: null },
	nls.localize('listActiveSelectionForeground', "List/Tree foreground color for the selected item when the list/tree is active. An active list/tree has keyboard focus, an inactive does not."));

export const listActiveSelectionIconForeground = registerColor('list.activeSelectionIconForeground',
	null,
	nls.localize('listActiveSelectionIconForeground', "List/Tree icon foreground color for the selected item when the list/tree is active. An active list/tree has keyboard focus, an inactive does not."));

export const listInactiveSelectionBackground = registerColor('list.inactiveSelectionBackground',
	{ dark: '#37373D', light: '#E4E6F1', hcDark: null, hcLight: Color.fromHex('#0F4A85').transparent(0.1) },
	nls.localize('listInactiveSelectionBackground', "List/Tree background color for the selected item when the list/tree is inactive. An active list/tree has keyboard focus, an inactive does not."));

export const listInactiveSelectionForeground = registerColor('list.inactiveSelectionForeground',
	null,
	nls.localize('listInactiveSelectionForeground', "List/Tree foreground color for the selected item when the list/tree is inactive. An active list/tree has keyboard focus, an inactive does not."));

export const listInactiveSelectionIconForeground = registerColor('list.inactiveSelectionIconForeground',
	null,
	nls.localize('listInactiveSelectionIconForeground', "List/Tree icon foreground color for the selected item when the list/tree is inactive. An active list/tree has keyboard focus, an inactive does not."));

export const listInactiveFocusBackground = registerColor('list.inactiveFocusBackground',
	null,
	nls.localize('listInactiveFocusBackground', "List/Tree background color for the focused item when the list/tree is inactive. An active list/tree has keyboard focus, an inactive does not."));

export const listInactiveFocusOutline = registerColor('list.inactiveFocusOutline',
	null,
	nls.localize('listInactiveFocusOutline', "List/Tree outline color for the focused item when the list/tree is inactive. An active list/tree has keyboard focus, an inactive does not."));

export const listHoverBackground = registerColor('list.hoverBackground',
	{ dark: '#2A2D2E', light: '#F0F0F0', hcDark: Color.white.transparent(0.1), hcLight: Color.fromHex('#0F4A85').transparent(0.1) },
	nls.localize('listHoverBackground', "List/Tree background when hovering over items using the mouse."));

export const listHoverForeground = registerColor('list.hoverForeground',
	null,
	nls.localize('listHoverForeground', "List/Tree foreground when hovering over items using the mouse."));

export const listDropOverBackground = registerColor('list.dropBackground',
	{ dark: '#062F4A', light: '#D6EBFF', hcDark: null, hcLight: null },
	nls.localize('listDropBackground', "List/Tree drag and drop background when moving items over other items when using the mouse."));

export const listDropBetweenBackground = registerColor('list.dropBetweenBackground',
	{ dark: iconForeground, light: iconForeground, hcDark: null, hcLight: null },
	nls.localize('listDropBetweenBackground', "List/Tree drag and drop border color when moving items between items when using the mouse."));

export const listHighlightForeground = registerColor('list.highlightForeground',
	{ dark: '#2AAAFF', light: '#0066BF', hcDark: focusBorder, hcLight: focusBorder },
	nls.localize('highlight', 'List/Tree foreground color of the match highlights when searching inside the list/tree.'));

export const listFocusHighlightForeground = registerColor('list.focusHighlightForeground',
	{ dark: listHighlightForeground, light: ifDefinedThenElse(listActiveSelectionBackground, listHighlightForeground, '#BBE7FF'), hcDark: listHighlightForeground, hcLight: listHighlightForeground },
	nls.localize('listFocusHighlightForeground', 'List/Tree foreground color of the match highlights on actively focused items when searching inside the list/tree.'));

export const listInvalidItemForeground = registerColor('list.invalidItemForeground',
	{ dark: '#B89500', light: '#B89500', hcDark: '#B89500', hcLight: '#B5200D' },
	nls.localize('invalidItemForeground', 'List/Tree foreground color for invalid items, for example an unresolved root in explorer.'));

export const listErrorForeground = registerColor('list.errorForeground',
	{ dark: '#F88070', light: '#B01011', hcDark: null, hcLight: null }, nls.localize('listErrorForeground', 'Foreground color of list items containing errors.'));

export const listWarningForeground = registerColor('list.warningForeground',
	{ dark: '#CCA700', light: '#855F00', hcDark: null, hcLight: null }, nls.localize('listWarningForeground', 'Foreground color of list items containing warnings.'));

export const listFilterWidgetBackground = registerColor('listFilterWidget.background',
	{ light: darken(editorWidgetBackground, 0), dark: lighten(editorWidgetBackground, 0), hcDark: editorWidgetBackground, hcLight: editorWidgetBackground },
	nls.localize('listFilterWidgetBackground', 'Background color of the type filter widget in lists and trees.'));

export const listFilterWidgetOutline = registerColor('listFilterWidget.outline',
	{ dark: Color.transparent, light: Color.transparent, hcDark: '#f38518', hcLight: '#007ACC' },
	nls.localize('listFilterWidgetOutline', 'Outline color of the type filter widget in lists and trees.'));

export const listFilterWidgetNoMatchesOutline = registerColor('listFilterWidget.noMatchesOutline',
	{ dark: '#BE1100', light: '#BE1100', hcDark: contrastBorder, hcLight: contrastBorder },
	nls.localize('listFilterWidgetNoMatchesOutline', 'Outline color of the type filter widget in lists and trees, when there are no matches.'));

export const listFilterWidgetShadow = registerColor('listFilterWidget.shadow',
	widgetShadow,
	nls.localize('listFilterWidgetShadow', 'Shadow color of the type filter widget in lists and trees.'));

export const listFilterMatchHighlight = registerColor('list.filterMatchBackground',
	{ dark: editorFindMatchHighlight, light: editorFindMatchHighlight, hcDark: null, hcLight: null },
	nls.localize('listFilterMatchHighlight', 'Background color of the filtered match.'));

export const listFilterMatchHighlightBorder = registerColor('list.filterMatchBorder',
	{ dark: editorFindMatchHighlightBorder, light: editorFindMatchHighlightBorder, hcDark: contrastBorder, hcLight: activeContrastBorder },
	nls.localize('listFilterMatchHighlightBorder', 'Border color of the filtered match.'));

export const listDeemphasizedForeground = registerColor('list.deemphasizedForeground',
	{ dark: '#8C8C8C', light: '#8E8E90', hcDark: '#A7A8A9', hcLight: '#666666' },
	nls.localize('listDeemphasizedForeground', "List/Tree foreground color for items that are deemphasized."));


// ------ tree

export const treeIndentGuidesStroke = registerColor('tree.indentGuidesStroke',
	{ dark: '#585858', light: '#a9a9a9', hcDark: '#a9a9a9', hcLight: '#a5a5a5' },
	nls.localize('treeIndentGuidesStroke', "Tree stroke color for the indentation guides."));

export const treeInactiveIndentGuidesStroke = registerColor('tree.inactiveIndentGuidesStroke',
	transparent(treeIndentGuidesStroke, 0.4),
	nls.localize('treeInactiveIndentGuidesStroke', "Tree stroke color for the indentation guides that are not active."));


// ------ table

export const tableColumnsBorder = registerColor('tree.tableColumnsBorder',
	{ dark: '#CCCCCC20', light: '#61616120', hcDark: null, hcLight: null },
	nls.localize('tableColumnsBorder', "Table border color between columns."));

export const tableOddRowsBackgroundColor = registerColor('tree.tableOddRowsBackground',
	{ dark: transparent(foreground, 0.04), light: transparent(foreground, 0.04), hcDark: null, hcLight: null },
	nls.localize('tableOddRowsBackgroundColor', "Background color for odd table rows."));

// ------ action list

export const editorActionListBackground = registerColor('editorActionList.background',
	editorWidgetBackground,
	nls.localize('editorActionListBackground', "Action List background color."));

export const editorActionListForeground = registerColor('editorActionList.foreground',
	editorWidgetForeground,
	nls.localize('editorActionListForeground', "Action List foreground color."));

export const editorActionListFocusForeground = registerColor('editorActionList.focusForeground',
	listActiveSelectionForeground,
	nls.localize('editorActionListFocusForeground', "Action List foreground color for the focused item."));

export const editorActionListFocusBackground = registerColor('editorActionList.focusBackground',
	listActiveSelectionBackground,
	nls.localize('editorActionListFocusBackground', "Action List background color for the focused item."));
