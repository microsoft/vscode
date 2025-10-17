/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IIssueFormService, IssueReporterData } from '../common/issue.js';
import { IssueReporterControl } from '../browser/issueReporterControl.js';

export class NativeIssueReporterControl extends IssueReporterControl {

	private osInfo: { type: string; arch: string; release: string } = { type: '', arch: '', release: '' };

	constructor(
		container: HTMLElement,
		data: IssueReporterData,
		@IInstantiationService instantiationService: IInstantiationService,
		@IIssueFormService issueFormService: IIssueFormService,
		@INativeHostService private readonly nativeHostService: INativeHostService
	) {
		super(container, data, instantiationService, issueFormService);
		this.initializeOSInfo();
	}

	private async initializeOSInfo(): Promise<void> {
		try {
			const { arch, release, type } = await this.nativeHostService.getOSProperties();
			this.osInfo = { arch, release, type };
		} catch (error) {
			// Fallback to empty strings if OS info cannot be retrieved
			this.osInfo = { type: '', arch: '', release: '' };
		}
	}

	protected override getOSInfo(): { type: string; arch: string; release: string } {
		return this.osInfo;
	}
}
