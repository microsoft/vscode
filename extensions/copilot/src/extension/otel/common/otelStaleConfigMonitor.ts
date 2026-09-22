/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../platform/log/common/logService';
import { parseOtlpEndpoint } from '../../../platform/otel/common/otelConfig';
import { classifyOTelConfigDrift, describeOTelConfigDrift, IOTelConfigResolver, IResolvedOTelConfig, OTelConfigDrift } from '../../../platform/otel/common/otelConfigResolution';
import { StringSHA1 } from '../../../util/vs/base/common/hash';

export interface IOTelPolicyRestartRecord {
	readonly sessionId: string;
	readonly fingerprint: string;
	readonly acknowledged: boolean;
}

export interface IOTelStaleConfigHost {
	getRestartRecord(): IOTelPolicyRestartRecord | undefined;
	setRestartRecord(record: IOTelPolicyRestartRecord | undefined): Promise<void>;
	restartExtensionHost(): Promise<void>;
	warnPolicyNotApplied(): void;
	promptReload(current: IResolvedOTelConfig): void;
	notifyPolicyRestarted(): void;
}

/** Compares against service construction, not the later contribution's initial settings. */
export class OTelStaleConfigMonitor {
	private _handledFingerprint: string | undefined;
	private _pendingCheck: Promise<OTelConfigDrift> = Promise.resolve(OTelConfigDrift.None);
	private _policyNoticeShown = false;

	constructor(
		private readonly _resolver: IOTelConfigResolver,
		private readonly _host: IOTelStaleConfigHost,
		private readonly _logService: ILogService,
	) { }

	check(): Promise<OTelConfigDrift> {
		const check = this._pendingCheck.then(() => this._check());
		// Return failures to the caller, but leave the queue usable for the next event.
		this._pendingCheck = check.catch(() => OTelConfigDrift.None);
		return check;
	}

	private async _check(): Promise<OTelConfigDrift> {
		const active = this._resolver.activeResolution;
		const current = this._resolver.resolve();
		const drift = classifyOTelConfigDrift(active, current);
		if (drift === OTelConfigDrift.None) {
			this._handledFingerprint = undefined;
			this._policyNoticeShown = false;
			const record = this._host.getRestartRecord();
			if (record?.sessionId === active.config.sessionId && record.fingerprint === fingerprintOf(active) && !record.acknowledged) {
				try {
					// Retain the session budget after success; future policy updates must not
					// cause another automatic restart in this editor session.
					await this._host.setRestartRecord({ ...record, acknowledged: true });
					this._host.notifyPolicyRestarted();
				} catch (error) {
					this._logService.warn(`[OTel] Failed to acknowledge the telemetry policy restart: ${error}`);
				}
			}
			return drift;
		}

		const fingerprint = fingerprintOf(current);
		if (this._handledFingerprint === fingerprint) {
			return drift;
		}
		if (drift === OTelConfigDrift.User || drift === OTelConfigDrift.Withdrawal) {
			this._handledFingerprint = fingerprint;
			this._host.promptReload(current);
			return drift;
		}
		if (active.hasEnterpriseSettings || active.config.enabledExplicitly || !isPolicyEnabledOtlp(current)) {
			this._handledFingerprint = fingerprint;
			if (!this._policyNoticeShown) {
				this._policyNoticeShown = true;
				this._host.promptReload(current);
			}
			return drift;
		}

		const changed = describeOTelConfigDrift(active.config, current.config).join(', ');
		const record = this._host.getRestartRecord();
		if (record?.sessionId === active.config.sessionId) {
			this._handledFingerprint = fingerprint;
			this._logService.warn(`[OTel] Automatic telemetry recovery was already attempted in this editor session (${changed}). Not restarting again.`);
			this._warnPolicyNotApplied();
			return drift;
		}

		try {
			await this._host.setRestartRecord({ sessionId: active.config.sessionId, fingerprint, acknowledged: false });
		} catch (error) {
			this._logService.warn(`[OTel] Cannot store the telemetry policy restart guard: ${error}`);
			this._warnPolicyNotApplied();
			return drift;
		}

		this._handledFingerprint = fingerprint;
		this._logService.warn(`[OTel] Enterprise telemetry policy changed after OTel was initialized (${changed}). Restarting the extension host to apply it.`);
		try {
			await this._host.restartExtensionHost();
			// A slow restart could still succeed, so keep its guard.
			this._logService.warn('[OTel] The extension host was not restarted. Enterprise telemetry policy is not applied until the window is reloaded.');
		} catch (error) {
			this._logService.warn(`[OTel] Failed to restart the extension host: ${error}`);
		}
		this._warnPolicyNotApplied();
		return drift;
	}

	private _warnPolicyNotApplied(): void {
		if (!this._policyNoticeShown) {
			this._policyNoticeShown = true;
			this._host.warnPolicyNotApplied();
		}
	}
}

function isPolicyEnabledOtlp(resolution: IResolvedOTelConfig): boolean {
	const { config, defaultValues } = resolution;
	if (defaultValues.enabled !== true || !config.enabled || !config.enabledExplicitly
		|| (config.exporterType !== 'otlp-http' && config.exporterType !== 'otlp-grpc')
		|| typeof defaultValues.otlpEndpoint !== 'string') {
		return false;
	}
	const endpoint = parseOtlpEndpoint(defaultValues.otlpEndpoint, config.exporterType === 'otlp-grpc' ? 'grpc' : 'http');
	return endpoint !== undefined && /^https?:\/\//.test(endpoint) && config.otlpEndpoint === endpoint;
}

function fingerprintOf(resolution: IResolvedOTelConfig): string {
	const sha = new StringSHA1();
	sha.update(JSON.stringify([resolution.config, resolution.defaultValues], (_key, value) =>
		value && typeof value === 'object' && !Array.isArray(value)
			? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
			: value));
	return sha.digest();
}
