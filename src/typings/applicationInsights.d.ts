/**
 * The singleton meta class for the default client of the client. This class is used to setup/start and configure
 * the auto-collection behavior of the application insights module.
 */
declare module ApplicationInsights {

    /**
    * The default client, initialized when setup was called. To initialize a different client
    * with its own configuration, use `new TelemetryClient(instrumentationKey?)`.
    */
    var defaultClient: TelemetryClient;
    /**
     * Initializes the default client. Should be called after setting
     * configuration options.
     *
     * @param instrumentationKey the instrumentation key to use. Optional, if
     * this is not specified, the value will be read from the environment
     * variable APPINSIGHTS_INSTRUMENTATIONKEY.
     * @returns {Configuration} the configuration class to initialize
     * and start the SDK.
     */
    function setup(instrumentationKey?: string): typeof Configuration;
    /**
     * Starts automatic collection of telemetry. Prior to calling start no
     * telemetry will be *automatically* collected, though manual collection
     * is enabled.
     * @returns {ApplicationInsights} this class
     */
    function start(): typeof Configuration;
    /**
     * The active configuration for global SDK behaviors, such as autocollection.
     */
    class Configuration {
        static start: typeof start;
        /**
         * Sets the state of console and logger tracking (enabled by default for third-party loggers only)
         * @param value if true logger activity will be sent to Application Insights
         * @param collectConsoleLog if true, logger autocollection will include console.log calls (default false)
         * @returns {Configuration} this class
         */
        static setAutoCollectConsole(value: boolean, collectConsoleLog?: boolean): typeof Configuration;
        /**
         * Sets the state of exception tracking (enabled by default)
         * @param value if true uncaught exceptions will be sent to Application Insights
         * @returns {Configuration} this class
         */
        static setAutoCollectExceptions(value: boolean): typeof Configuration;
        /**
         * Sets the state of performance tracking (enabled by default)
         * @param value if true performance counters will be collected every second and sent to Application Insights
         * @returns {Configuration} this class
         */
        static setAutoCollectPerformance(value: boolean): typeof Configuration;
        /**
         * Sets the state of request tracking (enabled by default)
         * @param value if true requests will be sent to Application Insights
         * @returns {Configuration} this class
         */
        static setAutoCollectRequests(value: boolean): typeof Configuration;
        /**
         * Sets the state of dependency tracking (enabled by default)
         * @param value if true dependencies will be sent to Application Insights
         * @returns {Configuration} this class
         */
        static setAutoCollectDependencies(value: boolean): typeof Configuration;
        /**
         * Sets the state of automatic dependency correlation (enabled by default)
         * @param value if true dependencies will be correlated with requests
         * @returns {Configuration} this class
         */
        static setAutoDependencyCorrelation(value: boolean): typeof Configuration;
        /**
         * Enable or disable disk-backed retry caching to cache events when client is offline (enabled by default)
         * Note that this method only applies to the default client. Disk-backed retry caching is disabled by default for additional clients.
         * For enable for additional clients, use client.channel.setUseDiskRetryCaching(true).
         * These cached events are stored in your system or user's temporary directory and access restricted to your user when possible.
         * @param value if true events that occured while client is offline will be cached on disk
         * @param resendInterval The wait interval for resending cached events.
         * @param maxBytesOnDisk The maximum size (in bytes) that the created temporary directory for cache events can grow to, before caching is disabled.
         * @returns {Configuration} this class
         */
        static setUseDiskRetryCaching(value: boolean, resendInterval?: number, maxBytesOnDisk?: number): typeof Configuration;
        /**
         * Enables debug and warning logging for AppInsights itself.
         * @param enableDebugLogging if true, enables debug logging
         * @param enableWarningLogging if true, enables warning logging
         * @returns {Configuration} this class
         */
        static setInternalLogging(enableDebugLogging?: boolean, enableWarningLogging?: boolean): typeof Configuration;
    }
    /**
     * Disposes the default client and all the auto collectors so they can be reinitialized with different configuration
    */
    function dispose(): void;

    interface ITelemetryClient {
        config: Config;
        channel: Channel;
        /**
         * Log a user action or other occurrence.
         * @param telemetry      Object encapsulating tracking options
         */
        trackEvent(telemetry: EventTelemetry): void;
        /**
         * Immediately send all queued telemetry.
         * @param options Flush options, including indicator whether app is crashing and callback
         */
        flush(options?: FlushOptions): void;

    }

    class TelemetryClient implements ITelemetryClient {
        config: Config;
        channel: Channel;
        /**
         * Constructs a new client of the client
         * @param iKey the instrumentation key to use (read from environment variable if not specified)
         */
        constructor(iKey?: string);
        /**
         * Log a user action or other occurrence.
         * @param telemetry      Object encapsulating tracking options
         */
        trackEvent(telemetry: EventTelemetry): void;
        /**
         * Immediately send all queued telemetry.
         * @param options Flush options, including indicator whether app is crashing and callback
         */
        flush(options?: FlushOptions): void;

    }

    class Config {
        static ENV_azurePrefix: string;
        static ENV_iKey: string;
        static legacy_ENV_iKey: string;
        static ENV_profileQueryEndpoint: string;
        static ENV_http_proxy: string;
        static ENV_https_proxy: string;
        /** An identifier for your Application Insights resource */
        instrumentationKey: string;
        /** The id for cross-component correlation. READ ONLY. */
        correlationId: string;
        /** The ingestion endpoint to send telemetry payloads to */
        endpointUrl: string;
        /** The maximum number of telemetry items to include in a payload to the ingestion endpoint (Default 250) */
        maxBatchSize: number;
        /** The maximum amount of time to wait for a payload to reach maxBatchSize (Default 15000) */
        maxBatchIntervalMs: number;
        /** A flag indicating if telemetry transmission is disabled (Default false) */
        disableAppInsights: boolean;
        /** The percentage of telemetry items tracked that should be transmitted (Default 100) */
        samplingPercentage: number;
        /** The time to wait before retrying to retrieve the id for cross-component correlation (Default 30000) */
        correlationIdRetryIntervalMs: number;
        /** A list of domains to exclude from cross-component header injection */
        correlationHeaderExcludedDomains: string[];
        /** A proxy server for SDK HTTP traffic (Optional, Default pulled from `http_proxy` environment variable) */
        proxyHttpUrl: string;
        /** A proxy server for SDK HTTPS traffic (Optional, Default pulled from `https_proxy` environment variable) */
        proxyHttpsUrl: string;
    }

    interface Channel {
        /**
    * Enable or disable disk-backed retry caching to cache events when client is offline (enabled by default)
    * These cached events are stored in your system or user's temporary directory and access restricted to your user when possible.
    * @param value if true events that occured while client is offline will be cached on disk
    * @param resendInterval The wait interval for resending cached events.
    * @param maxBytesOnDisk The maximum size (in bytes) that the created temporary directory for cache events can grow to, before caching is disabled.
    * @returns {Configuration} this class
    */
        setUseDiskRetryCaching(value: boolean, resendInterval?: number, maxBytesOnDisk?: number): void;
    }

    /**
     * Telemetry about the custom event of interest, such application workflow event, business logic event (purchase) and anything that
     * you would like to track and aggregate by count. Event can contain measurements such as purchase amount associated with purchase event
     */
    interface EventTelemetry {
        /**
         * Name of the event
         */
        name: string;
        /**
         * Metrics associated with this event, displayed in Metrics Explorer on the portal.
         */
        measurements?: {
            [key: string]: number;
        };
        /**
         * Additional data used to filter events and metrics in the portal. Defaults to empty.
         */
        properties?: {
            [key: string]: string;
        };
    }

    /**
     * Encapsulates options passed into client.flush() function
     */
    interface FlushOptions {
        /**
         * Flag indicating whether application is crashing. When this flag is set to true
         * and storing data locally is enabled, Node.JS SDK will attempt to store data on disk
         */
        isAppCrashing?: boolean;
        /**
         * Callback that will be invoked with the response from server, in case of isAppCrashing set to true,
         * with immediate notification that data was stored
         */
        callback?: (v: string) => void;
    }
}

declare module 'applicationinsights' {
    export = ApplicationInsights;
}
