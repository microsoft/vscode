import { AppInsightsCore, IExtendedTelemetryItem, ITelemetryItem } from '@microsoft/1ds-core-js';
import * as https from 'https';
import * as http from 'http';
import * as os from 'os';

interface SystemInfo {
	measurements: Record<string, number | undefined>;
	properties: Record<string, string | boolean | null | undefined>;
}

export class TelemetryClient extends AppInsightsCore {
	private readonly systemInfo: SystemInfo = {
		measurements: {},
		properties: {},
	};

	public constructor(
		private readonly endpoint: string,
		machineId: string,
		isContainer: boolean | undefined) {
		super();

		// os.cpus() can take a very long time sometimes (personally I see 1-2
		// seconds in a Coder workspace).  This adds up significantly, especially
		// when many telemetry requests are sent during startup, which can cause
		// connection timeouts.  Try to cache as much as we can.
		try {
			const cpus = os.cpus();
			this.systemInfo.measurements.cores = cpus.length;
			this.systemInfo.properties['common.cpuModel'] = cpus[0].model;
		} catch (error) {}

		try {
			this.systemInfo.properties['common.shell'] = os.userInfo().shell;
			this.systemInfo.properties['common.release'] = os.release();
			this.systemInfo.properties['common.arch'] = os.arch();
		} catch (error) {}

		this.systemInfo.properties['common.remoteMachineId'] = machineId;
		this.systemInfo.properties['common.isContainer'] = isContainer;
	}

	public override track(item: IExtendedTelemetryItem | ITelemetryItem): void {
		const options = item.baseData || {}
		options.measurements = {
			...(options.measurements || {}),
			...this.systemInfo.measurements,
		}
		options.properties = {
			...(options.properties || {}),
			...this.systemInfo.properties,
		}

		try {
			options.measurements.memoryFree = os.freemem();
			options.measurements.memoryTotal = os.totalmem();
		} catch (error) {}

		try {
			const request = (/^http:/.test(this.endpoint) ? http : https).request(this.endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
			});
			request.on('error', () => { /* We don't care. */ });
			request.write(JSON.stringify(options));
			request.end();
		} catch (error) {}
	}
}
