/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

export class BonianAgentController extends Disposable {
	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IRequestService private readonly requestService: IRequestService
	) {
		super();
	}

	public async processImage(imageUri: URI, onProgress: (stage: number, status: string) => void): Promise<void> {
		try {
			// Stage 1: Start Loading
			onProgress(1, 'loading');

			// Read and Convert File to Base64
			const fileStats = await this.fileService.readFile(imageUri);
			const base64Str = encodeBase64(fileStats.value);
			const ext = imageUri.path.split('.').pop()?.toLowerCase();
			const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : (ext === 'svg' ? 'image/svg+xml' : 'image/png');

			const payload = {
				imageBase64: base64Str,
				imageMimeType: mimeType,
				diagramType: 'class',
				provider: 'gemini',
				model: 'gemini-2.5-flash',
				targetLanguage: 'typescript'
			};

			// REST API Call using VS Code's IRequestService
			const requestContext = await this.requestService.request({
				type: 'POST',
				url: 'http://144.91.70.138:8000/vision-to-code',
				headers: { 'Content-Type': 'application/json' },
				data: JSON.stringify(payload)
			}, CancellationToken.None);

			if (requestContext.res.statusCode && requestContext.res.statusCode >= 400) {
				throw new Error(`API returned status: ${requestContext.res.statusCode}`);
			}

			const data = await asJson<any>(requestContext);

			if (!data) {
				throw new Error('API returned empty response');
			}

			onProgress(1, 'success');

			// Stages 2, 3, 4 Validation
			if (data.plantUML && data.generatedProject) {
				onProgress(2, 'loading');
				await new Promise(r => setTimeout(r, 400));
				onProgress(2, 'success');

				onProgress(3, 'loading');
				await new Promise(r => setTimeout(r, 400));
				onProgress(3, 'success');

				onProgress(4, 'loading');
				await new Promise(r => setTimeout(r, 400));
				onProgress(4, 'success');
			} else {
				throw new Error('Invalid API Response: Missing plantUML or generatedProject');
			}

			// Stage 5: Write to Workspace
			onProgress(5, 'loading');

			const workspace = this.workspaceContextService.getWorkspace();
			let targetRoot: URI;

			if (workspace.folders.length > 0) {
				// Create 'bonian-generated' directory at the root of the active workspace
				targetRoot = URI.joinPath(workspace.folders[0].uri, 'bonian-generated');
			} else {
				// Fallback to sibling of the image if no workspace is active
				targetRoot = URI.joinPath(imageUri, '..', 'bonian-generated');
			}

			const generatedProject = data.generatedProject;
			const generatedFiles = generatedProject?.files || [];

			for (const fileObj of generatedFiles) {
				const relativePath = fileObj.path || fileObj.name || fileObj.filename;
				const fileContent = fileObj.content || fileObj.code;

				if (!relativePath || fileContent === undefined) {
					continue;
				}

				const fileUri = URI.joinPath(targetRoot, relativePath);
				// IFileService.writeFile automatically creates intermediate directories
				await this.fileService.writeFile(fileUri, VSBuffer.fromString(fileContent));
			}

			onProgress(5, 'success');
			this.notificationService.info('Bonian Agent: Project generated successfully!');

		} catch (error: any) {
			console.error('[BonianAgentController]', error);
			this.notificationService.notify({
				severity: Severity.Error,
				message: 'Bonian Agent Pipeline Failed: ' + error.message
			});
		}
	}
}
