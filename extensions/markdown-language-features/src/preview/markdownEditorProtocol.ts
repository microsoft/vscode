/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineInterface, requestType, type InterfaceClient } from '@vscode/hubrpc';
import { z } from 'zod';

const offset = z.number().int().nonnegative();
const range = z.object({ start: offset, endExclusive: offset });
const sandbox = z.object({
	forms: z.boolean().optional(),
	downloads: z.boolean().optional(),
	pointerLock: z.boolean().optional(),
	clipboardWrite: z.boolean().optional(),
});
const resolvedCodeBlockEditor = z.object({
	cacheKey: z.string().optional(),
	html: z.string(),
	runtimeKey: z.string().min(1),
	resourceBaseUrl: z.string().optional(),
	hostTransport: z.boolean().optional(),
	contentType: z.enum(['text', 'json']),
	initialHeight: z.number().positive().optional(),
	sandbox: sandbox.optional(),
});
const codeBlockEditorProvider = z.object({
	id: z.string(),
	selector: z.union([
		z.object({ language: z.string(), languagePrefix: z.never().optional() }),
		z.object({ language: z.never().optional(), languagePrefix: z.string() }),
	]),
	source: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('static'), descriptor: resolvedCodeBlockEditor }),
		z.object({ kind: z.literal('exportApi') }),
	]),
});
const highlightResult = z.object({
	tokens: z.array(z.object({ length: offset, foreground: offset, fontStyle: offset })).readonly(),
	colorMap: z.array(z.string()).readonly(),
});
const linkStatus = z.object({
	kind: z.enum(['neutral', 'pending', 'success', 'warning', 'error', 'open', 'closed', 'merged', 'draft', 'notPlanned']),
	label: z.string(),
});
const richLinkPresentationUpdate = z.object({
	href: z.string(),
	presentation: z.object({
		kind: z.enum(['resource', 'issue', 'pullRequest', 'commit', 'file', 'folder', 'session', 'repository', 'branch']),
		title: z.string().optional(),
		detail: z.string().optional(),
		reference: z.string().optional(),
		tooltip: z.string().optional(),
		ariaLabel: z.string().optional(),
		status: linkStatus.optional(),
		secondaryStatus: linkStatus.optional(),
		isLoading: z.boolean().optional(),
	}).optional(),
});
const runtime = z.object({ runtimeId: z.string() });
// The nested editor owns its protocol. Only its routing and lifetime belong to this bridge.
const runtimeMessage = runtime.extend({ message: z.unknown() });

export const markdownEditorHost = defineInterface({ id: 'markdown.editor.host' }, {
	ready: requestType(z.object({ documentVersion: offset, editEpoch: offset }), z.void()),
	edit: requestType(range.extend({ text: z.string(), editEpoch: offset }), z.void()),
	history: requestType(z.object({ command: z.enum(['undo', 'redo']) }), z.void()),
	openLink: requestType(z.object({ href: z.string() }), z.void()),
	setReadonly: requestType(z.object({ readonly: z.boolean() }), z.void()),
	editorFocusChanged: requestType(z.object({ focused: z.boolean() }), z.void()),
	richLinkTargets: requestType(z.object({ hrefs: z.array(z.string()).readonly() }), z.void()),
	resolveCodeBlockEditor: requestType(z.object({ providerId: z.string(), language: z.string() }), z.object({ descriptor: resolvedCodeBlockEditor.optional() })),
	createCodeBlockEditorHostTransport: requestType(runtime.extend({ providerId: z.string(), runtimeKey: z.string() }), z.void()),
	codeBlockEditorHostTransportMessage: requestType(runtimeMessage, z.void()),
	disposeCodeBlockEditorHostTransport: requestType(runtime, z.void()),
	codeBlockEditorDiagnostic: requestType(z.object({ message: z.string() }), z.void()),
	addComment: requestType(range.extend({ text: z.string() }), z.void()),
	deleteComment: requestType(z.object({ id: z.string() }), z.void()),
	highlight: requestType(z.object({ source: z.string(), languageId: z.string() }), highlightResult),
});

export const markdownEditorRenderer = defineInterface({ id: 'markdown.editor.renderer' }, {
	update: requestType(z.object({ content: z.string(), editEpoch: offset }), z.void()),
	codeBlockEditorProviders: requestType(z.object({ codeBlockEditorProviders: z.array(codeBlockEditorProvider).readonly() }), z.void()),
	codeBlockEditorHostTransportMessage: requestType(runtimeMessage, z.void()),
	gutterMarkers: requestType(z.object({
		markers: z.array(range.extend({ type: z.enum(['added', 'modified', 'deleted']) })).readonly(),
	}), z.void()),
	comments: requestType(z.object({
		comments: z.array(range.extend({ id: z.string(), body: z.string(), author: z.string().optional() })).readonly(),
		acceptsComments: z.boolean(),
	}), z.void()),
	revealComment: requestType(z.object({ id: z.string() }), z.void()),
	revealLinkTarget: requestType(range.extend({ selectionStart: offset }), z.void()),
	command: requestType(z.object({ command: z.string() }), z.void()),
	highlightThemeChanged: requestType(z.object({}), z.void()),
	richLinkPresentations: requestType(z.object({ presentations: z.array(richLinkPresentationUpdate).readonly() }), z.void()),
});

export type MarkdownEditorHost = InterfaceClient<typeof markdownEditorHost>;
export type MarkdownEditorRenderer = InterfaceClient<typeof markdownEditorRenderer>;
export type CodeBlockEditorProviderDefinition = z.infer<typeof codeBlockEditorProvider>;
export type ResolvedCodeBlockEditor = z.infer<typeof resolvedCodeBlockEditor>;
export type HighlightResult = z.infer<typeof highlightResult>;
export type RichLinkPresentationUpdate = z.infer<typeof richLinkPresentationUpdate>;
