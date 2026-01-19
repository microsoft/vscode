/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCodeEditor, isDiffEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IOutlineModelService } from '../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IHistoryService } from '../../history/common/history.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAICoreContextBuilder } from '../common/aiCoreContextBuilder.js';
import type { AICoreContext, AICoreFileContext, AICoreRequest, AICoreSymbol } from '../common/aiCoreTypes.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

export class AICoreContextBuilder implements IAICoreContextBuilder {
	readonly _serviceBrand: undefined;

	private static readonly MAX_CONTENT_CHARS = 100_000;
	private static readonly MAX_RECENT_FILES = 5;
	private static readonly MAX_RECENT_FILE_CHARS = 20_000;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IHistoryService private readonly historyService: IHistoryService,
		@IOutlineModelService private readonly outlineModelService: IOutlineModelService
	) { }

	async buildContext(_req: AICoreRequest): Promise<AICoreContext> {
		const activeEditor = this.getActiveCodeEditor();
		const files: AICoreFileContext[] = [];
		let snippets: AICoreContext['snippets'] | undefined;
		let symbols: AICoreSymbol[] | undefined;

		// 1. 当前活动编辑器
		if (activeEditor?.hasModel()) {
			const model = activeEditor.getModel();
			const selection = activeEditor.getSelection();
			const activeFile = this.buildFileContext(model, selection, true);
			files.push(activeFile);

			if (selection && !selection.isEmpty()) {
				snippets = [{ uri: model.uri.toString(), snippet: model.getValueInRange(selection) }];
			}

			// 获取符号信息
			symbols = await this.getSymbols(model);
		}

		// 2. 最近打开的文件
		const recentFiles = this.getRecentFiles(files.map(f => f.uri));

		return { files, recentFiles, symbols, snippets };
	}

	private buildFileContext(model: ITextModel, selection: Range | null, isActive: boolean): AICoreFileContext {
		const contentLength = model.getValueLength();
		const maxChars = isActive ? AICoreContextBuilder.MAX_CONTENT_CHARS : AICoreContextBuilder.MAX_RECENT_FILE_CHARS;

		const ranges = selection && !selection.isEmpty() ? (() => {
			const tuple: [number, number] = [
				model.getOffsetAt(selection.getStartPosition()),
				model.getOffsetAt(selection.getEndPosition())
			];
			return [tuple];
		})() : undefined;

		let content: string;
		if (contentLength <= maxChars) {
			content = model.getValue();
		} else if (selection && !selection.isEmpty()) {
			content = model.getValueInRange(selection);
		} else {
			const endPosition = model.getPositionAt(maxChars);
			content = model.getValueInRange(new Range(1, 1, endPosition.lineNumber, endPosition.column));
		}

		return {
			uri: model.uri.toString(),
			content,
			languageId: model.getLanguageId(),
			ranges,
			isActive
		};
	}

	private getRecentFiles(excludeUris: string[]): AICoreFileContext[] {
		const recentFiles: AICoreFileContext[] = [];
		const excludeSet = new Set(excludeUris);

		const recentlyOpened = this.historyService.getHistory();
		let count = 0;

		for (const entry of recentlyOpened) {
			if (count >= AICoreContextBuilder.MAX_RECENT_FILES) {
				break;
			}

			const resource = entry.resource;
			if (!resource || excludeSet.has(resource.toString())) {
				continue;
			}

			// 仅记录最近文件的 URI，不加载内容（避免打开编辑器）
			recentFiles.push({
				uri: resource.toString(),
				content: '', // 延迟加载
				isActive: false
			});
			count++;
		}

		return recentFiles;
	}

	private async getSymbols(model: ITextModel): Promise<AICoreSymbol[]> {
		try {
			const outlineModel = await this.outlineModelService.getOrCreate(model, CancellationToken.None);
			const symbols: AICoreSymbol[] = [];

			const processElement = (element: unknown) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const el = element as any;
				if (el && el.symbol) {
					const sym = el.symbol;
					const kindName = typeof sym.kind === 'number' ? this.symbolKindToString(sym.kind) : String(sym.kind);
					symbols.push({
						name: sym.name ?? '',
						kind: kindName,
						range: [
							sym.range?.startLineNumber ?? 1,
							sym.range?.startColumn ?? 1,
							sym.range?.endLineNumber ?? 1,
							sym.range?.endColumn ?? 1
						],
						containerName: sym.containerName
					});
				}

				// 递归处理子符号
				if (el && el.children) {
					for (const child of el.children.values()) {
						processElement(child);
					}
				}
			};

			for (const child of outlineModel.children.values()) {
				processElement(child);
			}

			return symbols;
		} catch {
			return [];
		}
	}

	private symbolKindToString(kind: number): string {
		const names: Record<number, string> = {
			0: 'File', 1: 'Module', 2: 'Namespace', 3: 'Package', 4: 'Class',
			5: 'Method', 6: 'Property', 7: 'Field', 8: 'Constructor', 9: 'Enum',
			10: 'Interface', 11: 'Function', 12: 'Variable', 13: 'Constant',
			14: 'String', 15: 'Number', 16: 'Boolean', 17: 'Array', 18: 'Object',
			19: 'Key', 20: 'Null', 21: 'EnumMember', 22: 'Struct', 23: 'Event',
			24: 'Operator', 25: 'TypeParameter'
		};
		return names[kind] ?? 'Unknown';
	}

	private getActiveCodeEditor(): ICodeEditor | undefined {
		let activeTextEditorControl = this.editorService.activeTextEditorControl;

		if (isDiffEditor(activeTextEditorControl)) {
			if (activeTextEditorControl.getOriginalEditor().hasTextFocus()) {
				activeTextEditorControl = activeTextEditorControl.getOriginalEditor();
			} else {
				activeTextEditorControl = activeTextEditorControl.getModifiedEditor();
			}
		}

		if (!isCodeEditor(activeTextEditorControl) || !activeTextEditorControl.hasModel()) {
			return undefined;
		}

		return activeTextEditorControl;
	}
}

registerSingleton(IAICoreContextBuilder, AICoreContextBuilder, InstantiationType.Delayed);
