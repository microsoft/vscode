/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './verticalSplitter.css';

import React, { PointerEvent, useEffect, useRef, useState } from 'react';

import * as DOM from '../../../dom.js';
import { Delayer } from '../../../../common/async.js';
import { useStateRef } from '../../react/useStateRef.js';
import { isMacintosh } from '../../../../common/platform.js';
import { createStyleSheet } from '../../../domStylesheets.js';
import { DisposableStore } from '../../../../common/lifecycle.js';
import { erdosClassNames } from '../../../../common/erdosUtilities.js';
import { Button, KeyboardModifiers, MouseTrigger } from '../button/button.js';
import { useErdosReactServicesContext } from '../../../erdosReactRendererContext.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

const EXPAND_COLLAPSE_BUTTON_TOP = 4;
const EXPAND_COLLAPSE_BUTTON_SIZE = 25;

type VerticalSplitterBaseProps = | {
	readonly invert?: boolean;
	readonly showSash?: boolean;
	readonly onBeginResize: () => VerticalSplitterResizeParams;
	readonly onResize: (width: number) => void;
};

type VerticalSplitterCollapseProps = | {
	readonly collapsible?: false;
	readonly isCollapsed?: never;
	readonly onCollapsedChanged?: never;
} | {
	readonly collapsible: true;
	readonly isCollapsed: boolean;
	readonly onCollapsedChanged: (collapsed: boolean) => void;
};

type VerticalSplitterProps = VerticalSplitterBaseProps & VerticalSplitterCollapseProps;

export interface VerticalSplitterResizeParams {
	readonly minimumWidth: number;
	readonly maximumWidth: number;
	readonly startingWidth: number;
}

const getSashSize = (configurationService: IConfigurationService) =>
	configurationService.getValue<number>('workbench.sash.size');

const getHoverDelay = (configurationService: IConfigurationService) =>
	configurationService.getValue<number>('workbench.sash.hoverDelay');

const isPointInsideElement = (x: number, y: number, element?: HTMLElement) => {
	if (!element) {
		return false;
	}

	const rect = element.getBoundingClientRect();
	return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
};

const calculateSplitterWidth = (
	configurationService: IConfigurationService,
	collapsible?: boolean
) => !collapsible ? 1 : getSashSize(configurationService) * 2;

const calculateSashWidth = (configurationService: IConfigurationService, collapsible?: boolean) => {
	let sashSize = getSashSize(configurationService);

	if (collapsible) {
		sashSize *= 2;
	}

	return sashSize;
};

export const VerticalSplitter = ({
	invert,
	showSash,
	collapsible,
	isCollapsed,
	onCollapsedChanged,
	onBeginResize,
	onResize,
}: VerticalSplitterProps) => {
	const services = useErdosReactServicesContext();

	const sashRef = useRef<HTMLDivElement>(undefined!);
	const expandCollapseButtonRef = useRef<HTMLButtonElement>(undefined!);

	const [splitterWidth, setSplitterWidth] = useState(
		calculateSplitterWidth(services.configurationService, collapsible)
	);
	const [sashWidth, setSashWidth] = useState(
		calculateSashWidth(services.configurationService, collapsible)
	);
	const [sashIndicatorWidth, setSashIndicatorWidth] = useState(getSashSize(services.configurationService));
	const [hoverDelay, setHoverDelay] = useState(getHoverDelay(services.configurationService));
	const [hovering, setHovering] = useState(false);
	const [highlightExpandCollapse, setHighlightExpandCollapse] = useState(false);
	const [hoveringDelayer, setHoveringDelayer] = useState<Delayer<void>>(undefined!);
	const [collapsed, setCollapsed, collapsedRef] = useStateRef(isCollapsed);
	const [resizing, setResizing] = useState(false);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(
			services.configurationService.onDidChangeConfiguration(configurationChangeEvent => {
				if (configurationChangeEvent.affectsConfiguration('workbench.sash')) {
					if (configurationChangeEvent.affectedKeys.has('workbench.sash.size')) {
						setSplitterWidth(calculateSplitterWidth(services.configurationService, collapsible));
						setSashWidth(calculateSashWidth(services.configurationService, collapsible));
						setSashIndicatorWidth(getSashSize(services.configurationService));
					}

					if (configurationChangeEvent.affectedKeys.has('workbench.sash.hoverDelay')) {
						setHoverDelay(getHoverDelay(services.configurationService));
					}
				}
			})
		);

		setHoveringDelayer(disposableStore.add(new Delayer<void>(0)));

		return () => disposableStore.dispose();
	}, [collapsible, services.configurationService]);

	useEffect(() => {
		setCollapsed(isCollapsed);
	}, [isCollapsed, setCollapsed]);

	const sashPointerEnterHandler = (e: React.PointerEvent<HTMLDivElement>) => {
		hoveringDelayer.trigger(() => {
			setHovering(true);
			const rect = sashRef.current.getBoundingClientRect();
			if (e.clientY >= rect.top + EXPAND_COLLAPSE_BUTTON_TOP &&
				e.clientY <= rect.top + EXPAND_COLLAPSE_BUTTON_TOP + EXPAND_COLLAPSE_BUTTON_SIZE) {
				setHighlightExpandCollapse(true);
			}
		}, hoverDelay);
	};

	const sashPointerLeaveHandler = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!resizing) {
			hoveringDelayer.trigger(() => setHovering(false), hoverDelay);
		}
	};

	const expandCollapseButtonPointerEnterHandler = (e: React.PointerEvent<HTMLDivElement>) => {
		hoveringDelayer.cancel();
		setHovering(true);
		setHighlightExpandCollapse(true);
	};

	const expandCollapseButtonPointerLeaveHandler = (e: React.PointerEvent<HTMLDivElement>) => {
		hoveringDelayer.trigger(() => setHovering(false), hoverDelay);
		setHighlightExpandCollapse(false);
	};

	const expandCollapseButtonPressedHandler = (e: KeyboardModifiers) => {
		if (!collapsed) {
			setCollapsed(true);
			onCollapsedChanged?.(true);
		} else {
			setCollapsed(false);
			onCollapsedChanged?.(false);
		}

		hoveringDelayer.cancel();
		setHovering(false);
		setHighlightExpandCollapse(false);
	};

	const sashPointerDownHandler = (e: React.PointerEvent<HTMLDivElement>) => {
		const isNonLeftMouseClick = e.pointerType === 'mouse' && e.buttons !== 1;
		if (isNonLeftMouseClick) {
			return;
		}

		if (isPointInsideElement(e.clientX, e.clientY, expandCollapseButtonRef.current)) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		const resizeParams = onBeginResize();
		const startingWidth = collapsed ? sashWidth : resizeParams.startingWidth;
		const target = DOM.getWindow(e.currentTarget).document.body;
		const clientX = e.clientX;
		const styleSheet = createStyleSheet(target);

		const pointerMoveHandler = (e: PointerEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const delta = Math.trunc(e.clientX - clientX);

			let newWidth = !invert ?
				startingWidth + delta :
				startingWidth - delta;

			let newCollapsed = false;
			let cursor: string | undefined = undefined;
			if (newWidth < resizeParams.minimumWidth / 2) {
				newWidth = resizeParams.minimumWidth;
				newCollapsed = true;
				cursor = isMacintosh ? 'col-resize' : 'ew-resize';
			} else if (newWidth < resizeParams.minimumWidth) {
				newWidth = resizeParams.minimumWidth;
				newCollapsed = false;
				cursor = !invert ? 'e-resize' : 'w-resize';
			} else if (newWidth > resizeParams.maximumWidth) {
				newWidth = resizeParams.maximumWidth;
				newCollapsed = false;
				cursor = !invert ? 'w-resize' : 'e-resize';
			} else {
				newCollapsed = false;
				cursor = isMacintosh ? 'col-resize' : 'ew-resize';
			}

			if (cursor) {
				styleSheet.textContent = `* { cursor: ${cursor} !important; }`;
			}

			onResize(newWidth);

			if (newCollapsed !== collapsedRef.current) {
				setCollapsed(newCollapsed);
				onCollapsedChanged?.(newCollapsed);
			}
		};

		const lostPointerCaptureHandler = (e: PointerEvent) => {
			pointerMoveHandler(e);

			// @ts-ignore
			target.removeEventListener('pointermove', pointerMoveHandler);
			// @ts-ignore
			target.removeEventListener('lostpointercapture', lostPointerCaptureHandler);

			target.removeChild(styleSheet);

			setResizing(false);
			hoveringDelayer.cancel();
			setHovering(isPointInsideElement(e.clientX, e.clientY, sashRef.current));
		};

		setResizing(true);

		target.setPointerCapture(e.pointerId);
		// @ts-ignore
		target.addEventListener('pointermove', pointerMoveHandler);
		// @ts-ignore
		target.addEventListener('lostpointercapture', lostPointerCaptureHandler);
	};

	return (
		<div
			className={erdosClassNames(
				'vertical-splitter',
				{ collapsible }
			)}
			style={{
				width: splitterWidth
			}}
		>
			<div
				ref={sashRef}
				className='sash'
				style={{
					left: collapsible ? -1 : -(sashWidth / 2),
					width: collapsible ? sashWidth + 2 : sashWidth
				}}
				onPointerDown={sashPointerDownHandler}
				onPointerEnter={sashPointerEnterHandler}
				onPointerLeave={sashPointerLeaveHandler}
			>
				{showSash && (hovering || resizing) &&
					<div
						className={erdosClassNames(
							'sash-indicator',
							{ 'hovering': showSash && hovering },
							{ 'resizing': showSash && resizing },
						)}
						style={{
							width: sashIndicatorWidth,
						}}
					/>
				}
			</div>
			{collapsible && (hovering || resizing || collapsed) &&
				<Button
					ref={expandCollapseButtonRef}
					className='expand-collapse-button'
					mouseTrigger={MouseTrigger.MouseDown}
					style={{
						top: EXPAND_COLLAPSE_BUTTON_TOP,
						width: EXPAND_COLLAPSE_BUTTON_SIZE,
						height: EXPAND_COLLAPSE_BUTTON_SIZE
					}}
					onPressed={expandCollapseButtonPressedHandler}
				>
					<div
						className={erdosClassNames(
							'expand-collapse-button-face',
							'codicon',
							!collapsed ?
								!invert ? 'codicon-chevron-left' : 'codicon-chevron-right' :
								!invert ? 'codicon-chevron-right' : 'codicon-chevron-left',
							{ highlighted: highlightExpandCollapse }
						)}
						style={{
							width: EXPAND_COLLAPSE_BUTTON_SIZE,
							height: EXPAND_COLLAPSE_BUTTON_SIZE
						}}
						onPointerEnter={expandCollapseButtonPointerEnterHandler}
						onPointerLeave={expandCollapseButtonPointerLeaveHandler}
					/>
				</Button>
			}
		</div>
	);
};
