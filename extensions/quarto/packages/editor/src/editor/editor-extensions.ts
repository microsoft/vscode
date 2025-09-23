/*
 * editor-extensions.ts
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

import { InputRule } from 'prosemirror-inputrules';
import { Schema } from 'prosemirror-model';
import { EditorState, Plugin, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ProsemirrorCommand } from '../api/command';
import { PandocMark } from '../api/mark';
import { PandocNode } from '../api/node';
import { Extension, ExtensionFn, ExtensionContext } from '../api/extension';
import { BaseKeyBinding } from '../api/basekeys';
import { OmniInserter } from '../api/omni_insert';
import { AppendTransactionHandler, AppendMarkTransactionHandler } from '../api/transaction';
import { FixupFn } from '../api/fixup';
import {
  PandocTokenReader,
  PandocMarkWriter,
  PandocNodeWriter,
  PandocPreprocessorFn,
  PandocPostprocessorFn,
  PandocBlockReaderFn,
  PandocInlineHTMLReaderFn,
  PandocTokensFilterFn,
  PandocMarkdownPostProcessorFn,
} from '../api/pandoc';
import { PandocBlockCapsuleFilter } from '../api/pandoc_capsule';
import { markInputRuleFilter } from '../api/input_rule';
import { CompletionHandler } from '../api/completion';

// required extensions (base non-customiziable pandoc nodes/marks + core behaviors)
import nodeText from '../nodes/text';
import nodeParagraph from '../nodes/paragraph';
import nodeHeading from '../nodes/heading';
import nodeBlockquote from '../nodes/blockquote';
import nodeCodeBlock from '../nodes/code_block';
import nodeLists from '../nodes/list/list';
import nodeImage from '../nodes/image/image';
import nodeFigure from '../nodes/image/figure';
import nodeHr from '../nodes/hr';
import nodeHardBreak from '../nodes/hard_break';
import nodeNull from '../nodes/null';
import markEm from '../marks/em';
import markStrong from '../marks/strong';
import markCode from '../marks/code';
import markLink from '../marks/link/link';
import behaviorHistory from '../behaviors/history';
import behaviorSelectAll from '../behaviors/select_all';
import behaviorCursor from '../behaviors/cursor';
import behaviorFind from '../behaviors/find';
import behaviorSpellingInteractive from '../behaviors/spelling/spelling-interactive';
import behaviorClearFormatting from '../behaviors/clear_formatting';

// behaviors
import behaviorSmarty from '../behaviors/smarty';
import behaviorAttrDuplicateId from '../behaviors/attr_duplicate_id';
import behaviorTrailingP from '../behaviors/trailing_p';
import behaviorEmptyMark from '../behaviors/empty_mark';
import behaviorEscapeMark from '../behaviors/escape_mark';
import behaviorOutline from '../behaviors/outline';
import beahviorCodeBlockInput from '../behaviors/code_block_input';
import behaviorPasteText from '../behaviors/paste';
import behaviorBottomPadding from '../behaviors/bottom_padding';
import behaviorInsertSymbol from '../behaviors/insert_symbol/insert_symbol-plugin-symbol';
import behaviorInsertSymbolEmoji from '../behaviors/insert_symbol/insert_symbol-plugin-emoji';
import beahviorInsertSpecialCharacters from '../behaviors/insert_symbol/insert_special_characters';
import behaviorNbsp from '../behaviors/nbsp';
import behaviorRemoveSection from '../behaviors/remove_section';
import behaviorSlides from '../behaviors/slides';

// marks
import markStrikeout from '../marks/strikeout';
import markSuperscript from '../marks/superscript';
import markSubscript from '../marks/subscript';
import markSmallcaps from '../marks/smallcaps';
import markUnderline from '../marks/underline';
import markRawInline from '../marks/raw_inline/raw_inline';
import markRawTex from '../marks/raw_inline/raw_tex';
import markRawHTML from '../marks/raw_inline/raw_html';
import markMath from '../marks/math/math';
import markCite from '../marks/cite/cite';
import markSpan from '../marks/span';
import markXRef from '../marks/xref/xref';
import markHTMLComment from '../marks/raw_inline/raw_html_comment';
import markShortcode from '../marks/shortcode';
import markEmoji from '../marks/emoji/emoji';
import { markOmniInsert } from '../behaviors/omni_insert/omni_insert';

// nodes
import nodeFootnote from '../nodes/footnote/footnote';
import nodeRawBlock from '../nodes/raw_block';
import nodeYamlMetadata from '../nodes/yaml_metadata/yaml_metadata';
import nodeRmdCodeChunk from '../nodes/rmd_chunk/rmd_chunk';
import nodeDiv from '../nodes/div/div';
import nodeLineBlock from '../nodes/line_block';
import nodeTable from '../nodes/table/table';
import nodeDefinitionList from '../nodes/definition_list/definition_list';
import nodeUserComment from '../nodes/user_comment/user_comment';
import nodeShortcodeBlock from '../nodes/shortcode_block';
import nodeHtmlPreserve from '../nodes/html_preserve';

// extension/plugin factories
import { aceExtension } from '../optional/ace/ace';
import { attrEditExtension } from '../behaviors/attr_edit/attr_edit';
import { codeViewClipboardPlugin } from '../api/code';
import { CodeViewExtensionFn, CodeViewOptions } from '../api/codeview';
import { ContextMenuHandlerFn } from '../api/menu';

export function initExtensions(
  context: ExtensionContext, 
  extensions?: Array<Extension | ExtensionFn>,
  codeViewExtension?: CodeViewExtensionFn)
: ExtensionManager {
  // create extension manager
  const manager = new ExtensionManager(context);

  // required extensions
  manager.register([
    nodeText,
    nodeParagraph,
    nodeHeading,
    nodeBlockquote,
    nodeLists,
    nodeCodeBlock,
    nodeImage,
    nodeFigure,
    nodeHr,
    nodeHardBreak,
    nodeNull,
    markEm,
    markStrong,
    markCode,
    markLink,
    behaviorHistory,
    behaviorSelectAll,
    behaviorCursor,
    behaviorFind,
    behaviorSpellingInteractive,
    behaviorClearFormatting,
    behaviorSlides
  ]);

  // optional extensions
  manager.register([
    // behaviors
    behaviorSmarty,
    behaviorAttrDuplicateId,
    behaviorTrailingP,
    behaviorEmptyMark,
    behaviorEscapeMark,
    behaviorOutline,
    beahviorCodeBlockInput,
    behaviorPasteText,
    behaviorBottomPadding,
    behaviorInsertSymbol,
    behaviorInsertSymbolEmoji,
    beahviorInsertSpecialCharacters,
    behaviorNbsp,
    behaviorRemoveSection,

    // nodes
    nodeDiv,
    nodeFootnote,
    nodeYamlMetadata,
    nodeRmdCodeChunk,
    nodeTable,
    nodeDefinitionList,
    nodeLineBlock,
    nodeRawBlock,
    nodeUserComment, // MUST come before markRawInline
    nodeShortcodeBlock,
    nodeHtmlPreserve,

    // marks
    markUnderline,
    markStrikeout,
    markSuperscript,
    markSubscript,
    markSmallcaps,
    markHTMLComment,
    markRawTex,
    markRawHTML,
    markRawInline,
    markMath,
    markCite,
    markSpan,
    markXRef,
    markShortcode,
    markEmoji,
    markOmniInsert,
  ]);

  // register external extensions (except CodeViewExtensions which are registe)
  if (extensions) {
    manager.register(extensions);
  }

  // additional extensions dervied from other extensions (e.g. extensions that have registered attr editors)
  // note that all of these take a callback to access the manager -- this is so that if an extension earlier
  // in the chain registers something the later extensions are able to see it
  manager.register([
    // bindings to 'Edit Attribute' command and UI adornment
    attrEditExtension(context.pandocExtensions, context.ui, context.format, manager.attrEditors()),
  ]);

  // additional plugins derived from extensions
  const codeViews = manager.codeViews();
  const plugins: Plugin[] = [];
  // provide ace code view extension if requested
  if (context.options.codeEditor === 'ace' && context.ui.chunks) {
    codeViewExtension = aceExtension;
  } 
  // register code view extension
  if (codeViewExtension) {
    manager.register([codeViewExtension(codeViews)]);
  }
  plugins.push(codeViewClipboardPlugin(codeViews));

  // register plugins
  manager.registerPlugins(plugins);

  // return manager
  return manager;
}

export class ExtensionManager {
  private context: ExtensionContext;
  private extensions: Extension[];
  private applyTransaction_?: (state: EditorState, tr: Transaction) => EditorState;

  public constructor(context: ExtensionContext) {
    this.context = context;
    this.extensions = [];
  }

  public register(extensions: ReadonlyArray<Extension | ExtensionFn>, priority = false): void {
    extensions.forEach(extension => {
      const ext = typeof extension === 'function' ? extension(this.context) : extension;
      if (ext) {
        if (priority) {
          this.extensions.unshift(ext);
        } else {
          this.extensions.push(ext);
        }
        if (ext?.applyTransaction) {
          if (this.applyTransaction_) {
            throw new Error("Only one applyTransaction handler can be registered")
          }
          this.applyTransaction_ = ext.applyTransaction;
        }
      }
    });
  }

  public registerPlugins(plugins: Plugin[], priority = false) {
    this.register([{ plugins: () => plugins }], priority);
  }

  public view(view: EditorView) {
    this.collect(extension => {
      if (extension.view) {
        extension.view(view);
      }
      return undefined;
    });
  }

  public pandocMarks(): readonly PandocMark[] {
    return this.collect(extension => extension.marks);
  }

  public pandocNodes(): readonly PandocNode[] {
    return this.collect(extension => extension.nodes);
  }

  public pandocPreprocessors(): readonly PandocPreprocessorFn[] {
    return this.collectFrom({
      node: node => [node.pandoc.preprocessor],
    });
  }

  public pandocPostprocessors(): readonly PandocPostprocessorFn[] {
    return this.pandocReaders().flatMap(reader => (reader.postprocessor ? [reader.postprocessor] : []));
  }

  public pandocMarkdownPostProcessors(): readonly PandocMarkdownPostProcessorFn[] {
    return this.collectFrom({
      node: node => [node.pandoc.markdownPostProcessor],
    });
  }

  public pandocTokensFilters(): readonly PandocTokensFilterFn[] {
    return this.collectFrom({
      mark: mark => [mark.pandoc.tokensFilter],
      node: node => [node.pandoc.tokensFilter],
    });
  }

  public pandocBlockReaders(): readonly PandocBlockReaderFn[] {
    return this.collectFrom({
      node: node => [node.pandoc.blockReader],
    });
  }

  public pandocInlineHTMLReaders(): readonly PandocInlineHTMLReaderFn[] {
    return this.collectFrom({
      mark: mark => [mark.pandoc.inlineHTMLReader],
      node: node => [node.pandoc.inlineHTMLReader],
    });
  }

  public pandocBlockCapsuleFilters(): readonly PandocBlockCapsuleFilter[] {
    return this.collectFrom({
      node: node => [node.pandoc.blockCapsuleFilter],
    });
  }

  public pandocReaders(): readonly PandocTokenReader[] {
    return this.collectFrom({
      mark: mark => mark.pandoc.readers,
      node: node => node.pandoc.readers ?? [],
    });
  }

  public pandocMarkWriters(): readonly PandocMarkWriter[] {
    return this.collectFrom({
      mark: mark => [{ name: mark.name, ...mark.pandoc.writer }],
    });
  }

  public pandocNodeWriters(): readonly PandocNodeWriter[] {
    return this.collectFrom({
      node: node => {
        return node.pandoc.writer ? [{ name: node.name, write: node.pandoc.writer! }] : [];
      },
    });
  }

  public commands(schema: Schema): readonly ProsemirrorCommand[] {
    return this.collect<ProsemirrorCommand>(extension => extension.commands?.(schema));
  }

  public omniInserters(schema: Schema): OmniInserter[] {
    const omniInserters: OmniInserter[] = [];
    const commands = this.commands(schema);
    commands.forEach(command => {
      if (command.omniInsert) {
        omniInserters.push({
          ...command.omniInsert,
          id: command.id,
          command: command.execute,
        });
      }
    });
    return omniInserters;
  }

  public codeViews() {
    const views: { [key: string]: CodeViewOptions } = {};
    this.pandocNodes().forEach((node: PandocNode) => {
      if (node.code_view) {
        views[node.name] = node.code_view;
      }
    });
    return views;
  }

  public attrEditors() {
    return this.collectFrom({
      node: node => [node.attr_edit?.()],
    });
  }

  public baseKeys(schema: Schema): readonly BaseKeyBinding[] {
    return this.collect(extension => extension.baseKeys?.(schema));
  }

  public applyTransaction() {
    return this.applyTransaction_;
  }

  public appendTransactions(schema: Schema): readonly AppendTransactionHandler[] {
    return this.collect(extension => extension.appendTransaction?.(schema));
  }

  public appendMarkTransactions(schema: Schema): readonly AppendMarkTransactionHandler[] {
    return this.collect(extension => extension.appendMarkTransaction?.(schema));
  }

  public plugins(schema: Schema): readonly Plugin[] {
    return this.collect(extension => extension.plugins?.(schema));
  }

  public fixups(schema: Schema, view: EditorView): readonly FixupFn[] {
    return this.collect(extension => extension.fixups?.(schema, view));
  }

  public completionHandlers(): readonly CompletionHandler[] {
    return this.collect(extension => extension.completionHandlers?.());
  }

  public contextMenuHandlers(): readonly ContextMenuHandlerFn[] {
    return this.collect(extension => extension.contextMenuHandlers?.());
  }

  // NOTE: return value not readonly b/c it will be fed directly to a
  // Prosemirror interface that doesn't take readonly
  public inputRules(schema: Schema): InputRule[] {
    const markFilter = markInputRuleFilter(schema, this.pandocMarks());
    return this.collect<InputRule>(extension => extension.inputRules?.(schema, markFilter));
  }

  private collect<T>(collector: (extension: Extension) => readonly T[] | undefined) {
    return this.collectFrom({
      extension: extension => collector(extension) ?? [],
    });
  }

  /**
   * Visits extensions in order of registration, providing optional callbacks
   * for extension, mark, and node. The return value of callbacks should be
   * arrays of (T | undefined | null); these will all be concatenated together,
   * with the undefined and nulls filtered out.
   *
   * @param visitor Object containing callback methods for the different
   * extension parts.
   */
  private collectFrom<T>(visitor: {
    extension?: (extension: Extension) => ReadonlyArray<T | undefined | null>;
    mark?: (mark: PandocMark) => ReadonlyArray<T | undefined | null>;
    node?: (node: PandocNode) => ReadonlyArray<T | undefined | null>;
  }): T[] {
    const results: Array<T | undefined | null> = [];

    this.extensions.forEach(extension => {
      if (visitor.extension) {
        results.push(...visitor.extension(extension));
      }
      if (visitor.mark && extension.marks) {
        results.push(...extension.marks.flatMap(visitor.mark));
      }
      if (visitor.node && extension.nodes) {
        results.push(...extension.nodes.flatMap(visitor.node));
      }
    });

    return results.filter(value => typeof value !== 'undefined' && value !== null) as T[];
  }
}
