/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sanitizeVSCodeVersion } from '../../../util/common/vscodeVersion';
import { IEnvService } from '../../env/common/envService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { IReleaseNotesService } from '../common/releaseNotesService';

export class ReleaseNotesService implements IReleaseNotesService {
	declare _serviceBrand: undefined;
	static readonly BASE_URL = 'https://code.visualstudio.com/raw';

	constructor(@IEnvService private readonly envService: IEnvService,
		@IFetcherService private readonly fetcherService: IFetcherService
	) { }

	async fetchLatestReleaseNotes(): Promise<string | undefined> {
		const url = this.getUrl();
		if (!url) {
			return;
		}
		const releaseNotes = await this.fetcherService.fetch(url, {
			method: 'GET',
			callSite: 'release-notes',
		});
		const releaseNotesText = await releaseNotes.text();
		return releaseNotesText;
	}

	async fetchReleaseNotesForVersion(version: string): Promise<string | undefined> {
		const url = this.getUrl(version);
		if (!url) {
			return;
		}
		const releaseNotes = await this.fetcherService.fetch(url, {
			method: 'GET',
			callSite: 'release-notes-version',
		});
		const releaseNotesText = await releaseNotes.text();
		return releaseNotesText;
	}

	private getUrl(version?: string): string | undefined {
		// Build URL using MAJOR and MINOR only (no patch). VS Code does not have separate URLs per patch.
		const sourceVersion = (version && version.trim().length > 0)
			? version.trim()
			: this.envService.getEditorInfo().version;

		let major: string | undefined;
		let minor: string | undefined;

		if (/^\d+\.\d+(?:\.\d+)?$/.test(sourceVersion)) {
			const sanitized = sanitizeVSCodeVersion(sourceVersion);
			const mm = /^(\d+)\.(\d+)$/.exec(sanitized);
			if (!mm) {
				return;
			}
			major = mm[1];
			minor = mm[2];
		} else {
			return;
		}

		return `${ReleaseNotesService.BASE_URL}/v${major}_${minor}.md`;
	}
}