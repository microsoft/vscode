/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './actionBar.css';

import React, { useEffect, useState } from 'react';

import { localize } from '../../../../../nls.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { CurrentWorkingDirectory } from './currentWorkingDirectory.js';
import { useErdosConsoleContext } from '../erdosConsoleContext.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ConsoleInstanceInfoButton } from './consoleInstanceInfoButton.js';
import { IReactComponentContainer } from '../../../../../base/browser/erdosReactRenderer.js';
import { IsDevelopmentContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { UiFrontendEvent } from '../../../../services/languageRuntime/common/erdosUiComm.js';
import { RuntimeState } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession } from '../../../../services/runtimeSession/common/runtimeSessionService.js';
import { ActionBarButton } from '../../../../../platform/erdosActionBar/browser/components/actionBarButton.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ErdosConsoleState } from '../../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { ErdosActionBarContextProvider } from '../../../../../platform/erdosActionBar/browser/erdosActionBarContext.js';
import { ErdosDynamicActionBar, DynamicActionBarAction, DEFAULT_ACTION_BAR_BUTTON_WIDTH } from '../../../../../platform/erdosActionBar/browser/erdosDynamicActionBar.js';

const kPaddingLeft = 8;
const kPaddingRight = 8;

interface ActionBarProps {
	readonly reactComponentContainer: IReactComponentContainer;
	readonly showDeleteButton?: boolean;
}

const stateLabelStarting = localize('erdosConsoleState.Starting', "Starting");
const stateLabelInterrupting = localize('erdosConsoleState.Interrupting', "Interrupting");
const stateLabelShuttingDown = localize('erdosConsoleState.ShuttingDown', "Shutting down");
const stateLabelRestarting = localize('erdosConsoleState.Restarting', "Restarting");
const stateLabelReconecting = localize('erdosConsoleState.Reconnecting', "Reconnecting");

const erdosInterruptExecution = localize('erdosInterruptExecution', "Interrupt Execution");
const erdosToggleTrace = localize('erdosToggleTrace', "Toggle Trace");
const erdosToggleWordWrap = localize('erdosToggleWordWrap', "Toggle Word Wrap");
const erdosClearConsole = localize('erdosClearConsole', "Clear Console");
const erdosOpenInEditor = localize('erdosOpenInEditor', "Open in Editor");
const erdosDeleteSession = localize('erdosDeleteSession', "Delete Session");

function labelForState(state: RuntimeState): string {
	switch (state) {
		case RuntimeState.Starting:
			return stateLabelStarting;

		case RuntimeState.Restarting:
			return stateLabelRestarting;

		case RuntimeState.Interrupting:
			return stateLabelInterrupting;

		case RuntimeState.Exiting:
			return stateLabelShuttingDown;

		case RuntimeState.Offline:
			return stateLabelReconecting;

		default:
			return '';
	}
}

export const ActionBar = (props: ActionBarProps) => {
	const services = useErdosReactServicesContext();
	const erdosConsoleContext = useErdosConsoleContext();

	const showDeveloperUI = IsDevelopmentContext.getValue(services.contextKeyService);

	const [activeErdosConsoleInstance, setActiveErdosConsoleInstance] = useState(services.erdosConsoleService.activeErdosConsoleInstance);

	const [interruptible, setInterruptible] = useState(false);
	const [interrupting, setInterrupting] = useState(false);
	const [canShutdown, setCanShutdown] = useState(false);
	const [canStart, setCanStart] = useState(false);

	const [restarting, setRestarting] = useState(false);

	const [stateLabel, setStateLabel] = useState('');
	const [directoryLabel, setDirectoryLabel] = useState('');

	const erdosRestartSession = localize('erdosRestartSession', "Restart {0}", activeErdosConsoleInstance?.runtimeMetadata.languageName ?? localize('erdosSession', "Session"));

	useEffect(() => {
		const disposables = new DisposableStore();
		disposables.add(services.erdosConsoleService.onDidChangeActiveErdosConsoleInstance(activeErdosConsoleInstance => {
			setActiveErdosConsoleInstance(activeErdosConsoleInstance);
			setInterruptible(activeErdosConsoleInstance?.state === ErdosConsoleState.Busy);
			setInterrupting(false);
			setCanShutdown(activeErdosConsoleInstance?.attachedRuntimeSession?.getRuntimeState() !== RuntimeState.Exited);
			setCanStart(activeErdosConsoleInstance?.attachedRuntimeSession?.getRuntimeState() === RuntimeState.Exited);
		}));
		return () => {
			disposables.dispose();
		};
	}, [services.erdosConsoleService]);

	useEffect(() => {
		const disposableConsoleStore = new DisposableStore();
		const disposableRuntimeStore = new DisposableStore();

		const attachRuntime = (session: ILanguageRuntimeSession | undefined) => {
			disposableRuntimeStore.clear();

			if (!session) {
				if (!restarting) { setStateLabel(''); }
				setInterruptible(false);
				setInterrupting(false);
				setDirectoryLabel('');
				setCanShutdown(false);
				setCanStart(true);
				return;
			}

			setInterruptible(session.dynState.busy);
			setDirectoryLabel(session.dynState.currentWorkingDirectory);
			setCanShutdown(session.getRuntimeState() !== RuntimeState.Exited && session.getRuntimeState() !== RuntimeState.Uninitialized);
			setCanStart(session.getRuntimeState() === RuntimeState.Exited || session.getRuntimeState() === RuntimeState.Uninitialized);

			disposableRuntimeStore.add(session.onDidChangeRuntimeState((state) => {
				switch (state) {
					case RuntimeState.Uninitialized:
						setStateLabel(labelForState(state));
						setInterruptible(false);
						setCanShutdown(false);
						setCanStart(true);
						break;

					case RuntimeState.Starting:
						setStateLabel(labelForState(state));
						setInterruptible(false);
						setCanShutdown(false);
						setCanStart(false);
						break;

					case RuntimeState.Restarting:
						setStateLabel(labelForState(state));
						setInterrupting(false);
						setInterruptible(false);
						setCanShutdown(false);
						setCanStart(false);
						break;

					case RuntimeState.Idle:
					case RuntimeState.Ready:
						if (!restarting) { setStateLabel(''); }
						setInterruptible(false);
						setInterrupting(false);
						setCanShutdown(true);
						setCanStart(false);
						break;

					case RuntimeState.Busy:
						setInterruptible(true);
						setCanShutdown(true);
						setCanStart(false);
						break;

					case RuntimeState.Interrupting:
						setStateLabel(labelForState(state));
						setInterrupting(true);
						setCanShutdown(true);
						setCanStart(false);
						break;

					case RuntimeState.Offline:
						setStateLabel(labelForState(state));
						setInterruptible(false);
						setCanShutdown(false);
						setCanStart(false);
						break;

					case RuntimeState.Exiting:
						setStateLabel(labelForState(state));
						setInterrupting(false);
						setInterruptible(false);
						setCanShutdown(false);
						setCanStart(false);
						break;

					case RuntimeState.Exited:
						if (!restarting) { setStateLabel(''); }
						setInterrupting(false);
						setInterruptible(false);
						setCanShutdown(false);
						setCanStart(true);
						break;
				}
			}));

			disposableRuntimeStore.add(session.onDidReceiveRuntimeClientEvent(event => {
				if (event.name === UiFrontendEvent.WorkingDirectory) {
					setDirectoryLabel(session.dynState.currentWorkingDirectory);
				}
			}));
		};

		if (activeErdosConsoleInstance) {
			const session = activeErdosConsoleInstance.attachedRuntimeSession;
			if (session) {
				attachRuntime(session);
			} else {
				setDirectoryLabel(activeErdosConsoleInstance.initialWorkingDirectory);
			}

			disposableConsoleStore.add(activeErdosConsoleInstance.onDidAttachSession(attachRuntime));
		}

		return () => {
			disposableConsoleStore.dispose();
			disposableRuntimeStore.dispose();
		};
	}, [activeErdosConsoleInstance, restarting]);

	const interruptHandler = async () => {
		setInterrupting(true);
		activeErdosConsoleInstance?.interrupt();
	};

	const toggleTraceHandler = async () => {
		erdosConsoleContext.activeErdosConsoleInstance?.toggleTrace();
	};

	const toggleWordWrapHandler = async () => {
		erdosConsoleContext.activeErdosConsoleInstance?.toggleWordWrap();
	};

	const clearConsoleHandler = async () => {
		erdosConsoleContext.activeErdosConsoleInstance?.clearConsole();
	};

	const restartConsoleHandler = async () => {
		if (!erdosConsoleContext.activeErdosConsoleInstance) {
			return;
		}

		setRestarting(true);
		await services.runtimeSessionService.restartSession(
			activeErdosConsoleInstance!.sessionId,
			'User-requested restart from console action bar'
		);
		setRestarting(false);
	};

	const deleteSessionHandler = async () => {
		if (!erdosConsoleContext.activeErdosConsoleInstance) {
			return;
		}

		await services.runtimeSessionService.deleteSession(
			erdosConsoleContext.activeErdosConsoleInstance.sessionId
		);
	};

	const openInEditorHandler = async () => {
		if (!erdosConsoleContext.activeErdosConsoleInstance) {
			return;
		}

		services.editorService.openEditor({
			resource: undefined,
			languageId: erdosConsoleContext.activeErdosConsoleInstance.runtimeMetadata.languageId,
			contents: erdosConsoleContext.activeErdosConsoleInstance.getClipboardRepresentation('# ').join('\n'),
		});
	};

	const leftActions: DynamicActionBarAction[] = [
		{
			fixedWidth: DEFAULT_ACTION_BAR_BUTTON_WIDTH,
			text: directoryLabel,
			separator: false,
			component: <CurrentWorkingDirectory directoryLabel={directoryLabel} />
		}
	];

	const rightActions: DynamicActionBarAction[] = [];

	if (stateLabel.length) {
		rightActions.push({
			fixedWidth: 4,
			text: stateLabel,
			separator: false,
			component: <div className='state-label'>{stateLabel}</div>
		});
	}

	if (interruptible) {
		rightActions.push({
			fixedWidth: DEFAULT_ACTION_BAR_BUTTON_WIDTH,
			separator: false,
			component: (
				<ActionBarButton
					align='right'
					ariaLabel={erdosInterruptExecution}
					disabled={interrupting}
					fadeIn={true}
					tooltip={erdosInterruptExecution}
					onPressed={interruptHandler}
				>
					<div className={'action-bar-button-icon	interrupt codicon codicon-erdos-interrupt-runtime'} />
				</ActionBarButton>
			)
		});
	}

	rightActions.push({
		fixedWidth: DEFAULT_ACTION_BAR_BUTTON_WIDTH,
		separator: true,
		component: (
			<ActionBarButton
				align='right'
				ariaLabel={erdosRestartSession}
				dataTestId='restart-session'
				disabled={!canShutdown || restarting}
				icon={ThemeIcon.fromId('erdos-restart-runtime-thin')}
				tooltip={(erdosRestartSession)}
				onPressed={restartConsoleHandler}
			/>
		),
		overflowContextMenuItem: {
			commandId: 'erdos.restartRuntime',
			icon: 'erdos-restart-runtime-thin',
			label: erdosRestartSession,
			onSelected: restartConsoleHandler
		}
	});

	if (props.showDeleteButton) {
		rightActions.push({
			fixedWidth: DEFAULT_ACTION_BAR_BUTTON_WIDTH,
			separator: false,
			component: (
				<ActionBarButton
					align='right'
					ariaLabel={erdosDeleteSession}
					dataTestId='trash-session'
					disabled={!(canShutdown || canStart)}
					icon={ThemeIcon.fromId('trash')}
					tooltip={erdosDeleteSession}
					onPressed={deleteSessionHandler}
				/>
			),
			overflowContextMenuItem: {
				commandId: 'erdos.trashSession',
				icon: 'trash',
				label: erdosDeleteSession,
				onSelected: deleteSessionHandler
			}
		});
	}

	rightActions.push({
		fixedWidth: DEFAULT_ACTION_BAR_BUTTON_WIDTH,
		separator: true,
		component: <ConsoleInstanceInfoButton />,
	})

	if (showDeveloperUI) {
		rightActions.push({
			fixedWidth: DEFAULT_ACTION_BAR_BUTTON_WIDTH,
			separator: false,
			component: (
				<ActionBarButton
					align='right'
					ariaLabel={erdosToggleTrace}
					icon={ThemeIcon.fromId('wand')}
					tooltip={erdosToggleTrace}
					onPressed={toggleTraceHandler}
				/>
			),
			overflowContextMenuItem: {
				commandId: 'erdos.toggleTrace',
				icon: 'wand',
				label: erdosToggleTrace,
				onSelected: toggleTraceHandler
			}
		})
	}

	rightActions.push({
		fixedWidth: DEFAULT_ACTION_BAR_BUTTON_WIDTH,
		separator: true,
		component: (
			<ActionBarButton
				align='right'
				ariaLabel={erdosToggleWordWrap}
				icon={ThemeIcon.fromId('word-wrap')}
				tooltip={erdosToggleWordWrap}
				onPressed={toggleWordWrapHandler}
			/>
		),
		overflowContextMenuItem: {
			commandId: 'erdos.toggleWordWrap',
			icon: 'word-wrap',
			label: erdosToggleWordWrap,
			onSelected: toggleWordWrapHandler
		}
	})

	rightActions.push({
		fixedWidth: DEFAULT_ACTION_BAR_BUTTON_WIDTH,
		separator: true,
		component: (
			<ActionBarButton
				align='right'
				ariaLabel={erdosOpenInEditor}
				icon={ThemeIcon.fromId('erdos-open-in-editor')}
				tooltip={erdosOpenInEditor}
				onPressed={openInEditorHandler}
			/>
		),
		overflowContextMenuItem: {
			commandId: 'erdos.openInEditor',
			icon: 'erdos-open-in-editor',
			label: erdosOpenInEditor,
			onSelected: openInEditorHandler
		}
	});

	rightActions.push({
		fixedWidth: DEFAULT_ACTION_BAR_BUTTON_WIDTH,
		separator: false,
		component: (
			<ActionBarButton
				align='right'
				ariaLabel={erdosClearConsole}
				icon={ThemeIcon.fromId('clear-all')}
				tooltip={erdosClearConsole}
				onPressed={clearConsoleHandler}
			/>
		),
		overflowContextMenuItem: {
			commandId: 'erdos.clearConsole',
			icon: 'clear-all',
			label: erdosClearConsole,
			onSelected: clearConsoleHandler
		}
	});

	return (
		<ErdosActionBarContextProvider {...erdosConsoleContext}>
			<ErdosDynamicActionBar
				borderBottom={true}
				borderTop={true}
				leftActions={leftActions}
				paddingLeft={kPaddingLeft}
				paddingRight={kPaddingRight}
				rightActions={rightActions}
			/>
		</ErdosActionBarContextProvider>
	);
};
