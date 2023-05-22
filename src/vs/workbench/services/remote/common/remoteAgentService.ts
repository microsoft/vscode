/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { RemoteAgentConnectionContext, IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { Event } from 'vs/base/common/event';
import { PersistentConnectionEvent } from 'vs/platform/remote/common/remoteAgentConnection';
import { ITelemetryData, TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { timeout } from 'vs/base/common/async';

export const IRemoteAgentService = createDecorator<IRemoteAgentService>('remoteAgentService');

export interface IRemoteAgentService {
	readonly _serviceBrand: undefined;

	getConnection(): IRemoteAgentConnection | null;
	/**
	 * Get the remote environment. In case of an error, returns `null`.
	 */
	getEnvironment(): Promise<IRemoteAgentEnvironment | null>;
	/**
	 * Get the remote environment. Can return an error.
	 */
	getRawEnvironment(): Promise<IRemoteAgentEnvironment | null>;
	/**
	 * Get exit information for a remote extension host.
	 */
	getExtensionHostExitInfo(reconnectionToken: string): Promise<IExtensionHostExitInfo | null>;

	/**
	 * Gets the round trip time from the remote extension host. Note that this
	 * may be delayed if the extension host is busy.
	 */
	getRoundTripTime(): Promise<number | undefined>;

	getDiagnosticInfo(options: IDiagnosticInfoOptions): Promise<IDiagnosticInfo | undefined>;
	updateTelemetryLevel(telemetryLevel: TelemetryLevel): Promise<void>;
	logTelemetry(eventName: string, data?: ITelemetryData): Promise<void>;
	flushTelemetry(): Promise<void>;
}

export interface IExtensionHostExitInfo {
	code: number;
	signal: string;
}

export interface IRemoteAgentConnection {
	readonly remoteAuthority: string;

	readonly onReconnecting: Event<void>;
	readonly onDidStateChange: Event<PersistentConnectionEvent>;

	dispose(): void;
	getChannel<T extends IChannel>(channelName: string): T;
	withChannel<T extends IChannel, R>(channelName: string, callback: (channel: T) => Promise<R>): Promise<R>;
	registerChannel<T extends IServerChannel<RemoteAgentConnectionContext>>(channelName: string, channel: T): void;
	getInitialConnectionTimeMs(): Promise<number>;
}

const ROUNDTRIP_MEASURE_SAMPLES = 5;
const ROUNDTRIP_MEASURE_DELAY = 2000;
const ROUNDTRIP_MEASURE_INITIAL: number[] = [];
const ROUNDTRIP_MEASURE_INITIAL_COUNT = 3;
const ROUNDTRIP_MEASURE_AVERAGE: number[] = [];
const ROUNDTRIP_MEASURE_AVERAGE_COUNT = 100;

export async function measureRoundTripTime(remoteAgentService: IRemoteAgentService, samples = ROUNDTRIP_MEASURE_SAMPLES, interval = ROUNDTRIP_MEASURE_DELAY): Promise<{ initial: number | undefined; current: number; average: number } | undefined> {
	let currentLatency = Infinity;

	// Measure up to samples count
	for (let i = 0; i < samples; i++) {
		const rtt = await remoteAgentService.getRoundTripTime();
		if (rtt === undefined) {
			return undefined;
		}

		currentLatency = Math.min(currentLatency, rtt / 2 /* we want just one way, not round trip time */);
		await timeout(interval);
	}

	// Keep result stored for averages
	ROUNDTRIP_MEASURE_AVERAGE.push(currentLatency);
	if (ROUNDTRIP_MEASURE_AVERAGE.length > ROUNDTRIP_MEASURE_AVERAGE_COUNT) {
		ROUNDTRIP_MEASURE_AVERAGE.shift();
	}

	// Keep track of initial latency
	let initialLatency: number | undefined = undefined;
	if (ROUNDTRIP_MEASURE_INITIAL.length < ROUNDTRIP_MEASURE_INITIAL_COUNT) {
		ROUNDTRIP_MEASURE_INITIAL.push(currentLatency);
	} else {
		initialLatency = ROUNDTRIP_MEASURE_INITIAL.reduce((sum, value) => sum + value, 0) / ROUNDTRIP_MEASURE_INITIAL.length;
	}

	return {
		initial: initialLatency,
		current: currentLatency,
		average: ROUNDTRIP_MEASURE_AVERAGE.reduce((sum, value) => sum + value, 0) / ROUNDTRIP_MEASURE_AVERAGE.length
	};
}
