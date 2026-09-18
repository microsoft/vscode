/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyOTelConfigDrift, describeOTelConfigDrift, OTEL_SETTING_DEFAULTS, OTelConfigDrift, resolveOTelConfigFromSettings, snapshotOTelEnv } from '../otelConfigResolution';
import { TestOTelSettings } from './otelTestSettings';

const manifest = JSON.parse(readFileSync(new URL('../../../../../package.json', import.meta.url), 'utf8'));
const sections = manifest.contributes.configuration;
const properties = Object.assign({}, ...(Array.isArray(sections) ? sections : [sections]).map(section => section.properties));
const prefix = 'github.copilot.chat.otel.';

function resolve(settings: TestOTelSettings, env: Record<string, string | undefined> = {}) {
	return resolveOTelConfigFromSettings(settings, env, '1.0.0', 'session');
}

describe('OTel config resolution', () => {
	it('snapshots every OTel schema default, including settings outside the old six-key watcher', () => {
		const otelProperties = Object.entries(properties).filter(([key]) => key.startsWith(prefix));
		const defaults = Object.fromEntries(otelProperties
			.map(([key, schema]) => [key.slice(prefix.length), (schema as { default: unknown }).default]));
		expect(otelProperties.every(([, schema]) => (schema as { scope?: string }).scope === 'application')).toBe(true);
		expect(OTEL_SETTING_DEFAULTS).toEqual(defaults);
		expect(resolve(new TestOTelSettings()).defaultValues).toEqual(defaults);
		expect(resolve(new TestOTelSettings()).hasEnterpriseSettings).toBe(false);
	});

	it('recognizes an enterprise block independently of export enablement', () => {
		const settings = new TestOTelSettings();
		settings.policy = { enabled: false, serviceName: 'managed-service' };
		const active = resolve(settings);
		expect(active).toMatchObject({ hasEnterpriseSettings: true, config: { enabled: false } });
		settings.policy = {};
		expect(resolve(settings).hasEnterpriseSettings).toBe(false);
		expect(active.hasEnterpriseSettings).toBe(true);
	});

	it('does not claim policy provenance for a block consisting entirely of schema defaults', () => {
		const settings = new TestOTelSettings();
		settings.policy = { enabled: false, otlpEndpoint: OTEL_SETTING_DEFAULTS.otlpEndpoint };
		expect(resolve(settings).hasEnterpriseSettings).toBe(false);
	});

	it('preserves existing effective-setting resolution and env precedence', () => {
		const settings = new TestOTelSettings();
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example', headers: { managed: '1' } };
		expect(resolve(settings, { COPILOT_OTEL_ENABLED: 'false' }).config.enabled).toBe(false);
		expect(resolve(settings, {
			OTEL_EXPORTER_OTLP_ENDPOINT: 'https://env.example',
			OTEL_EXPORTER_OTLP_HEADERS: 'env=2',
		}).config).toMatchObject({
			enabledVia: 'setting',
			otlpEndpoint: 'https://env.example/',
			headers: { managed: '1', env: '2' },
		});
	});

	it('replaces the whole personal OTel settings block with enterprise values and defaults', () => {
		const settings = new TestOTelSettings();
		settings.user = {
			enabled: false,
			exporterType: 'file',
			protocol: 'grpc',
			otlpEndpoint: 'https://personal.example',
			captureContent: true,
			serviceName: 'personal-service',
			resourceAttributes: { personal: 'attribute' },
			headers: { personal: 'header' },
			maxAttributeSizeChars: 10,
			outfile: '/tmp/personal-otel.jsonl',
			'dbSpanExporter.enabled': true,
		};
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
		expect(resolve(settings).config).toMatchObject({
			enabled: true,
			exporterType: 'otlp-http',
			otlpProtocol: 'http/json',
			otlpEndpoint: 'https://managed.example/',
			captureContent: false,
			serviceName: 'copilot-chat',
			resourceAttributes: {},
			headers: {},
			maxAttributeSizeChars: 0,
			fileExporterPath: undefined,
			dbSpanExporter: false,
		});
	});

	it('uses enterprise maps verbatim without personal header or attribute keys', () => {
		const settings = new TestOTelSettings();
		settings.user = { headers: { personal: 'header' }, resourceAttributes: { personal: 'attribute' } };
		settings.policy = {
			enabled: true,
			otlpEndpoint: 'https://managed.example',
			headers: { organization: 'header' },
			resourceAttributes: { organization: 'attribute' },
		};
		expect(resolve(settings).config).toMatchObject({
			headers: { organization: 'header' },
			resourceAttributes: { organization: 'attribute' },
		});
	});

	it('keeps personal OTel settings when no enterprise block is recognized', () => {
		const settings = new TestOTelSettings();
		settings.user = {
			enabled: true,
			otlpEndpoint: 'https://personal.example',
			captureContent: true,
			serviceName: 'personal-service',
			headers: { personal: 'header' },
			resourceAttributes: { personal: 'attribute' },
			maxAttributeSizeChars: 10,
			'dbSpanExporter.enabled': true,
		};
		expect(resolve(settings).config).toMatchObject({
			enabled: true,
			otlpEndpoint: 'https://personal.example/',
			captureContent: true,
			serviceName: 'personal-service',
			headers: { personal: 'header' },
			resourceAttributes: { personal: 'attribute' },
			maxAttributeSizeChars: 10,
			dbSpanExporter: true,
		});
		expect(resolve(settings).hasEnterpriseSettings).toBe(false);
	});

	it('ignores subsequent personal edits while enterprise OTel applies', () => {
		const settings = new TestOTelSettings();
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
		const active = resolve(settings);
		settings.user = {
			exporterType: 'file',
			outfile: '/tmp/personal-otel.jsonl',
			headers: { personal: 'header' },
			resourceAttributes: { personal: 'attribute' },
			'dbSpanExporter.enabled': true,
		};
		expect(resolve(settings).config).toEqual(active.config);
		expect(classifyOTelConfigDrift(active, resolve(settings))).toBe(OTelConfigDrift.None);
	});

	it('returns to personal preferences after the enterprise block is withdrawn', () => {
		const settings = new TestOTelSettings();
		settings.user = { enabled: true, otlpEndpoint: 'https://personal.example', headers: { personal: 'header' } };
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
		const active = resolve(settings);
		settings.policy = {};
		expect(resolve(settings).config).toMatchObject({
			otlpEndpoint: 'https://personal.example/',
			headers: { personal: 'header' },
		});
		expect(classifyOTelConfigDrift(active, resolve(settings))).toBe(OTelConfigDrift.Withdrawal);
	});

	it('detects policy in the activation blind spot', () => {
		const settings = new TestOTelSettings();
		const active = resolve(settings);
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
		expect(active.config.enabled).toBe(false);
		expect(classifyOTelConfigDrift(active, resolve(settings))).toBe(OTelConfigDrift.Policy);
	});

	it.each([
		['enabled', false],
		['exporterType', 'console'],
		['protocol', 'http/protobuf'],
		['otlpEndpoint', 'https://changed.example'],
		['captureContent', true],
		['serviceName', 'changed-service'],
		['resourceAttributes', { team: 'test' }],
		['headers', { authorization: 'secret-must-not-be-logged' }],
		['maxAttributeSizeChars', 50],
		['outfile', '/tmp/test-otel.jsonl'],
		['dbSpanExporter.enabled', true],
	] as const)('detects user and default drift for %s', (key, value) => {
		const settings = new TestOTelSettings();
		settings.user = { enabled: true };
		const active = resolve(settings);
		settings.user[key] = value;
		expect(classifyOTelConfigDrift(active, resolve(settings))).toBe(OTelConfigDrift.User);
		settings.policy[key] = value;
		// False equals the enabled default; non-policy-backed defaults are not policy signals.
		const hasPolicy = properties[`${prefix}${key}`].policyReference !== undefined;
		expect(classifyOTelConfigDrift(active, resolve(settings))).toBe(key === 'enabled' || !hasPolicy ? OTelConfigDrift.User : OTelConfigDrift.Policy);
	});

	it('recognizes complete and partial withdrawal, but not a replacement policy', () => {
		const settings = new TestOTelSettings();
		settings.policy = { enabled: true, serviceName: 'managed' };
		const active = resolve(settings);
		settings.policy = { enabled: true };
		expect(classifyOTelConfigDrift(active, resolve(settings))).toBe(OTelConfigDrift.Withdrawal);
		settings.policy = {};
		expect(classifyOTelConfigDrift(active, resolve(settings))).toBe(OTelConfigDrift.Withdrawal);
		settings.policy = { enabled: true, otlpEndpoint: 'https://new.example' };
		expect(classifyOTelConfigDrift(active, resolve(settings))).toBe(OTelConfigDrift.Policy);
	});

	it('deep-snapshots defaults and describes changed fields without their values', () => {
		const settings = new TestOTelSettings();
		const headers = { authorization: 'old' };
		settings.policy = { enabled: true, headers };
		const active = resolve(settings);
		headers.authorization = 'secret';
		const current = resolve(settings);
		expect(active.defaultValues.headers).toEqual({ authorization: 'old' });
		expect(classifyOTelConfigDrift(active, current)).toBe(OTelConfigDrift.Policy);
		expect(describeOTelConfigDrift(active.config, current.config)).toEqual(['headers']);
	});

	it('does nothing when no effective configuration changed', () => {
		const settings = new TestOTelSettings();
		settings.policy = { enabled: true };
		const active = resolve(settings);
		settings.user.enabled = false;
		expect(classifyOTelConfigDrift(active, resolve(settings))).toBe(OTelConfigDrift.None);
		settings.policy.headers = {};
		expect(classifyOTelConfigDrift(active, resolve(settings))).toBe(OTelConfigDrift.None);
	});

	it('isolates resolution from later process.env rewrites', () => {
		const processEnv: Record<string, string | undefined> = { PATH: 'bin', OTEL_SERVICE_NAME: 'original' };
		const env = snapshotOTelEnv(processEnv);
		const settings = new TestOTelSettings();
		settings.user = { 'dbSpanExporter.enabled': true };
		const active = resolve(settings, env);
		processEnv.COPILOT_OTEL_FILE_EXPORTER_PATH = 'null-device';
		processEnv.OTEL_SERVICE_NAME = 'rewritten';
		expect(env).toEqual({ OTEL_SERVICE_NAME: 'original' });
		expect(classifyOTelConfigDrift(active, resolve(settings, env))).toBe(OTelConfigDrift.None);
		expect(classifyOTelConfigDrift(active, resolve(settings, processEnv))).toBe(OTelConfigDrift.User);
	});
});
