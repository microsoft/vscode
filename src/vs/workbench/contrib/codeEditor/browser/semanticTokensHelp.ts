/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'vs/base/common/path';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

/**
 * Shows a message when semantic tokens are shown the first time.
 */
export class SemanticTokensHelp extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.semanticHighlightHelp';

	constructor(
		_editor: ICodeEditor,
		@INotificationService _notificationService: INotificationService,
		@IOpenerService _openerService: IOpenerService,
		@IWorkbenchThemeService _themeService: IWorkbenchThemeService,
		@IEditorService _editorService: IEditorService,
		@IStorageService _storageService: IStorageService,
		@IStorageKeysSyncRegistryService storageKeysSyncRegistryService: IStorageKeysSyncRegistryService
	) {
		super();
		// opt-in to syncing
		const neverShowAgainId = 'editor.contrib.semanticTokensHelp';

		if (_storageService.getBoolean(neverShowAgainId, StorageScope.GLOBAL)) {
			return;
		}

		storageKeysSyncRegistryService.registerStorageKey({ key: neverShowAgainId, version: 1 });

		const toDispose = this._register(new DisposableStore());
		const localToDispose = toDispose.add(new DisposableStore());
		const installChangeTokenListener = (model: ITextModel) => {
			localToDispose.add(model.onDidChangeTokens((e) => {
				if (!e.semanticTokensApplied) {
					return;
				}
				if (_storageService.getBoolean(neverShowAgainId, StorageScope.GLOBAL)) {
					toDispose.dispose();
					return;
				}
				const activeEditorControl = _editorService.activeTextEditorControl;
				if (!isCodeEditor(activeEditorControl) || activeEditorControl.getModel() !== model) {
					return; // only show if model is in the active code editor
				}

				toDispose.dispose(); // uninstall all listeners, make sure the notification is only shown once per window
				_storageService.store(neverShowAgainId, true, StorageScope.GLOBAL); // never show again

				const message = nls.localize(
					{
						key: 'semanticTokensHelp',
						comment: [
							'Variable 0 will be a file name.',
							'Variable 1 will be a theme name.'
						]
					},
					"Code coloring of '{0}' has been updated as the theme '{1}' has [semantic highlighting](https://go.microsoft.com/fwlink/?linkid=2122588) enabled.",
					path.basename(model.uri.path), _themeService.getColorTheme().label
				);

				_notificationService.prompt(Severity.Info, message, [
					{
						label: nls.localize('learnMoreButton', "Learn More"),
						run: () => {
							const url = 'https://go.microsoft.com/fwlink/?linkid=2122588';

							_openerService.open(URI.parse(url));
						}
					}
				]);
			}));
		};


		const model = _editor.getModel();
		if (model !== null) {
			installChangeTokenListener(model);
		}

		toDispose.add(_editor.onDidChangeModel((e) => {
			localToDispose.clear();

			const model = _editor.getModel();
			if (!model) {
				return;
			}
			installChangeTokenListener(model);
		}));
	}
}

registerEditorContribution(SemanticTokensHelp.ID, SemanticTokensHelp);
