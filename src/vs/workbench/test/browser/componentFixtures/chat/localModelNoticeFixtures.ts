/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { LocalModelEnabledSettingId, type ILocalModelFamilyV1, type ILocalModelStatusV1 } from '../../../../../platform/agentHost/common/localModel.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { LocalModelSetupProgress } from '../../../../contrib/chat/browser/agentSessions/agentHost/localModelSetupProgress.js';
import { IChatInputNotification, IChatInputNotificationService } from '../../../../contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { ChatContextKeys } from '../../../../contrib/chat/common/actions/chatContextKeys.js';
import { getLocalModelStopNowId, ILocalModelService } from '../../../../services/agentHost/common/localModelService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { renderChatInput } from './renderChatInput.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

const GiB = 1024 ** 3;

const family: ILocalModelFamilyV1 = {
	familyId: 'mai-code-1.1-flash-local',
	capiId: 'mai-code-1.1-flash-local',
	autoCapable: true,
	displayName: 'Example Flash 1.0',
	offer: { fit: 'full', requiredGpuBytes: 60 * GiB, downloadBytes: 50 * GiB, peakDiskBytes: 51 * GiB, licenseName: 'MIT' },
	entry: { modelFilesPresent: false },
	usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 },
	consentGiven: true,
};

const installedFamily: ILocalModelFamilyV1 = {
	...family,
	offer: undefined,
	entry: undefined,
	install: { contentId: 'c1', adopted: false, owned: true, modelId: 'vscode-on-device/MAI-Code-1.1-Flash' },
};

const otherFamily: ILocalModelFamilyV1 = {
	...installedFamily,
	familyId: 'example-coder-local',
	capiId: 'example-coder-local',
	displayName: 'Example Coder',
	install: { contentId: 'q1', adopted: false, owned: true, modelId: 'vscode-on-device/example-coder' },
	usage: { runningStreams: 2, boundDirectChats: 1, liveAutoRoutes: 0 },
};

function createStatus(families: readonly ILocalModelFamilyV1[], overrides: Partial<ILocalModelStatusV1> = {}): ILocalModelStatusV1 {
	return {
		schemaVersion: 1,
		device: { id: 'Vulkan0', capacityBytes: 64 * GiB, confidence: 'measured' },
		runtime: { source: 'none', trust: 'none' },
		catalog: { state: 'ready', registries: { azureml: 'ready' } },
		families,
		useInAuto: true,
		...overrides,
	};
}

const statuses = {
	downloading: createStatus([{ ...family, operation: { id: 'op-1', kind: 'setup', state: 'running', resumeOnStartup: true, phase: 'downloading', completedBytes: 10 * GiB, totalBytes: 50 * GiB, bytesPerSecond: 64 * 1024 * 1024 } }]),
	paused: createStatus([{ ...family, operation: { id: 'op-1', kind: 'setup', state: 'paused', pausedReason: 'network', resumeOnStartup: true, phase: 'downloading', completedBytes: 10 * GiB, totalBytes: 50 * GiB } }]),
	failed: createStatus([{ ...family, operation: { id: 'op-1', kind: 'setup', state: 'error', resumeOnStartup: false, phase: 'downloading', error: { code: 'downloadFailed', message: 'Downloading Example Flash 1.0 failed: the connection was reset.', actions: ['retry'] } } }]),
	// Selecting another model: the loaded one finishes its running responses first; Cancel keeps it.
	waitingForResponses: createStatus([{ ...installedFamily, operation: { id: 'swap-1', kind: 'swap', state: 'running', resumeOnStartup: false, phase: 'draining' } }, otherFamily], {
		active: { familyId: otherFamily.familyId, contentId: 'q1', servingGeneration: 1, server: 'stopping', swapTo: family.familyId, drain: { runningStreams: 2 } },
	}),
	// The model was selected, but loading it found no llama.cpp to run it.
	runtimeMissing: createStatus([installedFamily], {
		active: { familyId: family.familyId, contentId: 'c1', servingGeneration: 0, server: 'error', error: { code: 'runtimeNotFound', message: 'llama.cpp isn\'t set up on this device. Get llama.cpp, or set chat.copilot.localModel.llamaServerPath.', actions: ['getLlamaCpp', 'openSettings', 'retry'] } },
	}),
	runtimeApprovalRequired: createStatus([installedFamily], {
		runtime: { source: 'path', trust: 'pendingApproval', path: 'C:\\tools\\llama.cpp\\llama-server.exe' },
		active: { familyId: family.familyId, contentId: 'c1', servingGeneration: 1, server: 'error', error: { code: 'runtimeApprovalRequired', message: 'The llama-server at C:\\tools\\llama.cpp\\llama-server.exe needs your approval before Example Flash 1.0 can run on it.', actions: [] } },
	}),
} satisfies Record<string, ILocalModelStatusV1>;

/** The model is loaded because the user selected it, `elapsedMs` into the load; `expectedMs` is how long the last comparable load took. */
function createSwapStatus(elapsedMs: number, expectedMs?: number): ILocalModelStatusV1 {
	return createStatus([{ ...installedFamily, operation: { id: 'swap-1', kind: 'swap', state: 'running', resumeOnStartup: false, phase: 'loading' } }], {
		active: { familyId: family.familyId, contentId: 'c1', servingGeneration: 1, server: 'starting', load: { step: 'loading', startedAt: Date.now() - elapsedMs, expectedMs } },
	});
}

/**
 * The loaded model reloads for a new context size: the host swaps it to
 * itself. Without `elapsedMs`, the old server is still releasing its memory;
 * otherwise it loads again, estimated from the last comparable load.
 */
function createReloadStatus(elapsedMs?: number, expectedMs?: number): ILocalModelStatusV1 {
	return createStatus([{ ...installedFamily, operation: { id: 'reload-1', kind: 'swap', state: 'running', resumeOnStartup: false, phase: 'loading' } }], {
		active: elapsedMs === undefined
			? { familyId: family.familyId, contentId: 'c1', servingGeneration: 1, server: 'stopping', swapTo: family.familyId }
			: { familyId: family.familyId, contentId: 'c1', servingGeneration: 1, server: 'starting', swapTo: family.familyId, load: { step: 'loading', startedAt: Date.now() - elapsedMs, expectedMs } },
	});
}

/**
 * The notice the real {@link LocalModelSetupProgress} publishes for `status`.
 * Its scope to Copilot Agent Host chats is dropped: the fixture's input has no
 * session. Operations in `pendingStops` were just paused or cancelled.
 */
function createLocalModelNotice(status: ILocalModelStatusV1, disposables: DisposableStore, pendingStops: readonly string[] = []): IChatInputNotification {
	let published: IChatInputNotification | undefined;
	const notifications = new class extends mock<IChatInputNotificationService>() {
		override setNotification(notification: IChatInputNotification): void { published = notification; }
		override deleteNotification(): void { published = undefined; }
	}();
	const localModelService = new class extends mock<ILocalModelService>() {
		override getStatus() { return constObservable(status); }
		override getPendingStops() { return constObservable<ReadonlySet<string>>(new Set(pendingStops)); }
	}();
	const contextKeyService = new MockContextKeyService();
	contextKeyService.createKey(ChatContextKeys.enabled.key, true);
	disposables.add(new LocalModelSetupProgress(
		new class extends mock<IAgentHostService>() { }(),
		localModelService,
		notifications,
		new class extends mock<ICommandService>() { }(),
		new TestAccessibilityService(),
		new class extends mock<ILifecycleService>() { override readonly willShutdown = false; }(),
		new TestConfigurationService({ [LocalModelEnabledSettingId]: true }),
		contextKeyService,
		new class extends mock<IOpenerService>() { }(),
	));
	if (!published) {
		throw new Error('The status publishes no on-device notice');
	}
	return { ...published, sessionTypes: undefined };
}

interface INoticeFixtureOptions {
	/** Operations whose stop was just sent. */
	readonly pendingStops?: readonly string[];
	/** Renders with reduced motion: the in-progress icon instead of the spinner, and a stepped bar. */
	readonly reducedMotion?: boolean;
}

function renderNotice(context: ComponentFixtureContext, status: ILocalModelStatusV1, { pendingStops, reducedMotion = false }: INoticeFixtureOptions = {}): Promise<void> {
	if (reducedMotion) {
		context.container.classList.add('monaco-reduce-motion');
	}
	return renderChatInput(context, {
		notification: createLocalModelNotice(status, context.disposableStore, pendingStops),
		additionalServices: registration => registration.defineInstance(IAccessibilityService, new class extends TestAccessibilityService {
			override isMotionReduced(): boolean { return reducedMotion; }
		}()),
	});
}

/**
 * The on-device model notice above a chat input in each state it reports.
 * While an operation runs, it shows the in-progress indicator of an active
 * session. Grouped under the chat input notice fixtures.
 */
export const localModelNoticeFixtures = defineThemedFixtureGroup({
	// Determinate progress, with Pause as a secondary button; the text and bar update in place.
	Downloading: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, statuses.downloading),
	}),
	// Pause was just selected: the notice and its button say so at once, until the host pauses.
	Pausing: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, statuses.downloading, { pendingStops: ['op-1'] }),
	}),
	// A load the host started, 12 s into one whose last comparable load took 31 s: estimated progress.
	LoadingWithEstimate: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, createStatus([installedFamily], { active: { familyId: family.familyId, contentId: 'c1', servingGeneration: 1, server: 'starting', load: { step: 'loading', startedAt: Date.now() - 12_000, expectedMs: 31_000 } } })),
	}),
	// The first load at this context size has no estimate: an animated indeterminate bar.
	LoadingFirstTime: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: context => renderNotice(context, createStatus([installedFamily], { active: { familyId: family.familyId, contentId: 'c1', servingGeneration: 1, server: 'starting', load: { step: 'warmingUp', startedAt: Date.now() - 4_000 } } })),
	}),
	// This llama.cpp build crashed on the warm-up with speculative decoding: the host loads the model again without it.
	LoadingRetryWithoutSpeculativeDecoding: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, createStatus([installedFamily], { active: { familyId: family.familyId, contentId: 'c1', servingGeneration: 1, server: 'starting', load: { step: 'loading', startedAt: Date.now() - 3_000, retry: 'withoutSpeculativeDecoding' } } })),
	}),
	// The user selected the model, which loads for the first time: an indeterminate bar, and Cancel as a secondary button.
	SwapLoadingFirstTime: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, createSwapStatus(4_000)),
	}),
	// The same, estimated from the last comparable load.
	SwapLoadingWithEstimate: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, createSwapStatus(12_000, 31_000)),
	}),
	// With reduced motion: the in-progress icon instead of the spinner, and an indeterminate bar that moves in coarse steps.
	SwapLoadingReducedMotion: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, createSwapStatus(4_000), { reducedMotion: true }),
	}),
	// A new context size reloads the loaded model; while the old server releases its memory, nothing estimates it.
	Reloading: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, createReloadStatus()),
	}),
	// The reload loads the model again, estimated from the last comparable load.
	ReloadingWithEstimate: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: context => renderNotice(context, createReloadStatus(12_000, 31_000)),
	}),
	// Cancel was just selected: the notice says so at once, and its button reads Cancelling and can't be chosen again.
	Cancelling: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, createSwapStatus(4_000), { pendingStops: ['swap-1'] }),
	}),
	// Selecting another model waits for the loaded one's running responses: Stop Now ends them, Cancel keeps it.
	WaitingForResponses: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, statuses.waitingForResponses),
	}),
	CancellingWhileWaiting: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: context => renderNotice(context, statuses.waitingForResponses, { pendingStops: ['swap-1'] }),
	}),
	StoppingResponses: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: context => renderNotice(context, statuses.waitingForResponses, { pendingStops: [getLocalModelStopNowId('swap-1')] }),
	}),
	// Loading the selected model found no llama.cpp: the error with Get llama.cpp, Open Settings and Retry.
	RuntimeMissing: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, statuses.runtimeMissing),
	}),
	Paused: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: context => renderNotice(context, statuses.paused),
	}),
	FailedWithRetry: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderNotice(context, statuses.failed),
	}),
	// The detected llama-server is approved on the model's details page.
	RuntimeApprovalRequired: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: context => renderNotice(context, statuses.runtimeApprovalRequired),
	}),
});
