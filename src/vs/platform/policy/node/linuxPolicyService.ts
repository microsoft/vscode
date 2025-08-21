/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../base/common/path.js';
import { isObject } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition, PolicyName, PolicyValue } from '../common/policy.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { ThrottledDelayer } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';

function keysDiff<T>(a: Map<string, T>, b: Map<string, T>): string[] {
	const result: string[] = [];

	for (const key of new Set(Iterable.concat(a.keys(), b.keys()))) {
		if (a.get(key) !== b.get(key)) {
			result.push(key);
		}
	}

	return result;
}

/**
 * Linux policy service that follows XDG Base Directory specification.
 * Looks for policies in:
 * 1. System-wide: /etc/vscode/policies.json
 * 2. User-specific: $XDG_CONFIG_HOME/vscode/policies.json (usually ~/.config/vscode/policies.json)
 * 
 * User-specific policies take precedence over system-wide policies.
 */
export class LinuxPolicyService extends AbstractPolicyService implements IPolicyService {

	private readonly throttledDelayer = this._register(new ThrottledDelayer(500));
	private readonly systemPolicyFile: URI;
	private readonly userPolicyFile: URI;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		userConfigHome: string,
		productName: string
	) {
		super();

		// System-wide policy file
		this.systemPolicyFile = URI.file(join('/etc', productName, 'policies.json'));
		
		// User-specific policy file following XDG specification
		this.userPolicyFile = URI.file(join(userConfigHome, productName, 'policies.json'));

		// Watch both policy files for changes
		const onDidChangeSystemPolicy = Event.filter(fileService.onDidFilesChange, e => e.affects(this.systemPolicyFile));
		const onDidChangeUserPolicy = Event.filter(fileService.onDidFilesChange, e => e.affects(this.userPolicyFile));
		
		this._register(fileService.watch(this.systemPolicyFile));
		this._register(fileService.watch(this.userPolicyFile));
		this._register(onDidChangeSystemPolicy(() => this.throttledDelayer.trigger(() => this.refresh())));
		this._register(onDidChangeUserPolicy(() => this.throttledDelayer.trigger(() => this.refresh())));
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		await this.refresh();
	}

	private async readPolicyFile(file: URI): Promise<Map<PolicyName, PolicyValue>> {
		const policies = new Map<PolicyName, PolicyValue>();

		try {
			const content = await this.fileService.readFile(file);
			const raw = JSON.parse(content.value.toString());

			if (!isObject(raw)) {
				this.logService.warn(`[LinuxPolicyService] Policy file ${file.fsPath} is not a JSON object`);
				return policies;
			}

			for (const key of Object.keys(raw)) {
				if (this.policyDefinitions[key]) {
					policies.set(key, raw[key]);
				} else {
					this.logService.debug(`[LinuxPolicyService] Ignoring unknown policy '${key}' in ${file.fsPath}`);
				}
			}

			this.logService.trace(`[LinuxPolicyService] Loaded ${policies.size} policies from ${file.fsPath}`);
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(`[LinuxPolicyService] Failed to read policy file ${file.fsPath}`, error);
			} else {
				this.logService.trace(`[LinuxPolicyService] Policy file ${file.fsPath} not found`);
			}
		}

		return policies;
	}

	private async refresh(): Promise<void> {
		// Read both system and user policy files
		const [systemPolicies, userPolicies] = await Promise.all([
			this.readPolicyFile(this.systemPolicyFile),
			this.readPolicyFile(this.userPolicyFile)
		]);

		// Merge policies with user policies taking precedence over system policies
		const mergedPolicies = new Map<PolicyName, PolicyValue>();
		
		// First add system policies
		for (const [key, value] of systemPolicies) {
			mergedPolicies.set(key, value);
		}
		
		// Then add user policies (overriding system policies if there are conflicts)
		for (const [key, value] of userPolicies) {
			mergedPolicies.set(key, value);
		}

		const diff = keysDiff(this.policies, mergedPolicies);
		this.policies = mergedPolicies;

		if (diff.length > 0) {
			this.logService.trace(`[LinuxPolicyService] Policy changes detected: ${diff.join(', ')}`);
			this._onDidChange.fire(diff);
		}
	}
}