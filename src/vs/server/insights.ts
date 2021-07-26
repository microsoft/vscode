/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appInsights from 'applicationinsights';
import * as https from 'https';
import * as http from 'http';
import * as os from 'os';

class Channel {
	public get _sender() {
		throw new Error('unimplemented');
	}
	public get _buffer() {
		throw new Error('unimplemented');
	}

	public setUseDiskRetryCaching(): void {
		throw new Error('unimplemented');
	}
	public send(): void {
		throw new Error('unimplemented');
	}
	public triggerSend(): void {
		throw new Error('unimplemented');
	}
}

export class TelemetryClient {
	public context: any = undefined;
	public commonProperties: any = undefined;
	public config: any = {};

	public channel: any = new Channel();

	public addTelemetryProcessor(): void {
		throw new Error('unimplemented');
	}

	public clearTelemetryProcessors(): void {
		throw new Error('unimplemented');
	}

	public runTelemetryProcessors(): void {
		throw new Error('unimplemented');
	}

	public trackTrace(): void {
		throw new Error('unimplemented');
	}

	public trackMetric(): void {
		throw new Error('unimplemented');
	}

	public trackException(): void {
		throw new Error('unimplemented');
	}

	public trackRequest(): void {
		throw new Error('unimplemented');
	}

	public trackDependency(): void {
		throw new Error('unimplemented');
	}

	public track(): void {
		throw new Error('unimplemented');
	}

	public trackNodeHttpRequestSync(): void {
		throw new Error('unimplemented');
	}

	public trackNodeHttpRequest(): void {
		throw new Error('unimplemented');
	}

	public trackNodeHttpDependency(): void {
		throw new Error('unimplemented');
	}

	public trackEvent(options: appInsights.Contracts.EventTelemetry): void {
		if (!options.properties) {
			options.properties = {};
		}
		if (!options.measurements) {
			options.measurements = {};
		}

		try {
			const cpus = os.cpus();
			options.measurements.cores = cpus.length;
			options.properties['common.cpuModel'] = cpus[0].model;
		} catch (error) { }

		try {
			options.measurements.memoryFree = os.freemem();
			options.measurements.memoryTotal = os.totalmem();
		} catch (error) { }

		try {
			options.properties['common.shell'] = os.userInfo().shell;
			options.properties['common.release'] = os.release();
			options.properties['common.arch'] = os.arch();
		} catch (error) { }

		try {
			const url = process.env.TELEMETRY_URL || 'https://v1.telemetry.coder.com/track';
			const request = (/^http:/.test(url) ? http : https).request(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
			});
			request.on('error', () => { /* We don't care. */ });
			request.write(JSON.stringify(options));
			request.end();
		} catch (error) { }
	}

	public flush(options: { callback: (v: string) => void }): void {
		if (options.callback) {
			options.callback('');
		}
	}
}
