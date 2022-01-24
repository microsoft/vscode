/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ICredentialsService = createDecorator<ICredentialsService>('credentialsService');

export interface ICredentialsProvider {
	getPassword(service: string, account: string): Promise<string | null>;
	setPassword(service: string, account: string, password: string): Promise<void>;
	deletePassword(service: string, account: string): Promise<boolean>;
	findPassword(service: string): Promise<string | null>;
	findCredentials(service: string): Promise<Array<{ account: string, password: string }>>;
	clear?(): Promise<void>;
}

export interface ICredentialsChangeEvent {
	service: string
	account: string;
}

export interface ICredentialsService extends ICredentialsProvider {
	readonly _serviceBrand: undefined;
	readonly onDidChangePassword: Event<ICredentialsChangeEvent>;

	/*
	 * Each CredentialsService must provide a prefix that will be used
	 * by the SecretStorage API when storing secrets.
	 * This is a method that returns a Promise so that it can be defined in
	 * the main process and proxied on the renderer side.
	 */
	getSecretStoragePrefix(): Promise<string>;
}

export const ICredentialsMainService = createDecorator<ICredentialsMainService>('credentialsMainService');

export interface ICredentialsMainService extends ICredentialsService { }

interface ISecretVault {
	[service: string]: { [account: string]: string } | undefined;
}

export class InMemoryCredentialsProvider implements ICredentialsProvider {
	private secretVault: ISecretVault = {};

	async getPassword(service: string, account: string): Promise<string | null> {
		return this.secretVault[service]?.[account] ?? null;
	}

	async setPassword(service: string, account: string, password: string): Promise<void> {
		this.secretVault[service] = this.secretVault[service] ?? {};
		this.secretVault[service]![account] = password;
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		if (!this.secretVault[service]?.[account]) {
			return false;
		}
		delete this.secretVault[service]![account];
		if (Object.keys(this.secretVault[service]!).length === 0) {
			delete this.secretVault[service];
		}
		return true;
	}

	async findPassword(service: string): Promise<string | null> {
		return JSON.stringify(this.secretVault[service]) ?? null;
	}

	async findCredentials(service: string): Promise<Array<{ account: string, password: string }>> {
		const credentials: { account: string, password: string }[] = [];
		for (const account of Object.keys(this.secretVault[service] || {})) {
			credentials.push({ account, password: this.secretVault[service]![account] });
		}
		return credentials;
	}

	async clear(): Promise<void> {
		this.secretVault = {};
	}
}
