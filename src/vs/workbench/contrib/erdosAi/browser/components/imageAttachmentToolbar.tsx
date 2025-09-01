/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';

import { IAttachedImage, IImageAttachmentService } from '../../../../services/erdosAiMedia/common/imageAttachmentService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IErdosPlotsService } from '../../../../services/erdosPlots/common/erdosPlots.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';

interface ImageAttachmentToolbarProps {
	imageAttachmentService: IImageAttachmentService;
	fileDialogService: IFileDialogService;
	erdosPlotsService?: IErdosPlotsService;
	onError: (message: string) => void;
}

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
	const [showImageViewer, setShowImageViewer] = useState(false);
	const [availablePlots, setAvailablePlots] = useState<Array<{ id: string; metadata: any }>>([]);
	const [isDragOver, setIsDragOver] = useState(false);
	
	const fileInputRef = useRef<HTMLInputElement>(null);
	const plotsButtonRef = useRef<HTMLButtonElement>(null);
	const plotsMenuRef = useRef<HTMLDivElement>(null);
	const countButtonRef = useRef<HTMLButtonElement>(null);
	const imageViewerRef = useRef<HTMLDivElement>(null);

	// Listen for image changes and sync state
	useEffect(() => {
		// Force initial load with spread to trigger re-render
		const initialImages = imageAttachmentService.getAttachedImages();
		setAttachedImages([...initialImages]);

		// Subscribe to changes with forced array updates
		const disposable = imageAttachmentService.onImagesChanged((images) => {
			setAttachedImages([...images]); // Force new array reference to trigger re-render
			// Hide image viewer if no images left
			if (images.length === 0) {
				setShowImageViewer(false);
			}
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

	// Handle click outside to close menus
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			// Close plots menu
			if (plotsMenuRef.current && !plotsMenuRef.current.contains(event.target as Node) &&
				plotsButtonRef.current && !plotsButtonRef.current.contains(event.target as Node)) {
				setShowPlotsMenu(false);
			}
			// Close image viewer
			if (imageViewerRef.current && !imageViewerRef.current.contains(event.target as Node) &&
				countButtonRef.current && !countButtonRef.current.contains(event.target as Node)) {
				setShowImageViewer(false);
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

	// Position image viewer popup to avoid clipping
	useEffect(() => {
		if (showImageViewer && imageViewerRef.current && countButtonRef.current) {
			const buttonRect = countButtonRef.current.getBoundingClientRect();
			const popup = imageViewerRef.current;
			const popupWidth = popup.offsetWidth; // Remove forced minimum width
			
			// Calculate left position to prevent overflow
			let leftPosition = buttonRect.left;
			const rightEdge = leftPosition + popupWidth;
			const windowWidth = window.innerWidth;
			
			// If popup would extend beyond the right edge, adjust position
			if (rightEdge > windowWidth) {
				// Align right edge of popup with right edge of button
				leftPosition = buttonRect.right - popupWidth;
				// If that would push it off the left edge, align with left edge of viewport
				if (leftPosition < 0) {
					leftPosition = 8; // Small margin from edge
				}
			}
			
			// Use fixed positioning
			popup.style.position = 'fixed';
			popup.style.top = `${buttonRect.top - popup.offsetHeight - 8}px`;
			popup.style.left = `${leftPosition}px`;
		}
	}, [showImageViewer, attachedImages.length]);

	// Set up paste listener
	useEffect(() => {
		document.addEventListener('paste', handlePaste);
		return () => document.removeEventListener('paste', handlePaste);
	}, [imageAttachmentService]);

	const imageCount = attachedImages.length;

	return (
		<div 
			className={`image-attachment-button-container ${isDragOver ? 'drag-over' : ''}`}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			{/* Image attachment icon */}
				<button
					className="image-attachment-button"
					onClick={handleImageAttach}
					title="Attach image"
					disabled={attachedImages.length >= 3}
				>
					<span className="codicon codicon-graph"></span>
				</button>

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

			{/* Image count display */}
			{imageCount > 0 && (
				<div className="image-attachment-count">
					<button
						ref={countButtonRef}
						className="image-count-button"
						onClick={() => setShowImageViewer(!showImageViewer)}
						title={`${imageCount} image(s) attached`}
					>
						<span className="image-count-text">{imageCount} image{imageCount !== 1 ? 's' : ''} attached</span>
						<span className={`image-count-chevron ${ThemeIcon.asClassName(showImageViewer ? Codicon.chevronDown : Codicon.chevronUp)}`} />
					</button>

					{/* Image viewer popup */}
					{showImageViewer && (
						<div ref={imageViewerRef} className="image-viewer-popup">
							{attachedImages.map((image) => (
								<div key={image.id} className="attached-image-item">
									<div className="image-container">
										<img
											src={`data:${image.mimeType};base64,${image.base64Data}`}
											alt={image.filename}
											className="attached-image-large"
										/>
										<div className="image-overlay">
											<div className="image-overlay-content">
												<span className="image-filename">{image.filename}</span>
												<button
													className="image-trash-button"
													onClick={() => handleImageRemove(image.id)}
													title="Remove image"
												>
													<span className={ThemeIcon.asClassName(Codicon.trash)} />
												</button>
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* Plots button (if service available) */}
			{erdosPlotsService && (
				<>
					<button
						ref={plotsButtonRef}
						className="image-attachment-button"
						onClick={handlePlotsClick}
						title="Attach plot from plots pane"
						disabled={attachedImages.length >= 3}
					>
						<span className="codicon codicon-graph"></span>
					</button>

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
											<span className="codicon codicon-graph"></span>
											<span>Plot {plot.id}</span>
										</button>
									))}
								</div>
							)}
						</div>
					)}
				</>
			)}
		</div>
	);
};

