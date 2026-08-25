/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { getSimpleEditorOptions } from '../../../codeEditor/browser/simpleEditorOptions.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer } from '../../../mcp/common/mcpTypes.js';

const $ = DOM.$;

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
	private readonly definitionEditor: CodeEditorWidget;
	private readonly definitionModel = this._register(new MutableDisposable<ITextModel>());
	private readonly emptyEl: HTMLElement;

	private current: IWorkbenchMcpServer | undefined;
	private currentDefinition: string | undefined;

	constructor(
		parent: HTMLElement,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
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
		this.definitionEmptyEl.textContent = localize('mcpDefinitionUnavailable', "No definition is available for this MCP server.");

		this.definitionEditor = this._register(instantiationService.createInstance(
			CodeEditorWidget,
			this.definitionEditorContainer,
			{
				...getSimpleEditorOptions(configurationService),
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

		this.emptyEl = DOM.append(this.root, $('.embedded-detail-empty'));
		this.emptyEl.textContent = localize('mcpDetailEmpty', "No MCP server selected.");

		// Refresh when the underlying server changes (install state, enablement, etc.).
		this._register(this.mcpWorkbenchService.onChange(server => {
			if (this.current && server && server.id === this.current.id) {
				this.current = server;
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

	setInput(server: IWorkbenchMcpServer): void {
		this.current = server;
		this.renderItem();
	}

	clearInput(): void {
		this.current = undefined;
		this.renderItem();
	}

	focus(): void {
		this.definitionEditor.focus();
	}

	private renderItem(): void {
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
		this.pathEl.textContent = server.local?.mcpResource ? basename(server.local.mcpResource) : 'mcp.json';
		this.definitionEditor.updateOptions({
			ariaLabel: localize('mcpDefinitionEditorAriaLabelWithName', "MCP server definition for {0}", server.label || server.name),
		});
		this.setDefinition(server.config ? `${JSON.stringify({ servers: { [server.name]: server.config } }, null, '\t')}\n` : undefined);
	}

	private setDefinition(definition: string | undefined): void {
		const hasDefinition = definition !== undefined;
		this.definitionEditorContainer.style.display = hasDefinition ? '' : 'none';
		this.definitionEmptyEl.style.display = hasDefinition ? 'none' : '';

		if (this.currentDefinition === definition) {
			return;
		}

		this.currentDefinition = definition;

		if (!hasDefinition) {
			this.definitionEditor.setModel(null);
			this.definitionModel.clear();
			return;
		}

		const model = this.modelService.createModel(definition, this.languageService.createById('jsonc'), undefined, true);
		this.definitionEditor.setModel(model);
		this.definitionModel.value = model;
	}
}
