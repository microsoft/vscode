/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './erdosModalPopup.css';

import React, { PropsWithChildren, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import * as DOM from '../../../../base/browser/dom.js';
import { isNumber } from '../../../../base/common/types.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { erdosClassNames } from '../../../../base/common/erdosUtilities.js';
import { ErdosModalReactRenderer } from '../../../../base/browser/erdosModalReactRenderer.js';

const LAYOUT_OFFSET = 2;
const LAYOUT_MARGIN = 10;

const focusableElementSelectors =
	'a[href]:not([disabled]),' +
	'button:not([disabled]),' +
	'textarea:not([disabled]),' +
	'input[type="text"]:not([disabled]),' +
	'input[type="radio"]:not([disabled]),' +
	'input[type="checkbox"]:not([disabled]),' +
	'select:not([disabled])';

class PopupLayout {
	top: number | 'auto' = 'auto';
	right: number | 'auto' = 'auto';
	bottom: number | 'auto' = 'auto';
	left: number | 'auto' = 'auto';
	width: number | 'auto' = 'auto';
	height: number | 'auto' = 'auto';
	maxWidth: number | 'none' = 'none';
	maxHeight: number | 'none' = 'none';
	shadow: 'top' | 'bottom' = 'bottom';
}

export interface AnchorPoint {
	clientX: number;
	clientY: number;
}

export type PopupPosition = 'bottom' | 'top' | 'auto';

export type PopupAlignment = 'left' | 'right' | 'auto';

export type KeyboardNavigationStyle = 'dialog' | 'menu';

export interface ErdosModalPopupProps {
	readonly renderer: ErdosModalReactRenderer;
	readonly anchorElement: HTMLElement;
	readonly anchorPoint?: AnchorPoint;
	readonly popupPosition: PopupPosition;
	readonly popupAlignment: PopupAlignment;
	readonly width: number | 'auto';
	readonly minWidth?: number | 'auto';
	readonly height: number | 'auto';
	readonly minHeight?: number | 'auto';
	readonly maxHeight?: number | 'none';
	readonly fixedHeight?: boolean;
	readonly focusableElementSelectors?: string;
	readonly keyboardNavigationStyle: KeyboardNavigationStyle;
}

export const ErdosModalPopup = (props: PropsWithChildren<ErdosModalPopupProps>) => {
	const popupContainerRef = useRef<HTMLDivElement>(undefined!);
	const popupRef = useRef<HTMLDivElement>(undefined!);
	const popupChildrenRef = useRef<HTMLDivElement>(undefined!);

	const [popupLayout, setPopupLayout] = useState<PopupLayout>(() => {
		const popupLayout = new PopupLayout();
		popupLayout.left = -10000;
		popupLayout.top = -10000;
		return popupLayout;
	});

	const updatePopupLayout = useCallback(() => {
		const { clientWidth: documentWidth, clientHeight: documentHeight } =
			DOM.getWindow(popupRef.current).document.documentElement;

		let anchorX: number;
		let anchorY: number;
		let anchorWidth: number;
		let anchorHeight: number;
		if (props.anchorPoint) {
			anchorX = props.anchorPoint.clientX;
			anchorY = props.anchorPoint.clientY;
			anchorWidth = 0;
			anchorHeight = 0;
		} else if (props.anchorElement) {
			const topLeftAnchorOffset = DOM.getTopLeftOffset(props.anchorElement);
			anchorX = topLeftAnchorOffset.left;
			anchorY = topLeftAnchorOffset.top;
			anchorWidth = props.anchorElement.offsetWidth;
			anchorHeight = props.anchorElement.offsetHeight;
		} else {
			anchorX = documentWidth / 2;
			anchorY = documentHeight / 2;
			anchorWidth = 0;
			anchorHeight = 0;
		}

		const leftAreaWidth = anchorX + anchorWidth - LAYOUT_MARGIN;
		const rightAreaWidth = documentWidth - anchorX - LAYOUT_MARGIN;

		const popupLayout = new PopupLayout();

		const positionLeft = () => {
			popupLayout.left = anchorX;
		};

		const positionRight = () => {
			if (isNumber(props.width)) {
				popupLayout.left = (anchorX + anchorWidth) - props.width;
			} else {
				popupLayout.right = documentWidth - (anchorX + anchorWidth);
			}
		};

		if (props.popupAlignment === 'left') {
			positionLeft();
		} else if (props.popupAlignment === 'right') {
			positionRight();
		} else if (props.popupAlignment === 'auto') {
			if (leftAreaWidth > rightAreaWidth) {
				positionRight();
			} else {
				positionLeft();
			}
		}

		const topAreaHeight = anchorY - LAYOUT_OFFSET - LAYOUT_MARGIN;
		const bottomAreaHeight = documentHeight -
			(anchorY + anchorHeight + LAYOUT_OFFSET + LAYOUT_MARGIN);

		if (props.height === 'auto') {
			popupLayout.height = props.height;

			const layoutHeight = popupChildrenRef.current.offsetHeight + 2;

			const positionBottom = () => {
				popupLayout.top = anchorY + anchorHeight + LAYOUT_OFFSET;
				if (props.fixedHeight) {
					popupLayout.top = Math.min(popupLayout.top, documentHeight - layoutHeight - LAYOUT_MARGIN);
				} else {
					popupLayout.maxHeight = documentHeight - popupLayout.top - LAYOUT_MARGIN;
				}
				popupLayout.shadow = 'bottom';
			};

			const positionTop = () => {
				const drawHeight = Math.min(topAreaHeight, layoutHeight);
				popupLayout.top = Math.max(anchorY - drawHeight - LAYOUT_OFFSET, LAYOUT_MARGIN);
				popupLayout.maxHeight = drawHeight;
				popupLayout.shadow = 'top';
			};

			if (props.popupPosition === 'bottom') {
				positionBottom();
			} else if (props.popupPosition === 'top') {
				positionTop();
			} else {
				if (layoutHeight <= bottomAreaHeight) {
					positionBottom();
				} else if (layoutHeight <= topAreaHeight) {
					positionTop();
				} else {
					if (bottomAreaHeight > topAreaHeight) {
						positionBottom();
					} else {
						positionTop();
					}
				}
			}
		} else {
			popupLayout.height = props.height;

			const positionBottom = () => {
				popupLayout.top = anchorY + anchorHeight + LAYOUT_OFFSET;
				popupLayout.maxHeight = bottomAreaHeight;
				popupLayout.shadow = 'bottom';
			};

			const positionTop = (height: number) => {
				const drawHeight = Math.min(topAreaHeight, height);
				popupLayout.top = anchorY - drawHeight - LAYOUT_OFFSET;
				popupLayout.maxHeight = drawHeight;
				popupLayout.shadow = 'top';
			};

			if (props.popupPosition === 'bottom') {
				positionBottom();
			} else if (props.popupPosition === 'top') {
				positionTop(props.height);
			} else {
				if (bottomAreaHeight > topAreaHeight) {
					positionBottom();
				} else {
					positionTop(props.height);
				}
			}
		}

		setPopupLayout(popupLayout);
	}, [props.anchorElement, props.anchorPoint, props.height, props.popupAlignment, props.popupPosition, props.width, props.fixedHeight]);

	useLayoutEffect(() => {
		updatePopupLayout();
	}, [updatePopupLayout]);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(props.renderer.onResize(e => {
			updatePopupLayout();
		}));

		disposableStore.add(props.renderer.onKeyDown(e => {
			const consumeEvent = () => {
				e.preventDefault();
				e.stopPropagation();
			};

			const navigateFocusableElements = (direction: 'next' | 'previous', wrap: boolean) => {
				const focusableElements = popupContainerRef.current.querySelectorAll<HTMLElement>(
					props.focusableElementSelectors ?? focusableElementSelectors
				);

				if (!focusableElements.length) {
					return;
				}

				const firstFocusableElement = focusableElements[0];
				const lastFocusableElement = focusableElements[focusableElements.length - 1];

				const activeElement = DOM.getActiveElement();

				const focusableElementIndex = (() => {
					if (activeElement) {
						for (let i = 0; i < focusableElements.length; i++) {
							if (focusableElements[i] === activeElement) {
								return i;
							}
						}
					}

					return -1;
				})();

				if (direction === 'next') {
					if (focusableElementIndex === -1 ||
						(wrap && activeElement === lastFocusableElement)) {
						firstFocusableElement.focus();
					} else {
						if (focusableElementIndex < focusableElements.length - 1) {
							focusableElements[focusableElementIndex + 1].focus();
						}
					}
				} else if (direction === 'previous') {
					if (focusableElementIndex === -1 ||
						(wrap && activeElement === firstFocusableElement)) {
						lastFocusableElement.focus();
					} else {
						if (focusableElementIndex > 0) {
							focusableElements[focusableElementIndex - 1].focus();
						}
					}
				}
			};

			switch (e.code) {
				case 'Escape': {
					consumeEvent();
					props.renderer.dispose();
					break;
				}

				case 'Tab': {
					consumeEvent();
					if (props.keyboardNavigationStyle === 'dialog') {
						navigateFocusableElements(!e.shiftKey ? 'next' : 'previous', true);
					}
					break;
				}

				case 'ArrowUp': {
					if (props.keyboardNavigationStyle === 'menu') {
						navigateFocusableElements('previous', false);
						consumeEvent();
					}
					break;
				}

				case 'ArrowDown': {
					if (props.keyboardNavigationStyle === 'menu') {
						navigateFocusableElements('next', false);
						consumeEvent();
					}
					break;
				}
			}
		}));

		disposableStore.add(props.renderer.onMouseDown(e => {
			const clientRect = popupRef.current.getBoundingClientRect();
			if (!(e.clientX >= clientRect.left && e.clientX <= clientRect.right &&
				e.clientY >= clientRect.top && e.clientY <= clientRect.bottom)) {
				props.renderer.dispose();
			}
		}));

		return () => disposableStore.dispose();
	}, [props, updatePopupLayout]);

	return (
		<div
			ref={popupContainerRef}
			className='erdos-modal-popup-container'
			role='dialog'
			tabIndex={-1}
		>
			<div
				ref={popupRef}
				className={erdosClassNames(
					'erdos-modal-popup',
					popupLayout.shadow === 'top' ? 'shadow-top' : 'shadow-bottom'
				)}
				style={{
					...popupLayout,
					width: props.width
				}}
			>
				<div ref={popupChildrenRef} className='erdos-modal-popup-children'>
					{props.children}
				</div>
			</div>
		</div>
	);
};
