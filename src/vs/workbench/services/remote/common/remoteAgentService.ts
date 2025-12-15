/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { RemoteAgentConnectionContext, IRemoteAgentEnvironment } from '../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IChannel, IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from '../../../../platform/diagnostics/common/diagnostics.js';
import { Event } from '../../../../base/common/event.js';
import { PersistentConnectionEvent } from '../../../../platform/remote/common/remoteAgentConnection.js';
import { ITelemetryData, TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { timeout } from '../../../../base/common/async.js';

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

	/**
	 * Gracefully ends the current connection, if any.
	 */
	endConnection(): Promise<void>;

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

	end(): Promise<void>;
	dispose(): void;
	getChannel<T extends IChannel>(channelName: string): T;
	withChannel<T extends IChannel, R>(channelName: string, callback: (channel: T) => Promise<R>): Promise<R>;
	registerChannel<T extends IServerChannel<RemoteAgentConnectionContext>>(channelName: string, channel: T): void;
	getInitialConnectionTimeMs(): Promise<number>;
	updateGraceTime(graceTime: number): void;
}

export interface IRemoteConnectionLatencyMeasurement {

	readonly initial: number | undefined;
	readonly current: number;
	readonly average: number;

	readonly high: boolean;
}

export const remoteConnectionLatencyMeasurer = new class {

	readonly maxSampleCount = 5;
	readonly sampleDelay = 2000;

	readonly initial: number[] = [];
	readonly maxInitialCount = 3;

	readonly average: number[] = [];
	readonly maxAverageCount = 100;

	readonly highLatencyMultiple = 2;
	readonly highLatencyMinThreshold = 500;
	readonly highLatencyMaxThreshold = 1500;

	lastMeasurement: IRemoteConnectionLatencyMeasurement | undefined = undefined;
	get latency() { return this.lastMeasurement; }

	async measure(remoteAgentService: IRemoteAgentService): Promise<IRemoteConnectionLatencyMeasurement | undefined> {
		let currentLatency = Infinity;

		// Measure up to samples count
		for (let i = 0; i < this.maxSampleCount; i++) {
			const rtt = await remoteAgentService.getRoundTripTime();
			if (rtt === undefined) {
				return undefined;
			}

			currentLatency = Math.min(currentLatency, rtt / 2 /* we want just one way, not round trip time */);
			await timeout(this.sampleDelay);
		}

		// Keep track of average latency
		this.average.push(currentLatency);
		if (this.average.length > this.maxAverageCount) {
			this.average.shift();
		}

		// Keep track of initial latency
		let initialLatency: number | undefined = undefined;
		if (this.initial.length < this.maxInitialCount) {
			this.initial.push(currentLatency);
		} else {
			initialLatency = this.initial.reduce((sum, value) => sum + value, 0) / this.initial.length;
		}

		// Remember as last measurement
		this.lastMeasurement = {
			initial: initialLatency,
			current: currentLatency,
			average: this.average.reduce((sum, value) => sum + value, 0) / this.average.length,
			high: (() => {

				// based on the initial, average and current latency, try to decide
				// if the connection has high latency
				// Some rules:
				// - we require the initial latency to be computed
				// - we only consider latency above highLatencyMinThreshold as potentially high
				// - we require the current latency to be above the average latency by a factor of highLatencyMultiple
				// - but not if the latency is actually above highLatencyMaxThreshold

				if (typeof initialLatency === 'undefined') {
					return false;
				}

				if (currentLatency > this.highLatencyMaxThreshold) {
					return true;
				}

				if (currentLatency > this.highLatencyMinThreshold && currentLatency > initialLatency * this.highLatencyMultiple) {
					return true;
				}

				return false;
			})()
		};

		return this.lastMeasurement;
	}
};
