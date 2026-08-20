/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IAgentSdkDownloader, IAgentSdkPackage } from '../../node/agentSdkDownloader.js';

/**
 * Downloader stub that records the interactions worth asserting on and refuses
 * the rest loudly.
 *
 * {@link available} answers `isAvailable` — "this build knows where to fetch the
 * SDK from". {@link resolvableWithoutDownload} answers the separate question of
 * whether it is already on disk, and defaults to {@link available} because that
 * is the common "SDK is here" case. Setting `available` true and
 * `resolvableWithoutDownload` false is the state the setup banner exists for: a
 * download is possible but has not happened yet. Neither ever falls through to
 * an agent's dev fallback, which would read this repo's `node_modules` and make
 * the answer depend on the machine.
 *
 * {@link loadSdkRootResult} is unset by default, so an unexpected cold download
 * surfaces as a thrown error rather than a silently mocked success. Fetching is
 * the downloader's own job and is covered by its own tests; what agents owe is
 * the progress interest held for the duration of a user-requested download,
 * which is what {@link heldProgressInterests} pins.
 */
export class RecordingAgentSdkDownloader implements IAgentSdkDownloader {
	declare readonly _serviceBrand: undefined;

	readonly onDidDownloadProgress = Event.None;

	/** Package ids for progress interests taken, and how many are still held. */
	readonly progressInterests: string[] = [];
	heldProgressInterests = 0;

	/** Whether the SDK is already on disk. Defaults to {@link available}. */
	resolvableWithoutDownload: boolean | undefined;

	/** What `loadSdkRoot` resolves to. Unset means "no download was expected here". */
	loadSdkRootResult: (() => Promise<string>) | undefined;

	constructor(public available = true) { }

	acquireDownloadProgressInterest(pkg: IAgentSdkPackage): IDisposable {
		this.progressInterests.push(pkg.id);
		this.heldProgressInterests++;
		return toDisposable(() => { this.heldProgressInterests--; });
	}

	isAvailable(): boolean {
		return this.available;
	}

	async isSdkResolvableWithoutDownload(): Promise<boolean> {
		return this.resolvableWithoutDownload ?? this.available;
	}

	loadSdkRoot(pkg: IAgentSdkPackage): Promise<string> {
		if (!this.loadSdkRootResult) {
			throw new Error(`test stub: unexpected SDK download for ${pkg.id}`);
		}
		return this.loadSdkRootResult();
	}
}
