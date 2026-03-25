/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { getMediaMime } from '../../../../../base/common/mime.js';
import { autorun, IObservable, IReader } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IChatArtifact, IChatArtifactsService } from '../../common/tools/chatArtifactsService.js';

const ARTIFACT_TYPE_ICONS: Record<string, ThemeIcon> = {
	devServer: Codicon.globe,
	screenshot: Codicon.file,
	plan: Codicon.book,
};

export class ChatArtifactsWidget extends Disposable {
	readonly domNode: HTMLElement;

	private readonly _autorunDisposable = this._register(new MutableDisposable());
	private _currentObs: IObservable<readonly IChatArtifact[]> | undefined;
	private _isCollapsed = true;
	private _list: WorkbenchList<IChatArtifact> | undefined;
	private readonly _listStore = this._register(new DisposableStore());
	private _expandIcon!: HTMLElement;
	private _titleElement!: HTMLElement;
	private _clearButton!: Button;

	public static readonly ELEMENT_HEIGHT = 22;
	private static readonly MAX_ITEMS_SHOWN = 6;

	private _sessionResource: URI | undefined;

	constructor(
		@IChatArtifactsService private readonly _chatArtifactsService: IChatArtifactsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this.domNode = dom.$('.chat-artifacts-widget');
		this.domNode.style.display = 'none';
	}

	render(sessionResource: URI): void {
		this._sessionResource = sessionResource;
		this._currentObs = this._chatArtifactsService.artifacts(sessionResource);

		dom.clearNode(this.domNode);
		this._listStore.clear();

		const expandoContainer = dom.$('.chat-artifacts-expand');
		const headerButton = this._listStore.add(new Button(expandoContainer, { supportIcons: true }));
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
		this._clearButton = this._listStore.add(new Button(clearButtonContainer, {
			supportIcons: true,
			ariaLabel: localize('chat.artifacts.clearButton', 'Clear all artifacts'),
		}));
		this._clearButton.element.tabIndex = 0;
		this._clearButton.icon = Codicon.clearAll;
		this._listStore.add(this._clearButton.onDidClick(() => {
			this._clearAllArtifacts();
		}));
		headerButton.element.appendChild(clearButtonContainer);

		this.domNode.appendChild(expandoContainer);

		const listContainer = dom.$('.chat-artifacts-list');
		listContainer.style.display = this._isCollapsed ? 'none' : 'block';
		this.domNode.appendChild(listContainer);

		this._list = this._listStore.add(this._instantiationService.createInstance(
			WorkbenchList<IChatArtifact>,
			'ChatArtifactsList',
			listContainer,
			new ChatArtifactsListDelegate(),
			[new ChatArtifactsListRenderer()],
			{ alwaysConsumeMouseWheel: false },
		));

		this._listStore.add(this._list.onDidOpen(e => {
			if (e.element) {
				if (e.element.type === 'screenshot' && this._configurationService.getValue<boolean>(ChatConfiguration.ImageCarouselEnabled)) {
					this._openScreenshotInCarousel(e.element);
				} else {
					this._openerService.open(URI.parse(e.element.uri));
				}
			}
		}));

		this._listStore.add(headerButton.onDidClick(() => {
			this._isCollapsed = !this._isCollapsed;
			this._expandIcon.classList.toggle('codicon-chevron-down', !this._isCollapsed);
			this._expandIcon.classList.toggle('codicon-chevron-right', this._isCollapsed);
			headerButton.element.setAttribute('aria-expanded', String(!this._isCollapsed));
			listContainer.style.display = this._isCollapsed ? 'none' : 'block';
		}));

		this._autorunDisposable.value = autorun((reader: IReader) => {
			const artifacts: readonly IChatArtifact[] = this._currentObs!.read(reader);
			if (artifacts.length === 0) {
				this.domNode.style.display = 'none';
				return;
			}
			this.domNode.style.display = '';

			this._titleElement.textContent = artifacts.length === 1
				? localize('chat.artifacts.one', "1 Artifact")
				: localize('chat.artifacts.count', "{0} Artifacts", artifacts.length);

			const itemsShown = Math.min(artifacts.length, ChatArtifactsWidget.MAX_ITEMS_SHOWN);
			const listHeight = itemsShown * ChatArtifactsWidget.ELEMENT_HEIGHT;
			this._list!.layout(listHeight);
			this._list!.getHTMLElement().style.height = `${listHeight}px`;
			this._list!.splice(0, this._list!.length, [...artifacts]);
		});
	}

	private async _openScreenshotInCarousel(clicked: IChatArtifact): Promise<void> {
		const allArtifacts = this._currentObs?.get() ?? [];
		const screenshots = allArtifacts.filter(a => a.type === 'screenshot');
		const startIndex = screenshots.indexOf(clicked);

		const images = await Promise.all(screenshots.map(async a => {
			const uri = URI.parse(a.uri);
			const content = await this._fileService.readFile(uri);
			const name = uri.path.split('/').pop() ?? 'image';
			return {
				id: a.uri,
				name,
				mimeType: getMediaMime(name) ?? 'image/png',
				data: content.value.buffer,
			};
		}));

		await this._commandService.executeCommand('workbench.action.chat.openImageInCarousel', {
			collection: {
				id: this._sessionResource!.toString() + '_artifacts_carousel',
				title: localize('chat.artifacts.carousel', "Artifacts"),
				sections: [{ title: '', images }],
			},
			startIndex: Math.max(0, startIndex),
		});
	}

	private _clearAllArtifacts(): void {
		if (!this._sessionResource) {
			return;
		}
		this._chatArtifactsService.setArtifacts(this._sessionResource, []);
	}

	hide(): void {
		this._autorunDisposable.clear();
		this.domNode.style.display = 'none';
	}
}

class ChatArtifactsListDelegate implements IListVirtualDelegate<IChatArtifact> {
	getHeight(): number {
		return ChatArtifactsWidget.ELEMENT_HEIGHT;
	}
	getTemplateId(): string {
		return ChatArtifactsListRenderer.TEMPLATE_ID;
	}
}

interface IChatArtifactsListTemplate {
	readonly container: HTMLElement;
	readonly iconElement: HTMLElement;
	readonly labelElement: HTMLElement;
}

class ChatArtifactsListRenderer implements IListRenderer<IChatArtifact, IChatArtifactsListTemplate> {
	static readonly TEMPLATE_ID = 'chatArtifactsListRenderer';
	readonly templateId = ChatArtifactsListRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IChatArtifactsListTemplate {
		const row = dom.append(container, dom.$('.chat-artifacts-list-row'));
		const iconElement = dom.append(row, dom.$('.chat-artifacts-list-icon'));
		const labelElement = dom.append(row, dom.$('.chat-artifacts-list-label'));
		return { container: row, iconElement, labelElement };
	}

	renderElement(artifact: IChatArtifact, _index: number, templateData: IChatArtifactsListTemplate): void {
		const icon = (artifact.type && ARTIFACT_TYPE_ICONS[artifact.type]) || Codicon.archive;
		templateData.iconElement.className = 'chat-artifacts-list-icon ' + ThemeIcon.asClassName(icon);
		templateData.labelElement.textContent = artifact.label;
		templateData.container.title = artifact.uri;
	}

	disposeTemplate(): void { }
}
