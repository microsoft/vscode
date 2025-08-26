/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { IBulkEditService, ResourceFileEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
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
 * Result of applying an operation to an in-memory text model for diff preview.
 */
export interface IOperationModelApplicationResult {
	/** If the operation represents a move/rename, this is the new URI */
	movedToURI?: URI;
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

export class ChatOperationResultAggregator implements IOperationResult {
	public success: boolean = true;
	public error?: Error;

	private readonly _modifiedResources = new ResourceSet();
	public get modifiedResources() {
		return [...this._modifiedResources];
	}
	public metadata?: Record<string, any>;

	constructor(initialResults?: readonly IOperationResult[]) {
		if (initialResults) {
			for (const r of initialResults) {
				this.add(r);
			}
		}
	}

	add(result: IOperationResult): void {
		this.success &&= result.success;
		this.error ??= result.error;
		// Merge modified resources (unique by toString)
		for (const uri of result.modifiedResources || []) {
			this._modifiedResources.add(uri);
		}
		if (result.metadata) {
			this.metadata = { ...this.metadata, ...result.metadata };
		}
	}
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

	/** Whether the operation is currently applied on disk. */
	readonly isApplied: boolean;

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
	 * Apply this operation to an in-memory text model for diff preview.
	 * This does not modify the actual workspace but allows showing diffs to users.
	 * @param model The text model to apply the operation to
	 * @returns Result containing any URI changes for moves/renames
	 */
	applyTo(model: ITextModel): IOperationModelApplicationResult;

	/**
	 * Get a human-readable description of this operation.
	 */
	getDescription(): string;
}


// ============================================================================
// SPECIFIC OPERATION TYPE INTERFACES
// ============================================================================

// NOTE: If ChatNotebookEditOperation is implemented in this file, add isApplied property as in other classes.

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
	abstract get isApplied(): boolean;
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
	abstract applyTo(model: ITextModel): IOperationModelApplicationResult;

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
	private _undoEdit?: TextEdit[];
	public get isApplied(): boolean {
		return this._undoEdit !== undefined;
	}

	constructor(
		requestId: string,
		public readonly targetUri: URI,
		public readonly edits: readonly TextEdit[],
		public readonly isLastEdit: boolean,
		@IFileService private readonly _fileService: IFileService,
		@ITextModelService private readonly _textModelService: ITextModelService
	) {
		super(requestId, ChatEditOperationType.TextEdit);
	}

	async apply(): Promise<IOperationResult> {
		let ref: IReference<IResolvedTextEditorModel> | undefined = undefined;
		try {
			ref = await this._textModelService.createModelReference(this.targetUri);
			this._undoEdit = ref.object.textEditorModel.applyEdits(this.edits, true);
			return this.createSuccessResult([this.targetUri]);
		} catch (error) {
			return this.createErrorResult(error as Error);
		} finally {
			ref?.dispose();
		}
	}

	async revert(): Promise<IOperationResult> {
		let ref: IReference<IResolvedTextEditorModel> | undefined = undefined;
		try {
			if (this._undoEdit !== undefined) {
				ref = await this._textModelService.createModelReference(this.targetUri);
				ref.object.textEditorModel.applyEdits(this._undoEdit);
				this._undoEdit = undefined;
			}
			return this.createSuccessResult([this.targetUri]);
		} catch (error) {
			return this.createErrorResult(error as Error);
		} finally {
			ref?.dispose();
		}
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

	applyTo(model: ITextModel): IOperationModelApplicationResult {
		// Apply text edits to the model
		model.applyEdits(this.edits);
		return {};
	}
}

/**
 * Implementation of file creation operations.
 */
export class ChatFileCreateOperation extends BaseChatEditOperation implements IChatFileCreateOperation {
	public override readonly type = ChatEditOperationType.FileCreate;
	private _isApplied = false;
	public get isApplied(): boolean {
		return this._isApplied;
	}

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
				this._isApplied = true;
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
			const resourceEdit = new ResourceFileEdit(
				undefined,
				this.targetUri,
				{}
			);
			const result = await this._bulkEditService.apply([resourceEdit]);
			if (result.isApplied) {
				this._isApplied = false;
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

	applyTo(model: ITextModel): IOperationModelApplicationResult {
		// Set the model's content to the initial content
		model.setValue(this.initialContent);
		return {};
	}
}

/**
 * Implementation of file deletion operations.
 */
export class ChatFileDeleteOperation extends BaseChatEditOperation implements IChatFileDeleteOperation {
	public override readonly type = ChatEditOperationType.FileDelete;
	private _originalContent: string | null = null;
	private _isApplied = false;
	public get isApplied(): boolean {
		return this._isApplied;
	}

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
			if (this.preserveContent) {
				const fileContent = await this._fileService.readFile(this.targetUri);
				this._originalContent = fileContent.value.toString();
			}
			const resourceEdit = new ResourceFileEdit(
				undefined,
				this.targetUri,
				{ skipTrashBin: !this.moveToTrash }
			);
			const result = await this._bulkEditService.apply([resourceEdit]);
			if (result.isApplied) {
				this._isApplied = true;
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
				this._isApplied = false;
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

	applyTo(model: ITextModel): IOperationModelApplicationResult {
		// Wipe the model's contents to represent deletion
		model.setValue('');
		return {};
	}
}

/**
 * Implementation of file rename operations.
 */
export class ChatFileRenameOperation extends BaseChatEditOperation implements IChatFileRenameOperation {
	public override readonly type = ChatEditOperationType.FileRename;
	private _isApplied = false;
	public get isApplied(): boolean {
		return this._isApplied;
	}

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
			const resourceEdit = new ResourceFileEdit(
				this.newUri,
				this.oldUri,
				{ overwrite: this.overwrite }
			);
			const result = await this._bulkEditService.apply([resourceEdit]);
			if (result.isApplied) {
				this._isApplied = true;
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
			const resourceEdit = new ResourceFileEdit(
				this.oldUri,
				this.newUri,
				{ overwrite: true }
			);
			const result = await this._bulkEditService.apply([resourceEdit]);
			if (result.isApplied) {
				this._isApplied = false;
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

	applyTo(model: ITextModel): IOperationModelApplicationResult {
		// For renames/moves, don't modify content but return the new URI
		return { movedToURI: this.newUri };
	}
}

/**
 * Implementation of operation groups for atomic transactions.
 */
export class ChatOperationGroup extends BaseChatEditOperation implements IChatOperationGroup {
	public override readonly type = ChatEditOperationType.OperationGroup;
	private _isApplied = false;
	public get isApplied(): boolean {
		return this._isApplied;
	}

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
			for (const operation of this.operations) {
				const result = await operation.apply();
				results.push(result);
				if (!result.success) {
					for (let i = results.length - 2; i >= 0; i--) {
						await this.operations[i].revert();
					}
					return result;
				}
				allModifiedResources.push(...result.modifiedResources);
			}
			this._isApplied = true;
			return this.createSuccessResult(allModifiedResources, { operationCount: this.operations.length });
		} catch (error) {
			return this.createErrorResult(error as Error, allModifiedResources);
		}
	}

	async revert(): Promise<IOperationResult> {
		const allModifiedResources: URI[] = [];
		try {
			for (let i = this.operations.length - 1; i >= 0; i--) {
				const result = await this.operations[i].revert();
				allModifiedResources.push(...result.modifiedResources);
				if (!result.success) {
					return result;
				}
			}
			this._isApplied = false;
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

	applyTo(model: ITextModel): IOperationModelApplicationResult {
		// Apply all operations in sequence
		let lastResult: IOperationModelApplicationResult = {};
		for (const operation of this.operations) {
			const result = operation.applyTo(model);
			// If any operation returns a moved URI, use the last one
			if (result.movedToURI) {
				lastResult = result;
			}
		}
		return lastResult;
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
