declare module "vscode-extension-telemetry" {
    export default class TelemetryReporter {
        private extensionId;
        private extensionVersion;
        private appInsightsClient;
        private commonProperties;
        private static SQM_KEY;
        private static REGISTRY_USERID_VALUE;
        private static REGISTRY_MACHINEID_VALUE;

        /**
         * Constructs a new telemetry reporter
         * @param {string} extensionId All events will be prefixed with this event name
         * @param {string} extensionVersion Extension version to be reported with each event
         * @param {string} key The application insights key
         */
        constructor(extensionId: string, extensionVersion: string, key: string);
        private setupAIClient(client);
        private loadVSCodeCommonProperties(machineId, sessionId, version);
        private loadCommonProperties();
        private addCommonProperties(properties);
        private getWinRegKeyData(key, name, hive, callback);

        /**
         * Sends a telemetry event
         * @param {string} eventName The event name
         * @param {object} properties An associative array of strings
         * @param {object} measures An associative array of numbers
         */
        sendTelemetryEvent(eventName: string, properties?: {
            [key: string]: string;
        }, measures?: {
            [key: string]: number;
        }): void;
    }
}