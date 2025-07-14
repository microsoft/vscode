/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @joshspicer

declare module 'vscode' {

	/**
	 * Information about a remote coding agent
	 */
	export interface RemoteCodingAgentInformation {
		/**
		 * The unique identifier of the agent
		 */
		id: string;

		/**
		 * The display name of the agent shown to users
		 */
		displayName: string;

		/**
		 * A description of what the agent does
		 */
		description?: string;

		/**
		 * The command to execute when the agent is invoked
		 */
		command: string;

		/**
		 * Optional regex pattern for follow-up responses
		 */
		followUpRegex?: string;

		/**
		 * When clause that determines if the agent is available
		 */
		when?: string;
	}

	/**
	 * A provider that returns information about remote coding agents
	 */
	export interface RemoteCodingAgentInformationProvider {
		/**
		 * Get information about all available remote coding agents
		 * @returns Array of agent information
		 */
		getAgentInformation(): RemoteCodingAgentInformation[] | Thenable<RemoteCodingAgentInformation[]>;
	}

	export namespace remoteCodingAgents {
		/**
		 * Register a provider that returns information about remote coding agents
		 * 
		 * @param provider The provider that returns agent information
		 * @returns A disposable that unregisters the provider when disposed
		 */
		export function registerAgentInformationProvider(provider: RemoteCodingAgentInformationProvider): Disposable;
	}
}
