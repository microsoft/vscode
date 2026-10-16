/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorExtensions, EditorInputWithOptions, EditorsOrder, IEditorFactoryRegistry, IEditorSerializer, IResourceDiffEditorInput } from '../../../common/editor.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService, IUntypedEditorReplacement } from '../../../services/editor/common/editorService.js';
import { CustomEditorInput } from '../../customEditor/browser/customEditorInput.js';
import { AUDIO_PREVIEW_EDITOR_ID, AUDIO_PREVIEW_FILE_PATTERN, IMAGE_PREVIEW_EDITOR_ID, IMAGE_PREVIEW_FILE_PATTERN, VIDEO_PREVIEW_AUTO_PLAY_SETTING, VIDEO_PREVIEW_EDITOR_ID, VIDEO_PREVIEW_FILE_PATTERN, VIDEO_PREVIEW_LOOP_SETTING } from '../common/mediaPreview.js';
import { ImagePreviewEditor } from './imagePreviewEditor.js';
import { ImagePreviewEditorInput } from './imagePreviewEditorInput.js';
import { CopyImageAction, registerImageViewerCopyCommand, ReopenImageAsPreviewAction, ReopenImageAsTextAction, SelectImageZoomLevelAction, ZoomInImageAction, ZoomOutImageAction } from './mediaPreviewActions.js';
import { isMediaPlayerKind, MediaPlayerEditorInput, MediaPlayerKind } from './mediaPlayerEditorInput.js';
import { MediaPreviewStatusBarContribution } from './mediaPreviewStatusBar.js';

// --- Configuration ---

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'mediaPreview',
	title: localize('mediaPreviewConfigurationTitle', "Media Preview"),
	type: 'object',
	properties: {
		[VIDEO_PREVIEW_AUTO_PLAY_SETTING]: {
			type: 'boolean',
			default: false,
			markdownDescription: localize('mediaPreview.video.autoPlay', "Start playing videos on mute automatically."),
		},
		[VIDEO_PREVIEW_LOOP_SETTING]: {
			type: 'boolean',
			default: false,
			markdownDescription: localize('mediaPreview.video.loop', "Loop videos over again automatically."),
		},
	}
});

// --- Editor Panes ---

// Audio and video open in the webview editor, which is registered for all `WebviewInput`s
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ImagePreviewEditor,
		ImagePreviewEditor.ID,
		localize('imagePreviewEditor', "Image Preview")
	),
	[
		new SyncDescriptor(ImagePreviewEditorInput)
	]
);

// --- Serializers ---

interface ISerializedImagePreviewInput {
	readonly resource: UriComponents;
	readonly preferredResource: UriComponents;
}

interface ISerializedMediaPlayerInput {
	readonly kind: MediaPlayerKind;
	readonly resource: UriComponents;
}

class ImagePreviewEditorInputSerializer implements IEditorSerializer {

	canSerialize(): boolean {
		return true;
	}

	serialize(input: ImagePreviewEditorInput): string {
		return JSON.stringify({
			resource: input.resource.toJSON(),
			preferredResource: input.preferredResource.toJSON(),
		} satisfies ISerializedImagePreviewInput);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): ImagePreviewEditorInput {
		const data: ISerializedImagePreviewInput = JSON.parse(serializedEditor);
		return instantiationService.createInstance(ImagePreviewEditorInput, URI.revive(data.resource), URI.revive(data.preferredResource));
	}
}

class MediaPlayerEditorInputSerializer implements IEditorSerializer {

	canSerialize(): boolean {
		return true;
	}

	serialize(input: MediaPlayerEditorInput): string {
		return JSON.stringify({ kind: input.kind, resource: input.resource.toJSON() } satisfies ISerializedMediaPlayerInput);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): MediaPlayerEditorInput | undefined {
		const data: ISerializedMediaPlayerInput = JSON.parse(serializedEditor);
		if (!isMediaPlayerKind(data.kind)) {
			return undefined;
		}
		return MediaPlayerEditorInput.create(instantiationService, data.kind, URI.revive(data.resource), undefined);
	}
}

const editorFactoryRegistry = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);
editorFactoryRegistry.registerEditorSerializer(ImagePreviewEditorInput.ID, ImagePreviewEditorInputSerializer);
editorFactoryRegistry.registerEditorSerializer(MediaPlayerEditorInput.typeId, MediaPlayerEditorInputSerializer);

// --- Editor Resolver ---

class MediaPreviewEditorResolverContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.mediaPreviewEditorResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const createDiffEditorInput = ({ original, modified, label, description }: IResourceDiffEditorInput, createInput: (resource: URI) => EditorInput): EditorInputWithOptions => {
			if (!original.resource || !modified.resource) {
				throw new Error('Media previews require a resource on both sides of a diff');
			}

			// Show both sides next to each other in the side by side editor
			return { editor: instantiationService.createInstance(DiffEditorInput, label, description, createInput(original.resource), createInput(modified.resource), true) };
		};

		const createImageInput = (resource: URI) => instantiationService.createInstance(ImagePreviewEditorInput, resource, undefined);
		this._register(editorResolverService.registerEditor(
			IMAGE_PREVIEW_FILE_PATTERN,
			{
				id: IMAGE_PREVIEW_EDITOR_ID,
				label: localize('imagePreview.displayName', "Image Preview"),
				detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
				priority: RegisteredEditorPriority.builtin,
			},
			{},
			{
				createEditorInput: ({ resource }) => ({ editor: createImageInput(resource) }),
				createDiffEditorInput: diffEditorInput => createDiffEditorInput(diffEditorInput, createImageInput),
			}
		));

		const registerMediaPlayer = (kind: MediaPlayerKind, filePattern: string, id: string, label: string) => {
			this._register(editorResolverService.registerEditor(
				filePattern,
				{
					id,
					label,
					detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
					priority: RegisteredEditorPriority.builtin,
				},
				{},
				{
					createEditorInput: ({ resource }, group) => ({ editor: MediaPlayerEditorInput.create(instantiationService, kind, resource, group.id) }),
					createDiffEditorInput: (diffEditorInput, group) => createDiffEditorInput(diffEditorInput, resource => MediaPlayerEditorInput.create(instantiationService, kind, resource, group.id)),
				}
			));
		};
		registerMediaPlayer('video', VIDEO_PREVIEW_FILE_PATTERN, VIDEO_PREVIEW_EDITOR_ID, localize('videoPreview.displayName', "Video Preview"));
		registerMediaPlayer('audio', AUDIO_PREVIEW_FILE_PATTERN, AUDIO_PREVIEW_EDITOR_ID, localize('audioPreview.displayName', "Audio Preview"));
	}
}

registerWorkbenchContribution2(MediaPreviewEditorResolverContribution.ID, MediaPreviewEditorResolverContribution, WorkbenchPhase.BlockStartup);

// --- Migration of editors restored from previous sessions ---

const legacyMediaPreviewViewTypes = new Set([IMAGE_PREVIEW_EDITOR_ID, VIDEO_PREVIEW_EDITOR_ID, AUDIO_PREVIEW_EDITOR_ID]);

function isLegacyMediaPreview(editor: EditorInput): editor is CustomEditorInput {
	return editor instanceof CustomEditorInput && legacyMediaPreviewViewTypes.has(editor.viewType);
}

/**
 * The image, video and audio previews used to be custom editors contributed by the `media-preview`
 * extension. Editors of those types that were restored from a previous session can no longer be
 * resolved, so replace them with the built-in previews.
 */
class MediaPreviewLegacyEditorMigration extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.mediaPreviewLegacyEditorMigration';

	constructor(
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
	) {
		super();

		const replacements = new Map<number, IUntypedEditorReplacement[]>();
		for (const { editor, groupId } of editorService.getEditors(EditorsOrder.SEQUENTIAL)) {
			const group = editorGroupsService.getGroup(groupId);
			if (!group) {
				continue;
			}

			const options = { pinned: group.isPinned(editor), sticky: group.isSticky(editor), preserveFocus: true };
			let replacement: IUntypedEditorReplacement['replacement'] | undefined;
			if (isLegacyMediaPreview(editor)) {
				replacement = { resource: editor.resource, options: { ...options, override: editor.viewType } };
			} else if (editor instanceof DiffEditorInput && isLegacyMediaPreview(editor.modified) && isLegacyMediaPreview(editor.original)) {
				replacement = {
					original: { resource: editor.original.resource },
					modified: { resource: editor.modified.resource },
					label: editor.getName(),
					description: editor.getDescription(),
					options: { ...options, override: editor.modified.viewType },
				};
			}

			if (replacement) {
				const groupReplacements = replacements.get(groupId) ?? [];
				groupReplacements.push({ editor, replacement });
				replacements.set(groupId, groupReplacements);
			}
		}

		for (const [groupId, groupReplacements] of replacements) {
			void editorService.replaceEditors(groupReplacements, groupId);
		}
	}
}

registerWorkbenchContribution2(MediaPreviewLegacyEditorMigration.ID, MediaPreviewLegacyEditorMigration, WorkbenchPhase.AfterRestored);

// --- Status Bar ---

registerWorkbenchContribution2(MediaPreviewStatusBarContribution.ID, MediaPreviewStatusBarContribution, WorkbenchPhase.AfterRestored);

// --- Actions ---

registerAction2(ZoomInImageAction);
registerAction2(ZoomOutImageAction);
registerAction2(SelectImageZoomLevelAction);
registerAction2(CopyImageAction);
registerAction2(ReopenImageAsTextAction);
registerAction2(ReopenImageAsPreviewAction);
registerImageViewerCopyCommand();
