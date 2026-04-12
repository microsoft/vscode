/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { hash } from '../../../../../../base/common/hash.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IAgentHostFileSystemService, SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';
// Re-export so existing consumers don't need to change their import source.
export { SYNCED_CUSTOMIZATION_SCHEME };
const DISPLAY_NAME = 'VS Code Synced Data';
const MANIFEST_CONTENT = JSON.stringify({
    name: DISPLAY_NAME,
    description: 'Customization data synced from VS Code',
}, null, '\t');
/**
 * Maps a {@link PromptsType} to the default plugin directory where that
 * component type is stored. This mirrors the layout used by the Open Plugin
 * format adapter in `agentPluginServiceImpl.ts`.
 *
 * Hooks are omitted — bundling hooks requires merging into `hooks/hooks.json`
 * which is deferred to a follow-up.
 */
function pluginDirForType(type) {
    switch (type) {
        case PromptsType.instructions: return 'rules';
        case PromptsType.prompt: return 'commands';
        case PromptsType.agent: return 'agents';
        case PromptsType.skill: return 'skills';
        case PromptsType.hook: return undefined; // TODO: hooks require JSON merging
    }
}
/**
 * Bundles individual customization files into a synthetic Open Plugin
 * backed by an in-memory filesystem.
 *
 * Each bundler instance is namespaced by its authority string so that
 * multiple agents can coexist under the same scheme without conflicts.
 * The plugin is mounted at `vscode-synced-customization:///{authority}/`
 * and structured as:
 *
 * ```
 * .plugin/plugin.json
 * rules/          ← instruction files
 * commands/       ← prompt files
 * agents/         ← agent files
 * skills/         ← skill files
 * ```
 *
 * The bundler computes a content-based nonce so the agent host can
 * skip re-loading when nothing has changed.
 */
let SyncedCustomizationBundler = class SyncedCustomizationBundler extends Disposable {
    constructor(authority, _fileService, agentHostFileSystemService) {
        super();
        this._fileService = _fileService;
        this._authority = authority;
        agentHostFileSystemService.ensureSyncedCustomizationProvider();
    }
    /**
     * Root URI of the virtual plugin directory for this bundler.
     * The authority is encoded into the path (not the URI authority) because
     * {@link InMemoryFileSystemProvider} only routes by path.
     */
    get _rootUri() {
        return URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: `/${this._authority}` });
    }
    /**
     * Bundles the given files into the in-memory plugin filesystem.
     *
     * Overwrites any previous bundle content. Returns a {@link ICustomizationRef}
     * pointing at the virtual plugin directory with a content-based nonce.
     *
     * @returns The bundle result, or `undefined` if no syncable files were provided.
     */
    async bundle(files) {
        const syncable = files.filter(f => pluginDirForType(f.type) !== undefined);
        if (syncable.length === 0) {
            return undefined;
        }
        // Delete the previous tree for this authority, preserving other authorities
        try {
            await this._fileService.del(this._rootUri, { recursive: true });
        }
        catch {
            // Directory may not exist on first bundle
        }
        // Write the manifest
        const manifestUri = URI.joinPath(this._rootUri, '.plugin', 'plugin.json');
        await this._fileService.writeFile(manifestUri, VSBuffer.fromString(MANIFEST_CONTENT));
        // Read each source file and write it into the correct plugin directory,
        // collecting data for the nonce computation.
        const hashParts = [];
        for (const file of syncable) {
            const dir = pluginDirForType(file.type);
            const fileName = basename(file.uri);
            const destUri = URI.joinPath(this._rootUri, dir, fileName);
            const content = await this._fileService.readFile(file.uri);
            await this._fileService.writeFile(destUri, content.value);
            hashParts.push(`${dir}/${fileName}:${content.value.toString()}`);
        }
        // Stable nonce: sort so file ordering doesn't matter
        hashParts.sort();
        const nonce = String(hash(hashParts.join('\n')));
        this._lastNonce = nonce;
        return {
            ref: {
                uri: this._rootUri.toString(),
                displayName: DISPLAY_NAME,
                description: `${syncable.length} customization(s) synced from VS Code`,
                nonce,
            },
        };
    }
    /**
     * Returns the last computed nonce, or `undefined` if no bundle has been created.
     */
    get lastNonce() {
        return this._lastNonce;
    }
};
SyncedCustomizationBundler = __decorate([
    __param(1, IFileService),
    __param(2, IAgentHostFileSystemService)
], SyncedCustomizationBundler);
export { SyncedCustomizationBundler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3Qvc3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDaEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRzFFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHFGQUFxRixDQUFDO0FBRS9KLDRFQUE0RTtBQUM1RSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsQ0FBQztBQUV2QyxNQUFNLFlBQVksR0FBRyxxQkFBcUIsQ0FBQztBQUUzQyxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDdkMsSUFBSSxFQUFFLFlBQVk7SUFDbEIsV0FBVyxFQUFFLHdDQUF3QztDQUNyRCxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztBQUVmOzs7Ozs7O0dBT0c7QUFDSCxTQUFTLGdCQUFnQixDQUFDLElBQWlCO0lBQzFDLFFBQVEsSUFBSSxFQUFFLENBQUM7UUFDZCxLQUFLLFdBQVcs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