/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './button.css';

import React, { CSSProperties, forwardRef, KeyboardEvent, MouseEvent, PropsWithChildren, useImperativeHandle, useRef, useState } from 'react';

import { erdosClassNames } from '../../../../common/erdosUtilities.js';
import { IHoverManager } from '../../../../../platform/hover/browser/hoverManager.js';

export enum MouseTrigger {
	Click,
	MouseDown
}

export interface KeyboardModifiers {
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
}

interface ButtonProps {
	readonly ariaLabel?: string;
	readonly className?: string;
	readonly disabled?: boolean;
	readonly hoverManager?: IHoverManager;
	readonly mouseTrigger?: MouseTrigger;
	readonly style?: CSSProperties | undefined;
	readonly tabIndex?: number;
	readonly tooltip?: string | (() => string | undefined);
	readonly onBlur?: () => void;
	readonly onFocus?: () => void;
	readonly onMouseEnter?: () => void;
	readonly onMouseLeave?: () => void;
	readonly onPressed?: (e: KeyboardModifiers) => void;
}

export const Button = forwardRef<HTMLButtonElement, PropsWithChildren<ButtonProps>>((props, ref) => {
	const buttonRef = useRef<HTMLButtonElement>(undefined!);

	useImperativeHandle(ref, () => buttonRef.current, []);

	const [mouseInside, setMouseInside] = useState(false);

	React.useEffect(() => {
		if (mouseInside) {
			props.hoverManager?.showHover(buttonRef.current, props.tooltip);
		}
	}, [mouseInside, props.hoverManager, props.tooltip]);

	const sendOnPressed = (e: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();

		props.hoverManager?.hideHover();

		if (!props.disabled && props.onPressed) {
			props.onPressed(e);
		}
	};

	const keyDownHandler = (e: KeyboardEvent<HTMLButtonElement>) => {
		switch (e.code) {
			case 'Enter':
			case 'Space':
				sendOnPressed(e);
				break;
		}
	};

	const clickHandler = (e: MouseEvent<HTMLButtonElement>) => {
		if (props.mouseTrigger === undefined || props.mouseTrigger === MouseTrigger.Click) {
			sendOnPressed(e);
		}
	};

	const mouseEnterHandler = (e: MouseEvent<HTMLButtonElement>) => {
		setMouseInside(true);

		props.onMouseEnter?.();
	};

	const mouseLeaveHandler = (e: MouseEvent<HTMLButtonElement>) => {
		setMouseInside(false);

		props.hoverManager?.hideHover();

		props.onMouseLeave?.();
	};

	const mouseDownHandler = (e: MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();

		if (props.mouseTrigger === MouseTrigger.MouseDown) {
			sendOnPressed(e);
		}
	};

	return (
		<button
			ref={buttonRef}
			aria-disabled={props.disabled ? 'true' : undefined}
			aria-label={props.ariaLabel}
			className={erdosClassNames(
				'erdos-button',
				props.className,
				{ 'disabled': props.disabled }
			)}
			disabled={props.disabled}
			role='button'
			style={props.style}
			tabIndex={props.tabIndex ?? 0}
			onBlur={props.onBlur}
			onClick={clickHandler}
			onFocus={props.onFocus}
			onKeyDown={keyDownHandler}
			onMouseDown={mouseDownHandler}
			onMouseEnter={mouseEnterHandler}
			onMouseLeave={mouseLeaveHandler}
		>
			{props.children}
		</button>
	);
});

Button.displayName = 'Button';
