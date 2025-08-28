/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './actionBarMenuButton.css';

import React, { useEffect, useRef, useState } from 'react';

import { ActionBarButton } from './actionBarButton.js';
import { Icon } from '../../../action/common/action.js';
import { IAction } from '../../../../base/common/actions.js';
import { useRegisterWithActionBar } from '../useRegisterWithActionBar.js';
import { IContextMenuEvent } from '../../../../base/browser/contextmenu.js';
import { useErdosActionBarContext } from '../erdosActionBarContext.js';
import { MouseTrigger } from '../../../../base/browser/ui/erdosComponents/button/button.js';
import { AnchorAlignment, AnchorAxisAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { useErdosReactServicesContext } from '../../../../base/browser/erdosReactRendererContext.js';

interface ActionBarMenuButtonProps {
	readonly icon?: Icon;
	readonly iconFontSize?: number;
	readonly label?: string;
	readonly ariaLabel?: string;
	readonly dropdownAriaLabel?: string;
	readonly maxTextWidth?: number;
	readonly align?: 'left' | 'right';
	readonly tooltip?: string | (() => string | undefined);
	readonly dropdownTooltip?: string | (() => string | undefined);
	readonly dropdownIndicator?: 'disabled' | 'enabled' | 'enabled-split';
	readonly actions: () => readonly IAction[] | Promise<readonly IAction[]>;
}

export const ActionBarMenuButton = (props: ActionBarMenuButtonProps) => {
	const services = useErdosReactServicesContext();
	const erdosActionBarContext = useErdosActionBarContext();

	const buttonRef = useRef<HTMLButtonElement>(undefined!);

	const [actions, setActions] = useState<readonly IAction[]>([]);
	const [defaultAction, setDefaultAction] = useState<IAction | undefined>(undefined);

	useEffect(() => {
		buttonRef.current.setAttribute('aria-haspopup', 'menu');
	}, []);

	useEffect(() => {
		if (erdosActionBarContext.menuShowing) {
			buttonRef.current.setAttribute('aria-expanded', 'true');
		} else {
			buttonRef.current.removeAttribute('aria-expanded');
		}
	}, [erdosActionBarContext.menuShowing]);

	const getMenuActions = React.useCallback(async () => {
		const actions = await props.actions();
		const defaultAction = actions.find(action => action.checked);

		setDefaultAction(defaultAction);
		setActions(actions);

		return actions;
	}, [props]);

	useEffect(() => {
		getMenuActions();
	}, [getMenuActions]);

	useRegisterWithActionBar([buttonRef]);

	const showMenu = async () => {
		if (!actions.length) {
			return;
		}

		erdosActionBarContext.setMenuShowing(true);
		services.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => buttonRef.current,
			getKeyBinding: (action: IAction) => {
				return services.keybindingService.lookupKeybinding(action.id);
			},
			getActionsContext: (event?: IContextMenuEvent) => {
				if (event) {
					return new KeyboardEvent('keydown', {
						ctrlKey: event.ctrlKey,
						shiftKey: event.shiftKey,
						metaKey: event.metaKey,
						altKey: event.altKey
					});
				} else {
					return undefined;
				}
			},
			onHide: () => erdosActionBarContext.setMenuShowing(false),
			anchorAlignment: props.align && props.align === 'right' ? AnchorAlignment.RIGHT : AnchorAlignment.LEFT,
			anchorAxisAlignment: AnchorAxisAlignment.VERTICAL,
			contextKeyService: services.contextKeyService
		});
	};

	return (
		<ActionBarButton
			ref={buttonRef}
			{...props}
			dropdownIndicator={props.dropdownIndicator ?? 'enabled'}
			mouseTrigger={MouseTrigger.MouseDown}
			onDropdownPressed={async () => await showMenu()}
			onPressed={async () => {
				if (props.dropdownIndicator !== 'enabled-split') {
					await showMenu();
				} else {
					defaultAction ? defaultAction.run() : actions[0].run();
				}
			}}
		/>
	);
};
