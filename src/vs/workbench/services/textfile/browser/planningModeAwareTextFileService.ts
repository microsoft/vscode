/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ITextFileService, ITextFileSaveOptions, ITextFileContent, ITextFileStreamContent, IReadTextFileOptions, IWriteTextFileOptions, ITextFileSaveAsOptions } from '../common/textfiles.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileStatWithMetadata, ICreateFileOptions } from '../../../../platform/files/common/files.js';
import { ITextSnapshot } from '../../../../editor/common/model.js';
import { IPlanningModeService, RESTRICTED_OPERATIONS } from '../../planningMode/common/planningMode.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { IFileOperationUndoRedoInfo } from '../../workingCopy/common/workingCopyFileService.js';

export class PlanningModeAwareTextFileService extends Disposable implements ITextFileService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly baseTextFileService: ITextFileService,
		@IPlanningModeService private readonly planningModeService: IPlanningModeService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
	}

	// Delegate all read-only operations
	get files() { return this.baseTextFileService.files; }
	get untitled() { return this.baseTextFileService.untitled; }
	get encoding() { return this.baseTextFileService.encoding; }

	isDirty(resource: URI): boolean {
		return this.baseTextFileService.isDirty(resource);
	}

	async read(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileContent> {
		return this.baseTextFileService.read(resource, options);
	}

	async readStream(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileStreamContent> {
		return this.baseTextFileService.readStream(resource, options);
	}

	// Restrict write operations in planning mode
	async save(resource: URI, options?: ITextFileSaveOptions): Promise<URI | undefined> {
		if (this._checkRestricted(RESTRICTED_OPERATIONS.FILE_SAVE, 'save file')) {
			return undefined;
		}
		return this.baseTextFileService.save(resource, options);
	}

	async saveAs(resource: URI, targetResource?: URI, options?: ITextFileSaveAsOptions): Promise<URI | undefined> {
		if (this._checkRestricted(RESTRICTED_OPERATIONS.FILE_SAVE, 'save file as')) {
			return undefined;
		}
		return this.baseTextFileService.saveAs(resource, targetResource, options);
	}

	async write(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata> {
		if (this._checkRestricted(RESTRICTED_OPERATIONS.FILE_WRITE, 'write to file')) {
			throw new Error(localize('planningMode.fileWriteRestricted', "File writing is restricted in Planning Mode. Disable Planning Mode to make changes."));
		}
		return this.baseTextFileService.write(resource, value, options);
	}

	async create(operations: { resource: URI; value?: string | ITextSnapshot; options?: ICreateFileOptions }[], undoInfo?: IFileOperationUndoRedoInfo): Promise<readonly IFileStatWithMetadata[]> {
		if (this._checkRestricted(RESTRICTED_OPERATIONS.FILE_CREATE, 'create files')) {
			throw new Error(localize('planningMode.fileCreateRestricted', "File creation is restricted in Planning Mode. Disable Planning Mode to create files."));
		}
		return this.baseTextFileService.create(operations, undoInfo);
	}

	async revert(resource: URI, options?: any): Promise<void> {
		// Allow revert as it's not destructive in planning mode context
		return this.baseTextFileService.revert(resource, options);
	}

	async getEncodedReadable(resource: URI | undefined, value: string | ITextSnapshot | undefined): Promise<any> {
		return this.baseTextFileService.getEncodedReadable(resource, value);
	}

	// Delegate additional interface methods
	async getDecodedStream(resource: URI | undefined, value: any, options?: any): Promise<any> {
		return this.baseTextFileService.getDecodedStream(resource, value, options);
	}

	getEncoding(resource: URI): string {
		return this.baseTextFileService.getEncoding(resource);
	}

	async resolveDecoding(resource: URI | undefined, options?: any): Promise<any> {
		return this.baseTextFileService.resolveDecoding(resource, options);
	}

	async resolveEncoding(resource: URI | undefined, options?: any): Promise<any> {
		return this.baseTextFileService.resolveEncoding(resource, options);
	}

	async validateDetectedEncoding(resource: URI | undefined, detectedEncoding: string, options?: any): Promise<string> {
		return this.baseTextFileService.validateDetectedEncoding(resource, detectedEncoding, options);
	}

	override dispose(): void {
		super.dispose();
		this.baseTextFileService.dispose();
	}

	private _checkRestricted(operation: string, actionName: string): boolean {
		if (this.planningModeService.isOperationRestricted(operation)) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('planningMode.operationRestricted', "Cannot {0} while in Planning Mode. Use this mode for research and analysis only.", actionName)
			});

			// Log the restricted operation attempt
			this.planningModeService.addConversationEntry({
				type: 'system',
				content: `Attempted restricted operation: ${actionName}`,
				metadata: {
					error: `Operation ${operation} blocked by Planning Mode`
				}
			});

			return true;
		}
		return false;
	}
}
