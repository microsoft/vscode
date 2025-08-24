/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './erdosModalDialog.css';

import React, { PropsWithChildren, useEffect, useRef, useState } from 'react';

import * as DOM from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { DraggableTitleBar } from './components/draggableTitleBar.js';
import { ErdosModalReactRenderer } from '../../../../base/browser/erdosModalReactRenderer.js';

const focusableElementSelectors =
	'a[href]:not([disabled]),' +
	'button:not([disabled]),' +
	'textarea:not([disabled]),' +
	'input[type="text"]:not([disabled]),' +
	'input[type="number"]:not([disabled]),' +
	'input[type="radio"]:not([disabled]),' +
	'input[type="checkbox"]:not([disabled]),' +
	'select:not([disabled])';

const kGutter = 40;

export interface ErdosModalDialogProps {
	renderer: ErdosModalReactRenderer;
	title: string;
	width: number;
	height: number;
	onCancel?: () => void;
}

interface DialogBoxState {
	dragging: boolean;
	dragOffsetLeft: number;
	dragOffsetTop: number;
	left: number;
	top: number;
}

const kInitialDialogBoxState: DialogBoxState = {
	dragging: false,
	dragOffsetLeft: 0,
	dragOffsetTop: 0,
	left: 0,
	top: 0
};

export const ErdosModalDialog = (props: PropsWithChildren<ErdosModalDialogProps>) => {
	const dialogContainerRef = useRef<HTMLDivElement>(undefined!);
	const dialogBoxRef = useRef<HTMLDivElement>(undefined!);

	const [dialogBoxState, setDialogBoxState] = useState(kInitialDialogBoxState);

	useEffect(() => {
		setDialogBoxState(prevDialogBoxState => {
			const result: DialogBoxState = {
				...prevDialogBoxState,
				left: Math.max(dialogContainerRef.current.clientWidth / 2 - props.width / 2, kGutter),
				top: Math.max(dialogContainerRef.current.clientHeight / 2 - props.height / 2, kGutter),
			};

			return result;
		});

		const disposableStore = new DisposableStore();

		disposableStore.add(props.renderer.onKeyDown(e => {
			const consumeEvent = () => {
				e.preventDefault();
				e.stopPropagation();
			};

			switch (e.key) {
				case 'Enter': {
					const activeElement = DOM.getDocument(dialogBoxRef.current).activeElement;
					if (DOM.isHTMLTextAreaElement(activeElement)) {
						return;
					}

					const defaultButton = dialogBoxRef.current.querySelector<HTMLElement>(
						'button.default:not([disabled])'
					);
					if (defaultButton) {
						consumeEvent();
						defaultButton.click();
					}
					break;
				}

				case 'Escape': {
					consumeEvent();
					props.onCancel?.();
					break;
				}

				case 'Tab': {
					const focusableElements = dialogBoxRef.current.querySelectorAll<HTMLElement>(
						focusableElementSelectors
					);

					if (focusableElements.length) {
						const firstFocusableElement = focusableElements[0];
						const lastFocusableElement = focusableElements[focusableElements.length - 1];

						const activeElement = DOM.getActiveElement();

						const activeElementIsFocusableElement = () => {
							if (activeElement) {
								for (let i = 0; i < focusableElements.length; i++) {
									if (focusableElements[i] === activeElement) {
										return true;
									}
								}
							}

							return false;
						};

						if (!e.shiftKey) {
							if (!activeElement ||
								!activeElementIsFocusableElement() ||
								activeElement === lastFocusableElement) {
								consumeEvent();
								firstFocusableElement.focus();
							}
						} else {
							if (!activeElement ||
								!activeElementIsFocusableElement() ||
								activeElement === firstFocusableElement) {
								consumeEvent();
								lastFocusableElement.focus();
							}
						}
					} else {
						consumeEvent();
					}
					break;
				}
			}
		}));

		disposableStore.add(props.renderer.onResize(e => {
			setDialogBoxState(prevDialogBoxState => {
				const result: DialogBoxState = {
					...prevDialogBoxState,
					left: prevDialogBoxState.left + props.width <= dialogContainerRef.current.clientWidth ?
						prevDialogBoxState.left :
						Math.max(dialogContainerRef.current.clientWidth - props.width - kGutter, kGutter),
					top: prevDialogBoxState.top + props.height <= dialogContainerRef.current.clientHeight ?
						prevDialogBoxState.top :
						Math.max(dialogContainerRef.current.clientHeight - props.height - kGutter, kGutter)
				};

				return result;
			});
		}));

		return () => disposableStore.dispose();
	}, [props]);

	const startDragHandler = () => {
		setDialogBoxState(prevDialogBoxState => {
			if (prevDialogBoxState.left + props.width >= dialogContainerRef.current.clientWidth ||
				prevDialogBoxState.top + props.height >= dialogContainerRef.current.clientHeight) {
				return prevDialogBoxState;
			}

			const result: DialogBoxState = {
				...prevDialogBoxState,
				dragging: true,
				dragOffsetLeft: dialogBoxRef.current.offsetLeft,
				dragOffsetTop: dialogBoxRef.current.offsetTop
			};

			return result;
		});
	};

	const updateDialogBoxState = (prevDialogBoxState: DialogBoxState, x: number, y: number, dragging: boolean): DialogBoxState => {
		if (!prevDialogBoxState.dragging) {
			return prevDialogBoxState;
		}

		const result: DialogBoxState = {
			...prevDialogBoxState,
			dragging,
			left: Math.min(Math.max(prevDialogBoxState.dragOffsetLeft + x, kGutter), dialogContainerRef.current.clientWidth - props.width - kGutter),
			top: Math.min(Math.max(prevDialogBoxState.dragOffsetTop + y, kGutter), dialogContainerRef.current.clientHeight - props.height - kGutter)
		};

		return result;
	};

	const dragHandler = (x: number, y: number) => {
		setDialogBoxState(prevDialogBoxState => updateDialogBoxState(prevDialogBoxState, x, y, true));
	};

	const stopDragHandler = (x: number, y: number) => {
		setDialogBoxState(prevDialogBoxState => updateDialogBoxState(prevDialogBoxState, x, y, false));
	};

	return (
		<div ref={dialogContainerRef} className='erdos-modal-dialog-container' role='dialog'>
			<div ref={dialogBoxRef} className='erdos-modal-dialog-box' style={{ left: dialogBoxState.left, top: dialogBoxState.top, width: props.width, height: props.height }}>
				<DraggableTitleBar {...props} onDrag={dragHandler} onStartDrag={startDragHandler} onStopDrag={stopDragHandler} />
				{props.children}
			</div>
		</div>
	);
};
