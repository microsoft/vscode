/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Types for LaTeX outline structure elements
 * Ported from latex-workshop to match original implementation
 */

export enum TeXElementType {
	Environment = 0,
	Macro = 1,
	Section = 2,
	SectionAst = 3,
	SubFile = 4,
	BibItem = 5,
	BibField = 6
}

export interface TeXElement {
	type: TeXElementType;
	name: string;
	label: string;
	lineFr: number;
	lineTo: number;
	filePath: string;
	children: TeXElement[];
	appendix?: boolean;
}

export interface OutlineConfig {
	macros: {
		secs: string[];
		cmds: string[];
		envs: string[];
	};
	secIndex: Record<string, number>;
	texDirs: string[];
	subFile: boolean;
	caption: boolean;
}

