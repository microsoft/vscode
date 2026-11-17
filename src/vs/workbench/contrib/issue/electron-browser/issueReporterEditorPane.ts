/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { EditorActivation, IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IssueReporterEditorInput } from '../browser/issueReporterEditorInput.js';
import { IssueReporterController } from './issueReporterController.js';

export class IssueReporterEditorPane extends EditorPane {
	static readonly ID = 'workbench.editor.issueReporter';

	private controller: IssueReporterController | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
	) {
		super(IssueReporterEditorPane.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		const container = append(parent, $('div.issue-reporter-editor-tab'));
		this.controller = this._register(this.instantiationService.createInstance(IssueReporterController, container, {
			reveal: async () => {
				const input = this.controller?.getInput();
				if (input && !input.isDisposed()) {
					this.editorGroupsService.activateGroup(this.group);
					await this.editorService.openEditor(input, { activation: EditorActivation.ACTIVATE }, this.group);
				}
			},
			close: () => {
				const input = this.controller?.getInput();
				if (input) {
					void this.group.closeEditor(input);
				}
			},
		}));
	}

	override async setInput(input: IssueReporterEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!token.isCancellationRequested) {
			this.controller?.setInput(input);
		}
	}

	override focus(): void {
		super.focus();
		this.controller?.focus();
	}

	override layout(dimension: Dimension): void {
		this.controller?.layout(dimension);
	}
}
