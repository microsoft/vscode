/**
 * Copyright (c) 2017, Daniel Imms (MIT License).
 * Copyright (c) 2018, Microsoft Corporation (MIT License).
 */

declare module 'node-pty' {
	/**
	 * Forks a process as a pseudoterminal.
	 * @param file The file to launch.
	 * @param args The file's arguments as argv (string[]) or in a pre-escaped CommandLine format
	 * (string). Note that the CommandLine option is only available on Windows and is expected to be
	 * escaped properly.
	 * @param options The options of the terminal.
	 * @see CommandLineToArgvW https://msdn.microsoft.com/en-us/library/windows/desktop/bb776391(v=vs.85).aspx
	 * @see Parsing C++ Comamnd-Line Arguments https://msdn.microsoft.com/en-us/library/17w5ykft.aspx
	 * @see GetCommandLine https://msdn.microsoft.com/en-us/library/windows/desktop/ms683156.aspx
	 */
	export function spawn(file: string, args: string[] | string, options: IPtyForkOptions | IWindowsPtyForkOptions): IPty;

	export interface IPtyForkOptions {
		name?: string;
		cols?: number;
		rows?: number;
		cwd?: string;
		env?: { [key: string]: string };
		uid?: number;
		gid?: number;
		encoding?: string;
	}

	export interface IWindowsPtyForkOptions {
		name?: string;
		cols?: number;
		rows?: number;
		cwd?: string;
		env?: { [key: string]: string };
		encoding?: string;
		/**
		 * Whether to use the experimental ConPTY system on Windows. When this is not set, ConPTY will
		 * be used when the Windows build number is >= 18309 (it's available in 17134 and 17692 but is
		 * too unstable to enable by default).
		 *
		 * This setting does nothing on non-Windows.
		 */
		experimentalUseConpty?: boolean;
		/**
		 * Whether to use PSEUDOCONSOLE_INHERIT_CURSOR in conpty.
		 * @see https://docs.microsoft.com/en-us/windows/console/createpseudoconsole
		 */
		conptyInheritCursor?: boolean;
	}

	/**
	 * An interface representing a pseudoterminal, on Windows this is emulated via the winpty library.
	 */
	export interface IPty {
		/**
		 * The process ID of the outer process.
		 */
		readonly pid: number;

		/**
		 * The column size in characters.
		 */
		readonly cols: number;

		/**
		 * The row size in characters.
		 */
		readonly rows: number;

		/**
		 * The title of the active process.
		 */
		readonly process: string;

		/**
		 * Adds an event listener for when a data event fires. This happens when data is returned from
		 * the pty.
		 * @returns an `IDisposable` to stop listening.
		 */
		readonly onData: IEvent<string>;

		/**
		 * Adds an event listener for when an exit event fires. This happens when the pty exits.
		 * @returns an `IDisposable` to stop listening.
		 */
		readonly onExit: IEvent<{ exitCode: number, signal?: number }>;

		/**
		 * Adds a listener to the data event, fired when data is returned from the pty.
		 * @param event The name of the event.
		 * @param listener The callback function.
		 * @deprecated Use IPty.onData
		 */
		on(event: 'data', listener: (data: string) => void): void;

		/**
		 * Adds a listener to the exit event, fired when the pty exits.
		 * @param event The name of the event.
		 * @param listener The callback function, exitCode is the exit code of the process and signal is
		 * the signal that triggered the exit. signal is not supported on Windows.
		 * @deprecated Use IPty.onExit
		 */
		on(event: 'exit', listener: (exitCode: number, signal?: number) => void): void;

		/**
		 * Resizes the dimensions of the pty.
		 * @param columns THe number of columns to use.
		 * @param rows The number of rows to use.
		 */
		resize(columns: number, rows: number): void;

		/**
		 * Writes data to the pty.
		 * @param data The data to write.
		 */
		write(data: string): void;

		/**
		 * Kills the pty.
		 * @param signal The signal to use, defaults to SIGHUP. This parameter is not supported on
		 * Windows.
		 * @throws Will throw when signal is used on Windows.
		 */
		kill(signal?: string): void;
	}

	/**
	 * An object that can be disposed via a dispose function.
	 */
	export interface IDisposable {
		dispose(): void;
	}

	/**
	 * An event that can be listened to.
	 * @returns an `IDisposable` to stop listening.
	 */
	export interface IEvent<T> {
		(listener: (e: T) => any): IDisposable;
	}
}
