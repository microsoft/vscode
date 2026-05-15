/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BaseOctoKitService, GitHubOutageStatus, IOctoKitUser } from './githubService';

export class NullBaseOctoKitService extends BaseOctoKitService {

	override async getGitHubOutageStatus(): Promise<GitHubOutageStatus> {
		return GitHubOutageStatus.None;
	}

	override async getCurrentAuthedUserWithToken(token: string): Promise<IOctoKitUser | undefined> {
		return { avatar_url: '', login: 'NullUser', name: 'Null User' };
	}

	override async _makeGHAPIRequest(routeSlug: string, method: 'GET' | 'POST', token: string, body?: { [key: string]: any }, options?: { silent404?: boolean }, callSite?: string) {
		return undefined;
	}

}