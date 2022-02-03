/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { fontFaceProperties, IFontFaceData, IWebFontService, WebFontSettings, } from 'vs/workbench/contrib/webFont/common/webFontService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

const ttPolicy = window.trustedTypes?.createPolicy('webFontService', {
	createHTML: string => string
});

export class WebFontService implements IWebFontService {
	declare readonly _serviceBrand: undefined;

	private styleElement: HTMLStyleElement = document.createElement('style');

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		console.log('web font service instance');

		this.createStyleElement();

		this.loadWebFont();

		this.installConfigurationListener();
	}

	private installConfigurationListener(): void {
		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(WebFontSettings.FONT_FACE_LIST)) {
				this.loadWebFont();
			}
		});
	}

	private createStyleElement(): void {
		this.styleElement = document.createElement('style');
		this.styleElement.setAttribute('type', 'text/css');
		this.styleElement.setAttribute('class', 'web-font-service-style');
		document.head.appendChild(this.styleElement);
	}

	private loadWebFont(): void {


		const fontFaceList = this.configurationService.getValue<IFontFaceData[]>(WebFontSettings.FONT_FACE_LIST);

		let content = '';
		fontFaceList.forEach(item => {
			content +=
				'@font-face {\n' +
				fontFaceProperties.filter(property => item[property]).map(property => `    ${property}: ${item[property]};`).join('\n') + '\n' +
				'}\n\n';
		});

		let html = ttPolicy?.createHTML(content) ?? content;
		this.styleElement.innerHTML = html as string;


	}
}

registerSingleton(IWebFontService, WebFontService);
