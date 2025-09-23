/*
 * EditorContainer.tsx
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

import React, { useMemo, useEffect, useContext, useCallback, useState } from 'react';

import * as uuid from 'uuid';

import { FluentProvider } from '@fluentui/react-components';

import { JsonRpcRequestTransport, pathWithForwardSlashes } from 'core';

import { useHotkeys } from "ui-widgets";

import { 
  commandHotkeys, 
  CommandManagerContext, 
  Commands, 
  Editor,  
  EditorUIStore,  
  setEditorTheme, 
  fluentTheme,
  showContextMenu
} from 'editor-ui';

import { EditorMenuItem, EditorOperations, EditorTheme, EditorUIContext, HostContext, XRef } from 'editor';

import { editorHostCommands, ImageChangeSink, syncEditorToHost, VisualEditorHostClient } from './sync';
import { EditorToolbar } from './EditorToolbar';
import { editorThemeFromVSCode } from './theme';


import styles from './Editor.module.scss';

export interface EditorContainerProps {
  context: HostContext;
  host: VisualEditorHostClient;
  request: JsonRpcRequestTransport;  
  store: EditorUIStore;
  editorId: string;
}

const EditorContainer: React.FC<EditorContainerProps> = (props) => {
  
  // register keyboard shortcuts and get handlers
  const [cmState, cmDispatch] = useContext(CommandManagerContext);
  const hotkeys = useMemo(() => { return commandHotkeys(cmState.commands); }, [cmState.commands]);
  const { handleKeyDown, handleKeyUp } = useHotkeys(hotkeys, {});

  // register host oriented commands (e.g. save)
  useEffect(() => {
    cmDispatch({ type: "ADD_COMMANDS", payload: editorHostCommands(props.host) });
  }, []);
 
  // one time creation of editorUIContext
  const [uiContext] = useState(() => new HostEditorUIContext(props.context, props.host));

  // setup state for theme
  const [activeFluentTheme, setActiveFluentTheme] = useState(fluentTheme());
  const applyTheme = useCallback((theme: EditorTheme) => {
    // set editor theme
    setEditorTheme(theme);

    // apply fluent theme
    setActiveFluentTheme(fluentTheme());
  }, []);

  // pair editor w/ host on on init
  const onEditorInit = useCallback((editor: EditorOperations) => {
    syncEditorToHost(editor, uiContext, props.host, props.store, applyTheme);
    return Promise.resolve();
  }, []);

  // ensure that keys we handle aren't propagated to vscode
  const keyboardEventHandler = (handler: React.KeyboardEventHandler) => {
    return (event: React.KeyboardEvent<HTMLElement>) => {
      
      // call handler
      handler(event);

      // for some reason Cmd+Shift+Enter is marked as default prevented, but
      // we want it to propagate!
      const cmdShiftEnter = (event.ctrlKey || event.metaKey) &&  event.shiftKey && event.key === "Enter";

      // propagage
      if (!cmdShiftEnter && event.isDefaultPrevented()) {
        event.stopPropagation();
      }
    };
  }
  
  return (
    <FluentProvider theme={activeFluentTheme}>
      <div 
        className={styles.editorParent} 
        onKeyDown={keyboardEventHandler(handleKeyDown)} 
        onKeyUp={keyboardEventHandler(handleKeyUp)}
      >
        <EditorToolbar editorId={props.editorId}/>
        <Editor
          id={props.editorId}
          className={styles.editorFrame} 
          request={props.request}
          uiContext={uiContext}
          display={editorDisplay(props.host)}
          onEditorInit={onEditorInit}
          options={{
            cannotEditUntitled: true,
            defaultCellTypePython: true,
            initialTheme: editorThemeFromVSCode() 
          }}
        />
      </div>
    </FluentProvider>
   
  );
}

function editorDisplay(host: VisualEditorHostClient)  {
  return (commands: () => Commands) => {
    return {
      openURL(url: string) {
        host.openURL(url);
      },
      navigateToXRef(file: string, xref: XRef) {
        host.navigateToXRef(file, xref);
      },
      navigateToFile(file: string) {
        host.navigateToFile(file);
      },
      showContextMenu(
        items: EditorMenuItem[],
        clientX: number,
        clientY: number
      ): Promise<boolean> {
        return showContextMenu(commands(), items, clientX, clientY);
      }
    };
  };
}


class HostEditorUIContext implements EditorUIContext, ImageChangeSink {
  
  constructor(
    private readonly context: HostContext, 
    private readonly host: VisualEditorHostClient) 
  {
  }
  
  // check if we are the active tab
  public isActiveTab(): boolean {
    return true;
  }

  // get the path to the current document
  public getDocumentPath(): string | null {
    return this.context.documentPath;
  }

  // ensure the edited document is saved on the server before proceeding
  // (note this just means that the server has a copy of it for e.g.
  // indexing xrefs, from the user's standpoint the doc is still dirty)
  public async withSavedDocument(): Promise<boolean> {
    await this.host.flushEditorUpdates();
    return true;
  }

  public reopenInSourceMode(): void {
    this.host.reopenSourceMode();
  }

  public executableLanguges(): string[] {
    return this.context.executableLanguages;
  }

  // get the default directory for resources (e.g. where relative links point to)
  public getDefaultResourceDir(): string {
    return this.context.resourceDir;
  }

  // map from a resource reference (e.g. images/foo.png) to a URL we can use in the document
  public mapResourceToURL(path: string): string | Promise<string> {
    return this.host.editorResourceUri(this.resolvePath(path));
  }

  // are we running in windows desktop mode?
  public isWindowsDesktop(): boolean {
    return this.context.isWindowsDesktop;
  }

  // translate a string
  public translateText(text: string): string {
    return text;
  }

  // resolve image uris (make relative, copy to doc local 'images' dir, etc)
  resolveImageUris(uris: string[]): Promise<string[]> {
    return this.host.resolveImageUris(uris);
  }

  public async resolveBase64Images(base64Images: string[]) : Promise<string[]> {
    return this.host.resolveBase64Images!(base64Images);
  }

  public async selectImage() : Promise<string | null> {
    return this.host.selectImage!();
  }

  // watch a resource for changes (returns an unsubscribe function)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public watchResource(path: string, notify: VoidFunction): VoidFunction {
    return this.subscribe(path, notify);
  }

  // are there dropped uris available?
  public droppedUris(): string[] | null {
    return null;
  }

  // uris from the clipboard
  public async clipboardUris(): Promise<string[] | null> {
    return null;
  }

  // image from the clipboard (returned as file path)
  public async clipboardImage(): Promise<string | null> {
    return null;
  }
  
  private resolvePath(path: string): string {
    if (path.startsWith("/") && this.context.projectDir) {
      return `${this.context.projectDir}/${path.slice(1)}`;
    } else {
      return `${this.context.resourceDir}/${path}`;
    }
  }

  // manage image changed subscriptions
  public notifyImageChanged(file: string) {
    file = pathWithForwardSlashes(file);
    Object.values(this.subscriptions).forEach(sub => {
       if (sub.file === file) {
        sub.handler();
       }
    });
  }
  private subscriptions: Record<string, { file: string, handler: VoidFunction }> = {};
  private subscribe(file: string, handler: VoidFunction) : VoidFunction {
    const id = uuid.v4();
    this.subscriptions[id] = { file: pathWithForwardSlashes(this.resolvePath(file)), handler };
    return () => {
      delete this.subscriptions[id];
    }
  }
}


export default EditorContainer;
