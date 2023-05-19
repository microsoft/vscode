/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/179476

	/**
	 * Options applied to the mutator.
	 */
	export interface EnvironmentVariableMutatorOptions {
		/**
		 * Apply to the environment just before the process is created.
		 *
		 * Defaults to true.
		 */
		applyAtProcessCreation?: boolean;

		/**
		 * Apply to the environment in the shell integration script. Note that this _will not_ apply
		 * the mutator if shell integration is disabled or not working for some reason.
		 *
		 * Defaults to false.
		 */
		applyAtShellIntegration?: boolean;
	}

	/**
	 * A type of mutation and its value to be applied to an environment variable.
	 */
	export interface EnvironmentVariableMutator {
		/**
		 * Options applied to the mutator.
		 */
		readonly options: EnvironmentVariableMutatorOptions;
	}

	export interface EnvironmentVariableCollection extends Iterable<[variable: string, mutator: EnvironmentVariableMutator]> {
		/**
		 * @param options Options applied to the mutator.
		 */
		replace(variable: string, value: string, options?: EnvironmentVariableMutatorOptions): void;

		/**
		 * @param options Options applied to the mutator.
		 */
		append(variable: string, value: string, options?: EnvironmentVariableMutatorOptions): void;

		/**
		 * @param options Options applied to the mutator.
		 */
		prepend(variable: string, value: string, options?: EnvironmentVariableMutatorOptions): void;
	}
}
