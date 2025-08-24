/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './consoleInstanceInfoButton.css';

import React, { useEffect, useRef, useState } from 'react';

import { localize } from '../../../../../nls.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { useErdosConsoleContext } from '../erdosConsoleContext.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ErdosButton } from '../../../../../base/browser/ui/erdosComponents/button/erdosButton.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ActionBarButton } from '../../../../../platform/erdosActionBar/browser/components/actionBarButton.js';
import { ErdosModalPopup } from '../../../../browser/erdosComponents/erdosModalPopup/erdosModalPopup.js'
import { ErdosModalReactRenderer } from '../../../../../base/browser/erdosModalReactRenderer.js';
import { ILanguageRuntimeSession, LanguageRuntimeSessionChannel } from '../../../../services/runtimeSession/common/runtimeSessionService.js';

const erdosConsoleInfo = localize('erdos.console.info.label', "Console Information");
const localizeShowKernelOutputChannel = (channelName: string) => localize('erdos.console.info.showKernelOutputChannel', "Show {0} Output Channel", channelName);

const OutputChannelNames = {
	[LanguageRuntimeSessionChannel.Kernel]: localize('erdos.console.info.kernel', 'Kernel'),
	[LanguageRuntimeSessionChannel.Console]: localize('erdos.console.info.console', 'Console'),
	[LanguageRuntimeSessionChannel.LSP]: localize('erdos.console.info.lsp', 'LSP')
};

function intersectionOutputChannels(availableChannels: string[]): LanguageRuntimeSessionChannel[] {
	const outputChannels = Object.values(LanguageRuntimeSessionChannel);
	return outputChannels.filter(channel => availableChannels.includes(channel));
}

export const ConsoleInstanceInfoButton = () => {
	const services = useErdosReactServicesContext();
	const erdosConsoleContext = useErdosConsoleContext();

	const ref = useRef<HTMLButtonElement>(undefined!);

	const handlePressed = async () => {
		const sessionId =
			erdosConsoleContext.activeErdosConsoleInstance?.sessionId;
		if (!sessionId) {
			return;
		}
		const session = services.runtimeSessionService.getSession(sessionId);
		if (!session) {
			return;
		}

		let channels: LanguageRuntimeSessionChannel[] = []
		try {
			channels = intersectionOutputChannels(await session.listOutputChannels());
		} catch (err) {
			console.warn('Failed to get output channels', err);
		}

		const renderer = new ErdosModalReactRenderer({
			container: services.workbenchLayoutService.getContainer(DOM.getWindow(ref.current)),
			parent: ref.current
		});

		renderer.render(
			<ConsoleInstanceInfoModalPopup
				anchorElement={ref.current}
				channels={channels}
				renderer={renderer}
				session={session}
			/>
		);
	}

	return (
		<ActionBarButton
			ref={ref}
			align='right'
			ariaLabel={erdosConsoleInfo}
			dataTestId={`info-${erdosConsoleContext.activeErdosConsoleInstance?.sessionId ?? 'unknown'}`}
			icon={ThemeIcon.fromId('info')}
			tooltip={erdosConsoleInfo}
			onPressed={handlePressed}
		/>
	)
};

interface ConsoleInstanceInfoModalPopupProps {
	anchorElement: HTMLElement;
	renderer: ErdosModalReactRenderer;
	session: ILanguageRuntimeSession;
	channels: LanguageRuntimeSessionChannel[];
}

const ConsoleInstanceInfoModalPopup = (props: ConsoleInstanceInfoModalPopupProps) => {
	const [sessionState, setSessionState] = useState(() => props.session.getRuntimeState());

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(props.session.onDidChangeRuntimeState(state => {
			setSessionState(state);
		}));

		return () => disposableStore.dispose();
	}, [props.session, props.renderer]);

	const showKernelOutputChannelClickHandler = (channel: LanguageRuntimeSessionChannel) => {
		props.session.showOutput(channel);
		props.renderer.dispose();
	}

	return (
		<ErdosModalPopup
			anchorElement={props.anchorElement}
			fixedHeight={true}
			height='auto'
			keyboardNavigationStyle='menu'
			popupAlignment='auto'
			popupPosition='auto'
			renderer={props.renderer}
			width={400}
		>
			<div className='console-instance-info'>
				<div className='content'>
					<p className='line' data-testid='session-name'>{props.session.dynState.sessionName}</p>
					<div className='top-separator'>
						<p className='line' data-testid='session-id'>
							{(() => localize(
								'erdos.console.info.sessionId', 'Session ID: {0}',
								props.session.sessionId
							))()}
						</p>
						<p className='line' data-testid='session-state'>{(() => localize(
							'erdos.console.info.state', 'State: {0}',
							sessionState))()}
						</p>
					</div>
					<div className='top-separator'>
						<p className='line' data-testid='session-path'>{(() => localize(
							'erdos.console.info.runtimePath', 'Path: {0}',
							props.session.runtimeMetadata.runtimePath))()}
						</p>
						<p className='line' data-testid='session-source'>{(() => localize(
							'erdos.console.info.runtimeSource', 'Source: {0}',
							props.session.runtimeMetadata.runtimeSource))()}
						</p>
					</div>
				</div>
				<div className='top-separator actions'>
					{props.channels.map((channel, index) => (
						<ErdosButton
							key={`channel-${index}`}
							className='link'
							onPressed={() => showKernelOutputChannelClickHandler(channel)}
						>
							{localizeShowKernelOutputChannel(OutputChannelNames[channel])}
						</ErdosButton>
					))}
				</div>
			</div>
		</ErdosModalPopup>
	)
};
