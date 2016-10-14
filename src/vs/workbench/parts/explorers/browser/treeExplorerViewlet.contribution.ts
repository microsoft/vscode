'use strict';

import { ITreeExplorerService, TreeExplorerViewletService } from 'vs/workbench/parts/explorers/browser/treeExplorerService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

registerSingleton(ITreeExplorerService, TreeExplorerViewletService);