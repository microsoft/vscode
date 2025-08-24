/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';
import { PlotsIcon } from './plotsIcon.js';
import { IAttachedImage, IImageAttachmentService } from '../attachments/imageAttachmentService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IErdosPlotsService } from '../../../../services/erdosPlots/common/erdosPlots.js';

interface ImageAttachmentToolbarProps {
	imageAttachmentService: IImageAttachmentService;
	fileDialogService: IFileDialogService;
	erdosPlotsService?: IErdosPlotsService;
	onError: (message: string) => void;
}

interface AttachedImageDisplayProps {
	image: IAttachedImage;
	onRemove: (imageId: string) => void;
}

/**
 * Display component for an attached image
 */
const AttachedImageDisplay: React.FC<AttachedImageDisplayProps> = ({ image, onRemove }) => {
	const handleRemove = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onRemove(image.id);
	};

	const getDisplayName = () => {
		if (image.filename.length > 20) {
			return image.filename.substring(0, 17) + '...';
		}
		return image.filename;
	};

	const getIcon = () => {
		if (image.mimeType.startsWith('image/svg')) {
			return (
				<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#555' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
					<rect x='3' y='3' width='18' height='18' rx='2' ry='2'/>
					<circle cx='8.5' cy='8.5' r='1.5'/>
					<path d='M21 15l-5-5L5 21'/>
				</svg>
			);
		} else {
			return (
				<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#555' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
					<rect x='3' y='3' width='18' height='18' rx='2' ry='2'/>
					<circle cx='8.5' cy='8.5' r='1.5'/>
					<path d='M21 15l-5-5L5 21'/>
				</svg>
			);
		}
	};

	return (
		<div className="erdos-ai-attached-image">
			<span className="attached-image-icon">{getIcon()}</span>
			<span className="attached-image-name" title={image.filename}>
				{getDisplayName()}
			</span>
			<button 
				className="attached-image-remove"
				onClick={handleRemove}
				title="Remove image"
				aria-label="Remove image"
			>
				×
			</button>
		</div>
	);
};

/**
 * Image attachment toolbar for Erdos AI
 * Provides functionality to attach images and plots, similar to Rao's implementation
 */
export const ImageAttachmentToolbar: React.FC<ImageAttachmentToolbarProps> = ({
	imageAttachmentService,
	fileDialogService,
	erdosPlotsService,
	onError
}) => {
	const [attachedImages, setAttachedImages] = useState<IAttachedImage[]>([]);
	const [showPlotsMenu, setShowPlotsMenu] = useState(false);
	const [availablePlots, setAvailablePlots] = useState<Array<{ id: string; metadata: any }>>([]);
	const [isDragOver, setIsDragOver] = useState(false);
	
	const fileInputRef = useRef<HTMLInputElement>(null);
	const plotsButtonRef = useRef<HTMLButtonElement>(null);
	const plotsMenuRef = useRef<HTMLDivElement>(null);

	// Listen for image changes and sync state
	useEffect(() => {
		// Force initial load with spread to trigger re-render
		const initialImages = imageAttachmentService.getAttachedImages();
		setAttachedImages([...initialImages]);

		// Subscribe to changes with forced array updates
		const disposable = imageAttachmentService.onImagesChanged((images) => {
			setAttachedImages([...images]); // Force new array reference to trigger re-render
		});

		return () => disposable.dispose();
	}, [imageAttachmentService]);

	// Load available plots when plots menu is opened
	useEffect(() => {
		if (showPlotsMenu) {
			imageAttachmentService.getAvailablePlots().then(plots => {
				setAvailablePlots(plots);
			});
		}
	}, [showPlotsMenu, imageAttachmentService]);

	// Handle click outside to close plots menu
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (plotsMenuRef.current && !plotsMenuRef.current.contains(event.target as Node) &&
				plotsButtonRef.current && !plotsButtonRef.current.contains(event.target as Node)) {
				setShowPlotsMenu(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const handleImageAttach = async () => {
		try {
			const files = await fileDialogService.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: [
					{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'] }
				],
				title: 'Choose Image to Attach'
			});

			if (files && files.length > 0) {
				const filePath = files[0].fsPath;
				await imageAttachmentService.attachImage(filePath);
			}
		} catch (error) {
			onError(error instanceof Error ? error.message : 'Failed to attach image');
		}
	};

	const handlePlotsClick = () => {
		setShowPlotsMenu(!showPlotsMenu);
	};

	const handlePlotSelect = async (plotId: string) => {
		try {
			await imageAttachmentService.attachPlotFromService(plotId);
			setShowPlotsMenu(false);
		} catch (error) {
			onError(error instanceof Error ? error.message : 'Failed to attach plot');
			setShowPlotsMenu(false);
		}
	};

	const handleImageRemove = async (imageId: string) => {
		try {
			await imageAttachmentService.removeImage(imageId);
		} catch (error) {
			onError(error instanceof Error ? error.message : 'Failed to remove image');
		}
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		
		// Check if any dragged item is an image
		const hasImageFiles = Array.from(e.dataTransfer.items).some(item => 
			item.kind === 'file' && item.type.startsWith('image/')
		);
		
		if (hasImageFiles) {
			setIsDragOver(true);
		}
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	};

	const handleDrop = async (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);

		const files = Array.from(e.dataTransfer.files);
		const imageFiles = files.filter(file => file.type.startsWith('image/'));

		for (const file of imageFiles) {
			try {
				await imageAttachmentService.attachImageFromFile(file);
			} catch (error) {
				onError(error instanceof Error ? error.message : `Failed to attach ${file.name}`);
				break; // Stop on first error to avoid spam
			}
		}
	};

	const handlePaste = async (e: ClipboardEvent) => {
		if (e.clipboardData) {
			const items = Array.from(e.clipboardData.items);
			const imageItems = items.filter(item => item.kind === 'file' && item.type.startsWith('image/'));

			for (const item of imageItems) {
				const file = item.getAsFile();
				if (file) {
					try {
						await imageAttachmentService.attachImageFromFile(file);
						e.preventDefault(); // Prevent default paste behavior
					} catch (error) {
						onError(error instanceof Error ? error.message : `Failed to attach pasted image`);
						break;
					}
				}
			}
		}
	};

	// Set up paste listener
	useEffect(() => {
		document.addEventListener('paste', handlePaste);
		return () => document.removeEventListener('paste', handlePaste);
	}, [imageAttachmentService]);

	return (
		<div 
			className={`erdos-ai-image-toolbar ${isDragOver ? 'drag-over' : ''}`}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			{/* Attached images display */}
			{attachedImages.length > 0 && (
				<div className="attached-images-container">
					{attachedImages.map(image => (
						<AttachedImageDisplay
							key={image.id}
							image={image}
							onRemove={handleImageRemove}
						/>
					))}
				</div>
			)}

			{/* Attachment buttons */}
			<div className="image-attachment-buttons">
				<button
					className="erdos-ai-image-attach-button"
					onClick={handleImageAttach}
					title="Attach image file"
					disabled={attachedImages.length >= 3}
				>
					<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
						<rect x='3' y='3' width='18' height='18' rx='2' ry='2'/>
						<circle cx='8.5' cy='8.5' r='1.5'/>
						<path d='M21 15l-5-5L5 21'/>
					</svg>
				</button>

				{erdosPlotsService && (
					<button
						ref={plotsButtonRef}
						className="erdos-ai-plots-attach-button"
						onClick={handlePlotsClick}
						title="Attach plot from plots pane"
						disabled={attachedImages.length >= 3}
					>
						<PlotsIcon width={16} height={16} />
					</button>
				)}

				{/* Plots menu */}
				{showPlotsMenu && (
					<div ref={plotsMenuRef} className="plots-attachment-menu">
						<div className="plots-menu-header">Available Plots</div>
						{availablePlots.length === 0 ? (
							<div className="plots-menu-empty">No plots available</div>
						) : (
							<div className="plots-menu-items">
								{availablePlots.map(plot => (
									<button
										key={plot.id}
										className="plots-menu-item"
										onClick={() => handlePlotSelect(plot.id)}
									>
										<PlotsIcon width={14} height={14} />
										<span>Plot {plot.id}</span>
									</button>
								))}
							</div>
						)}
					</div>
				)}
			</div>

			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				style={{ display: 'none' }}
				onChange={async (e) => {
					const file = e.target.files?.[0];
					if (file) {
						try {
							await imageAttachmentService.attachImageFromFile(file);
						} catch (error) {
							onError(error instanceof Error ? error.message : 'Failed to attach image');
						}
					}
				}}
			/>
		</div>
	);
};

