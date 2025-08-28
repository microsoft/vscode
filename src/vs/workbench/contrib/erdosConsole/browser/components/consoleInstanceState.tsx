/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './consoleInstanceState.css';

import React, { useEffect, useState } from 'react';

import { IErdosConsoleInstance, ErdosConsoleState } from '../../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

const enum StatusIconClassName {
	ACTIVE = 'codicon-erdos-status-active',
	DISCONNECTED = 'codicon-erdos-status-disconnected',
	IDLE = 'codicon-erdos-status-idle'
}

const statusIconClassNameToColor = {
	[StatusIconClassName.ACTIVE]: 'var(--vscode-erdosConsole-stateIconActive)',
	[StatusIconClassName.DISCONNECTED]: 'var(--vscode-erdosConsole-stateIconDisconnected)',
	[StatusIconClassName.IDLE]: 'var(--vscode-erdosConsole-stateIconIdle)'
}

const consoleStateToStatusIcon = {
	[ErdosConsoleState.Uninitialized]: StatusIconClassName.DISCONNECTED,
	[ErdosConsoleState.Disconnected]: StatusIconClassName.DISCONNECTED,
	[ErdosConsoleState.Starting]: StatusIconClassName.ACTIVE,
	[ErdosConsoleState.Busy]: StatusIconClassName.ACTIVE,
	[ErdosConsoleState.Ready]: StatusIconClassName.IDLE,
	[ErdosConsoleState.Offline]: StatusIconClassName.DISCONNECTED,
	[ErdosConsoleState.Exiting]: StatusIconClassName.ACTIVE,
	[ErdosConsoleState.Exited]: StatusIconClassName.DISCONNECTED
};

interface ConsoleInstanceStateProps {
	readonly erdosConsoleInstance: IErdosConsoleInstance;
}

export const ConsoleInstanceState = ({ erdosConsoleInstance }: ConsoleInstanceStateProps) => {
	const [consoleState, setConsoleState] = useState(erdosConsoleInstance.state);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(erdosConsoleInstance.onDidChangeState(state => {
			setConsoleState(state)
		}));

		return () => disposableStore.dispose();
	}, [erdosConsoleInstance]);

	const icon = consoleStateToStatusIcon[consoleState];
	const color = statusIconClassNameToColor[icon];

	return (
		<span
			className={`codicon ${icon}`}
			style={{ color }}
		/>
	);
}
