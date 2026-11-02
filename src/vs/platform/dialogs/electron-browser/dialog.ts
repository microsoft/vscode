/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fromNow } from '../../../base/common/date.js';
import { isLinuxSnap } from '../../../base/common/platform.js';
import { localize } from '../../../nls.js';
import { IOSProperties } from '../../native/common/native.js';
import { IProductService } from '../../product/common/productService.js';
import { process } from '../../../base/parts/sandbox/electron-browser/globals.js';

function formatCopilotVersion(version: string | undefined): string {
	return version?.replace(/^(?<core>\d+\.\d+\.\d+)-(?:canary|unstable)(?=[.+-]|$)/, '$<core>').replace(/\.unsigned$/, '') || 'Unknown';
}

export function createNativeAboutDialogDetails(productService: IProductService, osProps: IOSProperties): { title: string; details: string; detailsToCopy: string } {
	let version = productService.version;
	if (productService.target) {
		version = `${version} (${productService.target} setup)`;
	} else if (productService.darwinUniversalAssetId) {
		version = `${version} (Universal)`;
	}

	const copilotRuntimeVersion = formatCopilotVersion(productService.copilotVersions?.runtime);
	const copilotSdkVersion = formatCopilotVersion(productService.copilotVersions?.sdk);

	const getDetails = (useAgo: boolean): string => {
		return localize({ key: 'aboutDetail', comment: ['Electron, Chromium, Node.js, V8 and Copilot are product names that need no translation'] },
			"Version: {0}\nCommit: {1}\nDate: {2}\nElectron: {3}\nElectronBuildId: {4}\nChromium: {5}\nNode.js: {6}\nV8: {7}\n@github/copilot: {8}\n@github/copilot-sdk: {9}\nOS: {10}\n\nBased on Visual Studio Code and distributed under the MIT License. You may use, modify, and redistribute the MIT-licensed code under its terms. Microsoft copyright notices remain. Trinoris names and marks are separate from the code license.",
			version,
			productService.commit || localize('aboutLocalCommit', "Local source build"),
			productService.date ? `${productService.date}${useAgo ? ' (' + fromNow(new Date(productService.date), true) + ')' : ''}` : localize('aboutLocalDate', "Not stamped"),
			process.versions['electron'] || localize('aboutUnavailable', "Not available"),
			process.versions['microsoft-build'] || localize('aboutUnavailable', "Not available"),
			process.versions['chrome'] || localize('aboutUnavailable', "Not available"),
			process.versions['node'] || localize('aboutUnavailable', "Not available"),
			process.versions['v8'] || localize('aboutUnavailable', "Not available"),
			copilotRuntimeVersion,
			copilotSdkVersion,
			`${osProps.type} ${osProps.arch} ${osProps.release}${isLinuxSnap ? ' snap' : ''}`
		);
	};

	const details = getDetails(true);
	const detailsToCopy = getDetails(false);

	return {
		title: localize('aboutTitle', "Built on VS Code"),
		details: details,
		detailsToCopy: detailsToCopy
	};
}
