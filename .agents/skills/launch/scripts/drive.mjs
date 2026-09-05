#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright-core';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SETUP_TIMEOUT_MS = 90_000;
const CHAT_INPUT_SELECTORS = [
	'.new-chat-input-area .native-edit-context',
	'.interactive-input-editor .native-edit-context',
	'.native-edit-context',
];
const RESPONSE_SELECTOR = '.interactive-item-container.interactive-response, .interactive-response';
const REQUEST_SELECTOR = '.interactive-item-container.interactive-request, .interactive-request';
const MODAL_SELECTOR = '[role="dialog"]:visible, .monaco-dialog-box:visible, .quick-input-widget:visible';

function parseArgs(argv) {
	const positional = [];
	const options = {};
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (!argument.startsWith('--')) {
			positional.push(argument);
			continue;
		}

		const equalsIndex = argument.indexOf('=');
		if (equalsIndex !== -1) {
			options[argument.slice(2, equalsIndex)] = argument.slice(equalsIndex + 1);
			continue;
		}

		const key = argument.slice(2);
		const next = argv[index + 1];
		if (next && !next.startsWith('--')) {
			options[key] = next;
			index++;
		} else {
			options[key] = true;
		}
	}
	return { positional, options };
}

function numberOption(options, key, fallback) {
	const value = options[key];
	if (value === undefined) {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`--${key} must be a positive number`);
	}
	return parsed;
}

function elapsedMs(start) {
	return Math.round(performance.now() - start);
}

function normalizeText(text) {
	return text.replace(/\u00a0/g, ' ').replace(/\r?\n/g, '');
}

async function connect(cdpPort) {
	if (!cdpPort) {
		throw new Error('Missing --cdp <port>');
	}
	const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
	const contexts = browser.contexts();
	const pages = contexts.flatMap(context => context.pages());
	if (pages.length === 0) {
		await browser.close();
		throw new Error(`CDP port ${cdpPort} has no pages`);
	}

	const page = pages.find(candidate => candidate.url().startsWith('vscode-file:'))
		?? pages.find(candidate => candidate.url() !== 'about:blank')
		?? pages[0];
	return { browser, page };
}

async function visibleModals(page) {
	return page.evaluate(() => {
		const visible = element => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
		};
		const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .monaco-dialog-box')).filter(visible);
		const elements = dialogs.length > 0
			? dialogs
			: Array.from(document.querySelectorAll('.quick-input-widget')).filter(visible);
		const topLevel = elements.filter(element => !elements.some(other => other !== element && other.contains(element)));
		return topLevel.map((element, index) => ({
			index,
			role: element.getAttribute('role'),
			className: element.className,
			text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
			buttons: Array.from(element.querySelectorAll('button, .monaco-button')).map(button => ({
				name: button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent?.trim() ?? '',
				disabled: button.hasAttribute('disabled'),
			})),
		}));
	});
}

async function handleKnownModals(page, timeoutMs) {
	const handled = [];
	for (let attempt = 0; attempt < 8; attempt++) {
		const modals = await visibleModals(page);
		if (modals.length === 0) {
			return handled;
		}

		if (modals.length !== 1) {
			throw new Error(`Expected one modal, found ${modals.length}: ${JSON.stringify(modals)}`);
		}

		const [modal] = modals;
		const modalLocator = (modal.role === 'dialog' || modal.className.includes('monaco-dialog-box'))
			? page.locator('[role="dialog"]:visible, .monaco-dialog-box:visible').last()
			: page.locator('.quick-input-widget:visible').last();
		const isWorkspaceTrust = /trust|restricted mode|authors of the files/i.test(modal.text);
		if (!isWorkspaceTrust) {
			throw new Error(`Unknown modal blocks the page: ${JSON.stringify(modal)}`);
		}

		const trustButton = modalLocator.getByRole('button', {
			name: /^(yes, i trust the authors|trust folder(?: & continue)?|trust|continue)$/i,
		}).last();
		if (await trustButton.count() === 0) {
			throw new Error(`Workspace Trust modal has no recognized trust button: ${JSON.stringify(modal)}`);
		}

		const label = await trustButton.getAttribute('aria-label')
			?? await trustButton.getAttribute('title')
			?? await trustButton.textContent()
			?? 'Trust';
		await trustButton.click();
		await modalLocator.waitFor({ state: 'hidden', timeout: timeoutMs });
		handled.push(label.trim());
	}

	throw new Error('Known modal handling exceeded 8 iterations');
}

async function modalGate(page, timeoutMs) {
	const handled = await handleKnownModals(page, timeoutMs);
	const remaining = await visibleModals(page);
	if (remaining.length > 0) {
		throw new Error(`Modal remained visible after handling: ${JSON.stringify(remaining)}`);
	}
	return handled;
}

async function pollWithModalGate(page, timeoutMs, description, check) {
	const start = performance.now();
	const handledModals = [];
	while (performance.now() - start < timeoutMs) {
		handledModals.push(...await modalGate(page, Math.min(5_000, timeoutMs)));
		const result = await check();
		if (result) {
			return { result, handledModals };
		}
		await page.waitForTimeout(50);
	}
	throw new Error(`${description} did not complete within ${timeoutMs}ms`);
}

async function pageState(page) {
	return page.evaluate(({ responseSelector, requestSelector, modalSelector }) => {
		const visible = element => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
		};
		const responses = Array.from(document.querySelectorAll(responseSelector)).filter(visible);
		const requests = Array.from(document.querySelectorAll(requestSelector)).filter(visible);
		const loadingResponses = responses.filter(element => element.classList.contains('chat-response-loading'));
		const modals = Array.from(document.querySelectorAll(modalSelector)).filter(visible);
		return {
			title: document.title,
			url: location.href,
			activeElement: document.activeElement?.className ?? document.activeElement?.tagName ?? null,
			chatInputVisible: Array.from(document.querySelectorAll('.native-edit-context')).some(visible),
			requestCount: requests.length,
			responseCount: responses.length,
			loadingResponseCount: loadingResponses.length,
			lastResponseText: (responses.at(-1)?.querySelector(':scope > .value')?.innerText ?? responses.at(-1)?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 2_000),
			visibleModalCount: modals.length,
			bodyTextTail: (document.body.innerText ?? '').slice(-1_000),
		};
	}, {
		responseSelector: RESPONSE_SELECTOR,
		requestSelector: REQUEST_SELECTOR,
		modalSelector: MODAL_SELECTOR.replaceAll(':visible', ''),
	});
}

async function prepare(page, timeoutMs) {
	const start = performance.now();
	await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
	await page.locator('body').waitFor({ state: 'visible', timeout: timeoutMs });
	const handledModals = await modalGate(page, timeoutMs);
	return {
		action: 'prepare',
		ok: true,
		durationMs: elapsedMs(start),
		handledModals,
		state: await pageState(page),
	};
}

async function ensureWorkspace(page, workspace, timeoutMs) {
	if (!workspace) {
		return {
			action: 'workspace',
			ok: true,
			durationMs: 0,
			selected: false,
			reason: 'No workspace requested',
			handledModals: [],
		};
	}

	const start = performance.now();
	const handledModals = await modalGate(page, timeoutMs);
	const pickerButton = page.getByRole('button', { name: /Start by picking a workspace/i }).filter({ visible: true });
	if (await pickerButton.count() === 0) {
		return {
			action: 'workspace',
			ok: true,
			durationMs: elapsedMs(start),
			selected: false,
			reason: 'A workspace is already selected',
			handledModals,
		};
	}

	await pickerButton.click();
	await modalGate(page, timeoutMs);
	const selectOption = page.getByRole('option', { name: 'Select...' }).filter({ visible: true });
	await selectOption.waitFor({ state: 'visible', timeout: timeoutMs });
	await selectOption.click();

	const quickInput = page.locator('.quick-input-widget:visible').last();
	await quickInput.waitFor({ state: 'visible', timeout: timeoutMs });
	const folderPathInput = quickInput.getByRole('textbox', { name: 'Folder path' });
	await folderPathInput.fill(workspace);
	await quickInput.getByRole('button', { name: 'OK' }).click();

	let pickerConfirmations = 1;
	const selectionStart = performance.now();
	await page.waitForTimeout(100);
	while (performance.now() - selectionStart < timeoutMs) {
		const modals = await visibleModals(page);
		if (modals.some(modal => modal.role === 'dialog' || modal.className.includes('monaco-dialog-box'))) {
			handledModals.push(...await handleKnownModals(page, timeoutMs));
			continue;
		}

		const visibleQuickInput = page.locator('.quick-input-widget:visible').last();
		if (await visibleQuickInput.count() > 0) {
			const visibleFolderPathInput = visibleQuickInput.getByRole('textbox', { name: 'Folder path' });
			const currentPath = (await visibleFolderPathInput.inputValue()).replace(/[\\/]+$/, '');
			const expectedPath = workspace.replace(/[\\/]+$/, '');
			if (currentPath !== expectedPath) {
				throw new Error(`Workspace picker moved to an unexpected path: expected ${JSON.stringify(expectedPath)}, got ${JSON.stringify(currentPath)}`);
			}
			await visibleQuickInput.getByRole('button', { name: 'OK' }).click();
			pickerConfirmations++;
			await page.waitForTimeout(100);
			continue;
		}

		const pickerVisible = await page.getByRole('button', { name: /Start by picking a workspace/i }).filter({ visible: true }).count() > 0;
		if (!pickerVisible) {
			return {
				action: 'workspace',
				ok: true,
				durationMs: elapsedMs(start),
				selected: true,
				workspace,
				pickerConfirmations,
				handledModals,
			};
		}
		await page.waitForTimeout(50);
	}

	throw new Error(`Workspace selection did not complete within ${timeoutMs}ms`);
}

async function focusChatInput(page, timeoutMs) {
	await modalGate(page, timeoutMs);
	let input;
	for (const selector of CHAT_INPUT_SELECTORS) {
		const candidate = page.locator(selector).filter({ visible: true }).last();
		if (await candidate.count() > 0) {
			input = candidate;
			break;
		}
	}
	if (!input) {
		await page.keyboard.press(process.platform === 'darwin' ? 'Control+Meta+i' : 'Control+Alt+i');
		await modalGate(page, timeoutMs);
		for (const selector of CHAT_INPUT_SELECTORS) {
			const candidate = page.locator(selector).filter({ visible: true }).last();
			if (await candidate.count() > 0) {
				input = candidate;
				break;
			}
		}
	}
	if (!input) {
		throw new Error('No visible chat input appeared after focusing Chat');
	}
	await input.focus();
	return input;
}

async function waitForComposerReady(page, timeoutMs, workspace) {
	let workspaceReselections = 0;
	const completion = await pollWithModalGate(page, timeoutMs, 'Chat composer', async () => {
		const pickerVisible = await page.getByRole('button', { name: /Start by picking a workspace/i }).filter({ visible: true }).count() > 0;
		if (pickerVisible && workspace) {
			const selection = await ensureWorkspace(page, workspace, timeoutMs);
			workspaceReselections += selection.selected ? 1 : 0;
			return false;
		}
		return page.evaluate(() => {
		const visible = element => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
		};
		const areas = Array.from(document.querySelectorAll('.new-chat-input-area, .interactive-input-part'))
			.filter(visible);
		const area = areas.at(-1);
		if (!area) {
			return false;
		}

		const modelPicker = area.querySelector('.model-picker-split');
		if (modelPicker) {
			return modelPicker.getAttribute('aria-disabled') !== 'true'
				&& (modelPicker.textContent ?? '').trim().length > 0;
		}

		const loadingSpinner = area.querySelector('.sessions-chat-loading-spinner');
		return !loadingSpinner || !visible(loadingSpinner);
		});
	});
	return {
		...completion,
		workspaceReselections,
	};
}

async function pasteAndVerify(page, input, message) {
	await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
	await page.keyboard.press('Backspace');
	await input.evaluate((element, text) => {
		element.focus();
		const data = new DataTransfer();
		data.setData('text/plain', text);
		element.dispatchEvent(new ClipboardEvent('paste', {
			clipboardData: data,
			bubbles: true,
			cancelable: true,
		}));
	}, message);

	const expected = normalizeText(message);
	let result;
	const verificationStart = performance.now();
	while (performance.now() - verificationStart < 2_000) {
		result = await input.evaluate(element => {
			const editor = element.closest('.monaco-editor');
			const viewLines = Array.from(editor?.querySelectorAll('.view-line') ?? []).map(line => line.textContent ?? '');
			return {
				viewLines,
				active: document.activeElement === element,
			};
		});
		if (result.active && normalizeText(result.viewLines.join('')) === expected) {
			return { actualLength: expected.length, viewLineCount: result.viewLines.length };
		}
		await page.waitForTimeout(25);
	}
	const actual = normalizeText(result?.viewLines.join('') ?? '');
	if (!result?.active) {
		throw new Error('Chat input lost focus while inserting the prompt');
	}
	throw new Error(`Chat input verification failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function sendChat(page, message, expectedText, timeoutMs, setupTimeoutMs, workspace) {
	if (!message) {
		throw new Error('Chat action requires a non-empty message');
	}
	const start = performance.now();
	const handledModals = await modalGate(page, timeoutMs);
	const composerStart = performance.now();
	const composerReady = await waitForComposerReady(page, setupTimeoutMs, workspace);
	const composerReadyMs = elapsedMs(composerStart);
	const input = await focusChatInput(page, timeoutMs);
	const inputVerification = await pasteAndVerify(page, input, message);
	await modalGate(page, timeoutMs);

	const before = await pageState(page);
	const sendReady = await pollWithModalGate(page, timeoutMs, 'Chat Send control', async () => {
		const sendButton = page.getByRole('button', { name: /^Send(?:\s|\(|$)/i }).filter({ visible: true }).last();
		if (await sendButton.count() === 0 || !await sendButton.isEnabled()) {
			return false;
		}
		return true;
	});
	const sendButton = page.getByRole('button', { name: /^Send(?:\s|\(|$)/i }).filter({ visible: true }).last();
	await sendButton.click();
	let observedLoading = false;
	const completion = await pollWithModalGate(page, timeoutMs, 'Chat response', async () => page.evaluate(({ responseSelector, previousCount }) => {
		const responses = Array.from(document.querySelectorAll(responseSelector));
		const last = responses.at(-1);
		return {
			responseCount: responses.length,
			loading: responses.some(element => element.classList.contains('chat-response-loading')),
			complete: responses.length > previousCount && !!last && !last.classList.contains('chat-response-loading'),
			responseText: (last?.querySelector(':scope > .value')?.innerText ?? last?.innerText ?? '').replace(/\s+/g, ' ').trim(),
		};
	}, { responseSelector: RESPONSE_SELECTOR, previousCount: before.responseCount }).then(state => {
		observedLoading ||= state.loading;
		return state.complete ? state : false;
	}));
	const result = completion.result;

	if (expectedText && !result.responseText.includes(expectedText)) {
		throw new Error(`Completed response did not include ${JSON.stringify(expectedText)}: ${JSON.stringify(result.responseText.slice(0, 500))}`);
	}

	return {
		action: 'chat',
		ok: true,
		durationMs: elapsedMs(start),
		handledModals: [...handledModals, ...composerReady.handledModals, ...sendReady.handledModals, ...completion.handledModals],
		inputVerification,
		composerReadyMs,
		workspaceReselections: composerReady.workspaceReselections,
		observedLoading,
		responseText: result.responseText.slice(0, 2_000),
		state: await pageState(page),
	};
}

async function chatFingerprint(page) {
	return page.evaluate(({ requestSelector, responseSelector }) => {
		const requests = Array.from(document.querySelectorAll(requestSelector));
		const responses = Array.from(document.querySelectorAll(responseSelector));
		const transcript = [...requests, ...responses]
			.map(element => (element.innerText ?? '').replace(/\s+/g, ' ').trim())
			.join('\n');
		return {
			url: location.href,
			requestCount: requests.length,
			responseCount: responses.length,
			transcript,
		};
	}, { requestSelector: REQUEST_SELECTOR, responseSelector: RESPONSE_SELECTOR });
}

async function forkConversation(page, timeoutMs) {
	const start = performance.now();
	const handledModals = await modalGate(page, timeoutMs);
	const before = await chatFingerprint(page);

	const requests = page.locator(REQUEST_SELECTOR).filter({ visible: true });
	if (await requests.count() > 0) {
		await requests.last().hover();
	}
	await modalGate(page, timeoutMs);

	const forkButton = page.getByRole('button', { name: /^Fork conversation from this point$/i }).filter({ visible: true }).last();
	await forkButton.waitFor({ state: 'visible', timeout: timeoutMs });
	await forkButton.click();

	const completion = await pollWithModalGate(page, timeoutMs, 'Fork', () => page.evaluate(({ requestSelector, responseSelector, before }) => {
		const requests = Array.from(document.querySelectorAll(requestSelector));
		const responses = Array.from(document.querySelectorAll(responseSelector));
		const transcript = [...requests, ...responses]
			.map(element => (element.innerText ?? '').replace(/\s+/g, ' ').trim())
			.join('\n');
		const busy = Array.from(document.querySelectorAll('[aria-busy="true"]'))
			.some(element => /fork/i.test(element.getAttribute('aria-label') ?? element.getAttribute('title') ?? ''));
		const changed = location.href !== before.url
			|| requests.length !== before.requestCount
			|| responses.length !== before.responseCount
			|| transcript !== before.transcript;
		return changed && !busy ? {
			url: location.href,
			requestCount: requests.length,
			responseCount: responses.length,
			transcript: transcript.slice(0, 2_000),
		} : false;
	}, { requestSelector: REQUEST_SELECTOR, responseSelector: RESPONSE_SELECTOR, before }));
	return {
		action: 'fork',
		ok: true,
		durationMs: elapsedMs(start),
		handledModals: [...handledModals, ...completion.handledModals],
		before: {
			url: before.url,
			requestCount: before.requestCount,
			responseCount: before.responseCount,
		},
		after: completion.result,
		state: await pageState(page),
	};
}

async function runScenario(page, scenario, timeoutMs, setupTimeoutMs, workspace) {
	if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
		throw new Error('Scenario must contain a non-empty steps array');
	}
	const start = performance.now();
	const steps = [];
	steps.push(await ensureWorkspace(page, workspace ?? scenario.workspace, setupTimeoutMs));
	for (const step of scenario.steps) {
		await modalGate(page, numberOption(step, 'timeoutMs', timeoutMs));
		switch (step.action) {
			case 'prepare':
				steps.push(await prepare(page, numberOption(step, 'timeoutMs', timeoutMs)));
				break;
			case 'chat':
				steps.push(await sendChat(
					page,
					step.message,
					step.expect,
					numberOption(step, 'timeoutMs', timeoutMs),
					numberOption(step, 'setupTimeoutMs', setupTimeoutMs),
					workspace ?? scenario.workspace,
				));
				break;
			case 'fork':
				steps.push(await forkConversation(page, numberOption(step, 'timeoutMs', timeoutMs)));
				break;
			default:
				throw new Error(`Unknown scenario action: ${step.action}`);
		}
	}
	return {
		name: scenario.name ?? 'unnamed',
		ok: true,
		durationMs: elapsedMs(start),
		steps,
		finalState: await pageState(page),
	};
}

async function recordActions(page, durationMs, outputPath, timeoutMs) {
	await modalGate(page, timeoutMs);
	await page.evaluate(() => {
		const describe = (element, includeText) => {
			if (!(element instanceof Element)) {
				return null;
			}
			const explicitName = element.getAttribute('aria-label') ?? element.getAttribute('title');
			return {
				tag: element.tagName.toLowerCase(),
				role: element.getAttribute('role'),
				name: explicitName ?? (includeText ? element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '' : null),
				textLength: explicitName ? undefined : element.textContent?.length,
				id: element.id || null,
				classes: Array.from(element.classList).slice(0, 8),
			};
		};
		const events = [];
		const push = (type, event, extra = {}) => {
			events.push({
				atMs: Math.round(performance.now()),
				type,
				target: describe(event.target, true),
				...extra,
			});
		};
		const onClick = event => push('click', event, { button: event.button });
		const onInput = event => push('input', event, {
			redacted: true,
			length: typeof event.target?.value === 'string' ? event.target.value.length : undefined,
		});
		const onKeydown = event => push('keydown', event, {
			key: event.key.length === 1 ? '<printable>' : event.key,
			altKey: event.altKey,
			ctrlKey: event.ctrlKey,
			metaKey: event.metaKey,
			shiftKey: event.shiftKey,
		});
		const onFocus = event => push('focus', event);
		document.addEventListener('click', onClick, true);
		document.addEventListener('input', onInput, true);
		document.addEventListener('keydown', onKeydown, true);
		document.addEventListener('focusin', onFocus, true);

		let mutationSummary = { added: 0, removed: 0, attributes: 0, targets: [] };
		const observer = new MutationObserver(records => {
			for (const record of records) {
				mutationSummary.added += record.addedNodes.length;
				mutationSummary.removed += record.removedNodes.length;
				mutationSummary.attributes += record.type === 'attributes' ? 1 : 0;
				const target = describe(record.target, false);
				if (target && mutationSummary.targets.length < 20) {
					mutationSummary.targets.push(target);
				}
			}
		});
		observer.observe(document.body, { childList: true, subtree: true, attributes: true });
		window.__launchSkillRecorder = {
			events,
			finish: () => {
				observer.disconnect();
				document.removeEventListener('click', onClick, true);
				document.removeEventListener('input', onInput, true);
				document.removeEventListener('keydown', onKeydown, true);
				document.removeEventListener('focusin', onFocus, true);
				return {
					events,
					mutations: mutationSummary,
					title: document.title,
					url: location.href,
				};
			},
		};
	});

	await new Promise(resolve => setTimeout(resolve, durationMs));
	const recording = await page.evaluate(() => window.__launchSkillRecorder.finish());
	await fs.writeFile(outputPath, `${JSON.stringify(recording, null, '\t')}\n`);
	return {
		action: 'record',
		ok: true,
		durationMs,
		output: outputPath,
		eventCount: recording.events.length,
		mutations: recording.mutations,
	};
}

function printHelp() {
	console.log(`Launch skill checked UI driver

Usage:
  drive.mjs inspect --cdp <port>
  drive.mjs prepare --cdp <port>
  drive.mjs chat --cdp <port> --message <text> [--expect <text>] [--timeout-ms <ms>] [--setup-timeout-ms <ms>]
  drive.mjs fork --cdp <port> [--timeout-ms <ms>]
  drive.mjs scenario --cdp <port> --file <scenario.json> [--workspace <path>] [--timeout-ms <ms>]
  drive.mjs record --cdp <port> --output <recording.json> [--duration-ms <ms>]

Every command gates actions on visible modals. Known Workspace Trust dialogs are
handled and awaited; unknown dialogs fail the command with diagnostics.`);
}

async function main() {
	const { positional, options } = parseArgs(process.argv.slice(2));
	const command = positional[0];
	if (!command || command === 'help' || options.help) {
		printHelp();
		return;
	}

	const timeoutMs = numberOption(options, 'timeout-ms', DEFAULT_TIMEOUT_MS);
	const setupTimeoutMs = numberOption(options, 'setup-timeout-ms', DEFAULT_SETUP_TIMEOUT_MS);
	const { browser, page } = await connect(options.cdp);
	try {
		let result;
		try {
			switch (command) {
				case 'inspect':
					result = {
						action: 'inspect',
						ok: true,
						modals: await visibleModals(page),
						state: await pageState(page),
					};
					break;
				case 'prepare':
					result = {
						action: 'prepare',
						ok: true,
						steps: [
							await prepare(page, timeoutMs),
							await ensureWorkspace(page, options.workspace, timeoutMs),
						],
						state: await pageState(page),
					};
					break;
				case 'chat':
					result = await sendChat(page, options.message, options.expect, timeoutMs, setupTimeoutMs, options.workspace);
					break;
				case 'fork':
					result = await forkConversation(page, timeoutMs);
					break;
				case 'scenario': {
					if (!options.file) {
						throw new Error('scenario requires --file <scenario.json>');
					}
					const scenario = JSON.parse(await fs.readFile(options.file, 'utf8'));
					result = await runScenario(page, scenario, timeoutMs, setupTimeoutMs, options.workspace);
					break;
				}
				case 'record': {
					if (!options.output) {
						throw new Error('record requires --output <recording.json>');
					}
					result = await recordActions(page, numberOption(options, 'duration-ms', 30_000), options.output, timeoutMs);
					break;
				}
				default:
					throw new Error(`Unknown command: ${command}`);
			}
			console.log(JSON.stringify(result));
		} catch (error) {
			let diagnostics;
			try {
				diagnostics = {
					modals: await visibleModals(page),
					state: await pageState(page),
				};
			} catch (diagnosticError) {
				diagnostics = {
					error: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError),
				};
			}
			console.error(JSON.stringify({
				ok: false,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				diagnostics,
			}));
			process.exitCode = 1;
		}
	} finally {
		await browser.close();
	}
}

main().catch(error => {
	console.error(JSON.stringify({
		ok: false,
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
	}));
	process.exitCode = 1;
});
