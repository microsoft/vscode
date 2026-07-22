/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace env {

		/**
		 * Namespace for power-related APIs including monitoring system power state
		 * and preventing the system from entering low-power modes.
		 *
		 * Note: These APIs are only fully functional in the desktop version of the editor.
		 * In web or remote scenarios, events will not fire and queries return default values.
		 */
		export namespace power {

			// === Events ===

			/**
			 * Fires when the system is suspending (going to sleep).
			 */
			export const onDidSuspend: Event<void>;

			/**
			 * Fires when the system is resuming from sleep.
			 */
			export const onDidResume: Event<void>;

			/**
			 * Fires when the system's battery power state changes.
			 * The event value is `true` when on battery power, `false` when on AC power.
			 *
			 * Note: Only available on macOS and Windows.
			 */
			export const onDidChangeOnBatteryPower: Event<boolean>;

			/**
			 * Fires when the system's thermal state changes.
			 *
			 * Apps may react to the new state by reducing expensive computing tasks
			 * (e.g., video encoding), or notifying the user.
			 *
			 * Note: Only available on macOS.
			 */
			export const onDidChangeThermalState: Event<ThermalState>;

			/**
			 * Fires when the operating system's advertised CPU speed limit changes.
			 * The event value is the speed limit in percent (values below 100 indicate
			 * the system is impairing processing power due to thermal management).
			 *
			 * Note: Only available on macOS and Windows.
			 */
			export const onDidChangeSpeedLimit: Event<number>;

			/**
			 * Fires when the system is about to shut down or reboot.
			 *
			 * Note: Only available on Linux and macOS.
			 */
			export const onWillShutdown: Event<void>;

			/**
			 * Fires when the system screen is about to be locked.
			 *
			 * Note: Only available on macOS and Windows.
			 */
			export const onDidLockScreen: Event<void>;

			/**
			 * Fires when the system screen is unlocked.
			 *
			 * Note: Only available on macOS and Windows.
			 */
			export const onDidUnlockScreen: Event<void>;

			// === Methods ===

			/**
			 * Gets the system's current idle state.
			 *
			 * @param idleThresholdSeconds The amount of time (in seconds) before the system
			 * is considered idle.
			 * @returns The system's current idle state.
			 */
			export function getSystemIdleState(idleThresholdSeconds: number): Thenable<SystemIdleState>;

			/**
			 * Gets the system's idle time in seconds.
			 *
			 * @returns The number of seconds the system has been idle.
			 */
			export function getSystemIdleTime(): Thenable<number>;

			/**
			 * Gets the system's current thermal state.
			 *
			 * Note: Only available on macOS. Returns `'unknown'` on other platforms.
			 *
			 * @returns The system's current thermal state.
			 */
			export function getCurrentThermalState(): Thenable<ThermalState>;

			/**
			 * Checks whether the system is currently on battery power.
			 *
			 * @returns `true` if the system is on battery power, `false` otherwise.
			 */
			export function isOnBatteryPower(): Thenable<boolean>;

			// === Power Save Blocker ===

			/**
			 * Starts preventing the system from entering lower-power mode.
			 *
			 * @param type The type of power save blocker:
			 * - `'prevent-app-suspension'`: Prevents the application from being suspended.
			 *   Keeps the system active but allows the screen to turn off.
			 *   Example use cases: downloading a file or playing audio.
			 * - `'prevent-display-sleep'`: Prevents the display from going to sleep.
			 *   Keeps the system and screen active.
			 *   Example use case: playing video.
			 *
			 * Note: `'prevent-display-sleep'` has higher precedence over `'prevent-app-suspension'`.
			 *
			 * @returns A {@link PowerSaveBlocker} that can be disposed to stop blocking.
			 */
			export function startPowerSaveBlocker(type: PowerSaveBlockerType): Thenable<PowerSaveBlocker>;

			// === Types ===

			/**
			 * Represents the system's idle state.
			 */
			export type SystemIdleState = 'active' | 'idle' | 'locked' | 'unknown';

			/**
			 * Represents the system's thermal state.
			 */
			export type ThermalState = 'unknown' | 'nominal' | 'fair' | 'serious' | 'critical';

			/**
			 * The type of power save blocker.
			 */
			export type PowerSaveBlockerType = 'prevent-app-suspension' | 'prevent-display-sleep';

			/**
			 * A power save blocker that prevents the system from entering low-power mode.
			 * Dispose to stop blocking.
			 */
			export interface PowerSaveBlocker extends Disposable {
				/**
				 * The unique identifier for this power save blocker.
				 */
				readonly id: number;

				/**
				 * Whether this power save blocker is currently active.
				 */
				readonly isStarted: boolean;
			}
		}
	}
}
