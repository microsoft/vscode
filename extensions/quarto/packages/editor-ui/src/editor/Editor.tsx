/*
 * Editor.tsx
 *
 * Copyright (C) 2019-20 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */


import React, { useCallback, useContext, useEffect, useRef } from 'react';

import { useDispatch } from 'react-redux';

import { JsonRpcRequestTransport } from 'core';

import { 
  defaultPrefs, 
  EditorServer, 
  EditorServices, 
  isSourcePos, 
  NavLocation, 
  Prefs, 
  PrefsProvider, 
  SourcePos 
} from 'editor-types';

import { 
  Editor as PMEditor, 
  EventType, 
  NavigationType,
  UpdateEvent, 
  OutlineChangeEvent, 
  StateChangeEvent,
  EditorFormat,
  kQuartoDocType,
  PandocFormat,
  EditorUISpelling,
  UITools,
  EditorDisplay,
  EditorUIContext,
  EditorOperations,
  EventHandler,
  PandocWriterOptions,
  EditorOptions,
  EditorContext,
  defaultTheme,
  EditorTheme,
  slideIndexForPresentationEditorLocation,
  Extension,
  ExtensionFn
} from 'editor';

import { 
  CommandManagerContext, 
  Commands 
} from '../commands';

import { editorDialogs } from '../dialogs';

import { 
  EditorError,
  editorLoadError,
  editorLoading, 
  editorTitle, 
  isEditorError, 
  setEditorLoadError, 
  setEditorLoading, 
  setEditorOutline, 
  setEditorSelection, 
  setEditorTitle, 
  useEditorSelector, 
  useGetPrefsQuery, 
  useSetPrefsMutation 
} from '../store';

import { 
  editorContext, 
  useEditorSpelling 
} from '../context';

import { 
  editorProsemirrorCommands, 
  editorExternalCommands, 
  editorDebugCommands 
} from './editor-commands';

import { EditorOperationsContext } from './EditorOperationsContext';

import { t } from '../i18n';

import styles from './Editor.module.scss';
import { editorJsonRpcServer, editorJsonRpcServices } from 'editor-core';
import { EditorFind } from './EditorFind';
import { EditorOutlineSidebar } from './outline/EditorOutlineSidebar';
import { EditorLoadFailed } from './EditorLoadFailed';
import { Spinner } from '@fluentui/react-components';


export interface EditorProps {
  id: string;
  className: string;
  display: (commands: () => Commands) => EditorDisplay;
  uiContext: EditorUIContext;
  request: JsonRpcRequestTransport;
  options?: EditorOptions;
  extensions?: Array<Extension | ExtensionFn>;
  onEditorInit?: (editor: EditorOperations) => Promise<void>;
}

export const Editor : React.FC<EditorProps> = (props) => {

  // prefs
  const { data: prefs = defaultPrefs() } = useGetPrefsQuery();
  const [setPrefs] = useSetPrefsMutation();
  // out of band prefs ref and provider (as non-react code needs to read and write prefs)
  const prefsRef = useRef<Prefs | null>(defaultPrefs());
  const editorPrefs : PrefsProvider = { 
    prefs(): Prefs {
      return prefsRef.current || defaultPrefs();
    },
    setPrefs: function (prefs: Record<string,unknown>): void {
      setPrefs({ ...prefsRef.current!, ...prefs });
    }
  };

  // global services
  const [cmState, cmDispatch] = useContext(CommandManagerContext);
  const uiToolsRef = useRef<UITools>(new UITools());
  const server = useRef<EditorServer>(editorJsonRpcServer(props.request));
  const services = useRef<EditorServices>(editorJsonRpcServices(props.request));
  const dialogs = useRef(editorDialogs(editorPrefs, uiToolsRef.current, server.current, props.uiContext));

  // redux state
  const title = useEditorSelector(editorTitle, props.id);
  const loading = useEditorSelector(editorLoading, props.id);
  const loadError = useEditorSelector(editorLoadError, props.id);
  const dispatch = useDispatch();

  // refs we get from rendering
  const parentRef = useRef<HTMLDivElement>(null);

  // refs that hold out of band state 
  // https://stackoverflow.com/questions/57847594/react-hooks-accessing-up-to-date-state-from-within-a-callback
  const editorRef = useRef<PMEditor | null>(null);
  const commandsRef = useRef<Commands | null>(null);
  const spellingRef = useRef<EditorUISpelling | null>(null);
 
  // subscribe/unsubscribe from editor events
  const editorEventsRef = useRef(new Array<VoidFunction>());
  function onEditorEvent<T>(event: EventType<T>, handler: (detail?: T) => void) {
    editorEventsRef.current.push(editorRef.current!.subscribe(event, handler));
  }
  const unregisterEditorEvents = () => {
    editorEventsRef.current.forEach(unregister => unregister());
  }

  // general helper functions
  const editorLoadFailed = (error: EditorError | unknown) => {
    dispatch(setEditorLoading(props.id, false));
    if (isEditorError(error)) {
      dispatch(setEditorLoadError(props.id, error));
    } else {
      const message = (error as Error).message || String(error);
      dispatch(setEditorLoadError(props.id, {
        icon: "error",
        title: t('Unexpected Error Loading Editor'),
        description: [message]
      }));
    }  
  }

  // keep spelling provider up to date 
  spellingRef.current = useEditorSpelling(props.uiContext.getDocumentPath() ||"(Untitled)", { 
    invalidateWord: (word: string) => editorRef.current?.spellingInvalidateWord(word),
    invalidateAllWords: () => editorRef.current?.spellingInvalidateAllWords() 
  });

  // propagate resize when showOutline changes
  useEffect(() => {
    editorRef.current?.resize();
  }, [prefs.showOutline]);

  // initialize the editor
  const initEditor = useCallback(async () => {
    
    try {
      const context = editorContext({
        prefs: () => editorPrefs,
        server: server.current,
        services: services.current,
        request: props.request,
        uiContext: props.uiContext,
        display: () => props.display(() => commandsRef.current!), 
        dialogs: () => dialogs.current,
        spelling: () => spellingRef.current!,
        extensions: props.extensions
      })
  
      editorRef.current = await createEditor(
        parentRef.current!, 
        props.options || {},
        props.options?.initialTheme || defaultTheme(),
        context
      );
      
      showPandocWarnings(editorRef.current?.getPandocFormat());
  
      // subscribe to events
      onEditorEvent(UpdateEvent, onEditorDocChanged);
      onEditorEvent(OutlineChangeEvent, onEditorOutlineChanged);
      onEditorEvent(StateChangeEvent, onEditorStateChanged);
  
      // add commands
      cmDispatch({ type: "ADD_COMMANDS", payload: [
        ...editorProsemirrorCommands(editorRef.current!.commands()),
        ...editorExternalCommands(editorRef.current!),
        ...editorDebugCommands(editorRef.current!),
      ]});
  
      // set menus
      cmDispatch({ type: "SET_MENUS", payload: editorRef.current!.getMenus()});
  
      // load editor
      if (props.onEditorInit) {
        await props.onEditorInit(editor);
      } 
  
      // set title and outline
      dispatch(setEditorTitle(props.id, editorRef.current?.getTitle() || ''));
      onEditorOutlineChanged();
    } catch (error) {
      editorLoadFailed(error);
    }
    
  }, []);

  // provide EditorOperations -- we need to provide a fully bound instance
  // of EditorOperations to EditorOperationsContext _before_ we've actually
  // created the editor -- this bit of indirection handles this by delegating
  // to editorRef.current!  
  const editor: EditorOperations = {
    setTitle(title: string) {
     editorRef.current!.setTitle(title)
    },
    async setMarkdown(
      markdown: string, 
      options: PandocWriterOptions, 
      emitUpdate: boolean
    ) {

      // ensure that there is some content
      markdown = markdown || " ";

      // if we don't support untitled and this is untitled then show that error
      if (props.uiContext.getDocumentPath() === null && props.options?.cannotEditUntitled) {
        editorLoadFailed({
          icon: "document",
          title: t("untitled_document"),
          description: [
            t('untitled_document_cannot_be_edited'),
            t('untitled_document_switch_and_save'),
            t('untitled_document_reopen_visual')
          ]
        });
        return null;
      }

      // attempt to set markdown
      const editor = editorRef.current!;
      const result = await editor.setMarkdown(markdown, options, emitUpdate);

      // check for load error
      const kUnableToActivateVisualMode =  t('Unable to Activate Visual Mode');
      if (Object.keys(result.unparsed_meta).length > 0) {
        editorLoadFailed({
          icon: "issue",
          title: kUnableToActivateVisualMode,
          description: [t('Error parsing code chunks out of document.')]
        });
        return null;
      } else if (hasSourceCapsule(result.canonical)) {
        editorLoadFailed({
          icon: "issue",
          title: kUnableToActivateVisualMode,
          description: [t('Error parsing code chunks out of document.')]
        });
        return null;
      } else if (result.example_lists) {
        editorLoadFailed({
          icon: "issue",
          title: kUnableToActivateVisualMode,
          description: [t('Document contains example lists which are'),
                        t('not currently supported by the visual editor.')]
        });
        return null;
      } else {
        dispatch(setEditorLoading(props.id, false));
        dispatch(setEditorOutline(props.id, editor.getOutline()));
        return result;
      }
    },
    getStateJson() {
      return editorRef.current!.getStateJson();
    },
    getMarkdownFromStateJson(stateJson: unknown, options: PandocWriterOptions) {
      return editorRef.current!.getMarkdownFromStateJson(stateJson, options);
    },
    getSlideIndex() {
      const location = editorRef.current!.getPresentationEditorLocation();
      return slideIndexForPresentationEditorLocation(location);
    },
    getMarkdown(options: PandocWriterOptions) {
      return editorRef.current!.getMarkdown(options);
    },
    getEditorSourcePos() {
      return editorRef.current!.getEditorSourcePos();
    },
    getCodeViewActiveBlockContext() {
      return editorRef.current!.getCodeViewActiveBlockContext();
    },
    setBlockSelection(context, action) {
      editorRef.current!.setBlockSelection(context, action);
    },
    getFindReplace() {
      return editorRef.current?.getFindReplace();
    },
    blur() {
      editorRef.current?.blur();
    },
    focus(navigation?: NavLocation) {  
      if (navigation) {
        if (isSourcePos(navigation)) {
          editorRef.current?.navigateToSourcePos(navigation);
        } else {
          editorRef.current?.navigate(
            NavigationType.XRef, 
            `${navigation.type}:${navigation.id}`,
            false, false
          );
        } 
      }
      // focus after navigation so that we don't get 
      // trapped focusing inside a code view
      editorRef.current?.focus();
    },
    hasFocus() {
      return editorRef.current?.hasFocus() || false;
    },
    navigate(type: NavigationType, id: string, recordCurrent: boolean, animate?: boolean) {
      editorRef.current?.navigate(type, id, recordCurrent, !!animate);
    },
    navigateToSourcePos(pos: SourcePos) {
      editorRef.current?.navigateToSourcePos(pos);
    },
    applyTheme(theme: EditorTheme) {
      editorRef.current?.applyTheme(theme);
    },
    setMaxContentWidth(maxWidth: number, minPadding = 10) {
      editorRef.current?.setMaxContentWidth(maxWidth, minPadding);
    },
    subscribe<TDetail>(event: string | EventType<TDetail>, handler: EventHandler<TDetail>) {
      return editorRef.current!.subscribe(event, handler);
    },
    onPrefsChanged() {
      editorRef.current?.onPrefsChanged();
    },
    onLoadFailed(error: unknown) {
      editorLoadFailed(error);
    }
  }

  // when doc changes propagate title
  const onEditorDocChanged = () => {
    dispatch(setEditorTitle(props.id, editorRef.current?.getTitle() || ''));
  };

  // dispatch outline changes
  const onEditorOutlineChanged = () => {
     const outline = editorRef.current?.getOutline();
     if (outline) {
       dispatch(setEditorOutline(props.id, outline));
     }
  }

  // dispatch selection changes (allows command manager to update)
  const onEditorStateChanged = () => {
    const selection = editorRef.current!.getSelection();
    cmDispatch( { type: "SET_SELECTION", payload: selection } );
    dispatch(setEditorSelection(props.id, selection));
  }

  
  // editor initialization
  useEffect(() => {
    // initialize editor
    initEditor();

    // propagate window resize to editor
    const onResize = () => {
      editorRef.current?.resize();
    }
    window.addEventListener("resize", onResize);

    return () => {
      unregisterEditorEvents();
      window.removeEventListener("resize", onResize);
    }
  }, []);

  // update editor title when it changes
  useEffect(() => {
    if (title !== editorRef.current?.getTitle()) {
      editorRef.current?.setTitle(title);
    }
  }, [title]);

  // update commands ref when it changes
  useEffect(() => {
    commandsRef.current = cmState.commands;
  }, [cmState.commands])

  // update out of band ref to prefs when they change
  useEffect(() => {
    prefsRef.current = prefs;
    editor.onPrefsChanged();
  }, [prefs]);

  // classes
  const classes = [props.className];
  if (prefs.showOutline) {
    classes.push(styles.outlineVisible);
  }
  if (loadError) {
    classes.push(styles.editorLoadError);
  }

  // render
  return (
    <EditorOperationsContext.Provider value={editor}> 
      {editorLoadingUI(props.uiContext, loading, loadError)}
      <div id="editor" className={classes.join(' ')} ref={parentRef}>
        <EditorFind />
        <EditorOutlineSidebar editorId={props.id}/> 
      </div>
    </EditorOperationsContext.Provider>
  );
}

// we don't currently have a dynamic editor format (we always assume quarto
// markdown as-per createEditor function below) so there is no need to show 
// these warnings.
const showPandocWarnings = (pandocFormat?: PandocFormat) => {
  const warnings = pandocFormat?.warnings;
  if (warnings?.invalidFormat) {
    // console.log('WARNING: invalid pandoc format ' + warnings.invalidFormat);
  }
  if (warnings?.invalidOptions.length) {
    // console.log(`WARNING: ${pandocFormat.baseName} does not support options: ${warnings.invalidOptions.join(', ')}`);
  }
}

const editorLoadingUI = (uiContext: EditorUIContext, loading: boolean, loadError?: EditorError) => {
  if (loadError) {
    return <EditorLoadFailed uiContext={uiContext} error={loadError} />
  } if (loading) {
    return (
      <div className={['ProseMirror'].join(' ')}>
        <div className='body pm-editing-root-node pm-text-color pm-background-color'>
          <Spinner className={styles.editorLoadingSpinner} size="huge"  />
        </div>
      </div>
    );
  } else {
    return <div/>;
  }
}
const createEditor = async (
  parent: HTMLElement, 
  options: EditorOptions,
  theme: EditorTheme,
  context: EditorContext
) : Promise<PMEditor> => {
  const format: EditorFormat = {
    pandocMode: 'markdown',
    pandocExtensions: '',
    rmdExtensions: {
      codeChunks: true,
      bookdownPart: true,
      bookdownXRef: true
    },
    hugoExtensions: {
      shortcodes: true
    },
    docTypes: [kQuartoDocType]
  }
  return await PMEditor.create(parent, context, format, options, theme);
}


function hasSourceCapsule(markdown: string) {
  const kRmdBlockCapsuleType = "f3175f2a-e8a0-4436-be12-b33925b6d220".toLowerCase();
  return markdown.includes(kRmdBlockCapsuleType);
}


