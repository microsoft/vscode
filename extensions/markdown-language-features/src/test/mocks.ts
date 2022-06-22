/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MdLinkComputer } from '../languageFeatures/documentLinks';
import { ILogger } from '../logging';
import { MarkdownItEngine } from '../markdownEngine';
import { MarkdownContributionProvider, MarkdownContributions } from '../markdownExtensions';
import { githubSlugifier } from '../slugify';
import { loadMarkdownTreeSitter } from '../treesitter';
import { Disposable } from '../util/dispose';

export const nulLogger = new class implements ILogger {
	verbose(): void {
		// noop
	}
};

const emptyContributions = new class extends Disposable implements MarkdownContributionProvider {
	readonly extensionUri = vscode.Uri.file('/');
	readonly contributions = MarkdownContributions.Empty;
	readonly onContributionsChanged = this._register(new vscode.EventEmitter<this>()).event;
};

export function createTestMarkdownEngine(): MarkdownItEngine {
	return new MarkdownItEngine(emptyContributions, githubSlugifier, nulLogger);
}

export function createTestLinkComputer(_engine: MarkdownItEngine) {
	return new MdLinkComputer(() => {
		const path = vscode.Uri.joinPath(vscode.extensions.getExtension('vscode.markdown-language-features')!.extensionUri, 'tree-sitter-markdown.wasm');
		return loadMarkdownTreeSitter(path);
	});
}
