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
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Emitter } from '../../../../base/common/event.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { URI } from '../../../../base/common/uri.js';
import { joinPath } from '../../../../base/common/resources.js';
import { FileAccess } from '../../../../base/common/network.js';
import { EXTENSION_INSTALL_DEP_PACK_CONTEXT, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { walkthroughs } from '../common/gettingStartedContent.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { parseLinkedText } from '../../../../base/common/linkedText.js';
import { walkthroughsExtensionPoint } from './gettingStartedExtensionPoint.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { dirname } from '../../../../base/common/path.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { localize, localize2 } from '../../../../nls.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { checkGlobFileExists } from '../../../services/extensions/common/workspaceContains.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { asWebviewUri } from '../../webview/common/webview.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { extensionDefaultIcon } from '../../../services/extensionManagement/common/extensionsIcons.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { GettingStartedInput } from './gettingStartedInput.js';
export const HasMultipleNewFileEntries = new RawContextKey('hasMultipleNewFileEntries', false);
export const IWalkthroughsService = createDecorator('walkthroughsService');
export const hiddenEntriesConfigurationKey = 'workbench.welcomePage.hiddenCategories';
export const walkthroughMetadataConfigurationKey = 'workbench.welcomePage.walkthroughMetadata';
const BUILT_IN_SOURCE = localize('builtin', "Built-In");
// Show walkthrough as "new" for 7 days after first install
const DAYS = 24 * 60 * 60 * 1000;
const NEW_WALKTHROUGH_TIME = 7 * DAYS;
let WalkthroughsService = class WalkthroughsService extends Disposable {
    constructor(storageService, commandService, instantiationService, workspaceContextService, contextService, userDataSyncEnablementService, configurationService, extensionManagementService, hostService, viewsService, telemetryService, tasExperimentService, layoutService, editorService) {
        super();
        this.storageService = storageService;
        this.commandService = commandService;
        this.instantiationService = instantiationService;
        this.workspaceContextService = workspaceContextService;
        this.contextService = contextService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.configurationService = configurationService;
        this.extensionManagementService = extensionManagementService;
        this.hostService = hostService;
        this.viewsService = viewsService;
        this.telemetryService = telemetryService;
        this.tasExperimentService = tasExperimentService;
        this.layoutService = layoutService;
        this.editorService = editorService;
        this._onDidAddWalkthrough = this._register(new Emitter());
        this.onDidAddWalkthrough = this._onDidAddWalkthrough.event;
        this._onDidRemoveWalkthrough = this._register(new Emitter());
        this.onDidRemoveWalkthrough = this._onDidRemoveWalkthrough.event;
        this._onDidChangeWalkthrough = this._register(new Emitter());
        this.onDidChangeWalkthrough = this._onDidChangeWalkthrough.event;
        this._onDidProgressStep = this._register(new Emitter());
        this.onDidProgressStep = this._onDidProgressStep.event;
        this.sessionEvents = new Set();
        this.completionListeners = new Map();
        this.gettingStartedContributions = new Map();
        this.steps = new Map();
        this.sessionInstalledExtensions = new Set();
        this.categoryVisibilityContextKeys = new Set();
        this.stepCompletionContextKeyExpressions = new Set();
        this.stepCompletionContextKeys = new Set();
        this.metadata = new Map(JSON.parse(this.storageService.get(walkthroughMetadataConfigurationKey, 0 /* StorageScope.PROFILE */, '[]')));
        this.memento = new Memento('gettingStartedService', this.storageService);
        this.stepProgress = this.memento.getMemento(0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.initCompletionEventListeners();
        HasMultipleNewFileEntries.bindTo(this.contextService).set(false);
        this.registerWalkthroughs();
    }
    registerWalkthroughs() {
        walkthroughs.forEach(async (category, index) => {
            this._registerWalkthrough({
                ...category,
                icon: { type: 'icon', icon: category.icon },
                order: walkthroughs.length - index,
                source: BUILT_IN_SOURCE,
                when: ContextKeyExpr.deserialize(category.when) ?? ContextKeyExpr.true(),
                steps: category.content.steps.map((step, index) => {
                    return ({
                        ...step,
                        completionEvents: step.completionEvents ?? [],
                        description: parseDescription(step.description),
                        category: category.id,
                        order: index,
                        when: ContextKeyExpr.deserialize(step.when) ?? ContextKeyExpr.true(),
                        media: step.media.type === 'image'
                            ? {
                                type: 'image',
                                altText: step.media.altText,
                                path: convertInternalMediaPathsToBrowserURIs(step.media.path)
                            }
                            : step.media.type === 'svg'
                                ? {
                                    type: 'svg',
                                    altText: step.media.altText,
                                    path: convertInternalMediaPathToFileURI(step.media.path).with({ query: JSON.stringify({ moduleId: 'vs/workbench/contrib/welcomeGettingStarted/common/media/' + step.media.path }) })
                                }
                                : step.media.type === 'markdown'
                                    ? {
                                        type: 'markdown',
                                        path: convertInternalMediaPathToFileURI(step.media.path).with({ query: JSON.stringify({ moduleId: 'vs/workbench/contrib/welcomeGettingStarted/common/media/' + step.media.path }) }),
                                        base: FileAccess.asFileUri('vs/workbench/contrib/welcomeGettingStarted/common/media/'),
                                        root: FileAccess.asFileUri('vs/workbench/contrib/welcomeGettingStarted/common/media/'),
                                    }
                                    : {
                                        type: 'video',
                                        path: convertRelativeMediaPathsToWebviewURIs(FileAccess.asFileUri('vs/workbench/contrib/welcomeGettingStarted/common/media/'), step.media.path),
                                        altText: step.media.altText,
                                        root: FileAccess.asFileUri('vs/workbench/contrib/welcomeGettingStarted/common/media/'),
                                        poster: step.media.poster ? convertRelativeMediaPathsToWebviewURIs(FileAccess.asFileUri('vs/workbench/contrib/welcomeGettingStarted/common/media/'), step.media.poster) : undefined
                                    },
                    });
                })
            });
        });
        walkthroughsExtensionPoint.setHandler((_, { added, removed }) => {
            added.map(e => this.registerExtensionWalkthroughContributions(e.description));
            removed.map(e => this.unregisterExtensionWalkthroughContributions(e.description));
        });
    }
    initCompletionEventListeners() {
        this._register(this.commandService.onDidExecuteCommand(command => this.progressByEvent(`onCommand:${command.commandId}`)));
        this.extensionManagementService.getInstalled().then(installed => {
            installed.forEach(ext => this.progressByEvent(`extensionInstalled:${ext.identifier.id.toLowerCase()}`));
        });
        this._register(this.extensionManagementService.onDidInstallExtensions((result) => {
            for (const e of result) {
                const skipWalkthrough = e?.context?.[EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT] || e?.context?.[EXTENSION_INSTALL_DEP_PACK_CONTEXT];
                // If the window had last focus and the install didn't specify to skip the walkthrough
                // Then add it to the sessionInstallExtensions to be opened
                if (!skipWalkthrough) {
                    this.sessionInstalledExtensions.add(e.identifier.id.toLowerCase());
                }
                this.progressByEvent(`extensionInstalled:${e.identifier.id.toLowerCase()}`);
            }
        }));
        this._register(this.contextService.onDidChangeContext(event => {
            if (event.affectsSome(this.stepCompletionContextKeys)) {
                this.stepCompletionContextKeyExpressions.forEach(expression => {
                    if (event.affectsSome(new Set(expression.keys())) && this.contextService.contextMatchesRules(expression)) {
                        this.progressByEvent(`onContext:` + expression.serialize());
                    }
                });
            }
        }));
        this._register(this.viewsService.onDidChangeViewVisibility(e => {
            if (e.visible) {
                this.progressByEvent('onView:' + e.id);
            }
        }));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            e.affectedKeys.forEach(key => { this.progressByEvent('onSettingChanged:' + key); });
        }));
        if (this.userDataSyncEnablementService.isEnabled()) {
            this.progressByEvent('onEvent:sync-enabled');
        }
        this._register(this.userDataSyncEnablementService.onDidChangeEnablement(() => {
            if (this.userDataSyncEnablementService.isEnabled()) {
                this.progressByEvent('onEvent:sync-enabled');
            }
        }));
    }
    markWalkthroughOpened(id) {
        const walkthrough = this.gettingStartedContributions.get(id);
        const prior = this.metadata.get(id);
        if (prior && walkthrough) {
            this.metadata.set(id, { ...prior, manaullyOpened: true, stepIDs: walkthrough.steps.map(s => s.id) });
        }
        this.storageService.store(walkthroughMetadataConfigurationKey, JSON.stringify([...this.metadata.entries()]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
    async registerExtensionWalkthroughContributions(extension) {
        const convertExtensionPathToFileURI = (path) => path.startsWith('https://')
            ? URI.parse(path, true)
            : FileAccess.uriToFileUri(joinPath(extension.extensionLocation, path));
        const convertExtensionRelativePathsToBrowserURIs = (path) => {
            const convertPath = (path) => path.startsWith('https://')
                ? URI.parse(path, true)
                : FileAccess.uriToBrowserUri(joinPath(extension.extensionLocation, path));
            if (typeof path === 'string') {
                const converted = convertPath(path);
                return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
            }
            else {
                return {
                    hcDark: convertPath(path.hc),
                    hcLight: convertPath(path.hcLight ?? path.light),
                    light: convertPath(path.light),
                    dark: convertPath(path.dark)
                };
            }
        };
        if (!(extension.contributes?.walkthroughs?.length)) {
            return;
        }
        let sectionToOpen;
        let sectionToOpenIndex = Math.min(); // '+Infinity';
        await Promise.all(extension.contributes?.walkthroughs?.map(async (walkthrough, index) => {
            const categoryID = extension.identifier.value + '#' + walkthrough.id;
            const isNewlyInstalled = !this.metadata.get(categoryID);
            if (isNewlyInstalled) {
                this.metadata.set(categoryID, { firstSeen: +new Date(), stepIDs: walkthrough.steps?.map(s => s.id) ?? [], manaullyOpened: false });
            }
            const override = await Promise.race([
                this.tasExperimentService?.getTreatment(`gettingStarted.overrideCategory.${extension.identifier.value + '.' + walkthrough.id}.when`),
                new Promise(resolve => setTimeout(() => resolve(walkthrough.when), 5000))
            ]);
            if (this.sessionInstalledExtensions.has(extension.identifier.value.toLowerCase())
                && this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(override ?? walkthrough.when) ?? ContextKeyExpr.true())) {
                this.sessionInstalledExtensions.delete(extension.identifier.value.toLowerCase());
                if (index < sectionToOpenIndex && isNewlyInstalled) {
                    sectionToOpen = categoryID;
                    sectionToOpenIndex = index;
                }
            }
            const steps = (walkthrough.steps ?? []).map((step, index) => {
                const description = parseDescription(step.description || '');
                const fullyQualifiedID = extension.identifier.value + '#' + walkthrough.id + '#' + step.id;
                let media;
                if (!step.media) {
                    throw Error('missing media in walkthrough step: ' + walkthrough.id + '@' + step.id);
                }
                if (step.media.image) {
                    const altText = step.media.altText;
                    if (altText === undefined) {
                        console.error('Walkthrough item:', fullyQualifiedID, 'is missing altText for its media element.');
                    }
                    media = { type: 'image', altText, path: convertExtensionRelativePathsToBrowserURIs(step.media.image) };
                }
                else if (step.media.markdown) {
                    media = {
                        type: 'markdown',
                        path: convertExtensionPathToFileURI(step.media.markdown),
                        base: convertExtensionPathToFileURI(dirname(step.media.markdown)),
                        root: FileAccess.uriToFileUri(extension.extensionLocation),
                    };
                }
                else if (step.media.svg) {
                    media = {
                        type: 'svg',
                        path: convertExtensionPathToFileURI(step.media.svg),
                        altText: step.media.svg,
                    };
                }
                else if (step.media.video) {
                    const baseURI = FileAccess.uriToFileUri(extension.extensionLocation);
                    media = {
                        type: 'video',
                        path: convertRelativeMediaPathsToWebviewURIs(baseURI, step.media.video),
                        root: FileAccess.uriToFileUri(extension.extensionLocation),
                        altText: step.media.altText,
                        poster: step.media.poster ? convertRelativeMediaPathsToWebviewURIs(baseURI, step.media.poster) : undefined
                    };
                }
                // Throw error for unknown walkthrough format
                else {
                    throw new Error('Unknown walkthrough format detected for ' + fullyQualifiedID);
                }
                return ({
                    description,
                    media,
                    completionEvents: step.completionEvents?.filter(x => typeof x === 'string') ?? [],
                    id: fullyQualifiedID,
                    title: step.title,
                    when: ContextKeyExpr.deserialize(step.when) ?? ContextKeyExpr.true(),
                    category: categoryID,
                    order: index,
                });
            });
            let isFeatured = false;
            if (walkthrough.featuredFor) {
                const folders = this.workspaceContextService.getWorkspace().folders.map(f => f.uri);
                const token = new CancellationTokenSource();
                setTimeout(() => token.cancel(), 2000);
                isFeatured = await this.instantiationService.invokeFunction(a => checkGlobFileExists(a, folders, walkthrough.featuredFor, token.token));
            }
            const iconStr = walkthrough.icon ?? extension.icon;
            const walkthoughDescriptor = {
                description: walkthrough.description,
                title: walkthrough.title,
                id: categoryID,
                isFeatured,
                source: extension.displayName ?? extension.name,
                order: 0,
                walkthroughPageTitle: extension.displayName ?? extension.name,
                steps,
                icon: iconStr ? {
                    type: 'image',
                    path: FileAccess.uriToBrowserUri(joinPath(extension.extensionLocation, iconStr)).toString(true)
                } : {
                    icon: extensionDefaultIcon,
                    type: 'icon'
                },
                when: ContextKeyExpr.deserialize(override ?? walkthrough.when) ?? ContextKeyExpr.true(),
            };
            this._registerWalkthrough(walkthoughDescriptor);
            this._onDidAddWalkthrough.fire(this.resolveWalkthrough(walkthoughDescriptor));
        }));
        this.storageService.store(walkthroughMetadataConfigurationKey, JSON.stringify([...this.metadata.entries()]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        const hadLastFoucs = await this.hostService.hadLastFocus();
        const startupEditor = this.configurationService.getValue('workbench.startupEditor');
        if (hadLastFoucs && sectionToOpen && this.configurationService.getValue('workbench.welcomePage.walkthroughs.openOnInstall') && startupEditor !== 'agentSessionsWelcomePage') {
            this.telemetryService.publicLog2('gettingStarted.didAutoOpenWalkthrough', { id: sectionToOpen });
            const activeEditor = this.editorService.activeEditor;
            if (activeEditor instanceof GettingStartedInput) {
                this.commandService.executeCommand('workbench.action.keepEditor');
            }
            this.commandService.executeCommand('workbench.action.openWalkthrough', sectionToOpen, {
                inactive: this.layoutService.hasFocus("workbench.parts.editor" /* Parts.EDITOR_PART */) // do not steal the active editor away
            });
        }
    }
    unregisterExtensionWalkthroughContributions(extension) {
        if (!(extension.contributes?.walkthroughs?.length)) {
            return;
        }
        extension.contributes?.walkthroughs?.forEach(section => {
            const categoryID = extension.identifier.value + '#' + section.id;
            section.steps.forEach(step => {
                const fullyQualifiedID = extension.identifier.value + '#' + section.id + '#' + step.id;
                this.steps.delete(fullyQualifiedID);
            });
            this.gettingStartedContributions.delete(categoryID);
            this._onDidRemoveWalkthrough.fire(categoryID);
        });
    }
    getWalkthrough(id) {
        const walkthrough = this.gettingStartedContributions.get(id);
        if (!walkthrough) {
            throw Error('Trying to get unknown walkthrough: ' + id);
        }
        return this.resolveWalkthrough(walkthrough);
    }
    getWalkthroughs() {
        const registeredCategories = [...this.gettingStartedContributions.values()];
        const categoriesWithCompletion = registeredCategories
            .map(category => {
            return {
                ...category,
                content: {
                    type: 'steps',
                    steps: category.steps
                }
            };
        })
            .filter(category => category.content.type !== 'steps' || category.content.steps.length)
            .filter(category => category.id !== 'NewWelcomeExperience')
            .map(category => this.resolveWalkthrough(category));
        return categoriesWithCompletion;
    }
    resolveWalkthrough(category) {
        const stepsWithProgress = category.steps.map(step => this.getStepProgress(step));
        const hasOpened = this.metadata.get(category.id)?.manaullyOpened;
        const firstSeenDate = this.metadata.get(category.id)?.firstSeen;
        const isNew = firstSeenDate && firstSeenDate > (+new Date() - NEW_WALKTHROUGH_TIME);
        const lastStepIDs = this.metadata.get(category.id)?.stepIDs;
        const rawCategory = this.gettingStartedContributions.get(category.id);
        if (!rawCategory) {
            throw Error('Could not find walkthrough with id ' + category.id);
        }
        const currentStepIds = rawCategory.steps.map(s => s.id);
        const hasNewSteps = lastStepIDs && (currentStepIds.length !== lastStepIDs.length || currentStepIds.some((id, index) => id !== lastStepIDs[index]));
        let recencyBonus = 0;
        if (firstSeenDate) {
            const currentDate = +new Date();
            const timeSinceFirstSeen = currentDate - firstSeenDate;
            recencyBonus = Math.max(0, (NEW_WALKTHROUGH_TIME - timeSinceFirstSeen) / NEW_WALKTHROUGH_TIME);
        }
        return {
            ...category,
            recencyBonus,
            steps: stepsWithProgress,
            newItems: !!hasNewSteps,
            newEntry: !!(isNew && !hasOpened),
        };
    }
    getStepProgress(step) {
        return {
            ...step,
            done: false,
            ...this.stepProgress[step.id]
        };
    }
    progressStep(id) {
        const oldProgress = this.stepProgress[id];
        if (!oldProgress || oldProgress.done !== true) {
            this.stepProgress[id] = { done: true };
            this.memento.saveMemento();
            const step = this.getStep(id);
            if (!step) {
                throw Error('Tried to progress unknown step');
            }
            this._onDidProgressStep.fire(this.getStepProgress(step));
        }
    }
    deprogressStep(id) {
        delete this.stepProgress[id];
        this.memento.saveMemento();
        const step = this.getStep(id);
        this._onDidProgressStep.fire(this.getStepProgress(step));
    }
    progressByEvent(event) {
        if (this.sessionEvents.has(event)) {
            return;
        }
        this.sessionEvents.add(event);
        this.completionListeners.get(event)?.forEach(id => this.progressStep(id));
    }
    registerWalkthrough(walkthoughDescriptor) {
        this._registerWalkthrough({
            ...walkthoughDescriptor,
            steps: walkthoughDescriptor.steps.map(step => ({ ...step, description: parseDescription(step.description) }))
        });
    }
    _registerWalkthrough(walkthroughDescriptor) {
        const oldCategory = this.gettingStartedContributions.get(walkthroughDescriptor.id);
        if (oldCategory) {
            console.error(`Skipping attempt to overwrite walkthrough. (${walkthroughDescriptor.id})`);
            return;
        }
        this.gettingStartedContributions.set(walkthroughDescriptor.id, walkthroughDescriptor);
        walkthroughDescriptor.steps.forEach(step => {
            if (this.steps.has(step.id)) {
                throw Error('Attempting to register step with id ' + step.id + ' twice. Second is dropped.');
            }
            this.steps.set(step.id, step);
            step.when.keys().forEach(key => this.categoryVisibilityContextKeys.add(key));
            this.registerDoneListeners(step);
        });
        walkthroughDescriptor.when.keys().forEach(key => this.categoryVisibilityContextKeys.add(key));
    }
    registerDoneListeners(step) {
        // eslint-disable-next-line local/code-no-any-casts
        if (step.doneOn) {
            console.error(`wakthrough step`, step, `uses deprecated 'doneOn' property. Adopt 'completionEvents' to silence this warning`);
            return;
        }
        if (!step.completionEvents.length) {
            step.completionEvents = coalesce(step.description
                .filter(linkedText => linkedText.nodes.length === 1) // only buttons
                .flatMap(linkedText => linkedText.nodes
                .filter(((node) => typeof node !== 'string'))
                .map(({ href }) => {
                if (href.startsWith('command:')) {
                    return 'onCommand:' + href.slice('command:'.length, href.includes('?') ? href.indexOf('?') : undefined);
                }
                if (href.startsWith('https://') || href.startsWith('http://')) {
                    return 'onLink:' + href;
                }
                return undefined;
            })));
        }
        if (!step.completionEvents.length) {
            step.completionEvents.push('stepSelected');
        }
        for (let event of step.completionEvents) {
            const [_, eventType, argument] = /^([^:]*):?(.*)$/.exec(event) ?? [];
            if (!eventType) {
                console.error(`Unknown completionEvent ${event} when registering step ${step.id}`);
                continue;
            }
            switch (eventType) {
                case 'onLink':
                case 'onEvent':
                case 'onView':
                case 'onSettingChanged':
                    break;
                case 'onContext': {
                    const expression = ContextKeyExpr.deserialize(argument);
                    if (expression) {
                        this.stepCompletionContextKeyExpressions.add(expression);
                        expression.keys().forEach(key => this.stepCompletionContextKeys.add(key));
                        event = eventType + ':' + expression.serialize();
                        if (this.contextService.contextMatchesRules(expression)) {
                            this.sessionEvents.add(event);
                        }
                    }
                    else {
                        console.error('Unable to parse context key expression:', expression, 'in walkthrough step', step.id);
                    }
                    break;
                }
                case 'onStepSelected':
                case 'stepSelected':
                    event = 'stepSelected:' + step.id;
                    break;
                case 'onCommand':
                    event = eventType + ':' + argument.replace(/^toSide:/, '');
                    break;
                case 'onExtensionInstalled':
                case 'extensionInstalled':
                    event = 'extensionInstalled:' + argument.toLowerCase();
                    break;
                default:
                    console.error(`Unknown completionEvent ${event} when registering step ${step.id}`);
                    continue;
            }
            this.registerCompletionListener(event, step);
        }
    }
    registerCompletionListener(event, step) {
        if (!this.completionListeners.has(event)) {
            this.completionListeners.set(event, new Set());
        }
        this.completionListeners.get(event)?.add(step.id);
    }
    getStep(id) {
        const step = this.steps.get(id);
        if (!step) {
            throw Error('Attempting to access step which does not exist in registry ' + id);
        }
        return step;
    }
};
WalkthroughsService = __decorate([
    __param(0, IStorageService),
    __param(1, ICommandService),
    __param(2, IInstantiationService),
    __param(3, IWorkspaceContextService),
    __param(4, IContextKeyService),
    __param(5, IUserDataSyncEnablementService),
    __param(6, IConfigurationService),
    __param(7, IExtensionManagementService),
    __param(8, IHostService),
    __param(9, IViewsService),
    __param(10, ITelemetryService),
    __param(11, IWorkbenchAssignmentService),
    __param(12, IWorkbenchLayoutService),
    __param(13, IEditorService)
], WalkthroughsService);
export { WalkthroughsService };
export const parseDescription = (desc) => desc.split('\n').filter(x => x).map(text => parseLinkedText(text));
export const convertInternalMediaPathToFileURI = (path) => path.startsWith('https://')
    ? URI.parse(path, true)
    : FileAccess.asFileUri(`vs/workbench/contrib/welcomeGettingStarted/common/media/${path}`);
const convertInternalMediaPathToBrowserURI = (path) => path.startsWith('https://')
    ? URI.parse(path, true)
    : FileAccess.asBrowserUri(`vs/workbench/contrib/welcomeGettingStarted/common/media/${path}`);
const convertInternalMediaPathsToBrowserURIs = (path) => {
    if (typeof path === 'string') {
        const converted = convertInternalMediaPathToBrowserURI(path);
        return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
    }
    else {
        return {
            hcDark: convertInternalMediaPathToBrowserURI(path.hc),
            hcLight: convertInternalMediaPathToBrowserURI(path.hcLight ?? path.light),
            light: convertInternalMediaPathToBrowserURI(path.light),
            dark: convertInternalMediaPathToBrowserURI(path.dark)
        };
    }
};
const convertRelativeMediaPathsToWebviewURIs = (basePath, path) => {
    const convertPath = (path) => path.startsWith('https://')
        ? URI.parse(path, true)
        : asWebviewUri(joinPath(basePath, path));
    if (typeof path === 'string') {
        const converted = convertPath(path);
        return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
    }
    else {
        return {
            hcDark: convertPath(path.hc),
            hcLight: convertPath(path.hcLight ?? path.light),
            light: convertPath(path.light),
            dark: convertPath(path.dark)
        };
    }
};
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'resetGettingStartedProgress',
            category: localize2('developer', "Developer"),
            title: localize2('resetWelcomePageWalkthroughProgress', "Reset Welcome Page Walkthrough Progress"),
            f1: true,
            metadata: {
                description: localize2('resetGettingStartedProgressDescription', 'Reset the progress of all Walkthrough steps on the Welcome Page to make them appear as if they are being viewed for the first time, providing a fresh start to the getting started experience.'),
            }
        });
    }
    run(accessor) {
        const gettingStartedService = accessor.get(IWalkthroughsService);
        const storageService = accessor.get(IStorageService);
        storageService.store(hiddenEntriesConfigurationKey, JSON.stringify([]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        storageService.store(walkthroughMetadataConfigurationKey, JSON.stringify([]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        const memento = new Memento('gettingStartedService', accessor.get(IStorageService));
        const record = memento.getMemento(0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        for (const key in record) {
            if (Object.prototype.hasOwnProperty.call(record, key)) {
                try {
                    gettingStartedService.deprogressStep(key);
                }
                catch (e) {
                    console.error(e);
                }
            }
        }
        memento.saveMemento();
    }
});
registerSingleton(IWalkthroughsService, WalkthroughsService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUdldHRpbmdTdGFydGVkL2Jyb3dzZXIvZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDdEksT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxjQUFjLEVBQXdCLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQy9JLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUUxRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsMENBQTBDLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUVyTSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1B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