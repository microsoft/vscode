/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ContextSizeConfigKey } from '../../../../../platform/agentHost/common/agentModelConfiguration.js';
import { IAgentModelRouterRoute } from '../../../../../platform/agentHost/common/meta/agentModelMeta.js';
import { IModelRouter, isRoutableModel, ModelRouterContextSize, ModelRouterDiagnosticSeverity, ModelRouterEffortLevel, modelRouterFile, modelRouterNameFromDisplayName, modelRouterNameFromFileName, modelRouterNameFromModelId, ModelRouterSwitching, parseModelRouter, userModelRouterFolder, withModelRouterSwitching, writeModelRouter } from '../../../../../platform/agentHost/common/modelRouter.js';
import { ReasoningEffortConfigKey, reasoningEffortLevels } from '../../../../../platform/agentHost/common/reasoningEffort.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { customizationSearchMatchesAny } from '../../common/aiCustomizationSearch.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../common/languageModels.js';

/** A model router as the agent lists it among its models. */
export interface IModelRouterItem {
	readonly id: string;
	readonly name: string;
	/** The name chats know the router by, which its file can set apart from the file's own name. */
	readonly routerName: string | undefined;
	/** What the router is for, or what is wrong with its file. */
	readonly description: string;
	/** Whether the agent warns about the router: its file has errors, or some of its routes are left out. */
	readonly hasWarning: boolean;
	readonly file: URI | undefined;
	readonly routes: readonly IAgentModelRouterRoute[];
	/** Absent when the router has nothing to switch between. */
	readonly switching: ModelRouterSwitching | undefined;
}

/** A model a route can run on. */
export interface IRoutableModel {
	/** What a router file writes for the model. */
	readonly reference: string;
	readonly name: string;
	readonly efforts: readonly ModelRouterEffortLevel[];
	/** The model's larger context window, in tokens, when it has one beside its default. */
	readonly longContextTokens?: number;
}

/** A router as the form holds it: what the user typed, and what the form has no field for as it was read. */
interface IModelRouterInput {
	/** As typed, such as "Daily Driver". A new router's file is named after it, and it is the name the router shows. */
	readonly name: string;
	readonly description: string;
	readonly routes: readonly IModelRouterRouteInput[];
}

interface IModelRouterRouteInput {
	readonly name: string;
	/** What the file writes for the route's models, in preference order. The form shows the first. */
	readonly models: readonly string[];
	readonly effort?: ModelRouterEffortLevel;
	readonly contextSize?: ModelRouterContextSize;
	readonly when: string;
	readonly guidance: string;
	readonly examples: readonly string[];
}

/** A router's file as it was read to be changed. */
export interface IOpenedModelRouter {
	readonly file: URI;
	readonly router: IModelRouter;
	/** The file's text when it was read, so that it is not written over once it has changed. */
	readonly content: string;
}

/**
 * The model routers of this window's own Copilot agent, and what can be done with them. The agent reads the
 * router files and lists each one among its models, so a change to a file shows here once the agent has read it.
 */
export class ModelRoutersViewModel extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _routers: readonly IModelRouterItem[] = [];
	get routers(): readonly IModelRouterItem[] { return this._routers; }

	/** Whether router files are on this machine. In a remote window the agent and its files are on the remote. */
	readonly canWriteFiles: boolean;

	/** Changes to router files run one at a time, each on what the one before it wrote. */
	private readonly writes = new Sequencer();

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this.canWriteFiles = !environmentService.remoteAuthority;
		this._register(Event.runAndSubscribe(this.languageModelsService.onDidChangeLanguageModels, () => {
			this._routers = this.readRouters();
			this._onDidChange.fire();
		}));
	}

	private readRouters(): IModelRouterItem[] {
		return this.languageModelsService.getLanguageModelIds().map(id => {
			const metadata = this.languageModelsService.lookupLanguageModel(id);
			if (!metadata?.modelRouterRoutes || metadata.targetChatSessionType !== SessionType.AgentHostCopilot) {
				return undefined;
			}
			return {
				id,
				name: metadata.name,
				routerName: modelRouterNameFromModelId(metadata.id),
				// A router keeps its description beside what the agent warns about, such as the routes it leaves out.
				description: [metadata.tooltip, metadata.warningText?.modelRouter].filter(Boolean).join(' '),
				hasWarning: metadata.statusIcon?.id === Codicon.warning.id,
				file: metadata.detailsResource ? URI.revive(metadata.detailsResource) : undefined,
				routes: metadata.modelRouterRoutes,
				switching: metadata.modelRouterSwitching,
			};
		}).filter(isDefined);
	}

	/** The routers that a search finds, by name, description, file name or anything about a route. */
	search(query: string): readonly IModelRouterItem[] {
		return this._routers.filter(router => customizationSearchMatchesAny(query, [
			router.name,
			router.description,
			router.file ? basename(router.file) : undefined,
			...router.routes.flatMap(route => [route.name, route.model, route.when]),
		]));
	}

	/** The models of the agent that a route can run on. */
	getRoutableModels(): IRoutableModel[] {
		return this.languageModelsService.getLanguageModelIds().map(id => {
			const metadata = this.languageModelsService.lookupLanguageModel(id);
			if (metadata?.targetChatSessionType !== SessionType.AgentHostCopilot || metadata.isUserSelectable === false || !isRoutableModel(metadata)) {
				return undefined;
			}
			const options = metadata.configurationSchema?.properties;
			const efforts = options?.[ReasoningEffortConfigKey]?.enum ?? [];
			const contextSizes = (options?.[ContextSizeConfigKey]?.enum ?? []).filter((size): size is number => typeof size === 'number' && size > 0).sort((a, b) => a - b);
			return {
				reference: metadata.byokModelIdentifier ?? metadata.id,
				name: metadata.name,
				efforts: reasoningEffortLevels.filter(level => efforts.includes(level)),
				...(contextSizes.length > 1 ? { longContextTokens: contextSizes[contextSizes.length - 1] } : {}),
			};
		}).filter(isDefined);
	}

	canSetSwitching(router: IModelRouterItem): boolean {
		return this.canWriteFiles && !!router.file && router.switching !== undefined;
	}

	/** Writes route switching to the router's file, leaving the rest of the file as it is. */
	async setSwitching(router: IModelRouterItem, switching: ModelRouterSwitching): Promise<void> {
		const file = router.file;
		if (!file) {
			return;
		}
		await this.writes.queue(async () => {
			this.assertSaved(file);
			const { value, etag, mtime } = await this.fileService.readFile(file);
			const content = withModelRouterSwitching(value.toString(), switching);
			// A file written in a way the change does not fit is left as it is, not broken.
			if (parseModelRouter(content, basename(file)).router?.switching !== switching) {
				throw new Error(localize('modelRouters.error.switching', "Change `switching` in {0} instead.", basename(file)));
			}
			// An editor can have changed the file while it was read. The write is also refused when the file itself has changed since.
			this.assertSaved(file);
			await this.fileService.writeFile(file, VSBuffer.fromString(content), { etag, mtime });
		});
	}

	/** A file with changes that an editor has not saved is left alone: writing it would leave the editor with another version. */
	private assertSaved(file: URI): void {
		if (this.textFileService.isDirty(file)) {
			throw new Error(localize('modelRouters.error.unsaved', "{0} has unsaved changes in an editor. Save or revert them first.", basename(file)));
		}
	}

	/** Whether the router can be changed in the form: its file is on this machine. A file that does not read as a router is found out by {@link readRouter}. */
	canEdit(router: IModelRouterItem): boolean {
		return this.canWriteFiles && !!router.file;
	}

	/** Reads a router's file to change it. Rejects when the file does not read as a router. */
	async readRouter(router: IModelRouterItem): Promise<IOpenedModelRouter> {
		const file = router.file;
		if (!file) {
			throw new Error(localize('modelRouters.error.noFile', "{0} has no file to read.", router.name));
		}
		this.assertSaved(file);
		const content = (await this.fileService.readFile(file)).value.toString();
		const parsed = parseModelRouter(content, basename(file));
		if (!parsed.router) {
			throw new Error(parsed.diagnostics.find(diagnostic => diagnostic.severity === ModelRouterDiagnosticSeverity.Error)?.message ?? localize('modelRouters.error.unreadable', "{0} does not read as a model router.", basename(file)));
		}
		return { file, router: parsed.router, content };
	}

	/** The file a new router with the given name is written to, when the name has letters or digits to name a file with. */
	getNewRouterFile(name: string): URI | undefined {
		const fileName = modelRouterNameFromDisplayName(name);
		return fileName ? modelRouterFile(userModelRouterFolder(this.pathService.userHome({ preferLocal: true })), fileName) : undefined;
	}

	/** Writes the file of a new router and resolves to it. Rejects with what is wrong, in words for the user. */
	async createRouter(input: IModelRouterInput): Promise<URI> {
		const name = modelRouterNameFromDisplayName(input.name);
		const file = this.getNewRouterFile(input.name);
		if (!file) {
			throw new Error(localize('modelRouters.error.name', "Give the router a name with letters or digits."));
		}
		const exists = localize('modelRouters.error.exists', "A router named {0} already exists.", name);
		// A router is known by its name, whichever of the agent's folders its file is in and whatever the file is called.
		if (this._routers.some(existing => existing.routerName === name)) {
			throw new Error(exists);
		}
		const content = this.getContent(input, file, name, undefined);
		// An editor can still have the unsaved text of a file by that name that was deleted
		this.assertSaved(file);
		try {
			await this.fileService.createFile(file, VSBuffer.fromString(content));
		} catch (error) {
			throw new Error(toFileOperationResult(error) === FileOperationResult.FILE_MODIFIED_SINCE ? exists : localize('modelRouters.error.write', "The router could not be saved. {0}", getErrorMessage(error)));
		}
		return file;
	}

	/**
	 * Writes a changed router over its file. The file keeps its name, so the router stays the one chats have chosen.
	 * Rejects with what is wrong, in words for the user, also when the file has changed since it was read.
	 */
	async saveRouter(read: IOpenedModelRouter, input: IModelRouterInput): Promise<void> {
		if (!input.name.trim()) {
			throw new Error(localize('modelRouters.error.displayName', "Give the router a name."));
		}
		const content = this.getContent(input, read.file, read.router.name, read.router);
		const changed = localize('modelRouters.error.changed', "{0} has changed since it was opened here. Cancel, and edit the router again.", basename(read.file));
		await this.writes.queue(async () => {
			this.assertSaved(read.file);
			let isChanged = false;
			try {
				const { value, etag, mtime } = await this.fileService.readFile(read.file);
				// The text is compared, as the file service lets a change of the same length through.
				isChanged = value.toString() !== read.content;
				if (!isChanged) {
					// An editor can have changed the file while it was read
					this.assertSaved(read.file);
					await this.fileService.writeFile(read.file, VSBuffer.fromString(content), { etag, mtime });
				}
			} catch (error) {
				throw new Error(toFileOperationResult(error) === FileOperationResult.FILE_MODIFIED_SINCE ? changed : localize('modelRouters.error.write', "The router could not be saved. {0}", getErrorMessage(error)));
			}
			if (isChanged) {
				throw new Error(changed);
			}
		});
	}

	/**
	 * The text of the file for what the form holds, checked as the agent will check it. What the form does not
	 * hold comes from the router as it was `read`. Throws what is wrong, in words for the user.
	 */
	private getContent(input: IModelRouterInput, file: URI, name: string, read: IModelRouter | undefined): string {
		if (!input.description.trim()) {
			throw new Error(localize('modelRouters.error.description', "Say what the router is for."));
		}
		// Nothing is decided for a router's only route, so it can leave out when to use it.
		if (input.routes.length > 1 && input.routes.some(route => !route.when.trim())) {
			throw new Error(localize('modelRouters.error.when', "Say when to use each route."));
		}
		const displayName = input.name.trim();
		const content = writeModelRouter({
			...(read ? { effort: read.effort, contextSize: read.contextSize, switching: read.switching, guidance: read.guidance } : {}),
			// A router named in its file keeps that name, which the chats that chose it know it by.
			...(name !== modelRouterNameFromFileName(basename(file)) ? { name } : {}),
			...(displayName !== name ? { displayName } : {}),
			description: input.description.trim(),
			routes: input.routes.map(route => ({
				...(modelRouterNameFromDisplayName(route.name) ? { name: modelRouterNameFromDisplayName(route.name) } : {}),
				models: route.models,
				...(route.effort ? { effort: route.effort } : {}),
				...(route.contextSize ? { contextSize: route.contextSize } : {}),
				when: route.when.trim(),
				examples: route.examples,
				...(route.guidance.trim() ? { mainAgentGuidance: route.guidance.trim() } : {}),
			})),
		});
		const problem = parseModelRouter(content, basename(file)).diagnostics.find(diagnostic => diagnostic.severity === ModelRouterDiagnosticSeverity.Error);
		if (problem) {
			throw new Error(problem.message);
		}
		return content;
	}
}
