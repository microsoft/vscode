/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './erdosConsole.css';

import React, { PropsWithChildren, useEffect, useState } from 'react';

import { ConsoleCore } from './components/consoleCore.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ErdosConsoleContextProvider } from './erdosConsoleContext.js';
import { IReactComponentContainer } from '../../../../base/browser/erdosReactRenderer.js';

export interface ErdosConsoleProps {
	readonly reactComponentContainer: IReactComponentContainer;
}

export const ErdosConsole = (props: PropsWithChildren<ErdosConsoleProps>) => {
	const [width, setWidth] = useState(props.reactComponentContainer.width);
	const [height, setHeight] = useState(props.reactComponentContainer.height);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(props.reactComponentContainer.onSizeChanged(size => {
			setWidth(size.width);
			setHeight(size.height);
		}));

		return () => disposableStore.dispose();
	}, [props.reactComponentContainer]);

	return (
		<ErdosConsoleContextProvider {...props}>
			<div className='erdos-console'>
				<ConsoleCore {...props} height={height} width={width} />
			</div>
		</ErdosConsoleContextProvider>
	);
};
