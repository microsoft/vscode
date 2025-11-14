/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { API } from '../../tsServer/api';
import { ClientCapability, ITypeScriptServiceClient } from '../../typescriptService';
import { Disposable } from '../../utils/dispose';

export class Condition extends Disposable {
	private _value: boolean;

	constructor(
		private readonly getValue: () => boolean,
		onUpdate: (handler: () => void) => void,
	) {
		super();
		this._value = this.getValue();

		onUpdate(() => {
			const newValue = this.getValue();
			if (newValue !== this._value) {
				this._value = newValue;
				this._onDidChange.fire();
			}
		});
	}

	public get value(): boolean { return this._value; }

	private readonly _onDidChange = this._register(new vscode.EventEmitter<void>());
	public readonly onDidChange = this._onDidChange.event;
}

class ConditionalRegistration {
	private state?: {
		readonly enabled: boolean;
		readonly registration: vscode.Disposable | undefined;
	};

	public constructor(
		private readonly conditions: readonly Condition[],
		private readonly doRegister: () => vscode.Disposable,
		private readonly elseDoRegister?: () => vscode.Disposable
	) {
		for (const condition of conditions) {
			condition.onDidChange(() => this.update());
		}
		this.update();
	}

	public dispose() {
		this.state?.registration?.dispose();
		this.state = undefined;
	}

	private update() {
		const enabled = this.conditions.every(condition => condition.value);
		if (enabled) {
			if (!this.state?.enabled) {
				this.state?.registration?.dispose();
				this.state = { enabled: true, registration: this.doRegister() };
			}
		} else {
			if (this.state?.enabled || !this.state) {
				this.state?.registration?.dispose();
				this.state = { enabled: false, registration: this.elseDoRegister?.() };
			}
		}
	}
}

export function conditionalRegistration(
	conditions: readonly Condition[],
	doRegister: () => vscode.Disposable,
	elseDoRegister?: () => vscode.Disposable
): vscode.Disposable {
	return new ConditionalRegistration(conditions, doRegister, elseDoRegister);
}

export function requireMinVersion(
	client: ITypeScriptServiceClient,
	minVersion: API,
) {
	return new Condition(
		() => client.apiVersion.gte(minVersion),
		client.onTsServerStarted
	);
}

export function requireGlobalConfiguration(
	section: string,
	configValue: string,
) {
	return new Condition(
		() => {
			const config = vscode.workspace.getConfiguration(section, null);
			return !!config.get<boolean>(configValue);
		},
		vscode.workspace.onDidChangeConfiguration
	);
}

export function requireSomeCapability(
	client: ITypeScriptServiceClient,
	...capabilities: readonly ClientCapability[]
) {
	return new Condition(
		() => capabilities.some(requiredCapability => client.capabilities.has(requiredCapability)),
		client.onDidChangeCapabilities
	);
}

export function requireHasVsCodeExtension(
	extensionId: string
) {
	return new Condition(
		() => {
			return !!vscode.extensions.getExtension(extensionId);
		},
		vscode.extensions.onDidChange
	);
}

