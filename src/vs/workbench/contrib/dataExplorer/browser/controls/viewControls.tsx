/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useCallback, useState } from 'react';

export interface FontSizeControlsProps {
	fontSize: number;
	onFontSizeChange: (newSize: number) => void;
	className?: string;
	minFontSize?: number;
	maxFontSize?: number;
}

/**
 * Font Size Controls for the Data Explorer
 * Provides buttons for increasing/decreasing font size and text input for custom font size
 */
export const FontSizeControls: React.FC<FontSizeControlsProps> = ({
	fontSize,
	onFontSizeChange,
	className,
	minFontSize = 1,
	maxFontSize = 128
}) => {
	const [inputValue, setInputValue] = useState(fontSize.toString());

	const handleIncrease = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const newSize = Math.min(fontSize + 1, maxFontSize);
		onFontSizeChange(newSize);
	}, [fontSize, onFontSizeChange, maxFontSize]);

	const handleDecrease = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const newSize = Math.max(fontSize - 1, minFontSize);
		onFontSizeChange(newSize);
	}, [fontSize, onFontSizeChange, minFontSize]);

	const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		setInputValue(e.target.value);
	}, []);

	const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			const newSize = parseInt(inputValue, 10);
			if (!isNaN(newSize) && newSize >= minFontSize && newSize <= maxFontSize) {
				onFontSizeChange(newSize);
			} else {
				setInputValue(fontSize.toString());
			}
		} else if (e.key === 'Escape') {
			setInputValue(fontSize.toString());
			(e.target as HTMLInputElement).blur();
		}
	}, [inputValue, fontSize, onFontSizeChange, minFontSize, maxFontSize]);

	const handleInputBlur = useCallback(() => {
		const newSize = parseInt(inputValue, 10);
		if (!isNaN(newSize) && newSize >= minFontSize && newSize <= maxFontSize) {
			onFontSizeChange(newSize);
		} else {
			setInputValue(fontSize.toString());
		}
	}, [inputValue, fontSize, onFontSizeChange, minFontSize, maxFontSize]);

	// Update input value when fontSize prop changes
	React.useEffect(() => {
		setInputValue(fontSize.toString());
	}, [fontSize]);

	const canIncrease = fontSize < maxFontSize;
	const canDecrease = fontSize > minFontSize;

	const handleReset = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onFontSizeChange(12); // Reset to 12pt
	}, [onFontSizeChange]);

	return (
		<div className={`font-size-controls ${className || ''}`}>
				<div className="action-item">
					<span 
						className="action-label codicon codicon-text-size"
						onClick={handleReset}
						title="Reset font size to 12pt"
						role="button"
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								handleReset(e as any);
							}
						}}
					/>
				</div>
				
				<div className="action-item font-size-input-container">
					<input
						type="text"
						className="font-size-input"
						value={inputValue}
						onChange={handleInputChange}
						onKeyDown={handleInputKeyDown}
						onBlur={handleInputBlur}
						title={`Font size (${minFontSize}-${maxFontSize})`}
						aria-label={`Font size (${minFontSize}-${maxFontSize})`}
						size={3}
					/>
					<div className="font-size-chevrons">
						<span 
							className="chevron-up codicon codicon-chevron-up"
							onClick={handleIncrease}
							title="Increase font size"
							style={{ opacity: canIncrease ? 1 : 0.4, pointerEvents: canIncrease ? 'auto' : 'none' }}
						/>
						<span 
							className="chevron-down codicon codicon-chevron-down"
							onClick={handleDecrease}
							title="Decrease font size"
							style={{ opacity: canDecrease ? 1 : 0.4, pointerEvents: canDecrease ? 'auto' : 'none' }}
						/>
					</div>
				</div>
		</div>
	);
};

export interface WrapTextButtonProps {
	onWrapText: () => void;
	className?: string;
	showLabel?: boolean;
}

/**
 * Wrap Text button control for the Data Explorer
 * Provides button for wrapping text in selected cells
 */
export const WrapTextButton: React.FC<WrapTextButtonProps> = ({
	onWrapText,
	className,
	showLabel = true
}) => {
	
	const handleWrapText = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onWrapText();
	}, [onWrapText]);

	const tooltip = 'Wrap text in selection';

	return (
		<div className={`wrap-text-button-container ${className || ''}`}>
			<button
				className="wrap-text-button"
				onClick={handleWrapText}
				title={tooltip}
				aria-label={tooltip}
			>
				<span className="codicon codicon-word-wrap" aria-hidden="true"></span>
				{showLabel && <span className="button-label">Wrap Text</span>}
			</button>
		</div>
	);
};

export interface PlaintextButtonProps {
	onOpenAsPlaintext: () => void;
	className?: string;
}

/**
 * Plaintext button control for the Data Explorer
 * Provides icon for opening current file as plaintext
 */
export const PlaintextButton: React.FC<PlaintextButtonProps> = ({
	onOpenAsPlaintext,
	className
}) => {
	
	const handleClick = () => {
		onOpenAsPlaintext();
	};

	return (
		<div className="action-item">
			<span 
				className={`action-label codicon codicon-go-to-file ${className || ''}`}
				onClick={handleClick}
				title="Open as plaintext"
				role="button"
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						handleClick();
					}
				}}
			/>
		</div>
	);
};
