/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Paths = require('vs/base/common/paths');
import { ExtensionData, IThemeExtensionPoint, IFileIconTheme } from 'vs/workbench/services/themes/common/workbenchThemeService';

export class FileIconThemeData implements IFileIconTheme {
	id: string;
	label: string;
	settingsId: string;
	description?: string;
	hasFileIcons?: boolean;
	hasFolderIcons?: boolean;
	isLoaded: boolean;
	path?: string;
	styleSheetContent?: string;
	extensionData: ExtensionData;

	private constructor() {
	}

	static fromExtensionTheme(iconTheme: IThemeExtensionPoint, normalizedAbsolutePath: string, extensionData: ExtensionData): FileIconThemeData {
		let themeData = new FileIconThemeData();
		themeData.id = extensionData.extensionId + '-' + iconTheme.id;
		themeData.label = iconTheme.label || Paths.basename(iconTheme.path);
		themeData.settingsId = iconTheme.id;
		themeData.description = iconTheme.description;
		themeData.path = normalizedAbsolutePath;
		themeData.extensionData = extensionData;
		themeData.isLoaded = false;
		return themeData;
	}
}

