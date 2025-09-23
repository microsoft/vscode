/*
 * prefs.ts
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

import path from "path";

import { Disposable, TextDocument, workspace, window, ColorThemeKind } from "vscode";

import throttle from "lodash.throttle";

import { pandocAutoIdentifier } from "core";

import { defaultMarkdownPrefs, defaultPrefs, MarkdownPrefs, Prefs, PrefsServer } from "editor-types";

import { filePrefsStorage, metadataFilesForDocument, projectDirForDocument, QuartoContext, quartoProjectConfig, yamlFromMetadataFile } from "quarto-core";

import { prefsServer } from "editor-server";
import { MarkdownEngine } from "../../markdown/engine";
import { documentFrontMatter, documentFrontMatterYaml } from "../../markdown/document";
import { existsSync, readFileSync, writeFileSync } from "fs";

const kEditorAutoClosingBrackets = "editor.autoClosingBrackets";
const kEditorRenderWhitespace = "editor.renderWhitespace";
const kEditorInsertSpaces = "editor.insertSpaces";
const kEditorTabSize = "editor.tabSize";
const kEditorFontSize = "editor.fontSize";
const kEditorSelectionHighlight = "editor.selectionHighlight";
const kEditorCursorBlinking = "editor.cursorBlinking";
const kEditorQuickSuggestions = "editor.quickSuggestions";
const kMarkdownPreviewFontFamily = "markdown.preview.fontFamily";
const kQuartoEditorFontSize = "quarto.visualEditor.fontSize";
const kQuartoEditorFontFamily = "quarto.visualEditor.fontFamily";
const kQuartoEditorMaxContentWidth = "quarto.visualEditor.maxContentWidth";
const kQuartoEditorLineNumbers = "quarto.visualEditor.lineNumbers";
const kQuartoEditorSpelling = "quarto.visualEditor.spelling";
const kQuartoEditorSpellingDictionary = "quarto.visualEditor.spellingDictionary";
const kQuartoEditorDefaultListSpacing = "quarto.visualEditor.defaultListSpacing";
const kQuartoEditorMarkdownWrap = "quarto.visualEditor.markdownWrap";
const kQuartoEditorMarkdownWrapColumn = "quarto.visualEditor.markdownWrapColumn";
const kQuartoEditorMarkdownReferences = "quarto.visualEditor.markdownReferences";
const kQuartoEditorMarkdownReferenceLinks = "quarto.visualEditor.markdownReferenceLinks";

const kMonitoredConfigurations = [
  kEditorAutoClosingBrackets,
  kEditorRenderWhitespace,
  kEditorInsertSpaces,
  kEditorTabSize,
  kEditorFontSize,
  kEditorSelectionHighlight,
  kEditorCursorBlinking,
  kMarkdownPreviewFontFamily,
  kQuartoEditorFontSize,
  kQuartoEditorFontFamily,
  kQuartoEditorMaxContentWidth,
  kQuartoEditorLineNumbers,
  kQuartoEditorSpelling,
  kQuartoEditorSpellingDictionary,
  kQuartoEditorDefaultListSpacing,
  kQuartoEditorMarkdownWrap,
  kQuartoEditorMarkdownWrapColumn,
  kQuartoEditorMarkdownReferences,
  kQuartoEditorMarkdownReferenceLinks,
  kEditorQuickSuggestions
];

export async function vscodePrefsServer(
  context: QuartoContext,
  engine: MarkdownEngine,
  document: TextDocument,
  onPrefsChanged: (prefs: Prefs) => void
): Promise<[PrefsServer, Disposable]> {

  const server = prefsServer();
  const defaults = defaultPrefs();

  const getPrefs = async (): Promise<Prefs> => {

    const configuration = workspace.getConfiguration(undefined, document.uri);

    const globalPrefs = await server.getPrefs();
    const prefs = {

      ...(globalPrefs),

      ...readPerDocumentPrefs(document, globalPrefs),

      // theme
      darkMode: window.activeColorTheme.kind === ColorThemeKind.Dark ||
        window.activeColorTheme.kind === ColorThemeKind.HighContrast,
      fontSize: configuration.get<number>(kQuartoEditorFontSize, 0) || configuration.get<number>(kEditorFontSize, defaults.fontSize),
      fontFamily: configuration.get<string>(kQuartoEditorFontFamily) || configuration.get<string>(kMarkdownPreviewFontFamily, defaults.fontFamily),
      maxContentWidth: configuration.get<number>(kQuartoEditorMaxContentWidth, defaults.maxContentWidth),

      // spelling settings
      realtimeSpelling: configuration.get<boolean>(kQuartoEditorSpelling, defaults.realtimeSpelling),
      dictionaryLocale: configuration.get<string>(kQuartoEditorSpellingDictionary, defaults.dictionaryLocale),

      // quarto editor settings
      listSpacing: configuration.get<'spaced' | 'tight'>(kQuartoEditorDefaultListSpacing, defaults.listSpacing),

      // markdown writer settings
      ...(await readMarkdownPrefs(context, engine, document)),

      // vscode code editor settings
      spacesForTab: configuration.get<boolean>(kEditorInsertSpaces, true),
      tabWidth: configuration.get<number>(kEditorTabSize, 4),
      autoClosingBrackets: configuration.get(kEditorAutoClosingBrackets) !== "never",
      highlightSelectedWord: configuration.get<boolean>(kEditorSelectionHighlight, true),
      showWhitespace: configuration.get(kEditorRenderWhitespace) === "all",
      blinkingCursor: configuration.get(kEditorCursorBlinking, "solid") !== "solid",
      quickSuggestions: configuration.get(kEditorQuickSuggestions + ".other", "on") === "on",

      // quarto code editor settings
      lineNumbers: configuration.get<boolean>(kQuartoEditorLineNumbers, defaults.lineNumbers),
    };
    return prefs;
  };


  // throttled prefs change handler
  const kThrottleDelayMs = 100;
  const firePrefsChanged = throttle(() => {
    getPrefs().then(onPrefsChanged);
  }, kThrottleDelayMs, { leading: false, trailing: true });


  // subscribe to changes that can affect prefs
  const disposables: Disposable[] = [];

  // vscode config changes
  disposables.push(workspace.onDidChangeConfiguration(async (e) => {
    if (kMonitoredConfigurations.some(config => e.affectsConfiguration(config))) {
      firePrefsChanged();
    }
  }));

  // color theme changes
  disposables.push(window.onDidChangeActiveColorTheme(() => {
    firePrefsChanged();
  }));

  // front matter changes (only on save)
  let lastDocYamlFrontMatter = documentFrontMatterYaml(engine, document);
  disposables.push(workspace.onDidSaveTextDocument(async (savedDoc) => {
    if (savedDoc.uri.toString() === document.uri.toString()) {
      const yamlFrontMatter = documentFrontMatterYaml(engine, document);
      if (yamlFrontMatter !== lastDocYamlFrontMatter) {
        lastDocYamlFrontMatter = yamlFrontMatter;
        firePrefsChanged();
      }
    }
  }));

  // project config file changes
  const watcher = workspace.createFileSystemWatcher('**/{_quarto,metadata}.{yml,yaml}');
  watcher.onDidChange(firePrefsChanged);
  watcher.onDidCreate(firePrefsChanged);
  watcher.onDidDelete(firePrefsChanged);
  disposables.push(watcher);

  return [
    {
      getPrefs,
      setPrefs: async (prefs: Prefs): Promise<void> => {
        server.setPrefs(prefs);
        writePerDocumentPrefs(document, prefs);
      }
    },
    {
      dispose() {
        for (const disposable of disposables) {
          disposable.dispose();
        }
      }
    }
  ];
}


async function readMarkdownPrefs(
  context: QuartoContext,
  engine: MarkdownEngine,
  document: TextDocument
) {

  // start with defaults
  const defaultPrefs = defaultMarkdownPrefs();

  // layer in vscode config
  const config = workspace.getConfiguration(undefined, document.uri);
  let prefs: MarkdownPrefs = {
    markdownWrap: config.get<'none' | 'column' | 'sentence'>(kQuartoEditorMarkdownWrap, defaultPrefs.markdownWrap),
    markdownWrapColumn: config.get<number>(kQuartoEditorMarkdownWrapColumn, defaultPrefs.markdownWrapColumn),
    markdownReferences: config.get<'block' | 'section' | 'document'>(kQuartoEditorMarkdownReferences, defaultPrefs.markdownReferences),
    markdownReferencesPrefix: defaultPrefs.markdownReferencesPrefix,
    markdownReferenceLinks: config.get<boolean>(kQuartoEditorMarkdownReferenceLinks, defaultPrefs.markdownReferenceLinks),
  };

  // layer in project level settings if specified
  const projectDir = projectDirForDocument(document.uri.fsPath);
  if (projectDir) {
    const metadataFiles = metadataFilesForDocument(document.uri.fsPath);
    if (metadataFiles) {
      // scan from root _project.yml down so settings closer to us win
      for (const metadataFile of metadataFiles.reverse()) {
        const yaml = yamlFromMetadataFile(metadataFile);
        if (yaml) {
          prefs = resolveMarkdownPrefs(yaml, prefs);
        }
      }
    }
  }

  // finally, layer in document level options (highest priority)
  const docYaml = await documentFrontMatter(engine, document);
  prefs = resolveMarkdownPrefs(docYaml, prefs);


  // if this is a book and no explicit prefix is specified, then auto-generate a prefix
  if (!prefs.markdownReferencesPrefix && projectDir) {
    const config = await quartoProjectConfig(context.runQuarto, projectDir);
    const book = config?.config.project.type === "book";
    if (book) {
      const stem = path.basename(document.uri.fsPath, path.extname(document.uri.fsPath));
      const prefix = pandocAutoIdentifier('a' + stem).substring(1) + "-";
      prefs = { ...prefs, markdownReferencesPrefix: prefix };
    }
  }

  // return prefs
  return prefs;
}

function resolveMarkdownPrefs(frontMatter: Record<string, unknown>, prefs: MarkdownPrefs) {

  // copy baseline prefs
  const resolved = { ...prefs };

  // determine editor key
  const editorKey = (frontMatter["editor"] || frontMatter["editor_options"]) as Record<string, unknown>;
  if (!editorKey || typeof editorKey !== "object") {
    return resolved;
  }

  // markdown options
  const markdownKey = editorKey["markdown"] as Record<string, unknown>;
  if (!markdownKey || typeof markdownKey !== "object") {
    return resolved;
  }

  // markdown wrap
  const wrap = markdownKey["wrap"];
  if (wrap) {
    if (typeof (wrap) === "number") {
      resolved.markdownWrap = "column";
      resolved.markdownWrapColumn = wrap;
    } else if (wrap === "none") {
      resolved.markdownWrap = "none";
    } else if (wrap === "sentence") {
      resolved.markdownWrap = "sentence";
    }
  }

  // markdown references
  const referencesKey = markdownKey["references"] as Record<string, unknown>;
  if (referencesKey && typeof (referencesKey) === "object") {
    const location = referencesKey["location"];
    if (location) {
      if (location === 'block') {
        resolved.markdownReferences = 'block';
      } else if (location === 'section') {
        resolved.markdownReferences = 'section';
      } else if (location === 'document') {
        resolved.markdownReferences = 'document';
      }
    }
    const prefix = referencesKey["prefix"];
    resolved.markdownReferencesPrefix = prefix && typeof (prefix) === "string"
      ? prefix
      : resolved.markdownReferencesPrefix;

    const links = referencesKey["links"];
    resolved.markdownReferenceLinks = links === true;
  }

  return resolved;
}


interface PerDocumentPrefs {
  showOutline: boolean;
}

function readPerDocumentPrefs(document: TextDocument, defaultPrefs: Prefs): PerDocumentPrefs {
  const storage = filePrefsStorage(document.uri.fsPath);
  if (existsSync(storage)) {
    const prefs = JSON.parse(readFileSync(storage, { encoding: "utf8" }));
    return {
      showOutline: prefs.showOutline !== undefined ? prefs.showOutline : defaultPrefs.showOutline
    };
  } else {
    return {
      showOutline: defaultPrefs.showOutline
    };
  }
}

function writePerDocumentPrefs(document: TextDocument, prefs: PerDocumentPrefs) {
  const storage = filePrefsStorage(document.uri.fsPath);
  writeFileSync(storage, JSON.stringify(prefs), { encoding: "utf8" });
}
