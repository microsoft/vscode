/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';

interface DraggableBottomBorderProps {
	height: number;
	setHeight: React.Dispatch<React.SetStateAction<number>>;
}

export const DraggableBottomBorder: React.FC<DraggableBottomBorderProps> = ({ height, setHeight }) => {
	const handleMouseDown = (e: React.MouseEvent) => {
		const startY = e.clientY;
		const startHeight = height;

		const handleMouseMove = (e: MouseEvent) => {
			const newHeight = startHeight + (e.clientY - startY);
			setHeight(newHeight);
		};

		const handleMouseUp = () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	};

	return (
		<div
			className='file-editor-draggable-border'
			onMouseDown={handleMouseDown}
		></div>
	);
};
