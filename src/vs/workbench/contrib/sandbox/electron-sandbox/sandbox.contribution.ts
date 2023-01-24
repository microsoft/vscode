/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { IProductService } from 'vs/platform/product/common/productService';
import { IWindowsConfiguration, IWindowSettings } from 'vs/platform/window/common/window';

interface IConfiguration extends IWindowsConfiguration {
	window: IWindowSettings & { experimental?: { useSandbox?: boolean } };
}

export class SandboxExperimentHandler extends Disposable implements IWorkbenchContribution {

	private useSandbox: boolean | undefined;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IProductService productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();

		if (productService.quality !== 'stable') {
			return; // experiment only applies to stable
		}

		this.onConfigurationChange(configurationService.getValue<IConfiguration>());
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('window.experimental.useSandbox')) {
				this.onConfigurationChange(configurationService.getValue<IConfiguration>());
			}
		}));
	}

	private onConfigurationChange(configuration: IConfiguration): void {
		const useSandbox = configuration.window.experimental?.useSandbox;
		if (typeof useSandbox === 'boolean' && useSandbox !== this.useSandbox) {
			this.useSandbox = useSandbox;

			this.nativeHostService.enableSandbox(Boolean(useSandbox));
		}
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SandboxExperimentHandler, LifecyclePhase.Restored);
