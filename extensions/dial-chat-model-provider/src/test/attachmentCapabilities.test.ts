import * as assert from 'assert';
import {
	attachmentPatternSupportsImages,
	deploymentAllowsMime,
	deploymentSupportsImageInput,
	isCopilotCustomDataPart,
	mimeMatchesAttachmentPattern,
} from '../attachmentCapabilities';
import { normalizeDeployment } from '../deploymentMetadata';
import { type JsonValue } from '../runtimeGuards';

function dep(extras: Record<string, unknown> = {}): ReturnType<typeof normalizeDeployment> {
	return normalizeDeployment({ id: 'vision', name: 'vision', ...extras } as unknown as JsonValue);
}

suite('attachmentCapabilities — deploymentSupportsImageInput', () => {
	test('input_attachment_types with image/png → true', () => {
		assert.strictEqual(
			deploymentSupportsImageInput(dep({ input_attachment_types: ['image/png'] })),
			true,
		);
	});

	test('input_attachment_types with audio/* only → false for imageInput', () => {
		assert.strictEqual(
			deploymentSupportsImageInput(dep({ input_attachment_types: ['audio/*'] })),
			false,
		);
	});

	test('input_attachment_types with */* → true for imageInput', () => {
		assert.strictEqual(
			deploymentSupportsImageInput(dep({ input_attachment_types: ['*/*'] })),
			true,
		);
	});

	test('input_attachment_types with image/* → true for imageInput', () => {
		assert.strictEqual(
			deploymentSupportsImageInput(dep({ input_attachment_types: ['image/*'] })),
			true,
		);
	});

	test('url_attachments_supported without MIME list → true (legacy)', () => {
		assert.strictEqual(
			deploymentSupportsImageInput(dep({ features: { url_attachments_supported: true } })),
			true,
		);
	});

	test('no attachment signals → false', () => {
		assert.strictEqual(deploymentSupportsImageInput(dep()), false);
	});
});

suite('attachmentCapabilities — isCopilotCustomDataPart', () => {
	test('cache_control is Copilot metadata, not a DIAL attachment', () => {
		assert.strictEqual(isCopilotCustomDataPart('cache_control'), true);
		assert.strictEqual(isCopilotCustomDataPart('CACHE_CONTROL'), true);
		assert.strictEqual(isCopilotCustomDataPart('image/png'), false);
	});
});

suite('attachmentCapabilities — mimeMatchesAttachmentPattern', () => {
	test('*/* matches any concrete MIME', () => {
		assert.strictEqual(mimeMatchesAttachmentPattern('video/mp4', '*/*'), true);
		assert.strictEqual(mimeMatchesAttachmentPattern('image/png', '*/*'), true);
	});

	test('major/* wildcard matches subtype', () => {
		assert.strictEqual(mimeMatchesAttachmentPattern('audio/mpeg', 'audio/*'), true);
		assert.strictEqual(mimeMatchesAttachmentPattern('audio/wav', 'AUDIO/*'), true);
		assert.strictEqual(mimeMatchesAttachmentPattern('image/png', 'audio/*'), false);
	});

	test('exact type matches only that type', () => {
		assert.strictEqual(mimeMatchesAttachmentPattern('image/png', 'image/png'), true);
		assert.strictEqual(mimeMatchesAttachmentPattern('image/jpeg', 'image/png'), false);
	});

	test('image/* matches Copilot image set', () => {
		assert.strictEqual(attachmentPatternSupportsImages('image/*'), true);
		assert.strictEqual(attachmentPatternSupportsImages('audio/*'), false);
	});
});

suite('attachmentCapabilities — deploymentAllowsMime', () => {
	test('allows MIME from exact input_attachment_types', () => {
		const d = dep({
			input_attachment_types: ['image/jpeg', 'image/png', 'image/bmp'],
		});
		assert.strictEqual(deploymentAllowsMime(d, 'image/png'), true);
		assert.strictEqual(deploymentAllowsMime(d, 'image/jpeg'), true);
		assert.strictEqual(deploymentAllowsMime(d, 'image/gif'), false);
		assert.strictEqual(deploymentAllowsMime(d, 'audio/mpeg'), false);
	});

	test('image/* pattern allows any image subtype', () => {
		const d = dep({ input_attachment_types: ['image/*'] });
		assert.strictEqual(deploymentAllowsMime(d, 'image/webp'), true);
		assert.strictEqual(deploymentAllowsMime(d, 'video/mp4'), false);
	});

	test('*/* allows any attachment MIME', () => {
		const d = dep({ input_attachment_types: ['*/*'] });
		assert.strictEqual(deploymentAllowsMime(d, 'video/mp4'), true);
		assert.strictEqual(deploymentAllowsMime(d, 'application/pdf'), true);
	});

	test('legacy url attachments allow VS Code image set', () => {
		const d = dep({ features: { url_attachments_supported: true } });
		assert.strictEqual(deploymentAllowsMime(d, 'image/webp'), true);
		assert.strictEqual(deploymentAllowsMime(d, 'application/pdf'), false);
	});

	test('MIME comparison is case-insensitive', () => {
		const d = dep({ input_attachment_types: ['image/png'] });
		assert.strictEqual(deploymentAllowsMime(d, 'IMAGE/PNG'), true);
	});
});
