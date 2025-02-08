/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PickRemoteSourceOptions, PickRemoteSourceResult } from './typings/git-base';
import { GitBaseApi } from './git-base';

export async function pickRemoteSource(options: PickRemoteSourceOptions & { branch?: false | undefined }): Promise<string | undefined>;
export async function pickRemoteSource(options: PickRemoteSourceOptions & { branch: true }): Promise<PickRemoteSourceResult | undefined>;
export async function pickRemoteSource(options: PickRemoteSourceOptions = {}): Promise<string | PickRemoteSourceResult | undefined> {
	return GitBaseApi.getAPI().pickRemoteSource(options);
}

export async function getRemoteSourceActions(url: string) {
	return GitBaseApi.getAPI().getRemoteSourceActions(url);
}
