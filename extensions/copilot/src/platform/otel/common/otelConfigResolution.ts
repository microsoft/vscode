/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { deepClone, equals } from '../../../util/vs/base/common/objects';
import { DEFAULT_OTLP_ENDPOINT, OTelConfig, OTelExporterType, resolveOTelConfig } from './otelConfig';

/** Kept in sync with the extension manifest by otelConfigResolution.spec.ts. */
export const OTEL_SETTING_DEFAULTS = {
	enabled: false,
	exporterType: 'otlp-http',
	protocol: '',
	otlpEndpoint: DEFAULT_OTLP_ENDPOINT,
	captureContent: false,
	// Unlike false, null preserves the distinction between omission and a managed denial.
	captureIdentity: null,
	serviceName: '',
	resourceAttributes: {},
	headers: {},
	maxAttributeSizeChars: 0,
	outfile: '',
	'dbSpanExporter.enabled': false,
};

type OTelSettingKey = keyof typeof OTEL_SETTING_DEFAULTS;
type OTelDefaultValues = Record<OTelSettingKey, unknown>;
const settingKeys = Object.keys(OTEL_SETTING_DEFAULTS) as OTelSettingKey[];
const policySettingKeys = [
	'enabled', 'exporterType', 'protocol', 'otlpEndpoint', 'captureContent', 'captureIdentity',
	'serviceName', 'resourceAttributes', 'headers', 'outfile',
] as const;

export interface IOTelSettingsReader {
	get<T>(key: string): T | undefined;
	inspect<T>(key: string): { defaultValue?: T } | undefined;
}

export interface IResolvedOTelConfig {
	readonly config: OTelConfig;
	readonly defaultValues: OTelDefaultValues;
	/** Recognizable policy-backed defaults, independent of whether export is enabled. */
	readonly hasEnterpriseSettings: boolean;
}

export const IOTelConfigResolver = createServiceIdentifier<IOTelConfigResolver>('IOTelConfigResolver');

export interface IOTelConfigResolver {
	readonly _serviceBrand: undefined;
	readonly activeResolution: IResolvedOTelConfig;
	resolve(): IResolvedOTelConfig;
}

/** Excludes later process.env mutations used to configure the embedded runtime. */
export function snapshotOTelEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
	const keys = [
		'COPILOT_OTEL_ENABLED', 'COPILOT_OTEL_ENDPOINT', 'COPILOT_OTEL_PROTOCOL',
		'COPILOT_OTEL_FILE_EXPORTER_PATH', 'COPILOT_OTEL_CAPTURE_CONTENT',
		'COPILOT_OTEL_CAPTURE_IDENTITY',
		'COPILOT_OTEL_MAX_ATTRIBUTE_SIZE_CHARS', 'COPILOT_OTEL_LOG_LEVEL',
		'COPILOT_OTEL_HTTP_INSTRUMENTATION', 'OTEL_EXPORTER_OTLP_ENDPOINT',
		'OTEL_EXPORTER_OTLP_PROTOCOL', 'OTEL_EXPORTER_OTLP_HEADERS',
		'OTEL_SERVICE_NAME', 'OTEL_RESOURCE_ATTRIBUTES',
	];
	return Object.fromEntries(keys.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
}

export function resolveOTelConfigFromSettings(
	settings: IOTelSettingsReader,
	env: Record<string, string | undefined>,
	extensionVersion: string,
	sessionId: string,
): IResolvedOTelConfig {
	const defaultValues: OTelDefaultValues = { ...OTEL_SETTING_DEFAULTS };
	for (const key of settingKeys) {
		defaultValues[key] = deepClone(settings.inspect(key)?.defaultValue);
	}
	// For these application-scoped settings, inspect().defaultValue contains policy
	// when present, otherwise the schema default. Once policy is recognizable, use
	// that entire OTel block instead of filling missing fields from personal settings.
	const hasEnterpriseSettings = policySettingKeys.some(key =>
		defaultValues[key] !== undefined && !equals(defaultValues[key], OTEL_SETTING_DEFAULTS[key]));
	const read = <T>(key: OTelSettingKey): T | undefined => hasEnterpriseSettings
		? (defaultValues[key] ?? OTEL_SETTING_DEFAULTS[key]) as T
		: settings.get<T>(key);

	const config = resolveOTelConfig({
		env,
		settingEnabled: read<boolean>('enabled'),
		settingExporterType: read<OTelExporterType>('exporterType'),
		settingOtlpEndpoint: read<string>('otlpEndpoint'),
		settingCaptureContent: read<boolean>('captureContent'),
		// Omission is not a denial, even when another enterprise OTel field is present.
		settingCaptureIdentity: settings.get<boolean | null>('captureIdentity') ?? undefined,
		policyCaptureIdentity: typeof defaultValues.captureIdentity === 'boolean' ? defaultValues.captureIdentity : undefined,
		settingMaxAttributeSizeChars: read<number>('maxAttributeSizeChars'),
		settingOutfile: read<string>('outfile') || undefined,
		settingDbSpanExporter: read<boolean>('dbSpanExporter.enabled'),
		settingProtocol: read<string>('protocol') || undefined,
		settingServiceName: read<string>('serviceName') || undefined,
		settingResourceAttributes: read<Record<string, string>>('resourceAttributes'),
		policyResourceAttributes: hasEnterpriseSettings ? read<Record<string, string>>('resourceAttributes') : undefined,
		settingHeaders: read<Record<string, string>>('headers'),
		extensionVersion,
		sessionId,
	});
	return { config, defaultValues, hasEnterpriseSettings };
}

export const enum OTelConfigDrift {
	None = 'none',
	User = 'user',
	Policy = 'policy',
	Withdrawal = 'withdrawal',
}

export function classifyOTelConfigDrift(active: IResolvedOTelConfig, current: IResolvedOTelConfig): OTelConfigDrift {
	if (equals(active.config, current.config)) {
		return OTelConfigDrift.None;
	}
	// Applied policy is folded into defaultValue. These policy-backed settings are
	// application-scoped, so extensions cannot contribute default overrides for them.
	const changedDefaults = policySettingKeys.filter(key => !equals(active.defaultValues[key], current.defaultValues[key]));
	if (changedDefaults.length === 0) {
		return OTelConfigDrift.User;
	}
	// Only returning to schema defaults is recognizable as withdrawal without policy provenance.
	return changedDefaults.every(key => current.defaultValues[key] === undefined || equals(current.defaultValues[key], OTEL_SETTING_DEFAULTS[key]))
		? OTelConfigDrift.Withdrawal
		: OTelConfigDrift.Policy;
}

/** Field names only: values may contain credentials. */
export function describeOTelConfigDrift(active: OTelConfig, current: OTelConfig): string[] {
	const keys = Object.keys(active) as (keyof OTelConfig)[];
	return keys.filter(key => !equals(active[key], current[key])).sort();
}
