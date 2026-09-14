/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionReview.css';
import { $, Dimension, size } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { EditorExtensions, IEditorOpenContext, IUntypedEditorInput } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { AbstractChatView } from '../../../browser/parts/chatView.js';
import { SessionReviewArtifactsFocusContext } from '../../../common/contextkeys.js';
import { activeSessionViewBackground, activeSessionViewForeground } from '../../../common/theme.js';
import { IChatViewFactory } from '../../../services/chatView/browser/chatViewFactory.js';
import { ISessionContext, SessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionArtifact, SessionArtifactKind } from '../../../services/sessions/common/session.js';
import { SessionReviewSection } from '../../../services/sessions/common/sessionReview.js';
import { getArtifactPullRequest } from '../common/sessionReviewResources.js';

export class SessionReviewEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.sessionReview';
	override get typeId(): string { return SessionReviewEditorInput.ID; }
	override get editorId(): string { return SessionReviewEditor.ID; }
	override get resource(): URI { return this.sessionResource; }
	readonly status = observableValue(this, localize('sessionReview.loadingResult', "Opening the session result..."));

	constructor(readonly sessionResource: URI, readonly section: SessionReviewSection) {
		super();
	}

	override getName(): string {
		switch (this.section) {
			case SessionReviewSection.Conversation: return localize('sessionReview.conversation', "Conversation");
			case SessionReviewSection.Artifacts: return localize('sessionReview.artifacts', "Artifacts");
			case SessionReviewSection.Changes: return localize('sessionReview.changes', "Changes");
			case SessionReviewSection.PullRequest: return localize('sessionReview.pullRequest', "Pull Request");
		}
	}

	override getIcon() {
		switch (this.section) {
			case SessionReviewSection.Conversation: return Codicon.commentDiscussion;
			case SessionReviewSection.Artifacts: return Codicon.files;
			case SessionReviewSection.Changes: return Codicon.gitCompare;
			case SessionReviewSection.PullRequest: return Codicon.gitPullRequest;
		}
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return other instanceof SessionReviewEditorInput && other.section === this.section && isEqual(other.sessionResource, this.sessionResource);
	}
}

type ArtifactItem = { readonly kind: 'group'; readonly id: string; readonly label: string } | { readonly kind: 'artifact'; readonly artifact: ISessionArtifact };
interface IArtifactTemplate { readonly icon: HTMLElement; readonly label: IconLabel; readonly store: DisposableStore }

class ArtifactRenderer implements ITreeRenderer<ArtifactItem, void, IArtifactTemplate> {
	readonly templateId = 'sessionReviewArtifact';
	constructor(private readonly labels: ILabelService) { }
	renderTemplate(container: HTMLElement): IArtifactTemplate {
		const store = new DisposableStore();
		container.classList.add('session-review-artifact-row');
		const icon = $('.session-review-artifact-icon');
		const labelContainer = $('.session-review-artifact-label');
		container.append(icon, labelContainer);
		return { icon, label: store.add(new IconLabel(labelContainer)), store };
	}
	renderElement(node: ITreeNode<ArtifactItem, void>, _index: number, template: IArtifactTemplate): void {
		if (node.element.kind === 'group') {
			template.icon.replaceChildren(renderIcon(Codicon.folder));
			template.label.setLabel(node.element.label);
		} else {
			const artifact = node.element.artifact;
			const resource = artifact.uri ?? artifact.link;
			const description = resource ? this.labels.getUriLabel(resource, { relative: true }) : artifact.commitHash;
			const icon = artifact.kind === SessionArtifactKind.PullRequest ? Codicon.gitPullRequest
				: artifact.kind === SessionArtifactKind.Website ? Codicon.globe : Codicon.file;
			template.icon.replaceChildren(renderIcon(icon));
			template.label.setLabel(artifact.label, description, { title: description ?? artifact.label });
		}
	}
	disposeTemplate(template: IArtifactTemplate): void { template.store.dispose(); }
}

/** A native editor for the session transcript or the lightweight artifact catalog. */
export class SessionReviewEditor extends EditorPane {
	static readonly ID = 'workbench.editor.sessionReview';
	private _container: HTMLElement | undefined;
	private readonly _content = this._register(new MutableDisposable<DisposableStore>());
	private _chatView: AbstractChatView | undefined;
	private _tree: WorkbenchObjectTree<ArtifactItem, void> | undefined;
	private _treeContainer: HTMLElement | undefined;
	private _emptyAction: Button | undefined;
	private _dimension: Dimension | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IChatViewFactory private readonly chatViewFactory: IChatViewFactory,
		@ILabelService private readonly labelService: ILabelService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super(SessionReviewEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = $('.session-review-content-editor');
		this._container.style.setProperty('--session-view-background', asCssVariable(activeSessionViewBackground));
		this._container.style.setProperty('--session-view-foreground', asCssVariable(activeSessionViewForeground));
		parent.appendChild(this._container);
	}

	override async setInput(input: SessionReviewEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!this._container || token.isCancellationRequested) { return; }
		const store = new DisposableStore();
		this._content.value = store;
		this._chatView = undefined;
		this._tree = undefined;
		this._treeContainer = undefined;
		this._emptyAction = undefined;
		this._container.replaceChildren();
		this._container.classList.toggle('session-review-catalog', input.section === SessionReviewSection.Artifacts);
		const session = this.sessionsService.visibleSessions.get().find(candidate => candidate && isEqual(candidate.resource, input.sessionResource));
		if (!session) {
			const empty = $('.session-review-empty');
			empty.textContent = localize('sessionReview.unavailable', "This session is no longer available.");
			this._container.appendChild(empty);
			return;
		}
		const scopedContext = store.add(this.contextKeyService.createScoped(this._container));
		const scopedInstantiation = store.add(this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContext],
			[ISessionContext, new SessionContext(constObservable(session))],
		)));
		if (input.section === SessionReviewSection.Conversation) {
			const chat = store.add(this.chatViewFactory.createChatView(scopedInstantiation));
			this._chatView = chat;
			chat.setInputVisible(false);
			this._container.appendChild(chat.element);
			store.add(autorun(reader => chat.setChat(session.activeChat.read(reader), session.sessionId, session)));
			chat.setActive(true);
			chat.setVisible(this.isVisible());
		} else if (input.section === SessionReviewSection.Artifacts) {
			SessionReviewArtifactsFocusContext.bindTo(scopedContext).set(true);
			const heading = $('.session-review-catalog-header');
			const title = $('h2');
			title.textContent = localize('sessionReview.catalogTitle', "Artifacts and references");
			const description = $('p');
			description.textContent = localize('sessionReview.catalogDescription', "Open a file or link to inspect it. Your reply stays with this session.");
			heading.append(title, description);
			const empty = $('.session-review-catalog-empty');
			const emptyTitle = $('strong');
			emptyTitle.textContent = localize('sessionReview.noArtifacts', "No artifacts recorded yet");
			const emptyDescription = $('p');
			emptyDescription.textContent = localize('sessionReview.noArtifactsDetail', "Files and links recorded by this session will appear here. You can keep the conversation going while you wait.");
			const emptyActions = $('div');
			empty.append(emptyTitle, emptyDescription, emptyActions);
			const conversation = store.add(new Button(emptyActions, { ...defaultButtonStyles, secondary: true }));
			conversation.label = localize('sessionReview.openConversation', "Open Conversation");
			this._emptyAction = conversation;
			store.add(conversation.onDidClick(() => {
				void this.sessionsService.openSessionReview(session, SessionReviewSection.Conversation).catch(error => this.notificationService.error(error));
			}));
			const treeContainer = this._treeContainer = $('.session-review-catalog-tree');
			this._container.append(heading, empty, treeContainer);
			const renderer = new ArtifactRenderer(this.labelService);
			const tree = store.add(scopedInstantiation.createInstance(WorkbenchObjectTree<ArtifactItem, void>,
				'SessionReviewArtifacts', treeContainer,
				{ getHeight: item => item.kind === 'group' ? 28 : 44, getTemplateId: () => renderer.templateId },
				[renderer], {
				identityProvider: { getId: item => item.kind === 'group' ? `group:${item.id}` : item.artifact.id },
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('sessionReview.artifactList', "Session Artifacts and References"),
					getAriaLabel: item => item.kind === 'group' ? item.label : item.artifact.label,
				},
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: item => item.kind === 'group' ? item.label : item.artifact.label },
			}));
			this._tree = tree;
			store.add(autorun(reader => {
				const artifacts = session.artifacts?.read(reader) ?? [];
				empty.hidden = artifacts.length > 0;
				treeContainer.hidden = artifacts.length === 0;
				const groups = [
					{ id: 'artifacts', label: localize('sessionReview.outputs', "Artifacts"), entries: artifacts.filter(item => item.isArtifact) },
					{ id: 'references', label: localize('sessionReview.references', "References"), entries: artifacts.filter(item => !item.isArtifact) },
				];
				tree.setChildren(null, groups.filter(group => group.entries.length > 0).map(group => ({
					element: { kind: 'group', id: group.id, label: localize('sessionReview.catalogCount', "{0} ({1})", group.label, group.entries.length) },
					children: group.entries.map(artifact => ({ element: { kind: 'artifact' as const, artifact } })),
				})));
				if (this._dimension) { this.layout(this._dimension); }
			}));
			store.add(tree.onDidOpen(event => {
				if (event.element?.kind !== 'artifact') { return; }
				const artifact = event.element.artifact;
				try {
					const pullRequest = getArtifactPullRequest(artifact);
					this.sessionsService.setSessionReviewSection(pullRequest ? SessionReviewSection.PullRequest : SessionReviewSection.Artifacts, { artifact, pullRequest, resource: artifact.uri ?? artifact.link });
				} catch (error) {
					this.notificationService.error(error);
				}
			}));
		} else {
			const loading = $('.session-review-empty');
			store.add(autorun(reader => { loading.textContent = input.status.read(reader); }));
			this._container.appendChild(loading);
		}
		if (this._dimension) { this.layout(this._dimension); }
	}

	override layout(dimension: Dimension): void {
		this._dimension = dimension;
		if (this._container) { size(this._container, dimension.width, dimension.height); }
		if (this._treeContainer) {
			this._tree?.layout(this._treeContainer.clientHeight, this._treeContainer.clientWidth);
		}
		this._chatView?.layout(dimension.width, dimension.height, 0, 0);
	}
	override focus(): void {
		if (this._chatView) { this._chatView.focus(); } else if (this._treeContainer?.hidden) { this._emptyAction?.focus(); } else { this._tree?.domFocus(); }
	}
	override setVisible(visible: boolean): void {
		super.setVisible(visible);
		this._chatView?.setVisible(visible);
	}
	override clearInput(): void {
		this._content.clear();
		this._chatView = undefined;
		this._tree = undefined;
		this._treeContainer = undefined;
		this._emptyAction = undefined;
		super.clearInput();
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(SessionReviewEditor, SessionReviewEditor.ID, localize('sessionReview.editor', "Session Review")),
	[new SyncDescriptor(SessionReviewEditorInput)],
);
