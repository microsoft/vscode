/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IBasePtyForkOptions {
	/**
	 * Name of the terminal to be set in environment ($TERM variable).
	 */
	name?: string;

	/**
	 * Number of intial cols of the pty.
	 */
	cols?: number;

	/**
	 * Number of initial rows of the pty.
	 */
	rows?: number;

	/**
	 * Working directory to be set for the program.
	 */
	cwd?: string;

	/**
	 * Environment to be set for the program.
	 */
	env?: { [key: string]: string };

	/**
	 * String encoding of the underlying pty.
	 * If set, incoming data will be decoded to strings and outgoing strings to bytes applying this encoding.
	 * If unset, incoming data will be delivered as raw bytes (Buffer type).
	 * By default 'utf8' is assumed, to unset it explicitly set it to `null`.
	 */
	encoding?: string | null;

	/**
	 * (EXPERIMENTAL)
	 * Whether to enable flow control handling (false by default). If enabled a message of `flowControlPause`
	 * will pause the socket and thus blocking the child program execution due to buffer back pressure.
	 * A message of `flowControlResume` will resume the socket into flow mode.
	 * For performance reasons only a single message as a whole will match (no message part matching).
	 * If flow control is enabled the `flowControlPause` and `flowControlResume` messages are not forwarded to
	 * the underlying pseudoterminal.
	 */
	handleFlowControl?: boolean;

	/**
	 * (EXPERIMENTAL)
	 * The string that should pause the pty when `handleFlowControl` is true. Default is XOFF ('\x13').
	 */
	flowControlPause?: string;

	/**
	 * (EXPERIMENTAL)
	 * The string that should resume the pty when `handleFlowControl` is true. Default is XON ('\x11').
	 */
	flowControlResume?: string;
}

export interface IPtyForkOptions extends IBasePtyForkOptions {
	/**
	 * Security warning: use this option with great caution, as opened file descriptors
	 * with higher privileges might leak to the child program.
	 */
	uid?: number;
	gid?: number;
}

export interface IWindowsPtyForkOptions extends IBasePtyForkOptions {
	/**
	 * Whether to use the ConPTY system on Windows. When this is not set, ConPTY will be used when
	 * the Windows build number is >= 18309 (instead of winpty). Note that ConPTY is available from
	 * build 17134 but is too unstable to enable by default.
	 *
	 * This setting does nothing on non-Windows.
	 */
	useConpty?: boolean;

	/**
	 * Whether to use PSEUDOCONSOLE_INHERIT_CURSOR in conpty.
	 * @see https://docs.microsoft.com/en-us/windows/console/createpseudoconsole
	 */
	conptyInheritCursor?: boolean;
}

export interface ICommonPtyService {
	readonly _serviceBrand: undefined;

	/**
	 * Creates a PTY and returns a unix socket/named pipe name that can be connected to.
	 */
	spawn(file: string, args: string[] | string, options: IPtyForkOptions | IWindowsPtyForkOptions): Promise<IPtyInstance>;
}

export interface IPtyInstance {
	/**
	 * The PID of the child process.
	 */
	pid: number;

	/**
	 * The path of data socket for this instance.
	 */
	socketPath: string;

	restoreData?: string;
}
