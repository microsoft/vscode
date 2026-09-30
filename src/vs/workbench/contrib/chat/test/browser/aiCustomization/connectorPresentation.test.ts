/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { getConnectorRowPresentation } from '../../../browser/aiCustomization/connectorPresentation.js';
import { CopilotConnectorConnectionStatus, CopilotConnectorConnectionStatusDetail, ICopilotConnector, ICopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { EmbeddedConnectorDetail } from '../../../browser/aiCustomization/embeddedConnectorDetail.js';

function connector(connectionStatus: CopilotConnectorConnectionStatus, connectionStatusDetail?: CopilotConnectorConnectionStatusDetail): ICopilotConnector {
	return {
		name: 'mail',
		displayName: 'Mail',
		description: 'Search mail',
		tags: [],
		keywords: [],
		capabilities: [],
		representativeQueries: [],
		connectionStatus,
		connectionStatusDetail,
		scopes: [],
		mcpServers: [],
	};
}

suite('Connector presentation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('maps connection and recovery states to the designed actions', () => {
		assert.deepStrictEqual([
			getConnectorRowPresentation(connector('unknown')),
			getConnectorRowPresentation(connector('connected')),
			getConnectorRowPresentation(connector('not_connected')),
			getConnectorRowPresentation(connector('pending')),
			getConnectorRowPresentation(connector('error', 'sign_in_required')),
			getConnectorRowPresentation(connector('error', 'review_required')),
			getConnectorRowPresentation(connector('error', 'retryable_error')),
			getConnectorRowPresentation(connector('error', 'unavailable')),
		], [
			{ statusLabel: 'Connection status not checked', statusIcon: 'info', action: 'check', actionLabel: 'Check Connection' },
			{ statusLabel: 'Connected', statusIcon: 'connected', action: 'more' },
			{ statusLabel: 'Not connected', action: 'connect', actionLabel: 'Connect' },
			{ statusLabel: 'Connection pending', statusIcon: 'pending' },
			{ statusLabel: 'Sign in required', statusIcon: 'attention', action: 'sign_in', actionLabel: 'Sign in' },
			{ statusLabel: 'Review required', statusIcon: 'attention', action: 'review', actionLabel: 'Review' },
			{ statusLabel: 'Connection failed', statusIcon: 'error', action: 'retry', actionLabel: 'Try Again' },
			{ statusLabel: 'Currently unavailable', statusIcon: 'info' },
		]);
	});

	test('detail displays recovery states and does not offer an action when unavailable', () => {
		const container = DOM.append(document.body, DOM.$('.connector-detail-test'));
		disposables.add(toDisposable(() => container.remove()));
		const service = new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = Event.None;
		}();
		const detail = disposables.add(new EmbeddedConnectorDetail(
			container, () => { }, service, new class extends mock<INotificationService>() { }(), new class extends mock<IOpenerService>() { }(),
		));
		const states = ['sign_in_required', 'review_required', 'retryable_error', 'unavailable'] as const;
		const presentations = states.map(state => {
			detail.setInput(connector('error', state));
			return {
				status: container.querySelector('.connector-detail-facts .embedded-detail-fact-value')?.textContent,
				action: container.querySelector('.embedded-detail-title-actions .monaco-button')?.textContent,
			};
		});

		assert.deepStrictEqual(presentations, [
			{ status: 'Sign in required', action: 'Sign in' },
			{ status: 'Review required', action: 'Review' },
			{ status: 'Connection failed', action: 'Try Again' },
			{ status: 'Currently unavailable', action: undefined },
		]);
	});

	test('disposing detail cancels an in-flight connector consent action', async () => {
		const container = DOM.append(document.body, DOM.$('.connector-detail-test'));
		disposables.add(toDisposable(() => container.remove()));
		const result = new DeferredPromise<void>();
		let actionToken: CancellationToken | undefined;
		const service = new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = Event.None;
			override async connect(_name: string, token: CancellationToken): Promise<void> {
				actionToken = token;
				await result.p;
			}
		}();
		const detail = disposables.add(new EmbeddedConnectorDetail(
			container, () => { }, service, new class extends mock<INotificationService>() { }(), new class extends mock<IOpenerService>() { }(),
		));
		detail.setInput(connector('not_connected'));
		container.querySelector<HTMLElement>('.embedded-detail-title-actions .monaco-button')?.click();
		detail.dispose();
		result.complete();
		await result.p;

		assert.deepStrictEqual({ started: actionToken !== undefined, cancelled: actionToken?.isCancellationRequested }, { started: true, cancelled: true });
	});

	test('an earlier refresh cannot replace a newly selected connector', async () => {
		const container = DOM.append(document.body, DOM.$('.connector-detail-test'));
		disposables.add(toDisposable(() => container.remove()));
		const result = new DeferredPromise<readonly ICopilotConnector[]>();
		const service = new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = Event.None;
			override async refresh(): Promise<readonly ICopilotConnector[]> {
				return [];
			}
			override getConnectors(): Promise<readonly ICopilotConnector[]> {
				return result.p;
			}
		}();
		const detail = disposables.add(new EmbeddedConnectorDetail(
			container, () => { }, service, new class extends mock<INotificationService>() { }(), new class extends mock<IOpenerService>() { }(),
		));
		detail.setInput(connector('pending'));
		container.querySelector<HTMLElement>('.embedded-detail-title-actions .monaco-button')?.click();
		await timeout(0);
		detail.setInput({ ...connector('not_connected'), name: 'calendar', displayName: 'Calendar' });
		result.complete([{ ...connector('connected'), displayName: 'Updated Mail' }]);
		await result.p;
		await timeout(0);

		assert.strictEqual(container.querySelector('.embedded-detail-name')?.textContent, 'Calendar');
	});

	test('detail closes when the selected connector leaves the current account catalog', () => {
		const container = DOM.append(document.body, DOM.$('.connector-detail-test'));
		disposables.add(toDisposable(() => container.remove()));
		const change = disposables.add(new Emitter<void>());
		let connectors: readonly ICopilotConnector[] = [connector('connected')];
		const service = new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = change.event;
			override get connectors() { return connectors; }
		}();
		let invalidations = 0;
		const detail = disposables.add(new EmbeddedConnectorDetail(
			container, () => invalidations++, service, new class extends mock<INotificationService>() { }(), new class extends mock<IOpenerService>() { }(),
		));
		detail.setInput(connectors[0]);

		connectors = [];
		change.fire();

		assert.deepStrictEqual({
			invalidations,
			name: container.querySelector('.embedded-detail-name')?.textContent,
			action: container.querySelector('.embedded-detail-title-actions .monaco-button')?.textContent,
			empty: container.querySelector('.embedded-detail-empty')?.textContent,
		}, {
			invalidations: 1,
			name: '',
			action: undefined,
			empty: 'No connector selected.',
		});
	});
});
