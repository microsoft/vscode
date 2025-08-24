/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { useErdosReactServicesContext } from '../../../../base/browser/erdosReactRendererContext.js';
import { IErdosConsoleInstance } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';

export interface ErdosConsoleState {
	readonly erdosConsoleInstances: IErdosConsoleInstance[];
	readonly activeErdosConsoleInstance?: IErdosConsoleInstance;
	readonly consoleSessionListCollapsed: boolean;
}

export const useErdosConsoleState = (): ErdosConsoleState => {
	const services = useErdosReactServicesContext();

	const [erdosConsoleInstances, setErdosConsoleInstances] = useState<IErdosConsoleInstance[]>([]);
	const [activeErdosConsoleInstance, setActiveErdosConsoleInstance] = useState<IErdosConsoleInstance | undefined>(undefined);
	const [consoleSessionListCollapsed, setConsoleSessionListCollapsed] = useState<boolean>(erdosConsoleInstances.length <= 1);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		setErdosConsoleInstances(services.erdosConsoleService.erdosConsoleInstances);
		setActiveErdosConsoleInstance(services.erdosConsoleService.activeErdosConsoleInstance);

		disposableStore.add(services.erdosConsoleService.onDidStartErdosConsoleInstance(erdosConsoleInstance => {
			setErdosConsoleInstances(erdosConsoleInstances => [...erdosConsoleInstances, erdosConsoleInstance]);
		}));

		disposableStore.add(services.erdosConsoleService.onDidChangeActiveErdosConsoleInstance(erdosConsoleInstance => {
			setActiveErdosConsoleInstance(erdosConsoleInstance);
		}));

		disposableStore.add(services.erdosConsoleService.onDidDeleteErdosConsoleInstance(erdosConsoleInstance => {
			setErdosConsoleInstances(erdosConsoleInstances => {
				const instances = [...erdosConsoleInstances];
				const idx = instances.indexOf(erdosConsoleInstance);
				if (idx !== -1) {
					instances.splice(idx, 1);
				}
				return instances;
			});
		}));

		return () => disposableStore.dispose();
	}, [services.erdosConsoleService, services.runtimeSessionService, setActiveErdosConsoleInstance]);

	useEffect(() => {
		setConsoleSessionListCollapsed(erdosConsoleInstances.length <= 1);
	}, [erdosConsoleInstances]);

	return {
		consoleSessionListCollapsed,
		erdosConsoleInstances,
		activeErdosConsoleInstance: activeErdosConsoleInstance,
	};
};
