/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IViewsRegistry, Extensions as ViewExtensions } from '../../../../common/views.js';
import { FilesListView } from './filesListView.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { VIEW_CONTAINER } from '../explorerViewlet.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';

const filesListViewIcon = registerIcon('files-list-view-icon', Codicon.fileCode, localize('filesListViewIcon', 'View icon of the files list view.'));

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: FilesListView.ID,
	name: FilesListView.TITLE,
	containerIcon: filesListViewIcon,
	ctorDescriptor: new SyncDescriptor(FilesListView),
	canToggleVisibility: true,
	canMoveView: true,
	hideByDefault: false,
	collapsed: true,
	order: 3,
	weight: 20,
	focusCommand: { id: 'workbench.files.filesListView.focus' }
}], VIEW_CONTAINER);
