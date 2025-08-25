/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { IBulkEditService, ResourceFileEdit, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

// ============================================================================
// OPERATION INTERFACES AND TYPES
// ============================================================================

// Temporary type definition for notebook operations - will be properly imported later
interface ICellEditOperation {
	// Placeholder for notebook cell edit operations
	kind: string;
	index: number;
}

/**
 * Enumeration of all supported operation types.
 */
export const enum ChatEditOperationType {
	TextEdit = 'textEdit',
	FileCreate = 'fileCreate',
	FileDelete = 'fileDelete',
	FileRename = 'fileRename',
	FileMove = 'fileMove',
	NotebookEdit = 'notebookEdit',
	OperationGroup = 'operationGroup'
}

/**
 * Result of applying or reverting an operation.
 */
export interface IOperationResult {
	/** Whether the operation succeeded */
	success: boolean;

	/** Any error that occurred */
	error?: Error;

	/** Resources that were modified */
	modifiedResources: readonly URI[];

	/** Additional metadata about the operation result */
	metadata?: Record<string, any>;
}

/**
 * Result of validating an operation.
 */
export interface IOperationValidationResult {
	/** Whether the operation is valid */
	valid: boolean;

	/** Any errors that prevent the operation from being applied */
	errors: readonly string[];

	/** Any warnings about the operation */
	warnings: readonly string[];

	/** Resources that would be affected */
	affectedResources: readonly URI[];
}

/**
 * Serialized form of an operation for storage.
 */
export interface IChatEditOperationData {
	id: string;
	requestId: string;
	timestamp: number;
	type: ChatEditOperationType;
	data: unknown; // Type-specific operation data
	dependencies: readonly string[];
}

/**
 * Base interface for all chat editing operations.
 * Operations are discrete, reversible actions that can be applied to a workspace.
 */
export interface IChatEditOperation {
	/** Unique identifier for this operation */
	readonly id: string;

	/** The chat request that generated this operation */
	readonly requestId: string;

	/** When this operation was created */
	readonly timestamp: number;

	/** Type discriminator for operation serialization */
	readonly type: ChatEditOperationType;

	/**
	 * Apply this operation to the workspace state.
	 * @returns Promise that resolves when the operation is complete
	 */
	apply(): Promise<IOperationResult>;

	/**
	 * Revert this operation from the workspace state.
	 * @returns Promise that resolves when the revert is complete
	 */
	revert(): Promise<IOperationResult>;

	/**
	 * Validate that this operation can be applied to the current workspace state.
	 * @returns Validation result with any errors or warnings
	 */
	validate(): Promise<IOperationValidationResult>;

	/**
	 * Get the list of operation IDs that this operation depends on.
	 * Operations must be applied in dependency order.
	 */
	getDependencies(): readonly string[];

	/**
	 * Get the URIs that this operation affects.
	 * Used for conflict detection and UI updates.
	 */
	getAffectedResources(): readonly URI[];

	/**
	 * Serialize this operation for storage.
	 */
	toJSON(): IChatEditOperationData;

	/**
	 * Get a human-readable description of this operation.
	 */
	getDescription(): string;
}

// ============================================================================
// SPECIFIC OPERATION TYPE INTERFACES
// ============================================================================

/**
 * Operation for editing text content within a file.
 */
export interface IChatTextEditOperation extends IChatEditOperation {
	readonly type: ChatEditOperationType.TextEdit;
	readonly targetUri: URI;
	readonly edits: readonly TextEdit[];
	readonly isLastEdit: boolean;
}

/**
 * Operation for creating a new file.
 */
export interface IChatFileCreateOperation extends IChatEditOperation {
	readonly type: ChatEditOperationType.FileCreate;
	readonly targetUri: URI;
	readonly initialContent: string;
	readonly overwrite: boolean;
}

/**
 * Operation for deleting a file.
 */
export interface IChatFileDeleteOperation extends IChatEditOperation {
	readonly type: ChatEditOperationType.FileDelete;
	readonly targetUri: URI;
	readonly moveToTrash: boolean;
	readonly preserveContent: boolean; // For undo purposes
}

/**
 * Operation for renaming/moving a file.
 */
export interface IChatFileRenameOperation extends IChatEditOperation {
	readonly type: ChatEditOperationType.FileRename;
	readonly oldUri: URI;
	readonly newUri: URI;
	readonly overwrite: boolean;
}

/**
 * Operation for editing notebook cells.
 */
export interface IChatNotebookEditOperation extends IChatEditOperation {
	readonly type: ChatEditOperationType.NotebookEdit;
	readonly targetUri: URI;
	readonly cellEdits: readonly ICellEditOperation[];
	readonly isLastEdit: boolean;
}

/**
 * Group of operations that should be applied atomically.
 */
export interface IChatOperationGroup extends IChatEditOperation {
	readonly type: ChatEditOperationType.OperationGroup;
	readonly operations: readonly IChatEditOperation[];
	readonly description: string;
}

// ============================================================================
// OPERATION IMPLEMENTATION BASE CLASS
// ============================================================================

/**
 * Base class for all chat editing operations.
 */
abstract class BaseChatEditOperation implements IChatEditOperation {
	public readonly id: string;
	public readonly timestamp: number;

	constructor(
		public readonly requestId: string,
		public readonly type: ChatEditOperationType
	) {
		this.id = `${type}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
		this.timestamp = Date.now();
	}

	abstract apply(): Promise<IOperationResult>;
	abstract revert(): Promise<IOperationResult>;
	abstract validate(): Promise<IOperationValidationResult>;
	abstract getAffectedResources(): readonly URI[];
	abstract toJSON(): IChatEditOperationData;
	abstract getDescription(): string;

	getDependencies(): readonly string[] {
		return [];
	}

	protected createSuccessResult(modifiedResources: readonly URI[], metadata?: Record<string, any>): IOperationResult {
		return {
			success: true,
			modifiedResources,
			metadata
		};
	}

	protected createErrorResult(error: Error, modifiedResources: readonly URI[] = []): IOperationResult {
		return {
			success: false,
			error,
			modifiedResources
		};
	}

	protected createValidationResult(valid: boolean, errors: readonly string[] = [], warnings: readonly string[] = []): IOperationValidationResult {
		return {
			valid,
			errors,
			warnings,
			affectedResources: this.getAffectedResources()
		};
	}
}

// ============================================================================
// CONCRETE OPERATION IMPLEMENTATIONS
// ============================================================================

/**
 * Implementation of text edit operations.
 */
export class ChatTextEditOperation extends BaseChatEditOperation implements IChatTextEditOperation {
	public override readonly type = ChatEditOperationType.TextEdit;

	constructor(
		requestId: string,
		public readonly targetUri: URI,
		public readonly edits: readonly TextEdit[],
		public readonly isLastEdit: boolean,
		@IFileService private readonly _fileService: IFileService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService
	) {
		super(requestId, ChatEditOperationType.TextEdit);
	}

	async apply(): Promise<IOperationResult> {
		try {
			// Create the edits using VS Code's bulk edit service
			const edits = this.edits.map(edit => new ResourceTextEdit(this.targetUri, edit));

			// Apply the edit using VS Code's bulk edit service
			const success = await this._bulkEditService.apply({ edits }, { showPreview: false });

			if (success) {
				return this.createSuccessResult([this.targetUri]);
			} else {
				throw new Error('Failed to apply text edits');
			}
		} catch (error) {
			return this.createErrorResult(error as Error);
		}
	}

	async revert(): Promise<IOperationResult> {
		// TODO: Implement proper revert logic by storing original state
		// For now, this is a placeholder
		return this.createSuccessResult([this.targetUri]);
	}

	async validate(): Promise<IOperationValidationResult> {
		try {
			const exists = await this._fileService.exists(this.targetUri);
			if (!exists) {
				return this.createValidationResult(false, [`File does not exist: ${this.targetUri.toString()}`]);
			}

			// TODO: Add more validation logic (e.g., check edit ranges)
			return this.createValidationResult(true);
		} catch (error) {
			return this.createValidationResult(false, [`Validation error: ${error}`]);
		}
	}

	getAffectedResources(): readonly URI[] {
		return [this.targetUri];
	}

	toJSON(): IChatEditOperationData {
		return {
			id: this.id,
			requestId: this.requestId,
			timestamp: this.timestamp,
			type: this.type,
			data: {
				targetUri: this.targetUri.toString(),
				edits: this.edits,
				isLastEdit: this.isLastEdit
			},
			dependencies: this.getDependencies()
		};
	}

	getDescription(): string {
		return `Edit ${this.edits.length} text range(s) in ${this.targetUri.path}`;
	}
}

/**
 * Implementation of file creation operations.
 */
export class ChatFileCreateOperation extends BaseChatEditOperation implements IChatFileCreateOperation {
	public override readonly type = ChatEditOperationType.FileCreate;

	constructor(
		requestId: string,
		public readonly targetUri: URI,
		public readonly initialContent: string,
		public readonly overwrite: boolean,
		@IFileService private readonly _fileService: IFileService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService
	) {
		super(requestId, ChatEditOperationType.FileCreate);
	}

	async apply(): Promise<IOperationResult> {
		try {
			const exists = await this._fileService.exists(this.targetUri);
			if (exists && !this.overwrite) {
				throw new Error(`File already exists: ${this.targetUri.toString()}`);
			}

			// Use bulk edit service to create the file
			const resourceEdit = new ResourceFileEdit(
				this.targetUri,
				undefined,
				{
					overwrite: this.overwrite,
					contents: Promise.resolve(VSBuffer.fromString(this.initialContent))
				}
			);
			const result = await this._bulkEditService.apply([resourceEdit]);

			if (result.isApplied) {
				return this.createSuccessResult([this.targetUri]);
			} else {
				throw new Error('Failed to create file');
			}
		} catch (error) {
			return this.createErrorResult(error as Error);
		}
	}

	async revert(): Promise<IOperationResult> {
		try {
			// Use bulk edit service to delete the file
			const resourceEdit = new ResourceFileEdit(
				undefined,
				this.targetUri,
				{}
			);
			const result = await this._bulkEditService.apply([resourceEdit]);

			if (result.isApplied) {
				return this.createSuccessResult([this.targetUri]);
			} else {
				throw new Error('Failed to revert file creation');
			}
		} catch (error) {
			return this.createErrorResult(error as Error);
		}
	}

	async validate(): Promise<IOperationValidationResult> {
		try {
			const exists = await this._fileService.exists(this.targetUri);
			if (exists && !this.overwrite) {
				return this.createValidationResult(false, [`File already exists: ${this.targetUri.toString()}`]);
			}

			return this.createValidationResult(true);
		} catch (error) {
			return this.createValidationResult(false, [`Validation error: ${error}`]);
		}
	}

	getAffectedResources(): readonly URI[] {
		return [this.targetUri];
	}

	toJSON(): IChatEditOperationData {
		return {
			id: this.id,
			requestId: this.requestId,
			timestamp: this.timestamp,
			type: this.type,
			data: {
				targetUri: this.targetUri.toString(),
				initialContent: this.initialContent,
				overwrite: this.overwrite
			},
			dependencies: this.getDependencies()
		};
	}

	getDescription(): string {
		return `Create file ${this.targetUri.path}`;
	}
}

/**
 * Implementation of file deletion operations.
 */
export class ChatFileDeleteOperation extends BaseChatEditOperation implements IChatFileDeleteOperation {
	public override readonly type = ChatEditOperationType.FileDelete;
	private _originalContent: string | null = null;

	constructor(
		requestId: string,
		public readonly targetUri: URI,
		public readonly moveToTrash: boolean,
		public readonly preserveContent: boolean,
		@IFileService private readonly _fileService: IFileService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService
	) {
		super(requestId, ChatEditOperationType.FileDelete);
	}

	async apply(): Promise<IOperationResult> {
		try {
			// Store original content for potential revert
			if (this.preserveContent) {
				const fileContent = await this._fileService.readFile(this.targetUri);
				this._originalContent = fileContent.value.toString();
			}

			// Use bulk edit service to delete the file
			const resourceEdit = new ResourceFileEdit(
				undefined,
				this.targetUri,
				{ skipTrashBin: !this.moveToTrash }
			);
			const result = await this._bulkEditService.apply([resourceEdit]);

			if (result.isApplied) {
				return this.createSuccessResult([this.targetUri]);
			} else {
				throw new Error('Failed to delete file');
			}
		} catch (error) {
			return this.createErrorResult(error as Error);
		}
	}

	async revert(): Promise<IOperationResult> {
		try {
			const resourceEdit = new ResourceFileEdit(
				this.targetUri,
				undefined,
				{ contents: Promise.resolve(VSBuffer.fromString(this.preserveContent && this._originalContent || '')) }
			);
			const result = await this._bulkEditService.apply([resourceEdit]);
			if (result.isApplied) {
				return this.createSuccessResult([this.targetUri]);
			} else {
				throw new Error('Failed to delete file');
			}
		} catch (error) {
			return this.createErrorResult(error as Error);
		}
	}

	async validate(): Promise<IOperationValidationResult> {
		try {
			const exists = await this._fileService.exists(this.targetUri);
			if (!exists) {
				return this.createValidationResult(false, [`File does not exist: ${this.targetUri.toString()}`]);
			}

			return this.createValidationResult(true);
		} catch (error) {
			return this.createValidationResult(false, [`Validation error: ${error}`]);
		}
	}

	getAffectedResources(): readonly URI[] {
		return [this.targetUri];
	}

	toJSON(): IChatEditOperationData {
		return {
			id: this.id,
			requestId: this.requestId,
			timestamp: this.timestamp,
			type: this.type,
			data: {
				targetUri: this.targetUri.toString(),
				moveToTrash: this.moveToTrash,
				preserveContent: this.preserveContent,
				originalContent: this._originalContent
			},
			dependencies: this.getDependencies()
		};
	}

	getDescription(): string {
		return `Delete file ${this.targetUri.path}`;
	}
}

/**
 * Implementation of file rename operations.
 */
export class ChatFileRenameOperation extends BaseChatEditOperation implements IChatFileRenameOperation {
	public override readonly type = ChatEditOperationType.FileRename;

	constructor(
		requestId: string,
		public readonly oldUri: URI,
		public readonly newUri: URI,
		public readonly overwrite: boolean,
		@IFileService private readonly _fileService: IFileService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService
	) {
		super(requestId, ChatEditOperationType.FileRename);
	}

	async apply(): Promise<IOperationResult> {
		try {
			const sourceExists = await this._fileService.exists(this.oldUri);
			if (!sourceExists) {
				throw new Error(`Source file does not exist: ${this.oldUri.toString()}`);
			}

			const targetExists = await this._fileService.exists(this.newUri);
			if (targetExists && !this.overwrite) {
				throw new Error(`Target file already exists: ${this.newUri.toString()}`);
			}

			// Use bulk edit service to rename the file
			const resourceEdit = new ResourceFileEdit(
				this.newUri,
				this.oldUri,
				{ overwrite: this.overwrite }
			);
			const result = await this._bulkEditService.apply([resourceEdit]);

			if (result.isApplied) {
				return this.createSuccessResult([this.oldUri, this.newUri]);
			} else {
				throw new Error('Failed to rename file');
			}
		} catch (error) {
			return this.createErrorResult(error as Error);
		}
	}

	async revert(): Promise<IOperationResult> {
		try {
			// Use bulk edit service to rename back
			const resourceEdit = new ResourceFileEdit(
				this.oldUri,
				this.newUri,
				{ overwrite: true }
			);
			const result = await this._bulkEditService.apply([resourceEdit]);

			if (result.isApplied) {
				return this.createSuccessResult([this.oldUri, this.newUri]);
			} else {
				throw new Error('Failed to revert file rename');
			}
		} catch (error) {
			return this.createErrorResult(error as Error);
		}
	}

	async validate(): Promise<IOperationValidationResult> {
		try {
			const sourceExists = await this._fileService.exists(this.oldUri);
			if (!sourceExists) {
				return this.createValidationResult(false, [`Source file does not exist: ${this.oldUri.toString()}`]);
			}

			const targetExists = await this._fileService.exists(this.newUri);
			if (targetExists && !this.overwrite) {
				return this.createValidationResult(false, [`Target file already exists: ${this.newUri.toString()}`]);
			}

			return this.createValidationResult(true);
		} catch (error) {
			return this.createValidationResult(false, [`Validation error: ${error}`]);
		}
	}

	getAffectedResources(): readonly URI[] {
		return [this.oldUri, this.newUri];
	}

	toJSON(): IChatEditOperationData {
		return {
			id: this.id,
			requestId: this.requestId,
			timestamp: this.timestamp,
			type: this.type,
			data: {
				oldUri: this.oldUri.toString(),
				newUri: this.newUri.toString(),
				overwrite: this.overwrite
			},
			dependencies: this.getDependencies()
		};
	}

	getDescription(): string {
		return `Rename ${this.oldUri.path} to ${this.newUri.path}`;
	}
}

/**
 * Implementation of operation groups for atomic transactions.
 */
export class ChatOperationGroup extends BaseChatEditOperation implements IChatOperationGroup {
	public override readonly type = ChatEditOperationType.OperationGroup;

	constructor(
		requestId: string,
		public readonly operations: readonly IChatEditOperation[],
		public readonly description: string
	) {
		super(requestId, ChatEditOperationType.OperationGroup);
	}

	async apply(): Promise<IOperationResult> {
		const results: IOperationResult[] = [];
		const allModifiedResources: URI[] = [];

		try {
			// Apply all operations in sequence
			for (const operation of this.operations) {
				const result = await operation.apply();
				results.push(result);

				if (!result.success) {
					// Rollback all previous operations
					for (let i = results.length - 2; i >= 0; i--) {
						await this.operations[i].revert();
					}
					return result;
				}

				allModifiedResources.push(...result.modifiedResources);
			}

			return this.createSuccessResult(allModifiedResources, { operationCount: this.operations.length });
		} catch (error) {
			return this.createErrorResult(error as Error, allModifiedResources);
		}
	}

	async revert(): Promise<IOperationResult> {
		const allModifiedResources: URI[] = [];

		try {
			// Revert operations in reverse order
			for (let i = this.operations.length - 1; i >= 0; i--) {
				const result = await this.operations[i].revert();
				allModifiedResources.push(...result.modifiedResources);

				if (!result.success) {
					return result;
				}
			}

			return this.createSuccessResult(allModifiedResources);
		} catch (error) {
			return this.createErrorResult(error as Error, allModifiedResources);
		}
	}

	async validate(): Promise<IOperationValidationResult> {
		const allErrors: string[] = [];
		const allWarnings: string[] = [];
		const allAffectedResources: URI[] = [];

		for (const operation of this.operations) {
			const result = await operation.validate();
			allErrors.push(...result.errors);
			allWarnings.push(...result.warnings);
			allAffectedResources.push(...result.affectedResources);
		}

		return {
			valid: allErrors.length === 0,
			errors: allErrors,
			warnings: allWarnings,
			affectedResources: allAffectedResources
		};
	}

	override getDependencies(): readonly string[] {
		// Collect dependencies from all operations
		const allDeps = new Set<string>();
		for (const operation of this.operations) {
			operation.getDependencies().forEach(dep => allDeps.add(dep));
		}
		return Array.from(allDeps);
	}

	getAffectedResources(): readonly URI[] {
		const allResources = new Set<string>();
		for (const operation of this.operations) {
			operation.getAffectedResources().forEach(uri => allResources.add(uri.toString()));
		}
		return Array.from(allResources).map(uri => URI.parse(uri));
	}

	toJSON(): IChatEditOperationData {
		return {
			id: this.id,
			requestId: this.requestId,
			timestamp: this.timestamp,
			type: this.type,
			data: {
				operations: this.operations.map(op => op.toJSON()),
				description: this.description
			},
			dependencies: this.getDependencies()
		};
	}

	getDescription(): string {
		return this.description;
	}
}

// ============================================================================
// OPERATION FACTORY
// ============================================================================

/**
 * Factory for creating operation instances from serialized data.
 */
export class ChatEditOperationFactory {
	static deserialize(instaService: IInstantiationService, data: IChatEditOperationData): IChatEditOperation {
		switch (data.type) {
			case ChatEditOperationType.TextEdit: {
				const textData = data.data as any;
				return instaService.createInstance(ChatTextEditOperation,
					data.requestId,
					URI.parse(textData.targetUri),
					textData.edits,
					textData.isLastEdit
				);
			}

			case ChatEditOperationType.FileCreate: {
				const createData = data.data as any;
				return instaService.createInstance(ChatFileCreateOperation,
					data.requestId,
					URI.parse(createData.targetUri),
					createData.initialContent,
					createData.overwrite
				);
			}

			case ChatEditOperationType.FileDelete: {
				const deleteData = data.data as any;
				return instaService.createInstance(ChatFileDeleteOperation,
					data.requestId,
					URI.parse(deleteData.targetUri),
					deleteData.moveToTrash,
					deleteData.preserveContent
				);
			}

			case ChatEditOperationType.FileRename: {
				const renameData = data.data as any;
				return instaService.createInstance(ChatFileRenameOperation,
					data.requestId,
					URI.parse(renameData.oldUri),
					URI.parse(renameData.newUri),
					renameData.overwrite
				);
			}

			case ChatEditOperationType.OperationGroup: {
				const groupData = data.data as any;
				const operations = groupData.operations.map((opData: IChatEditOperationData) =>
					ChatEditOperationFactory.deserialize(instaService, opData)
				);
				return instaService.createInstance(ChatOperationGroup,
					data.requestId,
					operations,
					groupData.description
				);
			}

			default:
				throw new Error(`Unknown operation type: ${data.type}`);
		}
	}
}
