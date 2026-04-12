/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../base/common/uri.js';
import { createURITransformer } from '../../base/common/uriTransformer.js';
import { DiskFileSystemProvider } from '../../platform/files/node/diskFileSystemProvider.js';
import { posix, delimiter } from '../../base/common/path.js';
import { AbstractDiskFileSystemProviderChannel, AbstractSessionFileWatcher } from '../../platform/files/node/diskFileSystemProviderServer.js';
export class RemoteAgentFileSystemProviderChannel extends AbstractDiskFileSystemProviderChannel {
    constructor(logService, environmentService, configurationService) {
        super(new DiskFileSystemProvider(logService), logService);
        this.environmentService = environmentService;
        this.configurationService = configurationService;
        this.uriTransformerCache = new Map();
        this._register(this.provider);
    }
    getUriTransformer(ctx) {
        let transformer = this.uriTransformerCache.get(ctx.remoteAuthority);
        if (!transformer) {
            transformer = createURITransformer(ctx.remoteAuthority);
            this.uriTransformerCache.set(ctx.remoteAuthority, transformer);
        }
        return transformer;
    }
    transformIncoming(uriTransformer, _resource, supportVSCodeResource = false) {
        if (supportVSCodeResource && _resource.path === '/vscode-resource' && _resource.query) {
            const requestResourcePath = JSON.parse(_resource.query).requestResourcePath;
            return URI.from({ scheme: 'file', path: requestResourcePath });
        }
        return URI.revive(uriTransformer.transformIncoming(_resource));
    }
    //#region File Watching
    createSessionFileWatcher(uriTransformer, emitter) {
        return new SessionFileWatcher(uriTransformer, emitter, this.logService, this.environmentService, this.configurationService);
    }
}
class SessionFileWatcher extends AbstractSessionFileWatcher {
    constructor(uriTransformer, sessionEmitter, logService, environmentService, configurationService) {
        super(uriTransformer, sessionEmitter, logService, environmentService);
    }
    getRecursiveWatcherOptions(environmentService) {
        const fileWatcherPolling = environmentService.args['file-watcher-polling'];
        if (fileWatcherPolling) {
            const segments = fileWatcherPolling.split(delimiter);
            const pollingInterval = Number(segments[0]);
            if (pollingInterval > 0) {
                const usePolling = segments.length > 1 ? segments.slice(1) : true;
                return { usePolling, pollingInterval };
            }
        }
        return undefined;
    }
    getExtraExcludes(environmentService) {
        if (environmentService.extensionsPath) {
            // when opening the $HOME folder, we end up watching the extension folder
            // so simply exclude watching the extensions folder
            return [posix.join(environmentService.extensionsPath, '**')];
        }
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlRmlsZVN5c3RlbVByb3ZpZGVyU2VydmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2VydmVyL25vZGUvcmVtb3RlRmlsZVN5c3RlbVByb3ZpZGVyU2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sMEJBQTBCLENBQUM7QUFJOUQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFM0UsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDN0YsT0FBTyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUU3RCxPQUFPLEVBQUUscUNBQXFDLEVBQUUsMEJBQTBCLEVBQXVCLE1BQU0sMkRBQTJELENBQUM7QUFJbkssTUFBTSxPQUFPLG9DQUFxQyxTQUFRLHFDQUFtRTtJQUk1SCxZQUNDLFVBQXVCLEVBQ04sa0JBQTZDLEVBQzdDLG9CQUEyQztRQUU1RCxLQUFLLENBQUMsSUFBSSxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUh6Qyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQTJCO1FBQzdDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFMNUMsd0JBQW1CLEdBQUcsSUFBSSxHQUFHLEVBQTJCLENBQUM7UUFTekUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUVrQixpQkFBaUIsQ0FBQyxHQUFpQztRQUNyRSxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNwRSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbEIs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