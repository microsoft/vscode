/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';

interface SortIndicatorProps {
	ascending?: boolean;
	priority?: number;
	visible: boolean;
}

export const SortIndicator: React.FC<SortIndicatorProps> = ({ ascending, priority, visible }) => {

	
	if (!visible) {

		return null;
	}

	return (
		<div className="sort-indicator">
			<span className={`sort-arrow ${ascending ? 'ascending' : 'descending'} codicon ${ascending ? 'codicon-triangle-up' : 'codicon-triangle-down'}`}>
			</span>
		</div>
	);
};

