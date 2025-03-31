/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/195151

	export interface DataBreakpointInfo {
		/** An identifier for the data on which a data breakpoint can be registered for a particular session. If null, no data breakpoint is available. */
		readonly dataId: string | null;
		/** UI string that describes on what data the breakpoint is set on or why a data breakpoint is not available. */
		readonly description: string;
		/** Attribute lists the available access types for a potential data breakpoint. */
		readonly accessTypes?: DataBreakpointAccessType[];
		/** Attribute indicates that a potential data breakpoint could be persisted across sessions. */
		readonly canPersist?: boolean;
	}

	export type AvailableDataBreakpointInfo = DataBreakpointInfo & { dataId: string };

	export class ResolvedDataBreakpointOrigin implements AvailableDataBreakpointInfo {
		/** An identifier for the data. If it was retrieved using a `variablesReference` it may only be valid in the current suspended state, otherwise it's valid indefinitely. */
		readonly dataId: string;
		/** Attribute indicates that a potential data breakpoint could be persisted across sessions. */
		readonly canPersist: boolean;
		/** A human-readable label for the data breakpoint origin. */
		readonly description: string;
		/** Attribute lists the available access types for a potential data breakpoint. */
		readonly accessTypes?: DataBreakpointAccessType[];

		/**
		 * Creates a new resolved data breakpoint origin.
		 *
		 * @param dataId An identifier for the data. If it was retrieved using a `variablesReference` it may only be valid in the current suspended state, otherwise it's valid indefinitely.
		 * @param canPersist Attribute indicates that a potential data breakpoint could be persisted across sessions.
		 * @param description A human-readable label for the data breakpoint origin.
		 */
		constructor(dataId: string, canPersist?: boolean, accessTypes?: DataBreakpointAccessType[], description?: string);

		/**
		 * Obtains information on the potential data breakpoint for the given session.
		 * This information is used to determine whether a data breakpoint can be set and what access types are supported for a particular session.
		 * By default, a constructed data breakpoint's origin is resolved automatically for the active session after the breakpoint is added.
		 *
		 * @param session the session for which we want to retrieve the breakpoint info.
		 */
		info(session: DebugSession): Thenable<DataBreakpointInfo>;
	}

	export class AddressDataBreakpointOrigin {
		/** A memory address as a decimal value, or hex value if it is prefixed with `0x`. */
		readonly address: string;
		/** If specified, returns information for the range of memory extending `bytes` number of bytes from the address. */
		readonly bytes?: number;
		/** A human-readable label for the data breakpoint origin. */
		readonly description: string;

		/**
		 * Creates a new address data breakpoint origin.
		 *
		 * @param address A memory address as a decimal value, or hex value if it is prefixed with `0x`.
		 * @param bytes If specified, returns information for the range of memory extending `bytes` number of bytes from the address.
		 * @param description A human-readable label for the data breakpoint origin.
		 */
		constructor(address: string, bytes?: number, description?: string);

		/**
		 * Obtains information on the potential data breakpoint for the given session.
		 * This information is used to determine whether a data breakpoint can be set and what access types are supported for a particular session.
		 * By default, a constructed data breakpoint's origin is resolved automatically for the active session after the breakpoint is added.
		 *
		 * @param session the session for which we want to retrieve the breakpoint info.
		 */
		info(session: DebugSession): Thenable<DataBreakpointInfo>;
	}

	export class ExpressionDataBreakpointOrigin {
		/** A global expression that is first evaluated when the breakpoint is activated. */
		readonly expression: string;
		/** A human-readable label for the data breakpoint origin. */
		readonly description: string;

		/**
		 * Creates a new expression data breakpoint origin.
		 *
		 * @param expression A global expression that is first evaluated when the breakpoint is activated.
		 * @param description A human-readable label for the data breakpoint origin.
		 */
		constructor(expression: string, description?: string);

		/**
		 * Obtains information on the potential data breakpoint for the given session.
		 * This information is used to determine whether a data breakpoint can be set and what access types are supported for a particular session.
		 * By default, a constructed data breakpoint's origin is resolved automatically for the active session after the breakpoint is added.
		 *
		 * @param session the session for which we want to retrieve the breakpoint info.
		 */
		info(session: DebugSession): Thenable<DataBreakpointInfo>;
	}

	export class VariableScopedDataBreakpointOrigin {
		/** Reference to the variable container that has the variable named `variable`. */
		readonly variablesReference: number;
		/** The name of the variable that is used for resolution. */
		readonly variable: string;
		/** A human-readable label for the data breakpoint origin. */
		readonly description: string;

		/**
		 * Creates a new variable scoped data breakpoint origin.
		 *
		 * @param variablesReference Reference to the variable container that has the variable named `variable`.
		 * @param variable The name of the variable that is used for resolution.
		 * @param description A human-readable label for the data breakpoint origin.
		 */
		constructor(variablesReference: number, variable: string, description?: string);

		/**
		 * Obtains information on the potential data breakpoint for the given session.
		 * This information is used to determine whether a data breakpoint can be set and what access types are supported for a particular session.
		 * By default, a constructed data breakpoint's origin is resolved automatically for the active session after the breakpoint is added.
		 *
		 * @param session the session for which we want to retrieve the breakpoint info.
		 */
		info(session: DebugSession): Thenable<DataBreakpointInfo>;
	}

	export class FrameScopedDataBreakpointOrigin {
		/** Reference to the stack frame to which the expression is scoped. */
		readonly frameId: number;
		/** The name of the expression that is used for resolution. */
		readonly expression: string;
		/** A human-readable label for the data breakpoint origin. */
		readonly description: string;

		/**
		 * Creates a new frame scoped data breakpoint origin.
		 *
		 * @param frameId Reference to the stack frame to which the expression is scoped.
		 * @param expression The name of the expression that is used for resolution.
		 * @param description A human-readable label for the data breakpoint origin.
		 */
		constructor(frameId: number, expression: string, description?: string);

		/**
		 * Obtains information on the potential data breakpoint for the given session.
		 * This information is used to determine whether a data breakpoint can be set and what access types are supported for a particular session.
		 * By default, a constructed data breakpoint's origin is resolved automatically for the active session after the breakpoint is added.
		 *
		 * @param session the session for which we want to retrieve the breakpoint info.
		 */
		info(session: DebugSession): Thenable<DataBreakpointInfo>;
	}

	/** The origin for a data breakpoint. */
	export type DataBreakpointOrigin = ResolvedDataBreakpointOrigin | AddressDataBreakpointOrigin | ExpressionDataBreakpointOrigin | VariableScopedDataBreakpointOrigin | FrameScopedDataBreakpointOrigin;

	/** Access type for data breakpoints. */
	export type DataBreakpointAccessType = 'read' | 'write' | 'readWrite';

	/**
	 * A breakpoint specified by a variable or memory change.
	 */
	export class DataBreakpoint extends Breakpoint {
		/** The origin for the data breakpoint. See the different origin types on how they are resolved during breakpoint activation. */
		readonly origin: DataBreakpointOrigin;

		/** The access type of the data. */
		readonly accessType?: DataBreakpointAccessType;

		/**
		 * Create a new data breakpoint.
		 *
		 * @param origin The origin for the data breakpoint. If the `dataId` is known already, it can be specified directly. If the dataId is not known, it can be resolved via a data breakpoint info request from the session. Alternatively, some origins offer dynamic resolution during breakpoint activation.
		 * @param accessType The access type of the data breakpoint. It's the caller's responsibility to ensure that the access type is supported by the session. Supported access types can be retrieved via the `info` request.
		 * @param enabled Is breakpoint enabled.
		 * @param condition Expression for conditional breakpoints.
		 * @param hitCondition Expression that controls how many hits of the breakpoint are ignored.
		 * @param logMessage Log message to display when breakpoint is hit.
		 */
		constructor(origin: DataBreakpointOrigin | AvailableDataBreakpointInfo | string, accessType?: DataBreakpointAccessType, enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string);

		/**
		 * Obtains information on the potential data breakpoint for the given session.
		 * This information is used to determine whether a data breakpoint can be set and what access types are supported for a particular session.
		 * By default, the data breakpoint is resolved automatically for the active session after the breakpoint is added.
		 *
		 * @param session the session for which we want to retrieve the breakpoint info.
		 */
		info(session: DebugSession): Thenable<DataBreakpointInfo>;
	}

}
