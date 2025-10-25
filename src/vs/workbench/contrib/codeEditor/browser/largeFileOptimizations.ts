/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import * as path from '../../../../base/common/path.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';

/**
 * Shows a message when opening a large file which has been memory optimized (and features disabled).
 */
export class LargeFileOptimizationsWarner extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.largeFileOptimizationsWarner';

	constructor(
		private readonly _editor: ICodeEditor,
		@INotificationService private readonly _notificationService: INotificationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._register(this._editor.onDidChangeModel((e) => this._update()));
		this._update();
	}

	private _update(): void {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		if (model.isTooLargeForTokenization()) {
			const message = nls.localize(
				{
					key: 'largeFile',
					comment: [
						'Variable 0 will be a file name.'
					]
				},
				"{0}: tokenization, wrapping, folding, codelens, word highlighting and sticky scroll have been turned off for this large file in order to reduce memory usage and avoid freezing or crashing.",
				path.basename(model.uri.path)
			);

			this._notificationService.prompt(Severity.Info, message, [
				{
					label: nls.localize('removeOptimizations', "Forcefully Enable Features"),
					run: () => {
						this._configurationService.updateValue(`editor.largeFileOptimizations`, false).then(() => {
							this._notificationService.info(nls.localize('reopenFilePrompt', "Please reopen file in order for this setting to take effect."));
						}, (err) => {
							this._notificationService.error(err);
						});
					}
				}
			], { neverShowAgain: { id: 'editor.contrib.largeFileOptimizationsWarner' } });
		}
	}
}

registerEditorContribution(LargeFileOptimizationsWarner.ID, LargeFileOptimizationsWarner, EditorContributionInstantiation.AfterFirstRender);
