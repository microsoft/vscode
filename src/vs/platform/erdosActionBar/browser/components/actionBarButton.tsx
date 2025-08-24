/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './actionBarButton.css';

import React, { useRef, PropsWithChildren, useImperativeHandle, forwardRef } from 'react';

import { URI } from '../../../../base/common/uri.js';
import { Icon } from '../../../action/common/action.js';
import { ColorScheme } from '../../../theme/common/theme.js';
import { asCSSUrl } from '../../../../base/browser/cssValue.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { useErdosActionBarContext } from '../erdosActionBarContext.js';
import { Button, MouseTrigger } from '../../../../base/browser/ui/erdosComponents/button/button.js';
import { optionalBoolean, optionalValue, erdosClassNames } from '../../../../base/common/erdosUtilities.js';
import { useErdosReactServicesContext } from '../../../../base/browser/erdosReactRendererContext.js';

type ActionBarButtonIconProps = {
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

type ActionBarButtonCommonProps = {
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

export type ActionBarButtonProps =
	ActionBarButtonCommonProps &
	ActionBarButtonIconProps

export const ActionBarButton = forwardRef<
	HTMLButtonElement,
	PropsWithChildren<ActionBarButtonProps>
>((props, ref) => {
	const services = useErdosReactServicesContext();
	const context = useErdosActionBarContext();

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

	const ActionBarButtonFace = () => {
		return (
			<div aria-hidden='true' className='action-bar-button-face' data-testid={props.dataTestId}>
				{props.icon &&
					<div
						className={erdosClassNames(
							'action-bar-button-icon',
							props.dropdownIndicator,
							...iconClassNames
						)}
						style={iconStyle}
					/>
				}
				{props.iconImageSrc &&
					<div
						className={erdosClassNames(
							'action-bar-button-icon',
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
						className='action-bar-button-label'
						style={{
							marginLeft: (props.icon || props.iconImageSrc) ? 0 : 4,
							maxWidth: optionalValue(props.maxTextWidth, 'none')
						}}
					>
						{props.label}
					</div>
				}
				{props.dropdownIndicator === 'enabled' &&
					<div className='action-bar-button-drop-down-container'>
						<div className='action-bar-button-drop-down-arrow codicon codicon-erdos-drop-down-arrow' />
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
					'action-bar-button',
					{ 'fade-in': optionalBoolean(props.fadeIn) },
					{ 'checked': optionalBoolean(props.checked) },
					{ 'border': optionalBoolean(props.border) }
				)}
				disabled={props.disabled}
				hoverManager={context.hoverManager}
				mouseTrigger={props.mouseTrigger}
				style={{ height: props.height }}
				tooltip={props.tooltip}
				onMouseEnter={props.onMouseEnter}
				onMouseLeave={props.onMouseLeave}
				onPressed={props.onPressed}
			>
				<ActionBarButtonFace />
				{props.children}
			</Button>
		);
	} else {
		return (
			<div className={erdosClassNames(
				'action-bar-button',
				{ 'fade-in': optionalBoolean(props.fadeIn) },
				{ 'checked': optionalBoolean(props.checked) },
				{ 'border': optionalBoolean(props.border) }
			)}>
				<Button
					ref={buttonRef}
					ariaLabel={ariaLabel}
					className='action-bar-button-action-button'
					disabled={props.disabled}
					hoverManager={context.hoverManager}
					mouseTrigger={props.mouseTrigger}
					style={{ height: props.height }}
					tooltip={props.tooltip}
					onMouseEnter={props.onMouseEnter}
					onMouseLeave={props.onMouseLeave}
					onPressed={props.onPressed}
				>
					<ActionBarButtonFace />
				</Button>
				<Button
					ref={dropdownButtonRef}
					ariaLabel={props.dropdownAriaLabel}
					className='action-bar-button-drop-down-button'
					hoverManager={context.hoverManager}
					mouseTrigger={MouseTrigger.MouseDown}
					tooltip={props.dropdownTooltip}
					onPressed={props.onDropdownPressed}
				>
					<div className='action-bar-button-drop-down-arrow codicon codicon-erdos-drop-down-arrow' />
				</Button>
				{props.children}
			</div>
		);
	}
});

ActionBarButton.displayName = 'ActionBarButton';
