/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMcpServerConfiguration } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { getSimpleEditorOptions } from '../../../codeEditor/browser/simpleEditorOptions.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpServerInstallState } from '../../../mcp/common/mcpTypes.js';

const $ = DOM.$;

export interface IMcpServerDetailInput {
	readonly id: string;
	readonly name: string;
	readonly label: string;
	readonly installState: McpServerInstallState;
	readonly config?: IMcpServerConfiguration;
	readonly source?: {
		readonly uri: URI;
		readonly range?: IRange;
	};
}

export function createWorkbenchMcpServerDetailInput(server: IWorkbenchMcpServer): IMcpServerDetailInput {
	return {
		id: server.id,
		name: server.name,
		label: server.label,
		installState: server.installState,
		config: server.config,
		source: server.local?.mcpResource ? { uri: server.local.mcpResource } : undefined,
	};
}

/**
 * Detail view for an MCP server inside the AI Customizations management editor.
 */
export class EmbeddedMcpServerDetail extends Disposable {

	private readonly root: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
	private readonly nameEl: HTMLElement;
	private readonly pathEl: HTMLElement;
	private readonly definitionEditorContainer: HTMLElement;
	private readonly definitionEmptyEl: HTMLElement;
	private definitionEditor: CodeEditorWidget | undefined;
	private readonly definitionModel = this._register(new MutableDisposable<ITextModel>());
	private readonly emptyEl: HTMLElement;

	private current: IMcpServerDetailInput | undefined;
	private currentDefinition: string | undefined;
	private renderGeneration = 0;

	constructor(
		parent: HTMLElement,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();

		this.root = DOM.append(parent, $('.editor-content-container.ai-customization-embedded-detail.embedded-mcp-detail'));

		this.headerEl = DOM.append(this.root, $('.editor-header.mcp-detail-header'));
		this.leadingSlotEl = DOM.append(this.headerEl, $('.embedded-detail-leading-slot'));
		const headerText = DOM.append(this.headerEl, $('.editor-item-info'));
		this.nameEl = DOM.append(headerText, $('.editor-item-name'));
		this.pathEl = DOM.append(headerText, $('.editor-item-path'));

		this.definitionEditorContainer = DOM.append(this.root, $('.embedded-editor-container.mcp-detail-definition-editor'));
		this.definitionEmptyEl = DOM.append(this.root, $('.embedded-detail-empty.mcp-detail-definition-empty'));
		this.definitionEmptyEl.tabIndex = -1;
		this.definitionEmptyEl.textContent = localize('mcpDefinitionUnavailable', "No definition is available for this MCP server.");

		this.emptyEl = DOM.append(this.root, $('.embedded-detail-empty'));
		this.emptyEl.textContent = localize('mcpDetailEmpty', "No MCP server selected.");

		// Refresh when the underlying server changes (install state, enablement, etc.).
		this._register(this.mcpWorkbenchService.onChange(server => {
			if (this.current && server && server.id === this.current.id) {
				this.current = createWorkbenchMcpServerDetailInput(server);
				this.renderItem();
			}
		}));

		this.renderItem();
	}

	get element(): HTMLElement {
		return this.root;
	}

	get headerElement(): HTMLElement {
		return this.headerEl;
	}

	/**
	 * Header slot reserved for leading chrome (e.g. a back button).
	 * Prefer this over reaching into the header element directly.
	 */
	get leadingSlot(): HTMLElement {
		return this.leadingSlotEl;
	}

	setInput(server: IMcpServerDetailInput): void {
		this.current = server;
		this.renderItem();
	}

	clearInput(): void {
		this.current = undefined;
		this.renderItem();
	}

	focus(): void {
		if (this.currentDefinition !== undefined) {
			this.ensureDefinitionEditor().focus();
			return;
		}
		this.definitionEmptyEl.focus();
	}

	private renderItem(): void {
		const renderGeneration = ++this.renderGeneration;
		const server = this.current;
		const hasItem = !!server;
		this.emptyEl.style.display = hasItem ? 'none' : '';
		this.root.classList.toggle('is-empty', !hasItem);
		if (!server) {
			this.nameEl.textContent = '';
			this.pathEl.textContent = '';
			this.setDefinition(undefined);
			this.definitionEmptyEl.style.display = 'none';
			return;
		}

		this.nameEl.textContent = server.label || server.name;
		this.pathEl.textContent = server.source ? basename(server.source.uri) : 'mcp.json';
		if (server.installState !== McpServerInstallState.Installed) {
			this.setDefinition(undefined, localize('mcpDefinitionAvailableAfterInstall', "Details are available after install when the MCP server can be inspected locally."));
		} else if (server.config) {
			this.setDefinition(`${JSON.stringify({ servers: { [server.name]: server.config } }, null, '\t')}\n`);
		} else if (server.source) {
			this.setDefinition(undefined, localize('mcpDefinitionLoading', "Loading MCP server definition..."));
			void this.loadSourceDefinition(server, server.source, renderGeneration);
		} else {
			this.setDefinition(undefined);
		}
	}

	private async loadSourceDefinition(server: IMcpServerDetailInput, source: NonNullable<IMcpServerDetailInput['source']>, renderGeneration: number): Promise<void> {
		try {
			const content = (await this.fileService.readFile(source.uri)).value.toString();
			if (this.current !== server || this.renderGeneration !== renderGeneration) {
				return;
			}
			this.setDefinition(source.range ? getTextInRange(content, source.range) : content);
		} catch {
			if (this.current === server && this.renderGeneration === renderGeneration) {
				this.setDefinition(undefined, localize('mcpDefinitionLoadFailed', "The MCP server definition could not be loaded."));
			}
		}
	}

	private setDefinition(definition: string | undefined, emptyMessage = localize('mcpDefinitionUnavailable', "No definition is available for this MCP server.")): void {
		const hasDefinition = definition !== undefined;
		this.definitionEditorContainer.style.display = hasDefinition ? '' : 'none';
		this.definitionEmptyEl.style.display = hasDefinition ? 'none' : '';
		this.definitionEmptyEl.textContent = emptyMessage;

		if (this.currentDefinition === definition) {
			return;
		}

		this.currentDefinition = definition;

		if (!hasDefinition) {
			this.definitionEditor?.setModel(null);
			this.definitionModel.clear();
			return;
		}

		const definitionEditor = this.ensureDefinitionEditor();
		definitionEditor.updateOptions({
			ariaLabel: localize('mcpDefinitionEditorAriaLabelWithName', "MCP server definition for {0}", this.current?.label || this.current?.name || ''),
		});
		const model = this.modelService.createModel(definition, this.languageService.createById('jsonc'), undefined, true);
		definitionEditor.setModel(model);
		this.definitionModel.value = model;
	}

	private ensureDefinitionEditor(): CodeEditorWidget {
		if (!this.definitionEditor) {
			this.definitionEditor = this._register(this.instantiationService.createInstance(
				CodeEditorWidget,
				this.definitionEditorContainer,
				{
					...getSimpleEditorOptions(this.configurationService),
					readOnly: true,
					domReadOnly: true,
					minimap: { enabled: false },
					lineNumbers: 'on',
					wordWrap: 'on',
					scrollBeyondLastLine: false,
					automaticLayout: true,
					folding: true,
					renderLineHighlight: 'all',
					scrollbar: { vertical: 'auto', horizontal: 'auto' },
					ariaLabel: localize('mcpDefinitionEditorAriaLabel', "MCP server definition"),
				},
				{ isSimpleWidget: false }
			));
		}
		return this.definitionEditor;
	}
}

function getTextInRange(content: string, range: IRange): string {
	const lines = content.split(/\r\n|\r|\n/);
	const startLineIndex = range.startLineNumber - 1;
	const endLineIndex = range.endLineNumber - 1;
	if (startLineIndex < 0 || endLineIndex >= lines.length || startLineIndex > endLineIndex) {
		throw new Error('MCP server source range is outside the source document.');
	}
	if (startLineIndex === endLineIndex) {
		return lines[startLineIndex].slice(range.startColumn - 1, range.endColumn - 1);
	}
	return [
		lines[startLineIndex].slice(range.startColumn - 1),
		...lines.slice(startLineIndex + 1, endLineIndex),
		lines[endLineIndex].slice(0, range.endColumn - 1),
	].join('\n');
}
