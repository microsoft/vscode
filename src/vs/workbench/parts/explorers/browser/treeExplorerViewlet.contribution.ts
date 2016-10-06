'use strict';

import {ITreeExplorerViewletService, TreeExplorerViewletService } from 'vs/workbench/parts/explorers/browser/treeExplorerViewletService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

registerSingleton(ITreeExplorerViewletService, TreeExplorerViewletService);