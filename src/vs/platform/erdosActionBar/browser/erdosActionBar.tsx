/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './erdosActionBarVariables.css';
import './erdosActionBar.css';

import React, { KeyboardEvent, PropsWithChildren, useEffect, useLayoutEffect, useRef } from 'react';

import * as DOM from '../../../base/browser/dom.js';
import { useErdosActionBarContext } from './erdosActionBarContext.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { optionalValue, erdosClassNames } from '../../../base/common/erdosUtilities.js';

interface CommonErdosActionBarProps {
	gap?: number;
	paddingLeft?: number;
	paddingRight?: number;
}

type NestedErdosActionBarProps =
	| { nestedActionBar?: true; borderTop?: never; borderBottom?: never }
	| { nestedActionBar?: false | undefined; borderTop?: boolean; borderBottom?: boolean };

type ErdosActionBarProps = CommonErdosActionBarProps & NestedErdosActionBarProps;

export const ErdosActionBar = (props: PropsWithChildren<ErdosActionBarProps>) => {
	const context = useErdosActionBarContext();

	const ref = useRef<HTMLDivElement>(undefined!);

	const [focusedIndex, setFocusedIndex] = React.useState(0);
	const [prevIndex, setPrevIndex] = React.useState(-1);

	const classNames = erdosClassNames(
		'erdos-action-bar',
		{ 'border-top': props?.borderTop },
		{ 'border-bottom': props?.borderBottom },
		{ 'transparent-background': props?.nestedActionBar }
	);

	const keyDownHandler = (e: KeyboardEvent<HTMLDivElement>) => {
		if (DOM.isHTMLInputElement(e.target)) {
			const input = e.target as HTMLInputElement;
			if (input.type === 'text') {
				return;
			}
		}

		switch (e.code) {
			case 'ArrowLeft': {
				e.preventDefault();
				e.stopPropagation();
				setPrevIndex(() => focusedIndex);
				if (focusedIndex === 0) {
					setFocusedIndex(context.focusableComponents.size - 1);
				} else {
					setFocusedIndex(() => focusedIndex - 1);
				}
				break;
			}
			case 'ArrowRight': {
				e.preventDefault();
				e.stopPropagation();
				setPrevIndex(() => focusedIndex);
				if (focusedIndex === context.focusableComponents.size - 1) {
					setFocusedIndex(0);
				} else {
					setFocusedIndex(() => focusedIndex + 1);
				}
				break;
			}
			case 'Home': {
				e.preventDefault();
				e.stopPropagation();
				setPrevIndex(() => focusedIndex);
				setFocusedIndex(0);
				break;
			}
			case 'End': {
				e.preventDefault();
				e.stopPropagation();
				setPrevIndex(() => focusedIndex);
				setFocusedIndex(() => context.focusableComponents.size - 1);
				break;
			}
		}
	};

	useLayoutEffect(() => {
		const disposableStore = new DisposableStore();

		const resizeObserver = new ResizeObserver(entries => {
		});

		resizeObserver.observe(ref.current);

		disposableStore.add(toDisposable(() => resizeObserver.disconnect()));

		return () => disposableStore.dispose();
	}, [context]);

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


	return (
		<div
			ref={ref}
			className={classNames}
			style={{
				gap: optionalValue(props.gap, 0),
				paddingLeft: optionalValue(props.paddingLeft, 0),
				paddingRight: optionalValue(props.paddingRight, 0)
			}}
			onKeyDown={props.nestedActionBar ? undefined : keyDownHandler}>
			{props.children}
		</div>
	);
};