/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Utility class for detecting WebGPU availability
 */
export class LocalAIWebGPUDetector {
	private static _cachedResult: boolean | undefined;

	/**
	 * Check if WebGPU is available in the current environment
	 * Result is cached after first check
	 */
	static async isAvailable(): Promise<boolean> {
		if (this._cachedResult !== undefined) {
			return this._cachedResult;
		}

		try {
			// Check if navigator.gpu exists
			if (!navigator.gpu) {
				this._cachedResult = false;
				return false;
			}

			// Try to request an adapter
			const adapter = await navigator.gpu.requestAdapter();
			if (!adapter) {
				this._cachedResult = false;
				return false;
			}

			// Try to create a device (this verifies GPU is functional)
			const device = await adapter.requestDevice();

			// Clean up immediately
			device.destroy();

			this._cachedResult = true;
			return true;
		} catch (error) {
			// Any error means WebGPU is not available
			this._cachedResult = false;
			return false;
		}
	}

	/**
	 * Reset the cached result (useful for testing)
	 */
	static resetCache(): void {
		this._cachedResult = undefined;
	}
}
