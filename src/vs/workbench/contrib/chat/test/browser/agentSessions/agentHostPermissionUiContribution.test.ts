/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	AgentHostPermissionMode,
	IAgentHostPermissionService,
	IPendingResourceRequest,
} from '../../../../../../platform/agentHost/common/agentHostPermissionService.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Event } from '../../../../../../base/common/event.js';
import { MockLabelService } from '../../../../../services/label/test/common/mockLabelService.js';
import { AgentHostPermissionUiContribution } from '../../../browser/agentSessions/agentHost/agentHostPermissionUiContribution.js';
import {
	IChatInputNotification,
	IChatInputNotificationService,
} from '../../../browser/widget/input/chatInputNotificationService.js';

class FakePermissionService extends Disposable implements IAgentHostPermissionService {
	declare readonly _serviceBrand: undefined;
	readonly pending: ISettableObservable<readonly IPendingResourceRequest[]> = observableValue('pending', []);
	readonly allPending: IObservable<readonly IPendingResourceRequest[]> = this.pending;

	check = async () => true;
	request = async () => { /* */ };
	pendingFor = () => this.pending;
	findPending = (id: string) => this.pending.get().find(r => r.id === id);
	grantImplicitRead = () => Disposable.None;
	connectionClosed = () => { /* */ };
}

class FakeNotificationService implements IChatInputNotificationService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void> = Event.None;
	readonly setCalls: IChatInputNotification[] = [];
	readonly deleteCalls: string[] = [];

	setNotification(notification: IChatInputNotification): void {
		this.setCalls.push(notification);
	}
	deleteNotification(id: string): void {
		this.deleteCalls.push(id);
	}
	dismissNotification(): void { /* */ }
	getActiveNotification(): IChatInputNotification | undefined { return undefined; }
	handleMessageSent(): void { /* */ }
}

/**
 * Mock label service that resolves host labels for the {@link AGENT_HOST_SCHEME}
 * by mapping authorities encoded via {@link agentHostAuthority} to the
 * friendly name registered through {@link StubLabelService.setHostName}.
 * Unknown authorities are returned unchanged.
 */
class StubLabelService extends MockLabelService {
	private readonly _hostLabels = new Map<string, string>();

	setHostName(address: string, name: string): void {
		this._hostLabels.set(agentHostAuthority(address), name);
	}

	override getHostLabel(scheme: string, authority?: string): string {
		if (scheme === AGENT_HOST_SCHEME && authority && this._hostLabels.has(authority)) {
			return this._hostLabels.get(authority)!;
		}
		return authority ?? '';
	}
}

function makePending(opts: {
	address: string;
	mode: AgentHostPermissionMode;
	uri: URI;
}): IPendingResourceRequest {
	return {
		id: `req-${opts.address}-${opts.uri.toString()}`,
		address: opts.address,
		mode: opts.mode,
		uri: opts.uri,
		allow: () => { /* */ },
		allowAlways: () => { /* */ },
		deny: () => { /* */ },
	};
}

suite('AgentHostPermissionUiContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let permissionService: FakePermissionService;
	let notificationService: FakeNotificationService;
	let labelService: StubLabelService;

	setup(() => {
		permissionService = disposables.add(new FakePermissionService());
		notificationService = new FakeNotificationService();
		labelService = new StubLabelService();
		labelService.setHostName('host:1234', 'My Host');
	});

	function createContribution(): AgentHostPermissionUiContribution {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAgentHostPermissionService, permissionService);
		instantiationService.stub(IChatInputNotificationService, notificationService);
		instantiationService.stub(ILabelService, labelService);
		const contribution = instantiationService.createInstance(AgentHostPermissionUiContribution);
		disposables.add(contribution as unknown as IDisposable);
		return contribution;
	}

	test('renders a markdown notification with three actions when a request arrives', () => {
		createContribution();
		const request = makePending({
			address: 'host:1234',
			mode: AgentHostPermissionMode.Read,
			uri: URI.file('/Users/me/.gitconfig'),
		});

		permissionService.pending.set([request], undefined);

		assert.strictEqual(notificationService.setCalls.length, 1);
		const notification = notificationService.setCalls[0];
		assert.ok(isMarkdownString(notification.message), 'message should be an IMarkdownString');
		assert.strictEqual(
			notification.actions.map(a => a.commandId).join(','),
			'_agentHost.permission.deny,_agentHost.permission.allow,_agentHost.permission.allowAlways',
		);
		for (const action of notification.actions) {
			assert.deepStrictEqual(action.commandArgs, [request.id], 'each action carries the request id');
		}
	});

	test('clears the notification when the queue empties', () => {
		createContribution();
		const request = makePending({
			address: 'host:1234',
			mode: AgentHostPermissionMode.Read,
			uri: URI.file('/etc/foo'),
		});
		permissionService.pending.set([request], undefined);

		permissionService.pending.set([], undefined);

		assert.deepStrictEqual(
			notificationService.deleteCalls,
			['agentHost.permissionRequest'],
		);
	});

	test('write-mode requests use a "wants to write" message', () => {
		createContribution();
		permissionService.pending.set([
			makePending({
				address: 'host:1234',
				mode: AgentHostPermissionMode.Write,
				uri: URI.file('/etc/foo'),
			}),
		], undefined);

		const text = notificationService.setCalls[0].message;
		const value = isMarkdownString(text) ? text.value : text;
		assert.match(value, /wants to write/);
		assert.match(value, /My Host/);
	});

	test('read-mode requests use a "wants to read" message', () => {
		createContribution();
		permissionService.pending.set([
			makePending({
				address: 'host:1234',
				mode: AgentHostPermissionMode.Read,
				uri: URI.file('/etc/foo'),
			}),
		], undefined);

		const text = notificationService.setCalls[0].message;
		const value = isMarkdownString(text) ? text.value : text;
		assert.match(value, /wants to read/);
	});

	test('paths are wrapped in a markdown code span using a fence longer than any embedded backticks', () => {
		createContribution();
		// Path containing a single backtick — the fence must be at least
		// two backticks so the embedded one doesn't close the span.
		const uri = URI.file('/weird/`name`.txt');
		permissionService.pending.set([
			makePending({ address: 'host:1234', mode: AgentHostPermissionMode.Read, uri }),
		], undefined);

		const text = notificationService.setCalls[0].message;
		const value = isMarkdownString(text) ? text.value : text;
		// Find the opening fence; it must be ≥2 backticks and the path must follow it.
		const match = value.match(/(`{2,})([^`]|`(?!\1))*\1/);
		assert.ok(match, `expected a code span fence, got: ${value}`);
		assert.ok(match![0].includes('`name`'), 'path with embedded backticks should be inside the fence');
	});

	test('falls back to the raw address when no host entry is known', () => {
		createContribution();
		permissionService.pending.set([
			makePending({
				address: 'unknown:9999',
				mode: AgentHostPermissionMode.Read,
				uri: URI.file('/etc/foo'),
			}),
		], undefined);

		const text = notificationService.setCalls[0].message;
		const value = isMarkdownString(text) ? text.value : text;
		assert.match(value, /unknown:9999/);
	});
});
