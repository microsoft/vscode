/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { join } from '../../../../base/common/path.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';

export class KeybindingsExportContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.keybindingsExport';

	constructor(
		@INativeEnvironmentService private readonly nativeEnvironmentService: INativeEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		if (this.nativeEnvironmentService.isBuilt) {
			return;
		}

		const outputPath = this.nativeEnvironmentService.exportDefaultKeybindings;
		if (outputPath !== undefined) {
			const defaultPath = join(this.nativeEnvironmentService.appRoot, 'doc');
			void this.exportDefaultKeybindingsAndQuit(outputPath || defaultPath);
		}
	}

	private async exportDefaultKeybindingsAndQuit(outputPath: string): Promise<void> {
		try {
			const platforms: { os: OperatingSystem; filename: string }[] = [
				{ os: OperatingSystem.Windows, filename: 'doc.keybindings.win.json' },
				{ os: OperatingSystem.Macintosh, filename: 'doc.keybindings.osx.json' },
				{ os: OperatingSystem.Linux, filename: 'doc.keybindings.linux.json' },
			];

			for (const { os, filename } of platforms) {
				const content = this.keybindingService.getDefaultKeybindingsContentForOS(os);
				const filePath = join(outputPath, filename);
				await this.fileService.writeFile(URI.file(filePath), VSBuffer.fromString(content));
				this.logService.info(`[${KeybindingsExportContribution.ID}] Wrote ${filePath}`);
			}

			await this.nativeHostService.exit(0);
		} catch (error) {
			this.logService.error(`[${KeybindingsExportContribution.ID}] Failed to generate default keybindings`, error);
			await this.nativeHostService.exit(1);
		}
	}
}

registerWorkbenchContribution2(
	KeybindingsExportContribution.ID,
	KeybindingsExportContribution,
	WorkbenchPhase.Eventually,
);
