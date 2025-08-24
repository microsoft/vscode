/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './startupStatus.css';

import React, { useEffect, useState } from 'react';

import { localize } from '../../../../../nls.js';
import { RuntimeStartupProgress } from './runtimeStartupProgress.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ProgressBar } from '../../../../../base/browser/ui/progressbar/progressbar.js';
import { RuntimeStartupPhase } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { IRuntimeAutoStartEvent } from '../../../../services/runtimeStartup/common/runtimeStartupService.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

const initalizing = localize('erdos.console.initializing', "Starting up");
const awaitingTrust = localize('erdos.console.awaitingTrust', "Consoles cannot start until the workspace is trusted");
const reconnecting = localize('erdos.console.reconnecting', "Reconnecting");
const starting = localize('erdos.console.starting', "Starting");
const discoveringIntrepreters = localize('erdos.console.discoveringInterpreters', "Discovering interpreters");

export const StartupStatus = () => {
	const services = useErdosReactServicesContext();

	const progressRef = React.useRef<HTMLDivElement>(null);

	const [discovered, setDiscovered] =
		useState(services.languageRuntimeService.registeredRuntimes.length);
	const [startupPhase, setStartupPhase] =
		useState(services.languageRuntimeService.startupPhase);
	const [runtimeStartupEvent, setRuntimeStartupEvent] =
		useState<IRuntimeAutoStartEvent | undefined>(undefined);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		let bar: ProgressBar | undefined;
		if (progressRef.current) {
			bar = new ProgressBar(progressRef.current);
			bar.infinite();
			disposableStore.add(bar);
		}

		disposableStore.add(
			services.languageRuntimeService.onDidRegisterRuntime(
				_runtime => {
					setDiscovered(
						services.languageRuntimeService.registeredRuntimes.length);
				}));

		disposableStore.add(
			services.languageRuntimeService.onDidChangeRuntimeStartupPhase(
				phase => {
					setStartupPhase(phase);
				}));

		disposableStore.add(
			services.runtimeStartupService.onWillAutoStartRuntime(
				evt => {
					setRuntimeStartupEvent(evt);
				}));

		return () => {
			bar?.done();
			disposableStore.dispose();
		};
	});

	return (
		<div className='startup-status'>
			<div ref={progressRef} className='progress'></div>
			{runtimeStartupEvent &&
				<RuntimeStartupProgress evt={runtimeStartupEvent} />
			}
			{startupPhase === RuntimeStartupPhase.Initializing &&
				<div className='initializing'>{initalizing}...</div>
			}
			{startupPhase === RuntimeStartupPhase.Reconnecting && !runtimeStartupEvent &&
				<div className='reconnecting'>{reconnecting}...</div>
			}
			{startupPhase === RuntimeStartupPhase.AwaitingTrust &&
				<div className='awaiting'>{awaitingTrust}...</div>
			}
			{startupPhase === RuntimeStartupPhase.Starting && !runtimeStartupEvent &&
				<div className='starting'>{starting}...</div>
			}
			{startupPhase === RuntimeStartupPhase.Discovering && !runtimeStartupEvent &&
				<div className='discovery'>{discoveringIntrepreters}
					{discovered > 0 && <span> ({discovered})</span>}...</div>
			}
		</div>
	);
};
