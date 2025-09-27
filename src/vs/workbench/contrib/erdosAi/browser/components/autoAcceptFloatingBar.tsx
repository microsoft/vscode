/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { IFileChangeTracker } from '../../../../services/erdosAi/common/fileChangeTracker.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { URI } from '../../../../../base/common/uri.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICommonUtils } from '../../../../services/erdosAiUtils/common/commonUtils.js';

interface AutoAcceptFloatingBarProps {
	fileChangeTracker: IFileChangeTracker;
	editorService: IEditorService;
	onRefreshFileChanges?: () => void;
}

interface FileWithChanges {
	filePath: string;
	fileName: string;
	addedLines: number;
	deletedLines: number;
	uri: URI;
}

interface DiffSection {
	sectionId: string;
	lineNumber: number;
}

export const AutoAcceptFloatingBar: React.FC<AutoAcceptFloatingBarProps> = ({
	fileChangeTracker,
	editorService,
	onRefreshFileChanges
}) => {
	const services = useErdosReactServicesContext();
	const codeEditorService = services.instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(ICodeEditorService));
	const commonUtils = services.instantiationService.invokeFunction((accessor: ServicesAccessor) => accessor.get(ICommonUtils));
	const [filesWithChanges, setFilesWithChanges] = useState<FileWithChanges[]>([]);
	const [currentFileIndex, setCurrentFileIndex] = useState(0);
	const [currentDiffIndex, setCurrentDiffIndex] = useState(0);
	const [diffSections, setDiffSections] = useState<DiffSection[]>([]);
	const [isVisible, setIsVisible] = useState(false);

	// Get current active editor URI
	const getCurrentEditorUri = (): URI | null => {
		const activeEditor = editorService.activeEditor;
		if (!activeEditor || !activeEditor.resource) {
			return null;
		}
		return activeEditor.resource;
	};

	// Get diff sections for current file
	const getDiffSectionsForFile = async (uri: URI): Promise<DiffSection[]> => {
		// Check if this is a notebook file
		const isNotebook = commonUtils.getFileExtension(uri.fsPath).toLowerCase() === 'ipynb';
		
		if (isNotebook) {
			// For notebooks, get diff sections from notebookStoredSectionInfo
			const fileChangeTrackerImpl = fileChangeTracker as any;
			const notebookStoredSectionInfo = fileChangeTrackerImpl.notebookStoredSectionInfo;
			
			if (!notebookStoredSectionInfo) {
				return [];
			}
			
			// Find sections that belong to this notebook URI
			const sections: DiffSection[] = [];
			for (const [sectionId] of notebookStoredSectionInfo.entries()) {
				// Check if this section belongs to the current URI
				// We'll use a simple approach - if we have stored section info, assume it's for the current file
				// (This could be refined to check the actual URI if stored in the section info)
				sections.push({
					sectionId: sectionId,
					lineNumber: 1 // For notebooks, we don't have specific line numbers like regular editors
				});
			}
			
			return sections;
		} else {
			// Regular file handling
			const codeEditor = codeEditorService.listCodeEditors().find((editor: ICodeEditor) => {
				const model = editor.getModel();
				return model && model.uri.toString() === uri.toString();
			});

			if (!codeEditor) {
				return [];
			}

			// Access the private autoAcceptZones map from fileChangeTracker
			// This requires accessing the private property, but it's the existing system
			const fileChangeTrackerImpl = fileChangeTracker as any;
			const autoAcceptZones = fileChangeTrackerImpl.autoAcceptZones?.get(uri.toString());
			
			if (!autoAcceptZones) {
				return [];
			}

			// Convert zone widgets to diff sections
			const sections: DiffSection[] = [];
			for (const [lineNumber, zoneWidget] of autoAcceptZones) {
				sections.push({
					sectionId: zoneWidget._diffSectionId,
					lineNumber: lineNumber
				});
			}

			// Sort by line number
			return sections.sort((a, b) => a.lineNumber - b.lineNumber);
		}
	};

	// Refresh data when needed
	const refreshData = async () => {
		try {
			const files = await fileChangeTracker.getTrackedFilesWithChanges();
			setFilesWithChanges(files);
			
			if (files.length === 0) {
				setIsVisible(false);
				return;
			}

			const currentUri = getCurrentEditorUri();
			if (currentUri) {
				const currentFileIdx = files.findIndex((f: FileWithChanges) => f.uri.toString() === currentUri.toString());
				if (currentFileIdx >= 0) {
					setCurrentFileIndex(currentFileIdx);
					const sections = await getDiffSectionsForFile(currentUri);
					setDiffSections(sections);
					setCurrentDiffIndex(0);
					const shouldBeVisible = sections.length > 0;
					setIsVisible(shouldBeVisible);
				} else {
					setCurrentFileIndex(-1);
					setDiffSections([]);
					setCurrentDiffIndex(0);
					setIsVisible(true); // Show bar for "Review next file" button
				}
			} else {
				setIsVisible(false);
			}
		} catch (error) {
			console.error('Failed to refresh auto-accept bar data:', error);
			setIsVisible(false);
		}
	};

	// Listen for changes
	useEffect(() => {
		refreshData();

		// Listen for diff section changes
		const disposable = fileChangeTracker.onDiffSectionChanged(() => {
			refreshData();
		});

		// Listen for editor changes
		const editorDisposable = editorService.onDidActiveEditorChange(() => {
			refreshData();
		});

		return () => {
			disposable.dispose();
			editorDisposable.dispose();
		};
	}, [fileChangeTracker, editorService]);

	// Navigation functions
	const navigateToPreviousDiff = () => {
		if (diffSections.length === 0) return;
		
		const newIndex = currentDiffIndex > 0 ? currentDiffIndex - 1 : diffSections.length - 1;
		setCurrentDiffIndex(newIndex);
		
		// Navigate to the diff section in editor
		const section = diffSections[newIndex];
		const currentUri = getCurrentEditorUri();
		if (currentUri) {
			const codeEditor = codeEditorService.listCodeEditors().find((editor: ICodeEditor) => {
				const model = editor.getModel();
				return model && model.uri.toString() === currentUri.toString();
			});
			
			if (codeEditor) {
				codeEditor.revealLineInCenter(section.lineNumber);
				codeEditor.setPosition({ lineNumber: section.lineNumber, column: 1 });
			}
		}
	};

	const navigateToNextDiff = () => {
		if (diffSections.length === 0) return;
		
		const newIndex = currentDiffIndex < diffSections.length - 1 ? currentDiffIndex + 1 : 0;
		setCurrentDiffIndex(newIndex);
		
		// Navigate to the diff section in editor
		const section = diffSections[newIndex];
		const currentUri = getCurrentEditorUri();
		if (currentUri) {
			const codeEditor = codeEditorService.listCodeEditors().find((editor: ICodeEditor) => {
				const model = editor.getModel();
				return model && model.uri.toString() === currentUri.toString();
			});
			
			if (codeEditor) {
				codeEditor.revealLineInCenter(section.lineNumber);
				codeEditor.setPosition({ lineNumber: section.lineNumber, column: 1 });
			}
		}
	};

	const navigateToPreviousFile = async () => {
		if (filesWithChanges.length === 0) return;
		
		const newIndex = currentFileIndex > 0 ? currentFileIndex - 1 : filesWithChanges.length - 1;
		setCurrentFileIndex(newIndex);
		
		// Open the file
		const file = filesWithChanges[newIndex];
		await editorService.openEditor({ resource: file.uri });
	};

	const navigateToNextFile = async () => {
		if (filesWithChanges.length === 0) return;
		
		const newIndex = currentFileIndex < filesWithChanges.length - 1 ? currentFileIndex + 1 : 0;
		setCurrentFileIndex(newIndex);
		
		// Open the file
		const file = filesWithChanges[newIndex];
		await editorService.openEditor({ resource: file.uri });
	};

	// Action functions
	const handleUndo = async () => {
		const currentUri = getCurrentEditorUri();
		if (!currentUri || diffSections.length === 0) return;

		// Reject all diff sections in current file
		for (const section of diffSections) {
			await fileChangeTracker.rejectDiffSection(currentUri, section.sectionId);
		}

		// Refresh data after rejecting sections
		await refreshData();
		
		// Trigger FileChangesBar refresh
		if (onRefreshFileChanges) {
			onRefreshFileChanges();
		}
	};

	const handleKeep = async () => {
		const currentUri = getCurrentEditorUri();
		if (!currentUri || diffSections.length === 0) return;

		// Accept all diff sections in current file
		for (const section of diffSections) {
			await fileChangeTracker.acceptDiffSection(currentUri, section.sectionId);
		}

		// Refresh data after accepting sections
		await refreshData();
		
		// Trigger FileChangesBar refresh
		if (onRefreshFileChanges) {
			onRefreshFileChanges();
		}
	};

	// Show bar if there are files with changes OR if there are diff sections in current file
	const shouldShow = filesWithChanges.length > 0 || isVisible;
	
	if (!shouldShow) {
		return null;
	}

	const totalDiffs = diffSections.length;
	const currentDiff = currentDiffIndex + 1;

	// Helper function to find next file with changes
	const findNextFileWithChanges = async (): Promise<number> => {
		// Since filesWithChanges already contains files that have changes,
		// we can just return the first one that's not the current file
		for (let i = 0; i < filesWithChanges.length; i++) {
			const fileIndex = (currentFileIndex + 1 + i) % filesWithChanges.length;
			// Skip the current file if it has a valid index
			if (currentFileIndex >= 0 && fileIndex === currentFileIndex) {
				continue;
			}
			return fileIndex;
		}
		return -1; // No other files found
	};

	const navigateToNextFileWithChanges = async () => {
		const nextFileIndex = await findNextFileWithChanges();
		if (nextFileIndex >= 0) {
			const file = filesWithChanges[nextFileIndex];
			await editorService.openEditor({ resource: file.uri });
		}
	};

	return (
		<div className="erdos-ai-auto-accept-floating-bar">
			{totalDiffs === 0 && filesWithChanges.length > 0 ? (
				// Show "Review next file" when there are files with changes but no diff sections in current file
				<div 
					className="erdos-ai-auto-accept-review-file-button"
					onClick={navigateToNextFileWithChanges}
					title="Navigate to next file with changes"
				>
					<span>Review next file</span>
					<span className="codicon codicon-chevron-right"></span>
				</div>
			) : totalDiffs > 0 ? (
				// Show normal diff navigation when there are diff sections
				<>
					<div className="erdos-ai-auto-accept-main-section">
						{totalDiffs > 1 && (
							<>
								<button 
									className="erdos-ai-auto-accept-nav-button"
									onClick={navigateToPreviousDiff}
									title="Previous change"
								>
									<span className="codicon codicon-chevron-up"></span>
								</button>
								<span className="erdos-ai-auto-accept-counter">
									{currentDiff} / {totalDiffs}
								</span>
								<button 
									className="erdos-ai-auto-accept-nav-button"
									onClick={navigateToNextDiff}
									title="Next change"
								>
									<span className="codicon codicon-chevron-down"></span>
								</button>
							</>
						)}
						
						<div className="erdos-ai-auto-accept-actions">
							<button 
								className="erdos-ai-auto-accept-undo-button"
								onClick={handleUndo}
								title="Reject all changes in this file"
							>
								Undo
							</button>
							<button 
								className="erdos-ai-auto-accept-keep-button"
								onClick={handleKeep}
								title="Accept all changes in this file"
							>
								Keep
							</button>
						</div>
					</div>
					
					{filesWithChanges.length > 1 && (
						<div className="erdos-ai-auto-accept-file-section">
							<button 
								className="erdos-ai-auto-accept-nav-button"
								onClick={navigateToPreviousFile}
								title="Previous file"
							>
								<span className="codicon codicon-chevron-left"></span>
							</button>
							<span className="erdos-ai-auto-accept-counter">
								{currentFileIndex + 1} / {filesWithChanges.length}
							</span>
							<button 
								className="erdos-ai-auto-accept-nav-button"
								onClick={navigateToNextFile}
								title="Next file"
							>
								<span className="codicon codicon-chevron-right"></span>
							</button>
						</div>
					)}
				</>
			) : null}
		</div>
	);
};
