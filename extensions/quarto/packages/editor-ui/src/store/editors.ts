/*
 * editor.ts
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


import { useSelector } from 'react-redux';

import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit'

import { EditorOutline } from 'editor';


export interface EditorError {
  icon: "document" | "issue" | "error" ;
  title: string;
  description: string[];
}

export function isEditorError(error: unknown): error is EditorError {
  const editorError = error as EditorError;
  return editorError.description !== undefined &&
         editorError.icon !== undefined &&
         editorError.title !== undefined;
}

export interface EditorState {
  readonly id: string;
  readonly loading: boolean;
  readonly loadError?: EditorError;
  readonly title: string;
  readonly outline: EditorOutline;
  readonly selection: unknown;
}

export type EditorsState = Array<EditorState>;

const editorsSelector = (state: { editors: EditorsState }) => state.editors;
const getIdParam = (_: unknown, id: string) => id; 

function getEditor(editors: EditorsState, id: string) : EditorState {
  const editor = editors.find(editor => editor.id === id);
  if (editor) {
    return editor;
  } else {
    throw new Error(`Unknown editor ID ${id}`);
  }
}
function updateEditor(editors: EditorsState, id: string, update: (editor: EditorState) => EditorState) {
  const index = editors.findIndex(editor => editor.id === id);
  if (index !== -1) {
    editors[index] = update(editors[index]);
  }
}

const initialEditorState: EditorState = {
  id: 'editor',
  loading: true,
  title: '',
  outline: [],
  selection: {},
};



export const editorsSlice = createSlice({
  name: 'editors',
  initialState: new Array<EditorState>(),
  reducers: {
    addEditor: (state, action: PayloadAction<string>) => {
      state.push({ ...initialEditorState, id: action.payload });
    },
    removeEditor: (state, action: PayloadAction<string>) => {
      const index = state.findIndex(editor => editor.id === action.payload);
      if (index !== -1) {
        state.splice(index, 1);
      }
    },
    setEditorLoading: {
      reducer: (state, action: PayloadAction<{ id: string, loading: boolean }>) => {
        updateEditor(state, action.payload.id, editor => ({...editor, loading: action.payload.loading }));
      },
      prepare: (id: string, loading: boolean) => ({ payload: { id, loading }})
    },
    setEditorLoadError: {
      reducer: (state, action: PayloadAction<{ id: string, loadError: EditorError}>) => {
        updateEditor(state, action.payload.id, editor => ({...editor, loadError: action.payload.loadError }));
      },
      prepare: (id: string, loadError: EditorError) => ({ payload: { id, loadError }})
    },
    setEditorTitle: {
      reducer: (state, action: PayloadAction<{ id: string, title: string }>) => {
        updateEditor(state, action.payload.id, editor => ({...editor, title: action.payload.title }));
      },
      prepare: (id: string, title: string) => ({ payload: { id, title }})
    },
    setEditorOutline: {
      reducer: (state, action: PayloadAction<{ id: string, outline: EditorOutline }>) => {
        updateEditor(state, action.payload.id, editor => ({...editor, outline: action.payload.outline }));
      },
      prepare: (id: string, outline: EditorOutline) => ({ payload: { id, outline }})
    },
    setEditorSelection: {
      reducer: (state, action: PayloadAction<{ id: string, selection: unknown }>) => {
        updateEditor(state, action.payload.id, editor => ({...editor, selection: action.payload.selection }));
      },
      prepare: (id: string, selection: unknown) => ({ payload: { id, selection }})
    },
  },
})

export const editorLoading = createSelector(editorsSelector, getIdParam, (editors, id) => getEditor(editors, id).loading);
export const editorLoadError = createSelector(editorsSelector, getIdParam, (editors, id) => getEditor(editors, id).loadError);
export const editorLoaded = createSelector(editorsSelector, getIdParam, (editors, id) => {
  const editor = getEditor(editors, id);
  return !editor.loading && !editor.loadError;
});
export const editorTitle = createSelector(editorsSelector, getIdParam, (editors, id) => getEditor(editors, id).title);
export const editorOutline = createSelector(editorsSelector, getIdParam, (editors, id) => getEditor(editors, id).outline);
export const editorSelection = createSelector(editorsSelector, getIdParam, (editors, id) => getEditor(editors, id).selection);

export function useEditorSelector<P,R>(selector: (state: { editors: EditorsState }, param: P) => R, param: P) {
  return useSelector((state: { editors: EditorsState }) => selector(state, param));
}

export const { 
  addEditor,
  setEditorLoading, 
  setEditorLoadError,
  setEditorTitle, 
  setEditorOutline, 
  setEditorSelection 
} = editorsSlice.actions;


export default editorsSlice.reducer;

