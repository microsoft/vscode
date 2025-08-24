/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../base/browser/dom.js';
import { IDisposable } from '../../base/common/lifecycle.js';
import { PixelRatio } from '../../base/browser/pixelRatio.js';
import { applyFontInfo } from '../../editor/browser/config/domFontInfo.js';
import { BareFontInfo, FontInfo } from '../../editor/common/config/fontInfo.js';
import { FontMeasurements } from '../../editor/browser/config/fontMeasurements.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';

export interface IFontOptions {
	fontFamily?: string;
	fontLigatures?: boolean;
	fontSize?: number;
	fontVariations?: boolean;
	fontWeight?: string;
	letterSpacing?: number;
	lineHeight?: number;
}

export class FontConfigurationManager {
	public static getFontInfo(
		configurationService: IConfigurationService,
		configurationSection: string,
		container: HTMLElement | undefined = undefined
	): FontInfo {
		const fontOptions = configurationService.getValue<IFontOptions>(configurationSection);

		const window = container ?
			DOM.getActiveWindow() :
			DOM.getWindow(container);

		return FontMeasurements.readFontInfo(
			window,
			BareFontInfo.createFromRawSettings(fontOptions, PixelRatio.getInstance(window).value)
		);
	}

	public static fontConfigurationWatcher(
		configurationService: IConfigurationService,
		configurationSection: string,
		element: HTMLElement,
		fontInfoChangedCallback?: (fontInfo: FontInfo) => void
	): IDisposable {
		applyFontInfo(element, FontConfigurationManager.getFontInfo(configurationService, configurationSection, element));

		return configurationService.onDidChangeConfiguration(configurationChangeEvent => {
			if (configurationChangeEvent.affectsConfiguration(configurationSection)) {
				if (configurationChangeEvent.affectedKeys.has(`${configurationSection}.fontFamily`) ||
					configurationChangeEvent.affectedKeys.has(`${configurationSection}.fontLigatures`) ||
					configurationChangeEvent.affectedKeys.has(`${configurationSection}.fontSize`) ||
					configurationChangeEvent.affectedKeys.has(`${configurationSection}.fontVariations`) ||
					configurationChangeEvent.affectedKeys.has(`${configurationSection}.fontWeight`) ||
					configurationChangeEvent.affectedKeys.has(`${configurationSection}.letterSpacing`) ||
					configurationChangeEvent.affectedKeys.has(`${configurationSection}.lineHeight`)
				) {
					const fontInfo = FontConfigurationManager.getFontInfo(configurationService, configurationSection, element);

					applyFontInfo(element, fontInfo);

					if (fontInfoChangedCallback) {
						fontInfoChangedCallback(fontInfo);
					}
				}
			}
		});
	}
}
