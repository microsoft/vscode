/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getMediaMime } from '../../../../base/common/mime.js';
import { matchesSomeScheme, Schemas } from '../../../../base/common/network.js';
import { derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { basename, getComparisonKey } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { toAction } from '../../../../base/common/actions.js';
import { AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import type { IChatPillEntry, IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { ChatPillSingleEntry, type IChatDropdownPillOptions } from '../../../../workbench/browser/chatDropdownPill.js';
import { openChatTurnFile, previewKind } from '../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import type { IImageCarouselCollection } from '../../../../workbench/contrib/imageCarousel/browser/imageCarouselTypes.js';
import { SessionArtifactKind, type ISessionArtifact } from '../../../services/sessions/common/session.js';
import type { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

const OPEN_IMAGE_CAROUSEL_COMMAND_ID = 'workbench.action.chat.openImageInCarousel';

/** Action id of the references pill. */
export const SESSION_REFERENCES_PILL_ID = 'sessions.chatPills.references';

/**
 * Presentation of the references pill. References are always summarized: the
 * pill answers "what did this session point me at" with a count, rather than
 * turning into whichever single reference happens to be recorded.
 */
export const sessionReferencesPillOptions: IChatDropdownPillOptions = {
	widgetId: 'sessionReferences',
	icon: Codicon.bookmark,
	title: localize('sessionReferences.title', "References"),
	summaryLabel: count => count === 1
		? localize('sessionReferences.countSingle', "1 Reference")
		: localize('sessionReferences.count', "{0} References", count),
	summaryAriaLabel: count => count === 1
		? localize('sessionReferences.showSingle', "Show 1 reference")
		: localize('sessionReferences.show', "Show {0} references", count),
	singleEntry: ChatPillSingleEntry.Summary,
};

const artifactIcons: ReadonlyMap<SessionArtifactKind, ThemeIcon> = new Map([
	[SessionArtifactKind.PullRequest, Codicon.gitPullRequest],
	[SessionArtifactKind.Issue, Codicon.issues],
	[SessionArtifactKind.Commit, Codicon.gitCommit],
	[SessionArtifactKind.Website, Codicon.globe],
	[SessionArtifactKind.Resource, Codicon.link],
]);

/** Section order and titles, matching the order artifacts are offered in. */
const sectionOrder: readonly { readonly kind: SessionArtifactKind; readonly title: string }[] = [
	{ kind: SessionArtifactKind.PullRequest, title: localize('sessionArtifacts.pullRequests', "Pull Requests") },
	{ kind: SessionArtifactKind.Issue, title: localize('sessionArtifacts.issues', "Issues") },
	{ kind: SessionArtifactKind.Commit, title: localize('sessionArtifacts.commits', "Commits") },
	{ kind: SessionArtifactKind.Website, title: localize('sessionArtifacts.websites', "Websites") },
	{ kind: SessionArtifactKind.File, title: localize('sessionArtifacts.files', "Files") },
	{ kind: SessionArtifactKind.Resource, title: localize('sessionArtifacts.resources', "Resources") },
];

/** What an artifact entry needs from the surrounding surface to be activated. */
export interface ISessionArtifactActions {
	openExternal(link: URI): void;
	openResource(uri: URI): void;
	openImages(images: readonly ISessionArtifactImage[], startIndex: number): void;
	copy(text: string): void;
}

export interface ISessionArtifactImage {
	readonly uri: URI;
	readonly mimeType: string;
}

function artifactValueKey(artifact: ISessionArtifact): string {
	if (artifact.uri) {
		return getComparisonKey(artifact.uri);
	}
	return (artifact.link?.toString() ?? artifact.commitHash ?? artifact.id).toLowerCase();
}

/**
 * Schemes naming a file on a file system. Their URIs read as paths, while
 * everything else — a web link, a scheme an agent made up — keeps its URI,
 * since a path label drops the scheme, authority and query and would leave
 * such a location reading like a file that is nowhere to be found.
 */
const pathSchemes = [Schemas.file, Schemas.vscodeRemote, Schemas.vscodeUserData, AGENT_HOST_SCHEME];

/**
 * How an artifact's location reads: a link keeps its URL, while a file reads as
 * a path — no scheme, tildified when it is under the user home, and relative to
 * the workspace folder holding it. A folder that is itself the workspace root
 * has no relative path, so it falls back to its full path.
 */
export function sessionArtifactLocationText(uri: URI, labelService: Pick<ILabelService, 'getUriLabel'>): string {
	if (!matchesSomeScheme(uri, ...pathSchemes)) {
		return uri.toString(true);
	}
	return labelService.getUriLabel(uri, { relative: true }) || labelService.getUriLabel(uri);
}

/**
 * The location details shown for an artifact: its path/link as the hover beside
 * the dropdown row, the plain-text screen reader description, and the tooltip,
 * while the accessible name stays the action the entry performs.
 */
export function sessionArtifactLocation(location: string, label: string): Pick<IChatPillEntry, 'ariaDescription' | 'ariaLabel' | 'hover' | 'tooltip'> {
	return {
		ariaDescription: location,
		ariaLabel: localize('sessionArtifacts.open', "Open {0}", label),
		hover: { content: new MarkdownString().appendText(location) },
		tooltip: location,
	};
}

function getImageMimeType(uri: URI): string | undefined {
	const mimeType = getMediaMime(uri.path);
	return mimeType?.startsWith('image/') ? mimeType : undefined;
}

/**
 * A comparison key for a website URL that ignores origin casing and a trailing
 * slash, so an artifact and the browser showing it are recognized as the same page.
 */
function websiteKey(url: string): string | undefined {
	const parsed = URL.parse(url);
	if (!parsed) {
		return undefined;
	}
	const path = parsed.pathname.length > 1 && parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
	return `${parsed.protocol}//${parsed.host}${path}${parsed.search}${parsed.hash}`;
}

/** Whether a website artifact points at a page one of the listed browsers shows. */
function isShownInBrowser(link: URI | undefined, browserKeys: ReadonlySet<string>): boolean {
	if (!link || browserKeys.size === 0) {
		return false;
	}
	const key = websiteKey(link.toString());
	return !!key && browserKeys.has(key);
}

function toEntry(artifact: ISessionArtifact, actions: ISessionArtifactActions, labelService: Pick<ILabelService, 'getUriLabel'>): IChatPillEntry | undefined {
	if (artifact.kind === SessionArtifactKind.File) {
		if (!artifact.uri) {
			return undefined;
		}
		const uri = artifact.uri;
		const label = basename(uri);
		return { id: artifact.id, label, resource: uri, ...sessionArtifactLocation(sessionArtifactLocationText(uri, labelService), label), open: () => actions.openResource(uri) };
	}

	const icon = artifactIcons.get(artifact.kind) ?? Codicon.archive;
	if (artifact.kind === SessionArtifactKind.Commit) {
		if (!artifact.link) {
			return undefined;
		}
		const link = artifact.link;
		const copyAction = artifact.commitHash
			? [toAction({
				id: 'sessions.artifacts.copyCommitHash',
				label: localize('sessionArtifacts.copyCommitHash', "Copy Commit Hash"),
				class: ThemeIcon.asClassName(Codicon.copy),
				run: () => actions.copy(artifact.commitHash!),
			})]
			: [];
		return { id: artifact.id, label: artifact.label, icon, toolbarActions: copyAction, ...sessionArtifactLocation(sessionArtifactLocationText(link, labelService), artifact.label), open: () => actions.openExternal(link) };
	}

	if (artifact.kind === SessionArtifactKind.Resource) {
		if (!artifact.uri) {
			return undefined;
		}
		const uri = artifact.uri;
		return { id: artifact.id, label: artifact.label, icon, ...sessionArtifactLocation(sessionArtifactLocationText(uri, labelService), artifact.label), open: () => actions.openResource(uri) };
	}

	if (!artifact.link) {
		return undefined;
	}
	const link = artifact.link;
	const isGitHubReference = artifact.kind === SessionArtifactKind.PullRequest || artifact.kind === SessionArtifactKind.Issue;
	const copyLinkAction = isGitHubReference
		? [toAction({
			id: 'sessions.artifacts.copyLink',
			label: artifact.kind === SessionArtifactKind.PullRequest
				? localize('sessionArtifacts.copyPullRequestLink', "Copy Pull Request Link")
				: localize('sessionArtifacts.copyIssueLink', "Copy Issue Link"),
			class: ThemeIcon.asClassName(Codicon.copy),
			run: () => actions.copy(link.toString(true)),
		})]
		: [];
	return { id: artifact.id, label: artifact.label, icon, toolbarActions: copyLinkAction, ...sessionArtifactLocation(sessionArtifactLocationText(link, labelService), artifact.label), open: () => actions.openExternal(link) };
}

/**
 * Builds the sections shown in a pill from one group of agent-set entries —
 * the artifacts pill and the references pill each build their own. Websites
 * the browsers pill already lists are left out, so the same page is offered
 * once across the pills.
 */
export function buildSessionArtifactSections(artifacts: readonly ISessionArtifact[], actions: ISessionArtifactActions, labelService: Pick<ILabelService, 'getUriLabel'>, imageCarouselEnabled: boolean, browserUrls: ReadonlySet<string>): readonly IChatPillSection[] {
	const entriesByKind = new Map<SessionArtifactKind, IChatPillEntry[]>();
	const images: ISessionArtifactImage[] = [];
	const seen = new Set<string>();
	const browserKeys = new Set<string>();
	for (const url of browserUrls) {
		const key = websiteKey(url);
		if (key) {
			browserKeys.add(key);
		}
	}

	for (const artifact of artifacts) {
		if (artifact.kind === SessionArtifactKind.Website && isShownInBrowser(artifact.link, browserKeys)) {
			continue;
		}
		const imageMimeType = artifact.uri ? getImageMimeType(artifact.uri) : undefined;
		if (artifact.kind === SessionArtifactKind.File && artifact.uri && imageMimeType) {
			if (!seen.has(artifactValueKey(artifact))) {
				seen.add(artifactValueKey(artifact));
				images.push({ uri: artifact.uri, mimeType: imageMimeType });
			}
			continue;
		}
		const entry = toEntry(artifact, actions, labelService);
		if (!entry || seen.has(artifactValueKey(artifact))) {
			continue;
		}
		seen.add(artifactValueKey(artifact));
		const entries = entriesByKind.get(artifact.kind) ?? [];
		entries.push(entry);
		entriesByKind.set(artifact.kind, entries);
	}

	const sections: IChatPillSection[] = [];
	for (const { kind, title } of sectionOrder) {
		if (kind === SessionArtifactKind.File && images.length) {
			sections.push({
				title: localize('sessionArtifacts.images', "Images"),
				entries: images.map(({ uri }, index) => {
					const label = basename(uri);
					return {
						id: uri.toString(),
						label,
						resource: uri,
						...sessionArtifactLocation(sessionArtifactLocationText(uri, labelService), label),
						...(imageCarouselEnabled
							? {
								ariaLabel: localize('sessionArtifacts.openImage', "Open {0} in Images Preview", label),
								open: () => actions.openImages(images, index),
							}
							: { open: () => actions.openResource(uri) }),
					};
				}),
			});
		}
		const entries = entriesByKind.get(kind);
		if (entries?.length) {
			sections.push({ title, entries });
		}
	}
	return sections;
}

/** Publishes a session's artifact and reference sections for the chat input pills. */
export class SessionArtifacts extends Disposable {

	/** Sections for the artifacts pill: what the session produced. */
	readonly sections: IObservable<readonly IChatPillSection[]>;
	/** Sections for the references pill: what the session points the user at. */
	readonly referenceSections: IObservable<readonly IChatPillSection[]>;

	constructor(
		session: IObservable<IActiveSession | undefined>,
		/** The URLs the browsers pill lists; website entries for them are left out. */
		private readonly _browserUrls: IObservable<ReadonlySet<string>>,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super();

		const imageCarouselEnabled = observableConfigValue<boolean>(ChatConfiguration.ImageCarouselEnabled, true, this._configurationService);
		// Rebuild after formatter/folder changes because the session folder mounts after activation.
		const locationFormatting = observableSignalFromEvent(this, Event.any<unknown>(this._labelService.onDidChangeFormatters, workspaceContextService.onDidChangeWorkspaceFolders));

		const sectionsFor = (isArtifact: boolean) => derived(this, reader => {
			const current = session.read(reader);
			if (!current) {
				return [];
			}
			locationFormatting.read(reader);
			return buildSessionArtifactSections(
				(current.artifacts?.read(reader) ?? []).filter(artifact => artifact.isArtifact === isArtifact),
				this._actions(),
				this._labelService,
				imageCarouselEnabled.read(reader),
				this._browserUrls.read(reader),
			);
		});

		this.sections = sectionsFor(true);
		this.referenceSections = sectionsFor(false);
	}

	private _actions(): ISessionArtifactActions {
		return {
			// Contributed openers make a link behave the same here as in the response
			// markdown it came from, so a localhost page lands in the integrated
			// browser rather than the system one.
			openExternal: link => { void this._openerService.open(link, { openExternal: true, allowContributedOpeners: true, fromUserGesture: true }); },
			openResource: uri => {
				if (previewKind(uri)) {
					void openChatTurnFile({ uri, kind: previewKind(uri)!, created: false }, this._openerService, this._configurationService);
					return;
				}
				void this._openerService.open(uri, { fromUserGesture: true });
			},
			openImages: (images, startIndex) => {
				const collection: IImageCarouselCollection = {
					id: generateUuid(),
					title: localize('sessionArtifacts.imageCarouselTitle', "Artifact Images"),
					sections: [{
						title: localize('sessionArtifacts.images', "Images"),
						images: images.map(image => ({
							id: image.uri.toString(),
							name: basename(image.uri),
							mimeType: image.mimeType,
							uri: image.uri,
						})),
					}],
				};
				void this._commandService.executeCommand(OPEN_IMAGE_CAROUSEL_COMMAND_ID, { collection, startIndex });
			},
			copy: text => { void this._clipboardService.writeText(text); },
		};
	}
}
