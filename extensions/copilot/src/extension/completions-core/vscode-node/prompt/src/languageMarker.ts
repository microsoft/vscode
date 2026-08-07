/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DocumentInfo } from './prompt';

/**
 * Interface for writing single-line comments in a given language.
 * Does not include the terminal new-line character (i.e. for many languages,
 * `end` will just be the empty string).
 */
interface CommentMarker {
	start: string;
	end: string;
}

interface ILanguageInfo {
	readonly lineComment: CommentMarker;
	/**
	 * if not set, defaults to the language id
	 */
	readonly markdownLanguageIds?: string[];
}

interface ILanguage extends ILanguageInfo {
	readonly languageId: string;
}

/**
 * Language files in VSCode:
 * https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
 *
 * Missing below from this list are:
 * Diff diff
 * Git git-commit and git-rebase
 * JSON json
 * ShaderLab shaderlab
 * Additional to that list are:
 * Erlang
 * Haskell
 * Kotlin
 * QL
 * Scala
 * Verilog
 *
 * Markdown ids from https://raw.githubusercontent.com/highlightjs/highlight.js/refs/heads/main/SUPPORTED_LANGUAGES.md
 * Also refer to [vscode-copilot-chat](https://github.com/microsoft/vscode-copilot-chat/blob/main/src/util/common/languages.ts)
 */
export const languageMarkers: { [language: string]: ILanguageInfo } = {
	abap: {
		lineComment: { start: '"', end: '' },
		markdownLanguageIds: ['abap', 'sap-abap'],
	},
	aspdotnet: {
		lineComment: { start: '<%--', end: '--%>' },
	},
	bat: {
		lineComment: { start: 'REM', end: '' },
	},
	bibtex: {
		lineComment: { start: '%', end: '' },
		markdownLanguageIds: ['bibtex'],
	},
	blade: {
		lineComment: { start: '#', end: '' },
	},
	BluespecSystemVerilog: {
		lineComment: { start: '//', end: '' },
	},
	c: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['c', 'h'],
	},
	clojure: {
		lineComment: { start: ';', end: '' },
		markdownLanguageIds: ['clojure', 'clj'],
	},
	coffeescript: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['coffeescript', 'coffee', 'cson', 'iced'],
	},
	cpp: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['cpp', 'hpp', 'cc', 'hh', 'c++', 'h++', 'cxx', 'hxx'],
	},
	csharp: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['csharp', 'cs'],
	},
	css: {
		lineComment: { start: '/*', end: '*/' },
	},
	cuda: {
		lineComment: { start: '//', end: '' },
	},
	dart: {
		lineComment: { start: '//', end: '' },
	},
	dockerfile: {
		lineComment: { start: '#', end: '' },
		markdownLanguageIds: ['dockerfile', 'docker'],
	},
	dotenv: {
		lineComment: { start: '#', end: '' },
	},
	elixir: {
		lineComment: { start: '#', end: '' },
	},
	erb: {
		lineComment: { start: '<%#', end: '%>' },
	},
	erlang: {
		lineComment: { start: '%', end: '' },
		markdownLanguageIds: ['erlang', 'erl'],
	},
	fsharp: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['fsharp', 'fs', 'fsx', 'fsi', 'fsscript'],
	},
	go: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['go', 'golang'],
	},
	graphql: {
		lineComment: { start: '#', end: '' },
	},
	groovy: {
		lineComment: { start: '//', end: '' },
	},
	haml: {
		lineComment: { start: '-#', end: '' },
	},
	handlebars: {
		lineComment: { start: '{{!', end: '}}' },
		markdownLanguageIds: ['handlebars', 'hbs', 'html.hbs', 'html.handlebars'],
	},
	haskell: {
		lineComment: { start: '--', end: '' },
		markdownLanguageIds: ['haskell', 'hs'],
	},
	hlsl: {
		lineComment: { start: '//', end: '' },
	},
	html: {
		lineComment: { start: '<!--', end: '-->' },
		markdownLanguageIds: ['html', 'xhtml'],
	},
	ini: {
		lineComment: { start: ';', end: '' },
	},
	java: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['java', 'jsp'],
	},
	javascript: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['javascript', 'js'],
	},
	javascriptreact: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['jsx'],
	},
	jsonc: {
		lineComment: { start: '//', end: '' },
	},
	jsx: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['jsx'],
	},
	julia: {
		lineComment: { start: '#', end: '' },
		markdownLanguageIds: ['julia', 'jl'],
	},
	kotlin: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['kotlin', 'kt'],
	},
	latex: {
		lineComment: { start: '%', end: '' },
		markdownLanguageIds: ['tex'],
	},
	legend: {
		lineComment: { start: '//', end: '' },
	},
	less: {
		lineComment: { start: '//', end: '' },
	},
	lua: {
		lineComment: { start: '--', end: '' },
		markdownLanguageIds: ['lua', 'pluto'],
	},
	makefile: {
		lineComment: { start: '#', end: '' },
		markdownLanguageIds: ['makefile', 'mk', 'mak', 'make'],
	},
	markdown: {
		lineComment: { start: '[]: #', end: '' },
		markdownLanguageIds: ['markdown', 'md', 'mkdown', 'mkd'],
	},
	'objective-c': {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['objectivec', 'mm', 'objc', 'obj-c'],
	},
	'objective-cpp': {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['objectivec++', 'objc+'],
	},
	perl: {
		lineComment: { start: '#', end: '' },
		markdownLanguageIds: ['perl', 'pl', 'pm'],
	},
	php: {
		lineComment: { start: '//', end: '' },
	},
	powershell: {
		lineComment: { start: '#', end: '' },
		markdownLanguageIds: ['powershell', 'ps', 'ps1'],
	},
	pug: {
		lineComment: { start: '//', end: '' },
	},
	python: {
		lineComment: { start: '#', end: '' },
		markdownLanguageIds: ['python', 'py', 'gyp'],
	},
	ql: {
		lineComment: { start: '//', end: '' },
	}, // QL is a query language for CodeQL
	r: {
		lineComment: { start: '#', end: '' },
	},
	razor: {
		lineComment: { start: '<!--', end: '-->' },
		markdownLanguageIds: ['cshtml', 'razor', 'razor-cshtml'],
	},
	ruby: {
		lineComment: { start: '#', end: '' },
		markdownLanguageIds: ['ruby', 'rb', 'gemspec', 'podspec', 'thor', 'irb'],
	},
	rust: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['rust', 'rs'],
	},
	sass: {
		lineComment: { start: '//', end: '' },
	},
	scala: {
		lineComment: { start: '//', end: '' },
	},
	scss: {
		lineComment: { start: '//', end: '' },
	},
	shellscript: {
		lineComment: { start: '#', end: '' },
		markdownLanguageIds: ['bash', 'sh', 'zsh'],
	},
	slang: {
		lineComment: { start: '//', end: '' },
	},
	slim: {
		lineComment: { start: '/', end: '' },
	},
	solidity: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['solidity', 'sol'],
	},
	sql: {
		lineComment: { start: '--', end: '' },
	},
	stylus: {
		lineComment: { start: '//', end: '' },
	},
	svelte: {
		lineComment: { start: '<!--', end: '-->' },
	},
	swift: {
		lineComment: { start: '//', end: '' },
	},
	systemverilog: {
		lineComment: { start: '//', end: '' },
	},
	terraform: {
		lineComment: { start: '#', end: '' },
	},
	tex: {
		lineComment: { start: '%', end: '' },
	},
	typescript: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['typescript', 'ts'],
	},
	typescriptreact: {
		lineComment: { start: '//', end: '' },
		markdownLanguageIds: ['tsx'],
	},
	vb: {
		lineComment: { start: `'`, end: '' },
		markdownLanguageIds: ['vb', 'vbscript'],
	},
	verilog: {
		lineComment: { start: '//', end: '' },
	},
	'vue-html': {
		lineComment: { start: '<!--', end: '-->' },
	},
	vue: {
		lineComment: { start: '//', end: '' },
	},
	xml: {
		lineComment: { start: '<!--', end: '-->' },
	},
	xsl: {
		lineComment: { start: '<!--', end: '-->' },
	},
	yaml: {
		lineComment: { start: '#', end: '' },
		markdownLanguageIds: ['yaml', 'yml'],
	},
};

const mdLanguageIdToLanguageId: { [markdownLanguageId: string]: string } = {};
for (const [languageId, info] of Object.entries(languageMarkers)) {
	if (info.markdownLanguageIds) {
		for (const mdLanguageId of info.markdownLanguageIds) {
			mdLanguageIdToLanguageId[mdLanguageId] = languageId;
		}
	} else {
		mdLanguageIdToLanguageId[languageId] = languageId;
	}
}

export function mdCodeBlockLangToLanguageId(mdLanguageId: string): string | undefined {
	return mdLanguageIdToLanguageId[mdLanguageId];
}

const defaultCommentMarker: CommentMarker = { start: '//', end: '' };

const dontAddLanguageMarker: string[] = [
	'php', // We don't know if the file starts with `<?php` or not
	'plaintext', // Doesn't admit comments
];

// prettier-ignore
const shebangLines: { [language: string]: string } = {
	'html': '<!DOCTYPE html>',
	'python': '#!/usr/bin/env python3',
	'ruby': '#!/usr/bin/env ruby',
	'shellscript': '#!/bin/sh',
	'yaml': '# YAML data'
};

/**
 * Determine if a line is a shebang line for a known language
 * @param line The line to check
 * @returns The language if it is a known shebang line, otherwise undefined
 */
export function isShebangLine(line: string): boolean {
	return Object.values(shebangLines).includes(line.trim());
}

/**
 * Best-effort determining whether the top of the source already contains a
 * discernible language marker, in particular a shebang line
 * @param languageId The string name of the language
 * @returns True iff we determined a recognisable language marker
 */
// prettier-ignore
export function hasLanguageMarker({ source }: DocumentInfo): boolean {
	return source.startsWith('#!') || source.startsWith('<!DOCTYPE');
}

/**
 * Comment a single line of text in a given language.
 * E.g. for python, turn "hello there" into "# hello there"
 *
 * Note: This will not behave as you expect if `text` has multiple lines. In
 * that case, use {@link commentBlockAsSingles} instead.
 */
export function comment(text: string, languageId: string) {
	const markers = languageMarkers[languageId] ? languageMarkers[languageId].lineComment : defaultCommentMarker;
	if (markers) {
		const end = markers.end === '' ? '' : ' ' + markers.end;
		return `${markers.start} ${text}${end}`;
	}
	return '';
}

/**
 * Comment a block of text using single-line comments.
 *
 * The returned comment block will have a trailing newline exactly when the
 * input does.
 */
export function commentBlockAsSingles(text: string, languageId: string) {
	if (text === '') {
		// Avoid spewing out a long list of blank lines
		return '';
	}
	const trailingNewline = text.endsWith('\n');
	const lines = (trailingNewline ? text.slice(0, -1) : text).split('\n');
	const commented = lines.map(line => comment(line, languageId)).join('\n');
	return trailingNewline ? commented + '\n' : commented;
}

/**
 * Return a one-line comment or text which describes the language of a
 * document, e.g. a shebang line or a comment.
 *
 * @param doc The document we want the marker for.
 * @returns A one-line string that describes the language.
 */
export function getLanguageMarker(doc: DocumentInfo): string {
	const { languageId } = doc;
	if (dontAddLanguageMarker.indexOf(languageId) === -1 && !hasLanguageMarker(doc)) {
		if (languageId in shebangLines) {
			return shebangLines[languageId];
		} else {
			return `Language: ${languageId}`;
		}
	}
	return '';
}

/**
 * Return a one-line comment containing the relative path of the document, if known.
 *
 * @param doc The document we want the marker for.
 * @param defaultCommentMarker The comment marker to use if the language does not have one.
 * @returns A one-line comment that contains the relative path of the document.
 */
export function getPathMarker(doc: DocumentInfo): string {
	if (doc.relativePath) {
		return `Path: ${doc.relativePath}`;
	}
	return '';
}

/**
 * Appends a new line to a string if it does not already end with one.
 *
 * @param str String to append
 *
 * @returns A string with a new line escape character at the end.
 */
export function newLineEnded(str: string): string {
	return str === '' || str.endsWith('\n') ? str : str + '\n';
}

/**
 * Retrieves the language for a given language identifier.
 *
 * @param languageId - The identifier of the language. If undefined, defaults to 'plaintext'.
 * @returns The language associated with the specified language identifier.
 */
export function getLanguage(languageId: string | undefined): ILanguage {
	if (typeof languageId === 'string') {
		return _getLanguage(languageId);
	}
	return _getLanguage('plaintext');
}

function _getLanguage(languageId: string): ILanguage {
	if (languageMarkers[languageId] !== undefined) {
		return { languageId, ...languageMarkers[languageId] };
	} else {
		return { languageId, lineComment: { start: '//', end: '' } };
	}
}
