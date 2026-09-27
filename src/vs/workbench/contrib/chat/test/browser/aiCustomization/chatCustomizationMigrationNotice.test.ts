/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ChatCustomizationMigrationNotice, IChatCustomizationMigrationNoticeContext } from '../../../browser/aiCustomization/chatCustomizationMigrationNotice.js';
import { AICustomizationManagementCommands } from '../../../common/aiCustomizationWorkspaceService.js';
import { CustomizationMigrationType, getCustomizationMigrationEnablementSetting, ICustomizationMigrationHint, ICustomizationMigrationService } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { ICustomizationMigrationTelemetryService } from '../../../common/promptSyntax/service/customizationMigrationTelemetryService.js';

class TestMigrationService extends mock<ICustomizationMigrationService>() {
	readonly requests: URI[] = [];
	override readonly onDidChangeCustomizations: Event<void>;
	result: ICustomizationMigrationHint | undefined;

	constructor(changed: Emitter<void>) {
		super();
		this.onDidChangeCustomizations = changed.event;
	}

	override async computeMigrationHint(resource: URI, _token?: CancellationToken): Promise<ICustomizationMigrationHint | undefined> {
		this.requests.push(resource);
		return this.result;
	}
}

class TestMigrationTelemetryService extends mock<ICustomizationMigrationTelemetryService>() {
	readonly events: string[] = [];

	override hintComputed(): void {
		this.events.push('computed');
	}

	override hintShown(): void {
		this.events.push('shown');
	}

	override hintClicked(_hint: ICustomizationMigrationHint, action: 'review' | 'dismiss'): void {
		this.events.push(action);
	}
}

suite('ChatCustomizationMigrationNotice', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(showNotice = true) {
		const instantiation = store.add(new TestInstantiationService());
		const storage = store.add(new InMemoryStorageService());
		const changed = store.add(new Emitter<void>());
		const configuration = new TestConfigurationService({
			[getCustomizationMigrationEnablementSetting(CustomizationMigrationType.PromptFiles)]: true,
		});
		const migrations = new TestMigrationService(changed);
		const hint: ICustomizationMigrationHint = {
			migrationFlowId: 'flow',
			message: '1 workspace customization needs an update to keep working.',
			counts: [{ type: CustomizationMigrationType.PromptFiles, count: 1 }],
		};
		migrations.result = hint;
		const migrationTelemetry = new TestMigrationTelemetryService();
		const sentiment = observableValue<IChatSentiment>(store, {});
		const show = observableValue(store, showNotice);
		const context = observableValue<IChatCustomizationMigrationNoticeContext | undefined>(store, {
			sessionResource: URI.parse('vscode-chat-session://local/chat'),
			workspace: URI.file('/workspace'),
		});
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const availability: boolean[] = [];
		const visibility: boolean[] = [];
		let focusCount = 0;

		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(ICustomizationMigrationService, migrations);
		instantiation.stub(ICustomizationMigrationTelemetryService, migrationTelemetry);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IStorageService, storage);
		instantiation.stub(IUriIdentityService, { extUri });
		instantiation.stub(IChatEntitlementService, { sentimentObs: sentiment });
		instantiation.stub(ICommandService, { executeCommand: async (id: string, ...args: unknown[]) => { commands.push({ id, args }); } });
		instantiation.stub(ILogService, new class extends mock<ILogService>() { }());
		instantiation.stub(IHoverService, new class extends mock<IHoverService>() { }());
		instantiation.stub(IOpenerService, new class extends mock<IOpenerService>() { }());

		const notice = store.add(instantiation.createInstance(
			ChatCustomizationMigrationNotice,
			dom.$('div'),
			context,
			show,
			() => focusCount++,
			available => availability.push(available),
			visible => visibility.push(visible),
		));
		return { notice, context, hint, migrations, migrationTelemetry, commands, availability, visibility, get focusCount() { return focusCount; } };
	}

	test('shows, opens, and dismisses the migration notice', async () => {
		const env = setup();
		await timeout(0);
		env.notice.element.querySelector('a')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await timeout(0);
		env.notice.element.querySelector<HTMLElement>('.action-label')!.click();
		await timeout(0);

		assert.deepStrictEqual({
			visible: env.notice.element.style.display !== 'none',
			message: env.notice.element.querySelector('span')?.textContent,
			requests: env.migrations.requests.map(resource => resource.toString()),
			commands: env.commands,
			telemetry: env.migrationTelemetry.events,
			availability: env.availability,
			visibility: env.visibility,
			focusCount: env.focusCount,
		}, {
			visible: false,
			message: env.hint.message,
			requests: [env.context.get()!.sessionResource.toString()],
			commands: [{
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{ migration: true, sessionResource: env.context.get()!.sessionResource, migrationHint: env.hint }],
			}],
			telemetry: ['computed', 'shown', 'dismiss'],
			availability: [false, true],
			visibility: [true, false],
			focusCount: 1,
		});
	});

	test('reports migration availability outside the new-chat state', async () => {
		const env = setup(false);
		await timeout(0);

		assert.deepStrictEqual({
			visible: env.notice.element.style.display !== 'none',
			available: env.availability.at(-1),
		}, {
			visible: false,
			available: true,
		});
	});
});
