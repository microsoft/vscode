/*
 * editor.ts
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

import { inputRules } from 'prosemirror-inputrules';
import { keydownHandler } from 'prosemirror-keymap';
import { Node as ProsemirrorNode, Schema, DOMParser, ParseOptions, Slice, Fragment } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, TextSelection, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import 'prosemirror-view/style/prosemirror.css';

import applyDevTools from "prosemirror-dev-tools";

import { setTextSelection } from 'prosemirror-utils';

import { qtWebEngineVersion } from 'core-browser';

import { citeUI } from '../api/cite';
import { EditorOptions } from '../api/options';
import { ProsemirrorCommand, CommandFn, EditorCommand } from '../api/command';
import { EditorUI, EditorUIImages } from '../api/ui-types';
import {
  InsertCiteProps,
  InsertCiteUI,
  UIToolsAttr,
  UIToolsImage,
  EditorMenus,
  EditorServer, 
  EditingOutlineLocation, 
  EditorOutline, 
  SourcePos,
  NavLocation,
  CodeViewActiveBlockContext,
  CodeViewSelectionAction
} from 'editor-types';

import {
  attrPropsToInput,
  attrInputToProps,
  asPandocId,
  asHtmlId,
} from '../api/ui';

import { Extension, ExtensionFn } from '../api/extension';
import { PandocWriterOptions } from '../api/pandoc-types';
import { PandocCapabilities, getPandocCapabilities } from '../api/pandoc_capabilities';
import { fragmentToHTML } from '../api/html';
import { EventType, EventHandler, PrefsChangedEvent, ThemeChangedEvent } from '../api/event-types';
import { DOMEditorEvents } from '../api/events';

import {
  ScrollEvent,
  UpdateEvent,
  OutlineChangeEvent,
  StateChangeEvent,
  ResizeEvent,
  LayoutEvent,
  FocusEvent,
  DispatchEvent,
  NavigateEvent,
  BlurEvent,
} from '../api/event-types';
import {
  resolvePandocFormat,
  pandocFormatConfigFromCode,
  pandocFormatConfigFromDoc,
} from '../api/pandoc_format';
import {
  PandocFormat,
  PandocFormatConfig
} from '../api/pandoc-types';
import { baseKeysPlugin } from '../api/basekeys';
import {
  appendTransactionsPlugin,
  appendMarkTransactionsPlugin,
  kFixupTransaction,
  kAddToHistoryTransaction,
  kSetMarkdownTransaction,
  kNoUpdateTransaction,
  kThemeChangedTransaction,
} from '../api/transaction';
import { getOutlineNodes, getEditingOutlineLocation } from '../api/outline';
import { EditingLocation, getEditingLocation, setEditingLocation } from '../api/location';
import { navigateTo } from '../api/navigation';
import { NavigationType } from '../api/navigation-types';
import { FixupContext } from '../api/fixup';
import { unitToPixels, pixelsToUnit, roundUnit, kValidUnits } from '../api/image';
import { kPercentUnit } from '../api/css';
import { EditorFormat } from '../api/format';
import { diffChars, EditorChange } from '../api/change';
import { markInputRuleFilter } from '../api/input_rule';
import { editorMath } from '../api/math';
import { EditorEvents } from '../api/event-types';
import { EditorMarkdown } from '../api/markdown-types';
import { insertRmdChunk } from '../api/rmd';
import { pandocAutoIdentifier } from '../api/pandoc_id';
import { wrapSentences } from '../api/wrap';
import { yamlFrontMatter, applyYamlFrontMatter } from '../api/yaml';
import { EditorSpellingDoc } from '../api/spelling';
import { getPresentationEditorLocation, PresentationEditorLocation, positionForPresentationEditorLocation } from '../api/presentation';
import { kPmScrollContainer } from '../api/scroll';
import { codeViewActiveBlockContext, CodeViewExtensionFn, codeViewSetBlockSelection } from '../api/codeview';
import { editingRootNode, editingRootNodeClosestToPos } from '../api/node';
import { ContextMenuSource } from '../api/menu';
import { mapSlice } from '../api/slice';

import { getTitle, setTitle } from '../nodes/yaml_metadata/yaml_metadata-title';
import { getOutline } from '../behaviors/outline';
import {
  FindOptions,
  find,
  matchCount,
  selectFirst,
  selectNext,
  selectPrevious,
  replace,
  replaceAll,
  clear,
  selectCurrent,
  findPluginState,
} from '../behaviors/find';

import { omniInsertExtension } from '../behaviors/omni_insert/omni_insert';
import { completionExtension } from '../behaviors/completion/completion';

import { getSpellingDoc } from '../behaviors/spelling/spelling-interactive';
import { realtimeSpellingPlugin, invalidateAllWords, invalidateWord, spellingContextMenuHandler } from '../behaviors/spelling/spelling-realtime';

import { PandocConverter, PandocLineWrapping } from '../pandoc/pandoc_converter';

import { defaultEditorUIImages } from './editor-images';
import { editorMenus } from './editor-menus';
import { editorSchema } from './editor-schema';

// import styles before extensions so they can be overridden by extensions
import './styles/frame.css';
import './styles/styles.css';
import { ExtensionManager, initExtensions } from './editor-extensions';
import { defaultTheme, EditorTheme, applyTheme, applyPadding } from './editor-theme';
import { getEditorSourcePos } from '../api/sourcepos';
export { defaultTheme };
export type { EditorTheme };

// re-export editor ui
export * from '../api/ui-types';

export interface EditorCode {
  code: string;
  selection_only: boolean;
  location: EditingOutlineLocation;
}

export interface EditorSetMarkdownResult {
  // editor view of markdown (as it will be persisted)
  canonical: string;

  // line wrapping
  line_wrapping: PandocLineWrapping;

  // unrecoginized pandoc tokens
  unrecognized: string[];

  // example lists?
  example_lists: boolean;

  // unparsed meta
  unparsed_meta: { [key: string]: unknown };

  // updated outline 
  location: EditingOutlineLocation;
}

export interface EditorContext {
  readonly server: EditorServer;
  readonly ui: EditorUI;
  readonly hooks?: EditorHooks;
  readonly extensions?: Array<Extension | ExtensionFn>;
  readonly codeViewExtension?: CodeViewExtensionFn;
}

export interface EditorHooks {
  isEditable?: () => boolean;
}

export interface EditorKeybindings {
  [id: string]: string[];
}

export interface EditorSelection {
  from: number;
  to: number;
  navigation_id: string | null;
}

export interface EditorFindReplace {
  find: (term: string, options: FindOptions) => boolean;
  matches: () => number;
  selectFirst: () => boolean;
  selectCurrent: () => boolean;
  selectNext: () => boolean;
  selectPrevious: () => boolean;
  replace: (text: string) => boolean;
  replaceAll: (text: string) => number;
  clear: () => boolean;
}

export { EditorCommandId as EditorCommands } from '../api/command';

export type { UIToolsAttr, UIToolsImage } from "editor-types"

export interface UIToolsFormat {
  parseFormatConfig(markdown: string, isRmd: boolean): PandocFormatConfig;
}

export interface UIToolsSource {
  diffChars(from: string, to: string, timeout: number): EditorChange[];
}

export interface UIToolsCitation {
  citeUI(citeProps: InsertCiteProps): InsertCiteUI;
}

export interface UIToolsContext {
  defaultUIImages(): EditorUIImages;
}

export class UITools {
  public readonly attr: UIToolsAttr;
  public readonly image: UIToolsImage;
  public readonly format: UIToolsFormat;
  public readonly source: UIToolsSource;
  public readonly citation: UIToolsCitation;
  public readonly context: UIToolsContext;

  constructor() {
    this.attr = {
      propsToInput: attrPropsToInput,
      inputToProps: attrInputToProps,
      pandocAutoIdentifier: (text: string) => pandocAutoIdentifier(text, false),
      asPandocId,
      asHtmlId
    };

    this.image = {
      validUnits: () => kValidUnits,
      percentUnit: () => kPercentUnit,
      unitToPixels,
      pixelsToUnit,
      roundUnit,
    };

    this.format = {
      parseFormatConfig: pandocFormatConfigFromCode,
    };

    this.source = {
      diffChars,
    };

    this.citation = {
      citeUI,
    };

    this.context = {
      defaultUIImages: defaultEditorUIImages,
    }
  }
}

const keybindingsPlugin = new PluginKey('keybindings');


// narrower interface for clients
export interface EditorOperations {
  // set content
  setTitle(title: string): void;
  setMarkdown(
    markdown: string,
    options: PandocWriterOptions,
    emitUpdate: boolean
  ): Promise<EditorSetMarkdownResult | null>;

  // get content
  getStateJson() : unknown;
  getMarkdownFromStateJson(stateJson: unknown, options: PandocWriterOptions) : Promise<string>;
  getMarkdown(options: PandocWriterOptions) : Promise<EditorCode>;
  getEditorSourcePos(): SourcePos;
  getSlideIndex(): number;

  // codeviews
  getCodeViewActiveBlockContext() : CodeViewActiveBlockContext | undefined;
  setBlockSelection(context: CodeViewActiveBlockContext, action: CodeViewSelectionAction) : void;

  // subsystems
  getFindReplace() : EditorFindReplace | undefined

  // activation/navigation
  blur(): void;
  focus(navigation?: NavLocation): void;
  hasFocus(): boolean;
  navigate(type: NavigationType, id: string, recordCurrent: boolean, animate?: boolean): void;
  navigateToSourcePos(pos: SourcePos) : void;

  // theme/content
  applyTheme(theme: EditorTheme): void;
  setMaxContentWidth(maxWidth: number, minPadding?: number): void;
 
  // events
  subscribe<TDetail>(event: EventType<TDetail> | string, handler: EventHandler<TDetail>): VoidFunction;

  // notify the editor that prefs have changed
  onPrefsChanged(): void;

  // notify the editor that loading failed
  onLoadFailed(error: unknown): void;
}

export class Editor  {
  // core context passed from client
  private readonly parent: HTMLElement;
  private readonly context: EditorContext;
  private readonly events: EditorEvents;

  // options (derived from defaults + config)
  private readonly options: EditorOptions;

  // format (pandocFormat includes additional diagnostics based on the validity of
  // provided mode + extensions)
  private readonly format: EditorFormat;
  private readonly pandocFormat: PandocFormat;

  // pandoc capabilities
  private pandocCapabilities: PandocCapabilities;

  // markdown services
  private editorMarkdown: EditorMarkdown;

  // core prosemirror state/behaviors
  private readonly extensions: ExtensionManager;
  private readonly schema: Schema;
  private state: EditorState;
  private readonly view: EditorView;
  private readonly pandocConverter: PandocConverter;


  // track active theme
  private theme: EditorTheme;

  // setting via setKeybindings forces reconfiguration of EditorState
  // with plugins recreated
  private keybindings: EditorKeybindings;

  // content width constraints (if unset uses default editor CSS)
  private maxContentWidth = 0;
  private minContentPadding = 0;

  // keep track of whether the last transaction was selection-only
  private lastTrSelectionOnly = false;

  // keep track of whether we are preventing selection (e.g. for a context menu
  // handler that wants to mask the selection change caused by the context click)
  private preventSelectionChange?: (state: EditorState) => boolean;

  // create the editor -- note that the markdown argument does not substitute for calling
  // setMarkdown, rather it's used to read the format comment to determine how to
  // initialize the various editor features
  public static async create(
    parent: HTMLElement,
    context: EditorContext,
    format: EditorFormat,
    options?: EditorOptions,
    theme?: EditorTheme
  ): Promise<Editor> {
    // provide option defaults
    options = {
      autoFocus: false,
      browserSpellCheck: false,
      commenting: false,
      outerScrollContainer: false,
      cannotEditUntitled: false,
      codeEditor: '',
      rmdImagePreview: false,
      hideFormatComment: false,
      defaultCellTypePython: false,
      className: '',
      ...options,
    };

    // provide format defaults
    format = {
      pandocMode: format.pandocMode || 'markdown',
      pandocExtensions: format.pandocExtensions || '',
      rmdExtensions: {
        codeChunks: false,
        bookdownXRef: false,
        bookdownXRefUI: false,
        bookdownPart: false,
        blogdownMathInCode: false,
        ...format.rmdExtensions,
      },
      hugoExtensions: {
        shortcodes: false,
        ...format.hugoExtensions,
      },
      docTypes: format.docTypes || [],
    };

  

    // provide context defaults
    const defaultImages = defaultEditorUIImages();
    context = {
      ...context,
      ui: {
        ...context.ui,
        images: {
          ...defaultImages,
          ...context.ui.images,
          omni_insert: {
            ...defaultImages.omni_insert,
            ...context.ui.images,
          },
          citations: {
            ...defaultImages.citations,
            ...context.ui.images,
          },
        },
      },
    };

    // resolve the format
    const pandocFmt = await resolvePandocFormat(context.server.pandoc, format);

    // get pandoc capabilities
    const pandocCapabilities = await getPandocCapabilities(context.server.pandoc);

    // create editor
    const editor = new Editor(parent, context, options, theme || defaultTheme(), format, pandocFmt, pandocCapabilities);

    // return editor
    return Promise.resolve(editor);
  }

  private constructor(
    parent: HTMLElement,
    context: EditorContext,
    options: EditorOptions,
    theme: EditorTheme,
    format: EditorFormat,
    pandocFormat: PandocFormat,
    pandocCapabilities: PandocCapabilities,
  ) {
    // initialize references
    this.parent = parent;
    this.events = new DOMEditorEvents(parent);
    this.context = context;
    this.options = options;
    this.theme = theme;
    this.format = format;
    this.keybindings = {};
    this.pandocFormat = pandocFormat;
    this.pandocCapabilities = pandocCapabilities;   

    // create core extensions
    this.extensions = this.initExtensions();

    // create schema
    this.schema = editorSchema(this.options, this.extensions, !options.outerScrollContainer);

    // create editor markdown services
    this.editorMarkdown = this.createEditorMarkdown();

    // register completion handlers (done in a separate step b/c omni insert
    // completion handlers require access to the initializezd commands that
    // carry omni insert info)
    this.registerCompletionExtension();

    // register realtime spellchecking (done in a separate step b/c it
    // requires access to PandocMark definitions to determine which
    // marks to exclude from spellchecking)
    if (!this.options.browserSpellCheck) {
      this.parent.setAttribute('spellcheck', 'false');
      this.registerRealtimeSpelling();
    }

    // create state
    this.state = EditorState.create({
      schema: this.schema,
      doc: this.initialDoc(),
      plugins: this.createPlugins(),
    });

    // additional dom attributes for editor node
    const attributes: { [name: string]: string } = {};
    if (options.className) {
      attributes.class = options.className;
    }

    // add scroll container class if we are using an outer scroll container
    if (options.outerScrollContainer) {
      attributes.class = (attributes.class || '').split(' ').concat(kPmScrollContainer).join(' ');
    }

    // create view
    this.view = new EditorView(this.parent, {
      state: this.state,
      dispatchTransaction: this.dispatchTransaction.bind(this),
      domParser: new EditorDOMParser(this.schema),
      attributes,
    });

    // add custom restoreFocus handler to the view -- this provides a custom
    // handler for RStudio's FocusContext, necessary because the default
    // ProseMirror dom mutation handler picks up the focus and changes the
    // selection.
    Object.defineProperty(this.view.dom, 'restoreFocus', {
      value: () => {
        this.focus();
      },
    });

    // apply theme
    this.applyTheme(this.theme);

    // Tell extensions about the new view
    this.extensions.view(this.view);

    // add proportinal font class to parent
    this.parent.classList.add('pm-proportional-font');

    // create pandoc translator
    this.pandocConverter = new PandocConverter(
      this.schema,
      this.extensions,
      context.server.pandoc,
      this.pandocCapabilities,
    );

    // focus editor immediately if requested
    if (this.options.autoFocus) {
      window.setTimeout(() => {
        this.focus();
      }, 10);
    }

    {
      // scroll event optimization, as recommended by
      // https://developer.mozilla.org/en-US/docs/Web/API/Document/scroll_event
      let ticking = false;
      this.parent.addEventListener(
        'scroll',
        () => {
          if (!ticking) {
            window.requestAnimationFrame(() => {
              this.emitEvent(ScrollEvent);
              ticking = false;
            });
            ticking = true;
          }
        },
        { capture: true },
      );
    }
  }

  public destroy() {
    this.view.destroy();
  }

  public subscribe<TDetail>(event: EventType<TDetail> | string, handler: EventHandler<TDetail>): VoidFunction {
    if (typeof event === 'string') {
      return this.events.subscribe({ eventName: event }, handler);
    } else {
      return this.events.subscribe(event, handler);
    }
  }

  public setTitle(title: string) {
    const tr = setTitle(this.state, title);
    if (tr) {
      this.view.dispatch(tr);
    }
  }

  public async setMarkdown(
    markdown: string,
    options: PandocWriterOptions,
    emitUpdate: boolean,
  ): Promise<EditorSetMarkdownResult> {

    // provide option defaults
    options = pandocWriterOptions(options);
   
    // get the result
    const result = await this.pandocConverter.toProsemirror(markdown, this.pandocFormat);
    const { doc, line_wrapping, unrecognized, example_lists, unparsed_meta } = result;

    // if we are preserving history but the existing doc is empty then create a new state
    // (resets the undo stack so that the initial setting of the document can't be undone)
    if (this.isInitialDoc()) {
      this.state = EditorState.create({
        schema: this.state.schema,
        doc,
        plugins: this.state.plugins,
      });
      this.view.updateState(this.state);
    } else {
      // note current editing location
      const loc = this.getEditingLocation();

      // replace the top level nodes in the doc
      const tr = this.state.tr;
      tr.setMeta(kSetMarkdownTransaction, true);
      if (!emitUpdate) {
        tr.setMeta(kNoUpdateTransaction, true);
      }
      let i = 0;
      tr.doc.descendants((node, pos) => {
        const mappedPos = tr.mapping.map(pos);
        tr.replaceRangeWith(mappedPos, mappedPos + node.nodeSize, doc.child(i));
        i++;
        return false;
      });
      // set selection to previous location if it's still valid
      if (loc.pos < tr.doc.nodeSize) {
        // eat exceptions that might result from an invalid position
        try {
          setTextSelection(loc.pos)(tr);
        } catch (e) {
          // do-nothing, this error can happen and shouldn't result in 
          // a failure to setMarkdown
        }
      }
      // dispatch
      this.view.dispatch(tr);
    }

    // apply fixups
    this.applyFixups(FixupContext.Load);

    // notify listeners if requested
    if (emitUpdate) {
      this.emitEvent(UpdateEvent);
      this.emitEvent(OutlineChangeEvent);
      this.emitEvent(StateChangeEvent);
    }

    // return our current markdown representation (so the caller know what our
    // current 'view' of the doc as markdown looks like
    const getMarkdownTr = this.state.tr;
    const canonical = await this.getMarkdownCode(getMarkdownTr, options);
    const location = getEditingOutlineLocation(this.state);

    // return
    return {
      canonical,
      line_wrapping,
      unrecognized,
      example_lists,
      unparsed_meta,
      location
    };
  }

  // flag indicating whether we've ever had setMarkdown (currently we need this
  // because getMarkdown can only be called after setMarkdown b/c it needs
  // the API version retrieved in setMarkdown -- we should remedy this)
  public isInitialDoc() {
    return this.state.doc.attrs.initial;
  }

  public getStateJson() : unknown {
    return this.state.toJSON();
  }

  public async getMarkdownFromStateJson(stateJson: unknown, options: PandocWriterOptions) {
    // provide option defaults
    options = pandocWriterOptions(options);
    const state = EditorState.fromJSON({ schema: this.schema }, stateJson);
    const tr = state.tr;
    return this.getMarkdownCode(tr, options);
  }

  public async getMarkdown(options: PandocWriterOptions): Promise<EditorCode> {
    // get the code
    const tr = this.state.tr;
    const code = await this.getMarkdownCode(tr, options);

    // return code + perhaps outline location
    return {
      code,
      selection_only: this.lastTrSelectionOnly,
      location: getEditingOutlineLocation(this.state),
    };
  }

  public getEditorSourcePos(): SourcePos {
    return getEditorSourcePos(this.state);
  }

  public getEditingOutlineLocation(): EditingOutlineLocation {
    return getEditingOutlineLocation(this.state);
  }

  public getHTML(): string {
    return fragmentToHTML(this.state.schema, this.state.doc.content);
  }

  public getTitle() {
    return getTitle(this.state);
  }

  public getSelection(): EditorSelection {
    const { from, to } = this.state.selection;
    return {
      from,
      to,
      navigation_id: navigationIdForSelection(this.state),
    };
  }

  public getEditingLocation(): EditingLocation {
    return getEditingLocation(this.view);
  }

  public setEditingLocation(outlineLocation?: EditingOutlineLocation, previousLocation?: EditingLocation) {
    setEditingLocation(this.view, outlineLocation, previousLocation);
  }

  public getOutline(): EditorOutline {
    return getOutline(this.state) || [];
  }

  public getFindReplace(): EditorFindReplace {
    return {
      find: (term: string, options: FindOptions) => find(this.view, term, options),
      matches: () => matchCount(this.view),
      selectCurrent: () => selectCurrent(this.view),
      selectFirst: () => selectFirst(this.view),
      selectNext: () => selectNext(this.view),
      selectPrevious: () => selectPrevious(this.view),
      replace: (text: string) => replace(this.view, text),
      replaceAll: (text: string) => replaceAll(this.view, text),
      clear: () => clear(this.view),
    };
  }

  public getSpellingDoc(): EditorSpellingDoc {
    return getSpellingDoc(this.view, this.extensions.pandocMarks());
  }

  public spellingInvalidateAllWords() {
    invalidateAllWords(this.view);
  }

  public spellingInvalidateWord(word: string) {
    invalidateWord(this.view, word);
  }

  // get a canonical version of the passed markdown. this method doesn't mutate the
  // visual editor's state/view (it's provided as a performance optimiation for when
  // source mode is configured to save a canonical version of markdown)
  public async getCanonical(markdown: string, options: PandocWriterOptions): Promise<string> {
    // convert to prosemirror doc
    const result = await this.pandocConverter.toProsemirror(markdown, this.pandocFormat);

    // create a state for this doc
    const state = EditorState.create({
      schema: this.schema,
      doc: result.doc,
      plugins: this.state.plugins,
    });

    // apply load fixups (eumlating what a full round trip will do)
    const tr = state.tr;
    this.extensionFixups(tr, FixupContext.Load);

    // return markdown (will apply save fixups)
    return this.getMarkdownCode(tr, options);
  }

  public getSelectedText(): string {
    return this.state.doc.textBetween(this.state.selection.from, this.state.selection.to);
  }

  public replaceSelection(value: string): void {
    // retrieve properties we need from selection
    const { from, empty } = this.view.state.selection;

    // retrieve selection marks
    const marks = this.view.state.selection.$from.marks();

    // insert text
    const tr = this.view.state.tr.replaceSelectionWith(this.view.state.schema.text(value, marks), false);
    this.view.dispatch(tr);

    // update selection if necessary
    if (!empty) {
      const sel = TextSelection.create(this.view.state.doc, from, from + value.length);
      const trSetSel = this.view.state.tr.setSelection(sel);
      this.view.dispatch(trSetSel);
    }
  }

  public getYamlFrontMatter() {
    if (this.schema.nodes.yaml_metadata) {
      return yamlFrontMatter(this.view.state.doc);
    } else {
      return '';
    }
  }

  public getPresentationEditorLocation() {
    return getPresentationEditorLocation(this.state);
  }

  public navigateToPresentationEditorLocation(location: PresentationEditorLocation) {
    const pos = positionForPresentationEditorLocation(this.state, location);
    if (pos !== -1) {
      this.navigate(NavigationType.Pos, String(pos));
    }
  }

  public applyYamlFrontMatter(yaml: string) {
    if (this.schema.nodes.yaml_metadata) {
      applyYamlFrontMatter(this.view, yaml);
    }
  }

  public focus() {
    this.view.focus();
  }

  public hasFocus() {
    return this.view.hasFocus() || 
      (window.document.hasFocus() && this.parent.contains(window.document.activeElement))
  }

  public blur() {
    (this.view.dom as HTMLElement).blur();
  }

  public getCodeViewActiveBlockContext() : CodeViewActiveBlockContext | undefined {
    return codeViewActiveBlockContext(this.state);
  }

  public setBlockSelection(
    context: CodeViewActiveBlockContext, 
    action: CodeViewSelectionAction) {
    codeViewSetBlockSelection(this.view, context, action);
  }

  public insertChunk(chunkPlaceholder: string) {
    const insertCmd = insertRmdChunk(chunkPlaceholder);
    insertCmd(this.view.state, this.view.dispatch);
    this.focus();
  }

  public navigate(type: NavigationType, location: string, recordCurrent = true, animate = false) {
    // perform navigation
    const nav = navigateTo(this.view, this.format, type, location, animate);

    // emit event
    if (nav !== null) {
      if (!recordCurrent) {
        nav.prevPos = -1;
      }
      this.emitEvent(NavigateEvent, nav);
    }
  }

  public navigateToSourcePos(pos: SourcePos)  {
   
    // find the index
    let cursorIndex = -1;
    for (let i=(pos.locations.length-1); i>=0; i--) {
      if (pos.pos >= pos.locations[i].pos) {
        cursorIndex = i;
        break;
      }
    }

    // map to position
    let targetPos = editingRootNode(this.view.state.selection)!.pos;
    if (cursorIndex !== -1) {
      const locations = this.getEditorSourcePos().locations;
      targetPos = (locations[cursorIndex] || locations[locations.length-1]).pos;
    }

    // navigate
    this.navigate(NavigationType.Pos, String(targetPos), false, false); 
  }

  public resize() {
    this.syncContentWidth();
    this.applyFixupsOnResize();
    this.emitEvent(ResizeEvent);
  }

  public enableDevTools() {
    applyDevTools(this.view);
  }

  public getMenus(): EditorMenus {
    return editorMenus(this.options, this.context.ui, this.commands());
  }

  public commands(): EditorCommand[] {
    // get keybindings (merge user + default)
    const commandKeys = this.commandKeys();

    return this.extensions.commands(this.schema).map((command: ProsemirrorCommand) => {
      return {
        id: command.id,
        keymap: commandKeys[command.id],
        isActive: () => command.isActive(this.state),
        isEnabled: () => command.isEnabled(this.state),
        plural: () => command.plural(this.state),
        execute: () => {
          command.execute(this.state, this.view.dispatch, this.view);
          if (command.keepFocus) {
            this.focus();
          }
        },
      };
    });
  }

  public applyTheme(theme: EditorTheme) {
    // save theme (for extensions)
    this.theme = theme;

    // set global mode classes
    this.parent.classList.toggle('pm-dark-mode', !!theme.darkMode);
    this.parent.classList.toggle('pm-solarized-mode', !!theme.solarizedMode);
    
    // apply the rest of the theme
    applyTheme(theme);

    // effect transaction for theme
    const tr = this.state.tr;
    tr.setMeta(kThemeChangedTransaction, true);
    tr.setMeta(kAddToHistoryTransaction, false);
    this.view.dispatch(tr);

    // fire event
    this.emitEvent(ThemeChangedEvent);
  }

  public setMaxContentWidth(maxWidth: number, minPadding = 10) {
    this.maxContentWidth = maxWidth;
    this.minContentPadding = minPadding;
    this.syncContentWidth();
  }

  public setKeybindings(keyBindings: EditorKeybindings) {
    // validate that all of these keys can be rebound

    this.keybindings = keyBindings;
    this.state = this.state.reconfigure({
      plugins: this.createPlugins(),
    });
  }

  public getEditorFormat() {
    return this.format;
  }

  public getPandocFormat() {
    return this.pandocFormat;
  }

  public getPandocFormatConfig(isRmd: boolean): PandocFormatConfig {
    return pandocFormatConfigFromDoc(this.state.doc, isRmd);
  }

  // are there context menu items available the current mouse position?
  // note that calling this may put the editor in an 'ignore selection changes'
  // state so anyone calling this must also call contextMenuDismissed when
  // the menu is no longer in play (either ignored or dismissed)
  public contextMenu(event: Event) : ContextMenuSource | undefined {
    if (event.target && event.target instanceof Node) {
      const pos = this.view.posAtDOM(event.target, 0);
      if (pos !== -1) {
        const $pos = this.view.state.doc.resolve(pos);
        const rootNd = editingRootNodeClosestToPos($pos);
        if (rootNd) {
          const handlers = this.extensions.contextMenuHandlers();
          for (const handler of handlers) {
            const menu = handler(this.view, $pos);
            if (menu) {
              return menu;
            }
          }
        }
      }
    }
    return undefined;
  }

  public contextMenuDismissed() {
    this.preventSelectionChange = undefined;
  }

  // notify the editor that the code prefs (accessed via
  // the uiContext) have changed
  public onPrefsChanged() {
    this.emitEvent(PrefsChangedEvent);
  }

  private dispatchTransaction(tr: Transaction) {
    // track previous outline
    const previousOutline = getOutline(this.state);

    // track whether this was a selection-only transaction
    this.lastTrSelectionOnly = tr.selectionSet && !tr.docChanged;

    // apply the transaction
    const apply = this.extensions.applyTransaction();
    this.state = apply ? apply(this.state, tr) : this.state.apply(tr);

    // udpate state
    this.view.updateState(this.state);

    // notify listeners of state change
    this.emitEvent(StateChangeEvent);

    // notify listeners of updates
    if (tr.docChanged || tr.storedMarksSet) {
      // fire updated (unless this was a fixup)
      if (!tr.getMeta(kFixupTransaction) && !tr.getMeta(kNoUpdateTransaction)) {
        this.emitEvent(UpdateEvent);
      }

      // fire outline changed if necessary
      if (getOutline(this.state) !== previousOutline) {
        this.emitEvent(OutlineChangeEvent);
      }
    }

    this.emitEvent(DispatchEvent, tr);

    this.emitEvent(LayoutEvent);
  }

  private emitEvent<TDetail>(eventType: EventType<TDetail>, detail?: TDetail) {
    this.events.emit(eventType, detail);
  }

  private initExtensions() {
    return initExtensions(
      {
        format: this.format,
        options: this.options,
        ui: this.context.ui,
        theme: () => this.theme,
        math: this.context.ui.math ? editorMath(this.context.ui.math) : undefined,
        events: {
          subscribe: this.subscribe.bind(this),
          emit: this.emitEvent.bind(this),
        },
        pandocExtensions: this.pandocFormat.extensions,
        pandocCapabilities: this.pandocCapabilities,
        markdown: this.editorMarkdownProxy(),
        server: this.context.server,
        navigation: {
          navigate: this.navigate.bind(this),
        },
        find: {
          decorations: () => {
            return findPluginState(this.view.state) || null;
          }
        }
      },
      this.context.extensions,
      this.context.codeViewExtension
    );
  }

  private createEditorMarkdown() : EditorMarkdown {
    const markdownFilter = markInputRuleFilter(this.schema, this.extensions.pandocMarks());
    return {
      allowMarkdownPaste(state) {
        return markdownFilter(state);
      },
      markdownToSlice: async (markdown) : Promise<Slice> => {
        // convert markdown to prosemirror
        const result = await this.pandocConverter.toProsemirror(markdown, this.pandocFormat);

        // extract slice
        const slice = new Slice(Fragment.from(result.doc.child(0).content), 0, 0);

        // if the slice has a single paragraph node, then take its contents
        if (slice.content.childCount === 1 &&
          slice.content.child(0)?.type === this.schema.nodes.paragraph) {
          return new Slice(slice.content.child(0).content, slice.openStart, slice.openEnd);
        } else {
          return slice;
        }
      },
    }
  }

  // this.editorMarkdown is not yet created when we call this so we setup a
  // proxy (chicken/egg: EditorMarkdown needs the initialized extensions)
  private editorMarkdownProxy() : EditorMarkdown {
    return {
      allowMarkdownPaste: (state) => {
        return this.editorMarkdown.allowMarkdownPaste(state);
      },
      markdownToSlice: (markdown, openStart, openEnd) => {
        return this.editorMarkdown.markdownToSlice(markdown, openStart, openEnd);
      },
    };
  }

  private registerCompletionExtension() {
    // mark filter used to screen completions from noInputRules marks
    const markFilter = markInputRuleFilter(this.schema, this.extensions.pandocMarks());

    // register omni insert extension
    this.extensions.register([
      omniInsertExtension(this.extensions.omniInserters(this.schema), markFilter, this.context.ui),
    ]);

    // register completion extension
    this.extensions.register([
      completionExtension(this.extensions.completionHandlers(), markFilter, this.context.ui, this.events),
    ]);
  }

  private registerRealtimeSpelling() {
    if (this.context.ui.spelling !== undefined) {
      this.extensions.registerPlugins(
        [realtimeSpellingPlugin(
          this.schema, 
          this.extensions.pandocMarks(), 
          this.context.ui.spelling, 
          this.context.ui.prefs, 
          this.events
        )],
        true,
      );
      this.extensions.register([{
        contextMenuHandlers: () => [
          spellingContextMenuHandler(
            this.context.ui.spelling!, 
            this.context.ui.context.translateText
          )
        ]
      }])
    }
  }

  private createPlugins(): Plugin[] {
    return [
      baseKeysPlugin(this.extensions.baseKeys(this.schema)),
      this.keybindingsPlugin(),
      appendTransactionsPlugin(this.extensions.appendTransactions(this.schema)),
      appendMarkTransactionsPlugin(this.extensions.appendMarkTransactions(this.schema)),
      ...this.extensions.plugins(this.schema),
      this.inputRulesPlugin(),
      this.editablePlugin(),
      this.preventSelectionChangePlugin(),
      this.domEventsPlugin(),
      this.clipboardToDOMPlugin()
    ];
  }

  private editablePlugin() {
    const hooks = this.context.hooks || {};
    return new Plugin({
      key: new PluginKey('editable'),
      props: {
        editable: hooks.isEditable || (() => true),
      },
    });
  }

  private inputRulesPlugin() {
    // filter for disabling input rules for selected marks
    const markFilter = markInputRuleFilter(this.schema, this.extensions.pandocMarks());

    // create the defautl inputRules plugin
    const plugin = inputRules({ rules: this.extensions.inputRules(this.schema) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleTextInput = plugin.props.handleTextInput!.bind(plugin);

    // override to disable input rules as requested
    // https://github.com/ProseMirror/prosemirror-inputrules/commit/b4bf67623aa4c4c1e096c20aa649c0e63751f337
    const customHandleTextInput = (view: EditorView, from: number, to: number, text: string) => {
      if (!markFilter(view.state)) {
        return false;
      }
      return handleTextInput(view, from, to, text);
    };

    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugin.props.handleTextInput = customHandleTextInput;
    return plugin;
  }

  private domEventsPlugin(): Plugin {
    return new Plugin({
      key: new PluginKey('domevents'),
      props: {
        handleDOMEvents: {
          blur: () => {
            this.emitEvent(BlurEvent);
            return false;
          },
          focus: (view: EditorView) => {
            this.emitEvent(FocusEvent, view.state.doc);
            return false;
          },
          keydown: (_view: EditorView, event: Event) => {
            const kbEvent = event as KeyboardEvent;
            if (kbEvent.key === 'Tab' && this.context.ui.prefs.tabKeyMoveFocus()) {
              return true;
            } else {
              return false;
            }
          },
          contextmenu: (_view: EditorView, event: Event) => {
            
            // don't handle if there is no imperative context menu handler
            if (!this.context.ui.display.showContextMenu) {
              return false;
            }

            const menu = this.contextMenu(event);
            if (menu) {
              // show context menu (async)
              const { clientX, clientY } = event as MouseEvent;
              const showContextMenu = async () => {
                this.preventSelectionChange = menu.preventSelectionChange;
                try {
                  const menuItems = await menu.items();
                  await this.context.ui.display.showContextMenu!(menuItems, clientX, clientY);
                } finally {
                  this.preventSelectionChange = undefined;
                }
              };
              showContextMenu();

              event.stopPropagation();
              event.preventDefault();
              return true;
            }
            return false;
          }
        },
      },
    });
  }

  private preventSelectionChangePlugin() : Plugin {
    return new Plugin({
      filterTransaction: (tr: Transaction, state: EditorState) => {
        if (this.preventSelectionChange?.(state)) {
          return !(tr.selectionSet && !tr.docChanged && !tr.storedMarksSet);
        } else {
          return true;
        }
      },
    })
  }

  private clipboardToDOMPlugin() : Plugin {
    const schema = this.schema;
    return new Plugin({
      key: new PluginKey('clipboard-to-dom'),
      props: { 
        transformCopied(slice: Slice) : Slice {
          const newSlice = mapSlice(slice, node => {
            if (node.isText) {
              const clipboardMark = node.marks.find(mark => !!mark.type.spec.attrs?.clipboard);
              if (clipboardMark) {
                let marks = clipboardMark.removeFromSet(node.marks);
                const attrs = { ...clipboardMark.attrs, clipboard: true };
                const newMark = clipboardMark.type.create(attrs);
                marks = newMark.addToSet(marks);
                return  schema.text(node.textContent, marks);
              } else {
                return null;
              }
            } else {
              return null;
            }
          }); 
          return newSlice;
        }
       }
    });
  }

  private keybindingsPlugin(): Plugin {
    // get keybindings (merge user + default)
    const commandKeys = this.commandKeys();

    // command keys from extensions
    const pluginKeys: { [key: string]: CommandFn } = {};
    const commands = this.extensions.commands(this.schema);
    commands.forEach((command: ProsemirrorCommand) => {
      const keys = commandKeys[command.id];
      if (keys) {
        keys.forEach((key: string) => {
          pluginKeys[key] = command.execute;
        });
      }
    });

    // for windows desktop, build a list of control key handlers b/c qtwebengine
    // ends up corrupting ctrl+ keys so they don't hit the ace keybinding
    // (see: https://github.com/rstudio/rstudio/issues/7142)
    const ctrlKeyCodes: { [key: string]: CommandFn } = {};
    Object.keys(pluginKeys).forEach(keyCombo => {
      const match = keyCombo.match(/^Mod-([a-z\\])$/);
      if (match) {
        const key = match[1];
        const keyCode = key === '\\' ? 'Backslash' : `Key${key.toUpperCase()}`;
        ctrlKeyCodes[keyCode] = pluginKeys[keyCombo];
      }
    });

    // create default prosemirror handler
    const prosemirrorKeydownHandler = keydownHandler(pluginKeys);

    // return plugin
    return new Plugin({
      key: keybindingsPlugin,
      props: {
        handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
          // workaround for Ctrl+ keys on windows desktop
          if (this.context.ui.context.isWindowsDesktop() &&
              qtWebEngineVersion() !== undefined) {
            const keyEvent = event as KeyboardEvent;
            if (keyEvent.ctrlKey) {
              const keyCommand = ctrlKeyCodes[keyEvent.code];
              if (keyCommand && keyCommand(this.view.state)) {
                keyCommand(this.view.state, this.view.dispatch, this.view);
                return true;
              }
            }
          }
          // default handling
          return prosemirrorKeydownHandler(view, event);
        },
      },
    });
  }

  private commandKeys(): { [key: string]: readonly string[] } {
    // start with keys provided within command definitions
    const commands = this.extensions.commands(this.schema);
    const defaultKeys = commands.reduce((keys: { [key: string]: readonly string[] }, command: ProsemirrorCommand) => {
      keys[command.id] = command.keymap;
      return keys;
    }, {});

    // merge with user keybindings
    return {
      ...defaultKeys,
      ...this.keybindings,
    };
  }

  // update parent padding based on content width settings (if specified)
  private syncContentWidth() {
    if (this.maxContentWidth && this.view.dom) {
      const minContentPadding = this.minContentPadding || 10;
      const parentWidth = this.view.dom.clientWidth;
      if (parentWidth > this.maxContentWidth + 2 * minContentPadding) {
        applyPadding(`calc((100% - ${this.maxContentWidth}px)/2)`);
      } else {
        applyPadding(this.minContentPadding + 'px');
      }
    }
  }

  private applyFixupsOnResize() {
    const docChanged = this.applyFixups(FixupContext.Resize);
    if (!docChanged) {
      // If applyFixupsOnResize returns true, then layout has already
      // been fired; if it hasn't, we must do so now
      this.emitEvent(LayoutEvent);
    }
  }

  private applyFixups(context: FixupContext) {
    let tr = this.state.tr;
    tr = this.extensionFixups(tr, context);
    if (tr.docChanged) {
      tr.setMeta(kAddToHistoryTransaction, false);
      tr.setMeta(kFixupTransaction, true);
      this.view.dispatch(tr);
      return true;
    }
    return false;
  }

  private extensionFixups(tr: Transaction, context: FixupContext) {
    this.extensions.fixups(this.schema, this.view).forEach(fixup => {
      tr = fixup(tr, context);
    });
    return tr;
  }

  private initialDoc(): ProsemirrorNode {
    return this.schema.nodeFromJSON({
      type: 'doc',
      attrs: {
        initial: true,
      },
      content: [
        { type: 'body', content: [{ type: 'paragraph' }] },
        { type: 'notes', content: [] },
      ],
    });
  }

  private async getMarkdownCode(tr: Transaction, options: PandocWriterOptions) {
    // apply save fixups
    this.extensionFixups(tr, FixupContext.Save);

    // apply sentence wrapping if requested
    if (options.wrap === 'sentence') {
      wrapSentences(tr);
    }

    // get code
    return this.pandocConverter.fromProsemirror(tr.doc, this.pandocFormat, this.pandocCapabilities, options);
  }
}

function navigationIdForSelection(state: EditorState): string | null {
  const outline = getOutlineNodes(state.doc);
  const outlineNode = outline.reverse().find(node => node.pos < state.selection.from);
  if (outlineNode) {
    return outlineNode.node.attrs.navigation_id;
  } else {
    return null;
  }
}

function pandocWriterOptions(options: PandocWriterOptions) : PandocWriterOptions {
  return {
    atxHeaders: true,
    ...options
  }
}

// custom DOMParser that preserves all whitespace (required by display math marks)
class EditorDOMParser extends DOMParser {
  constructor(schema: Schema) {
    super(schema, DOMParser.fromSchema(schema).rules);
  }
  public parse(dom: Node, options?: ParseOptions) {
    return super.parse(dom, { ...options, preserveWhitespace: 'full' });
  }

  public parseSlice(dom: Node, options?: ParseOptions) {
    return super.parseSlice(dom, { ...options, preserveWhitespace: 'full' });
  }
}
