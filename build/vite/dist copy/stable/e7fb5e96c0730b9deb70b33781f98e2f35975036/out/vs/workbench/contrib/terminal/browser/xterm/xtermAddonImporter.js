/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { importAMDNodeModule } from '../../../../../amdX.js';
const importedAddons = new Map();
/**
 * Exposes a simple interface to consumers, encapsulating the messy import xterm
 * addon import and caching logic.
 */
export class XtermAddonImporter {
    async importAddon(name) {
        let addon = importedAddons.get(name);
        if (!addon) {
            switch (name) {
                case 'clipboard':
                    addon = (await importAMDNodeModule('@xterm/addon-clipboard', 'lib/addon-clipboard.js')).ClipboardAddon;
                    break;
                case 'image':
                    addon = (await importAMDNodeModule('@xterm/addon-image', 'lib/addon-image.js')).ImageAddon;
                    break;
                case 'ligatures':
                    addon = (await importAMDNodeModule('@xterm/addon-ligatures', 'lib/addon-ligatures.js')).LigaturesAddon;
                    break;
                case 'progress':
                    addon = (await importAMDNodeModule('@xterm/addon-progress', 'lib/addon-progress.js')).ProgressAddon;
                    break;
                case 'search':
                    addon = (await importAMDNodeModule('@xterm/addon-search', 'lib/addon-search.js')).SearchAddon;
                    break;
                case 'serialize':
                    addon = (await importAMDNodeModule('@xterm/addon-serialize', 'lib/addon-serialize.js')).SerializeAddon;
                    break;
                case 'unicode11':
                    addon = (await importAMDNodeModule('@xterm/addon-unicode11', 'lib/addon-unicode11.js')).Unicode11Addon;
                    break;
                case 'webgl':
                    addon = (await importAMDNodeModule('@xterm/addon-webgl', 'lib/addon-webgl.js')).WebglAddon;
                    break;
            }
            if (!addon) {
                throw new Error(`Could not load addon ${name}`);
            }
            importedAddons.set(name, addon);
        }
        return addon;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHRlcm1BZGRvbkltcG9ydGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci94dGVybS94dGVybUFkZG9uSW1wb3J0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFVaEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFtQjdELE1BQU0sY0FBYyxHQUEyQixJQUFJLEdBQUcsRUFBRSxDQUFDO0FBRXpEOzs7R0FHRztBQUNILE1BQU0sT0FBTyxrQkFBa0I7SUFDOUIsS0FBSyxDQUFDLFdBQVcsQ0FBd0MsSUFBTztRQUMvRCxJQUFJLEtBQUssR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLFFBQVEsSUFBSSxFQUFFLENBQUM7Z0JBQ2QsS0FBSyxXQUFXO29CQUFFLEtBQUssR0FBRyxDQUFDLE1BQU0sbUJBQW1CLENBQTBDLHdCQUF3QixFQUFFLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxjQUEwQyxDQUFDO29CQUFDLE1BQU07Z0JBQ3JNLEtBQUssT0FBTztvQkFBRSxLQUFLLEdBQUcsQ0FBQyxNQUFNLG1CQUFtQixDQUFzQyxvQkFBb0IsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsVUFBc0MsQ0FBQztvQkFBQyxNQUFNO2dCQUNqTCxLQUFLLFdBQVc7b0JBQUUsS0FBSyxHQUFHLENBQUMsTUFBTSxtQkFBbUIsQ0FBMEMsd0JBQXdCLEVBQUUsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLGNBQTBDLENBQUM7b0JBQUMsTUFBTTtnQkFDck0sS0FBSyxVQUFVO29CQUFFLEtBQUssR0FBRyxDQUFDLE1BQU0sbUJBQW1CLENBQXlDLHVCQUF1QixFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxhQUF5QyxDQUFDO29CQUFDLE1BQU07Z0JBQ2hNLEtBQUssUUFBUTtvQkFBRSxLQUFLLEdBQUcsQ0FBQyxNQUFNLG1CQUFtQixDQUF1QyxxQkFBcUIsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsV0FBdUMsQ0FBQztvQkFBQyxNQUFNO2dCQUN0TCxLQUFLLFdBQVc7b0JBQUUsS0FBSyxHQUFHLENBQUMsTUFBTSxtQkFBbUIsQ0FBMEMsd0JBQXdCLEVBQUUsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLGNBQTBDLENBQUM7b0JBQUMsTUFBTTtnQkFDck0sS0FBSyxXQUFXO29CQUFFLEtBQUssR0FBRyxDQUFDLE1BQU0sbUJBQW1CLENBQTBDLHdCQUF3QixFQUFFLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxjQUEwQyxDQUFDO29CQUFDLE1BQU07Z0JBQ3JNLEtBQUssT0FBTztvQkFBRSxLQUFLLEdBQUcsQ0FBQyxNQUFNLG1CQUFtQixDQUFzQyxvQkFBb0IsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsVUFBc0MsQ0FBQztvQkFBQyxNQUFNO1lBQ2xMLENBQUM7WUFDRCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNqRCxDQUFDO1lBQ0QsY0FBYyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakMsQ0FBQztRQUNELE9BQU8sS0FBaUMsQ0FBQztJQUMxQyxDQUFDO0NBQ0QifQ==