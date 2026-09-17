/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { createServiceIdentifier } from '../../../util/common/services';
import { Limiter } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';

export const HAS_IGNORED_FILES_MESSAGE = l10n.t('\n\n**Note:** Some files were excluded from the context due to content exclusion rules. Click [here](https://docs.github.com/en/copilot/managing-github-copilot-in-your-organization/configuring-content-exclusions-for-github-copilot) to learn more.');

export const IIgnoreService = createServiceIdentifier<IIgnoreService>('IIgnoreService');

/** How many exclusion checks may run at once when filtering a batch of search results. */
const IGNORE_CHECK_CONCURRENCY = 20;

export interface IIgnoreService {

	_serviceBrand: undefined;

	isEnabled: boolean;

	/**
	 * Whether or not regex context exclusions are enabled.
	 * If they're not enabled, you can use the `asMinimatchPattern` method to get a minimatch pattern that works for the exclusion rules.
	 * Otherwise you will need to do a `.filter()` on the files yourself.
	 */
	isRegexExclusionsEnabled: boolean;

	dispose(): void;

	init(): Promise<void>;

	isCopilotIgnored(file: URI, token?: CancellationToken, contents?: string): Promise<boolean>;

	asMinimatchPattern(): Promise<string | undefined>;
}

export class NullIgnoreService implements IIgnoreService {

	declare readonly _serviceBrand: undefined;

	static readonly Instance = new NullIgnoreService();

	dispose(): void { }

	get isEnabled(): boolean {
		return false;
	}

	get isRegexExclusionsEnabled(): boolean {
		return false;
	}

	async init(): Promise<void> { }

	async isCopilotIgnored(file: URI): Promise<boolean> {
		return false;
	}

	async asMinimatchPattern(): Promise<string | undefined> {
		return undefined;
	}
}

export async function filterIngoredResources(ignoreService: IIgnoreService, resources: URI[]): Promise<URI[]> {
	// Bounded because this runs over every search result, and an unresolved repository turns each
	// check into a git extension lookup, plus a file read when content rules are configured.
	const limiter = new Limiter<boolean>(IGNORE_CHECK_CONCURRENCY);
	try {
		const ignored = await Promise.all(resources.map(resource => limiter.queue(() => ignoreService.isCopilotIgnored(resource))));
		return resources.filter((_, index) => !ignored[index]);
	} finally {
		limiter.dispose();
	}
}
