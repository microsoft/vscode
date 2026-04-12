"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownContributions = void 0;
exports.getMarkdownExtensionContributions = getMarkdownExtensionContributions;
const vscode = __importStar(require("vscode"));
const arrays = __importStar(require("./util/arrays"));
const dispose_1 = require("./util/dispose");
function resolveExtensionResource(extension, resourcePath) {
    return vscode.Uri.joinPath(extension.extensionUri, resourcePath);
}
function* resolveExtensionResources(extension, resourcePaths) {
    if (Array.isArray(resourcePaths)) {
        for (const resource of resourcePaths) {
            try {
                yield resolveExtensionResource(extension, resource);
            }
            catch {
                // noop
            }
        }
    }
}
var MarkdownContributions;
(function (MarkdownContributions) {
    MarkdownContributions.Empty = {
        previewScripts: [],
        previewStyles: [],
        previewResourceRoots: [],
        markdownItPlugins: new Map()
    };
    function merge(a, b) {
        return {
            previewScripts: [...a.previewScripts, ...b.previewScripts],
            previewStyles: [...a.previewStyles, ...b.previewStyles],
            previewResourceRoots: [...a.previewResourceRoots, ...b.previewResourceRoots],
            markdownItPlugins: new Map([...a.markdownItPlugins.entries(), ...b.markdownItPlugins.entries()]),
        };
    }
    MarkdownContributions.merge = merge;
    function uriEqual(a, b) {
        return a.toString() === b.toString();
    }
    function equal(a, b) {
        return arrays.equals(a.previewScripts, b.previewScripts, uriEqual)
            && arrays.equals(a.previewStyles, b.previewStyles, uriEqual)
            && arrays.equals(a.previewResourceRoots, b.previewResourceRoots, uriEqual)
            && arrays.equals(Array.from(a.markdownItPlugins.keys()), Array.from(b.markdownItPlugins.keys()));
    }
    MarkdownContributions.equal = equal;
    function fromExtension(extension) {
        const contributions = extension.packageJSON?.contributes;
        if (!contributions) {
            return MarkdownContributions.Empty;
        }
        const previewStyles = Array.from(getContributedStyles(contributions, extension));
        const previewScripts = Array.from(getContributedScripts(contributions, extension));
        const previewResourceRoots = previewStyles.length || previewScripts.length ? [extension.extensionUri] : [];
        const markdownItPlugins = getContributedMarkdownItPlugins(contributions, extension);
        return {
            previewScripts,
            previewStyles,
            previewResourceRoots,
            markdownItPlugins
        };
    }
    MarkdownContributions.fromExtension = fromExtension;
    function getContributedMarkdownItPlugins(contributes, extension) {
        const map = new Map();
        if (contributes['markdown.markdownItPlugins']) {
            map.set(extension.id, extension.activate().then(() => {
                if (extension.exports?.extendMarkdownIt) {
                    return (md) => extension.exports.extendMarkdownIt(md);
                }
                return (md) => md;
            }));
        }
        return map;
    }
    function getContributedScripts(contributes, extension) {
        return resolveExtensionResources(extension, contributes['markdown.previewScripts']);
    }
    function getContributedStyles(contributes, extension) {
        return resolveExtensionResources(extension, contributes['markdown.previewStyles']);
    }
})(MarkdownContributions || (exports.MarkdownContributions = MarkdownContributions = {}));
class VSCodeExtensionMarkdownContributionProvider extends dispose_1.Disposable {
    #contributions;
    #extensionContext;
    constructor(extensionContext) {
        super();
        this.#extensionContext = extensionContext;
        this._register(vscode.extensions.onDidChange(() => {
            const currentContributions = this.#getCurrentContributions();
            const existingContributions = this.#contributions || MarkdownContributions.Empty;
            if (!MarkdownContributions.equal(existingContributions, currentContributions)) {
                this.#contributions = currentContributions;
                this.#onContributionsChanged.fire(this);
            }
        }));
    }
    get extensionUri() {
        return this.#extensionContext.extensionUri;
    }
    #onContributionsChanged = this._register(new vscode.EventEmitter());
    onContributionsChanged = this.#onContributionsChanged.event;
    get contributions() {
        this.#contributions ??= this.#getCurrentContributions();
        return this.#contributions;
    }
    #getCurrentContributions() {
        return vscode.extensions.all
            .map(MarkdownContributions.fromExtension)
            .reduce(MarkdownContributions.merge, MarkdownContributions.Empty);
    }
}
function getMarkdownExtensionContributions(context) {
    return new VSCodeExtensionMarkdownContributionProvider(context);
}
//# sourceMappingURL=markdownExtensions.js.map