/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { EditorInput, IEditorCloseHandler } from '../../../common/editor/editorInput.js';
import { EditorInputCapabilities, GroupIdentifier } from '../../../common/editor.js';
import { ConfirmResult, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IssueReporterAttachment, IssueReporterData } from '../common/issue.js';
import { IIssueReporterDiagnosticsState, IScreenshot } from './issueReporterOverlay.js';
import { ICodeEditorViewState } from '../../../../editor/common/editorCommon.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

const issueReporterIcon = registerIcon('issue-reporter', Codicon.report, localize('issueReporterIcon', "Icon for the issue reporter editor."));

export class IssueReporterEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.issueReporter';
	static readonly RESOURCE = URI.from({ scheme: 'vscode-issue-reporter', path: 'reporter' });

	readonly data: IssueReporterData | undefined;
	private _descriptionModel: ITextModel | undefined;
	descriptionViewState: ICodeEditorViewState | null = null;
	readonly diagnosticsState: IIssueReporterDiagnosticsState = { included: {}, expanded: new Set() };

	get descriptionModel(): ITextModel {
		if (!this._descriptionModel) {
			const model = this._register(this.modelService.createModel(this.data?.issueBody ?? '', this.languageService.createById('markdown')));
			this._register(model.onDidChangeContent(() => {
				if (this.data) {
					this.data.issueBody = model.getValue();
				}
			}));
			this._descriptionModel = model;
		}
		return this._descriptionModel;
	}

	/** Set by the editor pane to check if user has entered data */
	hasUserInputFn: (() => boolean) | undefined;
	hasPendingOperationsFn: (() => boolean) | undefined;

	/** Attachments survive moves between editor parts with their input. */
	private attachments: readonly IssueReporterAttachment<IScreenshot>[] | undefined;
	private readonly importedFiles = this._register(new DisposableMap<string>());

	get savedAttachments(): readonly IssueReporterAttachment<IScreenshot>[] | undefined {
		return this.attachments;
	}

	set savedAttachments(attachments: readonly IssueReporterAttachment<IScreenshot>[] | undefined) {
		this.attachments = attachments;
		const paths = new Set(attachments?.flatMap(attachment => attachment.kind === 'file' ? [attachment.file.filePath] : []));
		for (const path of this.importedFiles.keys()) {
			if (!paths.has(path)) {
				this.importedFiles.deleteAndDispose(path);
			}
		}
	}

	/** Keep reporter-owned copies alive across pane moves, until removal or input disposal. */
	registerImportedFile(filePath: string, cleanup: IDisposable): void {
		if (this.isDisposed() || !this.attachments?.some(attachment => attachment.kind === 'file' && attachment.file.filePath === filePath)) {
			cleanup.dispose();
			return;
		}
		this.importedFiles.set(filePath, cleanup);
	}

	override readonly closeHandler: IEditorCloseHandler;

	constructor(
		data: IssueReporterData | undefined,
		@IDialogService private readonly dialogService: IDialogService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
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

	override canMove(sourceGroup: GroupIdentifier, targetGroup: GroupIdentifier): true | string {
		return sourceGroup !== targetGroup && this.hasPendingOperationsFn?.()
			? localize('waitBeforeMovingReporter', "Wait for attachments and captures to finish before moving the issue reporter.")
			: true;
	}
}
