/*
 * EditorFind.tsx
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

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { CSSTransition } from 'react-transition-group';
import { useDebounce } from 'use-debounce';

import { Button, Checkbox, Input } from '@fluentui/react-components';
import {
  ChevronLeft16Filled,
  ChevronLeft16Regular,
  ChevronRight16Filled,
  ChevronRight16Regular,
  ChevronDoubleRight16Filled,
  ChevronDoubleRight16Regular,
  Dismiss16Filled,
  Dismiss16Regular,
  bundleIcon
} from "@fluentui/react-icons";

const ChevronLeftIcon = bundleIcon(ChevronLeft16Filled, ChevronLeft16Regular);
const ChevronRightIcon = bundleIcon(ChevronRight16Filled, ChevronRight16Regular);
const ChevronDoubleRightIcon = bundleIcon(ChevronDoubleRight16Filled, ChevronDoubleRight16Regular);
const DismissIcon = bundleIcon(Dismiss16Filled, Dismiss16Regular);

import { focusInput } from 'core-browser';

import { kAlertTypeInfo } from 'editor';

import { CommandManagerContext, EditorUICommandId } from '../commands';
import { alert } from '../dialogs';
import { t } from '../i18n';

import { EditorOperationsContext } from './EditorOperationsContext';

import styles from './EditorFind.module.scss';

export const EditorFind: React.FC = () => {

  // translations and commands
  const [, cmDispatch] = useContext(CommandManagerContext);

  // contexts
  const editor = useContext(EditorOperationsContext);

  // refs
  const nodeRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // state
  const [active, setActive] = useState(false);
  const [findText, setFindText] = useState("");
  const [debouncedFindText] = useDebounce(findText, 200);
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchRegex, setMatchRegex] = useState(false);

   // close panel
   const close = () => {
    setActive(false);
  }

  // focus find input
  const focusFindInput = () => {
    focusInput(findInputRef.current);
  }

  // no more matches alert
  const noMoreMatchesAlert = (focusAfter?: HTMLInputElement | null) => {
    setTimeout(async () => {
      await alert(t('find_alert_title'), t('find_no_more_matches') as string, kAlertTypeInfo);
      focusInput(focusAfter || findInputRef.current);
    }, 150);
  }

  // perform most up to date find
  const performFind = useCallback(() => {
    const find = editor.getFindReplace();
    find?.find(findText, {
      caseSensitive: matchCase,
      regex: matchRegex,
      wrap: true
    });
    find?.selectCurrent();
    return find;
  }, [findText, matchCase, matchRegex]);

  // find next
  const findNext = useCallback(() => {
    if (!performFind()?.selectNext()) {
      noMoreMatchesAlert();
    }
  }, [performFind]);

  // find previous 
  const findPrevious = useCallback(() => {
    if (!performFind()?.selectPrevious()) {
      noMoreMatchesAlert();
    }
  }, [performFind]);

  // replace and find
  const replaceAndFind = useCallback(() => {
    if (!performFind()?.replace(replaceText)) {
      noMoreMatchesAlert(replaceInputRef.current);
    }
  }, [performFind, replaceText]);

  // replace all
  const replaceAll = useCallback(() => {
    const replaced = performFind()?.replaceAll(replaceText);
    alert( t('find_alert_title'), `${(replaced || 0)} ${t('find_instances_replaced')}.`, kAlertTypeInfo);
  }, [performFind, replaceText]);
  
  // find and replace commands
  useEffect(() => {
    cmDispatch({ type: "ADD_COMMANDS", payload: [
      {
        id: EditorUICommandId.Find,
        menuText: t('commands:find_menu_text'),
        group: t('commands:group_find'),
        keymap: ['Mod-f'],
        isEnabled: () => true,
        isActive: () => false,
        execute: () => {
          if (!active) {
            setActive(true);
          }
          focusFindInput();
        }
      },
      {
        id: EditorUICommandId.FindNext,
        menuText: t('commands:find_next_menu_text'),
        group: t('commands:group_find'),
        keymap: ['Ctrl-g'],
        isEnabled: () => active,
        isActive: () => false,
        execute: findNext
      },
      {
        id: EditorUICommandId.FindPrevious,
        menuText: t('commands:find_previous_menu_text'),
        group: t('commands:group_find'),
        keymap: ['Mod-Shift-g'],
        isEnabled: () => active,
        isActive: () => false,
        execute: findPrevious
      }
    ]})
  }, [active, findNext, findPrevious]);

  useEffect(() => {
    cmDispatch({ type: "ADD_COMMANDS", payload: [
      {
        id: EditorUICommandId.ReplaceAndFind,
        menuText: t('commands:replace_and_find_menu_text'),
        group: t('commands:group_find'),
        keymap: ['Mod-Shift-j'],
        isEnabled: () => active && replaceText.length > 0,
        isActive: () => false,
        execute: replaceAndFind
      }
    ]})
  }, [active, replaceText, replaceAndFind]);


  // perform find when find text changes (debounced)
  useEffect(() => {
    performFind();
  }, [debouncedFindText, matchCase, matchRegex]);

  // clear search when we go inactive
  useEffect(() => {
    editor.getFindReplace()?.clear();
    if (!active) {
      setFindText('');
      setReplaceText('');
      
    }
  }, [active])

  const handleFindKeyDown = useCallback((ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter') {
      findNext();
    } else if (ev.key == 'Escape') {
      close();
    } 
  }, [findNext]);
  const handleReplaceKeyDown = useCallback((ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter') {
      replaceAndFind();
    } else if (ev.key == 'Escape') {
      close();
    } 
  }, [replaceAndFind]);
  
  // show nav buttons when we have find text
  const navButtons = 
    <span style={ { visibility: findText.length ? 'visible' : 'hidden' }}>
      <Button icon={<ChevronLeftIcon />} title={t('find_previous') as string} onClick={findPrevious} appearance="transparent" size="small" />
      <Button icon={<ChevronRightIcon />} title={t('find_next') as string} onClick={findNext} appearance="transparent" size="small"  />
    </span>;

  // show replace buttons when we have replace text
  const replaceButtons = 
    <span style={ { visibility: replaceText.length ? 'visible' : 'hidden' }}>
      <Button icon={<ChevronRightIcon />} title={t('replace_and_find') as string} onClick={replaceAndFind} appearance="transparent" size="small" />
      <Button icon={<ChevronDoubleRightIcon />} title={t('replace_all') as string} onClick={replaceAll} appearance="transparent" size="small"  />
    </span>;

  // component
  return (
    <CSSTransition nodeRef={nodeRef} in={active} timeout={50} classNames={{ ...styles }}
      onEntered={() =>focusInput(findInputRef.current)}
    >          
      <div ref={nodeRef} className={[
        styles.findContainer, 
        'pm-popup pm-background-color pm-text-color pm-pane-border-color'].join(' ')}
      >
        <div className={styles.find}>
          <div className={styles.findRow}>
            <Input
              input={{ ref: findInputRef }}
              size="small"
              value={findText}
              onChange={ev => setFindText(ev.target.value)}
              onKeyDown={handleFindKeyDown}
              onFocus={performFind}
              placeholder={t('find_placeholder') as string}    
              contentAfter={navButtons}
            />
            <Button 
              icon={<DismissIcon />} 
              title={t('find_close_panel') as string} 
              appearance="transparent" 
              size="small" 
              onClick={close} 
            />
          </div>
          <div className={styles.findRow}>
            <Input
              input={{ ref: replaceInputRef }}
              size="small"
              value={replaceText}
              onChange={ev => setReplaceText(ev.target.value)}
              onKeyDown={handleReplaceKeyDown}
              placeholder={t('replace_placeholder') as string}  
              contentAfter={replaceButtons}
            /> 
          </div>
          <Checkbox checked={matchCase} onChange={ev => setMatchCase(ev.currentTarget.checked)} label={t('find_match_case') as string} /> 
          <Checkbox checked={matchRegex} onChange={ev => setMatchRegex(ev.currentTarget.checked)} label={t('find_match_regex') as string} /> 
        </div>
      </div>
    </CSSTransition>
  );
}
