import { type DialDeployment, type Nullable } from './types';

/**
 * Copilot {@link vscode.LanguageModelDataPart} MIME values that are protocol metadata,
 * not DIAL `custom_content.attachments` (e.g. Anthropic `cache_control: ephemeral`).
 * @see microsoft/vscode-copilot-chat CustomDataPartMimeTypes
 */
export const COPILOT_CUSTOM_DATA_MIME_TYPES: readonly string[] = [
	'cache_control',
	'stateful_marker',
	'thinking',
	'context_management',
	'phase_data',
] as const;

/** MIME types Copilot may send as {@link vscode.LanguageModelDataPart} image input. */
export const VSCODE_IMAGE_MIME_TYPES: readonly string[] = [
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'image/bmp',
] as const;

function normalizeMime(mime: string): string {
	return mime.trim().toLowerCase();
}

/** Concrete `image/*` MIME (e.g. `image/png`). */
export function isImageMime(mime: string): boolean {
	return normalizeMime(mime).startsWith('image/');
}

/** Copilot cache breakpoints, stateful markers, etc. — not user file attachments. */
export function isCopilotCustomDataPart(mime: string): boolean {
	const normalized = normalizeMime(mime);
	return COPILOT_CUSTOM_DATA_MIME_TYPES.some((t) => normalizeMime(t) === normalized);
}

/**
 * Match a concrete MIME type against a DIAL `input_attachment_types` entry.
 * Supports all-types, major-type wildcards (e.g. audio, image), and exact types (e.g. image/png).
 */
export function mimeMatchesAttachmentPattern(mime: string, pattern: string): boolean {
	const normalizedMime = normalizeMime(mime);
	const normalizedPattern = normalizeMime(pattern);

	if (normalizedPattern === '*/*') {
		return true;
	}

	if (normalizedPattern.endsWith('/*')) {
		const major = normalizedPattern.slice(0, -2);
		if (!major || major.includes('*')) {
			return false;
		}
		return normalizedMime.startsWith(`${major}/`);
	}

	return normalizedMime === normalizedPattern;
}

/** True when the pattern can match at least one Copilot image MIME type. */
export function attachmentPatternSupportsImages(pattern: string): boolean {
	return VSCODE_IMAGE_MIME_TYPES.some((imageMime) =>
		mimeMatchesAttachmentPattern(imageMime, pattern),
	);
}

function hasLegacyUrlOrFolderAttachments(deployment: DialDeployment): boolean {
	return (
		deployment.features?.url_attachments_supported === true ||
		deployment.features?.folder_attachments_supported === true
	);
}

function allowedMimeTypes(deployment: DialDeployment): readonly string[] {
	const fromDial = deployment.inputAttachmentTypes;
	if (fromDial && fromDial.length > 0) {
		return fromDial;
	}
	if (hasLegacyUrlOrFolderAttachments(deployment)) {
		return VSCODE_IMAGE_MIME_TYPES;
	}
	return [];
}

/** Whether Copilot should offer image attach for this deployment (`capabilities.imageInput`). */
export function deploymentSupportsImageInput(deployment: DialDeployment): boolean {
	const types = allowedMimeTypes(deployment);
	if (types.some((pattern) => attachmentPatternSupportsImages(pattern))) {
		return true;
	}
	return hasLegacyUrlOrFolderAttachments(deployment);
}

/** Whether a VS Code attachment MIME type is permitted for this deployment. */
export function deploymentAllowsMime(deployment: DialDeployment, mime: string): boolean {
	const allowed = allowedMimeTypes(deployment);
	if (allowed.length === 0) {
		return false;
	}
	return allowed.some((pattern) => mimeMatchesAttachmentPattern(mime, pattern));
}

/** Enforce `max_input_attachments` when DIAL declares a finite cap. */
export function assertWithinMaxInputAttachments(
	deployment: DialDeployment,
	attachmentCount: number,
): void {
	const max = deployment.maxInputAttachments;
	if (max !== undefined && attachmentCount > max) {
		const label = deployment.name ?? deployment.id;
		throw new Error(
			`DIAL model "${label}" accepts at most ${max} input attachment(s), got ${attachmentCount}.`,
		);
	}
}

export function deploymentAttachmentSummary(deployment: Nullable<DialDeployment>): string {
	if (!deployment) {
		return '';
	}
	if (!deploymentSupportsImageInput(deployment)) {
		return '';
	}
	const types = allowedMimeTypes(deployment);
	if (types.length === 0) {
		return 'Supports image attachments';
	}
	return `Supports attachments: ${types.join(', ')}`;
}
