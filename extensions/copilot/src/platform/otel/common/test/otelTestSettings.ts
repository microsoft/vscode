/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOTelSettingsReader, OTEL_SETTING_DEFAULTS } from '../otelConfigResolution';

/** Mirrors the stable extension API: policy is folded into get() and inspect().defaultValue. */
export class TestOTelSettings implements IOTelSettingsReader {
	user: Record<string, unknown> = {};
	policy: Record<string, unknown> = {};
	private readonly _defaults: Record<string, unknown> = OTEL_SETTING_DEFAULTS;

	get<T>(key: string): T | undefined {
		return (this.policy[key] ?? this.user[key] ?? this._defaults[key]) as T | undefined;
	}

	inspect<T>(key: string): { defaultValue?: T } {
		return { defaultValue: (this.policy[key] ?? this._defaults[key]) as T | undefined };
	}
}
