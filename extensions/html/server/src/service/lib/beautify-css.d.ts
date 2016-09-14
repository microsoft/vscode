/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IBeautifyCSSOptions {
    indent_size?: number; // (4) — indentation size,
    indent_char?: string; // (space) — character to indent with,
    selector_separator_newline?: boolean; // (true) - separate selectors with newline or not (e.g. "a,\nbr" or "a, br")
    end_with_newline?: boolean; // (false) - end with a newline
    newline_between_rules?: boolean; // (true) - add a new line after every css rule
}

export interface IBeautifyCSS {
	(value:string, options:IBeautifyCSSOptions): string;
}

export declare var css_beautify:IBeautifyCSS;