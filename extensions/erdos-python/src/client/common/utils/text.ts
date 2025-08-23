// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Position, Range, TextDocument } from 'vscode';
import { isNumber } from './sysTypes';

export function getWindowsLineEndingCount(document: TextDocument, offset: number): number {
    // const eolPattern = new RegExp('\r\n', 'g');
    const eolPattern = /\r\n/g;
    const readBlock = 1024;
    let count = 0;
    let offsetDiff = offset.valueOf();

    // In order to prevent the one-time loading of large files from taking up too much memory
    for (let pos = 0; pos < offset; pos += readBlock) {
        const startAt = document.positionAt(pos);

        let endAt: Position;
        if (offsetDiff >= readBlock) {
            endAt = document.positionAt(pos + readBlock);
            offsetDiff = offsetDiff - readBlock;
        } else {
            endAt = document.positionAt(pos + offsetDiff);
        }

        const text = document.getText(new Range(startAt, endAt!));
        const cr = text.match(eolPattern);

        count += cr ? cr.length : 0;
    }
    return count;
}

/**
 * Return the range represented by the given string.
 *
 * If a number is provided then it is used as both lines and the
 * character are set to 0.
 *
 * Examples:
 *  '1:5-3:5' -> Range(1, 5, 3, 5)
 *  '1-3'     -> Range(1, 0, 3, 0)
 *  '1:3-1:5' -> Range(1, 3, 1, 5)
 *  '1-1'     -> Range(1, 0, 1, 0)
 *  '1'       -> Range(1, 0, 1, 0)
 *  '1:3-'    -> Range(1, 3, 1, 0)
 *  '1:3'     -> Range(1, 3, 1, 0)
 *  ''        -> Range(0, 0, 0, 0)
 *  '3-1'     -> Range(1, 0, 3, 0)
 */
export function parseRange(raw: string | number): Range {
    if (isNumber(raw)) {
        return new Range(raw, 0, raw, 0);
    }
    if (raw === '') {
        return new Range(0, 0, 0, 0);
    }

    const parts = raw.split('-');
    if (parts.length > 2) {
        throw new Error(`invalid range ${raw}`);
    }

    const start = parsePosition(parts[0]);
    let end = start;
    if (parts.length === 2) {
        end = parsePosition(parts[1]);
    }
    return new Range(start, end);
}

/**
 * Return the line/column represented by the given string.
 *
 * If a number is provided then it is used as the line and the character
 * is set to 0.
 *
 * Examples:
 *  '1:5' -> Position(1, 5)
 *  '1'   -> Position(1, 0)
 *  ''    -> Position(0, 0)
 */
export function parsePosition(raw: string | number): Position {
    if (isNumber(raw)) {
        return new Position(raw, 0);
    }
    if (raw === '') {
        return new Position(0, 0);
    }

    const parts = raw.split(':');
    if (parts.length > 2) {
        throw new Error(`invalid position ${raw}`);
    }

    let line = 0;
    if (parts[0] !== '') {
        if (!/^\d+$/.test(parts[0])) {
            throw new Error(`invalid position ${raw}`);
        }
        line = +parts[0];
    }
    let col = 0;
    if (parts.length === 2 && parts[1] !== '') {
        if (!/^\d+$/.test(parts[1])) {
            throw new Error(`invalid position ${raw}`);
        }
        col = +parts[1];
    }
    return new Position(line, col);
}

/**
 * Return the indentation part of the given line.
 */
export function getIndent(line: string): string {
    const found = line.match(/^ */);
    return found![0];
}

/**
 * Return the dedented lines in the given text.
 *
 * This is used to represent text concisely and readably, which is
 * particularly useful for declarative definitions (e.g. in tests).
 *
 * (inspired by Python's `textwrap.dedent()`)
 */
export function getDedentedLines(text: string): string[] {
    const linesep = text.includes('\r') ? '\r\n' : '\n';
    const lines = text.split(linesep);
    if (!lines) {
        return [text];
    }

    if (lines[0] !== '') {
        throw Error('expected actual first line to be blank');
    }
    lines.shift();
    if (lines.length === 0) {
        return [];
    }

    if (lines[0] === '') {
        throw Error('expected "first" line to not be blank');
    }
    const leading = getIndent(lines[0]).length;

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (getIndent(line).length < leading) {
            throw Error(`line ${i} has less indent than the "first" line`);
        }
        lines[i] = line.substring(leading);
    }

    return lines;
}

/**
 * Extract a tree based on the given text.
 *
 * The tree is derived from the indent level of each line.  The caller
 * is responsible for applying any meaning to the text of each node
 * in the tree.
 *
 * Blank lines and comments (with a leading `#`) are ignored.  Also,
 * the full text is automatically dedented until at least one line
 * has no indent (i.e. is treated as a root).
 *
 * @returns - the list of nodes in the tree (pairs of text & parent index)
 *            (note that the parent index of roots is `-1`)
 *
 * Example:
 *
 *   parseTree(`
 *      # This comment and the following blank line are ignored.
 *
 *      this is a root
 *        the first branch
 *          a sub-branch  # This comment is ignored.
 *            this is the first leaf node!
 *          another leaf node...
 *          middle
 *
 *        the second main branch
 *            # indents do not have to be consistent across the full text.
 *           # ...and the indent of comments is not relevant.
 *            node 1
 *            node 2
 *
 *        the last leaf node!
 *
 *      another root
 *        nothing to see here!
 *
 *      # this comment is ignored
 *   `.trim())
 *
 * would produce the following:
 *
 *   [
 *       ['this is a root', -1],
 *       ['the first branch', 0],
 *       ['a sub-branch', 1],
 *       ['this is the first leaf node!', 2],
 *       ['another leaf node...', 1],
 *       ['middle', 1],
 *       ['the second main branch', 0],
 *       ['node 1', 6],
 *       ['node 2', 6],
 *       ['the last leaf node!', 0],
 *       ['another root', -1],
 *       ['nothing to see here!', 10],
 *   ]
 */
export function parseTree(text: string): [string, number][] {
    const parsed: [string, number][] = [];
    const parents: [string, number][] = [];

    const lines = getDedentedLines(text)
        .map((l) => l.split('  #')[0].split(' //')[0].trimEnd())
        .filter((l) => l.trim() !== '');
    lines.forEach((line) => {
        const indent = getIndent(line);
        const entry = line.trim();

        let parentIndex: number;
        if (indent === '') {
            parentIndex = -1;
            parents.push([indent, parsed.length]);
        } else if (parsed.length === 0) {
            throw Error(`expected non-indented line, got ${line}`);
        } else {
            let parentIndent: string;
            [parentIndent, parentIndex] = parents[parents.length - 1];
            while (indent.length <= parentIndent.length) {
                parents.pop();
                [parentIndent, parentIndex] = parents[parents.length - 1];
            }
            if (parentIndent.length < indent.length) {
                parents.push([indent, parsed.length]);
            }
        }
        parsed.push([entry, parentIndex!]);
    });

    return parsed;
}
