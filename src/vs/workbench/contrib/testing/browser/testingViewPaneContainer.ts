/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { IStorageService } from '../../../../platform/storage/common/storage';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IThemeService } from '../../../../platform/theme/common/themeService';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer';
import { IViewDescriptorService } from '../../../common/views';
import { Testing } from '../common/constants';
import { IExtensionService } from '../../../services/extensions/common/extensions';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService';

export class TestingViewPaneContainer extends ViewPaneContainer {

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionService extensionService: IExtensionService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
	) {
		super(Testing.ViewletId, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService);
	}

	override create(parent: HTMLElement): void {
		super.create(parent);
		parent.classList.add('testing-view-pane');
	}

	override getOptimalWidth(): number {
		return 400;
	}

	override getTitle(): string {
		return localize('testing', "Testing");
	}
}
