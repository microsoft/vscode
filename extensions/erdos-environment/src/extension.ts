/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
// Erdos API import removed - not needed for environment variables
import { getPandocPath } from './pandoc.js';

/**
 * Apply the configuration for the environment variables.
 *
 * @param context The extension context.
 */
function applyConfiguration(context: vscode.ExtensionContext) {

	const vars = vscode.workspace.getConfiguration('environmentVariables');

	// Clear the initial collection to remove any old values
	const collection = context.environmentVariableCollection;
	collection.clear();

	// Add the built-in variables to the collection. We always add these even if
	// the configuration-based variables are not enabled.
	addBuiltinVars(context);

	// Set the vars using the environment variable collection
	if (!vars.get('enabled')) {
		return;
	}

	// Set the collection description
	collection.description = vscode.l10n.t('Custom Erdos environment variables');

	// Get the configured environment variables for replace action
	const replaceVars = vars.get<Record<string, string>>('set') ?? {};
	for (const [name, value] of Object.entries(replaceVars)) {
		collection.replace(name, value);
	}

	// Get the configured environment variables for append action
	const appendVars = vars.get<Record<string, string>>('append') ?? {};
	for (const [name, value] of Object.entries(appendVars)) {
		collection.append(name, value);
	}

	// Get the configured environment variables for prepend action
	const prependVars = vars.get<Record<string, string>>('prepend') ?? {};
	for (const [name, value] of Object.entries(prependVars)) {
		collection.prepend(name, value);
	}
}

/**
 * Activate the extension. Main entry point; called when the extension is
 * activated.
 *
 * @param context The extension context.
 */
export function activate(context: vscode.ExtensionContext) {
	// Apply the initial configuration values.
	applyConfiguration(context);

	// Register a listener for when the configuration changes and reapply
	// the configuration.
	const disposable = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('environmentVariables')) {
			applyConfiguration(context);
		}
	});

	context.subscriptions.push(disposable);
}

/**
 * Adds built-in environment variables to the global environment variable
 * collection.
 *
 * @param context The extension context.
 */
export function addBuiltinVars(context: vscode.ExtensionContext) {
	const collection = context.environmentVariableCollection;
	const pandocPath = getPandocPath();

	// Advertise the location of the Pandoc executable.
	if (pandocPath) {
		collection.replace('RSTUDIO_PANDOC', pandocPath);
	}
}
