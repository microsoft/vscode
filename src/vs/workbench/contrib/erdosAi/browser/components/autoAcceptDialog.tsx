/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';
import { AutoAcceptCheckResult } from '../../../../services/erdosAiAutomation/common/autoAcceptService.js';

interface AutoAcceptDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onAccept: () => void;
	onDeny: () => void;
	checkResult: AutoAcceptCheckResult;
	commandType: 'console' | 'terminal' | 'file';
	command: string;
	onAddToAllowList?: (functionName: string) => void;
	onAddToDenyList?: (functionName: string) => void;
}

/**
 * Dialog for reviewing functions and accepting/denying auto-accept for commands
 * Shows the functions that will be executed and allows user to accept, deny, or modify allow lists
 */
export const AutoAcceptDialog: React.FC<AutoAcceptDialogProps> = ({
	isOpen,
	onClose,
	onAccept,
	onDeny,
	checkResult,
	commandType,
	command,
	onAddToAllowList,
	onAddToDenyList
}) => {
	const dialogRef = useRef<HTMLDivElement>(null);
	const [selectedFunctions, setSelectedFunctions] = useState<Set<string>>(new Set());

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleEscape);
			return () => {
				document.removeEventListener('mousedown', handleClickOutside);
				document.removeEventListener('keydown', handleEscape);
			};
		}
		
		return undefined;
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	const { functionsFound, allowedFunctions, deniedFunctions, reason, shouldAutoAccept } = checkResult;

	const toggleFunctionSelection = (functionName: string) => {
		const newSelected = new Set(selectedFunctions);
		if (newSelected.has(functionName)) {
			newSelected.delete(functionName);
		} else {
			newSelected.add(functionName);
		}
		setSelectedFunctions(newSelected);
	};

	const handleAddSelectedToAllowList = () => {
		if (onAddToAllowList) {
			selectedFunctions.forEach(func => onAddToAllowList(func));
		}
		setSelectedFunctions(new Set());
	};

	const handleAddSelectedToDenyList = () => {
		if (onAddToDenyList) {
			selectedFunctions.forEach(func => onAddToDenyList(func));
		}
		setSelectedFunctions(new Set());
	};

	const getCommandTypeLabel = () => {
		switch (commandType) {
			case 'console': return 'R Console Command';
			case 'terminal': return 'Terminal Command';
			case 'file': return 'File Operation';
			default: return 'Command';
		}
	};

	const getStatusColor = () => {
		if (shouldAutoAccept) return '#28a745'; // Green
		if (deniedFunctions.length > 0) return '#dc3545'; // Red
		return '#ffc107'; // Yellow for unknown functions
	};

	const getStatusIcon = () => {
		if (shouldAutoAccept) return '✓';
		if (deniedFunctions.length > 0) return '✗';
		return '⚠';
	};

	return (
		<div className="auto-accept-dialog-overlay">
			<div ref={dialogRef} className="auto-accept-dialog">
				<div className="auto-accept-dialog-header">
					<h3>{getCommandTypeLabel()} Review</h3>
					<button 
						className="close-button" 
						onClick={onClose}
						title="Close"
					>
						×
					</button>
				</div>
				
				<div className="auto-accept-dialog-content">
					{/* Status indicator */}
					<div className="status-section">
						<div className="status-indicator" style={{ color: getStatusColor() }}>
							<span className="status-icon">{getStatusIcon()}</span>
							<span className="status-text">{reason}</span>
						</div>
					</div>

					{/* Command preview */}
					<div className="command-section">
						<h4>Command to Execute:</h4>
						<div className="command-preview">
							<code>{command}</code>
						</div>
					</div>

					{/* Functions analysis */}
					{functionsFound.length > 0 && (
						<div className="functions-section">
							<h4>Functions Found ({functionsFound.length}):</h4>
							<div className="functions-grid">
								{functionsFound.map((func: string) => {
									const isAllowed = allowedFunctions.includes(func);
									const isDenied = deniedFunctions.includes(func);
									const isSelected = selectedFunctions.has(func);
									
									let statusClass = '';
									let statusText = '';
									if (isDenied) {
										statusClass = 'function-denied';
										statusText = 'DENIED';
									} else if (isAllowed) {
										statusClass = 'function-allowed';
										statusText = 'ALLOWED';
									} else {
										statusClass = 'function-unknown';
										statusText = 'UNKNOWN';
									}

									return (
										<div
											key={func}
											className={`function-item ${statusClass} ${isSelected ? 'selected' : ''}`}
											onClick={() => toggleFunctionSelection(func)}
										>
											<div className="function-name">{func}</div>
											<div className="function-status">{statusText}</div>
										</div>
									);
								})}
							</div>

							{/* Function list management */}
							{commandType === 'console' && selectedFunctions.size > 0 && (
								<div className="function-actions">
									<p>Selected {selectedFunctions.size} function(s):</p>
									<div className="action-buttons">
										<button 
											className="add-to-allow-button"
											onClick={handleAddSelectedToAllowList}
											disabled={!onAddToAllowList}
										>
											Add to Allow List
										</button>
										<button 
											className="add-to-deny-button"
											onClick={handleAddSelectedToDenyList}
											disabled={!onAddToDenyList}
										>
											Add to Deny List
										</button>
									</div>
								</div>
							)}
						</div>
					)}

					{/* No functions found */}
					{functionsFound.length === 0 && (
						<div className="no-functions-section">
							<p>No function calls detected in this command.</p>
						</div>
					)}
				</div>
				
				<div className="auto-accept-dialog-footer">
					<button 
						type="button"
						className="deny-button" 
						onClick={onDeny}
					>
						Deny
					</button>
					<button 
						type="button"
						className={`accept-button ${shouldAutoAccept ? 'auto-accept' : ''}`}
						onClick={onAccept}
					>
						{shouldAutoAccept ? 'Auto-Accept ✓' : 'Accept Manually'}
					</button>
				</div>
			</div>
		</div>
	);
};

