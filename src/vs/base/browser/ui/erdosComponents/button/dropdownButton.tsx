/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './dropdownButton.css';

import React, { useRef, PropsWithChildren, useImperativeHandle, forwardRef } from 'react';

import { URI } from '../../../../common/uri.js';
import { Icon } from '../../../../../platform/action/common/action.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { asCSSUrl } from '../../../../browser/cssValue.js';
import { ThemeIcon } from '../../../../common/themables.js';
import { Button, MouseTrigger } from './button.js';
import { optionalBoolean, optionalValue, erdosClassNames } from '../../../../common/erdosUtilities.js';
import { useErdosReactServicesContext } from '../../../../browser/erdosReactRendererContext.js';

type DropdownButtonIconProps = {
	readonly icon?: Icon;
	readonly iconFontSize?: number;
	readonly iconImageSrc?: never;
	readonly iconHeight?: never;
	readonly iconWidth?: never;
} | {
	readonly icon?: never;
	readonly iconFontSize?: never;
	readonly iconImageSrc?: string;
	readonly iconHeight?: number;
	readonly iconWidth?: number;
};

type DropdownButtonCommonProps = {
	readonly align?: 'left' | 'right';
	readonly ariaLabel?: string;
	readonly border?: boolean;
	readonly checked?: boolean;
	readonly dataTestId?: string;
	readonly disabled?: boolean;
	readonly dropdownAriaLabel?: string;
	readonly dropdownIndicator?: 'disabled' | 'enabled' | 'enabled-split';
	readonly dropdownTooltip?: string | (() => string | undefined);
	readonly fadeIn?: boolean;
	readonly height?: number;
	readonly label?: string;
	readonly maxTextWidth?: number;
	readonly mouseTrigger?: MouseTrigger;
	readonly tooltip?: string | (() => string | undefined);
	readonly onDropdownPressed?: () => void;
	readonly onMouseEnter?: () => void;
	readonly onMouseLeave?: () => void;
	readonly onPressed?: () => void;
}

export type DropdownButtonProps =
	DropdownButtonCommonProps &
	DropdownButtonIconProps

export const DropdownButton = forwardRef<
	HTMLButtonElement,
	PropsWithChildren<DropdownButtonProps>
>((props, ref) => {
	const services = useErdosReactServicesContext();

	const buttonRef = useRef<HTMLButtonElement>(undefined!);
	const dropdownButtonRef = useRef<HTMLButtonElement>(undefined!);

	useImperativeHandle(ref, () => props.dropdownIndicator === 'enabled-split' ?
		dropdownButtonRef.current : buttonRef.current
	);

	const ariaLabel = props.ariaLabel ? props.ariaLabel : props.label;

	let iconClassNames: string[] = [];
	const iconStyle: React.CSSProperties = {};
	if (props.icon) {
		if (ThemeIcon.isThemeIcon(props.icon)) {
			iconClassNames = ThemeIcon.asClassNameArray(props.icon);
		} else {
			const colorThemeType = services.themeService.getColorTheme().type;

			let icon: URI | undefined;
			if ((colorThemeType === ColorScheme.LIGHT || colorThemeType === ColorScheme.HIGH_CONTRAST_LIGHT) && props.icon.light) {
				icon = props.icon.light;
			} else if ((colorThemeType === ColorScheme.DARK || colorThemeType === ColorScheme.HIGH_CONTRAST_DARK) && props.icon.dark) {
				icon = props.icon.dark;
			} else {
				icon = props.icon.light ?? props.icon.dark;
			}

			if (icon) {
				iconStyle.width = '16px';
				iconStyle.height = '16px';
				iconStyle.backgroundSize = '16px';
				iconStyle.backgroundPosition = '50%';
				iconStyle.backgroundRepeat = 'no-repeat';
				iconStyle.backgroundImage = asCSSUrl(icon);
			}
		}
	}

	const DropdownButtonFace = () => {
		return (
			<div aria-hidden='true' className='dropdown-button-face' data-testid={props.dataTestId}>
				{props.icon &&
					<div
						className={erdosClassNames(
							'dropdown-button-icon',
							props.dropdownIndicator,
							...iconClassNames
						)}
						style={iconStyle}
					/>
				}
				{props.iconImageSrc &&
					<div
						className={erdosClassNames(
							'dropdown-button-icon',
						)}
						style={iconStyle}>
						<img
							src={props.iconImageSrc}
							style={{
								height: props.iconHeight ?? 16,
								width: props.iconWidth ?? 16
							}}
						/>
					</div>
				}
				{props.label &&
					<div
						className='dropdown-button-label'
						style={{
							marginLeft: (props.icon || props.iconImageSrc) ? 0 : 4,
							maxWidth: optionalValue(props.maxTextWidth, 'none')
						}}
					>
						{props.label}
					</div>
				}
				{props.dropdownIndicator === 'enabled' &&
					<div className='dropdown-button-drop-down-container'>
						<div className='dropdown-button-drop-down-arrow codicon codicon-chevron-down' />
					</div>
				}
			</div >
		);
	};

	if (props.dropdownIndicator !== 'enabled-split') {
		return (
			<Button
				ref={buttonRef}
				ariaLabel={ariaLabel}
				className={erdosClassNames(
					'dropdown-button',
					{ 'fade-in': optionalBoolean(props.fadeIn) },
					{ 'checked': optionalBoolean(props.checked) },
					{ 'border': optionalBoolean(props.border) }
				)}
				disabled={props.disabled}
				mouseTrigger={props.mouseTrigger}
				style={{ height: props.height }}
				tooltip={props.tooltip}
				onMouseEnter={props.onMouseEnter}
				onMouseLeave={props.onMouseLeave}
				onPressed={props.onPressed}
			>
				<DropdownButtonFace />
				{props.children}
			</Button>
		);
	} else {
		return (
			<div className={erdosClassNames(
				'dropdown-button',
				{ 'fade-in': optionalBoolean(props.fadeIn) },
				{ 'checked': optionalBoolean(props.checked) },
				{ 'border': optionalBoolean(props.border) }
			)}>
				<Button
					ref={buttonRef}
					ariaLabel={ariaLabel}
					className='dropdown-button-action-button'
					disabled={props.disabled}
					mouseTrigger={props.mouseTrigger}
					style={{ height: props.height }}
					tooltip={props.tooltip}
					onMouseEnter={props.onMouseEnter}
					onMouseLeave={props.onMouseLeave}
					onPressed={props.onPressed}
				>
					<DropdownButtonFace />
				</Button>
			<Button
				ref={dropdownButtonRef}
				ariaLabel={props.dropdownAriaLabel}
				className='dropdown-button-drop-down-button'
				mouseTrigger={MouseTrigger.MouseDown}
				tooltip={props.dropdownTooltip}
				onPressed={props.onDropdownPressed}
			>
				<div className='dropdown-button-drop-down-arrow codicon codicon-chevron-down' />
			</Button>
			{props.children}
		</div>
		);
	}
});

DropdownButton.displayName = 'DropdownButton';
