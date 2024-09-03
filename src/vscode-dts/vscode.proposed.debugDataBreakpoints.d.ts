/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/195151

	/**
	 * The source for a data breakpoint.
	 */
	export type DataBreakpointSource =
		| {
			/** The source type for fixed data identifiers that do not need to be re-resolved when the breakpoint is activated. */
			type: 'variable';
			/** An identifier for the data. If it was retrieved using a `variablesReference` it may only be valid in the current suspended state, otherwise it's valid indefinitely. */
			dataId: string;
		}
		| {
			/** The source type for address-based data breakpoints. Address-based data breakpoints are re-resolved when the breakpoint is activated. This type only applies to sessions that have the `supportsDataBreakpointBytes` capability. */
			type: 'address';
			/** A memory address as a decimal value, or hex value if it is prefixed with `0x`. */
			address: string;
			/** If specified, returns information for the range of memory extending `bytes` number of bytes from the address. */
			bytes?: number;
		}
		| {
			/** The source type for expressions that are dynamically resolved when the breakpoint is activated. */
			type: 'expression';
			/** A global expression that is first evaluated when the breakpoint is activated. */
			expression: string;
		}
		| {
			/** The source type for scoped variables and expressions that are dynamically resolved when the breakpoint is activated. */
			type: 'scoped';
		} & (
			| {
				/** The name of the variable that is used for resolution. */
				variable: string;
				/** Reference to the variable container that has the variable named `variable`. */
				variablesReference: number;
				frameId?: never;
			}
			| {
				/** The name of the expression that is used for resolution. */
				expression: string;
				/** Reference to the stack frame to which the expression is scoped. */
				frameId: number;
				variablesReference?: never;
			}
		);


	/** Access type for data breakpoints. */
	export type DataBreakpointAccessType = 'read' | 'write' | 'readWrite';

	/**
	 * A breakpoint specified by a variable or memory change.
	 */
	export class DataBreakpoint extends Breakpoint {
		/**
		 * The human-readable label for the data breakpoint.
		 */
		label: string;

		/**
		 * The source for the data breakpoint. See the different source types on how they are resolved during breakpoint activation.
		 */
		source: DataBreakpointSource;

		/**
		 * Flag to indicate if the data breakpoint could be persisted across sessions.
		 */
		canPersist: boolean;

		/**
		 * The access type of the data.
		 */
		accessType: DataBreakpointAccessType;

		/**
		 * Create a new data breakpoint.
		 *
		 * @param source The source for the data breakpoint. If the `dataId` is known already, it can be specified directly. If the dataId is not known, it can be retrieved via a data breakpoint info request from the session. Alternatively, some sources offer dynamic resolution during breakpoint activation.
		 * @param accessType The access type of the data breakpoint.
		 * @param canPersist Flag to indicate if the data breakpoint could be persisted across sessions.
		 * @param label The human-readable label for the data breakpoint.
		 * @param enabled Is breakpoint enabled.
		 * @param condition Expression for conditional breakpoints.
		 * @param hitCondition Expression that controls how many hits of the breakpoint are ignored.
		 * @param logMessage Log message to display when breakpoint is hit.
		 */
		constructor(source: DataBreakpointSource | string, accessType: DataBreakpointAccessType, canPersist?: boolean, label?: string, enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string);
	}
}
