/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { CodexSessionConfigKey, type CodexPermissionsPreset } from '../../../../../../platform/agentHost/common/codexSessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IChat, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { AgentHostCodexApprovalsPicker } from '../../browser/agentHostCodexApprovalsPicker.js';

suite('AgentHostCodexApprovalsPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(initial: CodexPermissionsPreset, status: SessionStatus, write?: Promise<void>) {
		const config: ResolveSessionConfigResult = {
			schema: { type: 'object', properties: { [CodexSessionConfigKey.PermissionsPreset]: { type: 'string', title: 'Approvals', enum: ['default', 'auto-review', 'full-access'], sessionMutable: true, chatMutable: true } } },
			values: { [CodexSessionConfigKey.PermissionsPreset]: initial },
		};
		const changed = store.add(new Emitter<string>());
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = 'test-provider';
			override readonly sessionConfig = this;
			override readonly onDidChangeSessionConfig = changed.event;
			override getSessionConfig() { return config; }
			override getCreateSessionConfig() { return undefined; }
			override isSessionConfigResolving() { return constObservable(false); }
			override async setSessionConfigValue(_sessionId: string, _chat: URI, key: string, value: unknown) {
				await write;
				config.values[key] = value;
				changed.fire('session');
			}
		}();
		const chat = new class extends mock<IChat>() {
			override readonly resource = URI.parse('test-chat:/opaque-id');
			override readonly status = constObservable(status);
		}();
		const activeChat = observableValue<IChat>('chat', chat);
		const session = observableValue<IActiveSession | undefined>('session', new class extends mock<IActiveSession>() {
			override readonly providerId = provider.id;
			override readonly sessionId = 'session';
			override readonly activeChat = activeChat;
		}());
		const dialogs: { message: string; detail: string | undefined }[] = [];
		const actionWidget = new class extends mock<IActionWidgetService>() {
			override isVisible = false;
			select: (value: string) => Promise<void> = async () => { throw new Error('Picker is not open'); };
			onHide: (() => void) | undefined;
			override show<T>(_id: string, _preview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				this.isVisible = true;
				this.onHide = delegate.onHide;
				this.select = async value => {
					const item = items.find(item => item.label === value)?.item;
					assert.ok(item);
					await delegate.onSelect(item);
				};
			}
			override hide(): void { this.isVisible = false; this.onHide?.(); }
		}();
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IActionWidgetService, actionWidget);
		instantiation.stub(ISessionsProvidersService, { onDidChangeProviders: Event.None, getProviders: () => [provider] });
		instantiation.stub(ISessionsProvidersService, 'getProvider', () => provider);
		instantiation.stub(ITelemetryService, NullTelemetryService);
		instantiation.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover() { return Disposable.None; }
		}());
		instantiation.stub(IOpenerService, new class extends mock<IOpenerService>() { });
		instantiation.stub(IDialogService, new class extends TestDialogService {
			override async info(message: string, detail?: string) { dialogs.push({ message, detail }); }
		}());
		const picker = store.add(instantiation.createInstance(AgentHostCodexApprovalsPicker, session));
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		picker.render(container);
		assert.ok(picker.showPicker(container));
		return { actionWidget, dialogs, config, activeChat };
	}

	for (const status of [SessionStatus.InProgress, SessionStatus.NeedsInput]) {
		for (const [initial, selected] of [['default', 'full-access'], ['full-access', 'default']] as const) {
			test(`explains ${initial} to ${selected} while the chat is ${status}`, async () => {
				const harness = setup(initial, status);
				await harness.actionWidget.select(selected);
				await timeout(0);
				assert.deepStrictEqual({ selected: harness.config.values[CodexSessionConfigKey.PermissionsPreset], dialogs: harness.dialogs }, {
					selected,
					dialogs: [{ message: 'Full Access Changes on the Next Turn', detail: 'Changes to file and network access take effect with your next message after the current turn finishes. Codex keeps its current access until then.' }],
				});
			});
		}
	}

	for (const [initial, selected, status] of [
		['default', 'auto-review', SessionStatus.InProgress],
		['auto-review', 'default', SessionStatus.NeedsInput],
		['default', 'full-access', SessionStatus.Completed],
		['full-access', 'full-access', SessionStatus.InProgress],
	] as const) {
		test(`does not show a deferred-change notice for ${initial} to ${selected} with status ${status}`, async () => {
			const harness = setup(initial, status);
			await harness.actionWidget.select(selected);
			await timeout(0);
			assert.deepStrictEqual(harness.dialogs, []);
		});
	}

	test('does not show a late notice over a different chat', async () => {
		const write = new DeferredPromise<void>();
		const harness = setup('default', SessionStatus.InProgress, write.p);
		await harness.actionWidget.select('full-access');
		harness.activeChat.set(new class extends mock<IChat>() {
			override readonly resource = URI.parse('test-chat:/another-chat');
			override readonly status = constObservable(SessionStatus.InProgress);
		}(), undefined);
		await write.complete();
		await timeout(0);
		assert.deepStrictEqual(harness.dialogs, []);
	});
});
