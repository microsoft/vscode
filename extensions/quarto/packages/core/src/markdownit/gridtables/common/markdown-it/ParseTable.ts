/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Bas Verweij. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import wcwidth from "wcwidth";
import IState from "../../interfaces/markdown-it/IState";
import getColumnWidths from "../gridtables/GetColumnWidths";
import ColumnAlignments from "./ColumnAlignments";
import getLine from "./GetLine";
import ParseTableResult from "./ParseTableResult";

export default function parseTable(
    state: IState,
    startLine: number,
    endLine: number):
    ParseTableResult
{
    const result = new ParseTableResult();

    let rowLine = getLine(state, startLine);

    if (rowLine.charAt(0) !== '+')
    {
        // line does not start with a '+'
        return result;
    }

    result.ColumnWidths = getColumnWidths(rowLine);

    if (result.ColumnWidths.length === 0)
    {
        // no columns found
        return result;
    }

    // initialize column alignments
    result.ColumnAlignments = result.ColumnWidths
        .map(() => ColumnAlignments.None);

    if (rowLine.indexOf(':') >= 0)
    {
        // column alignment specifiers present in first row line
        result.HeaderLess = true;

        // set column alignments
        result.ColumnAlignments = getColumnAlignments(
            rowLine,
            result.ColumnWidths);

        // remove alignment specifiers for further matching
        rowLine = rowLine.replace(/[:]/g, '-');
    }

    // create header line matcher
    const headerLineMatcher = new RegExp(
        '^\\+' +
        result.ColumnWidths
            .map(w => `[=:][=]{${w - 3}}[=:]\\+`)
            .join('') +
        '$');

    // build column offsets
    result.ColumnOffsets = [0];

    for (let i = 0; i < result.ColumnWidths.length - 1; i++)
    {
        result.ColumnOffsets.push(
            result.ColumnOffsets[i] +
            result.ColumnWidths[i]);
    }

    // create cell line matcher
    const cellLineMatcher = new RegExp(
        '^\\|' +
        result.ColumnWidths
            .map(w => `([^|]{${Math.ceil((w - 1) / 2)},${w - 1}})\\|`)
            .join('') +
        '$');

    // save first separator line offset
    result.SeparatorLineOffsets.push(startLine);

    // continue to scan until a complete table is found, or an invalid line is encountered
    let currentRow: string[][] = [];
    let currentLine = startLine + 1;

    for (; currentLine <= endLine; currentLine++)
    {
        const line = getLine(state, currentLine);

        if (line.charCodeAt(0) === 0x2B) // '+'
        {
            // separator line
            if (currentRow.length === 0)
            {
                // no row lines since last separator -> invalid table
                return result;
            }

            // save separator line offset
            result.SeparatorLineOffsets.push(currentLine);

            if (line === rowLine)
            {
                // new regular row
                result.RowLines.push(currentRow);

                if (result.HeaderLines.length === 0)
                {
                    result.HeaderLess = true;
                }
            } else if (!result.HeaderLess &&
                line.match(headerLineMatcher))
            {
                // found header line
                if (result.HeaderLines.length > 0 ||
                    result.RowLines.length > 0)
                {
                    // header already found, or not the first row -> invalid table
                    return result;
                }

                // header row
                result.HeaderLines = currentRow;

                if (line.indexOf(':') >= 0)
                {
                    // set column alignments
                    result.ColumnAlignments = getColumnAlignments(
                        line,
                        result.ColumnWidths);
                }
            } else
            {
                // not a header or regular row -> invalid table
                return result;
            }

            // reset current row
            currentRow = [];
        }
        else if (line.charCodeAt(0) === 0x7C) // '|'
        {
            // cell line

            const matches = line.match(cellLineMatcher);

            if (matches === null)
            {
                // cell line does not match -> invalid table
                return result;
            }

            const cells = validateColumnWidths(
                matches,
                result.ColumnWidths);

            if (cells === null)
            {
                // cell line does not match -> invalid table
                return result;
            }

            // add the line to the current row
            currentRow.push(cells);
        }
        else
        {
            // not a separator or cell line, check if we have a complete table
            if (currentRow.length === 0 &&
                ((result.HeaderLines.length > 0) ||
                    (result.RowLines.length > 0)))
            {
                // found a complete table
                break;
            }

            return result;
        }
    }

    result.CurrentLine = currentLine;

    result.Success = true;

    return result;
}

function getColumnAlignments(
    line: string,
    columnWidths: number[]):
    ColumnAlignments[]
{

    const alignments: ColumnAlignments[] = [];

    let left = 1;
    let right = -1;

    for (let i = 0; i < columnWidths.length; i++)
    {
        right += columnWidths[i];

        let alignment = ColumnAlignments.None;

        if (line.charAt(right) === ':')
        {
            if (line.charAt(left) === ':')
            {
                alignment = ColumnAlignments.Center;
            } else
            {
                alignment = ColumnAlignments.Right;
            }
        } else if (line.charAt(left) === ':')
        {
            alignment = ColumnAlignments.Left;
        }

        alignments.push(alignment);

        left += columnWidths[i];
    }

    return alignments;
}

function validateColumnWidths(
    matches: RegExpMatchArray,
    columnWidths: number[],
): string[] | null
{
    const cells: string[] = [];

    for (let i = 0; i < columnWidths.length; i++)
    {
        const cell = matches[i + 1];

        const columnWidth = wcwidth(cell) + 1; // add 1 for separator

        if (columnWidth !== columnWidths[i])
        {
            return null;
        }

        cells.push(cell);
    }

    return cells;
}