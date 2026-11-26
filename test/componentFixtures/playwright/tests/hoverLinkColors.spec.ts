/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'url';

test('hover link colors preserve interaction fallbacks and apply overrides', async ({ page }) => {
	await page.setContent(`
		<div class="monaco-workbench" style="--vscode-foreground: #345678; --vscode-descriptionForeground: #789abc; --vscode-textLink-foreground: #123456; --vscode-textLink-activeForeground: #654321">
			<div class="monaco-editor">
				<div class="monaco-hover" style="position: relative">
					<a data-testid="editor" href="#">Editor</a>
					<div class="hover-contents"><a class="code-link" href="#"><span data-testid="code">Code</span></a></div>
				</div>
				<div class="parameter-hints-widget"><div class="docs"><a data-testid="parameter" href="#">Parameter</a></div></div>
				<div class="monaco-editor-overlaymessage"><div class="message"><a data-testid="message" href="#">Message</a></div></div>
			</div>
			<div class="monaco-hover workbench-hover" style="position: relative">
				<a data-testid="workbench" href="#">Workbench</a>
			</div>
			<div class="monaco-hover workbench-hover chat-customizations-hover" style="position: relative">
				<table><tbody><tr><td><a data-testid="customizations" href="#">Customizations</a></td></tr></tbody></table>
				<div class="hover-contents"><hr><p><a href="#">Browse</a><a data-testid="settings" href="#">Settings</a></p></div>
			</div>
		</div>
	`);
	for (const css of [
		'src/vs/base/browser/ui/hover/hoverWidget.css',
		'src/vs/editor/contrib/hover/browser/hover.css',
		'src/vs/editor/contrib/parameterHints/browser/parameterHints.css',
		'src/vs/editor/contrib/message/browser/messageController.css',
		'src/vs/platform/hover/browser/hover.css',
		'src/vs/workbench/contrib/chat/browser/aiCustomization/media/chatCustomizations.css',
	]) {
		await page.addStyleTag({ path: fileURLToPath(new URL(`../../../../${css}`, import.meta.url)) });
	}

	const container = page.locator('.monaco-workbench');
	for (const custom of [false, true, false]) {
		await container.evaluate((element, enabled) => {
			element.style.setProperty('--vscode-editorHoverWidget-linkForeground', enabled ? '#abcdef' : 'var(--vscode-editorHoverWidget-linkForeground)');
		}, custom);

		for (const name of ['editor', 'code', 'parameter', 'message', 'workbench', 'customizations', 'settings']) {
			const link = page.getByTestId(name);
			await page.mouse.move(0, 0);
			const fallback = name === 'customizations' ? 'rgb(52, 86, 120)' : name === 'settings' ? 'rgb(120, 154, 188)' : 'rgb(18, 52, 86)';
			await expect(link).toHaveCSS('color', custom ? 'rgb(171, 205, 239)' : fallback);
			await link.hover();
			await expect(link).toHaveCSS('color', custom ? 'rgb(171, 205, 239)' : 'rgb(101, 67, 33)');
			await page.mouse.down();
			expect(await link.evaluate(element => element.closest('a')?.matches(':active'))).toBe(true);
			await expect(link).toHaveCSS('color', custom ? 'rgb(171, 205, 239)' : 'rgb(101, 67, 33)');
			if (name === 'workbench' || name === 'customizations') {
				await page.mouse.move(0, 0);
				expect(await link.evaluate(element => ({ active: element.matches(':active'), hover: element.matches(':hover') }))).toEqual({ active: true, hover: false });
				await expect(link).toHaveCSS('color', custom ? 'rgb(171, 205, 239)' : 'rgb(101, 67, 33)');
			}
			await page.mouse.move(0, 0);
			await page.mouse.up();
		}
	}
});
