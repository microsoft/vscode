/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { editorOverviewRulerBorder } from '../../../../editor/common/core/editorColorRegistry.js';
import * as nls from '../../../../nls.js';
import { registerColor, editorFindMatch, editorFindMatchHighlight, overviewRulerFindMatchForeground, editorSelectionBackground, transparent, editorHoverHighlight } from '../../../../platform/theme/common/colorRegistry.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND, PANEL_BORDER, TAB_ACTIVE_BORDER } from '../../../common/theme.js';
/**
 * The color identifiers for the terminal's ansi colors. The index in the array corresponds to the index
 * of the color in the terminal color table.
 */
export const ansiColorIdentifiers = [];
export const TERMINAL_BACKGROUND_COLOR = registerColor('terminal.background', null, nls.localize('terminal.background', 'The background color of the terminal, this allows coloring the terminal differently to the panel.'));
export const TERMINAL_FOREGROUND_COLOR = registerColor('terminal.foreground', {
    light: '#333333',
    dark: '#CCCCCC',
    hcDark: '#FFFFFF',
    hcLight: '#292929'
}, nls.localize('terminal.foreground', 'The foreground color of the terminal.'));
export const TERMINAL_CURSOR_FOREGROUND_COLOR = registerColor('terminalCursor.foreground', null, nls.localize('terminalCursor.foreground', 'The foreground color of the terminal cursor.'));
export const TERMINAL_CURSOR_BACKGROUND_COLOR = registerColor('terminalCursor.background', null, nls.localize('terminalCursor.background', 'The background color of the terminal cursor. Allows customizing the color of a character overlapped by a block cursor.'));
export const TERMINAL_SELECTION_BACKGROUND_COLOR = registerColor('terminal.selectionBackground', editorSelectionBackground, nls.localize('terminal.selectionBackground', 'The selection background color of the terminal.'));
export const TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR = registerColor('terminal.inactiveSelectionBackground', {
    light: transparent(TERMINAL_SELECTION_BACKGROUND_COLOR, 0.5),
    dark: transparent(TERMINAL_SELECTION_BACKGROUND_COLOR, 0.5),
    hcDark: transparent(TERMINAL_SELECTION_BACKGROUND_COLOR, 0.7),
    hcLight: transparent(TERMINAL_SELECTION_BACKGROUND_COLOR, 0.5)
}, nls.localize('terminal.inactiveSelectionBackground', 'The selection background color of the terminal when it does not have focus.'));
export const TERMINAL_SELECTION_FOREGROUND_COLOR = registerColor('terminal.selectionForeground', {
    light: null,
    dark: null,
    hcDark: '#000000',
    hcLight: '#ffffff'
}, nls.localize('terminal.selectionForeground', 'The selection foreground color of the terminal. When this is null the selection foreground will be retained and have the minimum contrast ratio feature applied.'));
export const TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR = registerColor('terminalCommandDecoration.defaultBackground', {
    light: '#00000040',
    dark: '#ffffff40',
    hcDark: '#ffffff80',
    hcLight: '#00000040',
}, nls.localize('terminalCommandDecoration.defaultBackground', 'The default terminal command decoration background color.'));
export const TERMINAL_COMMAND_DECORATION_SUCCESS_BACKGROUND_COLOR = registerColor('terminalCommandDecoration.successBackground', {
    dark: '#1B81A8',
    light: '#2090D3',
    hcDark: '#1B81A8',
    hcLight: '#007100'
}, nls.localize('terminalCommandDecoration.successBackground', 'The terminal command decoration background color for successful commands.'));
export const TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR = registerColor('terminalCommandDecoration.errorBackground', {
    dark: '#F14C4C',
    light: '#E51400',
    hcDark: '#F14C4C',
    hcLight: '#B5200D'
}, nls.localize('terminalCommandDecoration.errorBackground', 'The terminal command decoration background color for error commands.'));
export const TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR = registerColor('terminalOverviewRuler.cursorForeground', '#A0A0A0CC', nls.localize('terminalOverviewRuler.cursorForeground', 'The overview ruler cursor color.'));
export const TERMINAL_BORDER_COLOR = registerColor('terminal.border', PANEL_BORDER, nls.localize('terminal.border', 'The color of the border that separates split panes within the terminal. This defaults to panel.border.'));
export const TERMINAL_OVERVIEW_RULER_BORDER_COLOR = registerColor('terminalOverviewRuler.border', editorOverviewRulerBorder, nls.localize('terminalOverviewRuler.border', 'The overview ruler left-side border color.'));
export const TERMINAL_FIND_MATCH_BACKGROUND_COLOR = registerColor('terminal.findMatchBackground', {
    dark: editorFindMatch,
    light: editorFindMatch,
    // Use regular selection background in high contrast with a thick border
    hcDark: null,
    hcLight: '#0F4A85'
}, nls.localize('terminal.findMatchBackground', 'Color of the current search match in the terminal. The color must not be opaque so as not to hide underlying terminal content.'), true);
export const TERMINAL_HOVER_HIGHLIGHT_BACKGROUND_COLOR = registerColor('terminal.hoverHighlightBackground', transparent(editorHoverHighlight, 0.5), nls.localize('terminal.hoverHighlightBackground', 'Highlight below the word for which a hover is shown. The color must not be opaque so as not to hide underlying decorations.'));
export const TERMINAL_FIND_MATCH_BORDER_COLOR = registerColor('terminal.findMatchBorder', {
    dark: null,
    light: null,
    hcDark: '#f38518',
    hcLight: '#0F4A85'
}, nls.localize('terminal.findMatchBorder', 'Border color of the current search match in the terminal.'));
export const TERMINAL_FIND_MATCH_HIGHLIGHT_BACKGROUND_COLOR = registerColor('terminal.findMatchHighlightBackground', {
    dark: editorFindMatchHighlight,
    light: editorFindMatchHighlight,
    hcDark: null,
    hcLight: null
}, nls.localize('terminal.findMatchHighlightBackground', 'Color of the other search matches in the terminal. The color must not be opaque so as not to hide underlying terminal content.'), true);
export const TERMINAL_FIND_MATCH_HIGHLIGHT_BORDER_COLOR = registerColor('terminal.findMatchHighlightBorder', {
    dark: null,
    light: null,
    hcDark: '#f38518',
    hcLight: '#0F4A85'
}, nls.localize('terminal.findMatchHighlightBorder', 'Border color of the other search matches in the terminal.'));
export const TERMINAL_OVERVIEW_RULER_FIND_MATCH_FOREGROUND_COLOR = registerColor('terminalOverviewRuler.findMatchForeground', {
    dark: overviewRulerFindMatchForeground,
    light: overviewRulerFindMatchForeground,
    hcDark: '#f38518',
    hcLight: '#0F4A85'
}, nls.localize('terminalOverviewRuler.findMatchHighlightForeground', 'Overview ruler marker color for find matches in the terminal.'));
export const TERMINAL_DRAG_AND_DROP_BACKGROUND = registerColor('terminal.dropBackground', EDITOR_DRAG_AND_DROP_BACKGROUND, nls.localize('terminal.dragAndDropBackground', "Background color when dragging on top of terminals. The color should have transparency so that the terminal contents can still shine through."), true);
export const TERMINAL_TAB_ACTIVE_BORDER = registerColor('terminal.tab.activeBorder', TAB_ACTIVE_BORDER, nls.localize('terminal.tab.activeBorder', 'Border on the side of the terminal tab in the panel. This defaults to tab.activeBorder.'));
export const TERMINAL_INITIAL_HINT_FOREGROUND = registerColor('terminal.initialHintForeground', {
    dark: '#ffffff56',
    light: '#0007',
    hcDark: null,
    hcLight: null
}, nls.localize('terminalInitialHintForeground', 'Foreground color of the terminal initial hint.'));
export const ansiColorMap = {
    'terminal.ansiBlack': {
        index: 0,
        defaults: {
            light: '#000000',
            dark: '#000000',
            hcDark: '#000000',
            hcLight: '#292929'
        }
    },
    'terminal.ansiRed': {
        index: 1,
        defaults: {
            light: '#cd3131',
            dark: '#cd3131',
            hcDark: '#cd0000',
            hcLight: '#cd3131'
        }
    },
    'terminal.ansiGreen': {
        index: 2,
        defaults: {
            light: '#107C10',
            dark: '#0DBC79',
            hcDark: '#00cd00',
            hcLight: '#136C13'
        }
    },
    'terminal.ansiYellow': {
        index: 3,
        defaults: {
            light: '#949800',
            dark: '#e5e510',
            hcDark: '#cdcd00',
            hcLight: '#949800'
        }
    },
    'terminal.ansiBlue': {
        index: 4,
        defaults: {
            light: '#0451a5',
            dark: '#2472c8',
            hcDark: '#0000ee',
            hcLight: '#0451a5'
        }
    },
    'terminal.ansiMagenta': {
        index: 5,
        defaults: {
            light: '#bc05bc',
            dark: '#bc3fbc',
            hcDark: '#cd00cd',
            hcLight: '#bc05bc'
        }
    },
    'terminal.ansiCyan': {
        index: 6,
        defaults: {
            light: '#0598bc',
            dark: '#11a8cd',
            hcDark: '#00cdcd',
            hcLight: '#0598bc'
        }
    },
    'terminal.ansiWhite': {
        index: 7,
        defaults: {
            light: '#555555',
            dark: '#e5e5e5',
            hcDark: '#e5e5e5',
            hcLight: '#555555'
        }
    },
    'terminal.ansiBrightBlack': {
        index: 8,
        defaults: {
            light: '#666666',
            dark: '#666666',
            hcDark: '#7f7f7f',
            hcLight: '#666666'
        }
    },
    'terminal.ansiBrightRed': {
        index: 9,
        defaults: {
            light: '#cd3131',
            dark: '#f14c4c',
            hcDark: '#ff0000',
            hcLight: '#cd3131'
        }
    },
    'terminal.ansiBrightGreen': {
        index: 10,
        defaults: {
            light: '#14CE14',
            dark: '#23d18b',
            hcDark: '#00ff00',
            hcLight: '#00bc00'
        }
    },
    'terminal.ansiBrightYellow': {
        index: 11,
        defaults: {
            light: '#b5ba00',
            dark: '#f5f543',
            hcDark: '#ffff00',
            hcLight: '#b5ba00'
        }
    },
    'terminal.ansiBrightBlue': {
        index: 12,
        defaults: {
            light: '#0451a5',
            dark: '#3b8eea',
            hcDark: '#5c5cff',
            hcLight: '#0451a5'
        }
    },
    'terminal.ansiBrightMagenta': {
        index: 13,
        defaults: {
            light: '#bc05bc',
            dark: '#d670d6',
            hcDark: '#ff00ff',
            hcLight: '#bc05bc'
        }
    },
    'terminal.ansiBrightCyan': {
        index: 14,
        defaults: {
            light: '#0598bc',
            dark: '#29b8db',
            hcDark: '#00ffff',
            hcLight: '#0598bc'
        }
    },
    'terminal.ansiBrightWhite': {
        index: 15,
        defaults: {
            light: '#a5a5a5',
            dark: '#e5e5e5',
            hcDark: '#ffffff',
            hcLight: '#a5a5a5'
        }
    }
};
export function registerColors() {
    for (const id in ansiColorMap) {
        const entry = ansiColorMap[id];
        const colorName = id.substring(13);
        ansiColorIdentifiers[entry.index] = registerColor(id, entry.defaults, nls.localize('terminal.ansiColor', '\'{0}\' ANSI color in the terminal.', colorName));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb2xvclJlZ2lzdHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsQ29sb3JSZWdpc3RyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNsRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBRTFDLE9BQU8sRUFBRSxhQUFhLEVBQWtDLGVBQWUsRUFBRSx3QkFBd0IsRUFBRSxnQ0FBZ0MsRUFBRSx5QkFBeUIsRUFBRSxXQUFXLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM5UCxPQUFPLEVBQUUsK0JBQStCLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFNUc7OztHQUdHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQXNCLEVBQUUsQ0FBQztBQUUxRCxNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyxhQUFhLENBQUMscUJBQXFCLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsbUdBQW1HLENBQUMsQ0FBQyxDQUFDO0FBQzlOLE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLGFBQWEsQ0FBQyxxQkFBcUIsRUFBRTtJQUM3RSxLQUFLLEVBQUUsU0FBUztJQUNoQixJQUFJLEVBQUUsU0FBUztJQUNmLE1BQU0sRUFBRSxTQUFTO0lBQ2pCLE9BQU8sRUFBRSxTQUFTO0NBQ2xCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSx1Q0FBdUMsQ0FBQyxDQUFDLENBQUM7QUFDakYsTUFBTSxDQUFDLE1BQU0sZ0NBQWdDLEdBQUcsYUFBYSxDQUFDLDJCQUEyQixFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDJCQUEyQixFQUFFLDhDQUE4QyxDQUFDLENBQUMsQ0FBQztBQUM1TCxNQUFNLENBQUMsTUFBTSxnQ0FBZ0MsR0FBRyxhQUFhLENBQUMsMkJBQTJCLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsd0hBQXdILENBQUMsQ0FBQyxDQUFDO0FBQ3RRLE1BQU0sQ0FBQyxNQUFNLG1DQUFtQyxHQUFHLGFBQWEsQ0FBQyw4QkFBOEIsRUFBRSx5QkFBeUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDhCQUE4QixFQUFFLGlEQUFpRCxDQUFDLENBQUMsQ0FBQztBQUM3TixNQUFNLENBQUMsTUFBTSw0Q0FBNEMsR0FBRyxhQUFhLENBQUMsc0NBQXNDLEVBQUU7SUFDakgsS0FBSyxFQUFFLFdBQVcsQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLENBQUM7SUFDNUQsSUFBSSxFQUFFLFdBQVcsQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLENBQUM7SUFDM0QsTUFBTSxFQUFFLFdBQVcsQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLENBQUM7SUFDN0QsT0FBTyxFQUFFLFdBQVcsQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLENBQUM7Q0FDOUQsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLDZFQUE2RSxDQUFDLENBQUMsQ0FBQztBQUN4SSxNQUFNLENBQUMsTUFBTSxtQ0FBbUMsR0FBRyxhQUFhLENBQUMsOEJBQThCLEVBQUU7SUFDaEcsS0FBSyxFQUFFLElBQUk7SUFDWCxJQUFJLEVBQUUsSUFBSTtJQUNWLE1BQU0sRUFBRSxTQUFTO0lBQ2pCLE9BQU8sRUFBRSxTQUFTO0NBQ2xCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxrS0FBa0ssQ0FBQyxDQUFDLENBQUM7QUFDck4sTUFBTSxDQUFDLE1BQU0sb0RBQW9ELEdBQUcsYUFBYSxDQUFDLDZDQUE2QyxFQUFFO0lBQ2hJLEtBQUssRUFBRSxXQUFXO0lBQ2xCLElBQUksRUFBRSxXQUFXO0lBQ2pCLE1BQU0sRUFBRSxXQUFXO0lBQ25CLE9BQU8sRUFBRSxXQUFXO0NBQ3BCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw2Q0FBNkMsRUFBRSwyREFBMkQsQ0FBQyxDQUFDLENBQUM7QUFDN0gsTUFBTSxDQUFDLE1BQU0sb0RBQW9ELEdBQUcsYUFBYSxDQUFDLDZDQUE2QyxFQUFFO0lBQ2hJLElBQUksRUFBRSxTQUFTO0lBQ2YsS0FBSyxFQUFFLFNBQVM7SUFDaEIsTUFBTSxFQUFFLFNBQVM7SUFDakIsT0FBTyxFQUFFLFNBQVM7Q0FDbEIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDZDQUE2QyxFQUFFLDJFQUEyRSxDQUFDLENBQUMsQ0FBQztBQUM3SSxNQUFNLENBQUMsTUFBTSxrREFBa0QsR0FBRyxhQUFhLENBQUMsMkNBQTJDLEVBQUU7SUFDNUgsSUFBSSxFQUFFLFNBQVM7SUFDZixLQUFLLEVBQUUsU0FBUztJQUNoQixNQUFNLEVBQUUsU0FBUztJQUNqQixPQUFPLEVBQUUsU0FBUztDQUNsQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMkNBQTJDLEVBQUUsc0VBQXNFLENBQUMsQ0FBQyxDQUFDO0FBQ3RJLE1BQU0sQ0FBQyxNQUFNLCtDQUErQyxHQUFHLGFBQWEsQ0FBQyx3Q0FBd0MsRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx3Q0FBd0MsRUFBRSxrQ0FBa0MsQ0FBQyxDQUFDLENBQUM7QUFDaE8sTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixFQUFFLFlBQVksRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGlCQUFpQixFQUFFLHdHQUF3RyxDQUFDLENBQUMsQ0FBQztBQUMvTixNQUFNLENBQUMsTUFBTSxvQ0FBb0MsR0FBRyxhQUFhLENBQUMsOEJBQThCLEVBQUUseUJBQXlCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDLENBQUM7QUFDek4sTUFBTSxDQUFDLE1BQU0sb0NBQW9DLEdBQUcsYUFBYSxDQUFDLDhCQUE4QixFQUFFO0lBQ2pHLElBQUksRUFBRSxlQUFlO0lBQ3JCLEtBQUssRUFBRSxlQUFlO0lBQ3RCLHdFQUF3RTtJQUN4RSxNQUFNLEVBQUUsSUFBSTtJQUNaLE9BQU8sRUFBRSxTQUFTO0NBQ2xCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxnSUFBZ0ksQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3pMLE1BQU0sQ0FBQyxNQUFNLHlDQUF5QyxHQUFHLGFBQWEsQ0FBQyxtQ0FBbUMsRUFBRSxXQUFXLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxtQ0FBbUMsRUFBRSw2SEFBNkgsQ0FBQyxDQUFDLENBQUM7QUFDdFUsTUFBTSxDQUFDLE1BQU0sZ0NBQWdDLEdBQUcsYUFBYSxDQUFDLDBCQUEwQixFQUFFO0lBQ3pGLElBQUksRUFBRSxJQUFJO0lBQ1YsS0FBSyxFQUFFLElBQUk7SUFDWCxNQUFNLEVBQUUsU0FBUztJQUNqQixPQUFPLEVBQUUsU0FBUztDQUNsQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsMkRBQTJELENBQUMsQ0FBQyxDQUFDO0FBQzFHLE1BQU0sQ0FBQyxNQUFNLDhDQUE4QyxHQUFHLGFBQWEsQ0FBQyx1Q0FBdUMsRUFBRTtJQUNwSCxJQUFJLEVBQUUsd0JBQXdCO0lBQzlCLEtBQUssRUFBRSx3QkFBd0I7SUFDL0IsTUFBTSxFQUFFLElBQUk7SUFDWixPQUFPLEVBQUUsSUFBSTtDQUNiLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSxnSUFBZ0ksQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ2xNLE1BQU0sQ0FBQyxNQUFNLDBDQUEwQyxHQUFHLGFBQWEsQ0FBQyxtQ0FBbUMsRUFBRTtJQUM1RyxJQUFJLEVBQUUsSUFBSTtJQUNWLEtBQUssRUFBRSxJQUFJO0lBQ1gsTUFBTSxFQUFFLFNBQVM7SUFDakIsT0FBTyxFQUFFLFNBQVM7Q0FDbEIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLDJEQUEyRCxDQUFDLENBQUMsQ0FBQztBQUNuSCxNQUFNLENBQUMsTUFBTSxtREFBbUQsR0FBRyxhQUFhLENBQUMsMkNBQTJDLEVBQUU7SUFDN0gsSUFBSSxFQUFFLGdDQUFnQztJQUN0QyxLQUFLLEVBQUUsZ0NBQWdDO0lBQ3ZDLE1BQU0sRUFBRSxTQUFTO0lBQ2pCLE9BQU8sRUFBRSxTQUFTO0NBQ2xCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvREFBb0QsRUFBRSwrREFBK0QsQ0FBQyxDQUFDLENBQUM7QUFDeEksTUFBTSxDQUFDLE1BQU0saUNBQWlDLEdBQUcsYUFBYSxDQUFDLHlCQUF5QixFQUFFLCtCQUErQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsK0lBQStJLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNsVSxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxhQUFhLENBQUMsMkJBQTJCLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSx5RkFBeUYsQ0FBQyxDQUFDLENBQUM7QUFDOU8sTUFBTSxDQUFDLE1BQU0sZ0NBQWdDLEdBQUcsYUFBYSxDQUFDLGdDQUFnQyxFQUFFO0lBQy9GLElBQUksRUFBRSxXQUFXO0lBQ2pCLEtBQUssRUFBRSxPQUFPO0lBQ2QsTUFBTSxFQUFFLElBQUk7SUFDWixPQUFPLEVBQUUsSUFBSTtDQUNiLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxnREFBZ0QsQ0FBQyxDQUFDLENBQUM7QUFFcEcsTUFBTSxDQUFDLE1BQU0sWUFBWSxHQUFrRTtJQUMxRixvQkFBb0IsRUFBRTtRQUNyQixLQUFLLEVBQUUsQ0FBQztRQUNSLFFBQVEsRUFBRTtZQUNULEtBQUssRUFBRSxTQUFTO1lBQ2hCLElBQUksRUFBRSxTQUFTO1lBQ2YsTUFBTSxFQUFFLFNBQVM7WUFDakIsT0FBTyxFQUFFLFNBQVM7U0FDbEI7S0FDRDtJQUNELGtCQUFrQixFQUFFO1FBQ25CLEtBQUssRUFBRSxDQUFDO1FBQ1IsUUFBUSxFQUFFO1lBQ1QsS0FBSyxFQUFFLFNBQVM7WUFDaEIsSUFBSSxFQUFFLFNBQVM7WUFDZixNQUFNLEVBQUUsU0FBUztZQUNqQixPQUFPLEVBQUUsU0FBUztTQUNsQjtLQUNEO0lBQ0Qsb0JBQW9CLEVBQUU7UUFDckIsS0FBSyxFQUFFLENBQUM7UUFDUixRQUFRLEVBQUU7WUFDVCxLQUFLLEVBQUUsU0FBUztZQUNoQixJQUFJLEVBQUUsU0FBUztZQUNmLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLE9BQU8sRUFBRSxTQUFTO1NBQ2xCO0tBQ0Q7SUFDRCxxQkFBcUIsRUFBRTtRQUN0QixLQUFLLEVBQUUsQ0FBQztRQUNSLFFBQVEsRUFBRTtZQUNULEtBQUssRUFBRSxTQUFTO1lBQ2hCLElBQUksRUFBRSxTQUFTO1lBQ2YsTUFBTSxFQUFFLFNBQVM7WUFDakIsT0FBTyxFQUFFLFNBQVM7U0FDbEI7S0FDRDtJQUNELG1CQUFtQixFQUFFO1FBQ3BCLEtBQUssRUFBRSxDQUFDO1FBQ1IsUUFBUSxFQUFFO1lBQ1QsS0FBSyxFQUFFLFNBQVM7WUFDaEIsSUFBSSxFQUFFLFNBQVM7WUFDZixNQUFNLEVBQUUsU0FBUztZQUNqQixPQUFPLEVBQUUsU0FBUztTQUNsQjtLQUNEO0lBQ0Qsc0JBQXNCLEVBQUU7UUFDdkIsS0FBSyxFQUFFLENBQUM7UUFDUixRQUFRLEVBQUU7WUFDVCxLQUFLLEVBQUUsU0FBUztZQUNoQixJQUFJLEVBQUUsU0FBUztZQUNmLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLE9BQU8sRUFBRSxTQUFTO1NBQ2xCO0tBQ0Q7SUFDRCxtQkFBbUIsRUFBRTtRQUNwQixLQUFLLEVBQUUsQ0FBQztRQUNSLFFBQVEsRUFBRTtZQUNULEtBQUssRUFBRSxTQUFTO1lBQ2hCLElBQUksRUFBRSxTQUFTO1lBQ2YsTUFBTSxFQUFFLFNBQVM7WUFDakIsT0FBTyxFQUFFLFNBQVM7U0FDbEI7S0FDRDtJQUNELG9CQUFvQixFQUFFO1FBQ3JCLEtBQUssRUFBRSxDQUFDO1FBQ1IsUUFBUSxFQUFFO1lBQ1QsS0FBSyxFQUFFLFNBQVM7WUFDaEIsSUFBSSxFQUFFLFNBQVM7WUFDZixNQUFNLEVBQUUsU0FBUztZQUNqQixPQUFPLEVBQUUsU0FBUztTQUNsQjtLQUNEO0lBQ0QsMEJBQTBCLEVBQUU7UUFDM0IsS0FBSyxFQUFFLENBQUM7UUFDUixRQUFRLEVBQUU7WUFDVCxLQUFLLEVBQUUsU0FBUztZQUNoQixJQUFJLEVBQUUsU0FBUztZQUNmLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLE9BQU8sRUFBRSxTQUFTO1NBQ2xCO0tBQ0Q7SUFDRCx3QkFBd0IsRUFBRTtRQUN6QixLQUFLLEVBQUUsQ0FBQztRQUNSLFFBQVEsRUFBRTtZQUNULEtBQUssRUFBRSxTQUFTO1lBQ2hCLElBQUksRUFBRSxTQUFTO1lBQ2YsTUFBTSxFQUFFLFNBQVM7WUFDakIsT0FBTyxFQUFFLFNBQVM7U0FDbEI7S0FDRDtJQUNELDBCQUEwQixFQUFFO1FBQzNCLEtBQUssRUFBRSxFQUFFO1FBQ1QsUUFBUSxFQUFFO1lBQ1QsS0FBSyxFQUFFLFNBQVM7WUFDaEIsSUFBSSxFQUFFLFNBQVM7WUFDZixNQUFNLEVBQUUsU0FBUztZQUNqQixPQUFPLEVBQUUsU0FBUztTQUNsQjtLQUNEO0lBQ0QsMkJBQTJCLEVBQUU7UUFDNUIsS0FBSyxFQUFFLEVBQUU7UUFDVCxRQUFRLEVBQUU7WUFDVCxLQUFLLEVBQUUsU0FBUztZQUNoQixJQUFJLEVBQUUsU0FBUztZQUNmLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLE9BQU8sRUFBRSxTQUFTO1NBQ2xCO0tBQ0Q7SUFDRCx5QkFBeUIsRUFBRTtRQUMxQixLQUFLLEVBQUUsRUFBRTtRQUNULFFBQVEsRUFBRTtZQUNULEtBQUssRUFBRSxTQUFTO1lBQ2hCLElBQUksRUFBRSxTQUFTO1lBQ2YsTUFBTSxFQUFFLFNBQVM7WUFDakIsT0FBTyxFQUFFLFNBQVM7U0FDbEI7S0FDRDtJQUNELDRCQUE0QixFQUFFO1FBQzdCLEtBQUssRUFBRSxFQUFFO1FBQ1QsUUFBUSxFQUFFO1lBQ1QsS0FBSyxFQUFFLFNBQVM7WUFDaEIsSUFBSSxFQUFFLFNBQVM7WUFDZixNQUFNLEVBQUUsU0FBUztZQUNqQixPQUFPLEVBQUUsU0FBUztTQUNsQjtLQUNEO0lBQ0QseUJBQXlCLEVBQUU7UUFDMUIsS0FBSyxFQUFFLEVBQUU7UUFDVCxRQUFRLEVBQUU7WUFDVCxLQUFLLEVBQUUsU0FBUztZQUNoQixJQUFJLEVBQUUsU0FBUztZQUNmLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLE9BQU8sRUFBRSxTQUFTO1NBQ2xCO0tBQ0Q7SUFDRCwwQkFBMEIsRUFBRTtRQUMzQixLQUFLLEVBQUUsRUFBRTtRQUNULFFBQVEsRUFBRTtZQUNULEtBQUssRUFBRSxTQUFTO1lBQ2hCLElBQUksRUFBRSxTQUFTO1lBQ2YsTUFBTSxFQUFFLFNBQVM7WUFDakIsT0FBTyxFQUFFLFNBQVM7U0FDbEI7S0FDRDtDQUNELENBQUM7QUFFRixNQUFNLFVBQVUsY0FBYztJQUM3QixLQUFLLE1BQU0sRUFBRSxJQUFJLFlBQVksRUFBRSxDQUFDO1FBQy9CLE1BQU0sS0FBSyxHQUFHLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvQixNQUFNLFNBQVMsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25DLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxhQUFhLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxxQ0FBcUMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQzdKLENBQUM7QUFDRixDQUFDIn0=