/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ClipboardAddon as ClipboardAddonType } from '@xterm/addon-clipboard';
import type { ImageAddon as ImageAddonType } from '@xterm/addon-image';
import type { LigaturesAddon as LigaturesAddonType } from '@xterm/addon-ligatures';
import type { SearchAddon as SearchAddonType } from '@xterm/addon-search';
import type { SerializeAddon as SerializeAddonType } from '@xterm/addon-serialize';
import type { Unicode11Addon as Unicode11AddonType } from '@xterm/addon-unicode11';
import type { WebglAddon as WebglAddonType } from '@xterm/addon-webgl';
import { importAMDNodeModule } from '../../../../../amdX.js';

export interface IXtermAddonNameToCtor {
	clipboard: typeof ClipboardAddonType;
	image: typeof ImageAddonType;
	ligatures: typeof LigaturesAddonType;
	search: typeof SearchAddonType;
	serialize: typeof SerializeAddonType;
	unicode11: typeof Unicode11AddonType;
	webgl: typeof WebglAddonType;
}

// This interface lets a maps key and value be linked with generics
interface IImportedXtermAddonMap extends Map<keyof IXtermAddonNameToCtor, IXtermAddonNameToCtor[keyof IXtermAddonNameToCtor]> {
	get<K extends keyof IXtermAddonNameToCtor>(name: K): IXtermAddonNameToCtor[K] | undefined;
	set<K extends keyof IXtermAddonNameToCtor>(name: K, value: IXtermAddonNameToCtor[K]): this;
}

const importedAddons: IImportedXtermAddonMap = new Map();

/**
 * Exposes a simple interface to consumers, encapsulating the messy import xterm
 * addon import and caching logic.
 */
export class XtermAddonImporter {
	async importAddon<T extends keyof IXtermAddonNameToCtor>(name: T): Promise<IXtermAddonNameToCtor[T]> {
		let addon = importedAddons.get(name);
		if (!addon) {
			switch (name) {
				case 'clipboard': addon = (await importAMDNodeModule<typeof import('@xterm/addon-clipboard')>('@xterm/addon-clipboard', 'lib/addon-clipboard.js')).ClipboardAddon as IXtermAddonNameToCtor[T]; break;
				case 'image': addon = (await importAMDNodeModule<typeof import('@xterm/addon-image')>('@xterm/addon-image', 'lib/addon-image.js')).ImageAddon as IXtermAddonNameToCtor[T]; break;
				case 'ligatures': addon = (await importAMDNodeModule<typeof import('@xterm/addon-ligatures')>('@xterm/addon-ligatures', 'lib/addon-ligatures.js')).LigaturesAddon as IXtermAddonNameToCtor[T]; break;
				case 'search': addon = (await importAMDNodeModule<typeof import('@xterm/addon-search')>('@xterm/addon-search', 'lib/addon-search.js')).SearchAddon as IXtermAddonNameToCtor[T]; break;
				case 'serialize': addon = (await importAMDNodeModule<typeof import('@xterm/addon-serialize')>('@xterm/addon-serialize', 'lib/addon-serialize.js')).SerializeAddon as IXtermAddonNameToCtor[T]; break;
				case 'unicode11': addon = (await importAMDNodeModule<typeof import('@xterm/addon-unicode11')>('@xterm/addon-unicode11', 'lib/addon-unicode11.js')).Unicode11Addon as IXtermAddonNameToCtor[T]; break;
				case 'webgl': addon = (await importAMDNodeModule<typeof import('@xterm/addon-webgl')>('@xterm/addon-webgl', 'lib/addon-webgl.js')).WebglAddon as IXtermAddonNameToCtor[T]; break;
			}
			if (!addon) {
				throw new Error(`Could not load addon ${name}`);
			}
			importedAddons.set(name, addon);
		}
		return addon as IXtermAddonNameToCtor[T];
	}
}
