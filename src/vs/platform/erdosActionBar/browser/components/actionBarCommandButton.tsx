/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './actionBarCommandButton.css';

import React, { useEffect, useRef, useState } from 'react';

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { CommandCenter } from '../../../commandCenter/common/commandCenter.js';
import { useRegisterWithActionBar } from '../useRegisterWithActionBar.js';
import { useErdosActionBarContext } from '../erdosActionBarContext.js';
import { ActionBarButton, ActionBarButtonProps } from './actionBarButton.js';
import { useErdosReactServicesContext } from '../../../../base/browser/erdosReactRendererContext.js';

type ActionBarCommandButtonProps = ActionBarButtonProps & {
	readonly commandId: string;
}

export const ActionBarCommandButton = (props: ActionBarCommandButtonProps) => {
	const services = useErdosReactServicesContext();
	const erdosActionBarContext = useErdosActionBarContext();
	const [commandDisabled, setCommandDisabled] = useState(
		!erdosActionBarContext.isCommandEnabled(props.commandId)
	);
	const buttonRef = useRef<HTMLButtonElement>(undefined!);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		const commandInfo = CommandCenter.commandInfo(props.commandId);
		if (commandInfo && commandInfo.precondition) {
			const keys = new Set(commandInfo.precondition.keys());

			disposableStore.add(services.contextKeyService.onDidChangeContext(e => {
				if (e.affectsSome(keys)) {
					setCommandDisabled(!services.contextKeyService.contextMatchesRules(commandInfo.precondition));
				}
			}));
		}

		return () => disposableStore.dispose();
	}, [services.contextKeyService, props.commandId]);

	useRegisterWithActionBar([buttonRef]);

	const tooltip = (): string | undefined => {
		const title = CommandCenter.title(props.commandId);
		if (!title) {
			return undefined;
		}

		const keybindingLabel = services.keybindingService.lookupKeybinding(props.commandId)?.getLabel();

		if (!keybindingLabel) {
			return title;
		}

		return `${title} (${keybindingLabel})`;
	};

	return (
		<ActionBarButton
			ref={buttonRef}
			{...props}
			disabled={props.disabled || commandDisabled}
			tooltip={tooltip}
			onPressed={() =>
				services.commandService.executeCommand(props.commandId)
			}
		/>
	);
};