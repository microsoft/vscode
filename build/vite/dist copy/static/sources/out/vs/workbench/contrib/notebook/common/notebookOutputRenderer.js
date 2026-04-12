/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as glob from '../../../../base/common/glob.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { joinPath } from '../../../../base/common/resources.js';
class DependencyList {
    constructor(value) {
        this.value = new Set(value);
        this.defined = this.value.size > 0;
    }
    /** Gets whether any of the 'available' dependencies match the ones in this list */
    matches(available) {
        // For now this is simple, but this may expand to support globs later
        // @see https://github.com/microsoft/vscode/issues/119899
        return available.some(v => this.value.has(v));
    }
}
export class NotebookOutputRendererInfo {
    constructor(descriptor) {
        this.id = descriptor.id;
        this.extensionId = descriptor.extension.identifier;
        this.extensionLocation = descriptor.extension.extensionLocation;
        this.isBuiltin = descriptor.extension.isBuiltin;
        if (typeof descriptor.entrypoint === 'string') {
            this.entrypoint = {
                extends: undefined,
                path: joinPath(this.extensionLocation, descriptor.entrypoint)
            };
        }
        else {
            this.entrypoint = {
                extends: descriptor.entrypoint.extends,
                path: joinPath(this.extensionLocation, descriptor.entrypoint.path)
            };
        }
        this.displayName = descriptor.displayName;
        this.mimeTypes = descriptor.mimeTypes;
        this.mimeTypeGlobs = this.mimeTypes.map(pattern => glob.parse(pattern, { ignoreCase: true }));
        this.hardDependencies = new DependencyList(descriptor.dependencies ?? Iterable.empty());
        this.optionalDependencies = new DependencyList(descriptor.optionalDependencies ?? Iterable.empty());
        this.messaging = descriptor.requiresMessaging ?? "never" /* RendererMessagingSpec.Never */;
    }
    matchesWithoutKernel(mimeType) {
        if (!this.matchesMimeTypeOnly(mimeType)) {
            return 3 /* NotebookRendererMatch.Never */;
        }
        if (this.hardDependencies.defined) {
            return 0 /* NotebookRendererMatch.WithHardKernelDependency */;
        }
        if (this.optionalDependencies.defined) {
            return 1 /* NotebookRendererMatch.WithOptionalKernelDependency */;
        }
        return 2 /* NotebookRendererMatch.Pure */;
    }
    matches(mimeType, kernelProvides) {
        if (!this.matchesMimeTypeOnly(mimeType)) {
            return 3 /* NotebookRendererMatch.Never */;
        }
        if (this.hardDependencies.defined) {
            return this.hardDependencies.matches(kernelProvides)
                ? 0 /* NotebookRendererMatch.WithHardKernelDependency */
                : 3 /* NotebookRendererMatch.Never */;
        }
        return this.optionalDependencies.matches(kernelProvides)
            ? 1 /* NotebookRendererMatch.WithOptionalKernelDependency */
            : 2 /* NotebookRendererMatch.Pure */;
    }
    matchesMimeTypeOnly(mimeType) {
        if (this.entrypoint.extends) { // We're extending another renderer
            return false;
        }
        return this.mimeTypeGlobs.some(pattern => pattern(mimeType)) || this.mimeTypes.some(pattern => pattern === mimeType);
    }
}
export class NotebookStaticPreloadInfo {
    constructor(descriptor) {
        this.type = descriptor.type;
        this.entrypoint = joinPath(descriptor.extension.extensionLocation, descriptor.entrypoint);
        this.extensionLocation = descriptor.extension.extensionLocation;
        this.localResourceRoots = descriptor.localResourceRoots.map(root => joinPath(descriptor.extension.extensionLocation, root));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tPdXRwdXRSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va091dHB1dFJlbmRlcmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxJQUFJLE1BQU0saUNBQWlDLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUtoRSxNQUFNLGNBQWM7SUFJbkIsWUFBWSxLQUF1QjtRQUNsQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzVCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxtRkFBbUY7SUFDNUUsT0FBTyxDQUFDLFNBQWdDO1FBQzlDLHFFQUFxRTtRQUNyRSx5REFBeUQ7UUFDekQsT0FBTyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMvQyxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sMEJBQTBCO0lBZ0J0QyxZQUFZLFVBU1g7UUFDQSxJQUFJLENBQUMsRUFBRSxHQUFHLFVBQVUsQ0FBQyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQztRQUNuRCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQztRQUNoRSxJQUFJLENBQUMs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