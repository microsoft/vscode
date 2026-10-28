/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AGENT_HOST_EXISTING_SESSION_HARNESS_PICKER_ENABLED_CONTEXT_KEY, AgentHostExistingSessionHarnessPickerEnabledSettingId } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { NullWorkbenchAssignmentService } from '../../../../../services/assignment/test/common/nullAssignmentService.js';
import { AgentHostExistingSessionHarnessPickerEnablement } from '../../../browser/agentSessions/agentHost/agentHostExistingSessionHarnessPickerEnablement.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
const settingSchema = configurationRegistry.getExcludedConfigurationProperties()[AgentHostExistingSessionHarnessPickerEnabledSettingId];

class TestAssignmentService extends NullWorkbenchAssignmentService {
	private readonly refetchedEmitter = new Emitter<void>();
	override readonly onDidRefetchAssignments = this.refetchedEmitter.event;

	readonly requests: string[] = [];
	treatment: boolean | undefined | Promise<boolean | undefined>;

	constructor(treatment?: boolean | Promise<boolean | undefined>) {
		super();
		this.treatment = treatment;
	}

	override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
		this.requests.push(name);
		return await this.treatment as T | undefined;
	}

	refetch(): void {
		this.refetchedEmitter.fire();
	}

	dispose(): void {
		this.refetchedEmitter.dispose();
	}
}

class TestLogService extends NullLogService {
	readonly warnings: string[] = [];

	override warn(message: string): void {
		this.warnings.push(message);
	}
}

function fireConfigurationChange(configurationService: TestConfigurationService): void {
	configurationService.onDidChangeConfigurationEmitter.fire({
		source: ConfigurationTarget.USER,
		affectedKeys: new Set([AgentHostExistingSessionHarnessPickerEnabledSettingId]),
		change: { keys: [AgentHostExistingSessionHarnessPickerEnabledSettingId], overrides: [] },
		affectsConfiguration: key => key === AgentHostExistingSessionHarnessPickerEnabledSettingId,
	});
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

suite('AgentHostExistingSessionHarnessPickerEnablement', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function setup(treatment?: boolean | Promise<boolean | undefined>, settings: Record<string, unknown> = {}) {
		const configurationService = new TestConfigurationService(settings);
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const contextKeyService = disposables.add(new MockContextKeyService());
		const assignmentService = disposables.add(new TestAssignmentService(treatment));
		const logService = disposables.add(new TestLogService());
		disposables.add(new AgentHostExistingSessionHarnessPickerEnablement(configurationService, contextKeyService, assignmentService, logService));
		return {
			assignmentService,
			configurationService,
			logService,
			get enabled() {
				return contextKeyService.getContextKeyValue(AGENT_HOST_EXISTING_SESSION_HARNESS_PICKER_ENABLED_CONTEXT_KEY.key);
			},
		};
	}

	test('registers a strictly hidden window-scoped setting that defaults to false', () => {
		assert.deepStrictEqual({
			inIncludedProperties: configurationRegistry.getConfigurationProperties()[AgentHostExistingSessionHarnessPickerEnabledSettingId] !== undefined,
			default: settingSchema?.default,
			included: settingSchema?.included,
			scope: settingSchema?.scope,
			experiment: settingSchema?.experiment,
		}, {
			inIncludedProperties: false,
			default: false,
			included: false,
			scope: ConfigurationScope.WINDOW,
			experiment: undefined,
		});
	});

	test('tracks the experiment treatment when the setting is not configured', async () => {
		const fixture = setup();
		await flush();
		const initial = fixture.enabled;

		fixture.assignmentService.treatment = true;
		fixture.assignmentService.refetch();
		await flush();
		const enabled = fixture.enabled;

		fixture.assignmentService.treatment = false;
		fixture.assignmentService.refetch();
		await flush();

		assert.deepStrictEqual({
			initial,
			enabled,
			disabled: fixture.enabled,
			requests: fixture.assignmentService.requests,
		}, {
			initial: false,
			enabled: true,
			disabled: false,
			requests: [
				`config.${AgentHostExistingSessionHarnessPickerEnabledSettingId}`,
				`config.${AgentHostExistingSessionHarnessPickerEnabledSettingId}`,
				`config.${AgentHostExistingSessionHarnessPickerEnabledSettingId}`,
			],
		});
	});

	test('gives an explicit setting precedence over the treatment', async () => {
		const fixture = setup(true, { [AgentHostExistingSessionHarnessPickerEnabledSettingId]: false });
		await flush();
		const explicitFalse = fixture.enabled;

		await fixture.configurationService.setUserConfiguration(AgentHostExistingSessionHarnessPickerEnabledSettingId, true);
		fireConfigurationChange(fixture.configurationService);
		const explicitTrue = fixture.enabled;

		await fixture.configurationService.setUserConfiguration(AgentHostExistingSessionHarnessPickerEnabledSettingId, undefined);
		fireConfigurationChange(fixture.configurationService);
		await flush();

		assert.deepStrictEqual({
			explicitFalse,
			explicitTrue,
			treatmentAfterReset: fixture.enabled,
			requests: fixture.assignmentService.requests,
		}, {
			explicitFalse: false,
			explicitTrue: true,
			treatmentAfterReset: true,
			requests: [`config.${AgentHostExistingSessionHarnessPickerEnabledSettingId}`],
		});
	});

	test('ignores a stale treatment after the setting changes', async () => {
		const treatment = new DeferredPromise<boolean | undefined>();
		const fixture = setup(treatment.p);

		await fixture.configurationService.setUserConfiguration(AgentHostExistingSessionHarnessPickerEnabledSettingId, true);
		fireConfigurationChange(fixture.configurationService);
		treatment.complete(false);
		await flush();

		assert.strictEqual(fixture.enabled, true);
	});

	test('logs a failed treatment and remains disabled', async () => {
		const fixture = setup(Promise.reject(new Error('failed')));
		await flush();

		assert.deepStrictEqual({
			enabled: fixture.enabled,
			warnings: fixture.logService.warnings,
		}, {
			enabled: false,
			warnings: [`[AgentHostExistingSessionHarnessPickerEnablement] Failed to resolve treatment 'config.${AgentHostExistingSessionHarnessPickerEnabledSettingId}'.`],
		});
	});
});
