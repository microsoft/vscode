/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useMemo, useState } from 'react';
import { IErdosAiServiceCore } from '../../../../services/erdosAi/common/erdosAiServiceCore.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { Conversation } from '../../../../services/erdosAi/common/conversationTypes.js';
import { ImageAttachmentToolbar } from './imageAttachmentToolbar.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { DraggedEditorIdentifier } from '../../../../browser/dnd.js';
import { DataTransfers } from '../../../../../base/browser/dnd.js';

interface MessageInputProps {
	inputValue: string;
	isAiProcessing: boolean;
	currentConversation: Conversation | null;
	erdosAiService: IErdosAiServiceCore;
	fileDialogService?: IFileDialogService;
	erdosPlotsService?: any;
	onInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
	onKeyPress: (event: React.KeyboardEvent) => void;
	onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
	onSendMessage: () => void;
	onCancelStreaming: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
	inputValue,
	isAiProcessing,
	currentConversation,
	erdosAiService,
	fileDialogService,
	erdosPlotsService,
	onInputChange,
	onKeyPress,
	onPaste,
	onSendMessage,
	onCancelStreaming
}) => {
	const services = useErdosReactServicesContext();
	const [dragOver, setDragOver] = useState(false);
	
	// Editor tab drag and drop support
	const editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();

	// Memoize image attachment component to avoid complex IIFE in JSX
	const imageAttachmentComponent = useMemo(() => {
		if (!fileDialogService) {
			return (
				<button 
					className="image-attachment-button"
					disabled
					title="File dialog service not available"
				>
					<span className="codicon codicon-graph"></span>
				</button>
			);
		}
		
		if (!currentConversation) {
			return (
				<button 
					className="image-attachment-button"
					onClick={async () => {
						try {
							await erdosAiService.newConversation();
						} catch (error) {
							console.error('Failed to create conversation:', error);
						}
					}}
					title="Create conversation to attach images"
				>
					<span className="codicon codicon-graph"></span>
				</button>
			);
		}
		
		const imageService = services.imageAttachmentService;
		if (!imageService) {
			console.error('Image service should be available when conversation exists');
			return (
				<button 
					className="image-attachment-button"
					disabled
					title="Image service unavailable"
				>
					<span className="codicon codicon-graph"></span>
				</button>
			);
		}

		return (
			<ImageAttachmentToolbar
				key={`image-attachment-${currentConversation.info.id}`}
				imageAttachmentService={imageService}
				fileDialogService={fileDialogService!}
				erdosPlotsService={erdosPlotsService}
				onError={(message) => {
					console.error('Image attachment error:', message);
				}}
			/>
		);
	}, [fileDialogService, currentConversation, services.imageAttachmentService, erdosAiService, erdosPlotsService]);

	// Drag and drop handlers for the search input area
	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		
		// Check if we have editor data
		if (editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
			setDragOver(true);
			e.dataTransfer.dropEffect = 'copy';
		}
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		
		// Only clear drag over if we're actually leaving the drop zone
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const isLeavingDropZone = (
			e.clientX < rect.left ||
			e.clientX > rect.right ||
			e.clientY < rect.top ||
			e.clientY > rect.bottom
		);
		
		if (isLeavingDropZone) {
			setDragOver(false);
		}
	};

	const handleDrop = async (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setDragOver(false);

		try {
			// Check for plot drops first
			const plotData = e.dataTransfer.getData(DataTransfers.PLOTS);
			if (plotData) {
				try {
					const plot = JSON.parse(plotData);
					
					if (plot.uri && services.imageAttachmentService) {
						// Convert plot to image attachment using the existing image attachment service
						await handlePlotAsImageAttachment(plot);
					}
				} catch (parseError) {
					console.error('Failed to parse plot data:', parseError);
				}
				return; // Exit early after handling plot
			}

			// Check for editor tab drops
			if (editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
				const draggedEditors = editorTransfer.getData(DraggedEditorIdentifier.prototype);
				
				if (draggedEditors && Array.isArray(draggedEditors) && services.contextService) {
					for (const draggedEditor of draggedEditors) {
						const editorInput = draggedEditor.identifier.editor;
						
						if (editorInput.resource) {
							await services.contextService.addFileContext(editorInput.resource);
						}
					}
				}
			}
		} catch (error) {
			console.error('Failed to handle drop:', error);
		}
	};

	// Helper function to convert plot to image attachment
	const handlePlotAsImageAttachment = async (plot: any) => {
		if (!services.imageAttachmentService) {
			return;
		}

		try {
			// For data URIs, we need to convert them to a File object
			if (plot.uri.startsWith('data:')) {
				// Extract mime type and base64 data
				const matches = plot.uri.match(/^data:([^;]+);base64,(.+)$/);
				if (matches) {
					const mimeType = matches[1];
					const base64Data = matches[2];
					
					// Convert base64 to blob
					const byteCharacters = atob(base64Data);
					const byteNumbers = new Array(byteCharacters.length);
					for (let i = 0; i < byteCharacters.length; i++) {
						byteNumbers[i] = byteCharacters.charCodeAt(i);
					}
					const byteArray = new Uint8Array(byteNumbers);
					const blob = new Blob([byteArray], { type: mimeType });
					
					// Create a File object from the blob
					const fileName = `plot-${plot.id}.${mimeType.split('/')[1] || 'png'}`;
					const file = new File([blob], fileName, { type: mimeType });
					
					// Attach the file as an image
					await services.imageAttachmentService.attachImageFromFile(file);
				}
			}
		} catch (error) {
			console.error('Failed to convert plot to image attachment:', error);
		}
	};

	return (
		<div 
			className={`erdos-ai-input-part ${dragOver ? 'drag-over' : ''}`}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<div className="erdos-ai-input-and-side-toolbar">
				<div className="erdos-ai-input-container">
					<div className="erdos-ai-editor-container">
						<textarea
							className="erdos-ai-input"
							placeholder="Ask Erdos anything..."
							value={inputValue}
							onChange={onInputChange}
							onKeyDown={onKeyPress}
							onPaste={onPaste}
							rows={1}
						/>
					</div>
					<div className="erdos-ai-input-toolbars">
						<div className="image-attachment-wrapper">
							{imageAttachmentComponent}
						</div>
						{inputValue.trim() ? (
							<button
								className="erdos-ai-send-button"
								onClick={onSendMessage}
								title="Send message (will stop current operation if needed)"
							>
								<span className="codicon codicon-send"></span>
							</button>
						) : isAiProcessing ? (
							<button
								className="erdos-ai-stop-button"
								onClick={() => {
									onCancelStreaming();
								}}
								title="Stop generation"
							>
								<span className="codicon codicon-primitive-square"></span>
							</button>
						) : (
							<button
								className="erdos-ai-send-button"
								onClick={onSendMessage}
								disabled={true}
								title="Enter a message to send"
							>
								<span className="codicon codicon-send"></span>
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
