/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineInterface, notificationType, requestType, type InterfaceClient } from '@vscode/hubrpc';
import * as z from 'zod/mini';

const offset = z.int().check(z.nonnegative());
const range = z.object({ start: offset, endExclusive: offset });
const editorConfiguration = z.object({ highlightActiveBlock: z.boolean() });
const selection = z.object({ anchor: offset, active: offset });
export const navigationState = z.object({
	editEpoch: offset,
	revision: offset,
	selection: z.optional(selection),
	scrollTop: z.number().check(z.nonnegative()),
});
const diagnostic = z.extend(range, {
	message: z.string(),
	severity: z.enum(['error', 'warning', 'info', 'hint']),
	source: z.optional(z.string()),
	code: z.optional(z.string()),
	codeTarget: z.optional(z.string()),
});
const completion = z.object({
	id: z.string(),
	label: z.string(),
	detail: z.optional(z.string()),
	type: z.optional(z.string()),
	unsupported: z.optional(z.string()),
	highlightLength: z.optional(offset),
});
const sandbox = z.object({
	forms: z.optional(z.boolean()),
	downloads: z.optional(z.boolean()),
	pointerLock: z.optional(z.boolean()),
	clipboardWrite: z.optional(z.boolean()),
});
const resolvedCodeBlockEditor = z.object({
	cacheKey: z.optional(z.string()),
	html: z.string(),
	runtimeKey: z.string().check(z.minLength(1)),
	resourceBaseUrl: z.optional(z.string()),
	hostTransport: z.optional(z.boolean()),
	contentType: z.enum(['text', 'json']),
	initialHeight: z.optional(z.number().check(z.positive())),
	sandbox: z.optional(sandbox),
});
const codeBlockEditorProvider = z.object({
	id: z.string(),
	selector: z.union([
		z.object({ language: z.string(), languagePrefix: z.optional(z.never()) }),
		z.object({ language: z.optional(z.never()), languagePrefix: z.string() }),
	]),
	source: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('static'), descriptor: resolvedCodeBlockEditor }),
		z.object({ kind: z.literal('exportApi') }),
	]),
});
const highlightResult = z.object({
	tokens: z.readonly(z.array(z.object({ length: offset, foreground: offset, fontStyle: offset }))),
	colorMap: z.readonly(z.array(z.string())),
});
const linkStatus = z.object({
	kind: z.enum(['neutral', 'pending', 'success', 'warning', 'error', 'open', 'closed', 'merged', 'draft', 'notPlanned']),
	label: z.string(),
});
const richLinkPresentationUpdate = z.object({
	subscriptionId: z.string(),
	presentation: z.optional(z.object({
		kind: z.enum(['resource', 'issue', 'pullRequest', 'commit', 'file', 'folder', 'session', 'repository', 'branch']),
		title: z.optional(z.string()),
		detail: z.optional(z.string()),
		reference: z.optional(z.string()),
		tooltip: z.optional(z.string()),
		ariaLabel: z.optional(z.string()),
		status: z.optional(linkStatus),
		secondaryStatus: z.optional(linkStatus),
		isLoading: z.optional(z.boolean()),
	})),
});
const richLinkSubscriptions = z.object({
	subscribe: z.readonly(z.array(z.object({ subscriptionId: z.string(), href: z.string() }))),
	unsubscribe: z.readonly(z.array(z.string())),
});
const runtime = z.object({ runtimeId: z.string() });
// The nested editor owns its protocol. Only its routing and lifetime belong to this bridge.
const runtimeMessage = z.extend(runtime, { message: z.unknown() });

export const markdownEditorHost = defineInterface({ id: 'markdown.editor.host' }, {
	ready: requestType(z.object({ documentVersion: offset, editEpoch: offset }), z.void()),
	edit: requestType(z.extend(range, { text: z.string(), editEpoch: offset }), z.void()),
	history: requestType(z.object({ command: z.enum(['undo', 'redo']) }), z.void()),
	openLink: requestType(z.object({ href: z.string() }), z.void()),
	setReadonly: requestType(z.object({ readonly: z.boolean() }), z.void()),
	editorFocusChanged: requestType(z.object({ focused: z.boolean() }), z.void()),
	selectionChanged: requestType(z.object({ editEpoch: offset, selection: z.optional(selection) }), z.void()),
	richLinkSubscriptions: notificationType(richLinkSubscriptions),
	resolveCodeBlockEditor: requestType(z.object({ providerId: z.string(), language: z.string() }), z.object({ descriptor: z.optional(resolvedCodeBlockEditor) })),
	createCodeBlockEditorHostTransport: requestType(z.extend(runtime, { providerId: z.string(), runtimeKey: z.string() }), z.void()),
	codeBlockEditorHostTransportMessage: requestType(runtimeMessage, z.void()),
	disposeCodeBlockEditorHostTransport: requestType(runtime, z.void()),
	codeBlockEditorDiagnostic: notificationType(z.object({ message: z.string() })),
	addComment: requestType(z.extend(range, { text: z.string() }), z.void()),
	deleteComment: requestType(z.object({ id: z.string() }), z.void()),
	highlight: requestType(z.object({ source: z.string(), languageId: z.string() }), highlightResult),
	prepareRename: requestType(z.object({ requestId: offset, offset, editEpoch: offset }), z.extend(range, { placeholder: z.string() })),
	rename: requestType(z.object({ requestId: offset, newName: z.string() }), z.void()),
	cancelRename: requestType(z.object({ requestId: offset }), z.void()),
	getDiagnostics: requestType(z.object({}), z.object({ editEpoch: offset, items: z.array(diagnostic) })),
	completions: requestType(z.object({ requestId: offset, offset, editEpoch: offset, automatic: z.boolean() }), z.object({ items: z.array(completion), incomplete: z.boolean() })),
	acceptCompletion: requestType(z.object({ requestId: offset, id: z.string() }), z.object({ offset: z.optional(offset), editEpoch: offset, retrigger: z.boolean(), warning: z.optional(z.string()) })),
	cancelCompletions: requestType(z.object({ requestId: offset }), z.void()),
	pasteImages: requestType(z.extend(range, {
		editEpoch: offset,
		images: z.array(z.object({ name: z.string(), mime: z.string(), base64: z.string() })),
	}), z.object({ offset: z.optional(offset), editEpoch: offset })),
});

export const markdownEditorRenderer = defineInterface({ id: 'markdown.editor.renderer' }, {
	configurationChanged: notificationType(editorConfiguration),
	diagnosticsChanged: requestType(z.object({}), z.void()),
	update: requestType(z.object({ content: z.string(), editEpoch: offset }), z.void()),
	codeBlockEditorProviders: notificationType(z.object({ codeBlockEditorProviders: z.readonly(z.array(codeBlockEditorProvider)) })),
	codeBlockEditorHostTransportMessage: requestType(runtimeMessage, z.void()),
	gutterMarkers: notificationType(z.object({
		markers: z.readonly(z.array(z.extend(range, { type: z.enum(['added', 'modified', 'deleted']) }))),
	})),
	comments: notificationType(z.object({
		comments: z.readonly(z.array(z.extend(range, { id: z.string(), body: z.string(), author: z.optional(z.string()) }))),
		acceptsComments: z.boolean(),
	})),
	revealComment: notificationType(z.object({ id: z.string() })),
	revealLinkTarget: requestType(z.extend(range, { selectionStart: offset }), z.void()),
	captureNavigationState: requestType(z.object({}), navigationState),
	revealRange: requestType(z.extend(range, {
		editEpoch: offset,
		revision: offset,
		selection: z.optional(selection),
		preserveFocus: z.boolean(),
	}), z.void()),
	restoreNavigationState: requestType(navigationState, z.void()),
	command: requestType(z.object({ command: z.string() }), z.void()),
	highlightThemeChanged: notificationType(z.object({})),
	richLinkPresentations: notificationType(z.object({ presentations: z.readonly(z.array(richLinkPresentationUpdate)) })),
});

export type MarkdownEditorHost = InterfaceClient<typeof markdownEditorHost>;
export type MarkdownEditorRenderer = InterfaceClient<typeof markdownEditorRenderer>;
export type MarkdownEditorConfiguration = z.infer<typeof editorConfiguration>;
export type CodeBlockEditorProviderDefinition = z.infer<typeof codeBlockEditorProvider>;
export type ResolvedCodeBlockEditor = z.infer<typeof resolvedCodeBlockEditor>;
export type HighlightResult = z.infer<typeof highlightResult>;
export type RichLinkPresentationUpdate = z.infer<typeof richLinkPresentationUpdate>;
export type RichLinkSubscriptions = z.infer<typeof richLinkSubscriptions>;
export type MarkdownDiagnostic = z.infer<typeof diagnostic>;
export type MarkdownCompletion = z.infer<typeof completion>;
export type MarkdownNavigationState = z.infer<typeof navigationState>;
