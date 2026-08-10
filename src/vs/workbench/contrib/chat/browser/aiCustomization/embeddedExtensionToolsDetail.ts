/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IToolContribution } from '../../../../../platform/extensions/common/extensions.js';
import { IExtension } from '../../../extensions/common/extensions.js';

const $ = DOM.$;

/**
 * Compact detail view for a tool-contributing extension inside the AI Customizations management
 * editor's split-pane host. Renders identity (name + publisher), description and the list of
 * tools the extension contributes (read from its manifest).
 *
 * Mirrors {@link EmbeddedMcpServerDetail} / {@link EmbeddedAgentPluginDetail}; installing the
 * extension is handled by the gallery row the user came from, so this component stays read-only.
 */
export class EmbeddedExtensionToolsDetail extends Disposable {

	private readonly root: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
	private readonly nameEl: HTMLElement;
	private readonly publisherEl: HTMLElement;
	private readonly descriptionEl: HTMLElement;
	private readonly toolsHeadingEl: HTMLElement;
	private readonly toolsListEl: HTMLElement;
	private readonly toolsMessageEl: HTMLElement;
	private readonly emptyEl: HTMLElement;

	private current: IExtension | undefined;
	private readonly _manifestLoad = this._register(new MutableDisposable());

	constructor(
		parent: HTMLElement,
	) {
		super();

		this.root = DOM.append(parent, $('.ai-customization-embedded-detail.embedded-tool-detail'));

		this.headerEl = DOM.append(this.root, $('.embedded-detail-header'));
		// Slot at the start of the header for callers to append leading chrome
		// (e.g. a back button) without reaching into private DOM structure.
		this.leadingSlotEl = DOM.append(this.headerEl, $('.embedded-detail-leading-slot'));
		const headerText = DOM.append(this.headerEl, $('.embedded-detail-header-text'));
		this.nameEl = DOM.append(headerText, $('h2.embedded-detail-name'));
		this.nameEl.setAttribute('role', 'heading');
		this.publisherEl = DOM.append(headerText, $('.embedded-detail-scope'));

		this.descriptionEl = DOM.append(this.root, $('.embedded-detail-description'));

		const toolsEl = DOM.append(this.root, $('.embedded-detail-tools'));
		this.toolsHeadingEl = DOM.append(toolsEl, $('h3.embedded-detail-tools-heading'));
		this.toolsHeadingEl.setAttribute('role', 'heading');
		this.toolsHeadingEl.textContent = localize('toolDetailIncludedTools', "Included Tools");
		this.toolsMessageEl = DOM.append(toolsEl, $('.embedded-detail-tools-message'));
		this.toolsListEl = DOM.append(toolsEl, $('.embedded-detail-tools-list'));
		this.toolsListEl.setAttribute('role', 'list');

		this.emptyEl = DOM.append(this.root, $('.embedded-detail-empty'));
		this.emptyEl.textContent = localize('toolDetailEmpty', "No extension selected.");

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

	setInput(extension: IExtension): void {
		this.current = extension;
		this.renderItem();
	}

	clearInput(): void {
		this.current = undefined;
		this._manifestLoad.clear();
		this.renderItem();
	}

	private renderItem(): void {
		const extension = this.current;
		const hasItem = !!extension;
		this.emptyEl.style.display = hasItem ? 'none' : '';
		this.root.classList.toggle('is-empty', !hasItem);
		this.toolsHeadingEl.style.display = hasItem ? '' : 'none';
		if (!extension) {
			this.nameEl.textContent = '';
			this.publisherEl.textContent = '';
			this.descriptionEl.textContent = '';
			DOM.clearNode(this.toolsListEl);
			return;
		}

		this.nameEl.textContent = extension.displayName;

		const publisher = extension.publisherDisplayName;
		if (publisher) {
			this.publisherEl.textContent = localize('toolDetailBy', "by {0}", publisher);
			this.publisherEl.style.display = '';
		} else {
			this.publisherEl.textContent = '';
			this.publisherEl.style.display = 'none';
		}

		const description = (extension.description || '').trim();
		this.descriptionEl.textContent = description;
		this.descriptionEl.style.display = description ? '' : 'none';

		this.loadTools(extension);
	}

	/**
	 * Reads the contributed tools from the extension manifest. The manifest may be fetched from
	 * the gallery for not-yet-installed extensions, so this is async and cancellation-safe.
	 */
	private loadTools(extension: IExtension): void {
		const cts = new CancellationTokenSource();
		this._manifestLoad.value = toDisposable(() => cts.dispose(true));

		this.setToolsMessage(localize('toolDetailLoadingTools', "Loading tools..."));
		DOM.clearNode(this.toolsListEl);

		extension.getManifest(cts.token).then(manifest => {
			if (cts.token.isCancellationRequested || this.current !== extension) {
				return;
			}
			const tools = manifest?.contributes?.languageModelTools ?? [];
			this.renderTools(tools);
		}, () => {
			if (cts.token.isCancellationRequested || this.current !== extension) {
				return;
			}
			const message = localize('toolDetailToolsError', "Unable to load the tools for this extension.");
			this.setToolsMessage(message);
			status(message);
		});
	}

	private renderTools(tools: ReadonlyArray<IToolContribution>): void {
		DOM.clearNode(this.toolsListEl);
		if (tools.length === 0) {
			const message = localize('toolDetailNoTools', "This extension does not contribute any tools.");
			this.setToolsMessage(message);
			status(message);
			return;
		}

		this.setToolsMessage(undefined);
		for (const tool of tools) {
			const row = DOM.append(this.toolsListEl, $('.embedded-detail-tool'));
			row.setAttribute('role', 'listitem');
			DOM.append(row, $('.embedded-detail-tool-name')).textContent = resolveNls(tool.displayName) || tool.name;
			// Prefer the human-authored userDescription; the modelDescription is written for the
			// model and tends to be verbose, so it is only a fallback and is clamped in CSS.
			const description = resolveNls(tool.userDescription) || resolveNls(tool.modelDescription);
			if (description) {
				DOM.append(row, $('.embedded-detail-tool-description')).textContent = description;
			}
		}
		status(tools.length === 1
			? localize('toolDetailToolsLoadedOne', "1 tool")
			: localize('toolDetailToolsLoaded', "{0} tools", tools.length));
	}

	private setToolsMessage(message: string | undefined): void {
		this.toolsMessageEl.textContent = message ?? '';
		this.toolsMessageEl.style.display = message ? '' : 'none';
	}
}

/**
 * Manifests fetched from the gallery for not-yet-installed extensions are not NLS-resolved, so
 * localizable fields come back as raw `%key%` placeholders. Treat those as absent rather than
 * showing the placeholder to the user.
 */
function resolveNls(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed || (trimmed.startsWith('%') && trimmed.endsWith('%'))) {
		return undefined;
	}
	return trimmed;
}
