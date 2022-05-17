/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from 'vs/base/common/async';
import { IStringDictionary } from 'vs/base/common/collections';
import { Emitter, Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable } from 'vs/base/common/lifecycle';
import { isObject } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IPolicyService, PolicyDefinition, PolicyName, PolicyValue } from 'vs/platform/policy/common/policy';

function keysDiff<T>(a: Map<string, T>, b: Map<string, T>): string[] {
	const result: string[] = [];

	for (const key of Iterable.concat(a.keys(), b.keys())) {
		if (a.get(key) !== b.get(key)) {
			result.push(key);
		}
	}

	return result;
}

export class FilePolicyService extends Disposable implements IPolicyService {

	readonly _serviceBrand: undefined;

	private policies = new Map<PolicyName, PolicyValue>();

	private readonly _onDidChange = new Emitter<readonly PolicyName[]>();
	readonly onDidChange = this._onDidChange.event;

	private readonly throttledDelayer = this._register(new ThrottledDelayer(500));

	constructor(
		private readonly file: URI,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		const onDidChangePolicyFile = Event.filter(fileService.onDidFilesChange, e => e.affects(file));
		this._register(fileService.watch(file));
		this._register(onDidChangePolicyFile(() => this.throttledDelayer.trigger(() => this.refresh())));
	}

	// TODO@sandeep respect only registered policy definitions
	async registerPolicyDefinitions(policies: IStringDictionary<PolicyDefinition>): Promise<IStringDictionary<PolicyValue>> {
		await this.refresh();
		return Iterable.reduce(this.policies.entries(), (r, [name, value]) => ({ ...r, [name]: value }), {});
	}

	private async read(): Promise<Map<PolicyName, PolicyValue>> {
		const policies = new Map<PolicyName, PolicyValue>();

		try {
			const content = await this.fileService.readFile(this.file);
			const raw = JSON.parse(content.value.toString());

			if (!isObject(raw)) {
				throw new Error('Policy file isn\'t a JSON object');
			}

			for (const key of Object.keys(raw)) {
				policies.set(key, raw[key]);
			}
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(`[FilePolicyService] Failed to read policies`, error);
			}
		}

		return policies;
	}

	private async refresh(): Promise<void> {
		const policies = await this.read();
		const diff = keysDiff(this.policies, policies);
		this.policies = policies;

		if (diff.length > 0) {
			this._onDidChange.fire(diff);
		}
	}

	getPolicyValue(name: PolicyName): PolicyValue | undefined {
		return this.policies.get(name);
	}
}
