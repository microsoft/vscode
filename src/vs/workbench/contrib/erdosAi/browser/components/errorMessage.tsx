/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import './errorMessage.css';

export interface ErrorMessageProps {
	readonly errorMessage: string;
	readonly onClose: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ errorMessage, onClose }) => {
	return (
		<div className="error-message-container">
			<div className="message error">
				<div className="error-content">
					<div className="error-icon-text">
						<div className="error-icon">
							!
						</div>
						<div className="error-text">
							{errorMessage}
						</div>
					</div>
					<div 
						className="error-close-button"
						onClick={onClose}
						title="Dismiss"
					>
						×
					</div>
				</div>
			</div>
		</div>
	);
};










