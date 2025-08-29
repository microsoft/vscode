/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';

export interface SaveIconProps {
	isDirty?: boolean;
	isSaving?: boolean;
	onSave?: () => void;
	className?: string;
}

/**
 * Save icon component following VS Code's action label pattern
 */
export const SaveIcon: React.FC<SaveIconProps> = ({ 
	isDirty = false, 
	isSaving = false, 
	onSave, 
	className 
}) => {
	
	const handleClick = () => {
		if (!isSaving && onSave) {
			onSave();
		}
	};

	const codiconClass = isSaving ? 'codicon-loading codicon-modifier-spin' : 'codicon-save';
	const title = isSaving ? 'Saving...' : isDirty ? 'Save file (Ctrl+S)' : 'File saved';

	return (
		<div className="action-item">
			<span 
				className={`action-label codicon ${codiconClass} ${isDirty ? 'dirty' : ''} ${className || ''}`}
				onClick={handleClick}
				title={title}
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
