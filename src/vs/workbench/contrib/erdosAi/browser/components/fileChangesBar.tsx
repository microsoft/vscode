/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { IFileChangeTracker } from '../../../../services/erdosAi/common/fileChangeTracker.js';
import { URI } from '../../../../../base/common/uri.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { Conversation } from '../../../../services/erdosAi/common/conversationTypes.js';

interface FileChangeInfo {
	filePath: string;
	fileName: string;
	addedLines: number;
	deletedLines: number;
	uri: URI;
}

interface FileChangesBarProps {
	fileChangeTracker: IFileChangeTracker;
	currentConversation: Conversation | null;
	onFileClick?: (uri: URI) => void;
	refreshTrigger?: number; // External trigger to force refresh
}

export const FileChangesBar: React.FC<FileChangesBarProps> = ({
	fileChangeTracker,
	currentConversation,
	onFileClick,
	refreshTrigger
}) => {
	const services = useErdosReactServicesContext();
	const [isExpanded, setIsExpanded] = useState(false);
	const [trackedFiles, setTrackedFiles] = useState<FileChangeInfo[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	// Load tracked files when component mounts or conversation changes (no interval refresh)
	useEffect(() => {
		const loadTrackedFiles = async () => {
			try {
				setIsLoading(true);
				const files = await fileChangeTracker.getTrackedFilesWithChanges();
				setTrackedFiles(files);
			} catch (error) {
				console.error('[FileChangesBar] Failed to load tracked files:', error);
				setTrackedFiles([]);
			} finally {
				setIsLoading(false);
			}
		};

		loadTrackedFiles();
	}, [fileChangeTracker, currentConversation?.info.id, refreshTrigger]);

	// Don't render if there are no tracked files
	if (isLoading || trackedFiles.length === 0) {
		return null;
	}

	const handleHeaderClick = () => {
		setIsExpanded(!isExpanded);
	};

	const handleFileClick = (file: FileChangeInfo) => {
		if (onFileClick) {
			onFileClick(file.uri);
		}
	};

	const getFileIcon = (file: FileChangeInfo) => {
		// Get icon classes using VSCode's system (exactly like context items)
		const iconClasses = getIconClasses(
			services.modelService,
			services.languageService,
			file.uri,
			FileKind.FILE
		);
		
		// Create VSCode-compatible icon structure (exactly like context items)
		return (
			<div 
				className={`monaco-icon-label ${iconClasses.join(' ')}`}
			>
				<div className="monaco-icon-label-container">
					<span className="monaco-icon-name-container">
						<span className="label-name">{file.fileName}</span>
					</span>
				</div>
			</div>
		);
	};

	const totalFiles = trackedFiles.length;
	const fileText = totalFiles === 1 ? 'file' : 'files';

	return (
		<div className="erdos-ai-file-changes-bar show-file-icons">
			<div 
				className="file-changes-header"
				onClick={handleHeaderClick}
				title={`${totalFiles} ${fileText} have been edited and not yet accepted`}
			>
				<span className={`codicon codicon-chevron-${isExpanded ? 'down' : 'right'}`}></span>
				<span className="mode-label-text">
					{totalFiles} {fileText} edited
				</span>
			</div>

			{isExpanded && (
				<div className="file-changes-list">
				{trackedFiles.map((file, index) => {
					const fileIcon = getFileIcon(file);
					return (
						<div 
							key={`${file.filePath}-${index}`}
							className="file-changes-item"
							onClick={() => handleFileClick(file)}
							title={`Click to open ${file.fileName}`}
						>
							<span className="context-item-icon">
								{fileIcon}
							</span>
							<span className="file-name">{file.fileName}</span>
							<div className="file-changes-stats">
								{file.addedLines > 0 && (
									<span className="added-lines">+{file.addedLines}</span>
								)}
								{file.deletedLines > 0 && (
									<span className="deleted-lines">-{file.deletedLines}</span>
								)}
							</div>
						</div>
					);
				})}
				</div>
			)}
		</div>
	);
};
