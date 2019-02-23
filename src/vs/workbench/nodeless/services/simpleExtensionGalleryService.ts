/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionGalleryService, IQueryOptions, IGalleryExtension, InstallOperation, StatisticType, ITranslation, IGalleryExtensionVersion, IExtensionIdentifier, IReportedExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IPager } from 'vs/base/common/paging';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';

export class SimpleExtensionGalleryService implements IExtensionGalleryService {

	_serviceBrand: any;

	isEnabled(): boolean {
		return false;
	}

	query(options?: IQueryOptions): Promise<IPager<IGalleryExtension>> {
		return Promise.resolve(undefined);
	}

	download(extension: IGalleryExtension, operation: InstallOperation): Promise<string> {
		return Promise.resolve(undefined);
	}

	reportStatistic(publisher: string, name: string, version: string, type: StatisticType): Promise<void> {
		return Promise.resolve(undefined);
	}

	getReadme(extension: IGalleryExtension, token: CancellationToken): Promise<string> {
		return Promise.resolve(undefined);
	}

	getManifest(extension: IGalleryExtension, token: CancellationToken): Promise<IExtensionManifest> {
		return Promise.resolve(undefined);
	}

	getChangelog(extension: IGalleryExtension, token: CancellationToken): Promise<string> {
		return Promise.resolve(undefined);
	}

	getCoreTranslation(extension: IGalleryExtension, languageId: string): Promise<ITranslation> {
		return Promise.resolve(undefined);
	}

	getAllVersions(extension: IGalleryExtension, compatible: boolean): Promise<IGalleryExtensionVersion[]> {
		return Promise.resolve(undefined);
	}

	loadAllDependencies(dependencies: IExtensionIdentifier[], token: CancellationToken): Promise<IGalleryExtension[]> {
		return Promise.resolve(undefined);
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		return Promise.resolve(undefined);
	}

	getCompatibleExtension(extension: IGalleryExtension): Promise<IGalleryExtension>;
	getCompatibleExtension(id: IExtensionIdentifier, version?: string): Promise<IGalleryExtension>;
	getCompatibleExtension(id: any, version?: any) {
		return Promise.resolve(undefined);
	}
}