/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IBeautifyHTMLOptions {
    /**
     * indent <head> and <body> sections
     * default false
     */
    indent_inner_html?: boolean;

    /**
     * indentation size
     * default 4
     */
    indent_size?: number; // indentation size,

    /**
     * character to indent with
     * default space
     */
    indent_char?: string; // character to indent with,

    /**
     * maximum amount of characters per line (0 = disable)
     * default 250
     */
    wrap_line_length?: number;

    /**
     * put braces on the same line as control statements (default), or put braces on own line (Allman / ANSI style), or just put end braces on own line, or attempt to keep them where they are.
     * "collapse" | "expand" | "end-expand" | "none"
     * default "collapse"
     */
    brace_style?: string;

    /**
     * list of tags, that shouldn't be reformatted
     * defaults to inline tags
     */
    unformatted?: string[];

    /**
     * "keep"|"separate"|"normal"
     * default normal
     */
    indent_scripts?: string;

    /**
     * whether existing line breaks before elements should be preserved. Only works before elements, not inside tags or for text.
     * default true
     */
    preserve_newlines?: boolean;

    /**
     * maximum number of line breaks to be preserved in one chunk
     * default unlimited
     */
    max_preserve_newlines?: number;

    /**
     * format and indent {{#foo}} and {{/foo}}
     * default false
     */
    indent_handlebars?: boolean;

    /**
     * end with a newline
     * default false
     */
    end_with_newline?: boolean;

    /**
     * List of tags that should have an extra newline before them.
     * default [head,body,/html]
     */
    extra_liners?: string[];
}

export interface IBeautifyHTML {
	(value:string, options:IBeautifyHTMLOptions): string;
}

export declare var html_beautify:IBeautifyHTML;