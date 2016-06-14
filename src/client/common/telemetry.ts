import {extensions} from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";

// Borrowed from omnisharpServer.ts (omnisharp-vscode)
export class Delays {
    immediateDelays: number = 0;      // 0-25 milliseconds
    nearImmediateDelays: number = 0;  // 26-50 milliseconds
    shortDelays: number = 0;          // 51-250 milliseconds
    mediumDelays: number = 0;         // 251-500 milliseconds
    idleDelays: number = 0;           // 501-1500 milliseconds
    nonFocusDelays: number = 0;       // 1501-3000 milliseconds
    bigDelays: number = 0;            // 3000+ milliseconds
    private startTime: number = Date.now();
    public stop() {
        let endTime = Date.now();
        let elapsedTime = endTime - this.startTime;

        if (elapsedTime <= 25) {
            this.immediateDelays += 1;
        }
        else if (elapsedTime <= 50) {
            this.nearImmediateDelays += 1;
        }
        else if (elapsedTime <= 250) {
            this.shortDelays += 1;
        }
        else if (elapsedTime <= 500) {
            this.mediumDelays += 1;
        }
        else if (elapsedTime <= 1500) {
            this.idleDelays += 1;
        }
        else if (elapsedTime <= 3000) {
            this.nonFocusDelays += 1;
        }
        else {
            this.bigDelays += 1;
        }
    }
    public toMeasures(): { [key: string]: number } {
        return {
            immedateDelays: this.immediateDelays,
            nearImmediateDelays: this.nearImmediateDelays,
            shortDelays: this.shortDelays,
            mediumDelays: this.mediumDelays,
            idleDelays: this.idleDelays,
            nonFocusDelays: this.nonFocusDelays
        };
    }
}

const extensionId = "donjayamanne.python";
const extension = extensions.getExtension(extensionId);
const extensionVersion = extension.packageJSON.version;
const aiKey = "fce7a3d5-4665-4404-b786-31a6306749a6";
let reporter = new TelemetryReporter(extensionId, extensionVersion, aiKey);

/**
 * Sends a telemetry event
 * @param {string} eventName The event name
 * @param {object} properties An associative array of strings
 * @param {object} measures An associative array of numbers
 */
export function sendTelemetryEvent(eventName: string, properties?: {
    [key: string]: string;
}, measures?: {
    [key: string]: number;
}) {
    reporter.sendTelemetryEvent.apply(reporter, arguments);
}

