/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getPixelRatio, getZoomLevel } from 'vs/base/browser/browser';
import { Dimension, append, $ } from 'vs/base/browser/dom';
import { ITableRenderer, ITableVirtualDelegate } from 'vs/base/browser/ui/table/table';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchTable } from 'vs/platform/list/browser/listService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { DISASSEMBLY_VIEW_ID } from 'vs/workbench/contrib/debug/common/debug';
import * as icons from 'vs/workbench/contrib/debug/browser/debugIcons';

interface IDisassembledInstructionEntry {
	allowBreakpoint: boolean;
	isBreakpointSet: boolean;
	instruction: DebugProtocol.DisassembledInstruction;
}

export class DisassemblyView extends EditorPane {

	private static readonly NUM_INSTRUCTIONS_TO_LOAD = 50;

	private _fontInfo: BareFontInfo;
	private _disassembledInstructions: WorkbenchTable<IDisassembledInstructionEntry> | null;


	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super(DISASSEMBLY_VIEW_ID, telemetryService, themeService, storageService);

		this._fontInfo = BareFontInfo.createFromRawSettings(configurationService.getValue('editor'), getZoomLevel(), getPixelRatio());
		configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor')) {
				this._fontInfo = BareFontInfo.createFromRawSettings(configurationService.getValue('editor'), getZoomLevel(), getPixelRatio());
				this._disassembledInstructions?.rerender();
			}
		});

		this._disassembledInstructions = null;
	}

	protected createEditor(parent: HTMLElement): void {
		const lineHeight = this._fontInfo.lineHeight;
		const delegate = new class implements ITableVirtualDelegate<IDisassembledInstructionEntry>{
			headerRowHeight: number = 0; // No header
			getHeight(row: IDisassembledInstructionEntry): number {
				return lineHeight;
			}
		};

		this._disassembledInstructions = this._register(this._instantiationService.createInstance(WorkbenchTable,
			'DisassemblyView', parent, delegate,
			[
				{
					label: '',
					tooltip: '',
					weight: 0,
					minimumWidth: 40,
					maximumWidth: 40,
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
				this._instantiationService.createInstance(BreakpointRenderer),
				this._instantiationService.createInstance(InstructionRenderer),
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
			}
		)) as WorkbenchTable<IDisassembledInstructionEntry>;

		this.loadDisassembledInstructions(0, DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD * 2, '0x00005000');
		this._disassembledInstructions.reveal(DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD, 0.5);

		this._disassembledInstructions.onDidScroll(e => {
			if (e.oldScrollTop > e.scrollTop && e.scrollTop < e.height) {
				const topElement = Math.floor(e.scrollTop / this._fontInfo.lineHeight) + DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD;
				this.loadDisassembledInstructions(0, DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD, '0x00004000');
				this._disassembledInstructions!.reveal(topElement, 0);
			} else if (e.oldScrollTop < e.scrollTop && e.scrollTop + e.height > e.scrollHeight - e.height) {
				this.loadDisassembledInstructions(this._disassembledInstructions!.length, DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD, '0x00004000');
			}
		});
	}

	layout(dimension: Dimension): void {
		if (this._disassembledInstructions) {
			this._disassembledInstructions.layout(dimension.height);
		}
	}

	private loadDisassembledInstructions(index: number, numInstructions: number, address: string): void {
		const newEntries: IDisassembledInstructionEntry[] = [];
		for (let i = 0; i < numInstructions; i++) {
			newEntries.push({ allowBreakpoint: true, isBreakpointSet: false, instruction: { address: `${address}${i}`, instruction: 'instruction instruction, instruction' } });
		}
		if (this._disassembledInstructions) {
			// TODO: append/insert
			this._disassembledInstructions.splice(index, 0, newEntries);
		}
	}

}

interface IBreakpointColumnTemplateData {
	container: HTMLElement,
	icon: HTMLElement | undefined
}

class BreakpointRenderer implements ITableRenderer<IDisassembledInstructionEntry, IBreakpointColumnTemplateData> {

	static readonly TEMPLATE_ID = 'breakpoint';

	templateId: string = BreakpointRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IBreakpointColumnTemplateData {
		return { container, icon: undefined };
	}

	renderElement(element: IDisassembledInstructionEntry, index: number, templateData: IBreakpointColumnTemplateData, height: number | undefined): void {
		// TODO: see getBreakpointMessageAndIcon in vs\workbench\contrib\debug\browser\breakpointEditorContribution.ts
		//       for more types of breakpoint icons
		if (element.allowBreakpoint) {
			if (element.isBreakpointSet) {
				templateData.container.className = ThemeIcon.asClassName(icons.breakpoint.regular);
			} else {
				templateData.container.onmouseover = () => {
					if (!templateData.icon) {
						templateData.icon = append(templateData.container, $('.icon'));
					}
					templateData.icon.className = ThemeIcon.asClassName(icons.debugBreakpointHint);
				};
				templateData.container.onmouseout = () => {
					if (templateData.icon) {
						templateData.container.removeChild(templateData.icon);
						templateData.icon = undefined;
					}
				};
			}

			templateData.container.onclick = () => {
				if (element.isBreakpointSet) {
					element.isBreakpointSet = false;
					if (templateData.icon) {
						templateData.container.removeChild(templateData.icon);
						templateData.icon = undefined;
					}
					templateData.container.onmouseover = () => {
						templateData.icon = append(templateData.container, $('.icon'));
						templateData.icon.className = ThemeIcon.asClassName(icons.debugBreakpointHint);
					};
					templateData.container.onmouseout = () => {
						if (templateData.icon) {
							templateData.container.removeChild(templateData.icon);
							templateData.icon = undefined;
						}
					};
				} else if (element.allowBreakpoint) {
					element.isBreakpointSet = true;
					if (!templateData.icon) {
						templateData.icon = append(templateData.container, $('.icon'));
					}
					templateData.icon.className = ThemeIcon.asClassName(icons.breakpoint.regular);
					templateData.container.onmouseover = null;
					templateData.container.onmouseout = null;
				}
			};
		}
	}

	disposeTemplate(templateData: IBreakpointColumnTemplateData): void {
		templateData.container.onclick = null;
		templateData.container.onmouseover = null;
		templateData.container.onmouseout = null;
	}

}

interface IInstructionColumnTemplateData {
	// TODO: hover widget?
	instruction: HTMLElement;
}

class InstructionRenderer implements ITableRenderer<IDisassembledInstructionEntry, IInstructionColumnTemplateData> {

	static readonly TEMPLATE_ID = 'instruction';

	templateId: string = InstructionRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IInstructionColumnTemplateData {
		const instruction = append(container, $('instruction'));
		return { instruction };
	}

	renderElement(element: IDisassembledInstructionEntry, index: number, templateData: IInstructionColumnTemplateData, height: number | undefined): void {
		const instruction = element.instruction;
		templateData.instruction.innerText = `${instruction.address}\t${instruction.instructionBytes}\t${instruction.instruction}`;
	}

	disposeTemplate(templateData: IInstructionColumnTemplateData): void { }

}

export class DisassemblyViewInput extends EditorInput {

	static readonly ID = 'debug.disassemblyView.input';

	override get typeId(): string {
		return DisassemblyViewInput.ID;
	}

	static _instance: DisassemblyViewInput;
	static get instance() {
		if (!DisassemblyViewInput._instance || DisassemblyViewInput._instance.isDisposed()) {
			DisassemblyViewInput._instance = new DisassemblyViewInput();
		}

		return DisassemblyViewInput._instance;
	}

	readonly resource = undefined;

	override getName(): string {
		return localize('disassemblyInputName', "Disassembly");
	}

	override matches(other: unknown): boolean {
		return other instanceof DisassemblyViewInput;
	}
}
