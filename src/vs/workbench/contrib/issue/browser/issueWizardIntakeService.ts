/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IChatAttachmentResolveService } from '../../chat/browser/attachments/chatAttachmentResolveService.js';
import { IChatRequestVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { ScreenshotAnnotationEditor } from './screenshotAnnotation.js';
import { IScreenshotService } from './screenshotService.js';
import { IScreenshot } from './issueReporterOverlay.js';

export const IIssueWizardIntakeService = createDecorator<IIssueWizardIntakeService>('issueWizardIntakeService');

export interface IIssueWizardLaunchOptions {
	readonly symptom?: string;
	readonly includeScreenshot?: boolean;
	readonly promptForIntake?: boolean;
}

export interface IIssueWizardIntakeResult {
	readonly symptom?: string;
	readonly attachedContext?: IChatRequestVariableEntry[];
}

interface IIssueWizardScreenshotData {
	readonly dataUrl: string;
	readonly mimeType: string;
}

export interface IIssueWizardIntakeService {
	readonly _serviceBrand: undefined;
	collect(options?: IIssueWizardLaunchOptions): Promise<IIssueWizardIntakeResult>;
}

export class IssueWizardIntakeService implements IIssueWizardIntakeService {
	readonly _serviceBrand: undefined;

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@IScreenshotService private readonly screenshotService: IScreenshotService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IChatAttachmentResolveService private readonly chatAttachmentResolveService: IChatAttachmentResolveService,
	) { }

	async collect(options?: IIssueWizardLaunchOptions): Promise<IIssueWizardIntakeResult> {
		let symptom = options?.symptom?.trim();
		let shouldCaptureScreenshot = options?.includeScreenshot === true;

		if (!symptom && !shouldCaptureScreenshot && options?.promptForIntake !== false) {
			const intakeChoice = await this.dialogService.prompt<'describe' | 'screenshot' | 'skip'>({
				type: 'question',
				title: localize('issueWizardIntake.title', "Issue Wizard"),
				message: localize('issueWizardIntake.message', "How should Issue Wizard start?"),
				detail: localize('issueWizardIntake.detail', "Describe the problem in text, add a highlighted screenshot, or start without details."),
				buttons: [
					{
						label: localize('issueWizardIntake.describe', "Describe Problem"),
						run: () => 'describe',
					},
					{
						label: localize('issueWizardIntake.screenshot', "Add Screenshot"),
						run: () => 'screenshot',
					},
				],
				cancelButton: {
					label: localize('issueWizardIntake.skip', "Start Without Details"),
					run: () => 'skip',
				},
			});

			if (intakeChoice.result === 'describe') {
				const input = await this.dialogService.input({
					type: 'question',
					title: localize('issueWizardSymptomInput.title', "Issue Wizard"),
					message: localize('issueWizardSymptomInput.message', "What is going wrong?"),
					detail: localize('issueWizardSymptomInput.detail', "Describe the bug briefly. You can add more details in chat."),
					inputs: [{ placeholder: localize('issueWizardSymptomInput.placeholder', "For example: Saving stalls for 10 seconds") }],
					primaryButton: localize('issueWizardSymptomInput.continue', "Continue"),
					cancelButton: localize('cancel', "Cancel"),
				});

				if (input.confirmed) {
					symptom = input.values?.[0]?.trim() || undefined;
				}
			} else if (intakeChoice.result === 'screenshot') {
				shouldCaptureScreenshot = true;
			}
		}

		let attachedContext: IChatRequestVariableEntry[] | undefined;
		if (shouldCaptureScreenshot) {
			const screenshotData = await this.captureAnnotatedScreenshot();
			if (screenshotData) {
				const attachments = await this.chatAttachmentResolveService.resolveImageAttachContext([{
					name: localize('issueWizardScreenshot.name', "Issue screenshot"),
					data: decodeBase64(screenshotData.dataUrl.substring(screenshotData.dataUrl.indexOf(',') + 1)).buffer,
					mimeType: screenshotData.mimeType,
				}]);
				if (attachments.length > 0) {
					attachedContext = attachments;
				}
			}
		}

		return { symptom, attachedContext };
	}

	private async captureAnnotatedScreenshot(): Promise<IIssueWizardScreenshotData | undefined> {
		const screenshotDataUrl = await this.screenshotService.captureScreenshot();
		if (!screenshotDataUrl) {
			await this.dialogService.info(
				localize('issueWizardScreenshotUnavailable.message', "Screenshot capture is not available in this window."),
				localize('issueWizardScreenshotUnavailable.detail', "Issue Wizard will continue without a screenshot. You can still describe the problem in chat."),
			);
			return undefined;
		}

		const image = await this.loadImage(screenshotDataUrl);
		if (!image) {
			return undefined;
		}

		const screenshot: IScreenshot = {
			dataUrl: screenshotDataUrl,
			width: image.naturalWidth,
			height: image.naturalHeight,
		};

		const annotatedScreenshot = await this.openScreenshotAnnotationEditor(screenshot);
		if (!annotatedScreenshot) {
			return undefined;
		}

		const dataUrl = annotatedScreenshot.annotatedDataUrl ?? annotatedScreenshot.dataUrl;
		const mimeMatch = /^data:([^;,]+);base64,/.exec(dataUrl);
		if (!mimeMatch) {
			return undefined;
		}

		return {
			dataUrl,
			mimeType: mimeMatch[1],
		};
	}

	private async loadImage(dataUrl: string): Promise<HTMLImageElement | undefined> {
		return new Promise(resolve => {
			const image = mainWindow.document.createElement('img');
			image.onload = () => resolve(image);
			image.onerror = () => resolve(undefined);
			image.src = dataUrl;
		});
	}

	private async openScreenshotAnnotationEditor(screenshot: IScreenshot): Promise<IScreenshot | undefined> {
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
