/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { forwardRef, KeyboardEvent, MouseEvent, PropsWithChildren } from 'react';

import { erdosClassNames } from '../../../../common/erdosUtilities.js';

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

interface Props {
	className?: string;
	disabled?: boolean;
	ariaLabel?: string;
	mouseTrigger?: MouseTrigger;
	onPressed?: (e: KeyboardModifiers) => void;
}

export const ErdosButton = forwardRef<HTMLDivElement, PropsWithChildren<Props>>((props, ref) => {
	const keyDownHandler = (e: KeyboardEvent<HTMLDivElement>) => {
		switch (e.code) {
			case 'Space':
			case 'Enter':
				e.preventDefault();
				e.stopPropagation();

				if (!props.disabled && props.onPressed) {
					props.onPressed(e);
				}
				break;
		}
	};

	const clickHandler = (e: MouseEvent<HTMLDivElement>) => {
		if (props.mouseTrigger === undefined || props.mouseTrigger === MouseTrigger.Click) {
			e.preventDefault();
			e.stopPropagation();

			if (!props.disabled && props.onPressed) {
				props.onPressed(e);
			}
		}
	};

	const mouseDownHandler = (e: MouseEvent<HTMLDivElement>) => {
		if (props.mouseTrigger === MouseTrigger.MouseDown) {
			e.preventDefault();
			e.stopPropagation();

			if (!props.disabled && props.onPressed) {
				props.onPressed(e);
			}
		}
	};

	return (
		<div
			ref={ref}
			aria-disabled={props.disabled ? 'true' : undefined}
			aria-label={props.ariaLabel}
			className={erdosClassNames(
				props.className,
				{ 'disabled': props.disabled }
			)}
			role='button'
			tabIndex={0}
			onClick={clickHandler}
			onKeyDown={keyDownHandler}
			onMouseDown={mouseDownHandler}
		>
			{props.children}
		</div>
	);
});

ErdosButton.displayName = 'ErdosButton';
