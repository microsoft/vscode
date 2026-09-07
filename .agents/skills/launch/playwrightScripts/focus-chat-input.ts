/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-unused-expressions, @stylistic/semi -- playwright-cli requires a bare, unterminated function expression. */
async page => {
	const selectors = [
		'.session-view.is-active .new-chat-input-area :is(.native-edit-context, textarea.inputarea)',
		'.session-view.is-active .sessions-chat-editor :is(.native-edit-context, textarea.inputarea)',
		'.session-view.is-active .interactive-session .chat-input-container :is(.native-edit-context, textarea.inputarea)',
		'.monaco-workbench .interactive-session .chat-input-container :is(.native-edit-context, textarea.inputarea)'
	];

	const findVisibleChatInput = async () => {
		let firstVisible;
		for (const selector of selectors) {
			const candidates = page.locator(selector);
			for (let index = 0; index < await candidates.count(); index++) {
				const candidate = candidates.nth(index);
				const isExcluded = await candidate.evaluate(element => Boolean(element.closest('.inline-chat-widget, .automation-form-prompt-host')));
				if (await candidate.isVisible() && !isExcluded) {
					const match = { input: candidate, selector };
					if (await candidate.evaluate(element => document.activeElement === element)) {
						return match;
					}
					firstVisible ??= match;
				}
			}
		}
		return firstVisible;
	};

	const isFocused = input => input.evaluate(element => document.activeElement === element);
	const focusIfNeeded = async input => {
		if (await isFocused(input)) {
			return false;
		}
		await input.focus();
		if (!await isFocused(input)) {
			throw new Error('Chat input did not retain focus');
		}
		return true;
	};
	const waitForVisibleChatInput = async attempts => {
		for (let attempt = 0; attempt < attempts; attempt++) {
			const match = await findVisibleChatInput();
			if (match) {
				return match;
			}
			await page.waitForTimeout(100);
		}
		return undefined;
	};

	let match = await findVisibleChatInput();
	if (match) {
		const focusInvoked = await focusIfNeeded(match.input);
		return { focused: true, focusChanged: focusInvoked, focusInvoked, shortcutInvoked: false, commandPaletteFallbackInvoked: false, selector: match.selector };
	}

	const platform = await page.evaluate(() => navigator.userAgentData?.platform ?? navigator.platform);
	const shortcut = /^mac/i.test(platform) ? 'Control+Meta+i' : 'Control+Alt+i';
	await page.keyboard.press(shortcut);
	match = await waitForVisibleChatInput(10);

	let commandPaletteFallbackInvoked = false;
	if (!match) {
		commandPaletteFallbackInvoked = true;
		const isAgentsWindow = await page.locator('.agent-sessions-workbench').count() > 0;
		const commandId = isAgentsWindow ? 'sessions.focusActiveSession' : 'workbench.action.chat.open';
		await page.keyboard.press('F1');
		const commandPaletteInput = page.locator('.quick-input-widget .quick-input-box input');
		try {
			await commandPaletteInput.waitFor({ state: 'visible', timeout: 1000 });
		} catch {
			throw new Error('F1 did not open the Command Palette; check the cloned profile keybindings');
		}
		await commandPaletteInput.fill(`>${commandId}`);
		await page.keyboard.press('Enter');
		match = await waitForVisibleChatInput(50);
	}

	if (!match) {
		throw new Error(`No visible chat input found after invoking ${shortcut} and the command palette fallback`);
	}

	const focusInvoked = await focusIfNeeded(match.input);
	return { focused: true, focusChanged: true, focusInvoked, shortcutInvoked: true, commandPaletteFallbackInvoked, selector: match.selector };
}
