/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const AGENT_HOST_FILE_LINK_INSTRUCTIONS = [
	'<file_folder_and_symbol_links>',
	'Always use Markdown links when referring to existing files, folders, or symbols in the workspace. This is very important for helping the user understand your responses.',
	'- File: use the file name as the link text and the absolute filesystem path as the target, for example [foo.ts](/path/to/foo.ts).',
	'- Folder: links to folders are also supported, with an absolute path to the folder as the target, for example [src/](/path/to/src).',
	'- Symbol: link to symbols by using the containing file path with a 1-based line number as the target, for example [myMethod](/path/to/foo.ts:42).',
	'- Use `/` path separators in link targets, including on Windows (`C:/path/to/foo.ts`).',
	'- If a file path has spaces, wrap the target in angle brackets: [foo bar.ts](</path/to/foo bar.ts>).',
	'- Use absolute filesystem paths rather than `file://` URIs.',
	'- These rules are only for links in your responses. When writing a Markdown file, prefer paths relative to that Markdown file, for example [foo](./foo.md).',
	'- Do not provide line ranges.',
	'- Use a markdown link format every time you refer to a file, folder, or symbol, not just the first time.',
	'</file_folder_and_symbol_links>',
].join('\n');
