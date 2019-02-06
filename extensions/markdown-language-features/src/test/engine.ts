/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownEngine } from '../markdownEngine';
import { MarkdownContributionProvider, MarkdownContributions } from '../markdownExtensions';
import { githubSlugifier } from '../slugify';

const emptyContributions = new class implements MarkdownContributionProvider {
	readonly extensionPath = '';
	readonly contributions = MarkdownContributions.Empty;
};

export function createNewMarkdownEngine(): MarkdownEngine {
	return new MarkdownEngine(emptyContributions, githubSlugifier);
}
