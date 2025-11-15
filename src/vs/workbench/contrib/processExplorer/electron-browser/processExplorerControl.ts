/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProcessService, IResolvedProcessInformation } from '../../../../platform/process/common/process.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ProcessExplorerControl } from '../browser/processExplorerControl.js';

export class NativeProcessExplorerControl extends ProcessExplorerControl {

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService productService: IProductService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ICommandService commandService: ICommandService,
		@IProcessService private readonly processService: IProcessService,
		@IClipboardService clipboardService: IClipboardService
	) {
		super(instantiationService, productService, contextMenuService, commandService, clipboardService);

		this.create(container);
	}

	protected override killProcess(pid: number, signal: string): Promise<void> {
		return this.nativeHostService.killProcess(pid, signal);
	}

	protected override resolveProcesses(): Promise<IResolvedProcessInformation> {
		return this.processService.resolveProcesses();
	}
}
