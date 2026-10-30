/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ManagedSettingValue } from '../../../../../base/common/policy.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions, IConfigurationPropertySchema, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ManagedSettingsPresentationService } from '../../common/managedSettingsPresentation.js';

suite('ManagedSettingsPresentationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

	function register(properties: Record<string, IConfigurationPropertySchema>) {
		const node = { id: 'managedPresentationTest', properties };
		registry.registerConfiguration(node);
		return store.add(toDisposable(() => registry.deregisterConfigurations([node])));
	}

	function setup(values: Record<string, ManagedSettingValue | undefined> = {}) {
		const changed = store.add(new Emitter<void>());
		const service = store.add(new ManagedSettingsPresentationService(new class extends mock<IManagedSettingsService>() {
			override readonly onDidChangeManagedSettings = changed.event;
			override getManagedSettingValue(key: string) { return values[key]; }
		}()));
		const events: string[][] = [];
		store.add(service.onDidChange(keys => events.push([...keys].sort())));
		return { service, values, changed, events };
	}

	test('projects only declared restrictions, including false, zero and empty strings', () => {
		register({
			'test.managedBoolean': { type: 'boolean', default: true, managedSettingsPresentation: read => read('boolean') },
			'test.managedNumber': { type: 'number', default: 1, managedSettingsPresentation: read => read('number') },
			'test.managedString': { type: 'string', default: 'default', managedSettingsPresentation: read => read('string') },
			'test.unmanaged': { type: 'boolean', default: true },
		});
		const { service } = setup({ boolean: false, number: 0, string: '', 'test.unmanaged': false });
		assert.deepStrictEqual({
			values: ['test.managedBoolean', 'test.managedNumber', 'test.managedString', 'test.unmanaged', 'test.missing'].map(key => service.getValue(key)),
			default: registry.getConfigurationProperties()['test.managedBoolean'].default,
		}, { values: [false, 0, '', undefined, undefined], default: true });
	});

	test('notifies only affected settings and clears restrictions without changing defaults', () => {
		register({
			'test.managedFirst': { type: 'boolean', default: true, managedSettingsPresentation: read => read('deny') === true ? false : undefined },
			'test.managedSecond': { type: 'boolean', default: true, managedSettingsPresentation: read => read('deny') === true && read('exception') !== true ? false : undefined },
		});
		const { service, values, changed, events } = setup();
		values.unrelated = true;
		changed.fire();
		values.deny = true;
		changed.fire();
		changed.fire();
		values.exception = true;
		changed.fire();
		delete values.deny;
		changed.fire();
		values.deny = false;
		changed.fire();
		assert.deepStrictEqual({
			events,
			values: ['test.managedFirst', 'test.managedSecond'].map(key => service.getValue(key)),
		}, {
			events: [['test.managedFirst', 'test.managedSecond'], ['test.managedSecond'], ['test.managedFirst']],
			values: [undefined, undefined],
		});
	});

	test('observes configuration registration and removal', () => {
		const { service, events } = setup({ enforced: true });
		const registration = register({
			'test.managedDynamic': { type: 'boolean', managedSettingsPresentation: read => read('enforced') },
		});
		const registered = service.getValue('test.managedDynamic');
		registration.dispose();
		assert.deepStrictEqual({ registered, removed: service.getValue('test.managedDynamic'), events }, {
			registered: true,
			removed: undefined,
			events: [['test.managedDynamic'], ['test.managedDynamic']],
		});
	});

	test('compares array values structurally and notifies on changes, empty lists and removal', () => {
		register({
			'test.managedArray': {
				type: 'array', items: { type: 'string' }, default: [],
				managedSettingsPresentation: read => {
					const hosts = read('hosts');
					return typeof hosts === 'string' ? (hosts ? hosts.split(',') : []) : undefined;
				},
			},
		});
		const { service, values, changed, events } = setup();
		values.hosts = 'managed.example';
		changed.fire();
		changed.fire();
		values.unrelated = true;
		changed.fire();
		values.hosts = 'updated.example';
		changed.fire();
		const updated = service.getValue('test.managedArray');
		values.hosts = '';
		changed.fire();
		const empty = service.getValue('test.managedArray');
		delete values.hosts;
		changed.fire();
		assert.deepStrictEqual({ updated, empty, removed: service.getValue('test.managedArray'), events }, {
			updated: ['updated.example'], empty: [], removed: undefined,
			events: Array.from({ length: 4 }, () => ['test.managedArray']),
		});
	});

	test('stops notifications when disposed', () => {
		register({ 'test.managedDisposable': { type: 'boolean', managedSettingsPresentation: read => read('value') } });
		const { service, values, changed, events } = setup();
		service.dispose();
		values.value = true;
		changed.fire();
		assert.deepStrictEqual(events, []);
	});

	test('passes the inspected local value to presentation callbacks without persisting it', () => {
		register({
			'test.managedLocal': {
				type: 'string', default: 'default',
				managedSettingsPresentation: (read, localValue) => read('restrict') === true && typeof localValue === 'string' ? localValue : undefined,
			},
		});
		const { service } = setup({ restrict: true });
		assert.deepStrictEqual({
			first: service.getValue('test.managedLocal', 'first'),
			second: service.getValue('test.managedLocal', 'second'),
			withoutLocal: service.getValue('test.managedLocal'),
			default: registry.getConfigurationProperties()['test.managedLocal'].default,
		}, { first: 'first', second: 'second', withoutLocal: undefined, default: 'default' });
	});
});
