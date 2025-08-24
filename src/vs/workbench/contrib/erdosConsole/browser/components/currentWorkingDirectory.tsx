/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './currentWorkingDirectory.css';

import React, { MouseEvent, useEffect, useRef, useState } from 'react';

import { localize } from '../../../../../nls.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { CustomContextMenuItem } from '../../../../browser/erdosComponents/customContextMenu/customContextMenuItem.js';
import { useErdosActionBarContext } from '../../../../../platform/erdosActionBar/browser/erdosActionBarContext.js';
import { CustomContextMenuEntry, showCustomContextMenu } from '../../../../browser/erdosComponents/customContextMenu/customContextMenu.js';

const erdosCurrentWorkingDirectory = localize(
	'erdosCurrentWorkingDirectory',
	"Current Working Directory"
);

interface CurrentWorkingDirectoryProps {
	readonly directoryLabel: string;
}

export const CurrentWorkingDirectory = (props: CurrentWorkingDirectoryProps) => {
	const services = useErdosReactServicesContext();
	const erdosActionBarContext = useErdosActionBarContext();

	const ref = useRef<HTMLDivElement>(undefined!);

	const [mouseInside, setMouseInside] = useState(false);

	useEffect(() => {
		if (mouseInside) {
			erdosActionBarContext.hoverManager.showHover(ref.current, props.directoryLabel);
		}
	}, [mouseInside, erdosActionBarContext.hoverManager, props.directoryLabel]);

	const mouseDownHandler = async (e: MouseEvent<HTMLElement>) => {
		e.stopPropagation();

		if (e.button === 2) {
			const entries: CustomContextMenuEntry[] = [
				new CustomContextMenuItem({
					icon: 'copy',
					label: localize('erdos.dataExplorer.copy', "Copy"),
					onSelected: async () => await services.clipboardService.writeText(
						props.directoryLabel
					)
				})
			];

			await showCustomContextMenu({
				anchorElement: ref.current,
				anchorPoint: {
					clientX: e.clientX,
					clientY: e.clientY
				},
				popupPosition: 'auto',
				popupAlignment: 'auto',
				width: 'auto',
				entries
			});
		}
	};

	return (
		<div
			ref={ref}
			aria-label={erdosCurrentWorkingDirectory}
			className='current-working-directory-label'
			onMouseDown={mouseDownHandler}
			onMouseEnter={() => {
				setMouseInside(true);
			}}
			onMouseLeave={() => {
				setMouseInside(false);
				erdosActionBarContext.hoverManager?.hideHover();
			}}
		>
			<span className='codicon codicon-folder' role='presentation' />
			<span className='label'>
				{props.directoryLabel}
			</span>
		</div>
	);
};
