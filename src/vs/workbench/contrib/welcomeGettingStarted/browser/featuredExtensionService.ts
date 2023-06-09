/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionGalleryService, IExtensionManagementService, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IProductService } from 'vs/platform/product/common/productService';
import { IFeaturedExtension } from 'vs/base/common/product';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { localize } from 'vs/nls';
import { IWorkbenchAssignmentService } from 'vs/workbench/services/assignment/common/assignmentService';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { raceTimeout } from 'vs/base/common/async';

type FeaturedExtensionTreatment = { extensions: string[]; showAsList?: string };
type FeaturedExtensionStorageData = { title: string; description: string; imagePath: string; date: number };

export const IFeaturedExtensionsService = createDecorator<IFeaturedExtensionsService>('featuredExtensionsService');

export interface IFeaturedExtensionsService {
	_serviceBrand: undefined;

	getExtensions(): Promise<IFeaturedExtension[]>;
	title: string;
}

const enum FeaturedExtensionMetadataType {
	Title,
	Description,
	ImagePath
}

export class FeaturedExtensionsService extends Disposable implements IFeaturedExtensionsService {
	declare readonly _serviceBrand: undefined;

	private ignoredExtensions: Set<string> = new Set<string>();
	private treatment: FeaturedExtensionTreatment | undefined;
	private _isInitialized: boolean = false;

	private static readonly STORAGE_KEY = 'workbench.welcomePage.extensionMetadata';

	constructor(
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchAssignmentService private readonly tasExperimentService: IWorkbenchAssignmentService,
		@IStorageService private readonly storageService: IStorageService,
		@IProductService private readonly productService: IProductService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
	) {
		super();
		this.title = localize('gettingStarted.featuredTitle', 'Featured');
	}

	title: string;

	async getExtensions(): Promise<IFeaturedExtension[]> {

		await this._init();

		let treatments = this.treatment?.extensions?.filter(extension => !this.ignoredExtensions.has(extension)) ?? new Array<string>();
		const featuredExtensions: IFeaturedExtension[] = new Array();

		if (this.treatment?.showAsList !== 'true' && treatments.length > 0) {
			// pick a random extensionId for display
			const treatment = treatments[Math.floor(Math.random() * treatments.length)];
			treatments = [treatment];
		}

		for (const treatment of treatments) {
			const extension = await this.resolveExtension(treatment);
			if (extension) {
				featuredExtensions.push(extension);
			}
		}

		return featuredExtensions;
	}

	private async _init(): Promise<void> {

		if (this._isInitialized) {
			return;
		}

		const [extensions, extensionListTitle] = await Promise.all([raceTimeout(this.tasExperimentService?.getTreatment<string>('welcome.featured.item'), 2000),
		raceTimeout(this.tasExperimentService?.getTreatment<string>('welcome.featured.title'), 2000)]);

		try {
			this.treatment = extensions ? JSON.parse(extensions) : { extensions: [] };
		} catch {
		}

		this.title = extensionListTitle ?? localize('gettingStarted.featuredTitle', 'Featured');

		if (this.treatment?.extensions && Array.isArray(this.treatment.extensions)) {
			const installed = await this.extensionManagementService.getInstalled();
			for (const extension of this.treatment.extensions) {
				if (installed.some(e => ExtensionIdentifier.equals(e.identifier.id, extension))) {
					this.ignoredExtensions.add(extension);
				}
				else {
					let galleryExtension: IGalleryExtension | undefined;
					try {
						galleryExtension = (await this.galleryService.getExtensions([{ id: extension }], CancellationToken.None))[0];
					} catch (err) {
						continue;
					}
					if (!await this.extensionManagementService.canInstall(galleryExtension)) {
						this.ignoredExtensions.add(extension);
					}
				}
			}
		}

		this._isInitialized = true;
	}

	private async resolveExtension(extensionId: string): Promise<IFeaturedExtension | undefined> {

		const productMetadata = this.productService.featuredExtensions?.find(e => ExtensionIdentifier.equals(e.id, extensionId));

		const title = productMetadata?.title ?? await this.getMetadata(extensionId, FeaturedExtensionMetadataType.Title);
		const description = productMetadata?.description ?? await this.getMetadata(extensionId, FeaturedExtensionMetadataType.Description);
		const imagePath = productMetadata?.imagePath ?? await this.getMetadata(extensionId, FeaturedExtensionMetadataType.ImagePath);

		if (title && description && imagePath) {
			return {
				id: extensionId,
				title: title,
				description: description,
				imagePath: imagePath,
			};
		}
		return undefined;
	}

	private async getMetadata(extensionId: string, key: FeaturedExtensionMetadataType): Promise<string | undefined> {

		const storageMetadata = this.getStorageData(extensionId);
		if (storageMetadata) {
			switch (key) {
				case FeaturedExtensionMetadataType.Title: {
					return storageMetadata.title;
				}
				case FeaturedExtensionMetadataType.Description: {
					return storageMetadata.description;
				}
				case FeaturedExtensionMetadataType.ImagePath: {
					return storageMetadata.imagePath;
				}
				default:
					return undefined;
			}
		}

		return await this.getGalleryMetadata(extensionId, key);
	}

	private getStorageData(extensionId: string): FeaturedExtensionStorageData | undefined {
		const metadata = this.storageService.get(FeaturedExtensionsService.STORAGE_KEY + '.' + extensionId, StorageScope.APPLICATION);
		if (metadata) {
			const value = JSON.parse(metadata) as FeaturedExtensionStorageData;
			const lastUpdateDate = new Date().getTime() - value.date;
			if (lastUpdateDate < 1000 * 60 * 60 * 24 * 7) {
				return value;
			}
		}
		return undefined;
	}

	private async getGalleryMetadata(extensionId: string, key: FeaturedExtensionMetadataType): Promise<string | undefined> {

		const storageKey = FeaturedExtensionsService.STORAGE_KEY + '.' + extensionId;
		this.storageService.remove(storageKey, StorageScope.APPLICATION);
		let metadata: string | undefined;

		let galleryExtension: IGalleryExtension | undefined;
		try {
			galleryExtension = (await this.galleryService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
		} catch (err) {
		}

		if (!galleryExtension) {
			return metadata;
		}

		switch (key) {
			case FeaturedExtensionMetadataType.Title: {
				metadata = galleryExtension.displayName;
				break;
			}
			case FeaturedExtensionMetadataType.Description: {
				metadata = galleryExtension.description;
				break;
			}
			case FeaturedExtensionMetadataType.ImagePath: {
				metadata = galleryExtension.assets.icon?.uri;
				break;
			}
		}

		this.storageService.store(storageKey, JSON.stringify({
			title: galleryExtension.displayName,
			description: galleryExtension.description,
			imagePath: galleryExtension.assets.icon?.uri,
			date: new Date().getTime()
		}), StorageScope.APPLICATION, StorageTarget.MACHINE);

		return metadata;
	}
}

registerSingleton(IFeaturedExtensionsService, FeaturedExtensionsService, InstantiationType.Delayed);
