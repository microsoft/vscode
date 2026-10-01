/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun, derived, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ChatDropdownPillActionViewItem, ChatPillSingleEntry } from '../../../../workbench/browser/chatDropdownPill.js';
import { ChatPillsWidget, IChatPill, IChatPillSection, getChatPillLocationHover, getChatPillResourceLocation } from '../../../../workbench/browser/chatPills.js';
import { sessionPullRequestsPillOptions, sessionReferencesPillOptions } from '../../../../workbench/contrib/chat/browser/sessionChatPillOptions.js';
import { chatArtifactPillOptions } from '../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { ISessionArtifact, SessionArtifactKind } from '../../../services/sessions/common/session.js';
import { buildSessionArtifactSections, ISessionArtifactActions } from '../../chat/browser/sessionArtifacts.js';
import { computePullRequestIcon, getPullRequestStatusFromIcon } from '../../github/common/types.js';
import { IProjectBoardCard } from '../common/projectBoardModel.js';
import { IProjectBoardContext, IProjectBoardMetadata } from './projectBoardMetadata.js';

function getPullRequestStateLabel(pullRequest: IProjectBoardCard['pullRequests'][number]): string {
	const state = pullRequest.state === 'merged' || pullRequest.state === 'closed'
		? pullRequest.state : getPullRequestStatusFromIcon(pullRequest.icon) ?? pullRequest.state;
	return state === 'merged' ? localize('projectBoard.prMerged', "Merged")
		: state === 'closed' ? localize('projectBoard.prClosed', "Closed")
			: state === 'draft' ? localize('projectBoard.prDraft', "Draft")
				: state === 'open' ? localize('projectBoard.prOpen', "Open")
					: localize('projectBoard.prUnknown', "State unavailable");
}

export function getProjectBoardPullRequestLabel(pullRequest: IProjectBoardCard['pullRequests'][number]): string {
	const state = getPullRequestStateLabel(pullRequest);
	return pullRequest.title
		? localize('projectBoard.prTitleState', "{0}: {1}, {2}", pullRequest.label, pullRequest.title, state)
		: localize('projectBoard.prState', "{0}, {1}", pullRequest.label, state);
}

export function getProjectBoardContext(card: IProjectBoardCard, metadata: IProjectBoardMetadata | undefined) {
	const artifacts = card.sharedContext.flatMap(item => item.artifact?.isArtifact ? [item.artifact] : []);
	const seen = new Set([
		...card.pullRequests.map(item => item.uri.toString()),
		...card.sharedContext.filter(item => item.artifact?.isArtifact).map(item => item.uri.toString()),
	]);
	const references = card.sharedContext.filter(item => !item.artifact?.isArtifact && !seen.has(item.uri.toString()));
	for (const item of references) {
		seen.add(item.uri.toString());
	}
	const promptContext = metadata?.kind === 'ready' ? metadata.context.filter(item => {
		const key = item.uri.toString();
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	}) : [];
	return { artifacts, references, promptContext };
}

type ContextSections = Record<'artifacts' | 'references' | 'pullRequests', readonly IChatPillSection[]>;

export class ProjectBoardContextPills extends Disposable {
	readonly element: HTMLElement;
	private readonly sections = observableValue<ContextSections>(this, { artifacts: [], references: [], pullRequests: [] });
	private readonly pills = observableValue<readonly IChatPill[]>(this, []);
	private previous: { readonly sharedContext: IProjectBoardCard['sharedContext']; readonly pullRequests: IProjectBoardCard['pullRequests']; readonly metadataContext: readonly IProjectBoardContext[] | undefined } | undefined;

	constructor(
		document: Document,
		private readonly open: (uri: URI, external: boolean) => Promise<void>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.element = document.adoptNode(mainWindow.document.createElement('div'));
		this.element.className = 'project-board-context-pills';
		const widget = this._register(instantiationService.createInstance(ChatPillsWidget, { pills: this.pills }, {
			ariaLabel: localize('projectBoard.contextPills', "Chat artifacts, references and pull requests"),
		}));
		// Adopt the empty toolbar before rendering buttons so native popup listeners
		// belong to the card's window, including standalone boards.
		this.element.appendChild(widget.element);
		const sources = ([
			['artifacts', chatArtifactPillOptions],
			['references', sessionReferencesPillOptions],
			['pullRequests', sessionPullRequestsPillOptions],
		] as const).map(([kind, options]) => {
			const sections = derived(reader => this.sections.read(reader)[kind]);
			const action = this._register(new Action(`projectBoard.${kind}`, options.title));
			const pill: IChatPill = {
				action,
				createActionViewItem: viewOptions => instantiationService.createInstance(ChatDropdownPillActionViewItem, action, viewOptions, sections, {
					...options, widgetId: `projectBoard.${kind}.${generateUuid()}`, singleEntry: ChatPillSingleEntry.Summary,
				}),
			};
			return { sections, pill };
		});
		this._register(autorun(reader => {
			this.pills.set(sources.filter(source => source.sections.read(reader).some(section => section.entries.length)).map(source => source.pill), undefined);
		}));
	}

	update(card: IProjectBoardCard, metadata: IProjectBoardMetadata | undefined): void {
		const next = { sharedContext: card.sharedContext, pullRequests: card.pullRequests, metadataContext: metadata?.kind === 'ready' ? metadata.context : undefined };
		if (equals(this.previous, next)) {
			return;
		}
		this.previous = next;
		const context = getProjectBoardContext(card, metadata);
		const actions: ISessionArtifactActions = {
			openExternal: uri => { void this.open(uri, true); },
			openResource: uri => { void this.open(uri, false); },
			openImages: (images, index) => { void this.open(images[index].uri, false); },
			copy: text => { void this.copy(text); },
		};
		const references: ISessionArtifact[] = context.references.map(item => item.artifact ?? {
			id: item.uri.toString(), label: item.label, isArtifact: false,
			kind: SessionArtifactKind.Resource, uri: item.uri,
		});
		const referenceSections = [...buildSessionArtifactSections(references, actions, this.labelService, false, new Set())];
		if (context.promptContext.length) {
			referenceSections.push({
				title: localize('projectBoard.promptContext', "Last prompt context"),
				entries: context.promptContext.map(item => ({
					id: item.uri.toString(), label: item.label, resource: item.uri,
					...getChatPillResourceLocation(item.uri, item.label),
					open: () => { void this.open(item.uri, false); },
				})),
			});
		}
		this.sections.set({
			artifacts: buildSessionArtifactSections(context.artifacts, actions, this.labelService, false, new Set()),
			references: referenceSections,
			pullRequests: card.pullRequests.length ? [{
				title: sessionPullRequestsPillOptions.title,
				entries: card.pullRequests.map(item => ({
					id: item.uri.toString(), label: item.label, badge: getPullRequestStateLabel(item),
					icon: item.icon ?? (item.state ? computePullRequestIcon(item.state) : Codicon.gitPullRequest),
					...getChatPillResourceLocation(item.uri, item.label, getProjectBoardPullRequestLabel(item)),
					hover: getChatPillLocationHover(`${getProjectBoardPullRequestLabel(item)}\n${item.uri.toString(true)}`),
					tooltip: `${getProjectBoardPullRequestLabel(item)}\n${item.uri.toString(true)}`,
					open: () => { void this.open(item.uri, true); },
				})),
			}] : [],
		}, undefined);
	}

	private async copy(text: string): Promise<void> {
		try {
			await this.clipboardService.writeText(text);
		} catch (error) {
			this.logService.error('[ProjectBoard] Failed to copy context location', error);
			this.notificationService.error(localize('projectBoard.copyContextFailed', "The context location could not be copied."));
		}
	}

	override dispose(): void {
		super.dispose();
		this.element.remove();
	}
}
