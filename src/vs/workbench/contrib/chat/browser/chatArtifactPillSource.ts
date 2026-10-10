/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getMediaMime } from '../../../../base/common/mime.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { getChatPillResourceLocation, IChatPillEntry, IChatPillSection } from '../../../browser/chatPills.js';
import { ChatMemoryFileResource } from '../common/chatArtifactExtraction.js';
import { getChatImageResourceComparisonKey } from '../common/chatImageExtraction.js';
import { ChatConfiguration } from '../common/constants.js';
import { ArtifactSource, IChatArtifact, IChatArtifacts, IChatArtifactsService } from '../common/tools/chatArtifactsService.js';
import { IChatImageCarouselService } from './chatImageCarouselService.js';
import { getEditorOverrideForChatResource } from './widget/chatEditorAssociations.js';

/** Transcript and rule artifacts adapted to the same pill used for recorded session artifacts. */
export class ChatArtifactPillSource extends Disposable {
	readonly sections: IObservable<readonly IChatPillSection[]>;

	constructor(
		sessionResource: IObservable<URI | undefined>,
		@IChatArtifactsService artifactsService: IChatArtifactsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatImageCarouselService private readonly imageCarouselService: IChatImageCarouselService,
		@IFileService private readonly fileService: IFileService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@ILabelService private readonly labelService: ILabelService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		const legacyArtifactsEnabled = observableConfigValue(ChatConfiguration.ArtifactsEnabled, false, configurationService);
		const imageCarouselEnabled = observableConfigValue(ChatConfiguration.ImageCarouselEnabled, true, configurationService);
		this.sections = derived(this, reader => {
			const session = sessionResource.read(reader);
			if (!session) {
				return [];
			}
			const artifacts = artifactsService.getArtifacts(session);
			const sections = new Map<string, IChatPillEntry[]>();
			for (const group of artifacts.artifactGroups.read(reader)) {
				const grouped = new Map<string, IChatArtifact[]>();
				for (const artifact of group.artifacts) {
					if (!artifact.generatedImageMimeType && !legacyArtifactsEnabled.read(reader)) {
						continue;
					}
					const title = artifact.groupName ?? (artifact.type === 'screenshot'
						? localize('chat.artifactPill.images', "Images")
						: localize('chat.artifactPill.files', "Files"));
					const entries = grouped.get(title) ?? [];
					entries.push(artifact);
					grouped.set(title, entries);
				}
				for (const [title, values] of grouped) {
					const entries = sections.get(title) ?? [];
					const clearAction = group.source.kind === 'rules' ? undefined : toAction({
						id: `chatArtifacts.clear.${group.source.kind === 'agent' ? 'agent' : group.source.invocationId}`,
						label: localize('chat.artifactPill.clearSource', "Clear {0} Artifacts", sourceName(group.source)),
						class: ThemeIcon.asClassName(Codicon.close),
						run: () => clearArtifacts(artifacts, group.source),
					});
					if (values[0].onlyShowGroup) {
						entries.push({
							id: `chatArtifacts.group.${group.source.kind}.${title}`,
							label: localize('chat.artifactPill.group', "{0} ({1})", title, values.length),
							icon: Codicon.fileMedia,
							promotedAction: clearAction,
							open: () => this.run(() => this.openImages(values, session)),
						});
					} else {
						for (const artifact of values) {
							const uri = URI.parse(artifact.uri);
							const label = artifact.label;
							const mimeType = artifact.generatedImageMimeType ?? getMediaMime(artifact.fileName ?? uri.path);
							entries.push({
								id: artifact.toolCallId ? `${artifact.toolCallId}:${artifact.dataPartIndex}` : artifact.uri,
								label,
								...(artifact.type === 'devServer' ? { icon: Codicon.globe } : { resource: uri }),
								...(mimeType?.startsWith('image/') ? { imagePreview: { resource: uri, mimeType } } : {}),
								...getChatPillResourceLocation(uri, label),
								toolbarActions: [
									toAction({
										id: 'chatArtifacts.save',
										label: localize('chat.artifactPill.save', "Save Artifact"),
										class: ThemeIcon.asClassName(Codicon.save),
										run: () => this.run(() => saveChatArtifact(artifact, this.fileService, this.fileDialogService)),
									}),
									toAction({
										id: 'chatArtifacts.copy',
										label: localize('chat.artifactPill.copy', "Copy Path"),
										class: ThemeIcon.asClassName(Codicon.copy),
										run: () => this.run(() => this.clipboardService.writeText(this.labelService.getUriLabel(uri, { noPrefix: true }))),
									}),
								],
								promotedAction: clearAction,
								open: artifact.type === 'screenshot' && imageCarouselEnabled.read(reader)
									? () => this.run(() => this.openImages(values, session, artifact))
									: () => this.run(() => this.openResource(uri)),
							});
						}
					}
					sections.set(title, entries);
				}
			}
			return [...sections].map(([title, entries]) => ({ title, entries }));
		});
	}

	private async openImages(artifacts: readonly IChatArtifact[], sessionResource: URI, first = artifacts[0]): Promise<void> {
		if (first) {
			await this.imageCarouselService.openCarouselAtResource(URI.parse(first.uri), undefined, {
				sessionResource,
				additionalImages: artifacts.flatMap(artifact => {
					const uri = URI.parse(artifact.uri);
					const mimeType = artifact.generatedImageMimeType ?? getMediaMime(artifact.fileName ?? uri.path);
					return mimeType?.startsWith('image/') ? [{ uri, mimeType, name: artifact.fileName ?? artifact.label }] : [];
				}),
			});
		}
	}

	private async openResource(uri: URI): Promise<void> {
		if (ChatMemoryFileResource.isChatMemoryFileUri(uri)) {
			const { memoryPath, sessionResource } = ChatMemoryFileResource.parse(uri);
			const resolved: string | undefined = await this.commandService.executeCommand('github.copilot.chat.tools.memory.resolveMemoryFileUri', memoryPath, sessionResource);
			if (!resolved) {
				throw new Error(localize('chat.artifactPill.unresolvedMemory', "The memory artifact could not be resolved."));
			}
			uri = URI.parse(resolved);
		}
		await this.openerService.open(uri, {
			fromUserGesture: true,
			editorOptions: { override: getEditorOverrideForChatResource(uri, this.configurationService) },
		});
	}

	private async run(action: () => Promise<void>): Promise<void> {
		try {
			await action();
		} catch (error) {
			this.notificationService.error(error);
		}
	}
}

function sourceName(source: ArtifactSource): string {
	return source.kind === 'agent' ? localize('chat.artifactPill.agent', "Agent")
		: source.kind === 'subagent' ? source.name ?? localize('chat.artifactPill.subagent', "Subagent")
			: localize('chat.artifactPill.rules', "Rules");
}

function clearArtifacts(artifacts: IChatArtifacts, source: ArtifactSource): void {
	if (source.kind === 'agent') {
		artifacts.clearAgentArtifacts();
	} else if (source.kind === 'subagent') {
		artifacts.clearSubagentArtifacts(source.invocationId);
	}
}

export async function saveChatArtifact(artifact: IChatArtifact, fileService: IFileService, fileDialogService: IFileDialogService): Promise<void> {
	const sourceUri = URI.parse(artifact.uri);
	const defaultFileName = artifact.fileName ?? sourceUri.path.split('/').pop() ?? artifact.label;
	const defaultPath = await fileDialogService.defaultFilePath();
	const targetUri = await fileDialogService.showSaveDialog({
		defaultUri: URI.joinPath(defaultPath, defaultFileName),
		title: localize('chat.artifacts.saveDialog.title', "Save Artifact"),
	});
	if (targetUri) {
		const content = await fileService.readFile(sourceUri);
		await fileService.writeFile(targetUri, content.value);
	}
}

/** Keep generated-image presentation while retaining removal of any matching recorded artifact. */
export function mergeChatArtifactSections(recorded: readonly IChatPillSection[], transcript: readonly IChatPillSection[]): readonly IChatPillSection[] {
	const recordedByResource = new Map(recorded.flatMap(section => section.entries.flatMap(entry =>
		entry.resource ? [[getChatImageResourceComparisonKey(entry.resource), entry] as const] : [])));
	const transcriptKeys = new Set(transcript.flatMap(section => section.entries.flatMap(entry =>
		entry.resource ? [getChatImageResourceComparisonKey(entry.resource)] : [])));
	const sections = new Map<string, IChatPillEntry[]>();
	for (const section of recorded) {
		const entries = section.entries.filter(entry => !entry.resource || !transcriptKeys.has(getChatImageResourceComparisonKey(entry.resource)));
		if (entries.length) {
			sections.set(section.title, [...entries]);
		}
	}
	for (const section of transcript) {
		const entries = section.entries.map(entry => {
			const recordedEntry = entry.resource && recordedByResource.get(getChatImageResourceComparisonKey(entry.resource));
			return recordedEntry ? { ...recordedEntry, ...entry, id: recordedEntry.id, promotedAction: recordedEntry.promotedAction } : entry;
		});
		sections.set(section.title, [...sections.get(section.title) ?? [], ...entries]);
	}
	return [...sections].map(([title, entries]) => ({ title, entries }));
}
