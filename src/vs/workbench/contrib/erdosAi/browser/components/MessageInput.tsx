/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useMemo } from 'react';
import { IErdosAiServiceCore } from '../../../../services/erdosAi/common/erdosAiServiceCore.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { Conversation } from '../../../../services/erdosAi/common/conversationTypes.js';
import { ImageAttachmentToolbar } from './imageAttachmentToolbar.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

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

	return (
		<div className="erdos-ai-input-part">
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
