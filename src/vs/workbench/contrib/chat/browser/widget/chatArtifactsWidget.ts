/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { IObjectTreeElement, ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IChatArtifact, IChatArtifacts, IChatArtifactsService } from '../../common/tools/chatArtifactsService.js';
import { IChatImageCarouselService } from '../chatImageCarouselService.js';
import { getEditorOverrideForChatResource } from './chatContentParts/chatInlineAnchorWidget.js';

const ARTIFACT_TYPE_ICONS: Record<string, ThemeIcon> = {
	devServer: Codicon.globe,
	screenshot: Codicon.file,
	plan: Codicon.book,
};

/**
 * A group node in the artifact tree. Groups artifacts by `groupName`.
 */
interface IArtifactGroupNode {
	readonly kind: 'group';
	readonly groupName: string;
	readonly artifacts: IChatArtifact[];
	readonly onlyShowGroup: boolean;
}

type ArtifactTreeElement = IArtifactGroupNode | IChatArtifact;

function isGroupNode(element: ArtifactTreeElement): element is IArtifactGroupNode {
	return 'kind' in element && element.kind === 'group';
}

export class ChatArtifactsWidget extends Disposable {
	readonly domNode: HTMLElement;

	private readonly _autorunDisposable = this._register(new MutableDisposable());
	private _currentArtifacts: IChatArtifacts | undefined;
	private _isCollapsed = false;
	private _tree: WorkbenchObjectTree<ArtifactTreeElement> | undefined;
	private readonly _treeStore = this._register(new DisposableStore());
	private _expandIcon!: HTMLElement;
	private _titleElement!: HTMLElement;
	private _clearButton!: Button;

	public static readonly ELEMENT_HEIGHT = 22;
	private static readonly MAX_ITEMS_SHOWN = 6;

	constructor(
		@IChatArtifactsService private readonly _chatArtifactsService: IChatArtifactsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@IChatImageCarouselService private readonly _chatImageCarouselService: IChatImageCarouselService,
	) {
		super();
		this.domNode = dom.$('.chat-artifacts-widget');
		this.domNode.style.display = 'none';
	}

	render(sessionResource: URI): void {
		this._currentArtifacts = this._chatArtifactsService.getArtifacts(sessionResource);

		dom.clearNode(this.domNode);
		this._treeStore.clear();

		const expandoContainer = dom.$('.chat-artifacts-expand');
		const headerButton = this._treeStore.add(new Button(expandoContainer, { supportIcons: true }));
		headerButton.element.setAttribute('aria-expanded', String(!this._isCollapsed));

		const titleSection = dom.$('.chat-artifacts-title-section');
		this._expandIcon = dom.$('.expand-icon.codicon');
		this._expandIcon.classList.add(this._isCollapsed ? 'codicon-chevron-right' : 'codicon-chevron-down');
		this._expandIcon.setAttribute('aria-hidden', 'true');
		this._titleElement = dom.$('.chat-artifacts-title');

		titleSection.appendChild(this._expandIcon);
		titleSection.appendChild(this._titleElement);
		headerButton.element.appendChild(titleSection);

		// Add clear button container
		const clearButtonContainer = dom.$('.artifacts-clear-button-container');
		this._clearButton = this._treeStore.add(new Button(clearButtonContainer, {
			supportIcons: true,
			ariaLabel: localize('chat.artifacts.clearButton', 'Clear all artifacts'),
		}));
		this._clearButton.element.tabIndex = 0;
		this._clearButton.icon = Codicon.clearAll;
		this._treeStore.add(this._clearButton.onDidClick(() => {
			this._clearAllArtifacts();
		}));
		headerButton.element.appendChild(clearButtonContainer);

		this.domNode.appendChild(expandoContainer);

		const listContainer = dom.$('.chat-artifacts-list');
		listContainer.style.display = this._isCollapsed ? 'none' : 'block';
		this.domNode.appendChild(listContainer);

		this._tree = this._treeStore.add(this._instantiationService.createInstance(
			WorkbenchObjectTree<ArtifactTreeElement>,
			'ChatArtifactsTree',
			listContainer,
			new ChatArtifactsTreeDelegate(),
			[
				new ChatArtifactGroupRenderer(),
				new ChatArtifactLeafRenderer(artifact => this._saveArtifact(artifact)),
			],
			{
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: new ChatArtifactsAccessibilityProvider(),
			},
		));

		this._treeStore.add(this._tree.onDidOpen(e => {
			if (!e.element) {
				return;
			}
			if (isGroupNode(e.element)) {
				if (e.element.onlyShowGroup) {
					this._openGroupInCarousel(e.element);
				}
			} else {
				const artifact = e.element;
				if (artifact.type === 'screenshot' && this._configurationService.getValue<boolean>(ChatConfiguration.ImageCarouselEnabled)) {
					this._openScreenshotInCarousel(artifact);
				} else if (artifact.uri) {
					const uri = URI.parse(artifact.uri);
					const editorOverride = getEditorOverrideForChatResource(uri, this._configurationService);
					this._openerService.open(uri, {
						fromUserGesture: true,
						editorOptions: { override: editorOverride },
					});
				}
			}
		}));

		this._treeStore.add(headerButton.onDidClick(() => {
			this._isCollapsed = !this._isCollapsed;
			this._expandIcon.classList.toggle('codicon-chevron-down', !this._isCollapsed);
			this._expandIcon.classList.toggle('codicon-chevron-right', this._isCollapsed);
			headerButton.element.setAttribute('aria-expanded', String(!this._isCollapsed));
			listContainer.style.display = this._isCollapsed ? 'none' : 'block';
		}));

		this._autorunDisposable.value = autorun((reader: IReader) => {
			const artifacts: readonly IChatArtifact[] = this._currentArtifacts!.artifacts.read(reader);
			const mutable = this._currentArtifacts!.mutable.read(reader);
			if (artifacts.length === 0) {
				this.domNode.style.display = 'none';
				return;
			}
			this.domNode.style.display = '';
			this._clearButton.element.style.display = mutable ? '' : 'none';

			this._titleElement.textContent = artifacts.length === 1
				? localize('chat.artifacts.one', "1 Artifact")
				: localize('chat.artifacts.count', "{0} Artifacts", artifacts.length);

			const treeElements = buildTreeElements(artifacts);
			const visibleCount = countVisibleRows(treeElements);
			const itemsShown = Math.min(visibleCount, ChatArtifactsWidget.MAX_ITEMS_SHOWN);
			const treeHeight = itemsShown * ChatArtifactsWidget.ELEMENT_HEIGHT;
			this._tree!.layout(treeHeight);
			this._tree!.getHTMLElement().style.height = `${treeHeight}px`;
			this._tree!.setChildren(null, treeElements);
		});
	}

	private async _openGroupInCarousel(group: IArtifactGroupNode): Promise<void> {
		// Open the first artifact in the group — the carousel service will collect
		// all images from the chat widget session automatically.
		const first = group.artifacts[0];
		if (first?.uri) {
			await this._chatImageCarouselService.openCarouselAtResource(URI.parse(first.uri));
		}
	}

	private async _openScreenshotInCarousel(clicked: IChatArtifact): Promise<void> {
		if (clicked.uri) {
			await this._chatImageCarouselService.openCarouselAtResource(URI.parse(clicked.uri));
		}
	}

	private _clearAllArtifacts(): void {
		if (!this._currentArtifacts?.mutable.get()) {
			return;
		}
		this._currentArtifacts.clear();
	}

	private async _saveArtifact(artifact: IChatArtifact): Promise<void> {
		const sourceUri = URI.parse(artifact.uri);
		const defaultFileName = sourceUri.path.split('/').pop() ?? artifact.label;
		const defaultPath = await this._fileDialogService.defaultFilePath();
		const defaultUri = URI.joinPath(defaultPath, defaultFileName);

		const targetUri = await this._fileDialogService.showSaveDialog({
			defaultUri,
			title: localize('chat.artifacts.saveDialog.title', "Save Artifact"),
		});

		if (targetUri) {
			const content = await this._fileService.readFile(sourceUri);
			await this._fileService.writeFile(targetUri, content.value);
		}
	}

	hide(): void {
		this._autorunDisposable.clear();
		this.domNode.style.display = 'none';
	}
}

// --- Tree infrastructure ---

function buildTreeElements(artifacts: readonly IChatArtifact[]): IObjectTreeElement<ArtifactTreeElement>[] {
	const groups = new Map<string, { config: { groupName: string; onlyShowGroup: boolean }; artifacts: IChatArtifact[] }>();
	const ungrouped: IChatArtifact[] = [];

	for (const artifact of artifacts) {
		if (artifact.groupName) {
			let group = groups.get(artifact.groupName);
			if (!group) {
				group = { config: { groupName: artifact.groupName, onlyShowGroup: artifact.onlyShowGroup ?? false }, artifacts: [] };
				groups.set(artifact.groupName, group);
			}
			group.artifacts.push(artifact);
		} else {
			ungrouped.push(artifact);
		}
	}

	const elements: IObjectTreeElement<ArtifactTreeElement>[] = [];

	for (const [, group] of groups) {
		const groupNode: IArtifactGroupNode = {
			kind: 'group',
			groupName: group.config.groupName,
			artifacts: group.artifacts,
			onlyShowGroup: group.config.onlyShowGroup,
		};

		if (group.config.onlyShowGroup) {
			// Only show group header, no children
			elements.push({ element: groupNode, collapsible: false, collapsed: false });
		} else {
			// Show group with children
			elements.push({
				element: groupNode,
				collapsible: true,
				collapsed: false,
				children: group.artifacts.map(a => ({ element: a })),
			});
		}
	}

	for (const artifact of ungrouped) {
		elements.push({ element: artifact });
	}

	return elements;
}

function countVisibleRows(elements: IObjectTreeElement<ArtifactTreeElement>[]): number {
	let count = 0;
	for (const el of elements) {
		count++; // The element itself
		if (el.children && !el.collapsed) {
			count += countVisibleRows([...el.children]);
		}
	}
	return count;
}

class ChatArtifactsTreeDelegate implements IListVirtualDelegate<ArtifactTreeElement> {
	getHeight(): number {
		return ChatArtifactsWidget.ELEMENT_HEIGHT;
	}
	getTemplateId(element: ArtifactTreeElement): string {
		return isGroupNode(element)
			? ChatArtifactGroupRenderer.TEMPLATE_ID
			: ChatArtifactLeafRenderer.TEMPLATE_ID;
	}
}

class ChatArtifactsAccessibilityProvider implements IListAccessibilityProvider<ArtifactTreeElement> {
	getAriaLabel(element: ArtifactTreeElement): string | null {
		if (isGroupNode(element)) {
			return localize('chat.artifacts.group.aria', "{0} ({1} items)", element.groupName, element.artifacts.length);
		}
		return element.label;
	}
	getWidgetAriaLabel(): string {
		return localize('chat.artifacts.widget.aria', "Chat Artifacts");
	}
}

// --- Group renderer ---

interface IArtifactGroupTemplate {
	readonly container: HTMLElement;
	readonly iconElement: HTMLElement;
	readonly labelElement: HTMLElement;
}

class ChatArtifactGroupRenderer implements ITreeRenderer<ArtifactTreeElement, void, IArtifactGroupTemplate> {
	static readonly TEMPLATE_ID = 'chatArtifactGroupRenderer';
	readonly templateId = ChatArtifactGroupRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IArtifactGroupTemplate {
		const row = dom.append(container, dom.$('.chat-artifacts-list-row'));
		const iconElement = dom.append(row, dom.$('.chat-artifacts-list-icon'));
		const labelElement = dom.append(row, dom.$('.chat-artifacts-list-label'));
		return { container: row, iconElement, labelElement };
	}

	renderElement(node: ITreeNode<ArtifactTreeElement>, _index: number, templateData: IArtifactGroupTemplate): void {
		const group = node.element;
		if (!isGroupNode(group)) {
			return;
		}

		// Pick an icon based on the first artifact's type
		const firstType = group.artifacts[0]?.type;
		const icon = (firstType && ARTIFACT_TYPE_ICONS[firstType]) || Codicon.archive;
		templateData.iconElement.className = 'chat-artifacts-list-icon ' + ThemeIcon.asClassName(icon);
		templateData.labelElement.textContent = `${group.groupName} (${group.artifacts.length})`;
		templateData.container.title = group.groupName;
	}

	disposeTemplate(): void { }
}

// --- Leaf artifact renderer ---

interface IArtifactLeafTemplate {
	readonly container: HTMLElement;
	readonly iconElement: HTMLElement;
	readonly labelElement: HTMLElement;
	readonly saveButton: HTMLElement;
}

class ChatArtifactLeafRenderer implements ITreeRenderer<ArtifactTreeElement, void, IArtifactLeafTemplate> {
	static readonly TEMPLATE_ID = 'chatArtifactLeafRenderer';
	readonly templateId = ChatArtifactLeafRenderer.TEMPLATE_ID;

	constructor(private readonly _onSave: (artifact: IChatArtifact) => void) { }

	renderTemplate(container: HTMLElement): IArtifactLeafTemplate {
		const row = dom.append(container, dom.$('.chat-artifacts-list-row'));
		const iconElement = dom.append(row, dom.$('.chat-artifacts-list-icon'));
		const labelElement = dom.append(row, dom.$('.chat-artifacts-list-label'));
		const saveButton = dom.append(row, dom.$('.chat-artifacts-list-save' + ThemeIcon.asCSSSelector(Codicon.save)));
		saveButton.title = localize('chat.artifacts.save', "Save artifact");
		return { container: row, iconElement, labelElement, saveButton };
	}

	renderElement(node: ITreeNode<ArtifactTreeElement>, _index: number, templateData: IArtifactLeafTemplate): void {
		const artifact = node.element;
		if (isGroupNode(artifact)) {
			return;
		}
		const icon = (artifact.type && ARTIFACT_TYPE_ICONS[artifact.type]) || Codicon.archive;
		templateData.iconElement.className = 'chat-artifacts-list-icon ' + ThemeIcon.asClassName(icon);
		templateData.labelElement.textContent = artifact.label;
		templateData.container.title = artifact.uri;

		templateData.saveButton.onclick = (e) => {
			e.stopPropagation();
			this._onSave(artifact);
		};
	}

	disposeTemplate(): void { }
}
