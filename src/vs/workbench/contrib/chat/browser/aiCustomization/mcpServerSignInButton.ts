/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { getButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';

export function createMcpSignInButton(parent: HTMLElement, store: Pick<DisposableStore, 'add'>, serverLabel: string): Button {
	const signInLabel = localize('signInToMcpServer', "Sign in to {0}", serverLabel);
	const signInButton = store.add(new Button(parent, {
		...getButtonStyles({ buttonSecondaryHoverBackground: undefined }),
		secondary: true,
		small: true,
		title: signInLabel,
		ariaLabel: signInLabel,
		supportIcons: true,
	}));
	signInButton.label = localize('signIn', "Sign In");
	signInButton.element.classList.add('mcp-server-sign-in');
	return signInButton;
}

interface IMcpSignInButtonActionOptions {
	readonly updateTabbability?: () => void;
}

export function registerMcpSignInButtonAction(store: Pick<DisposableStore, 'add'>, button: Button, serverLabel: string, action: () => Promise<void | boolean>, options?: IMcpSignInButtonActionOptions): void {
	let pending = false;
	let disposed = false;
	store.add(toDisposable(() => disposed = true));
	registerMcpInlineButtonAction(store, button, async () => {
		if (pending) {
			return;
		}

		pending = true;
		const wasEnabled = button.enabled;
		setMcpSignInButtonPending(button, serverLabel);
		status(localize('mcpServerSigningInStatus', "Signing in to {0}.", serverLabel));
		try {
			await action();
		} finally {
			if (!disposed) {
				pending = false;
				const tabIndex = button.element.tabIndex;
				resetMcpSignInButton(button, serverLabel, wasEnabled);
				button.element.tabIndex = tabIndex;
				options?.updateTabbability?.();
			}
		}
	});
}

function setMcpSignInButtonPending(button: Button, serverLabel: string): void {
	const signingInAriaLabel = localize('signingInToMcpServer', "Signing in to {0}", serverLabel);
	button.label = `$(${Codicon.loading.id}) ${localize('signingIn', "Signing In...")}`;
	button.setTitle(signingInAriaLabel);
	button.setAriaLabel(signingInAriaLabel);
	button.element.setAttribute('aria-busy', 'true');
	button.enabled = false;
}

export function resetMcpSignInButton(button: Button, serverLabel: string, enabled: boolean): void {
	const signInAriaLabel = localize('signInToMcpServer', "Sign in to {0}", serverLabel);
	button.label = localize('signIn', "Sign In");
	button.setTitle(signInAriaLabel);
	button.setAriaLabel(signInAriaLabel);
	button.element.removeAttribute('aria-busy');
	button.enabled = enabled;
}

/** Registers an inline MCP button without allowing its pointer or click events to open the containing list row. */
export function registerMcpInlineButtonAction(store: Pick<DisposableStore, 'add'>, button: Button, action: () => void | Promise<void>): void {
	store.add(DOM.addDisposableGenericMouseDownListener(button.element, event => DOM.EventHelper.stop(event, true)));
	store.add(button.onDidClick(event => {
		DOM.EventHelper.stop(event, true);
		void action();
	}));
}

/** Renders an inline sign-in action, including authentication already in progress. */
export function renderMcpServerSignInButton(parent: HTMLElement, store: Pick<DisposableStore, 'add'>, serverLabel: string, signIn: () => Promise<void | boolean>, authenticating = false): Button {
	const button = createMcpSignInButton(parent, store, serverLabel);
	registerMcpSignInButtonAction(store, button, serverLabel, signIn);
	if (authenticating) {
		setMcpSignInButtonPending(button, serverLabel);
	}
	return button;
}
