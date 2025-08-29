/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useCallback } from 'react';

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






