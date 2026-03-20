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
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IKeybindingItem, KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeybindingResolver } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { IKeyboardMapper } from '../../../../platform/keyboardLayout/common/keyboardMapper.js';
import { IMacLinuxKeyboardMapping, IWindowsKeyboardMapping } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { MacLinuxKeyboardMapper } from '../../../services/keybinding/common/macLinuxKeyboardMapper.js';
import { WindowsKeyboardMapper } from '../../../services/keybinding/common/windowsKeyboardMapper.js';
import { IKeymapInfo, KeymapInfo } from '../../../services/keybinding/common/keymapInfo.js';
import { EN_US_WIN_LAYOUT } from '../../../services/keybinding/browser/keyboardLayouts/en.win.js';
import { EN_US_DARWIN_LAYOUT } from '../../../services/keybinding/browser/keyboardLayouts/en.darwin.js';
import { EN_US_LINUX_LAYOUT } from '../../../services/keybinding/browser/keyboardLayouts/en.linux.js';
import { KeybindingIO, OutputBuilder } from '../../../services/keybinding/common/keybindingIO.js';
import { getAllUnboundCommands } from '../../../services/keybinding/browser/unboundCommands.js';

export class KeybindingsExportContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.keybindingsExport';

	constructor(
		@INativeEnvironmentService private readonly nativeEnvironmentService: INativeEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		if (this.productService.quality === 'stable') {
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
				const content = KeybindingsExportContribution._getDefaultKeybindingsContentForOS(os);
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

	private static _getDefaultKeybindingsContentForOS(os: OperatingSystem): string {
		const items = KeybindingsRegistry.getDefaultKeybindingsForOS(os);
		const mapper = KeybindingsExportContribution._createKeyboardMapperForOS(os);
		const resolved = KeybindingsExportContribution._resolveKeybindingItemsWithMapper(items, mapper);
		const resolver = new KeybindingResolver(resolved, [], () => { });
		const defaultKeybindings = resolver.getDefaultKeybindings();
		const boundCommands = resolver.getDefaultBoundCommands();
		return (
			KeybindingsExportContribution._formatDefaultKeybindings(defaultKeybindings)
			+ '\n\n'
			+ KeybindingsExportContribution._formatAllCommandsAsComment(boundCommands)
		);
	}

	private static _createKeyboardMapperForOS(os: OperatingSystem): IKeyboardMapper {
		const layoutMap: Record<OperatingSystem, IKeymapInfo> = {
			[OperatingSystem.Windows]: EN_US_WIN_LAYOUT,
			[OperatingSystem.Macintosh]: EN_US_DARWIN_LAYOUT,
			[OperatingSystem.Linux]: EN_US_LINUX_LAYOUT,
		};
		const layout = layoutMap[os];
		const keymapInfo = new KeymapInfo(layout.layout, layout.secondaryLayouts, layout.mapping);
		switch (os) {
			case OperatingSystem.Windows:
				return new WindowsKeyboardMapper(true, <IWindowsKeyboardMapping>keymapInfo.mapping, false);
			case OperatingSystem.Macintosh:
				return new MacLinuxKeyboardMapper(true, <IMacLinuxKeyboardMapping>keymapInfo.mapping, false, OperatingSystem.Macintosh);
			case OperatingSystem.Linux:
				return new MacLinuxKeyboardMapper(true, <IMacLinuxKeyboardMapping>keymapInfo.mapping, false, OperatingSystem.Linux);
		}
	}

	private static _resolveKeybindingItemsWithMapper(items: IKeybindingItem[], mapper: IKeyboardMapper): ResolvedKeybindingItem[] {
		const result: ResolvedKeybindingItem[] = [];
		for (const item of items) {
			const when = item.when || undefined;
			const keybinding = item.keybinding;
			if (!keybinding) {
				result.push(new ResolvedKeybindingItem(undefined, item.command, item.commandArgs, when, true, item.extensionId, item.isBuiltinExtension));
			} else {
				const resolvedKeybindings = mapper.resolveKeybinding(keybinding);
				for (let i = resolvedKeybindings.length - 1; i >= 0; i--) {
					result.push(new ResolvedKeybindingItem(resolvedKeybindings[i], item.command, item.commandArgs, when, true, item.extensionId, item.isBuiltinExtension));
				}
			}
		}
		return result;
	}

	private static _formatDefaultKeybindings(defaultKeybindings: readonly ResolvedKeybindingItem[]): string {
		const out = new OutputBuilder();
		out.writeLine('[');
		const lastIndex = defaultKeybindings.length - 1;
		defaultKeybindings.forEach((k, index) => {
			KeybindingIO.writeKeybindingItem(out, k);
			if (index !== lastIndex) {
				out.writeLine(',');
			} else {
				out.writeLine();
			}
		});
		out.writeLine(']');
		return out.toString();
	}

	private static _formatAllCommandsAsComment(boundCommands: Map<string, boolean>): string {
		const unboundCommands = getAllUnboundCommands(boundCommands);
		const pretty = unboundCommands.sort().join('\n// - ');
		return '// Here are other available commands: ' + '\n// - ' + pretty;
	}
}

registerWorkbenchContribution2(
	KeybindingsExportContribution.ID,
	KeybindingsExportContribution,
	WorkbenchPhase.Eventually,
);
