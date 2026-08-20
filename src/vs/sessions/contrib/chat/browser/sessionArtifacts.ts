/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader } from '../../../../base/common/observable.js';
import { basename, getComparisonKey } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { toAction } from '../../../../base/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import type { IChatPillEntry, IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { openChatTurnFile, previewKind } from '../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { SessionArtifactKind, SessionFileOperation, type ISessionArtifact, type ISessionFile } from '../../../services/sessions/common/session.js';
import type { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

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
	copy(text: string): void;
}

function artifactValueKey(artifact: ISessionArtifact): string {
	if (artifact.uri) {
		return getComparisonKey(artifact.uri);
	}
	return (artifact.link?.toString() ?? artifact.commitHash ?? artifact.id).toLowerCase();
}

function toEntry(artifact: ISessionArtifact, actions: ISessionArtifactActions): IChatPillEntry | undefined {
	if (artifact.kind === SessionArtifactKind.File) {
		return artifact.uri
			? { id: artifact.id, label: basename(artifact.uri), resource: artifact.uri, open: () => actions.openResource(artifact.uri!) }
			: undefined;
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
		return { id: artifact.id, label: artifact.label, icon, toolbarActions: copyAction, open: () => actions.openExternal(link) };
	}

	if (artifact.kind === SessionArtifactKind.Resource) {
		return artifact.uri
			? { id: artifact.id, label: artifact.label, icon, open: () => actions.openResource(artifact.uri!) }
			: undefined;
	}

	return artifact.link
		? { id: artifact.id, label: artifact.label, icon, open: () => actions.openExternal(artifact.link!) }
		: undefined;
}

/**
 * Builds the artifact sections shown in the pill: the agent-set artifacts plus
 * the previewable files the session wrote outside its workspace, de-duplicated
 * with the agent's own entries winning.
 */
export function buildSessionArtifactSections(artifacts: readonly ISessionArtifact[], externalFiles: readonly ISessionFile[], actions: ISessionArtifactActions): readonly IChatPillSection[] {
	const entriesByKind = new Map<SessionArtifactKind, IChatPillEntry[]>();
	const seen = new Set<string>();

	for (const artifact of artifacts) {
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
		if (file.operation === SessionFileOperation.Deleted || !previewKind(file.uri) || seen.has(getComparisonKey(file.uri))) {
			continue;
		}
		seen.add(getComparisonKey(file.uri));
		const entries = entriesByKind.get(SessionArtifactKind.File) ?? [];
		entries.push({ id: file.uri.toString(), label: basename(file.uri), resource: file.uri, open: () => actions.openResource(file.uri) });
		entriesByKind.set(SessionArtifactKind.File, entries);
	}

	const sections: IChatPillSection[] = [];
	for (const { kind, title } of sectionOrder) {
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
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super();

		this.sections = derived(this, reader => {
			const current = session.read(reader);
			if (!current) {
				return [];
			}
			return buildSessionArtifactSections(
				current.artifacts?.read(reader) ?? [],
				this._readExternalFiles(current, reader),
				this._actions(),
			);
		});
	}

	private _readExternalFiles(session: IActiveSession, reader: IReader): readonly ISessionFile[] {
		return session.externalChanges?.read(reader) ?? [];
	}

	private _actions(): ISessionArtifactActions {
		return {
			openExternal: link => { void this._openerService.open(link, { openExternal: true }); },
			openResource: uri => {
				if (previewKind(uri)) {
					void openChatTurnFile({ uri, kind: previewKind(uri)!, created: false }, this._openerService, this._configurationService);
					return;
				}
				void this._openerService.open(uri, { fromUserGesture: true });
			},
			copy: text => { void this._clipboardService.writeText(text); },
		};
	}
}
