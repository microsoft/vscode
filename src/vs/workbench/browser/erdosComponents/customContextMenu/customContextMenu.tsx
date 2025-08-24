/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './customContextMenu.css';

import React from 'react';

import * as DOM from '../../../../base/browser/dom.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { CustomContextMenuSeparator } from './customContextMenuSeparator.js';
import { erdosClassNames } from '../../../../base/common/erdosUtilities.js';
import { ErdosButton } from '../../../../base/browser/ui/erdosComponents/button/erdosButton.js';
import { ErdosReactServices } from '../../../../base/browser/erdosReactServices.js';
import { CustomContextMenuItem, CustomContextMenuItemOptions } from './customContextMenuItem.js';
import { ErdosModalReactRenderer } from '../../../../base/browser/erdosModalReactRenderer.js';
import { useErdosReactServicesContext } from '../../../../base/browser/erdosReactRendererContext.js';
import { AnchorPoint, PopupAlignment, PopupPosition, ErdosModalPopup } from '../erdosModalPopup/erdosModalPopup.js';

export type CustomContextMenuEntry = CustomContextMenuItem | CustomContextMenuSeparator;

export interface CustomContextMenuProps {
	readonly anchorElement: HTMLElement;
	readonly anchorPoint?: AnchorPoint;
	readonly popupPosition: PopupPosition;
	readonly popupAlignment: PopupAlignment;
	readonly width?: number | 'auto';
	readonly minWidth?: number | 'auto';
	readonly entries: CustomContextMenuEntry[];
}

export const showCustomContextMenu = async ({
	anchorElement,
	anchorPoint,
	popupPosition,
	popupAlignment,
	width,
	minWidth,
	entries
}: CustomContextMenuProps) => {
	const renderer = new ErdosModalReactRenderer({
		container: ErdosReactServices.services.workbenchLayoutService.getContainer(DOM.getWindow(anchorElement)),
		parent: anchorElement
	});

	if (!width) {
		width = 'auto';
	}

	if (!minWidth) {
		minWidth = 'auto';
	}

	renderer.render(
		<CustomContextMenuModalPopup
			anchorElement={anchorElement}
			anchorPoint={anchorPoint}
			entries={entries}
			minWidth={minWidth}
			popupAlignment={popupAlignment}
			popupPosition={popupPosition}
			renderer={renderer}
			width={width}
		/>
	);
};

interface CustomContextMenuModalPopupProps {
	readonly renderer: ErdosModalReactRenderer;
	readonly anchorElement: HTMLElement;
	readonly anchorPoint?: AnchorPoint;
	readonly popupPosition: PopupPosition;
	readonly popupAlignment: PopupAlignment;
	readonly width: number | 'auto';
	readonly minWidth: number | 'auto';
	readonly entries: CustomContextMenuEntry[];
}

const CustomContextMenuModalPopup = (props: CustomContextMenuModalPopupProps) => {
	const services = useErdosReactServicesContext();

	const dismiss = () => {
		props.renderer.dispose();
	};

	const MenuSeparator = () => {
		return <div className='custom-context-menu-separator' />;
	};

	const MenuItem = (options: CustomContextMenuItemOptions) => {
		let shortcut = '';
		if (options.commandId) {
			const keybinding = services.keybindingService.lookupKeybinding(options.commandId);
			if (keybinding) {
				let label = keybinding.getLabel();
				if (label) {
					if (isMacintosh) {
						label = label.replace('⇧', '⇧ ');
						label = label.replace('⌥', '⌥ ');
						label = label.replace('⌘', '⌘ ');
					}
					shortcut = label;
				}
			}
		}

		return (
			<ErdosButton
				className={erdosClassNames(
					'custom-context-menu-item',
					{ 'checkable': options.checked !== undefined }
				)}
				disabled={options.disabled}
				onPressed={e => {
					dismiss();
					if (options.commandId) {
						services.commandService.executeCommand(options.commandId);
					}
					options.onSelected(e);
				}}
			>
				{options.checked !== undefined && options.checked &&
					<div
						className={`check codicon codicon-erdos-check-mark`}
						title={options.label}
					/>
				}

				{options.icon &&
					<div
						className={erdosClassNames(
							'icon',
							'codicon',
							`codicon-${options.icon}`,
							{ 'disabled': options.disabled }
						)}
						title={options.label}
					/>
				}

				<div
					className={erdosClassNames(
						'title',
						{ 'disabled': options.disabled }
					)}
				>
					{options.label}
				</div>
				<div className='shortcut'>{shortcut}</div>
			</ErdosButton>
		);
	};

	return (
		<ErdosModalPopup
			anchorElement={props.anchorElement}
			anchorPoint={props.anchorPoint}
			height={'auto'}
			keyboardNavigationStyle='menu'
			minWidth={props.minWidth}
			popupAlignment={props.popupAlignment}
			popupPosition={props.popupPosition}
			renderer={props.renderer}
			width={props.width}
		>
			<div className='custom-context-menu-items'>
				{props.entries.map((entry, index) => {
					if (entry instanceof CustomContextMenuItem) {
						return <MenuItem key={index} {...entry.options} />;
					} else if (entry instanceof CustomContextMenuSeparator) {
						return <MenuSeparator key={index} />;
					} else {
						return null;
					}
				})}
			</div>
		</ErdosModalPopup>
	);
};



