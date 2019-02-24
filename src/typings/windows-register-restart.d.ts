
declare module 'windows-register-restart' {
	export enum NoRestart {
		/**
		 * Do not restart the process if it terminates due to an unhandled exception.
		 */
		OnCrash = 1,
		/**
		 * Do not restart the process if it terminates due to the application not responding.
		 */
		OnHang = 2,
		/**
		 * Do not restart the process if it terminates due to the installation of an update.
		 */
		OnPatch = 4,
		/**
		 * Do not restart the process if the computer is restarted as the result of an update.
		 */
		OnReboot = 8
	}

	/**
	 * Registers the active instance of an application for restart.
	 *
	 * @param commandLine The command line arguments for the application when it is restarted. Do not include the name of the executable in the command line; the function adds it for you.
	 * @param noRestart Flags that are used to prevent the application from restarting in specific scenarios.
	 *
	 * @returns Whether the registration was succesfull.
	 */
	export function registerApplicationRestart(commandLine?: string, noRestart?: NoRestart): boolean;

	/**
	 * Removes the active instance of an application from the restart list.
	 */
	export function unregisterApplicationRestart(): boolean;
}