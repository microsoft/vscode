/*
 * EditorOutlineSidebar.tsx
 *
 * Copyright (C) 2022 by Posit Software, PBC
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

import React, { useContext, useEffect } from 'react';


import { defaultPrefs } from 'editor-types';

import { editorLoaded, editorOutline, EditorUICommandId, useEditorSelector } from 'editor-ui';
import { useGetPrefsQuery, useSetPrefsMutation } from 'editor-ui';

import { CommandManagerContext, t } from 'editor-ui';

import { EditorOutlineButton } from './EditorOutlineButton';
import { EditorOutlineHeader } from './EditorOutlineHeader';
import { EditorOutlineTree } from './EditorOutlineTree';
import { EditorOutlineEmpty } from './EditorOutlineEmpty';

import styles from './EditorOutlineSidebar.module.scss';

export interface EditorOutlineSidebarProps {
  editorId: string;
}

export const EditorOutlineSidebar: React.FC<EditorOutlineSidebarProps> = props => {

  const [, cmDispatch] = useContext(CommandManagerContext);

  const outline = useEditorSelector(editorOutline, props.editorId);
  const loaded = useEditorSelector(editorLoaded, props.editorId);

  const { data: prefs = defaultPrefs() } = useGetPrefsQuery();
  const [setPrefs] = useSetPrefsMutation();
 
  const setShowOutline = (showOutline: boolean) => setPrefs({...prefs, showOutline});

  const onOpenClicked = () => setShowOutline(true);
  const onCloseClicked= () => setShowOutline(false);

  // update command when showOutline changes
  useEffect(() => {
    cmDispatch({ type: "ADD_COMMANDS", payload: [
      {
        id: EditorUICommandId.ShowOutline,
        menuText: t('commands:show_outline_menu_text'),
        group: t('commands:group_view'),
        keymap: ['Ctrl-Alt-O'],
        isEnabled: () => true,
        isActive: () => prefs.showOutline,
        execute: () => {
          setShowOutline(!prefs.showOutline);
        },
      },
    ]})
  }, [prefs.showOutline])


  const outlineClassName = [styles.outline, 'pm-pane-border-color'];
    if (prefs.showOutline && loaded) {
      outlineClassName.push(styles.outlineVisible);
    }

  return (
    <>
      <EditorOutlineButton visible={!prefs.showOutline && loaded} onClick={onOpenClicked} />
      <div className={outlineClassName.join(' ')}>
        <EditorOutlineHeader onCloseClicked={onCloseClicked} />
        {outline.length ? <EditorOutlineTree outline={outline} /> : <EditorOutlineEmpty /> }
      </div>
    </>
  );
}
