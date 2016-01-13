/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { assign } from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';
import { IGalleryService, IExtension } from 'vs/workbench/parts/extensions/common/extensions';
import { IRequestService } from 'vs/platform/request/common/request';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';

import { nfcall } from 'vs/base/common/async';
import * as fs from 'fs';

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
	statistics: IGalleryExtensionStatistic[];
}

export interface IGalleryExtensionStatistic {
	statisticName: string;
	value: number;
}

export class GalleryService implements IGalleryService {

	public serviceId = IGalleryService;

	private extensionsGalleryUrl: string;

	constructor(
		@IRequestService private requestService: IRequestService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		const extensionsGalleryConfig = contextService.getConfiguration().env.extensionsGallery;
		this.extensionsGalleryUrl = extensionsGalleryConfig && extensionsGalleryConfig.serviceUrl;
	}

	private api(path = ''): string {
		return `${ this.extensionsGalleryUrl }${ path }`;
	}

	/**
	 * Extracts install count statistic.
	 */
	private extractInstallCount(statistics: IGalleryExtensionStatistic[]): number {
		var result = 0;
		statistics.forEach(stat => {
			if (stat.statisticName === 'install') {
				result = stat.value;
			}
		})
		return result;
	}

	public isEnabled(): boolean {
		return !!this.extensionsGalleryUrl;
	}

	/**
	 * Queries VS Code Extension marketplace for extensions.
	 *
	 * Sorts by install count.
	 */
	public query(): TPromise<IExtension[]> {
		if (!this.extensionsGalleryUrl) {
			return TPromise.wrapError(new Error('No extension gallery service configured.'));
		}

		const data = JSON.stringify({
			filters: [{
				criteria:[{
					filterType: 1,
					value: 'vscode'
				}]
			}],
			flags: 0x1 | 0x4 | 0x80 | 0x100
		});

		const request = {
			type: 'POST',
			url: this.api('/extensionquery'),
			data: data,
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json;api-version=3.0-preview.1',
				'Content-Length': data.length
			}
		};

		return this.requestService.makeRequest(request)
			.then<IGalleryExtension[]>(r => JSON.parse(r.responseText).results[0].extensions || [])
			.then<IExtension[]>(extensions => {
				return extensions.map(extension => ({
					name: extension.extensionName,
					displayName: extension.displayName || extension.extensionName,
					publisher: extension.publisher.publisherName,
					version: extension.versions[0].version,
					description: extension.shortDescription || '',
					installCount: this.extractInstallCount(extension.statistics),
					galleryInformation: {
						galleryApiUrl: this.extensionsGalleryUrl,
						id: extension.extensionId,
						downloadUrl: `${ extension.versions[0].assetUri }/Microsoft.VisualStudio.Services.VSIXPackage?install=true`,
						publisherId: extension.publisher.publisherId,
						publisherDisplayName: extension.publisher.displayName,
						date: extension.versions[0].lastUpdated,
					}
				}));
			});
	}
}