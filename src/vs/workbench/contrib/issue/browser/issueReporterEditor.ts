/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IssueReporterEditorInput } from './issueReporterEditorInput.js';
import { BrowserIssueReporterControl } from './issueReporterControl.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';

export class IssueReporterEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.issueReporter';

	protected issueReporterControl: BrowserIssueReporterControl | undefined = undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService
	) {
		super(IssueReporterEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		console.log('IssueReporterEditor.createEditor called', { parent, hasParent: !!parent });
		const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';
		parent.classList.add('issue-reporter-body', 'monaco-workbench', platformClass);

		// Get issue reporter data from the input
		const input = this.input as IssueReporterEditorInput | undefined;
		console.log('IssueReporterEditor.createEditor input check', { input, hasData: !!input?.issueReporterData });
		if (input?.issueReporterData) {
			console.log('IssueReporterEditor.createEditor creating control');
			this.issueReporterControl = this._register(this.instantiationService.createInstance(
				BrowserIssueReporterControl,
				parent,
				input.issueReporterData
			));
			console.log('IssueReporterEditor.createEditor control created', { control: this.issueReporterControl });
		} else {
			console.log('IssueReporterEditor.createEditor no data available - will create control later in setInput');
		}
	}

	override async setInput(input: IssueReporterEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		console.log('IssueReporterEditor.setInput called', { input, hasData: !!input.issueReporterData, hasControl: !!this.issueReporterControl });
		await super.setInput(input, options, context, token);

		// If editor is already created and we have new data, update the issue reporter
		if (this.issueReporterControl && input.issueReporterData) {
			console.log('IssueReporterEditor.setInput updating control data');
			this.issueReporterControl.updateData(input.issueReporterData);
		} else if (!this.issueReporterControl && input.issueReporterData) {
			console.log('IssueReporterEditor.setInput creating control for the first time');
			// Create the control if it wasn't created in createEditor (due to timing)
			const parent = this.getContainer();
			if (parent) {
				this.issueReporterControl = this._register(this.instantiationService.createInstance(
					BrowserIssueReporterControl,
					parent,
					input.issueReporterData
				));
				console.log('IssueReporterEditor.setInput control created in setInput', { control: this.issueReporterControl });
			}
		}
	}

	override focus(): void {
		this.issueReporterControl?.focus();
	}

	override layout(dimension: Dimension): void {
		this.issueReporterControl?.layout(dimension);
	}
}
