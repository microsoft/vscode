/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './components.css';

import React, { useEffect, useState } from 'react';

import { FontInfo } from '../../../../../editor/common/config/fontInfo.js';
import { ActivityInput } from './activityComponents.js';
import { ActivityPrompt } from './activityComponents.js';
import { ActivityItemInput, ActivityItemPrompt, ActivityItemOutputPlot, ActivityItemOutputHtml, ActivityItemErrorMessage, ActivityItemOutputMessage, ActivityItemStream, ActivityItemStreamType } from '../../../../services/erdosConsole/browser/classes/activityItems.js';
import { RuntimeItemActivity, RuntimeItemPendingInput, RuntimeItemStartup, RuntimeItemStarting, RuntimeItemStarted, RuntimeItemOffline, RuntimeItemExited, RuntimeItemRestartButton, RuntimeItemStartupFailure } from '../../../../services/erdosConsole/browser/classes/runtimeItems.js';
import { ErdosConsoleState } from '../../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { ActivityOutputPlot } from './activityComponents.js';
import { ActivityOutputHtml } from './activityComponents.js';
import { ActivityErrorStream } from './activityComponents.js';
import { ActivityOutputStream } from './activityComponents.js';
import { ActivityErrorMessage } from './activityComponents.js';
import { ActivityOutputMessage } from './activityComponents.js';
import { IErdosConsoleInstance } from '../../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { OutputRun } from '../../../../browser/erdosAnsiRenderer/outputRun.js';
import { ConsoleOutputLines } from './utilityComponents.js';
import * as nls from '../../../../../nls.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

export interface RuntimeActivityProps {
	fontInfo: FontInfo;
	runtimeItemActivity: RuntimeItemActivity;
	erdosConsoleInstance: IErdosConsoleInstance;
}

export const RuntimeActivity = (props: RuntimeActivityProps) => {
	return (
		<div className='runtime-activity'>
			{props.runtimeItemActivity.activityItems.filter(activityItem => !activityItem.isHidden).map(activityItem => {

				if (activityItem instanceof ActivityItemInput) {
					return <ActivityInput key={activityItem.id} activityItemInput={activityItem} fontInfo={props.fontInfo} erdosConsoleInstance={props.erdosConsoleInstance} />;
				} else if (activityItem instanceof ActivityItemStream) {
					if (activityItem.type === ActivityItemStreamType.OUTPUT) {
						return <ActivityOutputStream key={activityItem.id} activityItemStream={activityItem} />;
					} else if (activityItem.type === ActivityItemStreamType.ERROR) {
						return <ActivityErrorStream key={activityItem.id} activityItemStream={activityItem} />;
					} else {
						return null;
					}
				} else if (activityItem instanceof ActivityItemPrompt) {
					return <ActivityPrompt key={activityItem.id} activityItemPrompt={activityItem} erdosConsoleInstance={props.erdosConsoleInstance} />;
				} else if (activityItem instanceof ActivityItemOutputHtml) {
					return <ActivityOutputHtml key={activityItem.id} activityItemOutputHtml={activityItem} />;
				} else if (activityItem instanceof ActivityItemOutputMessage) {
					return <ActivityOutputMessage key={activityItem.id} activityItemOutputMessage={activityItem} />;
				} else if (activityItem instanceof ActivityItemOutputPlot) {
					return <ActivityOutputPlot key={activityItem.id} activityItemOutputPlot={activityItem} />;
				} else if (activityItem instanceof ActivityItemErrorMessage) {
					return <ActivityErrorMessage key={activityItem.id} activityItemErrorMessage={activityItem} />;
				} else {
					return null;
				}
			})}
		</div>
	);
};

export interface RuntimePendingInputProps {
	fontInfo: FontInfo;
	runtimeItemPendingInput: RuntimeItemPendingInput;
}

export const RuntimePendingInput = (props: RuntimePendingInputProps) => {
	const promptWidth = Math.ceil(
		(props.runtimeItemPendingInput.inputPrompt.length + 1) *
		props.fontInfo.typicalHalfwidthCharacterWidth
	);

	return (
		<div className='pending-input'>
			{props.runtimeItemPendingInput.outputLines.map((outputLine, index) =>
				<div key={outputLine.id}>
					<span style={{ width: promptWidth }}>
						{props.runtimeItemPendingInput.inputPrompt + ' '}
					</span>
					{outputLine.outputRuns.map(outputRun =>
						<OutputRun key={outputRun.id} outputRun={outputRun} />
					)}
				</div>
			)}
		</div>
	);
};

export interface RuntimeStartupProps {
	runtimeItemStartup: RuntimeItemStartup;
}

export const RuntimeStartup = (props: RuntimeStartupProps) => {
	return (
		<ConsoleOutputLines outputLines={props.runtimeItemStartup.outputLines} />
	);
};

export interface RuntimeStartedProps {
	runtimeItemStarted: RuntimeItemStarted;
}

export const RuntimeStarted = (props: RuntimeStartedProps) => {
	return (
		<ConsoleOutputLines outputLines={props.runtimeItemStarted.outputLines} />
	);
};

export interface RuntimeOfflineProps {
	runtimeItemOffline: RuntimeItemOffline;
}

export const RuntimeOffline = (props: RuntimeOfflineProps) => {
	return (
		<div className='runtime-offline'>
			<ConsoleOutputLines outputLines={props.runtimeItemOffline.outputLines} />
		</div>
	);
};

export interface RuntimeExitedProps {
	runtimeItemExited: RuntimeItemExited;
}

export const RuntimeExited = (props: RuntimeExitedProps) => {
	return (
		<div className='runtime-exited'>
			<ConsoleOutputLines outputLines={props.runtimeItemExited.outputLines} />
		</div>
	);
};

export interface RuntimeRestartButtonProps {
	runtimeItemRestartButton: RuntimeItemRestartButton;
	erdosConsoleInstance: IErdosConsoleInstance;
}

export const RuntimeRestartButton = (props: RuntimeRestartButtonProps) => {

	const restartRef = React.useRef<HTMLButtonElement>(null);
	const restartLabel = nls.localize('erdos.restartLabel', "Restart {0}", props.runtimeItemRestartButton.languageName);
	const [restarting, setRestarting] = useState(false);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(props.erdosConsoleInstance.onFocusInput(() => {
			restartRef.current?.focus();
		}));

		// Monitor state changes to handle restart completion
		disposableStore.add(props.erdosConsoleInstance.onDidChangeState(state => {
			switch (state) {
				case ErdosConsoleState.Ready:
					if (restarting) {
						setRestarting(false);
					}
					if (restartRef.current) {
						restartRef.current.disabled = false;
					}
					break;
			}
		}));

		return () => disposableStore.dispose();
	}, [props.erdosConsoleInstance, restarting]);

	const handleRestart = () => {
		// Prevent multiple concurrent restarts
		if (restarting) {
			return;
		}

		setRestarting(true);
		props.runtimeItemRestartButton.onRestartRequested();

		if (restartRef.current) {
			restartRef.current.disabled = true;
		}
	};

	return (
		<button ref={restartRef}
			className='monaco-text-button runtime-restart-button'
			onClick={handleRestart}>
			<span className='codicon codicon-erdos-restart-runtime'></span>
			<span className='label'>{restartLabel}</span>
		</button>
	);
};

export interface RuntimeStartupFailureProps {
	runtimeItemStartupFailure: RuntimeItemStartupFailure;
}

export const RuntimeStartupFailure = (props: RuntimeStartupFailureProps) => {
	return (
		<div className='runtime-startup-failure'>
			<div className='message'>{props.runtimeItemStartupFailure.message}</div>
			<ConsoleOutputLines outputLines={props.runtimeItemStartupFailure.outputLines} />
		</div>
	);
};



export interface RuntimeStartingProps {
	runtimeItemStarting: RuntimeItemStarting;
}

export const RuntimeStarting = (props: RuntimeStartingProps) => {
	return (
		<div className='console-item-starting runtime-starting'>
			<div className='left-bar' />
			<div className='starting-message'>
				<ConsoleOutputLines outputLines={props.runtimeItemStarting.outputLines} />
			</div>
		</div>
	);
};
