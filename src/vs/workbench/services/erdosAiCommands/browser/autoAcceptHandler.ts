/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IAutoAcceptHandler, IWidgetDecisionSetter } from '../common/autoAcceptHandler.js';
import { IErdosAiSettingsService } from '../../erdosAiSettings/common/settingsService.js';
import { IConversationManager } from '../../erdosAiConversation/common/conversationManager.js';
import { ICommonUtils } from '../../erdosAiUtils/common/commonUtils.js';
import { INotebookService } from '../../../contrib/notebook/common/notebookService.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { SnapshotContext } from '../../../services/workingCopy/common/fileWorkingCopy.js';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { ISearchReplaceCommandHandler } from '../common/searchReplaceCommandHandler.js';
import { INotebookEditorModelResolverService } from '../../../contrib/notebook/common/notebookEditorModelResolverService.js';

export class AutoAcceptHandler implements IAutoAcceptHandler {
	readonly _serviceBrand: undefined;
	
	private widgetDecisionSetter: IWidgetDecisionSetter | null = null;

	constructor(
		@IErdosAiSettingsService private readonly settingsService: IErdosAiSettingsService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IConversationManager private readonly conversationManager: IConversationManager,
		@ICommonUtils private readonly commonUtils: ICommonUtils,
		@INotebookService private readonly notebookService: INotebookService,
		@ISearchReplaceCommandHandler private readonly searchReplaceCommandHandler: ISearchReplaceCommandHandler,
		@INotebookEditorModelResolverService private readonly notebookEditorModelResolverService: INotebookEditorModelResolverService
	) {}
	
	/**
	 * Set the widget decision setter (called by the service core to avoid circular dependency)
	 */
	setWidgetDecisionSetter(setter: IWidgetDecisionSetter): void {
		this.widgetDecisionSetter = setter;
	}

	/**
	 * Check for auto-accept conditions and automatically set widget decisions
	 */
	async checkAndHandleAutoAccept(specificBranch: any): Promise<boolean> {
		if (!this.widgetDecisionSetter) {
			return false;
		}

		if (!specificBranch) {
			return false;
		}

		// Check for auto-accept edits (search_replace)
		const autoAcceptEdits = await this.settingsService.getAutoAcceptEdits();
		
		if (autoAcceptEdits && specificBranch.functionCall.name === 'search_replace' && specificBranch.status === 'waiting_user') {
			// Track the auto-accept edit before applying it
			const args = JSON.parse(specificBranch.functionCall.arguments);
			const filePath = args.file_path || args.filename;
			
			if (filePath) {
				const currentConversation = this.conversationManager.getCurrentConversation();
				if (currentConversation) {
					await this.trackAutoAcceptEdit(filePath, currentConversation.info.id);
				}
			}

			this.widgetDecisionSetter.setWidgetDecision(
				'search_replace',
				specificBranch.messageId,
				'accept',
				'', // Content is not needed for search_replace acceptance
				specificBranch.requestId
			);
			
			return true;
		}

		// Check for auto-accept deletes (delete_file)
		const autoAcceptDeletes = await this.settingsService.getAutoAcceptDeletes();
		if (autoAcceptDeletes && specificBranch.functionCall.name === 'delete_file' && specificBranch.status === 'waiting_user') {
			this.widgetDecisionSetter.setWidgetDecision(
				'delete_file',
				specificBranch.messageId,
				'accept',
				'', // Content is not needed for delete_file acceptance
				specificBranch.requestId
			);
			
			return true;
		}

		return false;
	}
	
	async trackAutoAcceptEdit(filePath: string, conversationId: number): Promise<void> {
		// Get workspace root for path resolution
		const workspace = this.workspaceContextService.getWorkspace();
		const workspaceRoot = workspace.folders.length > 0 ? workspace.folders[0].uri.fsPath : undefined;
		
		// Use the proper erdosAiUtils CommonUtils service to resolve the file path
		const resolvedFilePath = this.commonUtils.resolvePath(filePath, workspaceRoot);
		
		const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
		const workspaceId = workspace.id;
		
		const storageRoot = isEmptyWindow ?
			URI.joinPath(this.environmentService.userRoamingDataHome, 'emptyWindowErdosAi') :
			URI.joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'erdosAi');
		
		const trackingDir = URI.joinPath(storageRoot, 'auto-accept-tracking');
		const fileMapPath = URI.joinPath(trackingDir, 'file-map.json');
		const filesDir = URI.joinPath(trackingDir, 'files');
		
		// Ensure directories exist
		await this.fileService.createFolder(filesDir);
		
		// Load or create file map
		let fileMap: any = {};
		const fileMapExists = await this.fileService.exists(fileMapPath);
		if (fileMapExists) {
			const mapContent = await this.fileService.readFile(fileMapPath);
			fileMap = JSON.parse(mapContent.value.toString());
		}
		
		// Get or create hash for this file
		let fileHash = fileMap[resolvedFilePath];
		if (!fileHash) {
			fileHash = this.createFileHash(resolvedFilePath);
			fileMap[resolvedFilePath] = fileHash;
			await this.fileService.writeFile(fileMapPath, VSBuffer.fromString(JSON.stringify(fileMap, null, 2)));
		}
		
		const fileTrackingPath = URI.joinPath(filesDir, `${fileHash}.json`);
		
		// Load or create file tracking
		let fileTracking: any;
		const trackingFileExists = await this.fileService.exists(fileTrackingPath);
		if (trackingFileExists) {
			const trackingContent = await this.fileService.readFile(fileTrackingPath);
			fileTracking = JSON.parse(trackingContent.value.toString());
			if (!fileTracking.conversations.includes(conversationId)) {
				fileTracking.conversations.push(conversationId);
			}
		} else {
			// Create new tracking file
			const fileUri = URI.file(resolvedFilePath);
			const isNotebook = this.commonUtils.getFileExtension(resolvedFilePath).toLowerCase() === 'ipynb';
			let acceptedContent = isNotebook ? '{"cells": []}' : '';
			
			const fileExists = await this.fileService.exists(fileUri);
			if (fileExists) {
				if (isNotebook) {
					// For notebooks, ensure IDs exist in both disk and model before tracking
					await this.ensureNotebookHasCellIds(resolvedFilePath);
					
					// Now get the content with IDs for accepted baseline
					const snapshotStream = await this.notebookService.createNotebookTextDocumentSnapshot(
						fileUri,
						SnapshotContext.Save,
						new CancellationTokenSource().token
					);
					const buffer = await streamToBuffer(snapshotStream);
					acceptedContent = buffer.toString();
				} else {
					// For regular files, use disk content
					const currentContent = await this.fileService.readFile(fileUri);
					acceptedContent = currentContent.value.toString();
				}
			}
			
			fileTracking = {
				file_path: resolvedFilePath,
				conversations: [conversationId],
				accepted_content: acceptedContent,
				created_at: new Date().toISOString()
			};
		}
		
		await this.fileService.writeFile(fileTrackingPath, VSBuffer.fromString(JSON.stringify(fileTracking, null, 2)));
	}

	private createFileHash(filePath: string): string {
		// Simple hash based on file path
		let hash = 0;
		for (let i = 0; i < filePath.length; i++) {
			const char = filePath.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash).toString(16).substring(0, 12);
	}

	/**
	 * Ensure a notebook file has cell IDs before tracking operations
	 */
	private async ensureNotebookHasCellIds(filePath: string): Promise<void> {
		const uri = URI.file(filePath);
		const fileExists = await this.fileService.exists(uri);
		
		if (!fileExists) {
			return; // Nothing to do for non-existent files
		}
			
		// Get current model content (or file content if no model)
		let notebookJson: string;
		const notebookModel = this.notebookService.getNotebookTextModel(uri);
		if (notebookModel) {
			// Get content from model using VSCode's serialization
			const snapshotStream = await this.notebookService.createNotebookTextDocumentSnapshot(
				uri,
				SnapshotContext.Save,
				new CancellationTokenSource().token
			);
			const buffer = await streamToBuffer(snapshotStream);
			notebookJson = buffer.toString();
		} else {
			const fileContent = await this.fileService.readFile(uri);
			notebookJson = fileContent.value.toString();
		}
		
		const notebookWithIds = this.addCellIds(notebookJson);
			
		// Only update if IDs were actually added
		if (notebookWithIds !== notebookJson) {
			// Apply changes to the notebook model and save using VS Code's serialization
			const modelRef = await this.notebookEditorModelResolverService.resolve(uri, 'jupyter-notebook');
			const notebookModel = modelRef.object.notebook;
			
			// Parse the updated notebook structure
			const updatedNotebook = JSON.parse(notebookWithIds);
			
			// Convert cells to VS Code format
			const newCells = updatedNotebook.cells.map((cell: any, cellIndex: number) => {
				const vscodeMetadata: any = {};
				if (cell.cell_type === 'code' && cell.execution_count !== undefined) {
					vscodeMetadata.execution_count = cell.execution_count;
				}
				if (cell.metadata) {
					vscodeMetadata.metadata = cell.metadata;
				}
				
				const newCellData = {
					cellKind: cell.cell_type === 'markdown' ? 1 : 2,
					source: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
					language: cell.cell_type === 'code' ? 'python' : 'markdown',
					mime: cell.cell_type === 'markdown' ? 'text/markdown' : 'text/x-python',
					metadata: vscodeMetadata,
					outputs: cell.outputs || []
				};
				return newCellData;
			});
			
			// Replace all cells in the model
			notebookModel.applyEdits([{
				editType: 1,
				index: 0,
				count: notebookModel.cells.length,
				cells: newCells
			}], true, undefined, () => undefined, undefined, true);
			
			// Save the model using VS Code's proper serialization
			await modelRef.object.save();
			
			// Dispose the model reference
			modelRef.dispose();
			
			// Open in editor to show the updated content
			await this.searchReplaceCommandHandler.openDocumentInEditor(filePath);
		}
	}

	/**
	 * Add unique IDs to notebook cells for tracking changes
	 */
	private addCellIds(notebookJson: string): string {
		const notebook = JSON.parse(notebookJson);
		
		if (!notebook.cells || !Array.isArray(notebook.cells)) {
			return notebookJson;
		}

		notebook.cells.forEach((cell: { metadata: any }, index: number) => {
			// Add ID if not already present - flat structure for .ipynb JSON format
			if (!cell.metadata) {
				cell.metadata = {};
			}
			if (!cell.metadata.erdosAi_cellId) {
				const newId = `cell2_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
				cell.metadata.erdosAi_cellId = newId;
			}
		});

		return JSON.stringify(notebook, null, 2);
	}
}
