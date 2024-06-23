/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { matchesSomeScheme, Schemas } from 'vs/base/common/network';
import { basename } from 'vs/base/common/path';
import { basenameOrAuthority } from 'vs/base/common/resources';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { ColorScheme } from 'vs/workbench/browser/web.api';
import { ChatTreeItem } from 'vs/workbench/contrib/chat/browser/chat';
import { IDisposableReference, ResourcePool } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatCollections';
import { IChatContentPart } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatContentParts';
import { IChatContentReference, IChatWarningMessage } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { IChatRendererContent, IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { createFileIconThemableTreeContainerScope } from 'vs/workbench/contrib/files/browser/views/explorerView';

const $ = dom.$;

export class ChatReferencesContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		private readonly data: ReadonlyArray<IChatContentReference | IChatWarningMessage>,
		labelOverride: string | undefined,
		element: IChatResponseViewModel,
		contentReferencesListPool: ContentReferencesListPool,
		@IOpenerService openerService: IOpenerService,
	) {
		super();

		const referencesLabel = labelOverride ?? (data.length > 1 ?
			localize('usedReferencesPlural', "Used {0} references", data.length) :
			localize('usedReferencesSingular', "Used {0} reference", 1));
		const iconElement = $('.chat-used-context-icon');
		const icon = (element: IChatResponseViewModel) => element.usedReferencesExpanded ? Codicon.chevronDown : Codicon.chevronRight;
		iconElement.classList.add(...ThemeIcon.asClassNameArray(icon(element)));
		const buttonElement = $('.chat-used-context-label', undefined);

		const collapseButton = this._register(new Button(buttonElement, {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined
		}));
		this.domNode = $('.chat-used-context', undefined, buttonElement);
		collapseButton.label = referencesLabel;
		collapseButton.element.prepend(iconElement);
		this.updateAriaLabel(collapseButton.element, referencesLabel, element.usedReferencesExpanded);
		this.domNode.classList.toggle('chat-used-context-collapsed', !element.usedReferencesExpanded);
		this._register(collapseButton.onDidClick(() => {
			iconElement.classList.remove(...ThemeIcon.asClassNameArray(icon(element)));
			element.usedReferencesExpanded = !element.usedReferencesExpanded;
			iconElement.classList.add(...ThemeIcon.asClassNameArray(icon(element)));
			this.domNode.classList.toggle('chat-used-context-collapsed', !element.usedReferencesExpanded);
			this._onDidChangeHeight.fire();
			this.updateAriaLabel(collapseButton.element, referencesLabel, element.usedReferencesExpanded);
		}));

		const ref = this._register(contentReferencesListPool.get());
		const list = ref.object;
		this.domNode.appendChild(list.getHTMLElement().parentElement!);

		this._register(list.onDidOpen((e) => {
			if (e.element && 'reference' in e.element) {
				const uriOrLocation = 'variableName' in e.element.reference ? e.element.reference.value : e.element.reference;
				const uri = URI.isUri(uriOrLocation) ? uriOrLocation :
					uriOrLocation?.uri;
				if (uri) {
					openerService.open(
						uri,
						{
							fromUserGesture: true,
							editorOptions: {
								...e.editorOptions,
								...{
									selection: uriOrLocation && 'range' in uriOrLocation ? uriOrLocation.range : undefined
								}
							}
						});
				}
			}
		}));
		this._register(list.onContextMenu((e) => {
			e.browserEvent.preventDefault();
			e.browserEvent.stopPropagation();
		}));

		const maxItemsShown = 6;
		const itemsShown = Math.min(data.length, maxItemsShown);
		const height = itemsShown * 22;
		list.layout(height);
		list.getHTMLElement().style.height = `${height}px`;
		list.splice(0, list.length, data);
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'references' && other.references.length === this.data.length;
	}

	private updateAriaLabel(element: HTMLElement, label: string, expanded?: boolean): void {
		element.ariaLabel = expanded ? localize('usedReferencesExpanded', "{0}, expanded", label) : localize('usedReferencesCollapsed', "{0}, collapsed", label);
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

export class ContentReferencesListPool extends Disposable {
	private _pool: ResourcePool<WorkbenchList<IChatContentReference | IChatWarningMessage>>;

	public get inUse(): ReadonlySet<WorkbenchList<IChatContentReference | IChatWarningMessage>> {
		return this._pool.inUse;
	}

	constructor(
		private _onDidChangeVisibility: Event<boolean>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.listFactory()));
	}

	private listFactory(): WorkbenchList<IChatContentReference | IChatWarningMessage> {
		const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility }));

		const container = $('.chat-used-context-list');
		this._register(createFileIconThemableTreeContainerScope(container, this.themeService));

		const list = this.instantiationService.createInstance(
			WorkbenchList<IChatContentReference | IChatWarningMessage>,
			'ChatListRenderer',
			container,
			new ContentReferencesListDelegate(),
			[this.instantiationService.createInstance(ContentReferencesListRenderer, resourceLabels)],
			{
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: IChatContentReference | IChatWarningMessage) => {
						if (element.kind === 'warning') {
							return element.content.value;
						}
						const reference = element.reference;
						if ('variableName' in reference) {
							return reference.variableName;
						} else if (URI.isUri(reference)) {
							return basename(reference.path);
						} else {
							return basename(reference.uri.path);
						}
					},

					getWidgetAriaLabel: () => localize('usedReferences', "Used References")
				},
				dnd: {
					getDragURI: (element: IChatContentReference | IChatWarningMessage) => {
						if (element.kind === 'warning') {
							return null;
						}
						const { reference } = element;
						if ('variableName' in reference) {
							return null;
						} else if (URI.isUri(reference)) {
							return reference.toString();
						} else {
							return reference.uri.toString();
						}
					},
					dispose: () => { },
					onDragOver: () => false,
					drop: () => { },
				},
			});

		return list;
	}

	get(): IDisposableReference<WorkbenchList<IChatContentReference | IChatWarningMessage>> {
		const object = this._pool.get();
		let stale = false;
		return {
			object,
			isStale: () => stale,
			dispose: () => {
				stale = true;
				this._pool.release(object);
			}
		};
	}
}

class ContentReferencesListDelegate implements IListVirtualDelegate<IChatContentReference | IChatWarningMessage> {
	getHeight(element: IChatContentReference): number {
		return 22;
	}

	getTemplateId(element: IChatContentReference): string {
		return ContentReferencesListRenderer.TEMPLATE_ID;
	}
}

interface IChatContentReferenceListTemplate {
	label: IResourceLabel;
	templateDisposables: IDisposable;
}

class ContentReferencesListRenderer implements IListRenderer<IChatContentReference | IChatWarningMessage, IChatContentReferenceListTemplate> {
	static TEMPLATE_ID = 'contentReferencesListRenderer';
	readonly templateId: string = ContentReferencesListRenderer.TEMPLATE_ID;

	constructor(
		private labels: ResourceLabels,
		@IThemeService private readonly themeService: IThemeService,
		@IChatVariablesService private readonly chatVariablesService: IChatVariablesService,
	) { }

	renderTemplate(container: HTMLElement): IChatContentReferenceListTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true }));
		return { templateDisposables, label };
	}


	private getReferenceIcon(data: IChatContentReference): URI | ThemeIcon | undefined {
		if (ThemeIcon.isThemeIcon(data.iconPath)) {
			return data.iconPath;
		} else {
			return this.themeService.getColorTheme().type === ColorScheme.DARK && data.iconPath?.dark
				? data.iconPath?.dark
				: data.iconPath?.light;
		}
	}

	renderElement(data: IChatContentReference | IChatWarningMessage, index: number, templateData: IChatContentReferenceListTemplate, height: number | undefined): void {
		if (data.kind === 'warning') {
			templateData.label.setResource({ name: data.content.value }, { icon: Codicon.warning });
			return;
		}

		const reference = data.reference;
		const icon = this.getReferenceIcon(data);
		templateData.label.element.style.display = 'flex';
		if ('variableName' in reference) {
			if (reference.value) {
				const uri = URI.isUri(reference.value) ? reference.value : reference.value.uri;
				templateData.label.setResource(
					{
						resource: uri,
						name: basenameOrAuthority(uri),
						description: `#${reference.variableName}`,
						range: 'range' in reference.value ? reference.value.range : undefined,
					}, { icon });
			} else {
				const variable = this.chatVariablesService.getVariable(reference.variableName);
				templateData.label.setLabel(`#${reference.variableName}`, undefined, { title: variable?.description });
			}
		} else {
			const uri = 'uri' in reference ? reference.uri : reference;
			if (matchesSomeScheme(uri, Schemas.mailto, Schemas.http, Schemas.https)) {
				templateData.label.setResource({ resource: uri, name: uri.toString() }, { icon: icon ?? Codicon.globe });
			} else {
				templateData.label.setFile(uri, {
					fileKind: FileKind.FILE,
					// Should not have this live-updating data on a historical reference
					fileDecorations: { badges: false, colors: false },
					range: 'range' in reference ? reference.range : undefined
				});
			}
		}
	}

	disposeTemplate(templateData: IChatContentReferenceListTemplate): void {
		templateData.templateDisposables.dispose();
	}
}
