/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { CommonFindController } from '../../../../../editor/contrib/find/browser/findController.js';
import { ITracingService } from '../../../../../workbench/services/tracing/common/tracing.js';

/**
 * This contribution extends the FindController to trace replace operations
 */
class ReplaceEventTracingContribution extends Disposable implements IEditorContribution {
	public static readonly ID = 'editor.contrib.replaceEventTracing';

	private readonly originalReplace!: () => boolean;
	private readonly originalReplaceAll!: () => boolean;

	constructor(
		private readonly editor: ICodeEditor,
		@ITracingService private readonly tracingService: ITracingService
	) {
		super();

		// Get the FindController instance
		const findController = CommonFindController.get(this.editor);
		if (!findController) {
			return;
		}

		// Store original methods and override them
		this.originalReplace = findController.replace.bind(findController);
		this.originalReplaceAll = findController.replaceAll.bind(findController);

		// Override the replace method to add tracing
		findController.replace = () => {
			const selection = this.editor.getSelection();
			const fileName = this.editor.getModel()?.uri.toString() || 'unknown';

			// Log the replace event before performing the operation
			this.tracingService.recordTrace({
				action_id: 'replace',
				timestamp: new Date().toISOString(),
				event: {
					file: fileName,
					selection: selection ? {
						startLineNumber: selection.startLineNumber,
						startColumn: selection.startColumn,
						endLineNumber: selection.endLineNumber,
						endColumn: selection.endColumn
					} : undefined,
					searchString: findController.getState().searchString,
					replaceString: findController.getState().replaceString,
					matchCase: findController.getState().matchCase,
					wholeWord: findController.getState().wholeWord,
					isRegex: findController.getState().isRegex
				}
			});

			// Call the original method
			return this.originalReplace();
		};

		// Override the replaceAll method to add tracing
		findController.replaceAll = () => {
			const fileName = this.editor.getModel()?.uri.toString() || 'unknown';

			// Log the replaceAll event before performing the operation
			this.tracingService.recordTrace({
				action_id: 'replaceAll',
				timestamp: new Date().toISOString(),
				event: {
					file: fileName,
					searchString: findController.getState().searchString,
					replaceString: findController.getState().replaceString,
					matchCase: findController.getState().matchCase,
					wholeWord: findController.getState().wholeWord,
					isRegex: findController.getState().isRegex,
					matchCount: findController.getState().matchesCount
				}
			});

			// Call the original method
			return this.originalReplaceAll();
		};
	}

	override dispose(): void {
		// Restore original methods when the contribution is disposed
		const findController = CommonFindController.get(this.editor);
		if (findController) {
			findController.replace = this.originalReplace;
			findController.replaceAll = this.originalReplaceAll;
		}
		super.dispose();
	}
}

// Register the contribution
registerEditorContribution(ReplaceEventTracingContribution.ID, ReplaceEventTracingContribution, EditorContributionInstantiation.Eager);
