/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TContribution } from '../index.js';
import { PromptLinkProvider } from './providers/promptLinkProvider.js';
import { isWindows } from '../../../../../../../base/common/platform.js';
import { PromptPathAutocompletion } from './providers/promptPathAutocompletion.js';
import { PromptLinkDiagnosticsInstanceManager } from './providers/promptLinkDiagnosticsProvider.js';
import { PromptHeaderDiagnosticsInstanceManager } from './providers/promptHeaderDiagnosticsProvider.js';

/**
 * Base list of language feature contributions.
 */
const CONTRIBUTIONS: TContribution[] = [
	PromptLinkProvider,
	PromptLinkDiagnosticsInstanceManager,
	PromptHeaderDiagnosticsInstanceManager,
	/**
	 * PromptDecorationsProviderInstanceManager is currently disabled because the only currently
	 * available decoration is the Front Matter header, which we decided to disable for now.
	 * Add it back when more decorations are needed.
	 */
	// PromptDecorationsProviderInstanceManager,
];

/**
 * We restrict this provider to `Unix` machines for now because of
 * the filesystem paths differences on `Windows` operating system.
 *
 * Notes on `Windows` support:
 * 	- we add the `./` for the first path component, which may not work on `Windows`
 * 	- the first path component of the absolute paths must be a drive letter
 */
if (isWindows === false) {
	CONTRIBUTIONS.push(PromptPathAutocompletion);
}

/**
 * List of language feature contributions for the prompt files.
 */
export const LANGUAGE_FEATURE_CONTRIBUTIONS = Object.freeze(CONTRIBUTIONS);
