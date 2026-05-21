/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { EditorInput, IEditorCloseHandler } from '../../../common/editor/editorInput.js';
import { EditorInputCapabilities } from '../../../common/editor.js';
import { ConfirmResult, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IssueReporterData } from '../common/issue.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

const issueReporterIcon = registerIcon('issue-reporter', Codicon.report, localize('issueReporterIcon', "Icon for the issue reporter editor."));

export class IssueReporterEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.issueReporter';
	static readonly RESOURCE = URI.from({ scheme: 'vscode-issue-reporter', path: 'reporter' });

	readonly data: IssueReporterData | undefined;

	/** Set by the editor pane to check if user has entered data */
	hasUserInputFn: (() => boolean) | undefined;

	override readonly closeHandler: IEditorCloseHandler;

	constructor(
		data: IssueReporterData | undefined,
		@IDialogService private readonly dialogService: IDialogService,
	) {
		super();
		this.data = data;

		this.closeHandler = {
			showConfirm: () => !!this.hasUserInputFn?.(),
			confirm: async () => {
				const { confirmed } = await this.dialogService.confirm({
					message: localize('discardIssue', "Discard issue report?"),
					detail: localize('discardIssueDetail', "Your issue report has unsaved changes that will be lost."),
					primaryButton: localize('discard', "Discard"),
					type: 'warning',
				});
				return confirmed ? ConfirmResult.DONT_SAVE : ConfirmResult.CANCEL;
			},
		};
	}

	override get typeId(): string {
		return IssueReporterEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override get resource(): URI | undefined {
		return IssueReporterEditorInput.RESOURCE;
	}

	override getName(): string {
		return localize('issueReporterEditorInputName', "Report Issue");
	}

	override getIcon(): ThemeIcon | undefined {
		return issueReporterIcon;
	}

	override matches(other: EditorInput | unknown): boolean {
		return other instanceof IssueReporterEditorInput;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Singleton | EditorInputCapabilities.Readonly;
	}
}
