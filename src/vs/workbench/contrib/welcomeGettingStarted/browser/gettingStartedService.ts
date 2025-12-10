/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { URI } from '../../../../base/common/uri.js';
import { joinPath } from '../../../../base/common/resources.js';
import { FileAccess } from '../../../../base/common/network.js';
import { EXTENSION_INSTALL_DEP_PACK_CONTEXT, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { walkthroughs } from '../common/gettingStartedContent.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILink, LinkedText, parseLinkedText } from '../../../../base/common/linkedText.js';
import { walkthroughsExtensionPoint } from './gettingStartedExtensionPoint.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { dirname } from '../../../../base/common/path.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { localize, localize2 } from '../../../../nls.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { checkGlobFileExists } from '../../../services/extensions/common/workspaceContains.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { asWebviewUri } from '../../webview/common/webview.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { extensionDefaultIcon } from '../../../services/extensionManagement/common/extensionsIcons.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { GettingStartedInput } from './gettingStartedInput.js';

export const HasMultipleNewFileEntries = new RawContextKey<boolean>('hasMultipleNewFileEntries', false);

export const IWalkthroughsService = createDecorator<IWalkthroughsService>('walkthroughsService');

export const hiddenEntriesConfigurationKey = 'workbench.welcomePage.hiddenCategories';

export const walkthroughMetadataConfigurationKey = 'workbench.welcomePage.walkthroughMetadata';
export type WalkthroughMetaDataType = Map<string, { firstSeen: number; stepIDs: string[]; manaullyOpened: boolean }>;

const BUILT_IN_SOURCE = localize('builtin', "Built-In");

export interface IWalkthrough {
	id: string;
	title: string;
	description: string;
	order: number;
	source: string;
	isFeatured: boolean;
	next?: string;
	when: ContextKeyExpression;
	steps: IWalkthroughStep[];
	icon:
	| { type: 'icon'; icon: ThemeIcon }
	| { type: 'image'; path: string };
	walkthroughPageTitle: string;
}

export type IWalkthroughLoose = Omit<IWalkthrough, 'steps'> & { steps: (Omit<IWalkthroughStep, 'description'> & { description: string })[] };

export interface IResolvedWalkthrough extends IWalkthrough {
	steps: IResolvedWalkthroughStep[];
	newItems: boolean;
	recencyBonus: number;
	newEntry: boolean;
}

export interface IWalkthroughStep {
	id: string;
	title: string;
	description: LinkedText[];
	category: string;
	when: ContextKeyExpression;
	order: number;
	completionEvents: string[];
	media:
	| { type: 'image'; path: { hcDark: URI; hcLight: URI; light: URI; dark: URI }; altText: string }
	| { type: 'svg'; path: URI; altText: string }
	| { type: 'markdown'; path: URI; base: URI; root: URI }
	| { type: 'video'; path: { hcDark: URI; hcLight: URI; light: URI; dark: URI }; poster?: { hcDark: URI; hcLight: URI; light: URI; dark: URI }; root: URI; altText: string };
}

type StepProgress = { done: boolean };

export interface IResolvedWalkthroughStep extends IWalkthroughStep, StepProgress { }

export interface IWalkthroughsService {
	_serviceBrand: undefined;

	readonly onDidAddWalkthrough: Event<IResolvedWalkthrough>;
	readonly onDidRemoveWalkthrough: Event<string>;
	readonly onDidChangeWalkthrough: Event<IResolvedWalkthrough>;
	readonly onDidProgressStep: Event<IResolvedWalkthroughStep>;

	getWalkthroughs(): IResolvedWalkthrough[];
	getWalkthrough(id: string): IResolvedWalkthrough;

	registerWalkthrough(descriptor: IWalkthroughLoose): void;

	progressByEvent(eventName: string): void;
	progressStep(id: string): void;
	deprogressStep(id: string): void;

	markWalkthroughOpened(id: string): void;
}

// Show walkthrough as "new" for 7 days after first install
const DAYS = 24 * 60 * 60 * 1000;
const NEW_WALKTHROUGH_TIME = 7 * DAYS;

export class WalkthroughsService extends Disposable implements IWalkthroughsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAddWalkthrough = new Emitter<IResolvedWalkthrough>();
	readonly onDidAddWalkthrough: Event<IResolvedWalkthrough> = this._onDidAddWalkthrough.event;
	private readonly _onDidRemoveWalkthrough = new Emitter<string>();
	readonly onDidRemoveWalkthrough: Event<string> = this._onDidRemoveWalkthrough.event;
	private readonly _onDidChangeWalkthrough = new Emitter<IResolvedWalkthrough>();
	readonly onDidChangeWalkthrough: Event<IResolvedWalkthrough> = this._onDidChangeWalkthrough.event;
	private readonly _onDidProgressStep = new Emitter<IResolvedWalkthroughStep>();
	readonly onDidProgressStep: Event<IResolvedWalkthroughStep> = this._onDidProgressStep.event;

	private memento: Memento<Record<string, StepProgress | undefined>>;
	private stepProgress: Record<string, StepProgress | undefined>;

	private sessionEvents = new Set<string>();
	private completionListeners = new Map<string, Set<string>>();

	private gettingStartedContributions = new Map<string, IWalkthrough>();
	private steps = new Map<string, IWalkthroughStep>();

	private sessionInstalledExtensions: Set<string> = new Set<string>();

	private categoryVisibilityContextKeys = new Set<string>();
	private stepCompletionContextKeyExpressions = new Set<ContextKeyExpression>();
	private stepCompletionContextKeys = new Set<string>();

	private metadata: WalkthroughMetaDataType;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextService: IContextKeyService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IHostService private readonly hostService: IHostService,
		@IViewsService private readonly viewsService: IViewsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkbenchAssignmentService private readonly tasExperimentService: IWorkbenchAssignmentService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();

		this.metadata = new Map(
			JSON.parse(
				this.storageService.get(walkthroughMetadataConfigurationKey, StorageScope.PROFILE, '[]')));

		this.memento = new Memento('gettingStartedService', this.storageService);
		this.stepProgress = this.memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);

		this.initCompletionEventListeners();

		HasMultipleNewFileEntries.bindTo(this.contextService).set(false);
		this.registerWalkthroughs();

	}

	private registerWalkthroughs() {

		walkthroughs.forEach(async (category, index) => {

			this._registerWalkthrough({
				...category,
				icon: { type: 'icon', icon: category.icon },
				order: walkthroughs.length - index,
				source: BUILT_IN_SOURCE,
				when: ContextKeyExpr.deserialize(category.when) ?? ContextKeyExpr.true(),
				steps:
					category.content.steps.map((step, index) => {
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

	private initCompletionEventListeners() {
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
			if (e.visible) { this.progressByEvent('onView:' + e.id); }
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			e.affectedKeys.forEach(key => { this.progressByEvent('onSettingChanged:' + key); });
		}));

		if (this.userDataSyncEnablementService.isEnabled()) { this.progressByEvent('onEvent:sync-enabled'); }
		this._register(this.userDataSyncEnablementService.onDidChangeEnablement(() => {
			if (this.userDataSyncEnablementService.isEnabled()) { this.progressByEvent('onEvent:sync-enabled'); }
		}));
	}

	markWalkthroughOpened(id: string) {
		const walkthrough = this.gettingStartedContributions.get(id);
		const prior = this.metadata.get(id);
		if (prior && walkthrough) {
			this.metadata.set(id, { ...prior, manaullyOpened: true, stepIDs: walkthrough.steps.map(s => s.id) });
		}

		this.storageService.store(walkthroughMetadataConfigurationKey, JSON.stringify([...this.metadata.entries()]), StorageScope.PROFILE, StorageTarget.USER);
	}

	private async registerExtensionWalkthroughContributions(extension: IExtensionDescription) {
		const convertExtensionPathToFileURI = (path: string) => path.startsWith('https://')
			? URI.parse(path, true)
			: FileAccess.uriToFileUri(joinPath(extension.extensionLocation, path));

		const convertExtensionRelativePathsToBrowserURIs = (path: string | { hc: string; hcLight?: string; dark: string; light: string }): { hcDark: URI; hcLight: URI; dark: URI; light: URI } => {
			const convertPath = (path: string) => path.startsWith('https://')
				? URI.parse(path, true)
				: FileAccess.uriToBrowserUri(joinPath(extension.extensionLocation, path));

			if (typeof path === 'string') {
				const converted = convertPath(path);
				return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
			} else {
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

		let sectionToOpen: string | undefined;
		let sectionToOpenIndex = Math.min(); // '+Infinity';
		await Promise.all(extension.contributes?.walkthroughs?.map(async (walkthrough, index) => {
			const categoryID = extension.identifier.value + '#' + walkthrough.id;

			const isNewlyInstalled = !this.metadata.get(categoryID);
			if (isNewlyInstalled) {
				this.metadata.set(categoryID, { firstSeen: +new Date(), stepIDs: walkthrough.steps?.map(s => s.id) ?? [], manaullyOpened: false });
			}

			const override = await Promise.race([
				this.tasExperimentService?.getTreatment<string>(`gettingStarted.overrideCategory.${extension.identifier.value + '.' + walkthrough.id}.when`),
				new Promise<string | undefined>(resolve => setTimeout(() => resolve(walkthrough.when), 5000))
			]);

			if (this.sessionInstalledExtensions.has(extension.identifier.value.toLowerCase())
				&& this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(override ?? walkthrough.when) ?? ContextKeyExpr.true())
			) {
				this.sessionInstalledExtensions.delete(extension.identifier.value.toLowerCase());
				if (index < sectionToOpenIndex && isNewlyInstalled) {
					sectionToOpen = categoryID;
					sectionToOpenIndex = index;
				}
			}

			const steps = (walkthrough.steps ?? []).map((step, index) => {
				const description = parseDescription(step.description || '');
				const fullyQualifiedID = extension.identifier.value + '#' + walkthrough.id + '#' + step.id;

				let media: IWalkthroughStep['media'];

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
				isFeatured = await this.instantiationService.invokeFunction(a => checkGlobFileExists(a, folders, walkthrough.featuredFor!, token.token));
			}

			const iconStr = walkthrough.icon ?? extension.icon;
			const walkthoughDescriptor: IWalkthrough = {
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
			} as const;

			this._registerWalkthrough(walkthoughDescriptor);

			this._onDidAddWalkthrough.fire(this.resolveWalkthrough(walkthoughDescriptor));
		}));

		this.storageService.store(walkthroughMetadataConfigurationKey, JSON.stringify([...this.metadata.entries()]), StorageScope.PROFILE, StorageTarget.USER);

		const hadLastFoucs = await this.hostService.hadLastFocus();
		if (hadLastFoucs && sectionToOpen && this.configurationService.getValue<string>('workbench.welcomePage.walkthroughs.openOnInstall')) {
			type GettingStartedAutoOpenClassification = {
				owner: 'lramos15';
				comment: 'When a walkthrough is opened upon extension installation';
				id: {
					classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight';
					owner: 'lramos15';
					comment: 'Used to understand what walkthroughs are consulted most frequently';
				};
			};
			type GettingStartedAutoOpenEvent = {
				id: string;
			};
			this.telemetryService.publicLog2<GettingStartedAutoOpenEvent, GettingStartedAutoOpenClassification>('gettingStarted.didAutoOpenWalkthrough', { id: sectionToOpen });
			const activeEditor = this.editorService.activeEditor;
			if (activeEditor instanceof GettingStartedInput) {
				this.commandService.executeCommand('workbench.action.keepEditor');
			}
			this.commandService.executeCommand('workbench.action.openWalkthrough', sectionToOpen, {
				inactive: this.layoutService.hasFocus(Parts.EDITOR_PART) // do not steal the active editor away
			});
		}
	}

	private unregisterExtensionWalkthroughContributions(extension: IExtensionDescription) {
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

	getWalkthrough(id: string): IResolvedWalkthrough {

		const walkthrough = this.gettingStartedContributions.get(id);
		if (!walkthrough) { throw Error('Trying to get unknown walkthrough: ' + id); }
		return this.resolveWalkthrough(walkthrough);
	}

	getWalkthroughs(): IResolvedWalkthrough[] {

		const registeredCategories = [...this.gettingStartedContributions.values()];
		const categoriesWithCompletion = registeredCategories
			.map(category => {
				return {
					...category,
					content: {
						type: 'steps' as const,
						steps: category.steps
					}
				};
			})
			.filter(category => category.content.type !== 'steps' || category.content.steps.length)
			.filter(category => category.id !== 'NewWelcomeExperience')
			.map(category => this.resolveWalkthrough(category));

		return categoriesWithCompletion;
	}

	private resolveWalkthrough(category: IWalkthrough): IResolvedWalkthrough {

		const stepsWithProgress = category.steps.map(step => this.getStepProgress(step));

		const hasOpened = this.metadata.get(category.id)?.manaullyOpened;
		const firstSeenDate = this.metadata.get(category.id)?.firstSeen;
		const isNew = firstSeenDate && firstSeenDate > (+new Date() - NEW_WALKTHROUGH_TIME);

		const lastStepIDs = this.metadata.get(category.id)?.stepIDs;
		const rawCategory = this.gettingStartedContributions.get(category.id);
		if (!rawCategory) { throw Error('Could not find walkthrough with id ' + category.id); }

		const currentStepIds: string[] = rawCategory.steps.map(s => s.id);

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

	private getStepProgress(step: IWalkthroughStep): IResolvedWalkthroughStep {
		return {
			...step,
			done: false,
			...this.stepProgress[step.id]
		};
	}

	progressStep(id: string) {
		const oldProgress = this.stepProgress[id];
		if (!oldProgress || oldProgress.done !== true) {
			this.stepProgress[id] = { done: true };
			this.memento.saveMemento();
			const step = this.getStep(id);
			if (!step) { throw Error('Tried to progress unknown step'); }

			this._onDidProgressStep.fire(this.getStepProgress(step));
		}
	}

	deprogressStep(id: string) {
		delete this.stepProgress[id];
		this.memento.saveMemento();
		const step = this.getStep(id);
		this._onDidProgressStep.fire(this.getStepProgress(step));
	}

	progressByEvent(event: string): void {
		if (this.sessionEvents.has(event)) { return; }

		this.sessionEvents.add(event);
		this.completionListeners.get(event)?.forEach(id => this.progressStep(id));
	}

	registerWalkthrough(walkthoughDescriptor: IWalkthroughLoose) {
		this._registerWalkthrough({
			...walkthoughDescriptor,
			steps: walkthoughDescriptor.steps.map(step => ({ ...step, description: parseDescription(step.description) }))
		});
	}

	_registerWalkthrough(walkthroughDescriptor: IWalkthrough): void {
		const oldCategory = this.gettingStartedContributions.get(walkthroughDescriptor.id);
		if (oldCategory) {
			console.error(`Skipping attempt to overwrite walkthrough. (${walkthroughDescriptor.id})`);
			return;
		}

		this.gettingStartedContributions.set(walkthroughDescriptor.id, walkthroughDescriptor);

		walkthroughDescriptor.steps.forEach(step => {
			if (this.steps.has(step.id)) { throw Error('Attempting to register step with id ' + step.id + ' twice. Second is dropped.'); }
			this.steps.set(step.id, step);
			step.when.keys().forEach(key => this.categoryVisibilityContextKeys.add(key));
			this.registerDoneListeners(step);
		});

		walkthroughDescriptor.when.keys().forEach(key => this.categoryVisibilityContextKeys.add(key));
	}

	private registerDoneListeners(step: IWalkthroughStep) {
		// eslint-disable-next-line local/code-no-any-casts
		if ((step as any).doneOn) {
			console.error(`wakthrough step`, step, `uses deprecated 'doneOn' property. Adopt 'completionEvents' to silence this warning`);
			return;
		}

		if (!step.completionEvents.length) {
			step.completionEvents = coalesce(
				step.description
					.filter(linkedText => linkedText.nodes.length === 1) // only buttons
					.flatMap(linkedText =>
						linkedText.nodes
							.filter(((node): node is ILink => typeof node !== 'string'))
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
				case 'onLink': case 'onEvent': case 'onView': case 'onSettingChanged':
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
					} else {
						console.error('Unable to parse context key expression:', expression, 'in walkthrough step', step.id);
					}
					break;
				}
				case 'onStepSelected': case 'stepSelected':
					event = 'stepSelected:' + step.id;
					break;
				case 'onCommand':
					event = eventType + ':' + argument.replace(/^toSide:/, '');
					break;
				case 'onExtensionInstalled': case 'extensionInstalled':
					event = 'extensionInstalled:' + argument.toLowerCase();
					break;
				default:
					console.error(`Unknown completionEvent ${event} when registering step ${step.id}`);
					continue;
			}

			this.registerCompletionListener(event, step);
		}
	}

	private registerCompletionListener(event: string, step: IWalkthroughStep) {
		if (!this.completionListeners.has(event)) {
			this.completionListeners.set(event, new Set());
		}
		this.completionListeners.get(event)?.add(step.id);
	}

	private getStep(id: string): IWalkthroughStep {
		const step = this.steps.get(id);
		if (!step) { throw Error('Attempting to access step which does not exist in registry ' + id); }
		return step;
	}
}

export const parseDescription = (desc: string): LinkedText[] => desc.split('\n').filter(x => x).map(text => parseLinkedText(text));

export const convertInternalMediaPathToFileURI = (path: string) => path.startsWith('https://')
	? URI.parse(path, true)
	: FileAccess.asFileUri(`vs/workbench/contrib/welcomeGettingStarted/common/media/${path}`);

const convertInternalMediaPathToBrowserURI = (path: string) => path.startsWith('https://')
	? URI.parse(path, true)
	: FileAccess.asBrowserUri(`vs/workbench/contrib/welcomeGettingStarted/common/media/${path}`);
const convertInternalMediaPathsToBrowserURIs = (path: string | { hc: string; hcLight?: string; dark: string; light: string }): { hcDark: URI; hcLight: URI; dark: URI; light: URI } => {
	if (typeof path === 'string') {
		const converted = convertInternalMediaPathToBrowserURI(path);
		return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
	} else {
		return {
			hcDark: convertInternalMediaPathToBrowserURI(path.hc),
			hcLight: convertInternalMediaPathToBrowserURI(path.hcLight ?? path.light),
			light: convertInternalMediaPathToBrowserURI(path.light),
			dark: convertInternalMediaPathToBrowserURI(path.dark)
		};
	}
};

const convertRelativeMediaPathsToWebviewURIs = (basePath: URI, path: string | { hc: string; hcLight?: string; dark: string; light: string }): { hcDark: URI; hcLight: URI; dark: URI; light: URI } => {
	const convertPath = (path: string) => path.startsWith('https://')
		? URI.parse(path, true)
		: asWebviewUri(joinPath(basePath, path));

	if (typeof path === 'string') {
		const converted = convertPath(path);
		return { hcDark: converted, hcLight: converted, dark: converted, light: converted };
	} else {
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

	run(accessor: ServicesAccessor) {
		const gettingStartedService = accessor.get(IWalkthroughsService);
		const storageService = accessor.get(IStorageService);

		storageService.store(
			hiddenEntriesConfigurationKey,
			JSON.stringify([]),
			StorageScope.PROFILE,
			StorageTarget.USER);

		storageService.store(
			walkthroughMetadataConfigurationKey,
			JSON.stringify([]),
			StorageScope.PROFILE,
			StorageTarget.USER);

		const memento = new Memento('gettingStartedService', accessor.get(IStorageService));
		const record = memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);
		for (const key in record) {
			if (Object.prototype.hasOwnProperty.call(record, key)) {
				try {
					gettingStartedService.deprogressStep(key);
				} catch (e) {
					console.error(e);
				}
			}
		}
		memento.saveMemento();
	}
});

registerSingleton(IWalkthroughsService, WalkthroughsService, InstantiationType.Delayed);
