/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IThemeImporterService, IThemePreviewResult } from '../common/themeImporter.js';

/**
 * Browser/web no-op implementation of {@link IThemeImporterService}. The web
 * variant of the Agents app does not have access to a parent VS Code
 * installation, so theme importing is unavailable.
 */
class BrowserThemeImporterService implements IThemeImporterService {

	declare readonly _serviceBrand: undefined;

	async getVSCodeTheme(): Promise<string | undefined> {
		return undefined;
	}

	async previewVSCodeTheme(): Promise<IThemePreviewResult | undefined> {
		return undefined;
	}
}

registerSingleton(IThemeImporterService, BrowserThemeImporterService, InstantiationType.Delayed);
