/**
 * The singleton meta class for the default client of the client. This class is used to setup/start and configure
 * the auto-collection behavior of the application insights module.
 */
declare module ApplicationInsights {
	var client: any;
    /**
     * Initializes a client with the given instrumentation key, if this is not specified, the value will be
     * read from the environment variable APPINSIGHTS_INSTRUMENTATIONKEY
     * @returns {ApplicationInsights/Client} a new client
     */
	function getClient(instrumentationKey?: string): any /*Client*/;
    /**
     * Initializes the default client of the client and sets the default configuration
     * @param instrumentationKey the instrumentation key to use. Optional, if this is not specified, the value will be
     * read from the environment variable APPINSIGHTS_INSTRUMENTATIONKEY
     * @returns {ApplicationInsights} this class
     */
	function setup(instrumentationKey?: string): typeof ApplicationInsights;
    /**
     * Starts automatic collection of telemetry. Prior to calling start no telemetry will be collected
     * @returns {ApplicationInsights} this class
     */
	function start(): typeof ApplicationInsights;
    /**
     * Sets the state of console tracking (enabled by default)
     * @param value if true console activity will be sent to Application Insights
     * @returns {ApplicationInsights} this class
     */
	function setAutoCollectConsole(value: boolean): typeof ApplicationInsights;
    /**
     * Sets the state of exception tracking (enabled by default)
     * @param value if true uncaught exceptions will be sent to Application Insights
     * @returns {ApplicationInsights} this class
     */
	function setAutoCollectExceptions(value: boolean): typeof ApplicationInsights;
    /**
     * Sets the state of performance tracking (enabled by default)
     * @param value if true performance counters will be collected every second and sent to Application Insights
     * @returns {ApplicationInsights} this class
     */
	function setAutoCollectPerformance(value: boolean): typeof ApplicationInsights;
    /**
     * Sets the state of request tracking (enabled by default)
     * @param value if true requests will be sent to Application Insights
     * @returns {ApplicationInsights} this class
     */
	function setAutoCollectRequests(value: boolean): typeof ApplicationInsights;

	/**
	* Sets the state of enabling offline mode to cache event when client is offline (disabled by default)
	* @param value if true events that happen while client is offline will be cahced on disk,
	* client will retry to send events when back online
	* @returns {ApplicationInsights} this class
	*/
	function setOfflineMode(value: boolean): typeof ApplicationInsights;
    /**
     * Enables verbose debug logging
     * @returns {ApplicationInsights} this class
     */
	function enableVerboseLogging(): typeof ApplicationInsights;
}

declare module 'applicationinsights' {
	export = ApplicationInsights;
}
