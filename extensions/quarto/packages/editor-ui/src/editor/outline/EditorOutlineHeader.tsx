/*
 * EditorOutlineHeader.tsx
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

import React from 'react';

import { Button } from '@fluentui/react-components';

import {
  TextAlignJustify20Filled,
  TextAlignJustify20Regular, 
  ChevronLeft16Filled,
  ChevronLeft16Regular,
  bundleIcon
} from "@fluentui/react-icons"

const ChevronLeftIcon = bundleIcon(ChevronLeft16Filled, ChevronLeft16Regular);
const TextAlignJustifyIcon = bundleIcon(TextAlignJustify20Filled, TextAlignJustify20Regular);

import { t } from 'editor-ui';

import styles from './EditorOutlineSidebar.module.scss';

export interface EditorOutlineHeaderProps {
  onCloseClicked: () => void;
}

export const EditorOutlineHeader: React.FC<EditorOutlineHeaderProps> = props => {

  return (
    <div className={[styles.outlineHeader, 'pm-surface-widget-text-color'].join(' ')}>
      <Button 
        className={styles.outlineHeaderToggle} 
        icon={<TextAlignJustifyIcon />} 
        appearance='transparent'  
        onClick={props.onCloseClicked} 
      />
      <div className={styles.outlineHeaderText}>{t('outline_header_text')}</div>
      <Button
        icon={<ChevronLeftIcon />}
        title={t('close_button_title') as string}
        className={styles.outlineCloseIcon}
        appearance='transparent'  
        onClick={props.onCloseClicked}
      />
    </div>
  );
};
