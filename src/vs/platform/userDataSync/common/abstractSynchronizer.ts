/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';
import { VSBuffer } from 'vs/base/common/buffer';
import { URI } from 'vs/base/common/uri';
import { SyncSource } from 'vs/platform/userDataSync/common/userDataSync';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { joinPath } from 'vs/base/common/resources';
import { toLocalISOString } from 'vs/base/common/date';
import { ThrottledDelayer } from 'vs/base/common/async';

export abstract class AbstractSynchroniser extends Disposable {

	private readonly syncFolder: URI;
	private cleanUpDelayer: ThrottledDelayer<void>;

	constructor(
		syncSource: SyncSource,
		@IFileService protected readonly fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();
		this.syncFolder = joinPath(environmentService.userRoamingDataHome, '.sync', syncSource);
		this.cleanUpDelayer = new ThrottledDelayer(50);
	}

	protected async backupLocal(content: VSBuffer): Promise<void> {
		const resource = joinPath(this.syncFolder, toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, ''));
		await this.fileService.writeFile(resource, content);
		this.cleanUpDelayer.trigger(() => this.cleanUpBackup());
	}

	private async cleanUpBackup(): Promise<void> {
		const stat = await this.fileService.resolve(this.syncFolder);
		if (stat.children) {
			const all = stat.children.filter(stat => stat.isFile && /^\d{8}T\d{6}$/.test(stat.name)).sort();
			const toDelete = all.slice(0, Math.max(0, all.length - 9));
			await Promise.all(toDelete.map(stat => this.fileService.del(stat.resource)));
		}
	}

}
