/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Bas Verweij. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ColumnAlignments from "./ColumnAlignments";

export default class ParseTableResult
{
    Success = false;

    ColumnWidths: number[] = [];

    ColumnOffsets: number[] = [];

    ColumnAlignments: ColumnAlignments[] = [];

    HeaderLess = false;

    HeaderLines: string[][] = [];

    RowLines: string[][][] = [];

    SeparatorLineOffsets: number[] = [];

    CurrentLine = 0;
}
