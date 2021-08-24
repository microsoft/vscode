/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

declare module 'EmmetFlatNode' {
    export interface Node {
        start: number
        end: number
        type: string
        parent: Node | undefined
        firstChild: Node | undefined
        nextSibling: Node | undefined
        previousSibling: Node | undefined
        children: Node[]
    }

    export interface Token {
        start: number
        end: number
        stream: BufferStream
        toString(): string
    }

    export interface CssToken extends Token {
        size: number
        item(number: number): any
        type: string
    }

    export interface HtmlToken extends Token {
        value: string
    }

    export interface Attribute extends Token {
        name: Token
        value: Token
    }

    export interface HtmlNode extends Node {
        name: string
        open: Token | undefined
        close: Token | undefined
        parent: HtmlNode | undefined
        firstChild: HtmlNode | undefined
        nextSibling: HtmlNode | undefined
        previousSibling: HtmlNode | undefined
        children: HtmlNode[]
        attributes: Attribute[]
    }

    export interface CssNode extends Node {
        name: string
        parent: CssNode | undefined
        firstChild: CssNode | undefined
        nextSibling: CssNode | undefined
        previousSibling: CssNode | undefined
        children: CssNode[]
    }

    export interface Rule extends CssNode {
        selectorToken: Token
        contentStartToken: Token
        contentEndToken: Token
    }

    export interface Property extends CssNode {
        valueToken: Token
        separator: string
        parent: Rule
        terminatorToken: Token
        separatorToken: Token
        value: string
    }

    export interface Stylesheet extends Node {
        comments: Token[]
    }

    export interface BufferStream {
        peek(): number
        next(): number
        backUp(n: number): number
        current(): string
        substring(from: number, to: number): string
        eat(match: any): boolean
        eatWhile(match: any): boolean
    }
}
