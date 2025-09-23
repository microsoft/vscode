/*
 * tag-input.tsx
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

import React from 'react';

import { WidgetProps } from './react';

import { EditorUI } from '../ui-types';

import './tag-input.css';
import { TextInput } from './text';
import { kAlertTypeError } from 'editor-types';

// Item representing a tag entry
// The key remains stable even if the tag is edited
// The displayPrefix will be displayed to the user, but removed when editing
export interface TagItem {
  key: string;
  displayText: string;
  displayPrefix: string;
  isEditable?: boolean;
}

interface TagInputProps extends WidgetProps {
  tags: TagItem[];
  onTagDeleted: (tag: TagItem) => void;
  onTagChanged: (key: string, text: string) => void;
  onTagValidate?: (key: string, text: string) => string | null;
  ui: EditorUI;
  placeholder?: string;
  maxDisplayCharacters?: number;
}

export const TagInput = React.forwardRef<HTMLDivElement, TagInputProps>((props, ref) => {
  return (
    <div style={props.style} className="pm-tag-input-container" ref={ref}>
      {props.tags.length === 0 ? (
        <div className="pm-tag-input-placeholder">
          <div className="pm-placeholder-text-color">{props.placeholder}</div>
        </div>
      ) : (
        undefined
      )}
      {props.tags.map(tag => (
        <Tag
          key={tag.key}
          tag={tag}
          onTagDeleted={props.onTagDeleted}
          onTagChanged={props.onTagChanged}
          onTagValidate={props.onTagValidate}
          ui={props.ui}
          maxDisplayCharacters={props.maxDisplayCharacters}
        />
      ))}
    </div>
  );
});

interface TagProps extends WidgetProps {
  tag: TagItem;
  onTagDeleted: (tag: TagItem) => void;
  onTagChanged: (key: string, text: string) => void;
  onTagValidate?: (key: string, text: string) => string | null;
  ui: EditorUI;
  maxDisplayCharacters?: number;
}

const Tag: React.FC<TagProps> = props => {
  const [editing, setEditing] = React.useState<boolean>(false);
  const [editingText, setEditingText] = React.useState<string>(props.tag.displayText);
  const [displayText, setDisplayText] = React.useState<string>(props.tag.displayText);

  const editImage = React.useRef<HTMLImageElement>(null);
  const showingValidationError = React.useRef<boolean>(false);
  const restoreFocusAfterCancel = React.useRef<boolean>(false);

  // Anytime we begin editing, focus the text input
  const editTextInput = React.useRef<HTMLInputElement>(null);
  React.useLayoutEffect(() => {
    if (editing) {
      editTextInput.current?.focus();
    } else if (restoreFocusAfterCancel.current) {
      // Focus the edit image
      editImage.current?.focus();
      restoreFocusAfterCancel.current = false;
    }
  }, [editing]);

  // Click the delete icon
  const onDeleteClick = () => {
    props.onTagDeleted(props.tag);
  };

  // Enter or space while delete icon focused
  const onDeleteKeyPress = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        e.stopPropagation();
        props.onTagDeleted(props.tag);
        break;
    }
  };

  // Click on the edit icon
  const onEditClick = () => {
    if (props.tag.isEditable) {
      setEditing(true);
    }
  };

  // Enter or space while edit icon is focused
  const onEditKeyPress = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        e.stopPropagation();
        setEditing(true);
        break;
    }
  };

  // Commit edits to the tag
  const commitTagEdit = () => {
    // Validate the input
    if (props.onTagValidate) {
      const validationMessage = props.onTagValidate(props.tag.key, editingText);
      if (validationMessage !== null) {
        showingValidationError.current = true;
        props.ui.dialogs
          .alert(
            props.ui.context.translateText('Validation Error'),
            props.ui.context.translateText(validationMessage),
            kAlertTypeError,
          )
          .then(() => {
            editTextInput.current?.focus();
            showingValidationError.current = false;
          });
        return;
      }
    }

    // Update the text
    setDisplayText(editingText);

    // Halt editing
    setEditing(false);

    // Notify of change
    props.onTagChanged(props.tag.key, editingText);

    // Focus the edit image
    editImage.current?.focus();
  };

  const cancelTagEdit = () => {
    // Halt editing
    setEditing(false);

    // Revert editing text
    setEditingText(displayText);

    // The editing control will lose focus, so we need to focus something else
    restoreFocusAfterCancel.current = true;
  };

  // When editing the tag, allow enter to accept the changes
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        // If we're validiating, don't commit.
        if (showingValidationError.current) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        commitTagEdit();
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        cancelTagEdit();
        break;
    }
  };

  // When editing, clicking away from the tag will accept changes
  const handleEditBlur = () => {
    // If we're validiating, don't commit.
    if (showingValidationError.current) {
      return;
    }
    commitTagEdit();
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const edittedText = e.target.value;
    setEditingText(edittedText);
  };

  return (
    <div key={props.tag.displayText} className="pm-tag-input-tag pm-block-border-color">
      <img
        src={props.ui.images.widgets?.tag_delete}
        onClick={onDeleteClick}
        onKeyPress={onDeleteKeyPress}
        className="pm-tag-input-delete-image"
        tabIndex={0}
        draggable="false"
      />
      <div className={`pm-tag-input-text ${props.tag.isEditable ? 'pm-tag-input-text-edittable' : undefined}`}>
        {!editing ? (
          <div onClick={onEditClick} className="pm-tag-input-text-raw pm-text-color">
            {props.tag.displayPrefix}
            {props.maxDisplayCharacters ? 
              displayText.length > props.maxDisplayCharacters ? displayText.substr(0, props.maxDisplayCharacters - 1) + '…' : displayText: 
              displayText}
          </div>
        ) : (
          <TextInput
            width={props.maxDisplayCharacters ? 
                 `${Math.min(props.maxDisplayCharacters, editingText.length)}ch` :
                 `${editingText.length}ch`
                }
            ref={editTextInput}
            className="pm-tag-input-text-edit"
            value={editingText}
            onChange={handleEditChange}
            onKeyDown={handleEditKeyDown}
            onBlur={handleEditBlur}
          />
        )}
      </div>
      {props.tag.isEditable ? (
        <img
          src={props.ui.images.widgets?.tag_edit}
          className="pm-tag-input-edit-image"
          onClick={onEditClick}
          onKeyPress={onEditKeyPress}
          tabIndex={0}
          ref={editImage}
          draggable="false"
        />
      ) : (
        undefined
      )}
    </div>
  );
};
