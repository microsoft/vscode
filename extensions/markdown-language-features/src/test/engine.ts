/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownItEngine } from '../markdownEngine';
import { MarkdownContributionProvider, MarkdownContributions } from '../markdownExtensions';
import { githubSlugifier } from '../slugify';
import { nulLogger } from './nulLogging';

class TestMarkdownContributionProvider implements MarkdownContributionProvider {
	readonly extensionUri = vscode.Uri.file('/');

	readonly onContributionsChanged: vscode.Event<this> = () => ({ dispose: () => { } });

	constructor(
		readonly contributions: MarkdownContributions,
	) { }

	dispose() { }
}

const emptyContributions = new TestMarkdownContributionProvider(MarkdownContributions.Empty);

export function createNewMarkdownEngine(
	markdownItPlugins: MarkdownContributions['markdownItPlugins'] = MarkdownContributions.Empty.markdownItPlugins,
): MarkdownItEngine {
	const contributionProvider = markdownItPlugins === MarkdownContributions.Empty.markdownItPlugins
		? emptyContributions
		: new TestMarkdownContributionProvider({
			...MarkdownContributions.Empty,
			markdownItPlugins,
		});
	return new MarkdownItEngine(contributionProvider, githubSlugifier, nulLogger);
}
