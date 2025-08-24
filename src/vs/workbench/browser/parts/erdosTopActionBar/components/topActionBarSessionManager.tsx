/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './topActionBarSessionManager.css';

import React, { useEffect, useState } from 'react';

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { LanguageRuntimeSessionMode } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { ActionBarCommandButton } from '../../../../../platform/erdosActionBar/browser/components/actionBarCommandButton.js';
import { CommandCenter } from '../../../../../platform/commandCenter/common/commandCenter.js';
import { ILanguageRuntimeSession } from '../../../../services/runtimeSession/common/runtimeSessionService.js';
import { localize } from '../../../../../nls.js';
import { LANGUAGE_RUNTIME_SELECT_SESSION_ID, LANGUAGE_RUNTIME_START_NEW_SESSION_ID } from '../../../../contrib/languageRuntime/browser/languageRuntimeActions.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

const startSession = localize('erdos.console.startSession', "Start Session");

export const TopActionBarSessionManager = () => {
	const services = useErdosReactServicesContext();

	const [activeSession, setActiveSession] = useState<ILanguageRuntimeSession>();
	const [labelText, setLabelText] = useState<string>(activeSession?.dynState?.sessionName ?? startSession);

	const hasActiveConsoleSessions = services.runtimeSessionService.activeSessions.find(
		session => session.metadata.sessionMode === LanguageRuntimeSessionMode.Console);
	const command = hasActiveConsoleSessions
		? LANGUAGE_RUNTIME_SELECT_SESSION_ID
		: LANGUAGE_RUNTIME_START_NEW_SESSION_ID;

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(
			services.runtimeSessionService.onDidChangeForegroundSession(session => {
				if (session?.metadata.sessionMode === LanguageRuntimeSessionMode.Console) {
					setActiveSession(
						services.runtimeSessionService.foregroundSession);
					setLabelText(session.dynState.sessionName);
				} else if (!session) {
					setActiveSession(undefined);
					setLabelText(startSession);
				}
			})
		);

		disposableStore.add(
			services.runtimeSessionService.onDidUpdateSessionName(session => {
				if (session.sessionId === services.runtimeSessionService.foregroundSession?.sessionId) {
					setLabelText(session.dynState.sessionName);
				}
			})
		);

		return () => disposableStore.dispose();
	}, [services.runtimeSessionService]);

	return (
		<ActionBarCommandButton
			ariaLabel={CommandCenter.title(command)}
			border={true}
			commandId={command}
			height={24}
			label={labelText}
			{
			...(
				activeSession
					? { iconImageSrc: `data:image/svg+xml;base64,${activeSession?.runtimeMetadata.base64EncodedIconSvg}` }
					: { iconId: 'arrow-swap' }
			)
			}
		/>
	);
}
