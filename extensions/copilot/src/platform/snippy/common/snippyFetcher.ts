/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestMetadata, RequestType } from '@vscode/copilot-api';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import * as fetch from '../../networking/common/fetcherService';
import { IFetcherService } from '../../networking/common/fetcherService';
import * as types from './snippyTypes';


export class SnippyFetchService {

	constructor(
		@IFetcherService private readonly fetcherService: IFetcherService,
		@ICAPIClientService private readonly capiClientService: ICAPIClientService,
		@IAuthenticationService private readonly authService: IAuthenticationService,
	) {
	}

	public async fetchMatch(source: string, cancellationToken: CancellationToken): Promise<types.MatchResponse.t | undefined> {
		const body: types.MatchRequest = {
			source
		};
		return this.fetch({ type: RequestType.SnippyMatch }, body, types.MatchResponse.to, cancellationToken);
	}

	public async fetchFilesForMatch(cursor: string, cancellationToken: CancellationToken): Promise<types.FileMatchResponse.t | undefined> {
		const body: types.FileMatchRequest = {
			cursor,
		};
		return this.fetch({ type: RequestType.SnippyFilesForMatch }, body, types.FileMatchResponse.to, cancellationToken);
	}

	/**
	 * @throws {CancellationError} if the request is cancelled
	 * @throws {Error} if the request fails
	 */
	public async fetch<T>(requestMetadata: RequestMetadata, requestBody: Record<string, string>, processResponse: (resp: fetch.Response) => T, cancellationToken: CancellationToken): Promise<T> {
		const abortController = this.fetcherService.makeAbortController();
		const disposable = cancellationToken.onCancellationRequested(() => {
			abortController.abort();
		});
		const signal = abortController.signal;
		const headers = await this.getHeaders();
		const options = {
			callSite: 'snippy-match',
			method: 'POST',
			headers,
			json: requestBody,
			signal,
		} satisfies fetch.FetchOptions;

		let fetchResponse: fetch.Response | undefined;
		try {
			fetchResponse = await this.capiClientService.makeRequest<fetch.Response>(options, requestMetadata);
		} catch (e: unknown) {
			if (this.fetcherService.isAbortError(e)) {
				throw new CancellationError();
			}

			throw e;
		} finally {
			disposable.dispose();
		}
		if (fetchResponse.status !== 200) {
			throw new Error(`Failed with status ${fetchResponse.status} and body: ${await fetchResponse.text()}`);
		}
		const responseBody = await fetchResponse.json();
		return processResponse(responseBody);
	}

	private async getHeaders() {

		const token = (await this.authService.getCopilotToken()).token;

		return {
			authorization: `Bearer ${token}`
		};
	}
}
