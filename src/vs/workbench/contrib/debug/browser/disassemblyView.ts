/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getPixelRatio, getZoomLevel } from 'vs/base/browser/browser';
import { Dimension, append, $, addStandardDisposableListener } from 'vs/base/browser/dom';
import { ITableRenderer, ITableVirtualDelegate } from 'vs/base/browser/ui/table/table';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchTable } from 'vs/platform/list/browser/listService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST, DISASSEMBLY_VIEW_ID, IDebugService, IInstructionBreakpoint, State } from 'vs/workbench/contrib/debug/common/debug';
import * as icons from 'vs/workbench/contrib/debug/browser/debugIcons';
import { createStringBuilder } from 'vs/editor/common/core/stringBuilder';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { dispose, Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { topStackFrameColor, focusedStackFrameColor } from 'vs/workbench/contrib/debug/browser/callStackEditorContribution';
import { Color } from 'vs/base/common/color';
import { InstructionBreakpoint } from 'vs/workbench/contrib/debug/common/debugModel';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';

interface IDisassembledInstructionEntry {
	allowBreakpoint: boolean;
	isBreakpointSet: boolean;
	instruction: DebugProtocol.DisassembledInstruction;
	instructionAddress?: bigint;
}

// Special entry as a placeholer when disassembly is not available
const disassemblyNotAvailable: IDisassembledInstructionEntry = {
	allowBreakpoint: false,
	isBreakpointSet: false,
	instruction: {
		address: '-1',
		instruction: localize('instructionNotAvailable', "Disassembly not available.")
	},
	instructionAddress: BigInt(-1)
};

export class DisassemblyView extends EditorPane {

	private static readonly NUM_INSTRUCTIONS_TO_LOAD = 50;

	// Used in instruction renderer
	private _fontInfo: BareFontInfo;
	private _disassembledInstructions: WorkbenchTable<IDisassembledInstructionEntry> | undefined;
	private _onDidChangeStackFrame: Emitter<void>;
	private _previousDebuggingState: State;
	private _instructionBpList: readonly IInstructionBreakpoint[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IDebugService private readonly _debugService: IDebugService,
		@IEditorService editorService: IEditorService,
	) {
		super(DISASSEMBLY_VIEW_ID, telemetryService, themeService, storageService);

		this._disassembledInstructions = undefined;
		this._onDidChangeStackFrame = new Emitter<void>();
		this._previousDebuggingState = _debugService.state;

		this._fontInfo = BareFontInfo.createFromRawSettings(configurationService.getValue('editor'), getZoomLevel(), getPixelRatio());
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor')) {
				this._fontInfo = BareFontInfo.createFromRawSettings(configurationService.getValue('editor'), getZoomLevel(), getPixelRatio());
				this._disassembledInstructions?.rerender();
			}
		}));
	}

	get fontInfo() { return this._fontInfo; }

	get currentInstructionAddresses() {
		return this._debugService.getModel().getSessions(false).
			map(session => session.getAllThreads()).
			reduce((prev, curr) => prev.concat(curr), []).
			map(thread => thread.getTopStackFrame()).
			map(frame => frame?.instructionPointerReference);
	}

	// Instruction address of the top stack frame of the focused stack
	get focusedCurrentInstructionAddress() {
		return this._debugService.getViewModel().focusedStackFrame?.thread.getTopStackFrame()?.instructionPointerReference;
	}

	get focusedInstructionAddress() {
		return this._debugService.getViewModel().focusedStackFrame?.instructionPointerReference;
	}

	get onDidChangeStackFrame() { return this._onDidChangeStackFrame.event; }

	protected createEditor(parent: HTMLElement): void {
		const lineHeight = this.fontInfo.lineHeight;
		const delegate = new class implements ITableVirtualDelegate<IDisassembledInstructionEntry>{
			headerRowHeight: number = 0; // No header
			getHeight(row: IDisassembledInstructionEntry): number {
				return lineHeight;
			}
		};

		const instructionRenderer = this._register(this._instantiationService.createInstance(InstructionRenderer, this));

		this._disassembledInstructions = this._register(this._instantiationService.createInstance(WorkbenchTable,
			'DisassemblyView', parent, delegate,
			[
				{
					label: '',
					tooltip: '',
					weight: 0,
					minimumWidth: this.fontInfo.lineHeight,
					maximumWidth: this.fontInfo.lineHeight,
					templateId: BreakpointRenderer.TEMPLATE_ID,
					project(row: IDisassembledInstructionEntry): IDisassembledInstructionEntry { return row; }
				},
				{
					label: 'instructions',
					tooltip: '',
					weight: 0.3,
					templateId: InstructionRenderer.TEMPLATE_ID,
					project(row: IDisassembledInstructionEntry): IDisassembledInstructionEntry { return row; }
				},
			],
			[
				this._instantiationService.createInstance(BreakpointRenderer, this),
				instructionRenderer,
			],
			{
				identityProvider: { getId: (e: IDisassembledInstructionEntry) => e.instruction.address },
				horizontalScrolling: false,
				overrideStyles: {
					listBackground: editorBackground
				},
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				openOnSingleClick: false,
				accessibilityProvider: new AccessibilityProvider(),
				mouseSupport: false
			}
		)) as WorkbenchTable<IDisassembledInstructionEntry>;

		this.reloadDisassembly();

		this._register(this._disassembledInstructions.onDidScroll(e => {
			if (e.oldScrollTop > e.scrollTop && e.scrollTop < e.height) {
				const topElement = Math.floor(e.scrollTop / this.fontInfo.lineHeight) + DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD;
				this.scrollUp_LoadDisassembledInstructions(DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD).then((success) => {
					if (success) {
						this._disassembledInstructions!.reveal(topElement, 0);
					}
				});
			} else if (e.oldScrollTop < e.scrollTop && e.scrollTop + e.height > e.scrollHeight - e.height) {
				this.scrollDown_LoadDisassembledInstructions(DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD);
			}
		}));

		this._register(this._debugService.getViewModel().onDidFocusStackFrame((stackFrame) => {
			if (this._disassembledInstructions) {
				this.goToAddress();
				this._onDidChangeStackFrame.fire();
			}
		}));

		// refresh breakpoints view
		this._register(this._debugService.getModel().onDidChangeBreakpoints(bpEvent => {
			if (bpEvent && this._disassembledInstructions) {
				// draw viewable BP
				let changed = false;
				bpEvent.added?.forEach((bp) => {
					if (bp instanceof InstructionBreakpoint) {
						const index = this.getIndexFromAddress(bp.instructionReference);
						if (index >= 0) {
							this._disassembledInstructions!.row(index).isBreakpointSet = true;
							changed = true;
						}
					}
				});

				bpEvent.removed?.forEach((bp) => {
					if (bp instanceof InstructionBreakpoint) {
						const index = this.getIndexFromAddress(bp.instructionReference);
						if (index >= 0) {
							this._disassembledInstructions!.row(index).isBreakpointSet = false;
							changed = true;
						}
					}
				});

				// get an updated list so that items beyond the current range would render when reached.
				this._instructionBpList = this._debugService.getModel().getInstructionBreakpoints();

				if (changed) {
					this._onDidChangeStackFrame.fire();
				}
			}
		}));

		this._register(this._debugService.onDidChangeState(e => {
			if ((e === State.Running || e === State.Stopped) &&
				(this._previousDebuggingState !== State.Running && this._previousDebuggingState !== State.Stopped)) {
				// Just started debugging, clear the view
				this._disassembledInstructions?.splice(0, this._disassembledInstructions.length, [disassemblyNotAvailable]);
			}
			this._previousDebuggingState = e;
		}));
	}

	layout(dimension: Dimension): void {
		if (this._disassembledInstructions) {
			this._disassembledInstructions.layout(dimension.height);
		}
	}

	/**
	 * Go to the address provided. If no address is provided, reveal the address of the currently focused stack frame.
	 */
	goToAddress(address?: string, focus?: boolean): void {
		if (!this._disassembledInstructions) {
			return;
		}

		if (!address) {
			address = this.focusedInstructionAddress;
		}
		if (!address) {
			return;
		}

		const index = this.getIndexFromAddress(address);
		if (index >= 0) {
			// If the row is out of the viewport, reveal it
			const topElement = Math.floor(this._disassembledInstructions.scrollTop / this.fontInfo.lineHeight);
			const bottomElement = Math.floor((this._disassembledInstructions.scrollTop + this._disassembledInstructions.renderHeight) / this.fontInfo.lineHeight);
			if (index > topElement && index < bottomElement) {
				// Inside the viewport, don't do anything here
			} else if (index <= topElement && index > topElement - 5) {
				// Not too far from top, review it at the top
				this._disassembledInstructions.reveal(index, 0);
			} else if (index >= bottomElement && index < bottomElement + 5) {
				// Not too far from bottom, review it at the bottom
				this._disassembledInstructions.reveal(index, 1);
			} else {
				// Far from the current viewport, reveal it
				this._disassembledInstructions.reveal(index, 0.5);
			}

			if (focus) {
				this._disassembledInstructions.domFocus();
				this._disassembledInstructions.setFocus([index]);
			}
		} else if (this._debugService.state === State.Stopped) {
			// Address is not provided or not in the table currently, clear the table
			// and reload if we are in the state where we can load disassembly.
			this.reloadDisassembly(address);
		}
	}

	private async scrollUp_LoadDisassembledInstructions(instructionCount: number): Promise<boolean> {
		if (this._disassembledInstructions && this._disassembledInstructions.length > 0) {
			const address: string | undefined = this._disassembledInstructions?.row(0).instruction.address;
			return this.loadDisassembledInstructions(address, -instructionCount, instructionCount - 1);
		}

		return false;
	}

	private async scrollDown_LoadDisassembledInstructions(instructionCount: number): Promise<boolean> {
		if (this._disassembledInstructions && this._disassembledInstructions.length > 0) {
			const address: string | undefined = this._disassembledInstructions?.row(this._disassembledInstructions?.length - 1).instruction.address;
			return this.loadDisassembledInstructions(address, 1, instructionCount);
		}

		return false;
	}

	private async loadDisassembledInstructions(address: string | undefined, instructionOffset: number, instructionCount: number): Promise<boolean> {
		// if address is null, then use current stack frame.
		if (!address || address === '-1') {
			address = this.focusedInstructionAddress;
		}
		if (!address) {
			return false;
		}

		// console.log(`DisassemblyView: loadDisassembledInstructions ${address}, ${instructionOffset}, ${instructionCount}`);
		const session = this._debugService.getViewModel().focusedSession;
		const resultEntries = await session?.disassemble(address, 0, instructionOffset, instructionCount);
		if (session && resultEntries && this._disassembledInstructions) {
			const newEntries: IDisassembledInstructionEntry[] = [];

			for (let i = 0; i < resultEntries.length; i++) {
				const found = this._instructionBpList.find(p => p.instructionReference === resultEntries[i].address);
				newEntries.push({ allowBreakpoint: true, isBreakpointSet: found !== undefined, instruction: resultEntries[i] });
			}

			const specialEntriesToRemove = this._disassembledInstructions.length === 1 ? 1 : 0;

			// request is either at the start or end
			if (instructionOffset >= 0) {
				this._disassembledInstructions.splice(this._disassembledInstructions.length, specialEntriesToRemove, newEntries);
			} else {
				this._disassembledInstructions.splice(0, specialEntriesToRemove, newEntries);
			}

			return true;
		}

		return false;
	}

	private getIndexFromAddress(instructionAddress: string): number {
		if (this._disassembledInstructions && this._disassembledInstructions.length > 0) {
			const address = BigInt(instructionAddress);
			if (address) {
				let startIndex = 0;
				let endIndex = this._disassembledInstructions.length - 1;
				const start = this._disassembledInstructions.row(startIndex);
				const end = this._disassembledInstructions.row(endIndex);

				this.ensureAddressParsed(start);
				this.ensureAddressParsed(end);
				if (start.instructionAddress! > address ||
					end.instructionAddress! < address) {
					return -1;
				} else if (start.instructionAddress! === address) {
					return startIndex;
				} else if (end.instructionAddress! === address) {
					return endIndex;
				}

				while (endIndex > startIndex) {
					const midIndex = Math.floor((endIndex - startIndex) / 2) + startIndex;
					const mid = this._disassembledInstructions.row(midIndex);

					this.ensureAddressParsed(mid);
					if (mid.instructionAddress! > address) {
						endIndex = midIndex;
					} else if (mid.instructionAddress! < address) {
						startIndex = midIndex;
					} else {
						return midIndex;
					}
				}

				return startIndex;
			}
		}

		return -1;
	}

	private ensureAddressParsed(entry: IDisassembledInstructionEntry) {
		if (entry.instructionAddress !== undefined) {
			return;
		} else {
			entry.instructionAddress = BigInt(entry.instruction.address);
		}
	}

	/**
	 * Clears the table and reload instructions near the target address
	 */
	private reloadDisassembly(targetAddress?: string) {
		if (this._disassembledInstructions) {
			this._disassembledInstructions.splice(0, this._disassembledInstructions.length, [disassemblyNotAvailable]);
			this._instructionBpList = this._debugService.getModel().getInstructionBreakpoints();
			this.loadDisassembledInstructions(targetAddress, -DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD * 4, DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD * 8).then(() => {
				// on load, set the target instruction in the middle of the page.
				if (this._disassembledInstructions!.length > 0) {
					const targetIndex = Math.floor(this._disassembledInstructions!.length / 2);
					this._disassembledInstructions!.reveal(targetIndex, 0.5);

					// Always focus the target address on reload, or arrow key navigation would look terrible
					this._disassembledInstructions!.domFocus();
					this._disassembledInstructions!.setFocus([targetIndex]);
				}
			});
		}
	}

}

interface IBreakpointColumnTemplateData {
	currentElement: { element?: IDisassembledInstructionEntry };
	icon: HTMLElement;
	disposables: IDisposable[];
}

class BreakpointRenderer implements ITableRenderer<IDisassembledInstructionEntry, IBreakpointColumnTemplateData> {

	static readonly TEMPLATE_ID = 'breakpoint';

	templateId: string = BreakpointRenderer.TEMPLATE_ID;

	private readonly _breakpointIcon = 'codicon-' + icons.breakpoint.regular.id;
	private readonly _breakpointHintIcon = 'codicon-' + icons.debugBreakpointHint.id;
	private readonly _debugStackframe = 'codicon-' + icons.debugStackframe.id;
	private readonly _debugStackframeFocused = 'codicon-' + icons.debugStackframeFocused.id;

	constructor(
		private readonly _disassemblyView: DisassemblyView,
		@IDebugService private readonly _debugService: IDebugService
	) {
	}

	renderTemplate(container: HTMLElement): IBreakpointColumnTemplateData {
		const icon = append(container, $('.disassembly-view'));
		icon.classList.add('codicon');

		icon.style.display = 'flex';
		icon.style.alignItems = 'center';
		icon.style.justifyContent = 'center';

		const currentElement: { element?: IDisassembledInstructionEntry } = { element: undefined };

		const disposables = [
			this._disassemblyView.onDidChangeStackFrame(() => this.rerenderDebugStackframe(icon, currentElement.element)),
			addStandardDisposableListener(container, 'mouseover', () => {
				if (currentElement.element?.allowBreakpoint) {
					icon.classList.add(this._breakpointHintIcon);
				}
			}),
			addStandardDisposableListener(container, 'mouseout', () => {
				if (currentElement.element?.allowBreakpoint) {
					icon.classList.remove(this._breakpointHintIcon);
				}
			}),
			addStandardDisposableListener(container, 'click', () => {
				if (currentElement.element?.allowBreakpoint) {
					// click show hint while waiting for BP to resolve.
					icon.classList.add(this._breakpointHintIcon);
					if (currentElement.element.isBreakpointSet) {
						this._debugService.removeInstructionBreakpoints(currentElement.element.instruction.address);

					} else if (currentElement.element.allowBreakpoint && !currentElement.element.isBreakpointSet) {
						this._debugService.addInstructionBreakpoint(currentElement.element.instruction.address, 0);
					}
				}
			})
		];

		return { currentElement, icon, disposables };
	}

	renderElement(element: IDisassembledInstructionEntry, index: number, templateData: IBreakpointColumnTemplateData, height: number | undefined): void {
		templateData.currentElement.element = element;
		this.rerenderDebugStackframe(templateData.icon, element);
	}

	disposeTemplate(templateData: IBreakpointColumnTemplateData): void {
		dispose(templateData.disposables);
		templateData.disposables = [];
	}

	private rerenderDebugStackframe(icon: HTMLElement, element?: IDisassembledInstructionEntry) {
		if (element?.instruction.address === this._disassemblyView.focusedCurrentInstructionAddress) {
			icon.classList.add(this._debugStackframe);
		} else if (element?.instruction.address === this._disassemblyView.focusedInstructionAddress) {
			icon.classList.add(this._debugStackframeFocused);
		} else {
			icon.classList.remove(this._debugStackframe);
			icon.classList.remove(this._debugStackframeFocused);
		}

		icon.classList.remove(this._breakpointHintIcon);

		if (element?.isBreakpointSet) {
			icon.classList.add(this._breakpointIcon);
		} else {
			icon.classList.remove(this._breakpointIcon);
		}
	}

}

interface IInstructionColumnTemplateData {
	currentElement: { element?: IDisassembledInstructionEntry };
	// TODO: hover widget?
	instruction: HTMLElement;
	disposables: IDisposable[];
}

class InstructionRenderer extends Disposable implements ITableRenderer<IDisassembledInstructionEntry, IInstructionColumnTemplateData> {

	static readonly TEMPLATE_ID = 'instruction';

	private static readonly INSTRUCTION_ADDR_MIN_LENGTH = 25;
	private static readonly INSTRUCTION_BYTES_MIN_LENGTH = 30;

	templateId: string = InstructionRenderer.TEMPLATE_ID;

	private _topStackFrameColor: Color | undefined;
	private _focusedStackFrameColor: Color | undefined;

	constructor(
		private readonly _disassemblyView: DisassemblyView,
		@IThemeService themeService: IThemeService
	) {
		super();

		this._topStackFrameColor = themeService.getColorTheme().getColor(topStackFrameColor);
		this._focusedStackFrameColor = themeService.getColorTheme().getColor(focusedStackFrameColor);

		this._register(themeService.onDidColorThemeChange(e => {
			this._topStackFrameColor = e.getColor(topStackFrameColor);
			this._focusedStackFrameColor = e.getColor(focusedStackFrameColor);
		}));
	}

	renderTemplate(container: HTMLElement): IInstructionColumnTemplateData {
		const instruction = append(container, $('.instruction'));
		this.applyFontInfo(instruction);

		const currentElement: { element?: IDisassembledInstructionEntry } = { element: undefined };

		const disposables = [
			this._disassemblyView.onDidChangeStackFrame(() => this.rerenderBackground(instruction, currentElement.element))
		];

		return { currentElement, instruction, disposables };
	}

	renderElement(element: IDisassembledInstructionEntry, index: number, templateData: IInstructionColumnTemplateData, height: number | undefined): void {
		templateData.currentElement.element = element;

		const instruction = element.instruction;
		const sb = createStringBuilder(10000);
		let spacesToAppend = 10;

		if (instruction.address !== '-1') {
			sb.appendASCIIString(instruction.address);
			if (instruction.address.length < InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH) {
				spacesToAppend = InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH - instruction.address.length;
			}
			for (let i = 0; i < spacesToAppend; i++) {
				sb.appendASCII(0x00A0);
			}
		}

		if (instruction.instructionBytes) {
			sb.appendASCIIString(instruction.instructionBytes);
			spacesToAppend = 10;
			if (instruction.instructionBytes.length < InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH) {
				spacesToAppend = InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH - instruction.instructionBytes.length;
			}
			for (let i = 0; i < spacesToAppend; i++) {
				sb.appendASCII(0x00A0);
			}
		}

		sb.appendASCIIString(instruction.instruction);

		const innerText = sb.build();
		templateData.instruction.innerText = innerText;

		this.rerenderBackground(templateData.instruction, element);
	}

	disposeTemplate(templateData: IInstructionColumnTemplateData): void {
		dispose(templateData.disposables);
		templateData.disposables = [];
	}

	private rerenderBackground(instruction: HTMLElement, element?: IDisassembledInstructionEntry) {
		if (element && this._disassemblyView.currentInstructionAddresses.includes(element.instruction.address)) {
			instruction.style.background = this._topStackFrameColor?.toString() || 'transparent';
		} else if (element?.instruction.address === this._disassemblyView.focusedInstructionAddress) {
			instruction.style.background = this._focusedStackFrameColor?.toString() || 'transparent';
		} else {
			instruction.style.background = 'transparent';
		}
	}

	private applyFontInfo(element: HTMLElement) {
		const fontInfo = this._disassemblyView.fontInfo;
		element.style.fontFamily = fontInfo.getMassagedFontFamily();
		element.style.fontWeight = fontInfo.fontWeight;
		element.style.fontSize = fontInfo.fontSize + 'px';
		element.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
		element.style.letterSpacing = fontInfo.letterSpacing + 'px';
	}

}

class AccessibilityProvider implements IListAccessibilityProvider<IDisassembledInstructionEntry> {

	getWidgetAriaLabel(): string {
		return localize('disassemblyView', "Disassembly View");
	}

	getAriaLabel(element: IDisassembledInstructionEntry): string | null {
		let label = '';

		const instruction = element.instruction;
		if (instruction.address !== '-1') {
			label += `${localize('instructionAddress', "Address")}: ${instruction.address}`;
		}
		if (instruction.instructionBytes) {
			label += `, ${localize('instructionBytes', "Bytes")}: ${instruction.instructionBytes}`;
		}
		label += `, ${localize(`instructionText`, "Instruction")}: ${instruction.instruction}`;

		return label;
	}

}

export class DisassemblyViewContribution implements IWorkbenchContribution {

	private readonly _onDidActiveEditorChangeListener: IDisposable;
	private _onDidChangeModelLanguage: IDisposable | undefined;
	private _languageSupportsDisassemleRequest: IContextKey<boolean> | undefined;

	constructor(
		@IEditorService editorService: IEditorService,
		@IDebugService debugService: IDebugService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		contextKeyService.bufferChangeEvents(() => {
			this._languageSupportsDisassemleRequest = CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST.bindTo(contextKeyService);
		});

		const onDidActiveEditorChangeListener = () => {
			if (this._onDidChangeModelLanguage) {
				this._onDidChangeModelLanguage.dispose();
				this._onDidChangeModelLanguage = undefined;
			}

			const activeTextEditorControl = editorService.activeTextEditorControl;
			if (isCodeEditor(activeTextEditorControl)) {
				const language = activeTextEditorControl.getModel()?.getLanguageIdentifier().language;
				// TODO: instead of using idDebuggerInterestedInLanguage, have a specific ext point for languages
				// support disassembly
				this._languageSupportsDisassemleRequest?.set(!!language && debugService.getAdapterManager().isDebuggerInterestedInLanguage(language));

				this._onDidChangeModelLanguage = activeTextEditorControl.onDidChangeModelLanguage(e => {
					this._languageSupportsDisassemleRequest?.set(debugService.getAdapterManager().isDebuggerInterestedInLanguage(e.newLanguage));
				});
			} else {
				this._languageSupportsDisassemleRequest?.set(false);
			}
		};

		onDidActiveEditorChangeListener();
		this._onDidActiveEditorChangeListener = editorService.onDidActiveEditorChange(onDidActiveEditorChangeListener);
	}

	dispose(): void {
		this._onDidActiveEditorChangeListener.dispose();
		this._onDidChangeModelLanguage?.dispose();
	}

}
