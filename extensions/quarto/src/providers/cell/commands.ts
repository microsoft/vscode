/*
 * commands.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { lines } from "core";
import { CodeViewActiveBlockContext, CodeViewSelectionAction } from "editor-types";
import {
  Position,
  Range,
  Selection,
  TextEditor,
  TextDocument,
  TextEditorRevealType,
  window,
} from "vscode";
import {
  Token,
  TokenCodeBlock,
  TokenMath,
  isDisplayMath,
  isExecutableLanguageBlock,
  isExecutableLanguageBlockOf,
  languageBlockAtPosition,
  languageNameFromBlock
} from "quarto-core";
import { Command } from "../../core/command";
import { isQuartoDoc } from "../../core/doc";
import { MarkdownEngine } from "../../markdown/engine";
import { QuartoVisualEditor, VisualEditorProvider } from "../editor/editor";
import {
  blockHasExecutor,
  blockIsExecutable,
  codeWithoutOptionsFromBlock,
  executeInteractive,
  executeSelectionInteractive,
} from "./executors";
import { ExtensionHost } from "../../host";
import { hasHooks } from "../../host/hooks";
import { isKnitrDocument } from "../../host/executors";
import { commands } from "vscode";

export function cellCommands(host: ExtensionHost, engine: MarkdownEngine): Command[] {
  return [
    new RunCurrentCommand(host, engine),
    new RunSelectionCommand(host, engine),
    new RunCurrentAdvanceCommand(host, engine),
    new RunCurrentCellCommand(host, engine),
    new RunNextCellCommand(host, engine),
    new RunPreviousCellCommand(host, engine),
    new RunCellsAboveCommand(host, engine),
    new RunCellsBelowCommand(host, engine),
    new RunAllCellsCommand(host, engine),
    new GoToNextCellCommand(host, engine),
    new GoToPreviousCellCommand(host, engine),
  ];
}

abstract class RunCommand {
  constructor(
    protected readonly host_: ExtensionHost,
    protected readonly engine_: MarkdownEngine
  ) { }

  public async execute(line?: number): Promise<void> {

    // see if this is for the visual or the source editor
    const visualEditor = VisualEditorProvider.activeEditor();
    if (visualEditor) {
      const blockContext = await visualEditor.getActiveBlockContext();
      if (blockContext) {
        if (await this.hasExecutorForLanguage(blockContext.activeLanguage, visualEditor.document, this.engine_)) {
          await this.doExecuteVisualMode(visualEditor, blockContext);
        } else {
          window.showWarningMessage(`Execution of ${blockContext.activeLanguage} cells is not supported`);
        }
      } else {
        window.showWarningMessage("Editor selection is not within an executable cell");
      }
    } else {
      const editor = window.activeTextEditor;
      const doc = editor?.document;
      if (doc && isQuartoDoc(doc)) {
        const tokens = this.engine_.parse(doc);
        line = line || editor.selection.start.line;
        if (this.blockRequired()) {
          const block = languageBlockAtPosition(
            tokens,
            new Position(line, 0),
            this.includeFence()
          );
          if (block) {
            const language = languageNameFromBlock(block);
            if (await this.hasExecutorForLanguage(language, doc, this.engine_)) {
              await this.doExecute(editor, tokens, line, block);
            }
          } else {
            window.showWarningMessage(
              "Editor selection is not within an executable cell"
            );
          }
        } else {
          await this.doExecute(editor, tokens, line);
        }
      } else {
        window.showWarningMessage("Active editor is not a Quarto document");
      }
    }


  }

  protected includeFence() {
    return true;
  }

  protected blockRequired() {
    return true;
  }

  protected abstract doExecuteVisualMode(
    editor: QuartoVisualEditor,
    context: CodeViewActiveBlockContext
  ): Promise<void>;

  protected abstract doExecute(
    editor: TextEditor,
    tokens: Token[],
    line: number,
    block?: Token
  ): Promise<void>;

  protected async cellExecutorForLanguage(language: string, document: TextDocument, engine: MarkdownEngine) {
    return await this.host_.cellExecutorForLanguage(language, document, engine);
  }

  private async hasExecutorForLanguage(language: string, document: TextDocument, engine: MarkdownEngine) {
    return !!this.cellExecutorForLanguage(language, document, engine);
  }

}

class RunCurrentCellCommand extends RunCommand implements Command {
  constructor(host: ExtensionHost, engine: MarkdownEngine) {
    super(host, engine);
  }
  private static readonly id = "quarto.runCurrentCell";
  public readonly id = RunCurrentCellCommand.id;

  override async doExecute(
    editor: TextEditor,
    _tokens: Token[],
    _line: number,
    block?: Token
  ) {
    if (block && isExecutableLanguageBlock(block)) {
      const language = languageNameFromBlock(block);
      const executor = await this.cellExecutorForLanguage(language, editor.document, this.engine_);
      if (executor) {
        const code = codeWithoutOptionsFromBlock(block);
        await executeInteractive(executor, [code], editor.document);
      }
    }
  }

  override async doExecuteVisualMode(
    editor: QuartoVisualEditor,
    context: CodeViewActiveBlockContext
  ): Promise<void> {
    const activeBlock = context.blocks.find(block => block.active);
    if (activeBlock) {
      const executor = await this.cellExecutorForLanguage(activeBlock.language, editor.document, this.engine_);
      if (executor) {
        await executeInteractive(executor, [activeBlock.code], editor.document);
        await activateIfRequired(editor);
      }
    }
  }
}

class RunNextCellCommand extends RunCommand implements Command {
  constructor(host: ExtensionHost, engine: MarkdownEngine) {
    super(host, engine);
  }
  private static readonly id = "quarto.runNextCell";
  public readonly id = RunNextCellCommand.id;

  override async doExecute(editor: TextEditor, tokens: Token[], line: number) {
    const block = nextBlock(this.host_, line, tokens, true);
    if (block) {
      await runAdjacentBlock(this.host_, editor, this.engine_, block);
    }
  }

  override async doExecuteVisualMode(
    editor: QuartoVisualEditor,
    context: CodeViewActiveBlockContext
  ): Promise<void> {
    const activeBlockIndex = context.blocks.findIndex(block => block.active);
    const nextBlock = context.blocks[activeBlockIndex + 1];
    if (nextBlock) {
      await editor.setBlockSelection(context, "nextblock");
      const executor = await this.cellExecutorForLanguage(nextBlock.language, editor.document, this.engine_);
      if (executor) {
        await executeInteractive(executor, [nextBlock.code], editor.document);
        await activateIfRequired(editor);
      }
    } else {
      window.showInformationMessage("No more cells available to execute");
    }
  }
}

class RunPreviousCellCommand extends RunCommand implements Command {
  constructor(host: ExtensionHost, engine: MarkdownEngine) {
    super(host, engine);
  }
  private static readonly id = "quarto.runPreviousCell";
  public readonly id = RunPreviousCellCommand.id;

  override async doExecute(editor: TextEditor, tokens: Token[], line: number) {
    const block = previousBlock(this.host_, line, tokens, true);
    if (block) {
      if (block) {
        await runAdjacentBlock(this.host_, editor, this.engine_, block);
      }
    }
  }

  override async doExecuteVisualMode(
    editor: QuartoVisualEditor,
    context: CodeViewActiveBlockContext
  ): Promise<void> {
    const activeBlockIndex = context.blocks.findIndex(block => block.active);
    const prevBlock = context.blocks[activeBlockIndex - 1];
    if (prevBlock) {
      await editor.setBlockSelection(context, "prevblock");
      const executor = await this.cellExecutorForLanguage(prevBlock.language, editor.document, this.engine_);
      if (executor) {
        await executeInteractive(executor, [prevBlock.code], editor.document);
        await activateIfRequired(editor);
      }
    } else {
      window.showInformationMessage("No more cells available to execute");
    }
  }
}


class RunCurrentCommand extends RunCommand implements Command {
  constructor(
    host: ExtensionHost,
    engine: MarkdownEngine,
    private readonly runSelection_ = false
  ) {
    super(host, engine);
  }

  public readonly id: string = "quarto.runCurrent";

  override includeFence() {
    return false;
  }

  override async doExecute(
    editor: TextEditor,
    _tokens: Token[],
    _line: number,
    block: Token
  ) {
    // get language and attempt language aware runSelection
    const language = languageNameFromBlock(block);
    const executor = await this.cellExecutorForLanguage(language, editor.document, this.engine_);
    if (executor && isExecutableLanguageBlock(block)) {
      // Resolve this command to "run cell" when we can't find a selection:
      // - the selection is empty
      // - this is not a knitr document
      // - this is not a Python or R document being used in Positron
      const resolveToRunCell = editor.selection.isEmpty &&
        !this.runSelection_ &&
        !isKnitrDocument(editor.document, this.engine_) &&
        (!hasHooks() && (language === "python" || language === "r"));

      if (resolveToRunCell) {
        const code = codeWithoutOptionsFromBlock(block);
        await executeInteractive(executor, [code], editor.document);
      } else {
        // submit
        const executed = await executeSelectionInteractive(executor);

        // if the executor isn't capable of language aware runSelection
        // then determine the selection manually
        if (!executed) {
          // if the selection is empty take the whole line, otherwise
          // take the selected text exactly
          const selection = editor.selection.isEmpty
            ? editor.document.getText(
              new Range(
                new Position(editor.selection.start.line, 0),
                new Position(
                  editor.selection.end.line,
                  editor.document.lineAt(editor.selection.end).text.length
                )
              )
            )
            : editor.document.getText(editor.selection);

          // for empty selections we advance to the next line
          if (editor.selection.isEmpty) {
            const selPos = new Position(editor.selection.start.line + 1, 0);
            editor.selection = new Selection(selPos, selPos);
          }

          // run code
          await executeInteractive(executor, [selection], editor.document);
        }
      }
    }
  }

  override async doExecuteVisualMode(
    editor: QuartoVisualEditor,
    context: CodeViewActiveBlockContext
  ): Promise<void> {
    // get selection and active block
    let selection = context.selectedText;
    const activeBlock = context.blocks.find(block => block.active);

    // if the selection is empty and this isn't a knitr document then it resolves to run cell
    if (selection.length <= 0 && !isKnitrDocument(editor.document, this.engine_)) {
      if (activeBlock) {
        const executor = await this.cellExecutorForLanguage(activeBlock.language, editor.document, this.engine_);
        if (executor) {
          await executeInteractive(executor, [activeBlock.code], editor.document);
          await activateIfRequired(editor);
        }
      }

    } else {
      // if the selection is empty take the whole line, otherwise take the selected text exactly
      let action: CodeViewSelectionAction | undefined;
      if (selection.length <= 0) {
        if (activeBlock) {
          selection = lines(activeBlock.code)[context.selection.start.line];
          action = "nextline";
        }
      }

      // run code
      const executor = await this.cellExecutorForLanguage(context.activeLanguage, editor.document, this.engine_);
      if (executor) {
        await executeInteractive(executor, [selection], editor.document);

        // advance cursor if necessary
        if (action) {
          editor.setBlockSelection(context, "nextline");
        }
      }
    }
  }
}


class RunSelectionCommand extends RunCurrentCommand implements Command {
  constructor(host: ExtensionHost, engine: MarkdownEngine) {
    super(host, engine, true);
  }
  public override readonly id = "quarto.runSelection";

}


class RunCurrentAdvanceCommand extends RunCommand implements Command {
  constructor(host: ExtensionHost, engine: MarkdownEngine) {
    super(host, engine);
  }
  private static readonly id = "quarto.runCurrentAdvance";
  public readonly id = RunCurrentAdvanceCommand.id;

  override includeFence() {
    return false;
  }

  override async doExecute(
    _editor: TextEditor,
    _tokens: Token[],
    _line: number,
    block: Token
  ) {
    if (block && isExecutableLanguageBlock(block)) {
      await commands.executeCommand("quarto.runCurrentCell");
      await commands.executeCommand("quarto.goToNextCell");
    }
  }

  override async doExecuteVisualMode(
    editor: QuartoVisualEditor,
    context: CodeViewActiveBlockContext
  ): Promise<void> {
    const activeBlock = context.blocks.find(block => block.active);
    if (activeBlock) {
      const executor = await this.cellExecutorForLanguage(activeBlock.language, editor.document, this.engine_);
      if (executor) {
        await executeInteractive(executor, [activeBlock.code], editor.document);
        const blockContext = await editor.getActiveBlockContext();
        if (blockContext) {
          await editor.setBlockSelection(blockContext, "nextblock");
        }
      }
    }
  }
}


class RunCellsAboveCommand extends RunCommand implements Command {
  constructor(host: ExtensionHost, engine: MarkdownEngine) {
    super(host, engine);
  }
  private static readonly id = "quarto.runCellsAbove";
  public readonly id = RunCellsAboveCommand.id;

  override blockRequired(): boolean {
    return false;
  }

  override async doExecute(
    editor: TextEditor,
    tokens: Token[],
    line: number,
    block?: Token
  ) {
    // collect up blocks prior to the active one
    const blocks: Token[] = [];
    for (const blk of tokens.filter((token?: Token) => blockIsExecutable(this.host_, token))) {
      // if the end of this block is past the line then bail
      if (blk.range.end.line > line) {
        break;
      }
      blocks.push(blk);
    }

    if (blocks.length > 0) {
      // we need to figure out which language to execute. this is either the language
      // of the passed block (if any) or the language of the block immediately preceding
      // the line this is executed from
      const language = languageNameFromBlock(
        block || blocks[blocks.length - 1]
      );

      const executor = await this.cellExecutorForLanguage(language, editor.document, this.engine_);
      if (executor) {
        // accumulate code
        const code: string[] = [];
        for (const block of blocks.filter(
          isExecutableLanguageBlockOf(language)
        )) {
          code.push(codeWithoutOptionsFromBlock(block));
        }

        // execute
        await executeInteractive(executor, code, editor.document);
      }
    }
  }

  override async doExecuteVisualMode(
    editor: QuartoVisualEditor,
    context: CodeViewActiveBlockContext
  ): Promise<void> {
    const executor = await this.cellExecutorForLanguage(context.activeLanguage, editor.document, this.engine_);
    if (executor) {
      const code: string[] = [];
      for (const block of context.blocks) {
        if (block.active) {
          break;
        } else if (block.language === context.activeLanguage) {
          code.push(block.code);
        }
      }
      if (code.length > 0) {
        await executeInteractive(executor, code, editor.document);
        await activateIfRequired(editor);
      }
    }
  }
}

class RunCellsBelowCommand extends RunCommand implements Command {
  constructor(host: ExtensionHost, engine: MarkdownEngine) {
    super(host, engine);
  }
  private static readonly id = "quarto.runCellsBelow";
  public readonly id = RunCellsBelowCommand.id;

  override blockRequired(): boolean {
    return false;
  }

  override async doExecute(
    editor: TextEditor,
    tokens: Token[],
    line: number,
    block?: Token
  ) {
    // see if we can get the language from the current block
    let language = blockHasExecutor(this.host_, block)
      ? languageNameFromBlock(block!)
      : undefined;

    const blocks: string[] = [];
    for (const blk of tokens.filter((token?: Token) => blockIsExecutable(this.host_, token)) as Array<TokenMath | TokenCodeBlock>) {
      // skip if the cell is above or at the cursor
      if (line < blk.range.start.line) {
        // set language if needed
        const blockLanguage = languageNameFromBlock(blk);
        if (!language) {
          language = blockLanguage;
        }
        // include blocks of this language
        if (blockLanguage === language) {
          blocks.push(codeWithoutOptionsFromBlock(blk));
        }
      }
    }
    // execute
    if (language && blocks.length > 0) {
      const executor = await this.cellExecutorForLanguage(language, editor.document, this.engine_);
      if (executor) {
        await executeInteractive(executor, blocks, editor.document);
      }
    }
  }

  override async doExecuteVisualMode(
    editor: QuartoVisualEditor,
    context: CodeViewActiveBlockContext
  ): Promise<void> {
    const executor = await this.cellExecutorForLanguage(context.activeLanguage, editor.document, this.engine_);
    if (executor) {
      let code: string[] | undefined;
      for (const block of context.blocks) {
        if (block.active) {
          code = [];
        } else if (code && (block.language === context.activeLanguage)) {
          code.push(block.code);
        }
      }
      if (code && code.length > 0) {
        await executeInteractive(executor, code, editor.document);
        await activateIfRequired(editor);
      }
    }
  }
}

class RunAllCellsCommand extends RunCommand implements Command {
  constructor(host: ExtensionHost, engine: MarkdownEngine) {
    super(host, engine);
  }
  private static readonly id = "quarto.runAllCells";
  public readonly id = RunAllCellsCommand.id;

  override blockRequired(): boolean {
    return false;
  }

  override async doExecute(
    editor: TextEditor,
    tokens: Token[],
    _line: number,
    _block?: Token
  ) {
    let language: string | undefined;
    const blocks: string[] = [];
    for (const block of tokens.filter((token?: Token) => blockIsExecutable(this.host_, token)) as Array<TokenMath | TokenCodeBlock>) {
      const blockLanguage = languageNameFromBlock(block);
      if (!language) {
        language = blockLanguage;
      }
      if (blockLanguage === language) {
        blocks.push(codeWithoutOptionsFromBlock(block));
      }
    }
    if (language && blocks.length > 0) {
      const executor = await this.cellExecutorForLanguage(language, editor.document, this.engine_);
      if (executor) {
        await executeInteractive(executor, blocks, editor.document);
      }
    }
  }

  override async doExecuteVisualMode(
    editor: QuartoVisualEditor,
    context: CodeViewActiveBlockContext
  ): Promise<void> {
    const code: string[] = [];
    for (const block of context.blocks) {
      if (block.language === context.activeLanguage) {
        code.push(block.code);
      }
    }
    if (code.length > 0) {
      const executor = await this.cellExecutorForLanguage(context.activeLanguage, editor.document, this.engine_);
      if (executor) {
        await executeInteractive(executor, code, editor.document);
        await activateIfRequired(editor);
      }
    }
  }
}

class GoToCellCommand {
  constructor(
    host: ExtensionHost,
    engine: MarkdownEngine,
    dir: "next" | "previous"
  ) {
    this.host_ = host;
    this.engine_ = engine;
    this.dir_ = dir;
  }

  async execute(): Promise<void> {
    const visualEditor = VisualEditorProvider.activeEditor();
    if (visualEditor) {
      const blockContext = await visualEditor.getActiveBlockContext();
      if (blockContext) {
        if (this.dir_ === "next") {
          await visualEditor.setBlockSelection(blockContext, "nextblock");
        } else {
          await visualEditor.setBlockSelection(blockContext, "prevblock");
        }
        await activateIfRequired(visualEditor);
      } else {
        window.showWarningMessage("Editor selection is not within an executable cell");
      }
    } else {
      const editor = window.activeTextEditor;
      const doc = editor?.document;
      if (doc && isQuartoDoc(doc)) {
        const tokens = this.engine_.parse(doc);
        const line = editor.selection.start.line;
        const selector = this.dir_ === "next" ? nextBlock : previousBlock;
        const cell = selector(this.host_, line, tokens, false, false);
        if (cell) {
          navigateToBlock(editor, cell);
        }
      }
    }

  }


  private host_: ExtensionHost;
  private engine_: MarkdownEngine;
  private dir_: "next" | "previous";
}

class GoToNextCellCommand extends GoToCellCommand implements Command {
  constructor(host: ExtensionHost, engine: MarkdownEngine) {
    super(host, engine, "next");
  }
  private static readonly id = "quarto.goToNextCell";
  public readonly id = GoToNextCellCommand.id;
}

class GoToPreviousCellCommand extends GoToCellCommand implements Command {
  constructor(host: ExtensionHost, engine: MarkdownEngine) {
    super(host, engine, "previous");
  }
  private static readonly id = "quarto.goToPreviousCell";
  public readonly id = GoToPreviousCellCommand.id;
}

async function runAdjacentBlock(host: ExtensionHost, editor: TextEditor, engine: MarkdownEngine, block: TokenMath | TokenCodeBlock) {
  navigateToBlock(editor, block);
  const language = languageNameFromBlock(block);
  const executor = await host.cellExecutorForLanguage(language, editor.document, engine);
  if (executor) {
    await executeInteractive(executor, [codeWithoutOptionsFromBlock(block)], editor.document);
  }
}

function navigateToBlock(editor: TextEditor, block: Token) {
  const blockPos = new Position(block.range.start.line + 1, 0);
  editor.selection = new Selection(blockPos, blockPos);
  editor.revealRange(
    new Range(new Position(block.range.start.line, 0), new Position(block.range.start.line, 0)),
    TextEditorRevealType.InCenterIfOutsideViewport
  );
}

function nextBlock(
  host: ExtensionHost,
  line: number,
  tokens: Token[],
  requireEvaluated = false,
  requireExecutor = true
): TokenMath | TokenCodeBlock | undefined {
  for (const block of tokens.filter(
    requireExecutor
      ? requireEvaluated
        ? (token?: Token) => blockIsExecutable(host, token)
        : (token?: Token) => blockHasExecutor(host, token)
      : (token?: Token) => token && isExecutableLanguageBlock(token) && !isDisplayMath(token)
  )) {
    if (block.range.start.line > line) {
      return block as TokenMath | TokenCodeBlock;
    }
  }
  return undefined;
}

function previousBlock(
  host: ExtensionHost,
  line: number,
  tokens: Token[],
  requireEvaluated = false,
  requireExecutor = true
): TokenMath | TokenCodeBlock | undefined {
  for (const block of tokens
    .filter(
      requireExecutor
        ? requireEvaluated
          ? (token?: Token) => blockIsExecutable(host, token)
          : (token?: Token) => blockHasExecutor(host, token)
        : (token?: Token) => token && isExecutableLanguageBlock(token) && !isDisplayMath(token))
    .reverse()) {
    if (block.range.end.line < line) {
      return block as TokenMath | TokenCodeBlock;
    }
  }
  return undefined;
}

async function activateIfRequired(editor: QuartoVisualEditor) {
  if (!(await editor.hasFocus())) {
    await editor.activate();
  }
}
