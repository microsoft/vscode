/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApplicationService } from '../application';

/**
 * Create a standardized text response for window tools
 */
function textResponse(text: string) {
	return {
		content: [{ type: 'text' as const, text }]
	};
}

/**
 * Window Management Tools for multi-window support.
 * These tools provide Playwright-based window interactions through the automation driver.
 */
export function applyWindowTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	tools.push(server.tool(
		'vscode_automation_list_windows',
		'List all open VS Code windows with their index and URL',
		async () => {
			const app = await appService.getOrCreateApplication();
			const windowInfo = app.code.driver.getWindowsInfo();
			return textResponse(`Open windows (${windowInfo.length}):\n${JSON.stringify(windowInfo, null, 2)}`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_switch_window',
		'Switch to a different VS Code window by index or URL pattern (e.g., "agent.html")',
		{
			indexOrUrl: z.union([z.number(), z.string()]).describe('Window index (0-based) or URL pattern to match (e.g., "agent.html", "workbench")')
		},
		async ({ indexOrUrl }) => {
			const app = await appService.getOrCreateApplication();
			const switched = app.code.driver.switchToWindow(indexOrUrl);

			if (switched) {
				return textResponse(`Switched to window (URL: ${switched.url()})`);
			}

			const windowInfo = app.code.driver.getWindowsInfo();
			const availableWindows = windowInfo.map(w => `  ${w.index}: ${w.url}`).join('\n');
			return textResponse(`Failed to switch window. Window not found for: ${indexOrUrl}\n\nAvailable windows:\n${availableWindows}`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_get_current_window',
		'Get information about the currently active window',
		async () => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			const windowInfo = driver.getWindowsInfo();
			const current = windowInfo.find(w => w.isCurrent);
			return textResponse(`Current window:\nIndex: ${current?.index ?? -1}\nURL: ${current?.url ?? 'Unknown'}`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_screenshot',
		'Take a screenshot of the current window (respects the window set by vscode_automation_switch_window)',
		{
			fullPage: z.boolean().optional().describe('When true, takes a screenshot of the full scrollable page')
		},
		async ({ fullPage }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			const screenshotBuffer = await driver.screenshotBuffer(fullPage ?? false);
			const url = driver.currentPage.url();

			return {
				content: [
					{ type: 'text' as const, text: `Screenshot (URL: ${url})` },
					{ type: 'image' as const, data: screenshotBuffer.toString('base64'), mimeType: 'image/png' }
				]
			};
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_snapshot',
		'Capture accessibility snapshot of the current window. Returns the page structure with element references that can be used for interactions.',
		async () => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			const snapshot = await driver.getAccessibilitySnapshot();
			const url = driver.currentPage.url();

			return textResponse(`Page snapshot (URL: ${url}):\n\n${JSON.stringify(snapshot, null, 2)}`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_click',
		'Click on an element in the current window using a CSS selector',
		{
			selector: z.string().describe('CSS selector for the element to click'),
			button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button to click'),
			clickCount: z.number().optional().describe('Number of clicks (1 for single, 2 for double)')
		},
		async ({ selector, button, clickCount }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.clickSelector(selector, { button, clickCount });
			return textResponse(`Clicked "${selector}"`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_type',
		'Type text into an element in the current window',
		{
			selector: z.string().describe('CSS selector for the element to type into'),
			text: z.string().describe('Text to type'),
			slowly: z.boolean().optional().describe('Whether to type one character at a time (useful for triggering key handlers)')
		},
		async ({ selector, text, slowly }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.typeText(selector, text, slowly ?? false);
			return textResponse(`Typed "${text}" into "${selector}"`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_evaluate',
		'Evaluate JavaScript in the current window',
		{
			expression: z.string().describe('JavaScript expression to evaluate')
		},
		async ({ expression }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			const result = await driver.evaluateExpression(expression);
			return textResponse(`Result:\n${JSON.stringify(result, null, 2)}`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_locator',
		'Get information about elements matching a selector in the current window',
		{
			selector: z.string().describe('CSS selector to find elements'),
			action: z.enum(['count', 'textContent', 'innerHTML', 'boundingBox', 'isVisible']).optional().describe('Action to perform on matched elements')
		},
		async ({ selector, action }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			const result = await driver.getLocatorInfo(selector, action);
			return textResponse(`Locator "${selector}":\n${JSON.stringify(result, null, 2)}`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_wait_for_selector',
		'Wait for an element to appear in the current window',
		{
			selector: z.string().describe('CSS selector to wait for'),
			state: z.enum(['attached', 'detached', 'visible', 'hidden']).optional().describe('State to wait for'),
			timeout: z.number().optional().describe('Timeout in milliseconds')
		},
		async ({ selector, state, timeout }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.waitForElement(selector, { state, timeout });
			return textResponse(`Element "${selector}" is now ${state ?? 'visible'}`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_hover',
		'Hover over an element in the current window',
		{
			selector: z.string().describe('CSS selector for the element to hover over')
		},
		async ({ selector }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.hoverSelector(selector);
			return textResponse(`Hovered over "${selector}"`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_drag',
		'Drag from one element to another in the current window',
		{
			sourceSelector: z.string().describe('CSS selector for the source element'),
			targetSelector: z.string().describe('CSS selector for the target element')
		},
		async ({ sourceSelector, targetSelector }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.dragSelector(sourceSelector, targetSelector);
			return textResponse(`Dragged from "${sourceSelector}" to "${targetSelector}"`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_press_key',
		'Press a key or key combination in the current window',
		{
			key: z.string().describe('Key to press (e.g., "Enter", "Tab", "Control+c", "Meta+v")')
		},
		async ({ key }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.pressKey(key);
			return textResponse(`Pressed key "${key}"`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_mouse_move',
		'Move mouse to a specific position in the current window',
		{
			x: z.number().describe('X coordinate'),
			y: z.number().describe('Y coordinate')
		},
		async ({ x, y }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.mouseMove(x, y);
			return textResponse(`Moved mouse to (${x}, ${y})`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_mouse_click',
		'Click at a specific position in the current window',
		{
			x: z.number().describe('X coordinate'),
			y: z.number().describe('Y coordinate'),
			button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button to click'),
			clickCount: z.number().optional().describe('Number of clicks (1 for single, 2 for double)')
		},
		async ({ x, y, button, clickCount }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.mouseClick(x, y, { button, clickCount });
			return textResponse(`Clicked at (${x}, ${y})`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_mouse_drag',
		'Drag from one position to another in the current window',
		{
			startX: z.number().describe('Starting X coordinate'),
			startY: z.number().describe('Starting Y coordinate'),
			endX: z.number().describe('Ending X coordinate'),
			endY: z.number().describe('Ending Y coordinate')
		},
		async ({ startX, startY, endX, endY }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.mouseDrag(startX, startY, endX, endY);
			return textResponse(`Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_select_option',
		'Select an option in a dropdown in the current window',
		{
			selector: z.string().describe('CSS selector for the select element'),
			value: z.union([z.string(), z.array(z.string())]).describe('Value(s) to select')
		},
		async ({ selector, value }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			const selected = await driver.selectOption(selector, value);
			return textResponse(`Selected "${selected.join(', ')}" in "${selector}"`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_fill_form',
		'Fill multiple form fields at once in the current window',
		{
			fields: z.array(z.object({
				selector: z.string().describe('CSS selector for the form field'),
				value: z.string().describe('Value to fill')
			})).describe('Array of fields to fill')
		},
		async ({ fields }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.fillForm(fields);
			return textResponse(`Filled ${fields.length} form field(s)`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_console_messages',
		'Get console messages from the current window',
		async () => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			const messages = await driver.getConsoleMessages();
			return textResponse(`Console messages (${messages.length}):\n${JSON.stringify(messages, null, 2)}`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_wait_for_text',
		'Wait for text to appear or disappear in the current window',
		{
			text: z.string().optional().describe('Text to wait for to appear'),
			textGone: z.string().optional().describe('Text to wait for to disappear'),
			timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)')
		},
		async ({ text, textGone, timeout }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.waitForText({ text, textGone, timeout });
			return textResponse(`Waited for ${text ? `"${text}" to appear` : ''}${textGone ? `"${textGone}" to disappear` : ''}`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_wait_for_time',
		'Wait for a specified time in the current window',
		{
			seconds: z.number().describe('Time to wait in seconds')
		},
		async ({ seconds }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			await driver.waitForTime(seconds * 1000);
			return textResponse(`Waited for ${seconds} second(s)`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_verify_element_visible',
		'Verify an element is visible in the current window',
		{
			selector: z.string().describe('CSS selector for the element to verify')
		},
		async ({ selector }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			const isVisible = await driver.verifyElementVisible(selector);
			return textResponse(isVisible ? `✓ Element "${selector}" is visible` : `✗ Element "${selector}" is NOT visible`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_verify_text_visible',
		'Verify text is visible in the current window',
		{
			text: z.string().describe('Text to verify is visible')
		},
		async ({ text }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			const isVisible = await driver.verifyTextVisible(text);
			return textResponse(isVisible ? `✓ Text "${text}" is visible` : `✗ Text "${text}" is NOT visible`);
		}
	));

	tools.push(server.tool(
		'vscode_automation_window_get_input_value',
		'Get the value of an input element in the current window',
		{
			selector: z.string().describe('CSS selector for the input element')
		},
		async ({ selector }) => {
			const app = await appService.getOrCreateApplication();
			const driver = app.code.driver;
			const value = await driver.getInputValue(selector);
			return textResponse(`Input "${selector}" value: "${value}"`);
		}
	));

	return tools;
}
