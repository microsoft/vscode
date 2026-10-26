/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ElicitationSchema } from '@github/copilot-sdk';
import { Emitter } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { mock } from '../../../../base/test/common/mock.js';
import { COMPUTER_USE_REQUEST_KEY, COMPUTER_USE_STATUS_KEY, type ComputerUseAction, type ComputerUsePermission, type IComputerUseStatusV1 } from '../../common/computerUse.js';
import { readComputerUseStatus } from '../../common/meta/computerUse.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';

/** The root configuration the Computer Use setup reads and writes, with the status as clients read it off the wire. */
export class TestComputerUseConfiguration extends mock<IAgentConfigurationService>() implements IDisposable {
	private readonly _onDidRootConfigChange = new Emitter<void>();
	override readonly onDidRootConfigChange = this._onDidRootConfigChange.event;
	readonly values: Record<string, unknown> = {};
	/** Every published status, read back through the client's validating reader; `undefined` when withdrawn. */
	readonly published: (IComputerUseStatusV1 | undefined)[] = [];

	get status(): IComputerUseStatusV1 | undefined {
		return this.published.at(-1);
	}

	override getRootConfigValues(): Readonly<Record<string, unknown>> {
		return this.values;
	}

	override updateRootConfig(patch: Record<string, unknown>): void {
		Object.assign(this.values, patch);
		this._onDidRootConfigChange.fire();
	}

	override publishRootTransientValues(patch: Readonly<Record<string, unknown>>): void {
		if (Object.hasOwn(patch, COMPUTER_USE_STATUS_KEY)) {
			const value = patch[COMPUTER_USE_STATUS_KEY];
			this.published.push(value === undefined ? undefined : readComputerUseStatus(JSON.parse(JSON.stringify(value))));
		}
	}

	/** Writes a request the way a client does, with a fresh nonce unless one is given. */
	send(request: { readonly setupId: string; readonly round: number; readonly action: ComputerUseAction; readonly permission?: ComputerUsePermission; readonly nonce?: string }): string {
		const nonce = request.nonce ?? generateUuid();
		this.updateRootConfig({ [COMPUTER_USE_REQUEST_KEY]: { ...request, nonce } });
		return nonce;
	}

	dispose(): void {
		this._onDidRootConfigChange.dispose();
	}
}

const slugs: { readonly [P in ComputerUsePermission]: string } = { accessibility: 'accessibility', screenRecording: 'screen_recording' };
const labels: { readonly [P in ComputerUsePermission]: string } = { accessibility: 'Accessibility', screenRecording: 'Screen Recording' };

/**
 * The schema of the Computer Use plugin's macOS permission prompt (`macos_permission_choices` and
 * `enum_choice_schema` in github/computer-use `src/mcp/src/server.rs`).
 */
export function computerUsePermissionSchema(missing: readonly ComputerUsePermission[], settings: readonly ComputerUsePermission[] = []): ElicitationSchema {
	const choices: [string, string][] = [
		...missing.map((permission): [string, string] => [`request_${slugs[permission]}`, `Request ${labels[permission]} Access`]),
		...missing.filter(permission => settings.includes(permission)).map((permission): [string, string] => [`settings_${slugs[permission]}`, `Open ${labels[permission]} in System Settings`]),
		['try_again', 'Try again'],
	];
	return {
		type: 'object',
		properties: {
			choice: { type: 'string', enum: choices.map(([value]) => value), enumNames: choices.map(([, name]) => name), default: choices[0][0] },
		},
		required: ['choice'],
	};
}
