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
var BrowserEditorInput_1;
import { Codicon } from '../../../../base/common/codicons.js';
import { truncate } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TAB_ACTIVE_FOREGROUND } from '../../../common/theme.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IBrowserViewWorkbenchService } from '../common/browserView.js';
import { hasKey } from '../../../../base/common/types.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logBrowserOpen } from '../../../../platform/browserView/common/browserViewTelemetry.js';
import { LRUCachedFunction } from '../../../../base/common/cache.js';
const LOADING_SPINNER_SVG = (color) => `
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
		<path d="M8 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z" fill="${color}" opacity="0.3"/>
		<path d="M8 1a7 7 0 0 1 7 7h-1.5A5.5 5.5 0 0 0 8 2.5V1z" fill="${color}">
			<animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" values="0 8 8;360 8 8"/>
		</path>
	</svg>
`;
/**
 * Maximum length for browser page titles before truncation
 */
const MAX_TITLE_LENGTH = 30;
let BrowserEditorInput = class BrowserEditorInput extends EditorInput {
    static { BrowserEditorInput_1 = this; }
    static { this.ID = 'workbench.editorinputs.browser'; }
    static { this.EDITOR_ID = 'workbench.editor.browser'; }
    static { this.DEFAULT_LABEL = localize('browser.editorLabel', "Browser"); }
    constructor(options, themeService, browserViewWorkbenchService, lifecycleService, instantiationService, telemetryService) {
        super();
        this.themeService = themeService;
        this.browserViewWorkbenchService = browserViewWorkbenchService;
        this.lifecycleService = lifecycleService;
        this.instantiationService = instantiationService;
        this.telemetryService = telemetryService;
        this.getURLTitles = new LRUCachedFunction((url) => {
            let _parsed = undefined;
            let _short = undefined;
            let _medium = undefined;
            let _long = undefined;
            function getParsed() {
                if (!_parsed) {
                    _parsed = URI.parse(url);
                }
                return _parsed;
            }
            return {
                get [0 /* Verbosity.SHORT */]() {
                    if (!_short) {
                        _short = getParsed().authority;
                    }
                    return _short;
                },
                get [1 /* Verbosity.MEDIUM */]() {
                    if (!_medium) {
                        _medium = getParsed().with({ query: '', fragment: '' }).toString();
                    }
                    return _medium;
                },
                get [2 /* Verbosity.LONG */]() {
                    if (!_long) {
                        _long = getParsed().with({ fragment: '' }).toString();
                    }
                    return _long;
                }
            };
        });
        this._id = options.id;
        this._initialData = options;
        this._register(this.lifecycleService.onWillShutdown((e) => {
            if (this._model) {
                // For reloads, we simply hide / re-show the view.
                if (e.reason === 3 /* ShutdownReason.RELOAD */) {
                    void this._model.setVisible(false);
                }
                else {
                    this._model.dispose();
                    this._model = undefined;
                }
            }
        }));
    }
    get id() {
        return this._id;
    }
    get url() {
        // Use model URL if available, otherwise fall back to initial data
        return this._model ? this._model.url : this._initialData.url;
    }
    get title() {
        // Use model title if available, otherwise fall back to initial data
        return this._model ? this._model.title : this._initialData.title;
    }
    get favicon() {
        // Use model favicon if available, otherwise fall back to initial data
        return this._model ? this._model.favicon : this._initialData.favicon;
    }
    navigate(url) {
        if (this._model) {
            void this._model.loadURL(url);
        }
        else {
            // If the model isn't created yet, update the initial data so that the URL is correct when the model is created
            this._initialData = {
                id: this._id,
                url
            };
            this._onDidChangeLabel.fire();
        }
    }
    async resolve() {
        if (!this._model && !this._modelPromise) {
            this._modelPromise = (async () => {
                this._model = await this.browserViewWorkbenchService.getOrCreateBrowserViewModel(this._id);
                this._modelPromise = undefined;
                // Set up cleanup when the model is disposed
                this._register(this._model.onWillDispose(() => {
                    this._model = undefined;
                }));
                // Auto-close editor when webcontents closes
                this._register(this._model.onDidClose(() => {
                    this.dispose();
                }));
                // Listen for label-relevant changes to fire onDidChangeLabel
                this._register(this._model.onDidChangeTitle(() => this._onDidChangeLabel.fire()));
                this._register(this._model.onDidChangeFavicon(() => this._onDidChangeLabel.fire()));
                this._register(this._model.onDidChangeLoadingState(() => this._onDidChangeLabel.fire()));
                this._register(this._model.onDidNavigate(() => this._onDidChangeLabel.fire()));
                // Navigate to initial URL if provided
                if (this._initialData.url && this._model.url !== this._initialData.url) {
                    void this._model.loadURL(this._initialData.url);
                }
                return this._model;
            })();
        }
        return this._model || this._modelPromise;
    }
    get typeId() {
        return BrowserEditorInput_1.ID;
    }
    get editorId() {
        return BrowserEditorInput_1.EDITOR_ID;
    }
    get capabilities() {
        return 1024 /* EditorInputCapabilities.ForceReveal */ | 2 /* EditorInputCapabilities.Readonly */;
    }
    get resource() {
        if (this._resourceBeforeDisposal) {
            return this._resourceBeforeDisposal;
        }
        return BrowserViewUri.forId(this._id);
    }
    getIcon() {
        // Use model data if available, otherwise fall back to initial data
        if (this._model) {
            if (this._model.loading) {
                const color = this.themeService.getColorTheme().getColor(TAB_ACTIVE_FOREGROUND);
                return URI.parse('data:image/svg+xml;utf8,' + encodeURIComponent(LOADING_SPINNER_SVG(color?.toString())));
            }
            if (this._model.favicon) {
                return URI.parse(this._model.favicon);
            }
            // Model exists but no favicon yet, use default
            return Codicon.globe;
        }
        // Model not created yet, use initial data if available
        if (this._initialData.favicon) {
            return URI.parse(this._initialData.favicon);
        }
        return Codicon.globe;
    }
    getName() {
        const hasTitle = this._model ? !!this._model.title : !!this._initialData.title;
        const name = hasTitle ? this.title : this.getDescription(0 /* Verbosity.SHORT */) || BrowserEditorInput_1.DEFAULT_LABEL;
        return truncate(name, MAX_TITLE_LENGTH);
    }
    getTitle(verbosity = 1 /* Verbosity.MEDIUM */) {
        const hasTitle = this._model ? !!this._model.title : !!this._initialData.title;
        const description = this.getDescription(verbosity);
        const title = hasTitle ? `${this.title} (${description})` : description;
        return title || BrowserEditorInput_1.DEFAULT_LABEL;
    }
    getDescription(verbosity = 1 /* Verbosity.MEDIUM */) {
        return this.url && this.getURLTitles.get(this.url)[verbosity];
    }
    canReopen() {
        return true;
    }
    matches(otherInput) {
        if (super.matches(otherInput)) {
            return true;
        }
        if (otherInput instanceof BrowserEditorInput_1) {
            return this._id === otherInput._id;
        }
        // Check if it's an untyped input with a browser view resource
        if (hasKey(otherInput, { resource: true }) && otherInput.resource?.scheme === BrowserViewUri.scheme) {
            const parsed = BrowserViewUri.parse(otherInput.resource);
            if (parsed) {
                return this._id === parsed.id;
            }
        }
        return false;
    }
    /**
     * Creates a copy of this browser editor input with a new unique ID, creating an independent browser view with no linked state.
     * This is used during Copy into New Window.
     */
    copy() {
        logBrowserOpen(this.telemetryService, 'copyToNewWindow');
        return this.instantiationService.createInstance(BrowserEditorInput_1, {
            id: generateUuid(),
            url: this.url,
            title: this.title,
            favicon: this.favicon
        });
    }
    toUntyped() {
        const viewState = {
            url: this.url,
            title: this.title,
            favicon: this.favicon
        };
        return {
            resource: this.resource,
            options: {
                override: BrowserEditorInput_1.EDITOR_ID,
                viewState
            }
        };
    }
    dispose() {
        if (this._model) {
            this._resourceBeforeDisposal = this.resource;
            this._model.dispose();
            this._model = undefined;
        }
        super.dispose();
    }
    serialize() {
        return {
            id: this._id,
            url: this.url,
            title: this.title,
            favicon: this.favicon
        };
    }
};
BrowserEditorInput = BrowserEditorInput_1 = __decorate([
    __param(1, IThemeService),
    __param(2, IBrowserViewWorkbenchService),
    __param(3, ILifecycleService),
    __param(4, IInstantiationService),
    __param(5, ITelemetryService)
], BrowserEditorInput);
export { BrowserEditorInput };
export class BrowserEditorSerializer {
    canSerialize(editorInput) {
        return editorInput instanceof BrowserEditorInput;
    }
    serialize(editorInput) {
        if (!this.canSerialize(editorInput)) {
            return undefined;
        }
        return JSON.stringify(editorInput.serialize());
    }
    deserialize(instantiationService, serializedEditor) {
        try {
            const data = JSON.parse(serializedEditor);
            return instantiationService.createInstance(BrowserEditorInput, data);
        }
        catch {
            return undefined;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlckVkaXRvcklucHV0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU5RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUczRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsNEJBQTRCLEVBQXFCLE1BQU0sMEJBQTBCLENBQUM7QUFDM0YsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxpQkFBaUIsRUFBa0IsTUFBTSxpREFBaUQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDakcsT0FBTyxFQUFFLGlCQUFp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