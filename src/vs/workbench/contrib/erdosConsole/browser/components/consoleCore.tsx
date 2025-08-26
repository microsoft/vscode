/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './consoleCore.css';

import React, { useEffect, useState } from 'react';

import { EmptyConsole } from './emptyConsole.js';
import { StartupStatus } from './startupStatus.js';
import { ConsoleTabList } from './consoleTabList.js';
import { ConsoleInstance } from './consoleInstance.js';
import { useErdosConsoleContext } from '../erdosConsoleContext.js';
import { erdosClassNames } from '../../../../../base/common/erdosUtilities.js';
import { IReactComponentContainer } from '../../../../../base/browser/erdosReactRenderer.js';
import { RuntimeStartupPhase } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { VerticalSplitter, VerticalSplitterResizeParams } from '../../../../../base/browser/ui/erdosComponents/splitters/verticalSplitter.js';

const MINIMUM_CONSOLE_TAB_LIST_WIDTH = 64;
const MINIMUM_CONSOLE_PANE_WIDTH = 120;

interface ConsoleCoreProps {
	readonly width: number;
	readonly height: number;
	readonly reactComponentContainer: IReactComponentContainer;
}

export const ConsoleCore = (props: ConsoleCoreProps) => {
	const adjustedHeight = props.height;

	const services = useErdosReactServicesContext();
	const erdosConsoleContext = useErdosConsoleContext();

	const [consoleWidth, setConsoleWidth] = useState(0);
	const [consolePaneWidth, setConsolePaneWidth] = useState(0);
	const [consoleTabListWidth, setConsoleTabListWidth] = useState(0);
	const [startupPhase, setStartupPhase] = useState(services.languageRuntimeService.startupPhase);

	useEffect(() => {
		const disposables = services.languageRuntimeService.onDidChangeRuntimeStartupPhase(e => {
			setStartupPhase(e);
		});
		return () => disposables.dispose();
	}, [services.languageRuntimeService]);

	useEffect(() => {
		const MAXIMUM_CONSOLE_TAB_LIST_WIDTH = Math.trunc(props.width / 5);

		if (erdosConsoleContext.consoleSessionListCollapsed) {
			setConsolePaneWidth(props.width);
			return;
		}

		if (consoleWidth === 0) {
			setConsoleTabListWidth(MAXIMUM_CONSOLE_TAB_LIST_WIDTH)
			setConsolePaneWidth(props.width - MAXIMUM_CONSOLE_TAB_LIST_WIDTH);
		} else if (props.width >= consoleWidth) {
			setConsolePaneWidth(props.width - consoleTabListWidth);
		} else if (props.width < consoleWidth) {
			const newConsolePaneWidth = props.width - consoleTabListWidth;
			if (newConsolePaneWidth >= MINIMUM_CONSOLE_PANE_WIDTH) {
				setConsolePaneWidth(newConsolePaneWidth)
			} else {
				setConsoleTabListWidth(Math.max(props.width - consolePaneWidth, MINIMUM_CONSOLE_TAB_LIST_WIDTH));
			}
		}

		setConsoleWidth(props.width)
	}, [consolePaneWidth, consoleTabListWidth, consoleWidth, props.width, erdosConsoleContext.consoleSessionListCollapsed])

	const handleBeginResize = (): VerticalSplitterResizeParams => ({
		minimumWidth: MINIMUM_CONSOLE_PANE_WIDTH,
		maximumWidth: props.width - MINIMUM_CONSOLE_TAB_LIST_WIDTH,
		startingWidth: consolePaneWidth,
	});

	const handleResize = (newConsolePaneWidth: number) => {
		setConsolePaneWidth(newConsolePaneWidth);
		setConsoleTabListWidth(props.width - newConsolePaneWidth);
	};

	if (erdosConsoleContext.erdosConsoleInstances.length === 0) {
		if (startupPhase === RuntimeStartupPhase.Complete) {
			return <EmptyConsole />;
		} else {
			return <StartupStatus />;
		}
	}

	return (
		<div className={erdosClassNames('console-core')}>
			<div style={{ height: props.height, width: consolePaneWidth }}>
				{consolePaneWidth > 0 &&
					<div className='console-instances-container'>
						{erdosConsoleContext.erdosConsoleInstances.map(erdosConsoleInstance =>
							<ConsoleInstance
								key={erdosConsoleInstance.sessionId}
								active={erdosConsoleInstance.sessionId === erdosConsoleContext.activeErdosConsoleInstance?.sessionId}
								height={adjustedHeight}
								erdosConsoleInstance={erdosConsoleInstance}
								reactComponentContainer={props.reactComponentContainer}
								width={consolePaneWidth}
							/>
						)}
					</div>
				}
			</div>
			{consoleTabListWidth > 0 &&
				<VerticalSplitter
					onBeginResize={handleBeginResize}
					onResize={handleResize}
				/>
			}
			{!erdosConsoleContext.consoleSessionListCollapsed && consoleTabListWidth > 0 &&
				<ConsoleTabList height={props.height} width={consoleTabListWidth} />
			}
		</div>
	);
};
