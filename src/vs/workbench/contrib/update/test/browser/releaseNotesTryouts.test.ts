/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SinonStub, stub } from 'sinon';
import { $ } from '../../../../../base/browser/dom.js';
import { safeSetInnerHtml } from '../../../../../base/browser/domSanitize.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { createCommandUri } from '../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { LanguageService } from '../../../../../editor/common/services/languageService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotification, INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IPreferencesService, ISetting } from '../../../../services/preferences/common/preferences.js';
import { SimpleSettingRenderer } from '../../../markdown/browser/markdownSettingRenderer.js';
import { createOnboardingTryoutUri, IOnboardingTryoutMetadata, IOnboardingTryoutScenario, IOnboardingTryoutService, OnboardingTryoutAvailability, OnboardingTryoutResult, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../../../onboarding/common/onboardingTryout.js';
import { IWebview, WebviewMessageReceivedEvent } from '../../../webview/browser/webview.js';
import { renderReleaseNotesMarkdown } from '../../browser/releaseNotesEditor.js';
import { initializeReleaseNotesTryouts, ReleaseNotesTryouts } from '../../browser/releaseNotesTryouts.js';

suite('Release notes Try This', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sampleUri = createOnboardingTryoutUri('sample');
	let instantiationService: TestInstantiationService;
	let tryouts: ReleaseNotesTryouts;
	let availability: Map<string, OnboardingTryoutAvailability>;
	let scenarios: Map<string, IOnboardingTryoutScenario>;
	let changes: Emitter<void>;
	let onMessage: Emitter<WebviewMessageReceivedEvent>;
	let onDispose: Emitter<void>;
	let webview: IWebview;
	let messages: object[];
	let notifications: INotification[];
	let runImplementation: IOnboardingTryoutService['run'];
	let runs: string[];
	let executeCommand: SinonStub<[string, ...unknown[]], Promise<undefined>>;
	let focusCount: number;
	let canRestoreFocus: boolean;

	function register(id: string, metadata: Partial<IOnboardingTryoutMetadata> = {}): void {
		scenarios.set(id, {
			id,
			trigger: { kind: 'command', commandId: RUN_ONBOARDING_TRYOUT_COMMAND_ID },
			presentation: { kind: 'test', payload: {} },
			tryout: { title: 'Local Example', description: 'A local description.', ...metadata },
		});
	}

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
		instantiationService.stub(IExtensionService, { whenInstalledExtensionsRegistered: async () => true });
		instantiationService.stub(ILanguageService, store.add(new LanguageService()));
		availability = new Map();
		scenarios = new Map();
		register('sample');
		register('other');
		changes = store.add(new Emitter<void>());
		onMessage = store.add(new Emitter<WebviewMessageReceivedEvent>());
		onDispose = store.add(new Emitter<void>());
		messages = [];
		notifications = [];
		runs = [];
		focusCount = 0;
		canRestoreFocus = true;
		runImplementation = async () => ({ kind: 'opened' });
		executeCommand = stub<[string, ...unknown[]], Promise<undefined>>().resolves(undefined);
		instantiationService.stub(ICommandService, { executeCommand });
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override notify(notification: INotification) {
				notifications.push(notification);
				return super.notify(notification);
			}
		});
		instantiationService.stub(IOnboardingTryoutService, new class extends mock<IOnboardingTryoutService>() {
			override readonly onDidChange = changes.event;
			override getTryout(id: string) { return scenarios.get(id); }
			override getAvailability(id: string): OnboardingTryoutAvailability {
				assert.ok(scenarios.has(id), 'Only locally registered IDs may be resolved');
				return availability.get(id) ?? { kind: 'ready' };
			}
			override run(id: string, token?: CancellationToken) {
				runs.push(id);
				return runImplementation(id, token);
			}
		});
		tryouts = store.add(instantiationService.createInstance(ReleaseNotesTryouts));
		webview = new class extends mock<IWebview>() {
			override readonly onMessage = onMessage.event;
			override readonly onDidDispose = onDispose.event;
			override async postMessage(message: object): Promise<boolean> {
				messages.push(message);
				return true;
			}
			override focus(): void { focusCount++; }
			override setHtml(): void { assert.fail('Availability updates must not reset the document'); }
		};
	});

	async function render(markdown = `[Fetched label](${sampleUri})`, enabled = true): Promise<HTMLElement> {
		const html = await renderReleaseNotesMarkdown(
			markdown,
			instantiationService.get(IExtensionService),
			instantiationService.get(ILanguageService),
			instantiationService.createInstance(SimpleSettingRenderer),
			'stable',
			enabled ? tryouts : undefined,
		);
		const container = $('div');
		safeSetInnerHtml(container, html.toString(), {
			allowedLinkProtocols: { override: [Schemas.http, Schemas.https, Schemas.command, Schemas.codeSetting] },
			allowedTags: { augment: ['button', 'nav', 'svg', 'path'] },
			allowedAttributes: { augment: ['class', 'id', 'hidden', 'aria-label', 'aria-disabled', 'data-release-notes-tryout-id', 'data-release-notes-tryout-index', 'viewBox', 'fill', 'd'] },
		});
		return container;
	}

	function attach(): void {
		tryouts.attach(webview, () => canRestoreFocus);
		onMessage.fire({ message: { type: 'releaseNotesTryoutsReady', documentId: tryouts.documentId } });
		messages.length = 0;
	}

	function request(action: 'run' | 'setup' = 'run', extra: object = {}): void {
		onMessage.fire({ message: { type: 'releaseNotesTryout', documentId: tryouts.documentId, id: 'sample', index: 0, action, ...extra } });
	}

	test('renders ready links with only the registered ID and local contextual metadata', async () => {
		register('sample', { isAI: true, targetWindow: 'agents' });
		const container = await render();
		const link = container.querySelector('a')!;
		assert.deepStrictEqual({
			label: link.textContent,
			href: link.getAttribute('href'),
			ariaLabel: link.getAttribute('aria-label'),
			disabled: link.getAttribute('aria-disabled'),
			runs, commands: executeCommand.getCalls(),
		}, {
			label: 'Try This: Local Example',
			href: sampleUri.toString(),
			ariaLabel: 'Try This: Local Example A local description. Opens in the Agents window. Chat examples are prepared for review and are not sent automatically.',
			disabled: 'false',
			runs: [], commands: [],
		});

		test('a failing availability provider leaves ordinary content and other examples usable', async () => {
			const service = instantiationService.get(IOnboardingTryoutService);
			const original = service.getAvailability;
			const availabilityStub = stub(service, 'getAvailability').callsFake(id => {
				if (id === 'sample') {
					throw new Error('Broken provider');
				}
				return original(id);
			});
			const logged = stub(instantiationService.get(ILogService), 'error');
			store.add(toDisposable(() => { availabilityStub.restore(); logged.restore(); }));
			const container = await render(`# Ordinary content\n[Try](${sampleUri}) [Other](${createOnboardingTryoutUri('other')}) [Settings](command:workbench.action.openSettings)`);
			attach();
			changes.fire();
			request();
			await timeout(0);

			assert.deepStrictEqual({
				heading: container.querySelector('h1')?.textContent,
				links: [...container.querySelectorAll('a')].map(link => ({ href: link.getAttribute('href'), disabled: link.getAttribute('aria-disabled') })),
				fallback: container.querySelector('.release-notes-tryout-message')?.textContent,
				logged: logged.called,
				runs,
			}, {
				heading: 'Ordinary content',
				links: [
					{ href: null, disabled: 'true' },
					{ href: createOnboardingTryoutUri('other').toString(), disabled: 'false' },
					{ href: 'command:workbench.action.openSettings', disabled: null },
				],
				fallback: 'This feature example could not be loaded.',
				logged: true,
				runs: [],
			});
		});
	});

	test('hides AI affordances and their labels without removing their update targets', async () => {
		register('sample', { title: 'Hidden AI Example', isAI: true });
		availability.set('sample', { kind: 'hidden' });
		const container = await render();
		assert.deepStrictEqual({
			hidden: container.querySelector<HTMLElement>('[data-release-notes-tryout-id]')?.hidden,
			text: container.textContent?.trim(),
			activeLinks: container.querySelectorAll('a[href]').length,
			leakedTitle: container.innerHTML.includes('Hidden AI Example'),
			runs,
		}, { hidden: true, text: '', activeLinks: 0, leakedTitle: false, runs: [] });
	});

	for (const setup of [false, true]) {
		test(`renders an unavailable explanation ${setup ? 'with' : 'without'} a separate setup action`, async () => {
			availability.set('sample', {
				kind: 'unavailable', message: 'Open a workspace first.',
				action: setup ? { label: 'Open Workspace', command: { id: 'local.setup', arguments: ['local-only'] } } : undefined,
			});
			const container = await render();
			assert.deepStrictEqual({
				href: container.querySelector('a')?.getAttribute('href'),
				disabled: container.querySelector('a')?.getAttribute('aria-disabled'),
				message: container.querySelector('.release-notes-tryout-message')?.textContent,
				setupHidden: container.querySelector<HTMLButtonElement>('button')?.hidden,
				setupLabel: container.querySelector('button')?.textContent,
				leakedCommand: /local\.setup|local-only/.test(container.innerHTML),
			}, {
				href: null, disabled: 'true', message: 'Open a workspace first.',
				setupHidden: !setup, setupLabel: setup ? 'Open Workspace' : '', leakedCommand: false,
			});
		});
	}

	const invalidLinks = [
		['unknown ID', createOnboardingTryoutUri('missing')],
		['extra argument', createCommandUri(RUN_ONBOARDING_TRYOUT_COMMAND_ID, 'sample', 'injected')],
		['object argument', createCommandUri(RUN_ONBOARDING_TRYOUT_COMMAND_ID, { id: 'sample' })],
		['no argument', createCommandUri(RUN_ONBOARDING_TRYOUT_COMMAND_ID)],
		['empty ID', createCommandUri(RUN_ONBOARDING_TRYOUT_COMMAND_ID, '')],
		['whitespace ID', createCommandUri(RUN_ONBOARDING_TRYOUT_COMMAND_ID, ' sample')],
		['newline ID', createCommandUri(RUN_ONBOARDING_TRYOUT_COMMAND_ID, 'sample\n')],
		['oversized ID', createCommandUri(RUN_ONBOARDING_TRYOUT_COMMAND_ID, 'a'.repeat(129))],
		['invalid JSON', sampleUri.with({ query: '%not-json' })],
		['non-array JSON', sampleUri.with({ query: JSON.stringify('sample') })],
		['fragment', sampleUri.with({ fragment: 'extra' })],
	] as const;
	for (const [name, uri] of invalidLinks) {
		test(`keeps a readable, inert fallback for ${name}`, async () => {
			const container = await render(`[Readable fallback](${uri})`);
			assert.deepStrictEqual({
				links: container.querySelectorAll('a[href]').length,
				controls: container.querySelectorAll('[data-release-notes-tryout-id]').length,
				readable: container.textContent?.includes('Readable fallback'),
				explanation: /not available|invalid/.test(container.textContent ?? ''),
			}, { links: 0, controls: 0, readable: true, explanation: true });
		});
	}

	test('accepts the ID length boundary without treating prefixes as registered IDs', async () => {
		const id = 'a'.repeat(128);
		register(id);
		const container = await render(`[Try](${createOnboardingTryoutUri(id)}) [No](${createOnboardingTryoutUri(`${id.slice(0, 127)}b`)})`);
		assert.deepStrictEqual([...container.querySelectorAll('a[href]')].map(link => link.getAttribute('href')), [createOnboardingTryoutUri(id).toString()]);
	});

	test('TRYOUTS is a renderer capability and preserves legacy and quality fallbacks', async () => {
		const markdown = `Before\n<!-- %IF TRYOUTS %\n[Try](${sampleUri})\n%ENDIF % -->\n<!-- %IF STABLE %\nStable fallback\n%ENDIF % -->\n<!-- %IF INSIDERS %\nInsiders only\n%ENDIF % -->\nAfter`;
		const legacy = await render(markdown, false);
		const integrated = await render(markdown);
		assert.deepStrictEqual({
			legacyLinks: legacy.querySelectorAll('a').length,
			legacyFallback: legacy.textContent?.includes('Stable fallback'),
			integratedLinks: integrated.querySelectorAll('a[href]').length,
			integratedFallback: integrated.textContent?.includes('Stable fallback'),
			insiders: integrated.textContent?.includes('Insiders only'),
		}, { legacyLinks: 0, legacyFallback: true, integratedLinks: 1, integratedFallback: true, insiders: false });
	});

	test('escapes local text and sanitizes fetched HTML before recognizing raw links', async () => {
		register('sample', { title: '<img src=x onerror=alert(1)>', description: '"<script>alert(2)</script>&' });
		availability.set('sample', {
			kind: 'unavailable', message: '<svg onload=alert(3)>',
			action: { label: '<img onerror=alert(4)>', command: { id: 'local.setup' } },
		});
		const container = await render(`<script>alert(5)</script><a href="${sampleUri}" onclick="alert(6)" data-release-notes-tryout-id="other">Try</a><a href="javascript:alert(7)">Bad</a>`);
		assert.deepStrictEqual({
			activeMarkup: container.querySelectorAll('script, img, svg, [onclick], [onerror], [onload], a[href]').length,
			ids: [...container.querySelectorAll<HTMLElement>('[data-release-notes-tryout-id]')].map(element => element.dataset.releaseNotesTryoutId),
			label: container.querySelector('.release-notes-tryout-link')?.textContent,
			message: container.querySelector('.release-notes-tryout-message')?.textContent,
			setup: container.querySelector('button')?.textContent,
		}, {
			activeMarkup: 0, ids: ['sample'],
			label: 'Try This: <img src=x onerror=alert(1)>',
			message: '<svg onload=alert(3)>', setup: '<img onerror=alert(4)>',
		});
	});

	test('preserves TOC, setting chips, command links and media sanitization with the integration', async () => {
		instantiationService.stub(IPreferencesService, {
			getSetting: () => new class extends mock<ISetting>() {
				override key = 'editor.wordWrap';
				override value = 'off';
				override type = 'string';
			},
		});
		const markdown = '<!-- TOC\n<nav id="toc-nav"><a href="#heading">Heading</a></nav>\nNavigation End -->\n## Heading\n[Settings](command:workbench.action.openSettings) [Summary](command:summarize.release.notes)\n`setting(editor.wordWrap:on)`\n<svg viewBox="0 0 16 16"><path fill="currentColor" d="M0 0"></path></svg><img src="https://example.com/image.png" onerror="alert(1)">';
		const legacy = await render(markdown, false);
		const integrated = await render(markdown);
		assert.deepStrictEqual(integrated.innerHTML, legacy.innerHTML);
	});

	test('skips tryout DOM processing when sanitized notes contain no tryout links', async () => {
		const renderTryouts = stub(tryouts, 'render').callThrough();
		store.add(toDisposable(() => renderTryouts.restore()));
		const markdown = '# Ordinary notes\n[Settings](command:workbench.action.openSettings)\n<script>untrusted()</script><img src="https://example.com/image.png" onerror="untrusted()">\n```text\ncommand:workbench.action.onboarding.tryFeature\n```';
		const legacy = await render(markdown, false);
		const integrated = await render(markdown);

		assert.deepStrictEqual({
			renderCalls: renderTryouts.callCount,
			sameContent: integrated.innerHTML === legacy.innerHTML,
			activeMarkup: integrated.querySelectorAll('script, [onerror]').length,
			settingsLink: integrated.querySelector('a')?.getAttribute('href'),
		}, {
			renderCalls: 0,
			sameContent: true,
			activeMarkup: 0,
			settingsLink: 'command:workbench.action.openSettings',
		});
	});

	test('still removes forged tryout attributes when there are no tryout links', async () => {
		const container = await render('<span data-release-notes-tryout-id="sample" data-release-notes-tryout-index="0"><a href="command:workbench.action.openSettings">Settings</a></span>');
		assert.deepStrictEqual({
			forgedTargets: container.querySelectorAll('[data-release-notes-tryout-id], [data-release-notes-tryout-index]').length,
			href: container.querySelector('a')?.getAttribute('href'),
			runs,
		}, { forgedTargets: 0, href: 'command:workbench.action.openSettings', runs: [] });
	});

	for (const encodedCommand of ['%77orkbench', '&#119;orkbench']) {
		test(`recognizes a tryout link with ${encodedCommand} in its encoded command ID`, async () => {
			const container = await render(`<a href="${sampleUri.toString().replace('workbench', encodedCommand)}">Fetched label</a>`);
			assert.deepStrictEqual({
				id: container.querySelector<HTMLElement>('[data-release-notes-tryout-id]')?.dataset.releaseNotesTryoutId,
				label: container.querySelector('a')?.textContent,
			}, { id: 'sample', label: 'Try This: Local Example' });
		});
	}

	test('posts only changed IDs and no compiled commands on availability changes', async () => {
		await render(`[Try](${sampleUri}) [Other](${createOnboardingTryoutUri('other')}) [Again](${sampleUri})`);
		attach();
		changes.fire();
		availability.set('sample', { kind: 'unavailable', message: 'Sign in first.', action: { label: 'Sign In', command: { id: 'local.signIn', arguments: ['secret-local'] } } });
		changes.fire();
		changes.fire();
		assert.deepStrictEqual(messages, [{
			type: 'releaseNotesTryouts', documentId: tryouts.documentId,
			states: [{
				id: 'sample', kind: 'unavailable', label: 'Try This: Local Example',
				ariaLabel: 'Try This: Local Example A local description. Sign in first.',
				href: '', message: 'Sign in first.', setupLabel: 'Sign In', setupAriaLabel: 'Sign In for Local Example',
			}],
		}]);
	});

	test('revalidates primary actions even when availability changes without a notification', async () => {
		await render();
		attach();
		availability.set('sample', { kind: 'unavailable', message: 'No longer available.' });
		request();
		await timeout(0);
		assert.deepStrictEqual({ runs, commands: executeCommand.callCount, notification: notifications[0]?.message, focusCount }, {
			runs: [], commands: 0, notification: 'No longer available.', focusCount: 1,
		});
	});

	test('runs ready examples only after an explicit validated activation', async () => {
		await render();
		attach();
		request();
		await timeout(0);
		assert.deepStrictEqual({ runs, commands: executeCommand.callCount, focusCount }, { runs: ['sample'], commands: 0, focusCount: 0 });
	});

	test('coalesces repeated activation without cancelling the pending example', async () => {
		await render();
		attach();
		const pending = new DeferredPromise<OnboardingTryoutResult>();
		let token: CancellationToken | undefined;
		runImplementation = async (_id, sourceToken) => {
			token = sourceToken;
			return pending.p;
		};
		request();
		request();
		const cancelledBeforeCompletion = token?.isCancellationRequested;
		await pending.complete({ kind: 'opened' });
		await timeout(0);
		assert.deepStrictEqual({ runs, cancelledBeforeCompletion, focusCount }, {
			runs: ['sample'], cancelledBeforeCompletion: false, focusCount: 0,
		});
	});

	test('resolves the setup command and arguments afresh and never runs the example afterwards', async () => {
		availability.set('sample', { kind: 'unavailable', message: 'Setup needed.', action: { label: 'Set Up', command: { id: 'old.setup', arguments: ['old'] } } });
		await render();
		attach();
		availability.set('sample', { kind: 'unavailable', message: 'Setup needed.', action: { label: 'Set Up', command: { id: 'current.setup', arguments: ['compiled', 42] } } });
		request('setup');
		await timeout(0);
		assert.deepStrictEqual({ commands: executeCommand.getCalls().map(call => call.args), runs, focusCount }, {
			commands: [['current.setup', 'compiled', 42]], runs: [], focusCount: 0,
		});
	});

	test('does not run stale setup actions after an example becomes ready or hidden', async () => {
		availability.set('sample', { kind: 'unavailable', message: 'Setup needed.', action: { label: 'Set Up', command: { id: 'local.setup' } } });
		await render();
		attach();
		availability.set('sample', { kind: 'ready' });
		request('setup');
		await timeout(0);
		availability.set('sample', { kind: 'hidden' });
		request('setup');
		await timeout(0);
		assert.deepStrictEqual({ runs, commands: executeCommand.callCount }, { runs: [], commands: 0 });
	});

	for (const extra of [{ command: { id: 'injected.command', arguments: ['bad'] } }, { arguments: ['bad'] }, { id: 'other' }, { id: 'missing' }, { id: 'sample ', index: 0 }, { index: -1 }, { action: 'arbitrary' }]) {
		test(`rejects forged protocol data ${JSON.stringify(extra)}`, async () => {
			await render();
			attach();
			request('setup', extra);
			await timeout(0);
			assert.deepStrictEqual({ runs, commands: executeCommand.callCount, errors: notifications.length }, { runs: [], commands: 0, errors: 1 });
		});
	}

	test('ignores messages from an earlier document in a reused webview', async () => {
		await render();
		attach();
		request('run', { documentId: 'previous-document' });
		await timeout(0);
		assert.deepStrictEqual({ runs, messages, notifications, focusCount }, { runs: [], messages: [], notifications: [], focusCount: 0 });
	});

	test('rejects malformed direct command links without falling through to arbitrary dispatch', async () => {
		await render();
		attach();
		await tryouts.openLink(createCommandUri(RUN_ONBOARDING_TRYOUT_COMMAND_ID, 'sample', 'injected'));
		await tryouts.openLink(createOnboardingTryoutUri('other'));
		assert.deepStrictEqual({ runs, commands: executeCommand.callCount, errors: notifications.length }, { runs: [], commands: 0, errors: 2 });
	});

	for (const kind of ['cancelled', 'unavailable', 'failure'] as const) {
		test(`restores source focus for a ${kind} result`, async () => {
			await render();
			attach();
			runImplementation = async () => {
				if (kind === 'failure') {
					throw new Error('Could not prepare the example.');
				}
				return kind === 'unavailable' ? { kind, message: 'Target closed.' } : { kind };
			};
			request();
			await timeout(0);
			assert.deepStrictEqual({
				focusCount, messages, errors: notifications.length,
			}, {
				focusCount: 1, messages: [{ type: 'releaseNotesTryoutFocus', documentId: tryouts.documentId, index: 0, action: 'run' }],
				errors: kind === 'cancelled' ? 0 : 1,
			});
		});
	}

	test('does not reclaim focus after the user leaves the source editor', async () => {
		await render();
		attach();
		canRestoreFocus = false;
		runImplementation = async () => ({ kind: 'cancelled' });
		request();
		await timeout(0);
		assert.deepStrictEqual({ focusCount, messages }, { focusCount: 0, messages: [] });
	});

	test('cancels pending preparation on webview disposal and suppresses all late effects', async () => {
		await render();
		attach();
		const pending = new DeferredPromise<OnboardingTryoutResult>();
		let token: CancellationToken | undefined;
		runImplementation = async (_id, sourceToken) => {
			token = sourceToken;
			return pending.p;
		};
		request();
		onDispose.fire();
		changes.fire();
		await pending.complete({ kind: 'unavailable', message: 'Late result.' });
		await timeout(0);
		assert.deepStrictEqual({ cancelled: token?.isCancellationRequested, messages, notifications, focusCount }, {
			cancelled: true, messages: [], notifications: [], focusCount: 0,
		});
	});

	test('updates controls in place without executing on focus or hover', async () => {
		const container = await render();
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const clientMessages: object[] = [];
		store.add(toDisposable(initializeReleaseNotesTryouts(mainWindow.document, tryouts.documentId, { postMessage: message => clientMessages.push(message) })));
		attach();
		const link = container.querySelector<HTMLAnchorElement>('a')!;
		link.focus();
		link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		availability.set('sample', { kind: 'unavailable', message: 'A new explanation.' });
		changes.fire();
		for (const message of messages) {
			mainWindow.dispatchEvent(new MessageEvent('message', { data: message }));
		}
		assert.deepStrictEqual({
			sameLink: link === container.querySelector('a'),
			focused: mainWindow.document.activeElement === link,
			href: link.getAttribute('href'),
			message: container.querySelector('.release-notes-tryout-message')?.textContent,
			clientMessages, runs,
		}, {
			sameLink: true, focused: true, href: null, message: 'A new explanation.',
			clientMessages: [{ type: 'releaseNotesTryoutsReady', documentId: tryouts.documentId }], runs: [],
		});
	});

	test('serialized webview script sends only the document, occurrence, ID and action on activation', async () => {
		availability.set('sample', { kind: 'unavailable', message: 'Setup needed.', action: { label: 'Set Up', command: { id: 'local.setup' } } });
		const container = await render(`[Setup](${sampleUri}) [Ready](${createOnboardingTryoutUri('other')})`);
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const clientMessages: object[] = [];
		const dispose: unknown = new Function('document', 'vscode', `return ${tryouts.getScript()}`)(mainWindow.document, {
			postMessage: (message: object) => clientMessages.push(message),
		});
		assert.ok(typeof dispose === 'function');
		store.add(toDisposable(() => dispose()));
		container.querySelector<HTMLButtonElement>('button')!.click();
		container.querySelector<HTMLAnchorElement>('a[href]')!.click();
		assert.deepStrictEqual(clientMessages, [
			{ type: 'releaseNotesTryoutsReady', documentId: tryouts.documentId },
			{ type: 'releaseNotesTryout', documentId: tryouts.documentId, id: 'sample', index: 0, action: 'setup' },
			{ type: 'releaseNotesTryout', documentId: tryouts.documentId, id: 'other', index: 1, action: 'run' },
		]);
	});
});
