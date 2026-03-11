/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductConfiguration } from '../../../base/common/product.js';

export function shouldDisableUpdatesForWindowsX64OnArm64(processArch: string, isRunningUnderARM64Translation: boolean): boolean {
	return processArch === 'x64' && isRunningUnderARM64Translation;
}

export function getWindowsArm64DownloadPlatform(target: string | undefined): string {
	return target === 'user' ? 'win32-arm64-user' : 'win32-arm64';
}

export function getWindowsArm64DownloadUrl(productService: Pick<IProductConfiguration, 'downloadUrl' | 'quality' | 'target' | 'updateUrl' | 'version'>): string | undefined {
	const platform = getWindowsArm64DownloadPlatform(productService.target);

	if (productService.updateUrl && productService.version && productService.quality) {
		const updateUrl = new URL(productService.updateUrl);
		return new URL(`/${encodeURIComponent(productService.version)}/${platform}/${encodeURIComponent(productService.quality)}`, updateUrl.origin).toString();
	}

	if (!productService.downloadUrl) {
		return undefined;
	}

	try {
		const downloadUrl = new URL(productService.downloadUrl);

		if (downloadUrl.searchParams.has('os')) {
			downloadUrl.searchParams.set('os', platform);

			if (productService.quality && downloadUrl.searchParams.has('build')) {
				downloadUrl.searchParams.set('build', productService.quality);
			}

			return downloadUrl.toString();
		}
	} catch {
		// Fall back to the configured download URL below.
	}

	return productService.downloadUrl;
}
