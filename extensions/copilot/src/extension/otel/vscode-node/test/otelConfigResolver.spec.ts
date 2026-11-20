/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import type { ConfigurationChangeEvent } from 'vscode';
import { classifyOTelConfigDrift, OTelConfigDrift, type IResolvedOTelConfig } from '../../../../platform/otel/common/otelConfigResolution';
import { TestOTelSettings } from '../../../../platform/otel/common/test/otelTestSettings';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../util/common/test/testUtils';
import { Emitter } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { OTEL_SETTINGS_SECTION, VSCodeOTelConfigResolver } from '../otelConfigResolver';

class TestConfigurationSource extends Disposable {
	readonly settings = new TestOTelSettings();
	reads = 0;
	private readonly _onDidChangeConfiguration = this._register(new Emitter<Pick<ConfigurationChangeEvent, 'affectsConfiguration'>>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	getConfiguration(section: string): TestOTelSettings {
		expect(section).toBe(OTEL_SETTINGS_SECTION);
		this.reads++;
		return this.settings;
	}

	change(section = OTEL_SETTINGS_SECTION): void {
		this._onDidChangeConfiguration.fire({ affectsConfiguration: candidate => candidate === section });
	}
}

describe('VSCodeOTelConfigResolver', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create(identity = true) {
		const source = store.add(new TestConfigurationSource());
		source.settings.policy = { enabled: true, captureIdentity: identity };
		const resolver = store.add(new VSCodeOTelConfigResolver({}, 'test', 'session', source));
		return { source, resolver };
	}

	it('reuses the current snapshot for repeated reads and ignores unrelated changes', () => {
		const { source, resolver } = create();
		const initial = resolver.resolve();
		const snapshots = new Set<IResolvedOTelConfig>();
		const permissions = new Set<boolean>();
		for (let i = 0; i < 1000; i++) {
			snapshots.add(resolver.resolve());
			permissions.add(resolver.captureIdentityAllowed);
		}
		source.change('editor.fontSize');
		expect({ reads: source.reads, snapshots: [...snapshots], permissions: [...permissions], sameSnapshot: resolver.resolve() === initial })
			.toEqual({ reads: 1, snapshots: [initial], permissions: [true], sameSnapshot: true });

		source.settings.policy.captureContent = true;
		source.change();
		expect({
			reads: source.reads,
			sameSnapshot: resolver.resolve() === initial,
			currentContent: resolver.resolve().config.captureContent,
			startupContent: resolver.activeResolution.config.captureContent,
			drift: classifyOTelConfigDrift(resolver.activeResolution, resolver.resolve()),
		}).toEqual({ reads: 2, sameSnapshot: false, currentContent: true, startupContent: false, drift: OTelConfigDrift.Policy });
	});

	for (const restoredPolicy of [true, undefined]) {
		it(`latches denial synchronously across ${restoredPolicy === undefined ? 'policy withdrawal' : 're-enablement'} without an intervening read`, () => {
			const { source, resolver } = create();
			source.settings.user.captureIdentity = true;
			source.settings.policy.captureIdentity = false;
			source.change();
			source.settings.policy.captureIdentity = restoredPolicy;
			source.change();

			expect({
				allowed: resolver.captureIdentityAllowed,
				current: resolver.resolve().config.captureIdentity,
				startup: resolver.activeResolution.config.captureIdentity,
				reads: source.reads,
			}).toEqual({ allowed: false, current: true, startup: true, reads: 3 });
			const restarted = store.add(new VSCodeOTelConfigResolver({}, 'test', 'session', source));
			expect(restarted.captureIdentityAllowed).toBe(true);
		});
	}

	it('preserves startup recovery detection when policy arrives before the contribution', () => {
		const source = store.add(new TestConfigurationSource());
		const resolver = store.add(new VSCodeOTelConfigResolver({}, 'test', 'session', source));
		source.settings.policy = { enabled: true, captureIdentity: true };
		source.change();
		expect({
			startupEnabled: resolver.activeResolution.config.enabled,
			currentEnabled: resolver.resolve().config.enabled,
			currentIdentity: resolver.resolve().config.captureIdentity,
			allowedWithoutRestart: resolver.captureIdentityAllowed,
			drift: classifyOTelConfigDrift(resolver.activeResolution, resolver.resolve()),
		}).toEqual({
			startupEnabled: false, currentEnabled: true, currentIdentity: true,
			allowedWithoutRestart: false, drift: OTelConfigDrift.Policy,
		});
	});

	it('keeps the startup environment snapshot when settings change', () => {
		const source = store.add(new TestConfigurationSource());
		const env = { COPILOT_OTEL_ENABLED: 'true', COPILOT_OTEL_CAPTURE_IDENTITY: 'true' };
		const resolver = store.add(new VSCodeOTelConfigResolver(env, 'test', 'session', source));
		env.COPILOT_OTEL_CAPTURE_IDENTITY = 'false';
		source.change();
		expect(resolver.captureIdentityAllowed).toBe(true);
		source.settings.policy.captureIdentity = false;
		source.change();
		expect(resolver.captureIdentityAllowed).toBe(false);
	});

	it('unsubscribes from configuration changes on disposal', () => {
		const { source, resolver } = create();
		resolver.dispose();
		source.settings.policy.captureIdentity = false;
		source.change();
		expect(source.reads).toBe(1);
	});
});
