/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'vs/base/common/path';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';

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

		this._register(this._editor.onDidChangeModel((e) => {
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
					"{0}: tokenization, wrapping and folding have been turned off for this large file in order to reduce memory usage and avoid freezing or crashing.",
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
		}));
	}
}

registerEditorContribution(LargeFileOptimizationsWarner.ID, LargeFileOptimizationsWarner);
