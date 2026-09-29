/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvService } from '../../env/common/envService';
import { ElectronFetchErrorChromiumDetails } from '../../log/common/logService';
import { ReportFetchEvent } from '../common/fetcherService';
import { BaseFetchFetcher } from '../node/baseFetchFetcher';

export interface ElectronFetchError {
	readonly chromiumDetails?: ElectronFetchErrorChromiumDetails;
}

export class ElectronFetcher extends BaseFetchFetcher {

	static readonly ID = 'electron-fetch' as const;

	public static create(envService: IEnvService, reportEvent: ReportFetchEvent = () => { }, userAgentLibraryUpdate?: (original: string) => string): ElectronFetcher | null {
		const net = loadNetModule();
		if (!net) {
			return null;
		}
		return new ElectronFetcher(net.fetch, envService, reportEvent, userAgentLibraryUpdate);
	}

	private constructor(
		fetchImpl: typeof import('electron').net.fetch,
		envService: IEnvService,
		reportEvent: ReportFetchEvent,
		userAgentLibraryUpdate?: (original: string) => string,
	) {
		super(fetchImpl, envService, ElectronFetcher.ID, reportEvent, userAgentLibraryUpdate);
	}

	getUserAgentLibrary(): string {
		return ElectronFetcher.ID;
	}

	isInternetDisconnectedError(e: any): boolean {
		return ['net::ERR_INTERNET_DISCONNECTED', 'net::ERR_NETWORK_IO_SUSPENDED'].includes(e?.message);
	}
	isFetcherError(e: any): boolean {
		return e && e.message && e.message.startsWith('net::');
	}
	override isNetworkProcessCrashedError(e: unknown): boolean {
		return (e as ElectronFetchError)?.chromiumDetails?.network_process_crashed === true;
	}
}

function loadNetModule(): typeof import('electron').net | undefined {
	try {
		return require('electron').net;
	} catch (err) { }

	return undefined;
}
