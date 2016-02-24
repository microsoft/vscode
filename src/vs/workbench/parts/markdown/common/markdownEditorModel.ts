/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {IFrameEditorModel} from 'vs/workbench/common/editor/iframeEditorModel';
import {EditorModel} from 'vs/workbench/common/editor';
import {Preferences} from 'vs/workbench/common/constants';
import {IModel} from 'vs/editor/common/editorCommon';
import {IEmitOutput} from 'vs/editor/common/modes';
import themes = require('vs/platform/theme/common/themes');
import {DEFAULT_THEME_ID} from 'vs/workbench/services/themes/common/themeService';
import {MARKDOWN_MIME, MARKDOWN_MODE_ID} from 'vs/workbench/parts/markdown/common/markdown';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

interface IMarkdownWorkerOutput extends IEmitOutput {
	head: string;
	body: string;
	tail: string;
}

/**
 * The editor model for markdown inputs. Using a library to convert markdown text into HTML from a resource with the provided path.
 */
export class MarkdownEditorModel extends IFrameEditorModel {

	constructor(
		resource: URI,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IStorageService private storageService: IStorageService
	) {
		super(resource);
	}

	public load(): TPromise<EditorModel> {
		let isCanceled = false;
		let codeEditorModel: IModel;

		// Create a new promise here to be able to return this model even in case of an error
		return new TPromise<EditorModel>((c, e) => {

			// On Error: Show error to user as rendered HTML
			let onError = (error: Error) => {
				try {
					let theme = this.storageService.get(Preferences.THEME, StorageScope.GLOBAL, DEFAULT_THEME_ID);
					let usesLightTheme = themes.isLightTheme(theme);

					let markdownError = nls.localize('markdownError', "Unable to open '{0}' for Markdown rendering. Please make sure the file exists and that it is a valid Markdown file.", paths.basename(this.resource.fsPath));
					this.setContents('<html><head><style type="text/css">body {color: ' + (usesLightTheme ? 'black' : 'white') + '; font-family: "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", sans-serif, "Droid Sans Fallback"; font-size: 13px; margin: 0; line-height: 1.4em; padding-left: 20px;}</style></head><body>', markdownError, '</body></html>');
					c(this);
				} catch (error) {
					e(error); // be very careful that this promise always completes
				}
			};

			// On Success: Show output as rendered HTML
			let onSuccess = (model: IModel) => {
				try {
					let mode = model.getMode();
					let absoluteWorkerResourcesPath = require.toUrl('vs/languages/markdown/common'); // TODO@Ben technical debt: worker cannot resolve path absolute
					if (mode && !!mode.emitOutputSupport && mode.getId() === MARKDOWN_MODE_ID) {
						(<any>mode).emitOutputSupport.getEmitOutput(this.resource, absoluteWorkerResourcesPath).then((output: IMarkdownWorkerOutput) => {
							this.setContents(output.head, output.body, output.tail);

							c(this);
						}, onError);
					} else {
						onError(null); // mode does not support output
					}
				} catch (error) {
					onError(error); // be very careful that this promise always completes
				}
			};

			// Resolve the text editor model using editor service to benefit from the local editor model cache
			this.editorService.resolveEditorModel({
				resource: this.resource,
				mime: MARKDOWN_MIME
			}).then((model) => {
				if (isCanceled) {
					return;
				}

				codeEditorModel = <IModel>model.textEditorModel;

				return codeEditorModel.whenModeIsReady();
			}).then(() => {
				if (isCanceled) {
					return;
				}

				onSuccess(codeEditorModel);
			}, onError);
		}, () => {
			isCanceled = true;
		});
	}
}