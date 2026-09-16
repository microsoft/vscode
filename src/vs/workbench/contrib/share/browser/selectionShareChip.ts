/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './selectionShareChip.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Severity } from '../../../../platform/notification/common/notification.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';

const CHIP_ID = 'editor.contrib.selectionShareChip';

/**
 * Floating selection chip that appears near a non-empty editor selection
 * and offers a one-click "Share as Private Gist" prototype affordance.
 */
class SelectionShareChipWidget extends Disposable implements IContentWidget {

	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = true;

	private readonly _domNode: HTMLElement;
	private _position: IContentWidgetPosition | null = null;
	private _visible = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _onShare: () => void,
	) {
		super();

		this._domNode = dom.$('div.selection-share-chip');
		this._domNode.setAttribute('role', 'button');
		this._domNode.setAttribute('tabindex', '0');
		this._domNode.setAttribute('aria-label', localize('selectionShareChip.aria', "Share selection as private gist"));

		const icon = dom.$('span.selection-share-chip-icon');
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gistSecret));
		const label = dom.$('span.selection-share-chip-label');
		label.textContent = localize('selectionShareChip.label', "Share");
		this._domNode.appendChild(icon);
		this._domNode.appendChild(label);

		this._register(dom.addDisposableListener(this._domNode, dom.EventType.MOUSE_DOWN, e => {
			// Keep editor selection; avoid focus steal side effects.
			e.preventDefault();
			e.stopPropagation();
		}));
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.CLICK, e => {
			e.preventDefault();
			e.stopPropagation();
			this._onShare();
		}));
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this._onShare();
			}
		}));
	}

	getId(): string {
		return CHIP_ID + '.widget';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._position;
	}

	show(selection: Selection): void {
		const end = selection.getEndPosition();
		this._position = {
			position: end,
			preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
		};

		const lineCount = Math.max(1, selection.endLineNumber - selection.startLineNumber + 1);
		this._domNode.title = localize(
			'selectionShareChip.title',
			"Share {0} selected line(s) as a private gist",
			lineCount
		);

		if (!this._visible) {
			this._editor.addContentWidget(this);
			this._visible = true;
		} else {
			this._editor.layoutContentWidget(this);
		}
		this._domNode.classList.add('visible');
	}

	hide(): void {
		if (!this._visible) {
			return;
		}
		this._domNode.classList.remove('visible');
		this._editor.removeContentWidget(this);
		this._visible = false;
		this._position = null;
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}

export class SelectionShareChipController extends Disposable implements IEditorContribution {

	static readonly ID = CHIP_ID;

	private readonly _widget: SelectionShareChipWidget;
	private readonly _update: RunOnceScheduler;

	constructor(
		private readonly _editor: ICodeEditor,
		@IDialogService private readonly _dialogService: IDialogService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		this._widget = this._register(new SelectionShareChipWidget(this._editor, () => this._shareSelection()));
		this._update = this._register(new RunOnceScheduler(() => this._render(), 120));

		this._register(this._editor.onDidChangeCursorSelection(() => this._update.schedule()));
		this._register(this._editor.onDidChangeModel(() => this._update.schedule()));
		this._register(this._editor.onDidBlurEditorText(() => {
			// Keep chip while focus moves into the chip itself; hide on real blur shortly after.
			this._update.schedule();
		}));
		this._register(this._editor.onDidFocusEditorText(() => this._update.schedule()));
		this._register(this._editor.onDidScrollChange(() => {
			if (this._shouldShow()) {
				this._widget.show(this._editor.getSelection()!);
			}
		}));

		this._update.schedule();
	}

	private _shouldShow(): boolean {
		if (!this._editor.hasModel()) {
			return false;
		}
		const selection = this._editor.getSelection();
		if (!selection || selection.isEmpty()) {
			return false;
		}
		// Require a meaningful selection (not a single caret-width click).
		const model = this._editor.getModel();
		if (!model) {
			return false;
		}
		const text = model.getValueInRange(selection);
		if (!text || text.trim().length === 0) {
			return false;
		}
		// Prefer multi-character blocks; still allow single-line multi-char selection.
		return text.length >= 2;
	}

	private _render(): void {
		if (this._shouldShow()) {
			this._widget.show(this._editor.getSelection()!);
		} else {
			this._widget.hide();
		}
	}

	private async _shareSelection(): Promise<void> {
		const model = this._editor.getModel();
		const selection = this._editor.getSelection();
		if (!model || !selection || selection.isEmpty()) {
			return;
		}

		// Prefer the shared command when registered (Share menu prototype), else local dialog.
		try {
			await this._commandService.executeCommand('workbench.action.shareAsPrivateGist');
			return;
		} catch {
			// fall through to local prototype dialog
		}

		const selectedText = model.getValueInRange(selection);
		const lineCount = selection.endLineNumber - selection.startLineNumber + 1;
		const fileLabel = model.uri.path.split('/').pop() || model.uri.path || 'selection';
		const previewLimit = 280;
		const preview = selectedText.length > previewLimit
			? `${selectedText.slice(0, previewLimit)}\n…`
			: selectedText;
		const markdown = new MarkdownString(undefined, { supportThemeIcons: false });
		markdown.appendCodeblock('', preview);

		const result = await this._dialogService.prompt({
			type: Severity.Info,
			message: localize('selectionShareChip.dialogTitle', "Share as Private Gist"),
			detail: localize(
				'selectionShareChip.dialogDetail',
				"Prototype selection chip — no gist will be created. {0} line(s) from '{1}' are ready to share privately.",
				lineCount,
				fileLabel
			),
			custom: {
				icon: Codicon.gistSecret,
				markdownDetails: [{
					markdown,
					classes: ['share-dialog-input-text', 'share-private-gist-preview']
				}]
			},
			cancelButton: localize('selectionShareChip.cancel', "Cancel"),
			buttons: [
				{
					label: localize('selectionShareChip.confirm', "Share Private Gist"),
					run: () => 'shared' as const
				},
				{
					label: localize('selectionShareChip.copy', "Copy Selection"),
					run: async () => {
						await this._clipboardService.writeText(selectedText);
						return 'copied' as const;
					}
				}
			]
		});

		if (result.result === 'shared') {
			await this._dialogService.info(
				localize('selectionShareChip.doneTitle', "Private Gist Ready"),
				localize(
					'selectionShareChip.done',
					"Selection chip prototype complete. Selected text from '{0}' would be shared as a private gist ({1} characters).",
					fileLabel,
					selectedText.length
				)
			);
		} else if (result.result === 'copied') {
			await this._dialogService.info(
				localize('selectionShareChip.copiedTitle', "Selection Copied"),
				localize('selectionShareChip.copied', "Copied the selected text to the clipboard.")
			);
		}
	}
}

registerEditorContribution(SelectionShareChipController.ID, SelectionShareChipController, EditorContributionInstantiation.AfterFirstRender);
