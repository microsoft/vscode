/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { findNodeAtLocation, parseTree } from '../../../../../base/common/json.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMcpServerConfiguration } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { getSimpleEditorOptions } from '../../../codeEditor/browser/simpleEditorOptions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CustomizationMcpServerCompatibilityKind, ICustomizationHarnessService, ICustomizationMcpServerCompatibility } from '../../common/customizationHarnessService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer, McpServerInstallState } from '../../../mcp/common/mcpTypes.js';

const $ = DOM.$;

export interface IMcpServerDetailInput {
	readonly id: string;
	readonly name: string;
	readonly label: string;
	readonly installState: McpServerInstallState;
	readonly config?: IMcpServerConfiguration;
	/** Identifier used by the active harness's compatibility provider. */
	readonly compatibilityId?: string;
	/** Current full runtime error, independent of compatibility. */
	readonly error?: IObservable<string | undefined>;
	/** Whether the migration planner currently considers this server eligible. */
	readonly migratable?: boolean;
	readonly source?: {
		readonly uri: URI;
		readonly range?: IRange;
	};
}

export interface IMcpServerDetailOptions {
	readonly openMigrationPage: () => void;
}

export function createWorkbenchMcpServerDetailInput(server: IWorkbenchMcpServer): IMcpServerDetailInput {
	return {
		id: server.id,
		name: server.name,
		label: server.label,
		installState: server.installState,
		config: server.config,
		compatibilityId: server.id,
		source: server.local?.mcpResource ? { uri: server.local.mcpResource } : undefined,
	};
}

interface IMcpDiagnosticSection {
	readonly section: HTMLElement;
	readonly card: HTMLElement;
	readonly icon: HTMLElement;
	readonly summary: HTMLElement;
	readonly details: HTMLElement;
}

type McpDetailCompatibilityState =
	| { readonly kind: CustomizationMcpServerCompatibilityKind; readonly details: readonly string[] }
	| { readonly kind: 'checking' | 'unavailable'; readonly details: readonly string[] };

/**
 * Detail view for an MCP server inside the AI Customizations management editor.
 */
export class EmbeddedMcpServerDetail extends Disposable {

	private readonly root: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
	private readonly nameEl: HTMLElement;
	private readonly pathEl: HTMLAnchorElement;
	private readonly editConfigurationButton: Button;
	private readonly bodyEl: HTMLElement;
	private readonly diagnosticsEmpty: HTMLElement;
	private readonly definitionEditorContainer: HTMLElement;
	private readonly definitionEmptyEl: HTMLElement;
	private readonly errorsSection: IMcpDiagnosticSection;
	private readonly compatibilitySection: IMcpDiagnosticSection;
	private readonly migrationSection: IMcpDiagnosticSection;
	private definitionEditor: CodeEditorWidget | undefined;
	private readonly definitionModel = this._register(new MutableDisposable<ITextModel>());
	private readonly diagnosticDisposables = this._register(new DisposableStore());
	private readonly migrationLinkListener = this._register(new MutableDisposable());
	private readonly emptyEl: HTMLElement;

	private current: IMcpServerDetailInput | undefined;
	private currentDefinition: string | undefined;
	private currentError: string | undefined;
	private compatibilityState: McpDetailCompatibilityState = { kind: 'checking', details: [] };
	private harnessLabel = '';
	private renderGeneration = 0;

	constructor(
		parent: HTMLElement,
		private readonly options: IMcpServerDetailOptions,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		this.root = DOM.append(parent, $('.editor-content-container.ai-customization-embedded-detail.embedded-mcp-detail'));

		this.headerEl = DOM.append(this.root, $('.editor-header.mcp-detail-header'));
		this.leadingSlotEl = DOM.append(this.headerEl, $('.embedded-detail-leading-slot'));
		const headerText = DOM.append(this.headerEl, $('.editor-item-info'));
		this.nameEl = DOM.append(headerText, $('.editor-item-name'));
		this.pathEl = DOM.append(headerText, $('a.editor-item-path')) as HTMLAnchorElement;
		const headerActions = DOM.append(this.headerEl, $('.embedded-detail-title-actions'));
		const editConfigurationLabel = localize('editMcpConfiguration', "Edit Configuration");
		this.editConfigurationButton = this._register(new Button(headerActions, {
			...defaultButtonStyles,
			secondary: true,
			ariaLabel: editConfigurationLabel,
		}));
		this.editConfigurationButton.label = editConfigurationLabel;
		this._register(this.editConfigurationButton.onDidClick(() => void this.editConfiguration()));
		this._register(DOM.addDisposableListener(this.pathEl, DOM.EventType.CLICK, event => {
			const source = this.current?.source;
			if (!source) {
				return;
			}
			event.preventDefault();
			void this.editorService.openEditor({
				resource: source.uri,
				options: { selection: source.range, pinned: true },
			});
		}));

		this.bodyEl = DOM.append(this.root, $('.mcp-detail-body'));
		const diagnostics = DOM.append(this.bodyEl, $('section.mcp-detail-diagnostics'));
		this.errorsSection = this.createDiagnosticSection(diagnostics);
		this.compatibilitySection = this.createDiagnosticSection(diagnostics);
		this.migrationSection = this.createDiagnosticSection(diagnostics);
		this.diagnosticsEmpty = DOM.append(diagnostics, $('p.mcp-detail-diagnostics-empty'));
		this.diagnosticsEmpty.textContent = localize('mcpNoDiagnostics', "No diagnostics to show");

		const definitionSection = DOM.append(this.bodyEl, $('section.mcp-detail-definition-section'));
		const definitionHeading = DOM.append(definitionSection, $('h2.mcp-detail-section-title'));
		definitionHeading.textContent = localize('mcpConfigurationSection', "Configuration");
		this.definitionEditorContainer = DOM.append(definitionSection, $('.embedded-editor-container.mcp-detail-definition-editor'));
		this.definitionEmptyEl = DOM.append(definitionSection, $('.embedded-detail-empty.mcp-detail-definition-empty'));
		this.definitionEmptyEl.tabIndex = -1;
		this.definitionEmptyEl.textContent = localize('mcpDefinitionUnavailable', "No definition is available for this MCP server.");

		this.emptyEl = DOM.append(this.root, $('.embedded-detail-empty'));
		this.emptyEl.textContent = localize('mcpDetailEmpty', "No MCP server selected.");

		// Refresh when the underlying server changes (install state, enablement, etc.).
		this._register(this.mcpWorkbenchService.onChange(server => {
			if (this.current && server && server.id === this.current.id) {
				const { error, compatibilityId, migratable } = this.current;
				this.current = { ...createWorkbenchMcpServerDetailInput(server), error, compatibilityId, migratable };
				this.bindDiagnostics();
				this.renderItem();
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled)) {
				this.bindDiagnostics();
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
		this.bindDiagnostics();
		this.renderItem();
	}

	setMigratable(migratable: boolean): void {
		if (!this.current || this.current.migratable === migratable) {
			return;
		}
		this.current = { ...this.current, migratable };
		this.renderMigration();
	}

	clearInput(): void {
		this.diagnosticDisposables.clear();
		this.migrationLinkListener.clear();
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
		this.bodyEl.style.display = hasItem ? '' : 'none';
		this.root.classList.toggle('is-empty', !hasItem);
		if (!server) {
			this.nameEl.textContent = '';
			this.pathEl.textContent = '';
			this.pathEl.removeAttribute('href');
			this.pathEl.removeAttribute('aria-label');
			this.pathEl.classList.remove('source-link');
			this.editConfigurationButton.element.style.display = 'none';
			this.setDefinition(undefined);
			this.definitionEmptyEl.style.display = 'none';
			return;
		}

		this.nameEl.textContent = server.label || server.name;
		const sourceLabel = server.source ? basename(server.source.uri) : 'mcp.json';
		this.pathEl.textContent = sourceLabel;
		this.pathEl.classList.toggle('source-link', !!server.source);
		if (server.source) {
			this.pathEl.href = '#';
			this.pathEl.setAttribute('aria-label', localize('openMcpServerSource', "Open {0}", sourceLabel));
			this.editConfigurationButton.element.style.display = '';
		} else {
			this.pathEl.removeAttribute('href');
			this.pathEl.removeAttribute('aria-label');
			this.editConfigurationButton.element.style.display = 'none';
		}
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

	private async editConfiguration(): Promise<void> {
		const server = this.current;
		const source = server?.source;
		if (!server || !source) {
			return;
		}

		let selection = source.range;
		if (!selection) {
			try {
				const content = (await this.fileService.readFile(source.uri)).value.toString();
				selection = getMcpServerConfigurationRange(content, server.name);
				if (!selection) {
					this.notificationService.warn(localize(
						'mcpConfigurationLocationNotFound',
						"Could not locate the configuration for '{0}'. Opening the source file instead.",
						server.label || server.name,
					));
				}
			} catch (error) {
				this.notificationService.error(localize(
					'mcpConfigurationReadFailed',
					"Could not read the configuration for '{0}': {1}",
					server.label || server.name,
					getErrorMessage(error),
				));
				return;
			}
		}

		try {
			await this.editorService.openEditor({
				resource: source.uri,
				options: { selection, pinned: true },
			});
		} catch (error) {
			this.notificationService.error(localize(
				'mcpConfigurationOpenFailed',
				"Could not open the configuration for '{0}': {1}",
				server.label || server.name,
				getErrorMessage(error),
			));
		}
	}

	private bindDiagnostics(): void {
		this.diagnosticDisposables.clear();
		this.migrationLinkListener.clear();
		this.currentError = undefined;
		this.compatibilityState = { kind: 'checking', details: [] };
		const server = this.current;
		if (!server) {
			this.renderDiagnostics();
			return;
		}

		if (server.error) {
			this.diagnosticDisposables.add(autorun(reader => {
				this.currentError = server.error?.read(reader);
				this.renderErrors();
			}));
		}

		this.diagnosticDisposables.add(autorun(reader => {
			const sessionResource = this.customizationHarnessService.activeSessionResource.read(reader);
			this.customizationHarnessService.availableHarnesses.read(reader);
			const descriptor = this.customizationHarnessService.getActiveDescriptor();
			this.harnessLabel = descriptor.label || localize('currentHarness', "the current harness");
			if (this.configurationService.getValue<boolean>(ChatConfiguration.ChatCustomizationsMcpServerMigrationEnabled) !== true) {
				this.compatibilityState = { kind: 'unavailable', details: [] };
				this.renderCompatibility();
				return;
			}
			if (server.installState !== McpServerInstallState.Installed) {
				this.compatibilityState = { kind: 'unavailable', details: [] };
				this.renderCompatibility();
				return;
			}
			if (!server.compatibilityId || !descriptor.mcpServerCompatibilityProvider) {
				this.compatibilityState = { kind: 'supported', details: [] };
				this.renderCompatibility();
				return;
			}
			const scope = descriptor.mcpServerCompatibilityProvider.acquire(sessionResource);
			if (!scope) {
				this.compatibilityState = { kind: 'unknown', details: [] };
				this.renderCompatibility();
				return;
			}
			reader.store.add(scope);
			reader.store.add(autorun(reader => {
				const compatibility = scope.servers.read(reader).find(candidate => candidate.id === server.compatibilityId);
				this.compatibilityState = resolveCompatibilityState(scope.isResolved.read(reader), compatibility);
				this.renderCompatibility();
			}));
		}));

		this.renderDiagnostics();
	}

	private createDiagnosticSection(parent: HTMLElement): IMcpDiagnosticSection {
		const section = DOM.append(parent, $('section.mcp-detail-diagnostic-section'));
		const card = DOM.append(section, $('.mcp-detail-diagnostic-card'));
		const header = DOM.append(card, $('.mcp-detail-diagnostic-header'));
		const icon = DOM.append(header, $('.mcp-detail-diagnostic-icon'));
		icon.setAttribute('aria-hidden', 'true');
		const summary = DOM.append(header, $('.mcp-detail-diagnostic-summary'));
		summary.setAttribute('aria-live', 'polite');
		const details = DOM.append(card, $('.mcp-detail-diagnostic-details'));
		return { section, card, icon, summary, details };
	}

	private renderDiagnostics(): void {
		this.renderErrors();
		this.renderCompatibility();
		this.renderMigration();
		this.updateDiagnosticsVisibility();
	}

	private renderErrors(): void {
		const error = this.currentError;
		this.errorsSection.section.style.display = error ? '' : 'none';
		if (!error) {
			this.updateDiagnosticsVisibility();
			return;
		}
		this.updateDiagnosticSection(
			this.errorsSection,
			'error',
			Codicon.error,
			localize('mcpServerErrorSummary', "This server reported an error"),
			[error],
		);
		this.updateDiagnosticsVisibility();
	}

	private renderCompatibility(): void {
		const state = this.compatibilityState;
		switch (state.kind) {
			case 'supported':
				this.compatibilitySection.section.style.display = 'none';
				break;
			case 'partiallySupported':
				this.compatibilitySection.section.style.display = '';
				this.updateDiagnosticSection(this.compatibilitySection, 'warning', Codicon.warning, localize('mcpPartiallySupportedByHarness', "Partially supported by {0}", this.harnessLabel), state.details);
				break;
			case 'unsupported':
				this.compatibilitySection.section.style.display = '';
				this.updateDiagnosticSection(this.compatibilitySection, 'error', Codicon.error, localize('mcpUnsupportedByHarness', "Not supported by {0}", this.harnessLabel), state.details);
				break;
			case 'unknown':
				this.compatibilitySection.section.style.display = '';
				this.updateDiagnosticSection(this.compatibilitySection, 'warning', Codicon.question, localize('mcpCompatibilityUnknownForHarness', "Compatibility with {0} could not be determined", this.harnessLabel), state.details);
				break;
			case 'checking':
				this.compatibilitySection.section.style.display = '';
				this.updateDiagnosticSection(this.compatibilitySection, 'neutral', ThemeIcon.modify(Codicon.loading, 'spin'), localize('mcpCheckingCompatibility', "Checking compatibility with {0}", this.harnessLabel), []);
				break;
			case 'unavailable':
				this.compatibilitySection.section.style.display = 'none';
				break;
		}
		this.updateDiagnosticsVisibility();
	}

	private renderMigration(): void {
		const migratable = this.current?.migratable === true;
		this.migrationSection.section.style.display = migratable ? '' : 'none';
		if (!migratable) {
			this.migrationLinkListener.clear();
			this.updateDiagnosticsVisibility();
			return;
		}

		this.migrationSection.card.className = 'mcp-detail-diagnostic-card migration warning';
		this.migrationSection.icon.className = 'mcp-detail-diagnostic-icon';
		this.migrationSection.icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
		this.migrationSection.summary.textContent = localize('mcpMigrateServer', "Migrate MCP Server");
		DOM.clearNode(this.migrationSection.details);
		this.migrationSection.details.style.display = '';
		const description = DOM.append(this.migrationSection.details, $('p.mcp-detail-migration-description'));
		description.textContent = localize('mcpMigrationAvailableDescription', "This MCP server needs to be migrated to keep working.");
		const link = DOM.append(this.migrationSection.details, $('a.mcp-detail-migration-link')) as HTMLAnchorElement;
		link.href = '#';
		link.textContent = localize('mcpReviewMigrations', "Review Migrations...");
		this.migrationLinkListener.value = DOM.addDisposableListener(link, DOM.EventType.CLICK, event => {
			event.preventDefault();
			this.options.openMigrationPage();
		});
		this.updateDiagnosticsVisibility();
	}

	private updateDiagnosticsVisibility(): void {
		const hasDiagnostics = this.errorsSection.section.style.display !== 'none'
			|| this.compatibilitySection.section.style.display !== 'none'
			|| this.migrationSection.section.style.display !== 'none';
		this.diagnosticsEmpty.style.display = hasDiagnostics ? 'none' : '';
	}

	private updateDiagnosticSection(section: IMcpDiagnosticSection, kind: 'warning' | 'error' | 'neutral', icon: ThemeIcon, summary: string, details: readonly string[]): void {
		section.card.className = `mcp-detail-diagnostic-card ${kind}`;
		section.icon.className = 'mcp-detail-diagnostic-icon';
		section.icon.classList.add(...ThemeIcon.asClassNameArray(icon));
		section.summary.textContent = summary;
		DOM.clearNode(section.details);
		section.details.style.display = details.length > 0 ? '' : 'none';
		if (details.length === 1) {
			const detail = DOM.append(section.details, $('p.mcp-detail-diagnostic-message'));
			detail.textContent = details[0];
		} else if (details.length > 1) {
			const list = DOM.append(section.details, $('ul.mcp-detail-diagnostic-list'));
			for (const message of details) {
				const item = DOM.append(list, $('li'));
				item.textContent = message;
			}
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

function resolveCompatibilityState(resolved: boolean, compatibility: ICustomizationMcpServerCompatibility | undefined): McpDetailCompatibilityState {
	if (!resolved) {
		return { kind: 'checking', details: [] };
	}
	if (!compatibility) {
		return { kind: 'unknown', details: [] };
	}
	return { kind: compatibility.kind, details: compatibility.details ?? [] };
}

function getMcpServerConfigurationRange(content: string, serverName: string): Range | undefined {
	const root = parseTree(content);
	const node = findNodeAtLocation(root, ['servers', serverName])
		?? findNodeAtLocation(root, ['mcpServers', serverName])
		?? findNodeAtLocation(root, ['mcp', 'servers', serverName])
		?? findNodeAtLocation(root, ['settings', 'mcp', 'servers', serverName]);
	if (!node) {
		return undefined;
	}
	const start = positionAt(content, node.offset);
	const end = positionAt(content, node.offset + node.length);
	return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
}

function positionAt(content: string, offset: number): { lineNumber: number; column: number } {
	let lineNumber = 1;
	let column = 1;
	for (let index = 0; index < offset; index++) {
		const character = content.charCodeAt(index);
		if (character === 13) {
			if (content.charCodeAt(index + 1) === 10 && index + 1 < offset) {
				index++;
			}
			lineNumber++;
			column = 1;
		} else if (character === 10) {
			lineNumber++;
			column = 1;
		} else {
			column++;
		}
	}
	return { lineNumber, column };
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
