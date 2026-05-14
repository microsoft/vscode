/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IAgentHostDebugLogsExportService } from '../../browser/actions/exportAgentHostDebugLogsAction.js';

class NativeAgentHostDebugLogsExportService implements IAgentHostDebugLogsExportService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) { }

	async save(exportName: string, files: readonly { path: string; contents: string }[]): Promise<void> {
		const defaultUri = joinPath(await this.fileDialogService.defaultFilePath(Schemas.file), `${exportName}.zip`);
		const saveUri = await this.fileDialogService.showSaveDialog({
			title: localize('exportDebugLogs.saveDialogTitle', "Export Agent Host Debug Logs"),
			defaultUri,
			filters: [{ name: localize('exportDebugLogs.zipFilter', "Zip Archive"), extensions: ['zip'] }],
			availableFileSystems: [Schemas.file],
		});

		if (!saveUri) {
			return;
		}

		await this.nativeHostService.createZipFile(saveUri, [...files]);
	}
}

registerSingleton(IAgentHostDebugLogsExportService, NativeAgentHostDebugLogsExportService, InstantiationType.Delayed);
