/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './placeholderThumbnail.css';

// React.
import React from 'react';

interface PlaceholderThumbnailProps {
	size?: number;
}

export const PlaceholderThumbnail = (props: PlaceholderThumbnailProps) => {
	const size = props.size || 75; // Default to 75px if no size provided
	
	return (
		<div 
			className='plot-thumbnail-placeholder'
			style={{
				width: `${size}px`,
				height: `${size}px`,
				fontSize: `${Math.max(12, size * 0.25)}px` // Scale icon size with thumbnail
			}}
		>
			<span className='codicon codicon-graph' />
		</div>
	);
};

