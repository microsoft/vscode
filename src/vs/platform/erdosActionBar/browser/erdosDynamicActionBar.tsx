/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './erdosActionBarVariables.css';
import './erdosDynamicActionBar.css';

import React, { KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ActionBarSeparator } from './components/actionBarSeparator.js';
import { useErdosActionBarContext } from './erdosActionBarContext.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { erdosClassNames } from '../../../base/common/erdosUtilities.js';
import { CustomContextMenuSeparator } from '../../../workbench/browser/erdosComponents/customContextMenu/customContextMenuSeparator.js';
import { CustomContextMenuEntry, showCustomContextMenu } from '../../../workbench/browser/erdosComponents/customContextMenu/customContextMenu.js';
import { CustomContextMenuItem, CustomContextMenuItemOptions } from '../../../workbench/browser/erdosComponents/customContextMenu/customContextMenuItem.js';

export const DEFAULT_ACTION_BAR_BUTTON_WIDTH = 24;
export const DEFAULT_ACTION_BAR_SEPARATOR_WIDTH = 7;

export interface OverflowContextMenuItem extends CustomContextMenuItemOptions {
}

export interface DynamicActionBarAction {
	fixedWidth: number;
	text?: string;
	separator: boolean;
	component: JSX.Element | (() => JSX.Element);
	overflowContextMenuItem?: OverflowContextMenuItem;
}

interface CommonErdosDynamicActionBarProps {
	paddingLeft?: number;
	paddingRight?: number;
	leftActions: DynamicActionBarAction[];
	rightActions: DynamicActionBarAction[];
}

type NestedErdosDynamicActionBarProps = | {
	nestedActionBar?: true;
	borderTop?: never;
	borderBottom?: never
} | {
	nestedActionBar?: false | undefined;
	borderTop?: boolean;
	borderBottom?: boolean
};

type ErdosDynamicActionBarProps = CommonErdosDynamicActionBarProps & NestedErdosDynamicActionBarProps;

export const ErdosDynamicActionBar = (props: ErdosDynamicActionBarProps) => {
	const context = useErdosActionBarContext();

	const refActionBar = useRef<HTMLDivElement>(undefined!);
	const refExemplar = useRef<HTMLDivElement>(undefined!);
	const refOverflowButton = useRef<HTMLButtonElement>(undefined!);

	const [width, setWidth] = useState(0);
	const [focusedIndex, setFocusedIndex] = useState(0);
	const [prevIndex, setPrevIndex] = useState(-1);

	useLayoutEffect(() => {
		const disposableStore = new DisposableStore();

		setWidth(refActionBar.current.offsetWidth);

		const resizeObserver = new ResizeObserver(entries => {
			setWidth(refActionBar.current.offsetWidth);
		});

		resizeObserver.observe(refActionBar.current);

		disposableStore.add(toDisposable(() => resizeObserver.disconnect()));

		return () => disposableStore.dispose();
	}, []);

	useEffect(() => {
		if (!props.nestedActionBar && prevIndex >= 0 && (focusedIndex !== prevIndex)) {
			const items = Array.from(context.focusableComponents);
			const currentNode = items[focusedIndex];
			const previousNode = items[prevIndex];

			if (previousNode) {
				previousNode.tabIndex = -1;
			}
			if (currentNode) {
				currentNode.tabIndex = 0;
				currentNode.focus();
			}
		}
	}, [context.focusableComponents, focusedIndex, prevIndex, props.nestedActionBar]);

	const keyDownHandler = (e: KeyboardEvent<HTMLDivElement>) => {
		if (props.nestedActionBar) {
			return;
		}

		switch (e.code) {
			case 'ArrowLeft': {
				e.preventDefault();
				e.stopPropagation();
				setPrevIndex(focusedIndex);
				if (focusedIndex === 0) {
					setFocusedIndex(context.focusableComponents.size - 1);
				} else {
					setFocusedIndex(focusedIndex - 1);
				}
				break;
			}
			case 'ArrowRight': {
				e.preventDefault();
				e.stopPropagation();
				setPrevIndex(focusedIndex);
				if (focusedIndex === context.focusableComponents.size - 1) {
					setFocusedIndex(0);
				} else {
					setFocusedIndex(focusedIndex + 1);
				}
				break;
			}
			case 'Home': {
				e.preventDefault();
				e.stopPropagation();
				setPrevIndex(focusedIndex);
				setFocusedIndex(0);
				break;
			}
			case 'End': {
				e.preventDefault();
				e.stopPropagation();
				setPrevIndex(focusedIndex);
				setFocusedIndex(context.focusableComponents.size - 1);
				break;
			}
		}
	};

	const [leftActionsRendered, leftOverflow] = computeActionBarLayout(
		props.leftActions,
		width,
		props.paddingLeft ?? 0
	);

	const [rightActionsRendered, rightOverflow] = computeActionBarLayout(
		props.rightActions,
		width,
		props.paddingRight ?? 0
	);

	const showOverflowMenu = async (actions: DynamicActionBarAction[], e: React.MouseEvent<HTMLButtonElement>) => {
		if (actions.length === 0) {
			return;
		}

		const entries: CustomContextMenuEntry[] = [];

		for (const action of actions) {
			if (action.overflowContextMenuItem) {
				entries.push(new CustomContextMenuItem(action.overflowContextMenuItem));
			}

			if (action.separator && action !== actions[actions.length - 1]) {
				entries.push(new CustomContextMenuSeparator());
			}
		}

		await showCustomContextMenu({
			anchorElement: e.currentTarget,
			anchorPoint: {
				clientX: e.clientX,
				clientY: e.clientY
			},
			popupPosition: 'auto',
			popupAlignment: 'auto',
			width: 'auto',
			entries
		});
	};

	const renderActions = (actions: DynamicActionBarAction[], startIndex: number) => {
		return actions.map((action, index) => {
			const component = typeof action.component === 'function' ? action.component() : action.component;
			
			return (
				<React.Fragment key={startIndex + index}>
					{component}
					{action.separator && index < actions.length - 1 && <ActionBarSeparator />}
				</React.Fragment>
			);
		});
	};

	return (
		<div
			ref={refActionBar}
			className={erdosClassNames(
				'erdos-dynamic-action-bar',
				{ 'transparent-background': props.nestedActionBar },
				{ 'border-top': props.borderTop },
				{ 'border-bottom': props.borderBottom }
			)}
			tabIndex={props.nestedActionBar ? -1 : 0}
			onKeyDown={keyDownHandler}
		>
			<div ref={refExemplar} className='exemplar'>Ag</div>
			<div className='container'>
				<div className='left-actions'>
					{renderActions(leftActionsRendered, 0)}
					{leftOverflow.length > 0 && (
						<button
							ref={refOverflowButton}
							className='overflow-button codicon codicon-chevron-down'
							onClick={(e) => showOverflowMenu(leftOverflow, e)}
							title='More actions...'
						/>
					)}
				</div>
				<div className='right-actions'>
					{renderActions(rightActionsRendered, props.leftActions.length)}
					{rightOverflow.length > 0 && (
						<button
							className='overflow-button codicon codicon-chevron-down'
							onClick={(e) => showOverflowMenu(rightOverflow, e)}
							title='More actions...'
						/>
					)}
				</div>
			</div>
		</div>
	);
};

const computeActionBarLayout = (
	actions: DynamicActionBarAction[],
	availableWidth: number,
	padding: number
): [DynamicActionBarAction[], DynamicActionBarAction[]] => {
	const rendered: DynamicActionBarAction[] = [];
	const overflow: DynamicActionBarAction[] = [];

	let currentWidth = padding;

	for (const action of actions) {
		const actionWidth = action.fixedWidth + (action.text ? measureText(action.text) : 0) + 
			(action.separator ? DEFAULT_ACTION_BAR_SEPARATOR_WIDTH : 0);

		if (currentWidth + actionWidth <= availableWidth) {
			rendered.push(action);
			currentWidth += actionWidth;
		} else {
			overflow.push(action);
		}
	}

	return [rendered, overflow];
};

const measureText = (text: string): number => {
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	if (context) {
		context.font = '12px sans-serif';
		return context.measureText(text).width;
	}
	return text.length * 8;
};