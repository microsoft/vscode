/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Bas Verweij. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import IState from "../../interfaces/markdown-it/IState.js";

/**
 * Returns the char code of the character at the start of the current line,
 * or -1 if this is not available (e.g. on an empty line).
 * 
 * @param state The Markdown It state.
 */
export default function getCharCodeAtStartOfLine(
    state: IState,
    line: number
): number
{
    const pos =
        state.bMarks[line] +
        state.tShift[line];

    if (pos >= state.eMarks[line])
    {
        return -1;
    }

    return state.src.charCodeAt(pos);
}
