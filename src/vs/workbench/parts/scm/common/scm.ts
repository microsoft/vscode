/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IViewContainersRegistry, ViewContainer, Extensions as ViewContainerExtensions } from 'vs/workbench/common/views';

export const VIEWLET_ID = 'workbench.view.scm';
export const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(VIEWLET_ID);