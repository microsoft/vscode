/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';

export const HAS_IGNORED_FILES_MESSAGE = l10n.t('\n\n**Note:** Some files were excluded from the context due to content exclusion rules. Click [here](https://docs.github.com/en/copilot/managing-github-copilot-in-your-organization/configuring-content-exclusions-for-github-copilot) to learn more.');

export const IIgnoreService = createServiceIdentifier<IIgnoreService>('IIgnoreService');

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

	isCopilotIgnored(file: URI, token?: CancellationToken): Promise<boolean>;

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
	const result: URI[] = [];
	for (const resource of resources) {
		if (!await ignoreService.isCopilotIgnored(resource)) {
			result.push(resource);
		}
	}
	return result;
}
