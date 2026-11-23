/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isEqualOrParent, relativePath } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { parseFrontMatter } from '../../../../base/common/yaml.js';
import { localize } from '../../../../nls.js';
import { hasReadableCustomizationContent } from '../../../../platform/agentHost/common/agentHostCustomizationUri.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AICustomizationItemNormalizer, getCustomizationListItemScope, IAICustomizationListItem } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemSource.js';
import { getChatMarkdownRenderOptions } from '../../../../workbench/contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { AICustomizationManagementSection as Section } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IMobileContentSheetApi, showMobileContentSheet } from '../../../../workbench/contrib/sessions/browser/mobile/mobilePickerSheet.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import './media/mobileCustomizationsInspector.css';

const sections = [
	{ id: Section.Instructions, type: PromptsType.instructions, title: localize('instructions', "Instructions"), singular: localize('instruction', "Instruction"), icon: Codicon.book },
	{ id: Section.Skills, type: PromptsType.skill, title: localize('skills', "Skills"), singular: localize('skill', "Skill"), icon: Codicon.lightbulb },
	{ id: Section.Agents, type: PromptsType.agent, title: localize('agents', "Agents"), singular: localize('agent', "Agent"), icon: Codicon.agent },
] as const;

export const MobileCustomizationsFocus = new RawContextKey<boolean>('mobileCustomizationsFocus', false);

function text(parent: HTMLElement, selector: string, value: string): HTMLElement {
	const el = dom.append(parent, dom.$(selector));
	el.textContent = value;
	return el;
}

function icon(parent: HTMLElement, glyph: ThemeIcon): void {
	dom.append(parent, dom.$('span', { 'aria-hidden': 'true' })).classList.add(...ThemeIcon.asClassNameArray(glyph));
}

function sourceLabel(item: IAICustomizationListItem): string {
	if (item.origin?.label) {
		return item.origin.label;
	}
	switch (getCustomizationListItemScope(item)) {
		case 'application': return localize('builtin', "Built-in");
		case 'workspace': return localize('repository', "Repository");
		case 'user': return localize('user', "User");
	}
}

export class MobileCustomizationsInspector {
	private readonly normalizer: AICustomizationItemNormalizer;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@ICustomizationHarnessService private readonly harness: ICustomizationHarnessService,
		@ISessionsProvidersService private readonly providers: ISessionsProvidersService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IFileService private readonly fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@IProductService productService: IProductService,
	) {
		this.normalizer = new AICustomizationItemNormalizer(labelService, productService);
	}

	open(session: ISession): Promise<void> {
		return this.showPage(localize('customizations', "Customizations"), (body, api, store) => {
			const target = dom.append(body, dom.$('.mobile-customizations-target'));
			icon(target, Codicon.repo);
			const targetName = dom.append(target, dom.$('span'));
			store.add(autorun(reader => {
				targetName.textContent = session.workspace.read(reader)?.label || session.title.read(reader);
			}));
			const message = dom.append(body, dom.$('p.mobile-customizations-message', { role: 'status' }));
			const list = dom.append(body, dom.$('.mobile-customizations-list'));
			const rowById = new Map<string, HTMLButtonElement>();
			const clearList = () => {
				rowById.clear();
				dom.clearNode(list);
				api.setBodyFocusTargets([]);
			};
			const providersChanged = observableSignalFromEvent(this, this.providers.onDidChangeProviders);
			const ownerType = derived(reader => {
				providersChanged.read(reader);
				session.remoteConnectionStatus?.read(reader);
				const provider = this.providers.getProvider(session.providerId, session.sessionId);
				return provider && observableFromEvent(this, provider.onDidChangeSessionTypes, () => provider.sessionTypes.find(type => type.id === session.sessionType)?.chatSessionType);
			});
			const descriptor = derived(reader => {
				// A catalog row keeps its public URI even when its backend registers a connection-specific harness.
				const id = ownerType.read(reader)?.read(reader) ?? getChatSessionType(session.resource);
				return this.harness.availableHarnesses.read(reader).find(harness => harness.id === id);
			});
			store.add(autorun(reader => {
				const host = session.remoteConnectionStatus?.read(reader);
				const loading = session.loading.read(reader);
				const harness = descriptor.read(reader);
				if (list.contains(dom.getActiveElement())) {
					api.focusHeader();
				}
				clearList();
				const visible = sections.filter(s => !harness?.hiddenSections?.includes(s.id));
				if (host && host.kind !== 'connected') {
					message.textContent = host.kind === 'reconnecting' || host.kind === 'connecting'
						? localize('reconnecting', "Waiting for the host to connect…")
						: localize('offline', "Customizations unavailable while the host is offline.");
					return;
				}
				message.textContent = localize('loading', "Loading customizations…");
				if (loading) {
					return;
				}
				// The window-wide prompts fallback cannot identify another session's repository.
				if (!harness?.itemProvider?.observeSessionCustomizations || !visible.length) {
					message.textContent = localize('unsupported', "This session doesn't provide customization details.");
					return;
				}
				const inventory = harness.itemProvider.observeSessionCustomizations(session.resource, reader);
				reader.store.add(autorun(r => {
					const state = inventory.read(r);
					const focused = dom.getActiveElement();
					const focusedId = dom.isHTMLElement(focused) && list.contains(focused) ? focused.dataset.itemId : undefined;
					clearList();
					if (state.kind !== 'ready') {
						switch (state.kind) {
							case 'error':
								this.logService.warn('[MobileCustomizations] Loading session customizations failed', state.error);
								message.textContent = localize('listFailed', "Couldn't load customizations.");
								break;
							case 'loading':
								message.textContent = localize('loading', "Loading customizations…");
								break;
							case 'unavailable':
								message.textContent = localize('noInventory', "Customization details are unavailable.");
								break;
						}
						if (focusedId) {
							api.focusHeader();
						}
						return;
					}
					for (const section of visible) {
						const items = this.normalizer.normalizeItems(state.items, section.type);
						if (!items.length) {
							continue;
						}
						const group = dom.append(list, dom.$('section'));
						text(group, 'h2', section.title);
						for (const item of items) {
							const row = dom.append(group, dom.$<HTMLButtonElement>('button.mobile-customizations-row', { type: 'button' }));
							row.dataset.itemId = item.id;
							icon(row, section.icon);
							const labels = dom.append(row, dom.$('.mobile-customizations-labels'));
							text(labels, 'span', item.displayName || item.name);
							text(labels, 'small', item.disabled ? localize('disabled', "{0} · Disabled", sourceLabel(item)) : sourceLabel(item));
							icon(row, Codicon.chevronRight);
							rowById.set(item.id, row);
							r.store.add(dom.addDisposableListener(row, 'click', async () => {
								row.focus({ preventScroll: true });
								await this.showItem(session, section.singular, item);
								// A provider refresh can replace the sheet's original focus target while reading.
								if (!row.isConnected && !store.isDisposed && dom.getActiveElement() === list.ownerDocument.body) {
									focusRow(item.id);
								}
							}));
						}
					}
					message.textContent = state.incomplete ? localize('incomplete', "The host hasn't reported a complete list.")
						: list.childElementCount ? '' : localize('empty', "No instructions, skills, or agents reported.");
					api.setBodyFocusTargets([...rowById.values()]);
					if (focusedId) {
						focusRow(focusedId);
					}
				}));
			}));
			function focusRow(id: string): void {
				const row = rowById.get(id);
				if (row) {
					row.focus({ preventScroll: true });
				} else {
					api.focusHeader();
				}
			}
		});
	}

	private showItem(session: ISession, title: string, item: IAICustomizationListItem): Promise<void> {
		return this.showPage(title, (body, api, store) => {
			text(body, '.mobile-customizations-source', sourceLabel(item));
			text(body, 'h1', item.displayName || item.name);
			const readable = hasReadableCustomizationContent(item.uri);
			if (readable) {
				const folder = session.workspace.get()?.folders.find(f => isEqualOrParent(item.uri, f.workingDirectory));
				text(body, '.mobile-customizations-path', (folder && relativePath(folder.workingDirectory, item.uri)) || this.labelService.getUriLabel(item.uri));
			}
			if (item.description) {
				text(body, 'p.mobile-customizations-description', item.description);
			}
			const message = dom.append(body, dom.$('p.mobile-customizations-message', { role: 'status' }));
			if (!readable) {
				message.textContent = localize('noSource', "This provider doesn't share source text for this item.");
				return;
			}
			message.textContent = localize('loadingSource', "Loading source…");
			const cts = new CancellationTokenSource();
			store.add(toDisposable(() => cts.dispose(true)));
			void this.fileService.readFile(item.uri, { limits: { size: 1024 * 1024 } }, cts.token).then(file => {
				if (store.isDisposed) {
					return;
				}
				const raw = file.value.toString();
				const content = (parseFrontMatter(raw)?.body ?? raw).trim();
				message.textContent = content ? '' : localize('emptySource', "This file has no body text.");
				if (content) {
					const article = dom.append(body, dom.$('article.mobile-customizations-content', { tabindex: '0' }));
					store.add(renderMarkdown(new MarkdownString(content), getChatMarkdownRenderOptions({
						sanitizerConfig: { replaceWithPlaintext: false, allowedTags: { override: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'] } },
					}), article));
					api.setBodyFocusTargets([article]);
				}
			}, err => {
				if (!store.isDisposed) {
					this.logService.warn('[MobileCustomizations] Reading source failed', err);
					message.textContent = localize('readFailed', "Couldn't load the source text.");
				}
			});
		});
	}

	private showPage(title: string, render: (body: HTMLElement, api: IMobileContentSheetApi, store: DisposableStore) => void): Promise<void> {
		return showMobileContentSheet(this.layoutService.mainContainer, title, (body, api) => {
			const store = new DisposableStore();
			MobileCustomizationsFocus.bindTo(store.add(this.contextKeyService.createScoped(api.sheet))).set(true);
			body.classList.add('mobile-customizations');
			render(body, api, store);
			return store;
		}, { navigationPage: true, trapFocus: true });
	}
}
