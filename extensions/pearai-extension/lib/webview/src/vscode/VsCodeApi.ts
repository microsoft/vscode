export type VsCodeApi = {
	/**
	 * Post a message (i.e. send arbitrary data) to the owner of the webview.
	 *
	 * @param message Arbitrary data (must be JSON serializable) to send to the extension context.
	 */
	postMessage<T>(message: T): void;

	/**
	 * Get the persistent state stored for this webview.
	 *
	 * @return The current state or `undefined` if no state has been set.
	 */
	getState<T>(): T | undefined;

	/**
	 * Set the persistent state stored for this webview.
	 *
	 * @param state New persisted state. This must be a JSON serializable object. Can be retrieved
	 * using {@link getState}.
	 *
	 */
	setState<T extends unknown | undefined>(state: T): T;
};

declare const acquireVsCodeApi: () => VsCodeApi;

// keep as a global in the view, since it can only be acquired once
export const vscodeApi = acquireVsCodeApi();
