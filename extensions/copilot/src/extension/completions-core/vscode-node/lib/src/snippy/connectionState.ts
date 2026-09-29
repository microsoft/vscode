/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsLogTargetService } from '../logger';
import { getLastKnownEndpoints } from '../networkConfiguration';
import { ICompletionsFetcherService } from '../networking';
import { codeReferenceLogger } from './logger';

type ConnectionAPI = {
	listen: (cb: () => void) => { dispose: () => void };
	setConnected: () => void;
	setRetrying: () => void;
	setDisconnected: () => void;
	setDisabled: () => void;
	enableRetry: (accessor: ServicesAccessor, initialTimeout?: number) => void;
	isConnected: () => boolean;
	isDisconnected: () => boolean;
	isRetrying: () => boolean;
	isDisabled: () => boolean;
	isInitialWait: () => boolean;
};

type ConnectionState = {
	connection: 'connected' | 'disconnected' | 'retry' | 'disabled';
	maxAttempts: number;
	retryAttempts: number;
	initialWait: boolean;
};

const InitialTimeout = 3000;
const BaseRetryTime = 2;
const MaxRetryTime = 256;
const MaxAttempts = Math.log(MaxRetryTime) / Math.log(BaseRetryTime) / BaseRetryTime;

const state: ConnectionState = {
	connection: 'disabled',
	maxAttempts: MaxAttempts,
	retryAttempts: 0,
	initialWait: false,
};

let stateAPI: ConnectionAPI;
const handlers: Array<() => void> = [];

function registerConnectionState(): ConnectionAPI {
	if (stateAPI) {
		return stateAPI;
	}

	function subscribe(cb: () => void) {
		handlers.push(cb);
		return () => {
			const index = handlers.indexOf(cb);
			if (index !== -1) {
				handlers.splice(index, 1);
			}
		};
	}

	function afterUpdateConnection() {
		for (const handler of handlers) {
			handler();
		}
	}

	function updateConnection(status: ConnectionState['connection']) {
		if (state.connection === status) {
			return;
		}

		state.connection = status;
		afterUpdateConnection();
	}

	function isConnected() {
		return state.connection === 'connected';
	}

	function isDisconnected() {
		return state.connection === 'disconnected';
	}

	function isRetrying() {
		return state.connection === 'retry';
	}

	function isDisabled() {
		return state.connection === 'disabled';
	}

	function setConnected() {
		updateConnection('connected');
		setInitialWait(false);
	}

	function setDisconnected() {
		updateConnection('disconnected');
	}

	function setRetrying() {
		updateConnection('retry');
	}

	function setDisabled() {
		updateConnection('disabled');
	}

	function setInitialWait(enabled: boolean) {
		if (state.initialWait !== enabled) {
			state.initialWait = enabled;
		}
	}

	function enableRetry(accessor: ServicesAccessor, initialTimeout = InitialTimeout) {
		if (isRetrying()) {
			return;
		}

		setRetrying();
		setInitialWait(true);
		void attemptToPing(accessor, initialTimeout);
	}

	function isInitialWait() {
		return state.initialWait;
	}

	async function attemptToPing(accessor: ServicesAccessor, initialTimeout: number) {
		const logTarget = accessor.get(ICompletionsLogTargetService);
		const fetcher = accessor.get(ICompletionsFetcherService);
		const instantiationService = accessor.get(IInstantiationService);
		codeReferenceLogger.info(logTarget, `Attempting to reconnect in ${initialTimeout}ms.`);

		// Initial 3 second delay before attempting to reconnect to Snippy.
		await timeout(initialTimeout);
		setInitialWait(false);

		function succeedOrRetry(time: number) {
			if (time > MaxRetryTime) {
				codeReferenceLogger.info(logTarget, 'Max retry time reached, disabling.');
				setDisabled();
				return;
			}

			const tryAgain = async () => {
				state.retryAttempts = Math.min(state.retryAttempts + 1, MaxAttempts);

				try {
					codeReferenceLogger.info(logTarget, `Pinging service after ${time} second(s)`);
					const response = await fetcher.fetch(
						new URL('_ping', instantiationService.invokeFunction(getLastKnownEndpoints)['origin-tracker']).href,
						{
							callSite: 'snippy-ping',
							method: 'GET',
							headers: {
								'content-type': 'application/json',
							},
						}
					);

					if (response.status !== 200 || !response.ok) {
						succeedOrRetry(time ** 2);
					} else {
						codeReferenceLogger.info(logTarget, 'Successfully reconnected.');
						setConnected();
						return;
					}
				} catch (e) {
					succeedOrRetry(time ** 2);
				}
			};
			setTimeout(() => void tryAgain(), time * 1000);
		}

		codeReferenceLogger.info(logTarget, 'Attempting to reconnect.');

		succeedOrRetry(BaseRetryTime);
	}

	const timeout = (ms: number) => {
		return new Promise(resolve => setTimeout(resolve, ms));
	};

	function listen(cb: () => void) {
		const disposer = subscribe(cb);
		return { dispose: disposer };
	}

	stateAPI = {
		setConnected,
		setDisconnected,
		setRetrying,
		setDisabled,
		enableRetry,
		listen,
		isConnected,
		isDisconnected,
		isRetrying,
		isDisabled,
		isInitialWait,
	};

	return stateAPI;
}

export const ConnectionState = registerConnectionState();
