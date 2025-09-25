/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Bas Verweij. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as MarkdownIt from "markdown-it";
import emitTable from "../common/markdown-it/EmitTable.js";
import getCharCodeAtStartOfLine from "../common/markdown-it/GetCharCodeAtStartOfLine.js";
import parseTable from "../common/markdown-it/ParseTable.js";
import IState from "../interfaces/markdown-it/IState.js";
import TRuleFunction from "../interfaces/markdown-it/TRuleFunction.js";

export default function gridTableRule(
    md: MarkdownIt
): TRuleFunction
{
    return function (
        state: IState,
        startLine: number,
        endLine: number,
        silent: boolean
    ): boolean
    {
        if (getCharCodeAtStartOfLine(state, startLine) !== 0x2B)
        {
            // line does not start with a '+'
            return false;
        }

        const parseResult = parseTable(
            state,
            startLine,
            endLine);

        if (!parseResult.Success)
        {
            return false;
        }

        if (silent)
        {
            return true;
        }

        emitTable(
            md,
            state,
            parseResult);

        state.line = parseResult.CurrentLine;

        return true;
    };
}
