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
	},
	aspdotnet: {
		lineComment: { start: '<%--', end: '--%>' },
	},
	bat: {
		lineComment: { start: 'REM', end: '' },
	},
	bibtex: {
		lineComment: { start: '%', end: '' },
	},
	blade: {
		lineComment: { start: '#', end: '' },
	},
	BluespecSystemVerilog: {
		lineComment: { start: '//', end: '' },
	},
	c: {
		lineComment: { start: '//', end: '' },
	},
	clojure: {
		lineComment: { start: ';', end: '' },
	},
	coffeescript: {
		lineComment: { start: '//', end: '' },
	},
	cpp: {
		lineComment: { start: '//', end: '' },
	},
	csharp: {
		lineComment: { start: '//', end: '' },
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
	},
	fsharp: {
		lineComment: { start: '//', end: '' },
	},
	go: {
		lineComment: { start: '//', end: '' },
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
	},
	haskell: {
		lineComment: { start: '--', end: '' },
	},
	hlsl: {
		lineComment: { start: '//', end: '' },
	},
	html: {
		lineComment: { start: '<!--', end: '-->' },
	},
	ini: {
		lineComment: { start: ';', end: '' },
	},
	java: {
		lineComment: { start: '//', end: '' },
	},
	javascript: {
		lineComment: { start: '//', end: '' },
	},
	javascriptreact: {
		lineComment: { start: '//', end: '' },
	},
	jsonc: {
		lineComment: { start: '//', end: '' },
	},
	jsx: {
		lineComment: { start: '//', end: '' },
	},
	julia: {
		lineComment: { start: '#', end: '' },
	},
	kotlin: {
		lineComment: { start: '//', end: '' },
	},
	latex: {
		lineComment: { start: '%', end: '' },
	},
	legend: {
		lineComment: { start: '//', end: '' },
	},
	less: {
		lineComment: { start: '//', end: '' },
	},
	lua: {
		lineComment: { start: '--', end: '' },
	},
	makefile: {
		lineComment: { start: '#', end: '' },
	},
	markdown: {
		lineComment: { start: '[]: #', end: '' },
	},
	'objective-c': {
		lineComment: { start: '//', end: '' },
	},
	'objective-cpp': {
		lineComment: { start: '//', end: '' },
	},
	perl: {
		lineComment: { start: '#', end: '' },
	},
	php: {
		lineComment: { start: '//', end: '' },
	},
	powershell: {
		lineComment: { start: '#', end: '' },
	},
	pug: {
		lineComment: { start: '//', end: '' },
	},
	python: {
		lineComment: { start: '#', end: '' },
	},
	ql: {
		lineComment: { start: '//', end: '' },
	}, // QL is a query language for CodeQL
	r: {
		lineComment: { start: '#', end: '' },
	},
	razor: {
		lineComment: { start: '<!--', end: '-->' },
	},
	ruby: {
		lineComment: { start: '#', end: '' },
	},
	rust: {
		lineComment: { start: '//', end: '' },
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
	},
	slang: {
		lineComment: { start: '//', end: '' },
	},
	slim: {
		lineComment: { start: '/', end: '' },
	},
	solidity: {
		lineComment: { start: '//', end: '' },
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
	},
	typescriptreact: {
		lineComment: { start: '//', end: '' },
	},
	vb: {
		lineComment: { start: `'`, end: '' },
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
	},
};

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
