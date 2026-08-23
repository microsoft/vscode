/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getMediaMime } from '../../../../base/common/mime.js';
import { derived, IObservable, IReader } from '../../../../base/common/observable.js';
import { basename, getComparisonKey } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { toAction } from '../../../../base/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import type { IChatPillEntry, IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { openChatTurnFile, previewKind } from '../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import type { IImageCarouselCollection } from '../../../../workbench/contrib/imageCarousel/browser/imageCarouselTypes.js';
import { SessionArtifactKind, SessionFileOperation, type ISessionArtifact, type ISessionFile } from '../../../services/sessions/common/session.js';
import type { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

const OPEN_IMAGE_CAROUSEL_COMMAND_ID = 'workbench.action.chat.openImageInCarousel';

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
 * The location details shown for an artifact: its URI/link as the hover beside
 * the dropdown row, the plain-text screen reader description, and the tooltip,
 * while the accessible name stays the action the entry performs.
 */
export function sessionArtifactLocation(uri: URI, label: string): Pick<IChatPillEntry, 'ariaDescription' | 'ariaLabel' | 'hover' | 'tooltip'> {
	const value = uri.toString(true);
	return {
		ariaDescription: value,
		ariaLabel: localize('sessionArtifacts.open', "Open {0}", label),
		hover: { content: new MarkdownString().appendText(value) },
		tooltip: value,
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

function toEntry(artifact: ISessionArtifact, actions: ISessionArtifactActions): IChatPillEntry | undefined {
	if (artifact.kind === SessionArtifactKind.File) {
		if (!artifact.uri) {
			return undefined;
		}
		const uri = artifact.uri;
		const label = basename(uri);
		return { id: artifact.id, label, resource: uri, ...sessionArtifactLocation(uri, label), open: () => actions.openResource(uri) };
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
		return { id: artifact.id, label: artifact.label, icon, toolbarActions: copyAction, ...sessionArtifactLocation(link, artifact.label), open: () => actions.openExternal(link) };
	}

	if (artifact.kind === SessionArtifactKind.Resource) {
		if (!artifact.uri) {
			return undefined;
		}
		const uri = artifact.uri;
		return { id: artifact.id, label: artifact.label, icon, ...sessionArtifactLocation(uri, artifact.label), open: () => actions.openResource(uri) };
	}

	if (!artifact.link) {
		return undefined;
	}
	const link = artifact.link;
	return { id: artifact.id, label: artifact.label, icon, ...sessionArtifactLocation(link, artifact.label), open: () => actions.openExternal(link) };
}

/**
 * Builds the artifact sections shown in the pill: the agent-set artifacts plus
 * the previewable files the session wrote outside its workspace, de-duplicated
 * with the agent's own entries winning. Websites the browsers pill already lists
 * are left out, so the same page is offered once across the two pills.
 */
export function buildSessionArtifactSections(artifacts: readonly ISessionArtifact[], externalFiles: readonly ISessionFile[], actions: ISessionArtifactActions, imageCarouselEnabled: boolean, browserUrls: ReadonlySet<string>): readonly IChatPillSection[] {
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
		const entry = toEntry(artifact, actions);
		if (!entry || seen.has(artifactValueKey(artifact))) {
			continue;
		}
		seen.add(artifactValueKey(artifact));
		const entries = entriesByKind.get(artifact.kind) ?? [];
		entries.push(entry);
		entriesByKind.set(artifact.kind, entries);
	}

	for (const file of externalFiles) {
		const imageMimeType = getImageMimeType(file.uri);
		if (file.operation === SessionFileOperation.Deleted || (!previewKind(file.uri) && !imageMimeType) || seen.has(getComparisonKey(file.uri))) {
			continue;
		}
		seen.add(getComparisonKey(file.uri));
		if (imageMimeType) {
			images.push({ uri: file.uri, mimeType: imageMimeType });
			continue;
		}
		const entries = entriesByKind.get(SessionArtifactKind.File) ?? [];
		const label = basename(file.uri);
		entries.push({ id: file.uri.toString(), label, resource: file.uri, ...sessionArtifactLocation(file.uri, label), open: () => actions.openResource(file.uri) });
		entriesByKind.set(SessionArtifactKind.File, entries);
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
						...sessionArtifactLocation(uri, label),
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

/** Publishes a session's artifact sections for the chat input pill. */
export class SessionArtifacts extends Disposable {

	readonly sections: IObservable<readonly IChatPillSection[]>;

	constructor(
		session: IObservable<IActiveSession | undefined>,
		/** The URLs the browsers pill lists; website artifacts for them are left out. */
		private readonly _browserUrls: IObservable<ReadonlySet<string>>,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super();

		const imageCarouselEnabled = observableConfigValue<boolean>(ChatConfiguration.ImageCarouselEnabled, true, this._configurationService);

		this.sections = derived(this, reader => {
			const current = session.read(reader);
			if (!current) {
				return [];
			}
			return buildSessionArtifactSections(
				current.artifacts?.read(reader) ?? [],
				this._readExternalFiles(current, reader),
				this._actions(),
				imageCarouselEnabled.read(reader),
				this._browserUrls.read(reader),
			);
		});
	}

	private _readExternalFiles(session: IActiveSession, reader: IReader): readonly ISessionFile[] {
		return session.externalChanges?.read(reader) ?? [];
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
