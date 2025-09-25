/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Bas Verweij. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import gridTableRule from "./rules/gridtable.js";

export default function gridTableRulePlugin(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    md: any)
{
    md.block.ruler.before(
        "table",
        "gridtable",
        gridTableRule(md));
}