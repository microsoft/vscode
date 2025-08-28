/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './consoleTabList.css';

import React, { KeyboardEvent, MouseEvent, useEffect, useRef, useState } from 'react';

import { localize } from '../../../../../nls.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ConsoleInstanceState } from './consoleInstanceState.js';
import { useErdosConsoleContext } from '../erdosConsoleContext.js';
import { IErdosConsoleInstance } from '../../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { IAction } from '../../../../../base/common/actions.js';
import { AnchorAlignment, AnchorAxisAlignment } from '../../../../../base/browser/ui/contextview/contextview.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { ErdosConsoleTabFocused } from '../../../../common/contextkeys.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

const MINIMUM_ACTION_CONSOLE_TAB_WIDTH = 110;

interface ConsoleTabProps {
	erdosConsoleInstance: IErdosConsoleInstance;
	width: number;
	onChangeSession: (instance: IErdosConsoleInstance) => void;
}

const ConsoleTab = ({ erdosConsoleInstance, width, onChangeSession }: ConsoleTabProps) => {
	const services = useErdosReactServicesContext();
	const erdosConsoleContext = useErdosConsoleContext();

	const [deleteDisabled, setDeleteDisabled] = useState(false);
	const [isRenamingSession, setIsRenamingSession] = useState(false);
	const [sessionName, setSessionName] = useState(erdosConsoleInstance.sessionName);

	const tabRef = useRef<HTMLDivElement>(null);
	const inputRef = React.useRef<HTMLInputElement>(null);

	const sessionId = erdosConsoleInstance.sessionId;
	const isActiveTab = erdosConsoleContext.activeErdosConsoleInstance?.sessionMetadata.sessionId === sessionId;

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(
			services.runtimeSessionService.onDidUpdateSessionName(session => {
				if (session.sessionId === erdosConsoleInstance.sessionId) {
					setSessionName(session.dynState.sessionName);
				}
			})
		);

		return () => disposableStore.dispose();
	}, [services.runtimeSessionService, erdosConsoleInstance.sessionId])

	const handleClick = (e: MouseEvent<HTMLDivElement>) => {
		e.stopPropagation();

		setTimeout(() => {
			if (tabRef.current) {
				tabRef.current.focus();
			}
		}, 0);

		onChangeSession(erdosConsoleInstance);
	};

	const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();

		if ((e.button === 0 && isMacintosh && e.ctrlKey) || e.button === 2) {
			showContextMenu(e.clientX, e.clientY);
		}
	}

	const showContextMenu = async (x: number, y: number): Promise<void> => {
		const actions: IAction[] = [];

		actions.push({
			id: 'workbench.action.erdosConsole.renameConsoleSession',
			label: localize('erdos.console.renameInstance', "Rename..."),
			tooltip: '',
			class: undefined,
			enabled: true,
			run: () => showRenameInputField()
		});

		services.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => ({ x, y }),
			anchorAlignment: AnchorAlignment.LEFT,
			anchorAxisAlignment: AnchorAxisAlignment.VERTICAL
		});
	}

	const showRenameInputField = async () => {
		setIsRenamingSession(true);
		setTimeout(() => {
			if (inputRef.current) {
				inputRef.current.focus();
				inputRef.current.select();
			}
		}, 0);
	}

	const handleRenameSubmit = async () => {
		const newName = sessionName.trim();
		if (newName.length === 0 || newName === erdosConsoleInstance.sessionName) {
			setIsRenamingSession(false);
			setSessionName(erdosConsoleInstance.sessionName);
			return;
		}

		try {
			services.runtimeSessionService.updateSessionName(
				erdosConsoleInstance.sessionId,
				newName
			);
			setSessionName(newName);
		} catch (error) {
			services.notificationService.error(
				localize('erdos.console.renameSession.error',
					"Failed to rename session {0}: {1}",
					erdosConsoleInstance.sessionId,
					error
				)
			);
			setSessionName(erdosConsoleInstance.sessionName);
		} finally {
			setIsRenamingSession(false);
		}
	}

	const handleDeleteClick = async (e: MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation();
		deleteSession();
	}

	const deleteSession = async () => {
		setDeleteDisabled(true);
		try {
			if (services.runtimeSessionService.getSession(sessionId)) {
				await services.runtimeSessionService.deleteSession(sessionId);
			} else {
				services.erdosConsoleService.deleteErdosConsoleSession(sessionId);
			}
		} catch (error) {
			services.notificationService.error(
				localize('erdosDeleteSessionError', "Failed to delete session: {0}", error)
			);
			setDeleteDisabled(false);
		}
	}

	const handleDeleteMouseDown = (e: MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
	}

	const handleDeleteKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			deleteSession();
		}
	};

	const handleInputKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleRenameSubmit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			setIsRenamingSession(false);
			setSessionName(erdosConsoleInstance.sessionName);
		} else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
			e.preventDefault();
			e.stopPropagation();
			if (inputRef.current) {
				inputRef.current.select();
			}
		} else if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
			e.preventDefault();

			const hasSelection = inputRef.current &&
				typeof inputRef.current.selectionStart === 'number' &&
				typeof inputRef.current.selectionEnd === 'number';

			if (hasSelection) {
				const start = inputRef.current!.selectionStart as number;
				const end = inputRef.current!.selectionEnd as number;
				const selectedText = sessionName.substring(start, end);
				services.clipboardService.writeText(selectedText);

				const newValue = sessionName.substring(0, start) + sessionName.substring(end);
				setSessionName(newValue);
			}
		} else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
			e.preventDefault();

			const hasSelection = inputRef.current &&
				typeof inputRef.current.selectionStart === 'number' &&
				typeof inputRef.current.selectionEnd === 'number';

			if (hasSelection) {
				const start = inputRef.current!.selectionStart as number;
				const end = inputRef.current!.selectionEnd as number;
				const selectedText = sessionName.substring(start, end);
				services.clipboardService.writeText(selectedText);
			}
		} else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
			e.preventDefault();
			e.stopPropagation();
			const newSessionName = await services.clipboardService.readText();
			setSessionName(newSessionName);
		}
	};

	return (
		<div
			ref={tabRef}
			aria-controls={`console-panel-${erdosConsoleInstance.sessionMetadata.sessionId}`}
			aria-label={erdosConsoleInstance.sessionName}
			aria-selected={erdosConsoleContext.activeErdosConsoleInstance?.sessionMetadata.sessionId === sessionId}
			className={`tab-button ${erdosConsoleContext.activeErdosConsoleInstance?.sessionMetadata.sessionId === sessionId && 'tab-button--active'}`}
			data-testid={`console-tab-${erdosConsoleInstance.sessionMetadata.sessionId}`}
			role='tab'
			tabIndex={isActiveTab ? 0 : -1}
			onClick={handleClick}
			onMouseDown={handleMouseDown}
		>
			<ConsoleInstanceState erdosConsoleInstance={erdosConsoleInstance} />
			<img
				className='icon'
				src={`data:image/svg+xml;base64,${erdosConsoleInstance.runtimeMetadata.base64EncodedIconSvg}`}
			/>
			{isRenamingSession ? (
				<input
					ref={inputRef}
					className='session-name-input'
					type='text'
					value={sessionName}
					onBlur={handleRenameSubmit}
					onChange={e => setSessionName(e.target.value)}
					onClick={e => e.stopPropagation()}
					onKeyDown={handleInputKeyDown}
					onMouseDown={e => e.stopPropagation()}
				/>
			) : (
				<>
					<p className='session-name'>{sessionName}</p>
					{width > MINIMUM_ACTION_CONSOLE_TAB_WIDTH &&
						<button
							className='delete-button'
							data-testid='trash-session'
							disabled={deleteDisabled}
							onClick={handleDeleteClick}
							onKeyDown={handleDeleteKeyDown}
							onMouseDown={handleDeleteMouseDown}
						>
							<span className='codicon codicon-trash' />
						</button>
					}
				</>
			)}
		</div>
	)
}

interface ConsoleTabListProps {
	readonly width: number;
	readonly height: number;
}

export const ConsoleTabList = (props: ConsoleTabListProps) => {
	const services = useErdosReactServicesContext();
	const erdosConsoleContext = useErdosConsoleContext();
	const erdosConsoleTabFocusedContextKey = ErdosConsoleTabFocused.bindTo(services.contextKeyService);

	const tabListRef = useRef<HTMLDivElement>(null);

	const consoleInstances = Array.from(erdosConsoleContext.erdosConsoleInstances.values()).sort((a, b) => {
		return a.sessionMetadata.createdTimestamp - b.sessionMetadata.createdTimestamp;
	});

	useEffect(() => {
		const tabListElement = tabListRef.current;
		if (!tabListElement) {
			return;
		}

		const handleFocus = (e: FocusEvent) => {
			if (tabListElement.contains(e.target as Node)) {
				erdosConsoleTabFocusedContextKey.set(true);
			}
		};

		const handleBlur = (e: FocusEvent) => {
			if (!tabListElement?.contains(e.relatedTarget as Node)) {
				erdosConsoleTabFocusedContextKey.set(false);
			}
		};

		if (tabListElement) {
			tabListElement.addEventListener('focusin', handleFocus);
			tabListElement.addEventListener('focusout', handleBlur);
		}

		return () => {
			tabListElement.removeEventListener('focusin', handleFocus);
			tabListElement.removeEventListener('focusout', handleBlur);
			erdosConsoleTabFocusedContextKey.set(false);
		};
	}, [erdosConsoleTabFocusedContextKey]);

	const handleChangeForegroundSession = async (sessionId: string): Promise<void> => {
		const session =
			services.runtimeSessionService.getSession(sessionId);

		if (session) {
			services.runtimeSessionService.foregroundSession = session;
		} else {
			services.erdosConsoleService.setActiveErdosConsoleSession(sessionId);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!consoleInstances || consoleInstances.length === 0) {
			return;
		}

		const activeIndex = consoleInstances.findIndex(instance =>
			instance.sessionId === erdosConsoleContext.activeErdosConsoleInstance?.sessionMetadata.sessionId);

		let newIndex = activeIndex;
		switch (e.code) {
			case 'ArrowDown':
				e.preventDefault();
				e.stopPropagation();
				newIndex = Math.min(consoleInstances.length - 1, activeIndex + 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				e.stopPropagation();
				newIndex = Math.max(0, activeIndex - 1);
				break;
			case 'Home':
				e.preventDefault();
				e.stopPropagation();
				newIndex = 0;
				break;
			case 'End':
				e.preventDefault();
				e.stopPropagation();
				newIndex = consoleInstances.length - 1;
				break;
		}

		if (newIndex !== activeIndex && newIndex >= 0 && newIndex < consoleInstances.length) {
			const consoleInstance = consoleInstances[newIndex];
			handleChangeForegroundSession(consoleInstance.sessionId).then(() => {
				if (tabListRef.current) {
					const tabElements = tabListRef.current.children;
					if (tabElements && tabElements[newIndex]) {
						(tabElements[newIndex] as HTMLElement).focus();
					}
				}
			});
		}
	};

	return (
		<div
			ref={tabListRef}
			aria-orientation='vertical'
			className='tabs-container'
			role='tablist'
			style={{ height: props.height, width: props.width }}
			tabIndex={0}
			onKeyDown={handleKeyDown}
		>
			{consoleInstances.map((erdosConsoleInstance) =>
				<ConsoleTab
					key={erdosConsoleInstance.sessionId}
					erdosConsoleInstance={erdosConsoleInstance}
					width={props.width}
					onChangeSession={() => handleChangeForegroundSession(erdosConsoleInstance.sessionId)}
				/>
			)}
		</div>
	);
};
