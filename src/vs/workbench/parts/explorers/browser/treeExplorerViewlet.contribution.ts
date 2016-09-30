'use strict';

import 'vs/css!./media/treeExplorerViewlet.contribution';

import {ITreeExplorerViewletService, TreeExplorerViewletService } from 'vs/workbench/parts/explorers/browser/treeExplorerViewletService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

registerSingleton(ITreeExplorerViewletService, TreeExplorerViewletService);