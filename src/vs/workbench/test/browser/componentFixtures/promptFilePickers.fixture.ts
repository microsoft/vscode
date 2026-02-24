/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IListService, ListService } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { QuickInputService } from '../../../../platform/quickinput/browser/quickInputService.js';
import { PromptFilePickers } from '../../../contrib/chat/browser/promptSyntax/pickers/promptFilePickers.js';
import { PromptsType } from '../../../contrib/chat/common/promptSyntax/promptTypes.js';
import { AgentFileType, IExtensionPromptPath, IResolvedAgentFile, IPromptPath, IPromptsService, PromptsStorage } from '../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
import { ParsedPromptFile } from '../../../contrib/chat/common/promptSyntax/promptFileParser.js';

interface IFixturePromptsState {
	localPromptFiles: IPromptPath[];
	userPromptFiles: IPromptPath[];
	extensionPromptFiles: IExtensionPromptPath[];
	agentInstructionFiles: IResolvedAgentFile[];
	disabled: ResourceSet;
}

interface RenderPromptPickerOptions extends ComponentFixtureContext {
	type: PromptsType;
	placeholder: string;
	seedData: (state: IFixturePromptsState) => void;
}

class FixtureQuickInputService extends QuickInputService {
	override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
	override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
	override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: boolean } = { useSeparators: false }): IQuickPick<T, { useSeparators: boolean }> {
		const quickPick = super.createQuickPick<T>(options) as IQuickPick<T, { useSeparators: boolean }>;
		quickPick.ignoreFocusOut = true;
		return quickPick;
	}
}

export default defineThemedFixtureGroup({
	PromptFiles: defineComponentFixture({
		render: context => renderPromptFilePickerFixture({
			...context,
			type: PromptsType.prompt,
			placeholder: 'Select the prompt file to run',
			seedData: promptsService => {
				promptsService.localPromptFiles = [
					{ uri: URI.file('/workspace/.github/prompts/refactor.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Refactor Prompt', description: 'Refactor selected code' },
					{ uri: URI.file('/workspace/.github/prompts/docs.prompt.md'), storage: PromptsStorage.local, type: PromptsType.prompt, name: 'Docs Prompt', description: 'Generate docs for symbols' },
				];
				promptsService.userPromptFiles = [
					{ uri: URI.file('/home/dev/.copilot/prompts/review.prompt.md'), storage: PromptsStorage.user, type: PromptsType.prompt, name: 'Review Prompt', description: 'Review this change' },
				];
			},
		}),
	}),

	InstructionFilesWithAgentInstructions: defineComponentFixture({
		render: context => renderPromptFilePickerFixture({
			...context,
			type: PromptsType.instructions,
			placeholder: 'Select instruction files',
			seedData: promptsService => {
				promptsService.localPromptFiles = [
					{ uri: URI.file('/workspace/.github/instructions/repo.instructions.md'), storage: PromptsStorage.local, type: PromptsType.instructions, name: 'Repo Rules', description: 'Repository-wide coding rules' },
				];
				promptsService.agentInstructionFiles = [
					{ uri: URI.file('/workspace/AGENTS.md'), realPath: undefined, type: AgentFileType.agentsMd },
					{ uri: URI.file('/workspace/.github/copilot-instructions.md'), realPath: undefined, type: AgentFileType.copilotInstructionsMd },
				];
			},
		}),
	}),
});

async function renderPromptFilePickerFixture({ container, disposableStore, theme, type, placeholder, seedData }: RenderPromptPickerOptions): Promise<void> {
	const quickInputHost = document.createElement('div');
	quickInputHost.style.position = 'relative';
	const hostWidth = 800;
	const hostHeight = 600;
	quickInputHost.style.width = `${hostWidth}px`;
	quickInputHost.style.height = `${hostHeight}px`;
	quickInputHost.style.minHeight = `${hostHeight}px`;
	quickInputHost.style.overflow = 'hidden';
	container.appendChild(quickInputHost);

	const promptsState: IFixturePromptsState = {
		localPromptFiles: [],
		userPromptFiles: [],
		extensionPromptFiles: [],
		agentInstructionFiles: [],
		disabled: new ResourceSet(),
	};
	seedData(promptsState);

	const promptsService = new class extends mock<IPromptsService>() {
		override async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage, _token: CancellationToken): Promise<readonly IPromptPath[]> {
			switch (storage) {
				case PromptsStorage.local:
					return promptsState.localPromptFiles.filter(file => file.type === type);
				case PromptsStorage.user:
					return promptsState.userPromptFiles.filter(file => file.type === type);
				case PromptsStorage.extension:
					return promptsState.extensionPromptFiles.filter(file => file.type === type);
			}
		}

		override async listAgentInstructions(_token: CancellationToken): Promise<IResolvedAgentFile[]> {
			return promptsState.agentInstructionFiles;
		}

		override async parseNew(_uri: URI, _token: CancellationToken): Promise<ParsedPromptFile> {
			throw new Error('Not implemented');
		}

		override getDisabledPromptFiles(_type: PromptsType): ResourceSet {
			return promptsState.disabled;
		}

		override setDisabledPromptFiles(_type: PromptsType, uris: ResourceSet): void {
			promptsState.disabled = uris;
		}
	};

	const layoutService = new class extends mock<ILayoutService>() {
		override activeContainer = quickInputHost;
		override get activeContainerDimension() { return { width: hostWidth, height: hostHeight }; }
		override activeContainerOffset = { top: 0, quickPickTop: 20 };
		override mainContainer = quickInputHost;
		override get mainContainerDimension() { return { width: hostWidth, height: hostHeight }; }
		override mainContainerOffset = { top: 0, quickPickTop: 20 };
		override containers = [quickInputHost];
		override onDidLayoutMainContainer = Event.None;
		override onDidLayoutContainer = Event.None;
		override onDidLayoutActiveContainer = Event.None;
		override onDidAddContainer = Event.None;
		override onDidChangeActiveContainer = Event.None;
		override getContainer(): HTMLElement {
			return quickInputHost;
		}
		override whenContainerStylesLoaded(): Promise<void> | undefined {
			return undefined;
		}
		override focus(): void { }
	};

	const contextMenuService = new class extends mock<IContextMenuService>() {
		override onDidShowContextMenu = Event.None;
		override onDidHideContextMenu = Event.None;
		override showContextMenu(): void { }
	};

	const contextViewService = new class extends mock<IContextViewService>() {
		override anchorAlignment = 0;
		override showContextView() { return { close: () => { } }; }
		override hideContextView(): void { }
		override getContextViewElement(): HTMLElement { return quickInputHost; }
		override layout(): void { }
	};

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registration.defineInstance(ILayoutService, layoutService);
			registration.defineInstance(IContextMenuService, contextMenuService);
			registration.defineInstance(IContextViewService, contextViewService);
			registration.define(IListService, ListService);
			registration.define(IQuickInputService, FixtureQuickInputService);
			registration.defineInstance(IPromptsService, promptsService);
			registration.defineInstance(IOpenerService, new class extends mock<IOpenerService>() { });
			registration.defineInstance(IFileService, new class extends mock<IFileService>() { });
			registration.defineInstance(IDialogService, new class extends mock<IDialogService>() { });
			registration.defineInstance(ICommandService, new class extends mock<ICommandService>() { });
			registration.defineInstance(ILabelService, new class extends mock<ILabelService>() {
				override getUriLabel(uri: URI): string {
					return uri.path;
				}
			});
			registration.defineInstance(IProductService, new class extends mock<IProductService>() { });
		}
	});

	const pickers = instantiationService.createInstance(PromptFilePickers);

	void pickers.selectPromptFile({
		placeholder,
		type,
	});

	// Wait for the quickpick widget to render and have dimensions
	const quickInputWidget = await waitForElement<HTMLElement>(
		quickInputHost,
		'.quick-input-widget',
		el => el.offsetWidth > 0 && el.offsetHeight > 0
	);

	if (quickInputWidget) {
		// Reset positioning
		quickInputWidget.style.position = 'relative';
		quickInputWidget.style.top = '0';
		quickInputWidget.style.left = '0';

		// Move widget to container and remove host
		container.appendChild(quickInputWidget);
		quickInputHost.remove();

		// Set explicit dimensions on container to match widget
		const rect = quickInputWidget.getBoundingClientRect();
		container.style.width = `${rect.width}px`;
		container.style.height = `${rect.height}px`;
	}
}

async function waitForElement<T extends HTMLElement>(
	root: HTMLElement,
	selector: string,
	condition: (el: T) => boolean,
	timeout = 2000
): Promise<T | null> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const el = root.querySelector<T>(selector);
		if (el && condition(el)) {
			// Wait one more frame to ensure layout is complete
			await new Promise(resolve => mainWindow.requestAnimationFrame(resolve));
			return el;
		}
		await new Promise(resolve => setTimeout(resolve, 10));
	}
	return root.querySelector<T>(selector);
}
