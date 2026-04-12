/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
const RuntimeExtensionsEditorIcon = registerIcon('runtime-extensions-editor-label-icon', Codicon.extensions, nls.localize('runtimeExtensionEditorLabelIcon', 'Icon of the runtime extensions editor label.'));
export class RuntimeExtensionsInput extends EditorInput {
    constructor() {
        super(...arguments);
        this.resource = URI.from({
            scheme: 'runtime-extensions',
            path: 'default'
        });
    }
    static { this.ID = 'workbench.runtimeExtensions.input'; }
    get typeId() {
        return RuntimeExtensionsInput.ID;
    }
    get capabilities() {
        return 2 /* EditorInputCapabilities.Readonly */ | 8 /* EditorInputCapabilities.Singleton */;
    }
    static get instance() {
        if (!RuntimeExtensionsInput._instance || RuntimeExtensionsInput._instance.isDisposed()) {
            RuntimeExtensionsInput._instance = new RuntimeExtensionsInput();
        }
        return RuntimeExtensionsInput._instance;
    }
    getName() {
        return nls.localize('extensionsInputName', "Running Extensions");
    }
    getIcon() {
        return RuntimeExtensionsEditorIcon;
    }
    matches(other) {
        if (super.matches(other)) {
            return true;
        }
        return other instanceof RuntimeExtensionsInput;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVudGltZUV4dGVuc2lvbnNJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvY29tbW9uL3J1bnRpbWVFeHRlbnNpb25zSW5wdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFckQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXBFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFakYsTUFBTSwyQkFBMkIsR0FBRyxZQUFZLENBQUMsc0NBQXNDLEVBQUUsT0FBTyxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLDhDQUE4QyxDQUFDLENBQUMsQ0FBQztBQUU5TSxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsV0FBVztJQUF2RDs7UUFxQlUsYUFBUSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDNUIsTUFBTSxFQUFFLG9CQUFvQjtZQUM1QixJQUFJLEVBQUUsU0FBUztTQUNmLENBQUMsQ0FBQztJQWdCSixDQUFDO2FBdENnQixPQUFFLEdBQUcsbUNBQW1DLEFBQXRDLENBQXVDO0lBRXpELElBQWEsTUFBTTtRQUNsQixPQUFPLHNCQUFzQixDQUFDLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBRUQsSUFBYSxZQUFZO1FBQ3hCLE9BQU8sb0ZBQW9FLENBQUM7SUFDN0UsQ0FBQztJQUdELE1BQU0sS0FBSyxRQUFRO1FBQ2xCLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLElBQUksc0JBQXNCLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7WUFDeEYsc0JBQXNCLENBQUMsU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztRQUNqRSxDQUFDO1FBRUQsT0FBTyxzQkFBc0IsQ0FBQyxTQUFTLENBQUM7SUFDekMsQ0FBQztJQU9RLE9BQU87UUFDZixPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRVEsT0FBTztRQUNmLE9BQU8sMkJBQTJCLENBQUM7SUFDcEMsQ0FBQztJQUVRLE9BQU8sQ0FBQyxLQUF3QztRQUN4RCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMxQixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxPQUFPLEtBQUssWUFBWSxzQkFBc0IsQ0FBQztJQUNoRCxDQUFDIn0=