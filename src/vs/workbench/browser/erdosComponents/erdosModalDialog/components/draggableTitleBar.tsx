/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './draggableTitleBar.css';

import React, { MouseEvent } from 'react';

import * as DOM from '../../../../../base/browser/dom.js';
import { useStateRef } from '../../../../../base/browser/ui/react/useStateRef.js';

interface DraggableTitleBarProps {
	title: string;
	onStartDrag: () => void;
	onDrag: (x: number, y: number) => void;
	onStopDrag: (x: number, y: number) => void;
}

type DocumentMouseEvent = globalThis.MouseEvent;

export const DraggableTitleBar = (props: DraggableTitleBarProps) => {
	const [, setDragState, dragStateRef] = useStateRef<{
		readonly body: HTMLElement;
		readonly startingX: number;
		readonly startingY: number;
	} | undefined>(undefined);

	const mouseDownHandler = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const body = DOM.getActiveWindow().document.body;

		setDragState({
			body,
			startingX: e.clientX,
			startingY: e.clientY
		});

		props.onStartDrag();

		const mouseMoveHandler = (e: DocumentMouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			props.onDrag(
				e.clientX - dragStateRef.current!.startingX,
				e.clientY - dragStateRef.current!.startingY
			);
		};

		const mouseUpHandler = (e: DocumentMouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			dragStateRef.current!.body.removeEventListener('mousemove', mouseMoveHandler);
			dragStateRef.current!.body.removeEventListener('mouseup', mouseUpHandler);

			props.onStopDrag(
				e.clientX - dragStateRef.current!.startingX,
				e.clientY - dragStateRef.current!.startingY
			);

			setDragState(undefined);
		};

		body.addEventListener('mousemove', mouseMoveHandler, false);
		body.addEventListener('mouseup', mouseUpHandler, false);
	};

	return (
		<div className='simple-title-bar' onMouseDown={mouseDownHandler}>
			<div className='simple-title-bar-title'>
				{props.title}
			</div>
		</div>
	);
};
