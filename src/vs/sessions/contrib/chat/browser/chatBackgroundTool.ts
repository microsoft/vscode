/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Sequencer } from '../../../../base/common/async.js';
import { encodeHex, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { isAbsolute, posix, win32 } from '../../../../base/common/path.js';
import { basename, extname, isEqual, isEqualOrParent, joinPath, normalizePath } from '../../../../base/common/resources.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ColorScheme, isDark, isHighContrast } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET, chatBackgroundImageExtensions, ChatBackgroundImageLayout, chatBackgroundImageLayoutValues, ISessionsChatBackgroundService } from '../../../services/chatBackground/browser/chatBackgroundService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING } from '../common/constants.js';

export const SetChatBackgroundToolId = 'vscode_setChatBackground';
export const SetChatBackgroundToolReferenceName = 'setChatBackground';

/** Chat backgrounds do not need larger images, and every chat view keeps the decoded image in memory. */
const MAX_IMAGE_SIZE = 25 * 1024 * 1024;

/** Recently imported images are never pruned, so an import in another window is not deleted before that window applies it. */
const PRUNE_GRACE_PERIOD = 60 * 1000;

const chatBackgroundPresets = ['codicons', 'none'] as const;
type ChatBackgroundPreset = typeof chatBackgroundPresets[number];

type SetChatBackgroundInput =
	| { readonly kind: 'preset'; readonly preset: ChatBackgroundPreset }
	| { readonly kind: 'image'; readonly image: string; readonly layout?: ChatBackgroundImageLayout }
	| { readonly kind: 'layout'; readonly layout: ChatBackgroundImageLayout };

interface IImageSize {
	readonly width: number;
	readonly height: number;
}

/** A chat background as reported to the model. */
type ChatBackgroundOutput =
	| { readonly kind: 'none' | 'codicons' }
	| { readonly kind: 'image'; readonly image: string; readonly layout: ChatBackgroundImageLayout; readonly width?: number; readonly height?: number };

/** An error the model can act on. Its message is returned to the model as is. */
class SetChatBackgroundError extends Error { }

export class SetChatBackgroundTool implements IToolImpl {

	/** Serializes invocations so that parallel calls apply in order and report accurate previous backgrounds. */
	private readonly sequencer = new Sequencer();

	/**
	 * @param getImportFolder Returns the local folder that holds imported images. The window must be
	 * able to load images from it, and the tool deletes images in it that no setting refers to.
	 */
	constructor(
		private readonly getImportFolder: () => URI,
		@ISessionsChatBackgroundService private readonly backgroundService: ISessionsChatBackgroundService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IFileService private readonly fileService: IFileService,
		@IThemeService private readonly themeService: IThemeService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	getToolData(): IToolData {
		return {
			id: SetChatBackgroundToolId,
			toolReferenceName: SetChatBackgroundToolReferenceName,
			canBeReferencedInPrompt: false,
			icon: Codicon.paintcan,
			displayName: localize('setChatBackground.displayName', "Set Chat Background"),
			userDescription: localize('setChatBackground.userDescription', "Set the chat background of the Agents window to an image or a pattern"),
			modelDescription: `Set or remove the chat background in the Agents window, or change its image layout. Applies an existing image file or the Codicons preset; does not generate images.

Use an absolute image path or one relative to the invoking chat's working directory. Supports ${chatBackgroundImageExtensions.join(', ')} up to ${MAX_IMAGE_SIZE / (1024 * 1024)} MB. Images are copied into VS Code storage.

Changes persist across chats for the active color scheme, leaving the other scheme unchanged. High contrast themes hide backgrounds. Omitting layout keeps the current layout. The result includes image dimensions and the previous background for undo.`,
			source: ToolDataSource.Internal,
			when: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING}`, true)),
			runsInWorkspace: false,
			agentHostPreferences: { defer: 'auto' },
			inputSchema: {
				type: 'object',
				additionalProperties: false,
				properties: {
					image: {
						type: 'string',
						description: 'Image file path, absolute or relative to your working directory.',
					},
					preset: {
						type: 'string',
						enum: [...chatBackgroundPresets],
						description: '"codicons" for a theme-aware pattern of VS Code icons, "none" to remove the background. Not combined with image or layout.',
					},
					layout: {
						type: 'string',
						enum: [...chatBackgroundImageLayoutValues],
						description: 'How the image is laid out: repeat tiles it, stretch fills the chat, and the others place it once at its original size. Pass it alone to change the layout of the current image.',
					},
				},
			},
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		let input: SetChatBackgroundInput | undefined;
		try {
			input = parseInput(context.parameters);
		} catch {
			// Invalid input is reported by `invoke`.
		}
		switch (input?.kind) {
			case 'preset':
				return input.preset === 'none' ? {
					invocationMessage: localize('setChatBackground.invocation.none', "Removing the chat background"),
					pastTenseMessage: localize('setChatBackground.past.none', "Removed the chat background"),
				} : {
					invocationMessage: localize('setChatBackground.invocation.codicons', "Setting the chat background to Codicons"),
					pastTenseMessage: localize('setChatBackground.past.codicons', "Set the chat background to Codicons"),
				};
			case 'image': {
				const name = getFileName(input.image);
				return {
					invocationMessage: localize('setChatBackground.invocation.image', "Setting the chat background to {0}", name),
					pastTenseMessage: localize('setChatBackground.past.image', "Set the chat background to {0}", name),
				};
			}
			case 'layout':
				return {
					invocationMessage: localize('setChatBackground.invocation.layout', "Changing the chat background layout"),
					pastTenseMessage: localize('setChatBackground.past.layout', "Changed the chat background layout"),
				};
			default:
				return {
					invocationMessage: localize('setChatBackground.invocation', "Setting the chat background"),
					pastTenseMessage: localize('setChatBackground.past', "Set the chat background"),
				};
		}
	}

	invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		return this.sequencer.queue(async () => {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			try {
				this.ensureEnabled();
				return await this.apply(parseInput(invocation.parameters), invocation.context?.sessionResource, token);
			} catch (error) {
				if (isCancellationError(error) || token.isCancellationRequested) {
					throw new CancellationError();
				}
				if (!(error instanceof SetChatBackgroundError)) {
					this.logService.warn('[SetChatBackgroundTool] Could not set the chat background.', error);
				}
				const message = error instanceof Error ? error.message : String(error);
				return { content: [{ kind: 'text', value: `Error: ${message}` }], toolResultError: message };
			}
		});
	}

	private ensureEnabled(): void {
		if (this.configurationService.getValue<boolean>(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING) !== true) {
			throw new SetChatBackgroundError(localize('setChatBackground.disabled', "Appearance tools are disabled by {0}.", AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING));
		}
	}

	private async apply(input: SetChatBackgroundInput, sessionResource: URI | undefined, token: CancellationToken): Promise<IToolResult> {
		const preparedInput = input.kind === 'image' ? { ...input, prepared: await this.prepareImage(input.image, sessionResource, token) } : input;
		this.ensureEnabled();
		// Capture the replaced state after preparation and pin all reads and writes to that scheme.
		const theme = this.themeService.getColorTheme().type;
		const replaced = this.backgroundService.getConfiguredBackground(theme);
		const previous = this.describeBackground(theme);
		let message: string;
		let imageSize: IImageSize | undefined;
		let image: URI | undefined;
		switch (preparedInput.kind) {
			case 'preset':
				if (preparedInput.preset === 'none') {
					await this.backgroundService.clearBackground(theme);
					message = localize('setChatBackground.result.none', "Removed the chat background");
				} else {
					await this.backgroundService.setBackground(AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET, theme);
					message = localize('setChatBackground.result.codicons', "Set the chat background to Codicons");
				}
				break;
			case 'image': {
				const { prepared } = preparedInput;
				image = prepared.image;
				imageSize = prepared.size;
				// From here on the change is applied even if the request is cancelled, so that the result stays accurate.
				await this.backgroundService.setBackground(image, theme);
				if (preparedInput.layout) {
					await this.backgroundService.setBackgroundImageLayout(preparedInput.layout, true, theme);
				}
				message = localize('setChatBackground.result.image', "Set the chat background to {0}", prepared.name);
				break;
			}
			case 'layout':
				if (replaced?.kind !== 'image') {
					throw new SetChatBackgroundError('There is no background image to lay out. Pass "image" together with "layout".');
				}
				await this.backgroundService.setBackgroundImageLayout(preparedInput.layout, true, theme);
				message = localize('setChatBackground.result.layout', "Changed the chat background layout");
				break;
		}
		// Keep the replaced image even if nothing refers to it anymore, so the reported undo path stays valid.
		await this.pruneImportedImages(replaced?.kind === 'image' ? replaced.image : undefined);

		const background = this.describeBackground(theme, imageSize);
		const colorScheme = isDark(theme) ? 'dark' : 'light';
		const output = {
			colorScheme,
			background,
			previous,
			...(background.kind !== 'none' && isHighContrast(theme) ? { note: `The active high contrast theme hides chat backgrounds. This background shows when the user uses a ${colorScheme} theme.` } : {}),
		};
		return {
			content: [{ kind: 'text', value: JSON.stringify(output) }],
			toolResultMessage: message,
			...(image ? { toolResultDetails: [image] } : {}),
		};
	}

	/**
	 * Returns a local image that the background can keep using, after verifying that it decodes:
	 * a known image in place, or a copy of the agent's file in the import folder.
	 */
	private async prepareImage(value: string, sessionResource: URI | undefined, token: CancellationToken): Promise<{ readonly image: URI; readonly name: string; readonly size: IImageSize }> {
		const folder = this.getImportFolder();
		const known = this.findKnownImage(value, folder);
		const workingDirectory = known ? undefined : this.getWorkingDirectory(sessionResource);
		const source = known ?? resolveImage(value, workingDirectory);
		const extension = extname(source).toLowerCase();
		if (!chatBackgroundImageExtensions.includes(extension.slice(1))) {
			throw new SetChatBackgroundError(`${extension ? `"${extension}" images are` : 'Files without an extension are'} not supported. Use one of: ${chatBackgroundImageExtensions.join(', ')}.`);
		}
		// Agent hosts run client tools without the calling chat when no chat view renders the call.
		await this.validateFile(source, known || workingDirectory ? '' : ' No working directory is known for this call, so the path was resolved on the machine running VS Code.');
		const imported = known ? undefined : await this.importImage(source, folder, token);
		const image = imported?.image ?? source;
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		let size: IImageSize;
		try {
			size = await this.measureImage(image);
		} catch (error) {
			if (imported?.created) {
				await this.fileService.del(image).catch(error => this.logService.warn('[SetChatBackgroundTool] Could not delete an invalid imported image.', error));
			}
			throw new SetChatBackgroundError(`${toDisplayPath(source)} is not a valid ${extension.slice(1)} image.`);
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return { image, name: basename(source), size };
	}

	/**
	 * Returns the image as a local file when the background already uses it, recently used it, or imported it.
	 * Checked before resolving the path on the agent's file system, so a remote agent can restore a previous
	 * background by the path the result reported.
	 */
	private findKnownImage(value: string, folder: URI): URI | undefined {
		let candidate: URI;
		if (/^file:\/\//i.test(value)) {
			candidate = normalizePath(URI.parse(value));
		} else if (isAbsolute(value)) {
			candidate = normalizePath(URI.file(value));
		} else {
			return undefined;
		}
		const known = isEqualOrParent(candidate, folder)
			|| this.backgroundService.getReferencedBackgroundImages().some(image => isEqual(image, candidate));
		return known ? candidate : undefined;
	}

	/** The working directory of the chat that invoked the tool: relative paths resolve against it, and it determines the agent's file system. */
	private getWorkingDirectory(sessionResource: URI | undefined): URI | undefined {
		if (!sessionResource) {
			return undefined;
		}
		const match = this.sessionsManagementService.getSessionForChatResource(sessionResource);
		const workspace = match
			? match.chat.workspace.get() ?? match.session.workspace.get()
			: this.sessionsManagementService.getSession(sessionResource)?.workspace.get();
		return workspace?.folders[0]?.workingDirectory;
	}

	private async validateFile(source: URI, notFoundHint: string): Promise<void> {
		let stat;
		try {
			stat = await this.fileService.stat(source);
		} catch (error) {
			throw new SetChatBackgroundError(error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND
				? `${toDisplayPath(source)} does not exist.${notFoundHint}`
				: `Could not read ${toDisplayPath(source)}: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (stat.isDirectory) {
			throw new SetChatBackgroundError(`${toDisplayPath(source)} is a folder, not an image file.`);
		}
		if (stat.size > MAX_IMAGE_SIZE) {
			throw new SetChatBackgroundError(`${toDisplayPath(source)} is ${Math.ceil(stat.size / (1024 * 1024))} MB; images can be at most ${MAX_IMAGE_SIZE / (1024 * 1024)} MB. Use a smaller or compressed image.`);
		}
	}

	/**
	 * Copies the image into the import folder, named by its content so that importing the same image again reuses
	 * the copy. The copy keeps the background working after the agent's file is deleted, for example with its worktree,
	 * and makes images on a remote agent host available to this window.
	 */
	private async importImage(source: URI, folder: URI, token: CancellationToken): Promise<{ readonly image: URI; readonly created: boolean }> {
		const content = await this.fileService.readFile(source, { limits: { size: MAX_IMAGE_SIZE } }, token);
		const digest = await crypto.subtle.digest('SHA-256', content.value.buffer as Uint8Array<ArrayBuffer>);
		const image = joinPath(folder, toImportedFileName(source, encodeHex(VSBuffer.wrap(new Uint8Array(digest))).slice(0, 12)));
		if (await this.fileService.exists(image)) {
			return { image, created: false };
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		this.ensureEnabled();
		await this.fileService.writeFile(image, content.value);
		return { image, created: true };
	}

	/** Decodes the image the way the chat background loads it, so that an image the background cannot show is rejected before it is applied. */
	protected async measureImage(image: URI): Promise<IImageSize> {
		const element = $<HTMLImageElement>('img');
		try {
			element.src = FileAccess.uriToBrowserUri(image).toString(true);
			await element.decode();
			return { width: element.naturalWidth, height: element.naturalHeight };
		} finally {
			element.removeAttribute('src');
		}
	}

	/** Deletes imported images that neither a background setting, the recently used list, nor `keep` refers to. */
	private async pruneImportedImages(keep: URI | undefined): Promise<void> {
		const folder = this.getImportFolder();
		try {
			if (!await this.fileService.exists(folder)) {
				return;
			}
			const referenced = [...this.backgroundService.getReferencedBackgroundImages(), ...(keep ? [keep] : [])];
			const { children = [] } = await this.fileService.resolve(folder, { resolveMetadata: true });
			const cutoff = Date.now() - PRUNE_GRACE_PERIOD;
			await Promise.all(children
				.filter(child => child.isFile && child.mtime < cutoff && !referenced.some(image => isEqual(image, child.resource)))
				.map(child => this.fileService.del(child.resource)));
		} catch (error) {
			this.logService.warn('[SetChatBackgroundTool] Could not delete unused chat background images.', error);
		}
	}

	private describeBackground(colorScheme: ColorScheme, size?: IImageSize): ChatBackgroundOutput {
		const background = this.backgroundService.getConfiguredBackground(colorScheme);
		if (!background) {
			return { kind: 'none' };
		}
		if (background.kind === 'codicons') {
			return { kind: 'codicons' };
		}
		return {
			kind: 'image',
			image: background.image.fsPath,
			layout: this.backgroundService.getBackgroundImageLayout(colorScheme),
			...(size && size.width > 0 && size.height > 0 ? { width: size.width, height: size.height } : {}),
		};
	}
}

function parseInput(parameters: unknown): SetChatBackgroundInput {
	const input: Record<string, unknown> = isObject(parameters) ? parameters as Record<string, unknown> : {};
	// Models sometimes send `null` for properties they mean to omit.
	const image = input.image ?? undefined;
	const preset = input.preset ?? undefined;
	const layout = input.layout ?? undefined;
	if (image !== undefined && (typeof image !== 'string' || !image.trim())) {
		throw new SetChatBackgroundError('"image" must be a non-empty file path.');
	}
	if (preset !== undefined && !isPreset(preset)) {
		throw new SetChatBackgroundError(`"preset" must be one of: ${chatBackgroundPresets.join(', ')}.`);
	}
	if (layout !== undefined && !isLayout(layout)) {
		throw new SetChatBackgroundError(`"layout" must be one of: ${chatBackgroundImageLayoutValues.join(', ')}.`);
	}
	if (image !== undefined && preset !== undefined) {
		throw new SetChatBackgroundError('Pass either "image" or "preset", not both.');
	}
	if (preset !== undefined) {
		if (layout !== undefined) {
			throw new SetChatBackgroundError('"layout" applies only to images; omit it when passing "preset".');
		}
		return { kind: 'preset', preset };
	}
	if (typeof image === 'string') {
		return { kind: 'image', image: image.trim(), ...(layout !== undefined ? { layout } : {}) };
	}
	if (layout !== undefined) {
		return { kind: 'layout', layout };
	}
	throw new SetChatBackgroundError('Pass "image", "preset", or "layout".');
}

function isPreset(value: unknown): value is ChatBackgroundPreset {
	return chatBackgroundPresets.some(preset => preset === value);
}

function isLayout(value: unknown): value is ChatBackgroundImageLayout {
	return chatBackgroundImageLayoutValues.some(layout => layout === value);
}

/**
 * Resolves the image path on the file system of the agent that passed it: the file system of the
 * working directory, which may be on a remote agent host, or this machine's when there is none.
 */
function resolveImage(value: string, workingDirectory: URI | undefined): URI {
	if (value === '~' || /^~[\\/]/.test(value)) {
		throw new SetChatBackgroundError('Expand "~" to an absolute path.');
	}
	const isFileUri = /^file:\/\//i.test(value);
	// Drive letters are a single character, so Windows paths do not match.
	if (!isFileUri && /^[a-z][a-z\d+.-]+:/i.test(value)) {
		throw new SetChatBackgroundError('"image" must be a file path. Save images from the web to a file first.');
	}

	const remote = workingDirectory?.scheme !== Schemas.file ? workingDirectory : undefined;
	if (isFileUri) {
		const uri = URI.parse(value);
		return remote?.scheme === AGENT_HOST_SCHEME ? toAgentHostUri(uri, remote.authority)
			: remote ? remote.with({ path: uri.path, fragment: '' }) : uri;
	}
	if (posix.isAbsolute(value) || win32.isAbsolute(value)) {
		if (!remote) {
			return URI.file(value);
		}
		// The agent host may run on another OS than this window, so convert Windows paths explicitly.
		const path = /^[a-z]:[\\/]/i.test(value) ? `/${value.replace(/\\/g, '/')}` : value;
		if (/^(\\\\|\/\/)/.test(value) && remote.scheme === AGENT_HOST_SCHEME) {
			return toAgentHostUri(URI.file(value.replace(/\\/g, '/')), remote.authority);
		}
		return remote.with({ path, fragment: '' });
	}
	if (!workingDirectory) {
		throw new SetChatBackgroundError(`"${value}" is relative, but this chat has no working directory. Pass an absolute path.`);
	}
	const usesWindowsPaths = /^\/[a-z]:\//i.test(workingDirectory.path);
	return joinPath(workingDirectory, ...value.split(usesWindowsPaths ? /[\\/]/ : '/'));
}

function getFileName(path: string): string {
	return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function toImportedFileName(source: URI, hash: string): string {
	const extension = extname(source).toLowerCase();
	const name = basename(source);
	const stem = name.slice(0, name.length - extension.length)
		.replace(/[^\w-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return `${stem || 'background'}-${hash}${extension}`;
}

function toDisplayPath(resource: URI): string {
	return resource.scheme === Schemas.file ? resource.fsPath : resource.path;
}
