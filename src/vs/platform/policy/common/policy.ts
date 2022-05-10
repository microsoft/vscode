/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from 'vs/base/common/async';
import { IStringDictionary } from 'vs/base/common/collections';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';

export type PolicyValue = string | boolean | number;
export type Policies = IStringDictionary<PolicyValue>;

export class PolicyModel extends Disposable {
	readonly _serviceBrand: undefined;

	private readonly _onDidChange = new Emitter<readonly string[]>();
	readonly onDidChange = this._onDidChange.event;

	private policies: Policies = {};

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async initialize(): Promise<void> {
		const policy = this.environmentService.policyFile ? new FilePolicy(this.environmentService.policyFile, this.fileService, this.logService) : new NullPolicy();
		this.policies = await policy.read();
		this._register(policy.onDidChange(({ changed, policies }) => {
			this.policies = policies;
			this._onDidChange.fire(changed);
		}));
	}

	getPolicy(name: string): PolicyValue | undefined {
		return this.policies[name];
	}
}

export interface IPolicy {
	readonly onDidChange: Event<{ changed: string[]; policies: Policies }>;
	read(): Promise<Policies>;
}

class FilePolicy extends Disposable implements IPolicy {

	private policies: Policies = {};

	private readonly _onDidChange = new Emitter<{ changed: string[]; policies: Policies }>();
	readonly onDidChange = this._onDidChange.event;

	private readonly throttledDelayer = this._register(new ThrottledDelayer(500));

	constructor(
		private readonly file: URI,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._register(fileService.watch(file));
		this._register(Event.filter(fileService.onDidFilesChange, e => e.affects(file))(e => this.throttledDelayer.trigger(() => this.onDidFileChange())));
	}

	async read(): Promise<Policies> {
		try {
			const content = await this.fileService.readFile(this.file);
			this.policies = JSON.parse(content.value.toString());
		} catch (error) {
			this.logService.error(error);
			this.policies = {};
		}
		return this.policies;
	}

	private async onDidFileChange(): Promise<void> {
		const old = this.policies;
		await this.read();
		const changed = this.compare(old, this.policies);
		if (changed.length > 0) {
			this._onDidChange.fire({ changed, policies: this.policies });
		}
	}

	private compare(old: Policies, current: Policies): string[] {
		const changed: string[] = [];
		for (const key of Object.keys(old)) {
			if (old[key] !== current[key]) {
				changed.push(key);
			}
		}
		for (const key of Object.keys(current)) {
			if (old[key] === undefined) {
				changed.push(key);
			}
		}
		return changed;
	}

}

class NullPolicy extends Disposable implements IPolicy {
	readonly onDidChange = Event.None;
	async read(): Promise<Policies> { return {}; }
}
