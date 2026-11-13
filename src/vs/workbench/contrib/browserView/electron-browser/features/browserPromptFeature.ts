/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { Severity } from '../../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IBrowserViewPromptRequestEvent } from '../../../../../platform/browserView/common/browserView.js';
import { BrowserEditor, BrowserEditorContribution } from '../browserEditor.js';
import { displayOrigin } from './browserPermissionsFeature.js';

/**
 * Shows a dialog for `window.prompt()` calls made by the page. The page is blocked
 * until the answer is sent back through {@link IBrowserViewModel.respondToPrompt}.
 */
export class BrowserPromptFeature extends BrowserEditorContribution {

	constructor(
		editor: BrowserEditor,
		@IDialogService private readonly _dialogService: IDialogService,
	) {
		super(editor);
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		store.add(model.onDidRequestPrompt(request => void this._showPrompt(model, request, store)));
	}

	private async _showPrompt(model: IBrowserViewModel, request: IBrowserViewPromptRequestEvent, attachment: DisposableStore): Promise<void> {
		const cts = new CancellationTokenSource();
		const cleanup = new DisposableStore();
		cleanup.add(cts);
		// Close the dialog when the model is disposed or detached from the editor.
		const attachmentListener = attachment.add(toDisposable(() => cts.cancel()));
		cleanup.add(toDisposable(() => attachment.deleteAndLeak(attachmentListener)));
		cleanup.add(model.onDidSettlePrompt(requestId => {
			if (requestId === request.requestId) {
				cts.cancel();
				cleanup.dispose();
			}
		}));
		let value: string | null | undefined;
		try {
			const result = await this._dialogService.input({
				type: Severity.Info,
				message: localize('browser.prompt.title', "{0} says", displayOrigin(request.origin)),
				detail: request.message,
				inputs: [{ type: 'text', value: request.defaultValue }],
				token: cts.token,
			});
			value = result.confirmed ? (result.values?.[0] ?? '') : null;
		} catch {
			// The dialog can't be shown (for example in integration tests). Leave the prompt
			// pending so an attached agent can still answer it; navigating away settles it.
		} finally {
			cleanup.dispose();
			if (value !== undefined && !cts.token.isCancellationRequested) {
				model.respondToPrompt(request.requestId, value).catch(() => { });
			}
		}
	}
}

BrowserEditor.registerContribution(BrowserPromptFeature);
