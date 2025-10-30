/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IssueReporterEditor } from '../browser/issueReporterEditor.js';
import { IssueReporterEditorInput } from '../browser/issueReporterEditorInput.js';
import { NativeIssueReporterControl } from './issueReporterControl.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';

export class NativeIssueReporterEditor extends IssueReporterEditor {

	static override readonly ID: string = 'workbench.editor.nativeIssueReporter';

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(group, telemetryService, themeService, storageService, instantiationService);
	}

	protected override createEditor(parent: HTMLElement): void {
		const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';
		parent.classList.add('issue-reporter-body', 'monaco-workbench', platformClass);

		// Get issue reporter data from the input
		const input = this.input as IssueReporterEditorInput | undefined;
		if (input?.issueReporterData) {
			this.issueReporterControl = this._register(this.instantiationService.createInstance(
				NativeIssueReporterControl,
				parent,
				input.issueReporterData
			)) as any;
		}
	}
}
