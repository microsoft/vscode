/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IChatAttachmentResolveService } from '../../chat/browser/attachments/chatAttachmentResolveService.js';
import { IChatRequestVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { loadScreenshotImage, ScreenshotAnnotationEditor } from './screenshotAnnotation.js';
import { IScreenshotService } from './screenshotService.js';
import { IScreenshot } from './issueReporterOverlay.js';

export const IIssueWizardIntakeService = createDecorator<IIssueWizardIntakeService>('issueWizardIntakeService');
export const IIssueWizardScreenshotAnnotationService = createDecorator<IIssueWizardScreenshotAnnotationService>('issueWizardScreenshotAnnotationService');

/**
 * Captures an optional highlighted screenshot and resolves it as chat context.
 */
export interface IIssueWizardIntakeService {
	readonly _serviceBrand: undefined;
	collectScreenshot(): Promise<readonly IChatRequestVariableEntry[] | undefined>;
}

/**
 * Opens the shared screenshot annotation experience for Issue Wizard.
 */
export interface IIssueWizardScreenshotAnnotationService {
	readonly _serviceBrand: undefined;
	annotate(dataUrl: string): Promise<IScreenshot | undefined>;
}

/**
 * Reuses the Issue Reporter screenshot annotation editor.
 */
export class IssueWizardScreenshotAnnotationService implements IIssueWizardScreenshotAnnotationService {
	readonly _serviceBrand: undefined;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) { }

	async annotate(dataUrl: string): Promise<IScreenshot | undefined> {
		const image = await loadScreenshotImage(dataUrl);
		if (!image) {
			return undefined;
		}
		const screenshot: IScreenshot = {
			dataUrl,
			width: image.naturalWidth,
			height: image.naturalHeight,
		};
		return new Promise(resolve => {
			const disposables = new DisposableStore();
			const editor = new ScreenshotAnnotationEditor(screenshot, this.layoutService.activeContainer, screenshot.annotationState);

			disposables.add(editor);
			disposables.add(editor.onDidCancel(() => {
				disposables.dispose();
				resolve(undefined);
			}));
			disposables.add(editor.onDidSave(({ dataUrl, state }) => {
				screenshot.annotatedDataUrl = dataUrl;
				screenshot.annotationState = state;
				disposables.dispose();
				resolve(screenshot);
			}));
		});
	}
}

/**
 * Captures, annotates, and converts a screenshot into standard chat context.
 */
export class IssueWizardIntakeService implements IIssueWizardIntakeService {
	readonly _serviceBrand: undefined;

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@IScreenshotService private readonly screenshotService: IScreenshotService,
		@IIssueWizardScreenshotAnnotationService private readonly annotationService: IIssueWizardScreenshotAnnotationService,
		@IChatAttachmentResolveService private readonly chatAttachmentResolveService: IChatAttachmentResolveService,
	) { }

	async collectScreenshot(): Promise<readonly IChatRequestVariableEntry[] | undefined> {
		const screenshotDataUrl = await this.screenshotService.captureScreenshot();
		if (!screenshotDataUrl) {
			await this.dialogService.info(
				localize('issueWizardScreenshotUnavailable.message', "Screenshot capture is not available in this window."),
				localize('issueWizardScreenshotUnavailable.detail', "Issue Wizard will continue without a screenshot. You can still describe the problem in chat."),
			);
			return undefined;
		}

		const annotatedScreenshot = await this.annotationService.annotate(screenshotDataUrl);
		if (!annotatedScreenshot) {
			return undefined;
		}

		const dataUrl = annotatedScreenshot.annotatedDataUrl ?? annotatedScreenshot.dataUrl;
		const mimeMatch = /^data:([^;,]+);base64,/.exec(dataUrl);
		if (!mimeMatch) {
			return undefined;
		}

		return this.chatAttachmentResolveService.resolveImageAttachContext([{
			name: localize('issueWizardScreenshot.name', "Issue screenshot"),
			data: decodeBase64(dataUrl.substring(dataUrl.indexOf(',') + 1)).buffer,
			mimeType: mimeMatch[1],
		}]);
	}
}
