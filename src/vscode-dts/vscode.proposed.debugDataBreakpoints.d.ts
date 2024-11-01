/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/195151

	export interface DataBreakpointResolution {
		/** An identifier for the data on which a data breakpoint can be registered. */
		dataId?: string;

		/** UI string that describes on what data the breakpoint is set on or why a data breakpoint is not available. */
		description: string;

		/** Attribute lists the available access types for a potential data breakpoint. */
		accessTypes?: DataBreakpointAccessType[];

		/** Attribute indicates that a potential data breakpoint could be persisted across sessions. */
		canPersist?: boolean;
	}

	export class ResolvedDataBreakpointSource implements DataBreakpointResolution {
		/** An identifier for the data. If it was retrieved using a `variablesReference` it may only be valid in the current suspended state, otherwise it's valid indefinitely. */
		dataId: string;
		/** Attribute indicates that a potential data breakpoint could be persisted across sessions. */
		canPersist: boolean;
		/** A human-readable label for the data breakpoint source. */
		description: string;
		/** Attribute lists the available access types for a potential data breakpoint. */
		accessTypes?: DataBreakpointAccessType[];

		/**
		 * Creates a new resolved data breakpoint source.
		 *
		 * @param dataId An identifier for the data. If it was retrieved using a `variablesReference` it may only be valid in the current suspended state, otherwise it's valid indefinitely.
		 * @param canPersist Attribute indicates that a potential data breakpoint could be persisted across sessions.
		 * @param description A human-readable label for the data breakpoint source.
		 */
		constructor(dataId: string, canPersist?: boolean, accessTypes?: DataBreakpointAccessType[], description?: string);
	}

	export class AddressDataBreakpointSource {
		/** A memory address as a decimal value, or hex value if it is prefixed with `0x`. */
		address: string;
		/** If specified, returns information for the range of memory extending `bytes` number of bytes from the address. */
		bytes?: number;
		/** A human-readable label for the data breakpoint source. */
		description: string;

		/**
		 * Creates a new address data breakpoint source.
		 *
		 * @param address A memory address as a decimal value, or hex value if it is prefixed with `0x`.
		 * @param bytes If specified, returns information for the range of memory extending `bytes` number of bytes from the address.
		 * @param description A human-readable label for the data breakpoint source.
		 */
		constructor(address: string, bytes?: number, description?: string);
	}

	export class ExpressionDataBreakpointSource {
		/** A global expression that is first evaluated when the breakpoint is activated. */
		expression: string;
		/** A human-readable label for the data breakpoint source. */
		description: string;

		/**
		 * Creates a new expression data breakpoint source.
		 *
		 * @param expression A global expression that is first evaluated when the breakpoint is activated.
		 * @param description A human-readable label for the data breakpoint source.
		 */
		constructor(expression: string, description?: string);
	}

	export class VariableScopedDataBreakpointSource {
		/** Reference to the variable container that has the variable named `variable`. */
		variablesReference: number;
		/** The name of the variable that is used for resolution. */
		variable: string;
		/** A human-readable label for the data breakpoint source. */
		description: string;

		/**
		 * Creates a new variable scoped data breakpoint source.
		 *
		 * @param variablesReference Reference to the variable container that has the variable named `variable`.
		 * @param variable The name of the variable that is used for resolution.
		 * @param description A human-readable label for the data breakpoint source.
		 */
		constructor(variablesReference: number, variable: string, description?: string);
	}

	export class FrameScopedDataBreakpointSource {
		/** Reference to the stack frame to which the expression is scoped. */
		frameId: number;
		/** The name of the expression that is used for resolution. */
		expression: string;
		/** A human-readable label for the data breakpoint source. */
		description: string;

		/**
		 * Creates a new frame scoped data breakpoint source.
		 *
		 * @param frameId Reference to the stack frame to which the expression is scoped.
		 * @param expression The name of the expression that is used for resolution.
		 * @param description A human-readable label for the data breakpoint source.
		 */
		constructor(frameId: number, expression: string, description?: string);
	}

	/** The source for a data breakpoint. */
	export type DataBreakpointSource = ResolvedDataBreakpointSource | AddressDataBreakpointSource | ExpressionDataBreakpointSource | VariableScopedDataBreakpointSource | FrameScopedDataBreakpointSource;

	/** Access type for data breakpoints. */
	export type DataBreakpointAccessType = 'read' | 'write' | 'readWrite';

	/**
	 * A breakpoint specified by a variable or memory change.
	 */
	export class DataBreakpoint extends Breakpoint {
		/** The source for the data breakpoint. See the different source types on how they are resolved during breakpoint activation. */
		source: DataBreakpointSource;

		/** The resolution of the data breakpoint based on the given source. This may be undefined if the breakpoint was not yet resolved. */
		resolution?: DataBreakpointResolution;

		/** The access type of the data. */
		accessType: DataBreakpointAccessType;

		/**
		 * Create a new data breakpoint.
		 *
		 * @param source The source for the data breakpoint. If the `dataId` is known already, it can be specified directly. If the dataId is not known, it can be retrieved via a data breakpoint info request from the session. Alternatively, some sources offer dynamic resolution during breakpoint activation.
		 * @param accessType The access type of the data breakpoint.
		 * @param enabled Is breakpoint enabled.
		 * @param condition Expression for conditional breakpoints.
		 * @param hitCondition Expression that controls how many hits of the breakpoint are ignored.
		 * @param logMessage Log message to display when breakpoint is hit.
		 */
		constructor(source: DataBreakpointSource | string, accessType: DataBreakpointAccessType, enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string);

		/**
		 * Resolves the data breakpoint and retrieves the dataId, canPersist, and description properties.
		 * By default, the data breakpoint is resolved automatically after the breakpoint is set.
		 * A data breakpoint is only resolved once at a certain point in time.
		 * Calling this method again will not update the resolution properties properties.
		 *
		 * @param session the session against which this breakpoint should be resolved.
		 */
		resolve(session: DebugSession): Thenable<this>;

		/**
		 * Resolves the data breakpoint with the given resolution if no other resolution was yet reached.
		 *
		 * @param resolution a known resolution for this breakpoint
		 */
		set(resolution: DataBreakpointResolution): this;
	}

}
