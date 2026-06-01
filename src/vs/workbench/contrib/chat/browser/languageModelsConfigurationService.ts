/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Mutable } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService, MODAL_GROUP } from '../../../services/editor/common/editorService.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { equals } from '../../../../base/common/objects.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { JSONVisitor, visit } from '../../../../base/common/json.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { ConfigureLanguageModelsOptions, ILanguageModelsConfigurationService, ILanguageModelsProviderGroup } from '../common/languageModelsConfiguration.js';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';

type LanguageModelsProviderGroups = Mutable<ILanguageModelsProviderGroup>[];

export class LanguageModelsConfigurationService extends Disposable implements ILanguageModelsConfigurationService {

	declare _serviceBrand: undefined;

	private readonly modelsConfigurationFile: URI;
	get configurationFile(): URI { return this.modelsConfigurationFile; }

	private readonly _onDidChangeLanguageModelGroups = this._register(new Emitter<readonly ILanguageModelsProviderGroup[]>());
	readonly onDidChangeLanguageModelGroups: Event<readonly ILanguageModelsProviderGroup[]> = this._onDidChangeLanguageModelGroups.event;

	private languageModelsProviderGroups: LanguageModelsProviderGroups = [];

	/** Resolved once the first config-file load attempt completes; assigned exactly once in the ctor. Rejections are swallowed so consumers can treat readiness as "first load attempted". */
	private readonly _whenReady: Promise<void>;
	get whenReady(): Promise<void> { return this._whenReady; }

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super();
		this.modelsConfigurationFile = userDataProfileService.currentProfile.languageModelsResource;
		this._whenReady = this.updateLanguageModelsConfiguration().catch(() => { /* swallow: readiness signals "attempted", not "succeeded" */ });
		// Watch the parent folder for reliable change detection across platforms (especially Windows
		// where `fs.watch` on individual files can miss in-place writes).
		this._register(fileService.watch(uriIdentityService.extUri.dirname(this.modelsConfigurationFile)));
		this._register(fileService.onDidFilesChange(e => {
			if (e.contains(this.modelsConfigurationFile)) {
				this.updateLanguageModelsConfiguration();
			}
		}));
	}

	private setLanguageModelsConfiguration(languageModelsConfiguration: LanguageModelsProviderGroups): void {
		const changedGroups: ILanguageModelsProviderGroup[] = [];
		const oldGroupMap = new Map(this.languageModelsProviderGroups.map(g => [`${g.vendor}:${g.name}`, g]));
		const newGroupMap = new Map(languageModelsConfiguration.map(g => [`${g.vendor}:${g.name}`, g]));

		// Find added or modified groups
		for (const [key, newGroup] of newGroupMap) {
			const oldGroup = oldGroupMap.get(key);
			if (!oldGroup || !equals(oldGroup, newGroup)) {
				changedGroups.push(newGroup);
			}
		}

		// Find removed groups
		for (const [key, oldGroup] of oldGroupMap) {
			if (!newGroupMap.has(key)) {
				changedGroups.push(oldGroup);
			}
		}

		this.languageModelsProviderGroups = languageModelsConfiguration;
		if (changedGroups.length > 0) {
			this._onDidChangeLanguageModelGroups.fire(changedGroups);
		}
	}

	private async updateLanguageModelsConfiguration(): Promise<void> {
		const languageModelsProviderGroups = await this.withLanguageModelsProviderGroups();
		this.setLanguageModelsConfiguration(languageModelsProviderGroups);
	}

	getLanguageModelsProviderGroups(): readonly ILanguageModelsProviderGroup[] {
		return this.languageModelsProviderGroups;
	}

	async addLanguageModelsProviderGroup(toAdd: ILanguageModelsProviderGroup): Promise<ILanguageModelsProviderGroup> {
		await this.withLanguageModelsProviderGroups(async languageModelsProviderGroups => {
			if (languageModelsProviderGroups.some(({ name, vendor }) => name === toAdd.name && vendor === toAdd.vendor)) {
				throw new Error(`Language model group with name ${toAdd.name} already exists for vendor ${toAdd.vendor}`);
			}
			languageModelsProviderGroups.push(toAdd);
			return languageModelsProviderGroups;
		});

		await this.updateLanguageModelsConfiguration();
		const result = this.getLanguageModelsProviderGroups().find(group => group.name === toAdd.name && group.vendor === toAdd.vendor);
		if (!result) {
			throw new Error(`Language model group with name ${toAdd.name} not found for vendor ${toAdd.vendor}`);
		}
		return result;
	}

	async updateLanguageModelsProviderGroup(from: ILanguageModelsProviderGroup, to: ILanguageModelsProviderGroup): Promise<ILanguageModelsProviderGroup> {
		await this.withLanguageModelsProviderGroups(async languageModelsProviderGroups => {
			const result: LanguageModelsProviderGroups = [];
			for (const group of languageModelsProviderGroups) {
				if (group.name === from.name && group.vendor === from.vendor) {
					result.push(to);
				} else {
					result.push(group);
				}
			}
			return result;
		});

		await this.updateLanguageModelsConfiguration();
		const result = this.getLanguageModelsProviderGroups().find(group => group.name === to.name && group.vendor === to.vendor);
		if (!result) {
			throw new Error(`Language model group with name ${to.name} not found for vendor ${to.vendor}`);
		}
		return result;
	}

	async removeLanguageModelsProviderGroup(toRemove: ILanguageModelsProviderGroup): Promise<void> {
		await this.withLanguageModelsProviderGroups(async languageModelsProviderGroups => {
			const result: LanguageModelsProviderGroups = [];
			for (const group of languageModelsProviderGroups) {
				if (group.name === toRemove.name && group.vendor === toRemove.vendor) {
					continue;
				}
				result.push(group);
			}
			return result;
		});
		await this.updateLanguageModelsConfiguration();
	}

	async configureLanguageModels(options?: ConfigureLanguageModelsOptions): Promise<void> {
		// Mirror the surface that the chat models editor is currently shown in: if
		// it lives inside the modal editor part, open the JSON in the modal too;
		// otherwise fall back to the default group resolution (regular editor area).
		const preferredGroup = this.editorGroupsService.getPart(this.editorGroupsService.activeGroup) === this.editorGroupsService.activeModalEditorPart ? MODAL_GROUP : undefined;
		const editor = await this.editorService.openEditor({
			resource: this.modelsConfigurationFile,
			options: { override: DEFAULT_EDITOR_ASSOCIATION.id }
		}, preferredGroup);
		if (!editor || !options?.group) {
			return;
		}

		const codeEditor = getCodeEditor(editor.getControl());
		if (!codeEditor) {
			return;
		}

		if (options.snippet) {
			// Insert snippet at the end of the last property line (before the closing brace line), with comma prepended
			const model = codeEditor.getModel();
			if (!model) {
				return;
			}
			const targetRange = options.snippetTarget === 'models' ? options.group.modelsRange : options.group.range;
			if (!targetRange) {
				return;
			}
			const models = options.group.models;
			const isModelsArray = options.snippetTarget === 'models' && Array.isArray(models);
			const emptyModelsArray = isModelsArray && models.length === 0;
			const insertBeforeModelsArrayEnd = emptyModelsArray || (isModelsArray && targetRange.startLineNumber === targetRange.endLineNumber);
			const lastPropertyLine = targetRange.endLineNumber - 1;
			const insertPosition = insertBeforeModelsArrayEnd ? {
				lineNumber: targetRange.endLineNumber,
				column: targetRange.endColumn - 1
			} : {
				lineNumber: lastPropertyLine,
				column: model.getLineLength(lastPropertyLine) + 1
			};
			codeEditor.setPosition(insertPosition);
			codeEditor.revealPositionNearTop(insertPosition);
			codeEditor.focus();
			SnippetController2.get(codeEditor)?.insert(emptyModelsArray ? options.snippet : ',\n' + options.snippet);
		} else {
			if (!options.group.range) {
				return;
			}
			const position = { lineNumber: options.group.range.startLineNumber, column: options.group.range.startColumn };
			codeEditor.setPosition(position);
			codeEditor.revealPositionNearTop(position);
			codeEditor.focus();
		}
	}

	private async withLanguageModelsProviderGroups(update?: (languageModelsProviderGroups: LanguageModelsProviderGroups) => Promise<LanguageModelsProviderGroups>): Promise<LanguageModelsProviderGroups> {
		const exists = await this.fileService.exists(this.modelsConfigurationFile);
		if (!exists) {
			await this.fileService.writeFile(this.modelsConfigurationFile, VSBuffer.fromString(JSON.stringify([], undefined, '\t')));
		}
		const ref = await this.textModelService.createModelReference(this.modelsConfigurationFile);
		const model = ref.object.textEditorModel;
		try {
			const languageModelsProviderGroups = parseLanguageModelsProviderGroups(model);
			if (!update) {
				return languageModelsProviderGroups;
			}
			const updatedLanguageModelsProviderGroups = await update(languageModelsProviderGroups);
			for (const group of updatedLanguageModelsProviderGroups) {
				delete group.range;
				delete group.modelsRange;
			}
			model.setValue(JSON.stringify(updatedLanguageModelsProviderGroups, undefined, '\t'));
			await this.textFileService.save(this.modelsConfigurationFile);
			return updatedLanguageModelsProviderGroups;
		} finally {
			ref.dispose();
		}
	}
}

export function parseLanguageModelsProviderGroups(model: ITextModel): LanguageModelsProviderGroups {
	const configuration: LanguageModelsProviderGroups = [];
	let currentProperty: string | null = null;
	let currentParent: unknown = configuration;
	const previousParents: unknown[] = [];

	function onValue(value: unknown, offset: number, length: number) {
		if (Array.isArray(currentParent)) {
			(currentParent as unknown[]).push(value);
		} else if (currentProperty !== null) {
			(currentParent as Record<string, unknown>)[currentProperty] = value;
		}
	}

	const visitor: JSONVisitor = {
		onObjectBegin: (offset: number, length: number) => {
			const object: Record<string, unknown> & { range?: IRange } = {};
			if (previousParents.length === 1 && Array.isArray(currentParent)) {
				const start = model.getPositionAt(offset);
				const end = model.getPositionAt(offset + length);
				object.range = {
					startLineNumber: start.lineNumber,
					startColumn: start.column,
					endLineNumber: end.lineNumber,
					endColumn: end.column
				};
			}
			onValue(object, offset, length);
			previousParents.push(currentParent);
			currentParent = object;
			currentProperty = null;
		},
		onObjectProperty: (name: string, offset: number, length: number) => {
			currentProperty = name;
		},
		onObjectEnd: (offset: number, length: number) => {
			const parent = currentParent as Record<string, unknown> & { range?: IRange; _parentConfigurationRange?: Mutable<IRange> };
			if (parent.range) {
				const end = model.getPositionAt(offset + length);
				parent.range = {
					startLineNumber: parent.range.startLineNumber,
					startColumn: parent.range.startColumn,
					endLineNumber: end.lineNumber,
					endColumn: end.column
				};
			}
			if (parent._parentConfigurationRange) {
				const end = model.getPositionAt(offset + length);
				parent._parentConfigurationRange.endLineNumber = end.lineNumber;
				parent._parentConfigurationRange.endColumn = end.column;
				delete parent._parentConfigurationRange;
			}
			currentParent = previousParents.pop();
		},
		onArrayBegin: (offset: number, length: number) => {
			if (currentParent === configuration && previousParents.length === 0) {
				previousParents.push(currentParent);
				currentProperty = null;
				return;
			}
			const array: unknown[] & { _parentModelsRange?: Mutable<IRange> } = [];
			const parent = currentParent as Record<string, unknown> & { range?: IRange; modelsRange?: Mutable<IRange> };
			if (currentProperty === 'models' && parent.range) {
				const start = model.getPositionAt(offset);
				const end = model.getPositionAt(offset + length);
				parent.modelsRange = {
					startLineNumber: start.lineNumber,
					startColumn: start.column,
					endLineNumber: end.lineNumber,
					endColumn: end.column
				};
				array._parentModelsRange = parent.modelsRange;
			}
			onValue(array, offset, length);
			previousParents.push(currentParent);
			currentParent = array;
			currentProperty = null;
		},
		onArrayEnd: (offset: number, length: number) => {
			const parent = currentParent as { _parentConfigurationRange?: Mutable<IRange>; _parentModelsRange?: Mutable<IRange> };
			if (parent._parentConfigurationRange) {
				const end = model.getPositionAt(offset + length);
				parent._parentConfigurationRange.endLineNumber = end.lineNumber;
				parent._parentConfigurationRange.endColumn = end.column;
				delete parent._parentConfigurationRange;
			}
			if (parent._parentModelsRange) {
				const end = model.getPositionAt(offset + length);
				parent._parentModelsRange.endLineNumber = end.lineNumber;
				parent._parentModelsRange.endColumn = end.column;
				delete parent._parentModelsRange;
			}
			currentParent = previousParents.pop();
		},
		onLiteralValue: (value: unknown, offset: number, length: number) => {
			onValue(value, offset, length);
		},
	};
	visit(model.getValue(), visitor);
	return configuration;
}

const languageModelsSchemaId = 'vscode://schemas/language-models';

export class ChatLanguageModelsDataContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatLanguageModelsData';

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelsConfigurationService languageModelsConfigurationService: ILanguageModelsConfigurationService,
	) {
		super();
		const registry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
		this._register(registry.registerSchemaAssociation(languageModelsSchemaId, languageModelsConfigurationService.configurationFile.toString()));

		this.updateSchema(registry);
		this._register(this.languageModelsService.onDidChangeLanguageModels(() => this.updateSchema(registry)));
	}

	private updateSchema(registry: IJSONContributionRegistry): void {
		const vendors = this.languageModelsService.getVendors();

		// Build per-model configuration schemas
		const modelSchemas: IJSONSchema[] = [];
		const modelIds = this.languageModelsService.getLanguageModelIds();
		for (const modelId of modelIds) {
			const metadata = this.languageModelsService.lookupLanguageModel(modelId);
			if (metadata?.configurationSchema) {
				modelSchemas.push({
					if: {
						properties: {
							vendor: { const: metadata.vendor }
						}
					},
					then: {
						properties: {
							settings: {
								type: 'object',
								properties: {
									[metadata.id]: metadata.configurationSchema
								}
							}
						}
					}
				});
			}
		}

		const schema: IJSONSchema = {
			type: 'array',
			items: {
				properties: {
					vendor: {
						type: 'string',
						enum: vendors.map(v => v.vendor)
					},
					name: { type: 'string' },
					settings: {
						type: 'object',
						description: localize('settings.perModelConfig', "Per-model settings"),
					}
				},
				allOf: [
					...vendors.map(vendor => ({
						if: {
							properties: {
								vendor: { const: vendor.vendor }
							}
						},
						then: vendor.configuration
					})),
					...modelSchemas
				],
				required: ['vendor', 'name']
			}
		};

		registry.registerSchema(languageModelsSchemaId, schema);
	}
}
