/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { detectCredentials, hasAnyProvider } from '../onboarding/credentialDetection';
import { SETUP_WIZARD_SKIPPED_KEY, SetupWizardPanel, SetupWizardDeps } from '../onboarding/SetupWizardPanel';
import type { CredentialBroker } from './CredentialBroker';
import type { LlmClient } from '../llm/LlmClient';

const FIRST_RUN_DISMISSED_KEY = 'sotaAuth.firstRunPromptDismissed';

export interface FirstRunDeps {
	readonly broker: CredentialBroker;
	readonly llmClient: LlmClient;
	readonly context: vscode.ExtensionContext;
	readonly getConfig: (section: string) => vscode.WorkspaceConfiguration;
}

/**
 * Opens the first-run setup wizard when the user has no provider configured
 * and has not previously dismissed it. Idempotent across windows via
 * `globalState`. The legacy notification flow has been replaced with a
 * webview-based wizard that walks the user through every supported provider.
 *
 * The function name is preserved so existing call sites continue to work.
 */
export async function maybeShowFirstRunSignInPrompt(deps: FirstRunDeps): Promise<void> {
	const { context, broker, llmClient, getConfig } = deps;

	if (context.globalState.get<boolean>(SETUP_WIZARD_SKIPPED_KEY) === true) {
		return;
	}
	if (context.globalState.get<boolean>(FIRST_RUN_DISMISSED_KEY) === true) {
		// Pre-existing dismissals (from the prior notification-based flow) also
		// suppress the wizard — the user already opted out once and we should
		// not surprise them with a new pop-up after upgrading.
		return;
	}

	const state = await detectCredentials(context.secrets, getConfig('sota'), broker);
	if (hasAnyProvider(state)) {
		await context.globalState.update(FIRST_RUN_DISMISSED_KEY, true);
		return;
	}

	const wizardDeps: SetupWizardDeps = {
		llmClient,
		broker,
		secrets: context.secrets,
		config: getConfig('sota'),
	};
	SetupWizardPanel.createOrShow(context, wizardDeps);
}
