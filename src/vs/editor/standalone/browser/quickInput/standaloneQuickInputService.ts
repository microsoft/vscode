/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './standaloneQuickInput.css';
import { Event } from '../../../../base/common/event.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IQuickInputService, IQuickPickItem, IQuickPick, IInputBox, IQuickNavigateConfiguration, IPickOptions, QuickPickInput, IInputOptions, IQuickWidget } from '../../../../platform/quickinput/common/quickInput.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorScopedLayoutService } from '../standaloneLayoutService.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { QuickInputController, IQuickInputControllerHost } from '../../../../platform/quickinput/browser/quickInputController.js';
import { QuickInputService } from '../../../../platform/quickinput/browser/quickInputService.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

class EditorScopedQuickInputService extends QuickInputService {

	private host: IQuickInputControllerHost | undefined = undefined;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(
			instantiationService,
			contextKeyService,
			themeService,
			new EditorScopedLayoutService(editor.getContainerDomNode(), codeEditorService),
			configurationService,
		);

		// Use the passed in code editor as host for the quick input widget
		const contribution = QuickInputEditorContribution.get(editor);
		if (contribution) {
			const widget = contribution.widget;
			this.host = {
				_serviceBrand: undefined,
				get mainContainer() { return widget.getDomNode(); },
				getContainer() { return widget.getDomNode(); },
				whenContainerStylesLoaded() { return undefined; },
				get containers() { return [widget.getDomNode()]; },
				get activeContainer() { return widget.getDomNode(); },
				get mainContainerDimension() { return editor.getLayoutInfo(); },
				get activeContainerDimension() { return editor.getLayoutInfo(); },
				get onDidLayoutMainContainer() { return editor.onDidLayoutChange; },
				get onDidLayoutActiveContainer() { return editor.onDidLayoutChange; },
				get onDidLayoutContainer() { return Event.map(editor.onDidLayoutChange, dimension => ({ container: widget.getDomNode(), dimension })); },
				get onDidChangeActiveContainer() { return Event.None; },
				get onDidAddContainer() { return Event.None; },
				get mainContainerOffset() { return { top: 0, quickPickTop: 0 }; },
				get activeContainerOffset() { return { top: 0, quickPickTop: 0 }; },
				focus: () => editor.focus()
			};
		} else {
			this.host = undefined;
		}
	}

	protected override createController(): QuickInputController {
		return super.createController(this.host);
	}
}

export class StandaloneQuickInputService implements IQuickInputService {

	declare readonly _serviceBrand: undefined;

	private mapEditorToService = new Map<ICodeEditor, EditorScopedQuickInputService>();
	private get activeService(): IQuickInputService {
		const editor = this.codeEditorService.getFocusedCodeEditor();
		if (!editor) {
			throw new Error('Quick input service needs a focused editor to work.');
		}

		// Find the quick input implementation for the focused
		// editor or create it lazily if not yet created
		let quickInputService = this.mapEditorToService.get(editor);
		if (!quickInputService) {
			const newQuickInputService = quickInputService = this.instantiationService.createInstance(EditorScopedQuickInputService, editor);
			this.mapEditorToService.set(editor, quickInputService);

			createSingleCallFunction(editor.onDidDispose)(() => {
				newQuickInputService.dispose();
				this.mapEditorToService.delete(editor);
			});
		}

		return quickInputService;
	}

	get currentQuickInput() { return this.activeService.currentQuickInput; }
	get quickAccess() { return this.activeService.quickAccess; }
	get backButton() { return this.activeService.backButton; }
	get onShow() { return this.activeService.onShow; }
	get onHide() { return this.activeService.onHide; }

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService
	) {
	}

	pick<T extends IQuickPickItem, O extends IPickOptions<T>>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: O, token: CancellationToken = CancellationToken.None): Promise<(O extends { canPickMany: true } ? T[] : T) | undefined> {
		return (this.activeService as unknown as QuickInputController /* TS fail */).pick(picks, options, token);
	}

	input(options?: IInputOptions | undefined, token?: CancellationToken | undefined): Promise<string | undefined> {
		return this.activeService.input(options, token);
	}

	createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
	createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
	createQuickPick<T extends IQuickPickItem>(options: { useSeparators: boolean } = { useSeparators: false }): IQuickPick<T, { useSeparators: boolean }> {
		return this.activeService.createQuickPick(options);
	}

	createInputBox(): IInputBox {
		return this.activeService.createInputBox();
	}

	createQuickWidget(): IQuickWidget {
		return this.activeService.createQuickWidget();
	}

	focus(): void {
		return this.activeService.focus();
	}

	toggle(): void {
		return this.activeService.toggle();
	}

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration | undefined): void {
		return this.activeService.navigate(next, quickNavigate);
	}

	accept(): Promise<void> {
		return this.activeService.accept();
	}

	back(): Promise<void> {
		return this.activeService.back();
	}

	cancel(): Promise<void> {
		return this.activeService.cancel();
	}

	setAlignment(alignment: 'top' | 'center' | { top: number; left: number }): void {
		return this.activeService.setAlignment(alignment);
	}

	toggleHover(): void {
		return this.activeService.toggleHover();
	}
}

export class QuickInputEditorContribution implements IEditorContribution {

	static readonly ID = 'editor.controller.quickInput';

	static get(editor: ICodeEditor): QuickInputEditorContribution | null {
		return editor.getContribution<QuickInputEditorContribution>(QuickInputEditorContribution.ID);
	}

	readonly widget = new QuickInputEditorWidget(this.editor);

	constructor(private editor: ICodeEditor) { }

	dispose(): void {
		this.widget.dispose();
	}
}

export class QuickInputEditorWidget implements IOverlayWidget {

	private static readonly ID = 'editor.contrib.quickInputWidget';

	private domNode: HTMLElement;

	constructor(private codeEditor: ICodeEditor) {
		this.domNode = document.createElement('div');

		this.codeEditor.addOverlayWidget(this);
	}

	getId(): string {
		return QuickInputEditorWidget.ID;
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return { preference: OverlayWidgetPositionPreference.TOP_CENTER };
	}

	dispose(): void {
		this.codeEditor.removeOverlayWidget(this);
	}
}

registerEditorContribution(QuickInputEditorContribution.ID, QuickInputEditorContribution, EditorContributionInstantiation.Lazy);
