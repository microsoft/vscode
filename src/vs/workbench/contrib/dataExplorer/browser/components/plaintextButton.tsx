/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';

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

