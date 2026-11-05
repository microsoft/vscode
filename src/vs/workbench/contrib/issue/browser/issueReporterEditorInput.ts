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
import { $, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { DisposableMap, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { CancellationError } from '../../../../base/common/errors.js';

const issueReporterIcon = registerIcon('issue-reporter', Codicon.report, localize('issueReporterIcon', "Icon for the issue reporter editor."));

export class IssueReporterEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.issueReporter';
	static readonly RESOURCE = URI.from({ scheme: 'vscode-issue-reporter', path: 'reporter' });

	readonly data: IssueReporterData | undefined;
	/** Both hosts reuse the draft's native text control rather than reconstructing its contents. */
	readonly descriptionInput = $<HTMLTextAreaElement>('textarea.wizard-description-input');
	private descriptionScrollTop = 0;
	readonly diagnosticsState: IIssueReporterDiagnosticsState = { included: {}, expanded: new Set() };
	private submissionController = new AbortController();
	private initialTitle: string;
	private initialDescription: string;

	get submissionSignal(): AbortSignal {
		return this.submissionController.signal;
	}

	cancelPendingSubmissions(): void {
		this.submissionController.abort(new CancellationError());
		if (!this.isDisposed()) {
			this.submissionController = new AbortController();
		}
	}

	get hasContentChanges(): boolean {
		return (this.data?.issueTitle ?? '') !== this.initialTitle || this.descriptionInput.value !== this.initialDescription;
	}

	updateDefaultContent(update: () => void): void {
		const titleUnchanged = (this.data?.issueTitle ?? '') === this.initialTitle;
		const descriptionUnchanged = this.descriptionInput.value === this.initialDescription;
		update();
		if (titleUnchanged) {
			this.initialTitle = this.data?.issueTitle ?? '';
		}
		if (descriptionUnchanged) {
			this.initialDescription = this.descriptionInput.value;
		}
	}

	attachDescriptionInput(container: HTMLElement): void {
		if (this.descriptionInput.parentElement !== container) {
			if (this.descriptionInput.isConnected) {
				this.descriptionScrollTop = this.descriptionInput.scrollTop;
			}
			container.appendChild(this.descriptionInput);
			this.descriptionInput.scrollTop = this.descriptionScrollTop;
		}
	}

	saveDescriptionScrollPosition(container: HTMLElement): void {
		if (container.contains(this.descriptionInput)) {
			this.descriptionScrollTop = this.descriptionInput.scrollTop;
		}
	}

	/** Set by the reporter controller to check whether the draft can close or move. */
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
	) {
		super();
		this.data = data;
		this.initialTitle = data?.issueTitle ?? '';
		this.initialDescription = data?.issueBody ?? '';
		this.descriptionInput.value = this.initialDescription;
		this._register(toDisposable(() => this.submissionController.abort(new CancellationError())));
		this._register(addDisposableListener(this.descriptionInput, EventType.INPUT, () => {
			if (this.data) {
				this.data.issueBody = this.descriptionInput.value;
			}
		}));
		this._register(toDisposable(() => this.descriptionInput.remove()));

		this.closeHandler = {
			showConfirm: () => this.hasUserInputFn?.() ?? (this.hasContentChanges || !!this.savedAttachments?.length),
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
