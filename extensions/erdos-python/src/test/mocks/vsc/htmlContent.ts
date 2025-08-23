// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as vscMockArrays from './arrays';

export interface IMarkdownString {
    value: string;
    isTrusted?: boolean;
}

export class MarkdownString implements IMarkdownString {
    value: string;

    isTrusted?: boolean;

    constructor(value = '') {
        this.value = value;
    }

    appendText(value: string): MarkdownString {
        // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
        this.value += value.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
        return this;
    }

    appendMarkdown(value: string): MarkdownString {
        this.value += value;
        return this;
    }

    appendCodeblock(langId: string, code: string): MarkdownString {
        this.value += '\n```';
        this.value += langId;
        this.value += '\n';
        this.value += code;
        this.value += '\n```\n';
        return this;
    }
}

export function isEmptyMarkdownString(oneOrMany: IMarkdownString | IMarkdownString[]): boolean {
    if (isMarkdownString(oneOrMany)) {
        return !oneOrMany.value;
    }
    if (Array.isArray(oneOrMany)) {
        return oneOrMany.every(isEmptyMarkdownString);
    }
    return true;
}

export function isMarkdownString(thing: unknown): thing is IMarkdownString {
    if (thing instanceof MarkdownString) {
        return true;
    }
    if (thing && typeof thing === 'object') {
        return (
            typeof (<IMarkdownString>thing).value === 'string' &&
            (typeof (<IMarkdownString>thing).isTrusted === 'boolean' ||
                (<IMarkdownString>thing).isTrusted === undefined)
        );
    }
    return false;
}

export function markedStringsEquals(
    a: IMarkdownString | IMarkdownString[],
    b: IMarkdownString | IMarkdownString[],
): boolean {
    if (!a && !b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return vscMockArrays.equals(a, b, markdownStringEqual);
    }
    if (isMarkdownString(a) && isMarkdownString(b)) {
        return markdownStringEqual(a, b);
    }
    return false;
}

function markdownStringEqual(a: IMarkdownString, b: IMarkdownString): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return a.value === b.value && a.isTrusted === b.isTrusted;
}

export function removeMarkdownEscapes(text: string): string {
    if (!text) {
        return text;
    }
    return text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');
}
