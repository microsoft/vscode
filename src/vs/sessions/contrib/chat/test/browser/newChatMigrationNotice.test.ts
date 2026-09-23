/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { AICustomizationManagementCommands } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { CustomizationMigrationType, getCustomizationMigrationEnablementSetting, ICustomizationMigrationHint, ICustomizationMigrationService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationService.js';
import { ICustomizationMigrationTelemetryService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationTelemetryService.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { NewChatMigrationNotice } from '../../browser/newChatMigrationNotice.js';

class TestMigrationService extends mock<ICustomizationMigrationService>() {
	readonly requests: { resource: URI; token?: CancellationToken }[] = [];
	result: (resource: URI) => Promise<ICustomizationMigrationHint | undefined> = async () => undefined;

	constructor(override readonly onDidChangeCustomizations: Event<void>) {
		super();
	}

	override computeMigrationHint(resource: URI, token?: CancellationToken): Promise<ICustomizationMigrationHint | undefined> {
		this.requests.push({ resource, token });
		return this.result(resource);
	}
}

class TestMigrationTelemetryService extends mock<ICustomizationMigrationTelemetryService>() {
	readonly events: { action: 'computed' | 'shown' | 'dismissed'; hint: ICustomizationMigrationHint }[] = [];

	override hintComputed(hint: ICustomizationMigrationHint): void {
		this.events.push({ action: 'computed', hint });
	}

	override hintShown(hint: ICustomizationMigrationHint): void {
		this.events.push({ action: 'shown', hint });
	}

	override hintClicked(hint: ICustomizationMigrationHint, action: 'review' | 'dismiss'): void {
		if (action === 'dismiss') {
			this.events.push({ action: 'dismissed', hint });
		}
	}
}

function createSession(name: string, withWorkspace = true, scheme = 'agent-host-copilotcli'): IActiveSession {
	return new class extends mock<IActiveSession>() {
		override readonly resource = URI.from({ scheme, path: `/${name}` });
		override readonly workspace = constObservable(withWorkspace ? new class extends mock<ISessionWorkspace>() {
			override readonly uri = URI.file(`/workspaces/${name}`);
		}() : undefined);
		override readonly isCreated = constObservable(false);
		override readonly loading = constObservable(false);
	}();
}

suite('NewChatMigrationNotice', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(enabledTypes = [CustomizationMigrationType.PromptFiles, CustomizationMigrationType.UserData]) {
		const instantiation = store.add(new TestInstantiationService());
		const storage = store.add(new InMemoryStorageService());
		const changed = store.add(new Emitter<void>());
		const sentiment = observableValue<IChatSentiment>('sentiment', {});
		const session = observableValue<IActiveSession | undefined>('session', createSession('one'));
		const configuration = new TestConfigurationService(Object.fromEntries(enabledTypes.map(type => [getCustomizationMigrationEnablementSetting(type), true])));
		const migrations = new TestMigrationService(changed.event);
		migrations.result = async () => {
			const counts = enabledTypes
				.filter(type => configuration.getValue<boolean>(getCustomizationMigrationEnablementSetting(type)) === true)
				.map(type => ({ type, count: 1 }));
			const count = counts.length;
			return count > 0 ? {
				migrationFlowId: 'flow',
				message: count === 1
					? '1 agent customization needs an update to keep working.'
					: `${count} agent customizations need an update to keep working.`,
				counts,
			} : undefined;
		};
		const migrationTelemetry = new TestMigrationTelemetryService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const errors: unknown[][] = [];
		let focusCount = 0;
		instantiation.stub(ICustomizationMigrationService, migrations);
		instantiation.stub(ICustomizationMigrationTelemetryService, migrationTelemetry);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IStorageService, storage);
		instantiation.stub(IUriIdentityService, { extUri });
		instantiation.stub(IChatEntitlementService, { sentimentObs: sentiment });
		instantiation.stub(ICommandService, { executeCommand: async (id: string, ...args: unknown[]) => { commands.push({ id, args }); } });
		instantiation.stub(ILogService, { error: (...args: unknown[]) => { errors.push(args); } });
		instantiation.stub(IHoverService, new class extends mock<IHoverService>() { }());
		instantiation.stub(IOpenerService, new class extends mock<IOpenerService>() { }());
		const create = () => store.add(instantiation.createInstance(NewChatMigrationNotice, dom.$('div'), session, () => { focusCount++; }));
		return { create, session, sentiment, configuration, migrations, migrationTelemetry, changed, commands, errors, get focusCount() { return focusCount; } };
	}

	function snapshot(notice: NewChatMigrationNotice) {
		return { visible: notice.element.style.display !== 'none', message: notice.element.querySelector('span')?.textContent };
	}

	test('shows a computed migration hint and opens the migration overview with the keyboard', async () => {
		const env = setup([CustomizationMigrationType.PromptFiles, CustomizationMigrationType.UserData, CustomizationMigrationType.McpServers]);
		const hint: ICustomizationMigrationHint = {
			migrationFlowId: 'flow',
			message: '3 workspace and 1 user customizations need an update to keep working.',
			counts: [
				{ type: CustomizationMigrationType.PromptFiles, count: 2 },
				{ type: CustomizationMigrationType.UserData, count: 1 },
				{ type: CustomizationMigrationType.McpServers, count: 1 },
			],
		};
		env.migrations.result = async () => hint;
		const notice = env.create();
		await timeout(0);
		notice.element.querySelector('a')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await timeout(0);
		assert.deepStrictEqual({
			...snapshot(notice),
			requests: env.migrations.requests.map(request => request.resource.toString()),
			telemetry: env.migrationTelemetry.events,
			commands: env.commands,
		}, {
			visible: true,
			message: hint.message,
			requests: [env.session.get()!.resource.toString()],
			telemetry: [{ action: 'computed', hint }, { action: 'shown', hint }],
			commands: [{
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{ migration: true, sessionResource: env.session.get()!.resource, migrationHint: hint }],
			}],
		});
	});

	test('dismissal persists when recreated and is isolated to the selected workspace', async () => {
		const env = setup();
		const notice = env.create();
		await timeout(0);
		notice.element.querySelector<HTMLElement>('.action-label')!.click();
		await timeout(0);
		const dismissed = snapshot(notice).visible;
		notice.dispose();
		const restored = env.create();
		await timeout(0);
		const afterRecreation = snapshot(restored).visible;
		env.session.set(createSession('two'), undefined);
		await timeout(0);
		const otherWorkspace = snapshot(restored).visible;
		env.session.set(createSession('one'), undefined);
		await timeout(0);
		assert.deepStrictEqual({
			dismissed,
			afterRecreation,
			otherWorkspace,
			back: snapshot(restored).visible,
			focusCount: env.focusCount,
			telemetryActions: env.migrationTelemetry.events.map(event => event.action),
		}, {
			dismissed: false,
			afterRecreation: false,
			otherWorkspace: true,
			back: false,
			focusCount: 1,
			telemetryActions: ['computed', 'shown', 'dismissed', 'computed', 'shown'],
		});
	});

	test('shows remaining profile migrations without a workspace', async () => {
		const env = setup([CustomizationMigrationType.UserData]);
		env.session.set(createSession('quick', false), undefined);
		const notice = env.create();
		await timeout(0);
		assert.deepStrictEqual(snapshot(notice), { visible: true, message: '1 agent customization needs an update to keep working.' });
	});

	test('cancels stale results when switching workspace and disposing', async () => {
		const env = setup([CustomizationMigrationType.PromptFiles]);
		const pending = new DeferredPromise<ICustomizationMigrationHint | undefined>();
		env.migrations.result = resource => resource.path === '/one' ? pending.p : Promise.resolve(undefined);
		const notice = env.create();
		env.session.set(createSession('two'), undefined);
		await timeout(0);
		await pending.complete({
			migrationFlowId: 'stale',
			message: '1 agent customization needs an update to keep working.',
			counts: [{ type: CustomizationMigrationType.PromptFiles, count: 1 }],
		});
		await timeout(0);
		const visible = snapshot(notice).visible;
		notice.dispose();
		assert.deepStrictEqual({ visible, cancelled: env.migrations.requests.map(request => request.token?.isCancellationRequested) },
			{ visible: false, cancelled: [true, true] });
	});

	test('does not discover when migrations or AI are disabled, or for unsupported sessions', async () => {
		const env = setup([]);
		const notice = env.create();
		await timeout(0);
		const disabledCalls = env.migrations.requests.length;
		env.sentiment.set({ hidden: true }, undefined);
		await env.configuration.setUserConfiguration(getCustomizationMigrationEnablementSetting(CustomizationMigrationType.PromptFiles), true);
		env.configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration() { return true; }
		}());
		await timeout(0);
		const hiddenCalls = env.migrations.requests.length;
		env.session.set(createSession('local', true, 'vscode-chat'), undefined);
		env.sentiment.set({}, undefined);
		await timeout(0);
		assert.deepStrictEqual({ disabledCalls, hiddenCalls, unsupportedCalls: env.migrations.requests.length, visible: snapshot(notice).visible },
			{ disabledCalls: 0, hiddenCalls: 0, unsupportedCalls: 0, visible: false });
	});

	test('refreshes after customizations change and hides after all candidates migrate', async () => {
		const env = setup([CustomizationMigrationType.PromptFiles]);
		const notice = env.create();
		await timeout(0);
		const before = snapshot(notice).visible;
		env.migrations.result = async () => undefined;
		env.changed.fire();
		await timeout(0);
		assert.deepStrictEqual({ before, after: snapshot(notice).visible }, { before: true, after: false });
	});

	test('recomputes counts when migration categories are disabled', async () => {
		const env = setup();
		const notice = env.create();
		await timeout(0);
		const before = snapshot(notice);
		const setting = getCustomizationMigrationEnablementSetting(CustomizationMigrationType.UserData);
		await env.configuration.setUserConfiguration(setting, false);
		env.configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return section === setting; }
		}());
		await timeout(0);
		assert.deepStrictEqual({ before, after: snapshot(notice) }, {
			before: { visible: true, message: '2 agent customizations need an update to keep working.' },
			after: { visible: true, message: '1 agent customization needs an update to keep working.' },
		});
	});

	test('logs discovery failures rather than showing a successful count', async () => {
		const env = setup([CustomizationMigrationType.PromptFiles]);
		const error = new Error('Discovery failed');
		env.migrations.result = async () => { throw error; };
		const notice = env.create();
		await timeout(0);
		assert.deepStrictEqual({ visible: snapshot(notice).visible, errors: env.errors },
			{ visible: false, errors: [['Failed to check customization migrations for the new chat notice', error]] });
	});
});
