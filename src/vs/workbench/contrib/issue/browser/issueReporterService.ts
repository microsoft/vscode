/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IProductConfiguration } from '../../../../base/common/product.js';
import { localize } from '../../../../nls.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { BaseIssueReporterService } from './baseIssueReporterService.js';
import { IIssueFormService, IssueReporterData } from '../common/issue.js';

// GitHub has let us know that we could up our limit here to 8k. We chose 7500 to play it safe.
// ref https://github.com/microsoft/vscode/issues/159191

export class IssueWebReporter extends BaseIssueReporterService {
	constructor(
		disableExtensions: boolean,
		data: IssueReporterData,
		os: {
			type: string;
			arch: string;
			release: string;
		},
		product: IProductConfiguration,
		window: Window,
		@IIssueFormService issueFormService: IIssueFormService,
		@IThemeService themeService: IThemeService
	) {
		super(disableExtensions, data, os, product, window, true, issueFormService, themeService);

		const target = this.window.document.querySelector<HTMLElement>('.block-system .block-info');

		const webInfo = this.window.navigator.userAgent;
		if (webInfo) {
			target?.appendChild(this.window.document.createTextNode(webInfo));
			this.receivedSystemInfo = true;
			this.issueReporterModel.update({ systemInfoWeb: webInfo });
		}

		this.setEventHandlers();
	}

	public override setEventHandlers(): void {
		super.setEventHandlers();

		this.addEventListener('issue-type', 'change', (event: Event) => {
			const issueType = parseInt((<HTMLInputElement>event.target).value);
			this.issueReporterModel.update({ issueType: issueType });

			// Resets placeholder
			const descriptionTextArea = <HTMLInputElement>this.getElementById('issue-title');
			if (descriptionTextArea) {
				descriptionTextArea.placeholder = localize('undefinedPlaceholder', "Please enter a title");
			}

			this.updatePreviewButtonState();
			this.setSourceOptions();
			this.render();
		});
	}
}
