/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Bas Verweij. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import IState from "../../interfaces/markdown-it/IState";

export default function getLine(
    state: IState,
    line: number):
    string
{
    const start = state.bMarks[line] + state.blkIndent;

    const end = state.eMarks[line];

    return state.src.substr(
        start,
        end - start);
}
