/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IGalleryService, IExtension, IGalleryVersion } from 'vs/workbench/parts/extensions/common/extensions';
import { IXHRResponse } from 'vs/base/common/http';
import { assign } from 'vs/base/common/objects';
import { IRequestService } from 'vs/platform/request/common/request';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export interface IGalleryExtensionFile {
	assetType: string;
}

export interface IGalleryExtensionVersion {
	version: string;
	lastUpdated: string;
	assetUri: string;
	files: IGalleryExtensionFile[];
}

export interface IGalleryExtension {
	extensionId: string;
	extensionName: string;
	displayName: string;
	shortDescription: string;
	publisher: { displayName: string, publisherId: string, publisherName: string; };
	versions: IGalleryExtensionVersion[];
	galleryApiUrl: string;
	statistics: IGalleryExtensionStatistics[];
}

export interface IGalleryExtensionStatistics {
	statisticName: string;
	value: number;
}

function getInstallCount(statistics: IGalleryExtensionStatistics[]): number {
	if (!statistics) {
		return 0;
	}

	const result = statistics.filter(s => s.statisticName === 'install')[0];
	return result ? result.value : 0;
}

const FIVE_MINUTES = 1000 * 60 * 5;

export class GalleryService implements IGalleryService {

	serviceId = IGalleryService;

	private extensionsGalleryUrl: string;
	private extensionsCacheUrl: string;
	private machineId: TPromise<string>;

	constructor(
		@IRequestService private requestService: IRequestService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		const config = contextService.getConfiguration().env.extensionsGallery;
		this.extensionsGalleryUrl = config && config.serviceUrl;
		this.extensionsCacheUrl = config && config.cacheUrl;
		this.machineId = telemetryService.getTelemetryInfo().then(({ machineId }) => machineId);
	}

	private api(path = ''): string {
		return `${ this.extensionsGalleryUrl }${ path }`;
	}

	isEnabled(): boolean {
		return !!this.extensionsGalleryUrl;
	}

	query(): TPromise<IExtension[]> {
		if (!this.isEnabled()) {
			return TPromise.wrapError(new Error('No extension gallery service configured.'));
		}

		const raw = this.queryCache()
			.then(null, err => this.queryGallery())
			.then(result => {
				const rawLastModified = result.getResponseHeader('last-modified');

				if (!rawLastModified) {
					return this.queryGallery();
				}

				const lastModified = new Date(rawLastModified).getTime();
				const now = new Date().getTime();
				const diff = now - lastModified;

				if (diff > FIVE_MINUTES) {
					return this.queryGallery();
				}

				return TPromise.as(result);
			});

		return raw
			.then<IGalleryExtension[]>(r => JSON.parse(r.responseText).results[0].extensions || [])
			.then<IExtension[]>(extensions => {
				return this.getRequestHeaders().then(downloadHeaders => {
					return extensions.map(e => {
						const versions = e.versions.map<IGalleryVersion>(v => ({
							version: v.version,
							date: v.lastUpdated,
							downloadHeaders,
							downloadUrl: `${ v.assetUri }/Microsoft.VisualStudio.Services.VSIXPackage?install=true`,
							manifestUrl: `${ v.assetUri }/Microsoft.VisualStudio.Code.Manifest`
						}));

						return {
							name: e.extensionName,
							displayName: e.displayName || e.extensionName,
							publisher: e.publisher.publisherName,
							version: versions[0].version,
							engines: { vscode: void 0 }, // TODO: ugly
							description: e.shortDescription || '',
							galleryInformation: {
								galleryApiUrl: this.extensionsGalleryUrl,
								id: e.extensionId,
								publisherId: e.publisher.publisherId,
								publisherDisplayName: e.publisher.displayName,
								installCount: getInstallCount(e.statistics),
								versions
							}
						};
					});
				});
			});
	}

	private queryCache(): TPromise<IXHRResponse> {
		const url = this.extensionsCacheUrl;

		if (!url) {
			return TPromise.wrapError(new Error('No cache configured.'));
		}

		return this.requestService.makeRequest({ url });
	}

	private queryGallery(): TPromise<IXHRResponse> {
		const data = JSON.stringify({
			filters: [{
				criteria:[{
					filterType: 1,
					value: 'vscode'
				}]
			}],
			flags: 0x1 | 0x4 | 0x80 | 0x100
		});

		return this.getRequestHeaders().then(headers => {
			headers = assign(headers, {
				'Content-Type': 'application/json',
				'Accept': 'application/json;api-version=3.0-preview.1',
				'Content-Length': data.length
			});

			const request = {
				type: 'POST',
				url: this.api('/extensionquery'),
				data,
				headers
			};

			return this.requestService.makeRequest(request);
		});
	}

	private getRequestHeaders(): TPromise<any> {
		return this.machineId.then(machineId => {
			const result = {
				'X-Market-Client-Id': 'VSCode'
			};

			if (machineId) {
				result['X-Market-User-Id'] = machineId;
			}

			return result;
		});
	}
}