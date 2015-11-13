/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IBeautifyHTMLOptions {
    indent_inner_html?: boolean; // indent <head> and <body> sections,
    indent_size?: number; // indentation size,
    indent_char?: string; // character to indent with,
    wrap_line_length?: number; // (default 250) maximum amount of characters per line (0 = disable)
    brace_style?: string; // (default "collapse") - "collapse" | "expand" | "end-expand" | "none"
            			 // put braces on the same line as control statements (default), or put braces on own line (Allman / ANSI style), or just put end braces on own line, or attempt to keep them where they are.
    unformatted?: string[]; // (defaults to inline tags) - list of tags, that shouldn't be reformatted
    indent_scripts?: string; //  (default normal)  - "keep"|"separate"|"normal"
    preserve_newlines?: boolean; // (default true) - whether existing line breaks before elements should be preserved. Only works before elements, not inside tags or for text.
    max_preserve_newlines?: number; // (default unlimited) - maximum number of line breaks to be preserved in one chunk
    indent_handlebars?: boolean; // (default false) - format and indent {{#foo}} and {{/foo}}
    end_with_newline?: boolean; // (false)          - end with a newline
    extra_liners?: string[]; // (default [head,body,/html]) -List of tags that should have an extra newline before them.
}

export interface IBeautifyHTML {
	(value:string, options:IBeautifyHTMLOptions): string;
}

export declare var html_beautify:IBeautifyHTML;