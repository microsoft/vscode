############################################################################
# Original work Copyright 2017 Palantir Technologies, Inc.                 #
# Original work licensed under the MIT License.                            #
# See ThirdPartyNotices.txt in the project root for license information.   #
# All modifications Copyright (c) Open Law Library. All rights reserved.   #
#                                                                          #
# Licensed under the Apache License, Version 2.0 (the "License")           #
# you may not use this file except in compliance with the License.         #
# You may obtain a copy of the License at                                  #
#                                                                          #
#     http: // www.apache.org/licenses/LICENSE-2.0                         #
#                                                                          #
# Unless required by applicable law or agreed to in writing, software      #
# distributed under the License is distributed on an "AS IS" BASIS,        #
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. #
# See the License for the specific language governing permissions and      #
# limitations under the License.                                           #
############################################################################
import copy
import logging
import os
import warnings
from typing import Dict, List, Optional, Union

from erdos._vendor.lsprotocol import types
from erdos._vendor.lsprotocol.types import (
    PositionEncodingKind,
    TextDocumentSyncKind,
    WorkspaceFolder,
)
from erdos._vendor.pygls.uris import to_fs_path, uri_scheme
from erdos._vendor.pygls.workspace.text_document import TextDocument
from erdos._vendor.pygls.workspace.position_codec import PositionCodec

logger = logging.getLogger(__name__)


class Workspace(object):
    def __init__(
        self,
        root_uri: Optional[str],
        sync_kind: TextDocumentSyncKind = TextDocumentSyncKind.Incremental,
        workspace_folders: Optional[List[WorkspaceFolder]] = None,
        position_encoding: Optional[
            Union[PositionEncodingKind, str]
        ] = PositionEncodingKind.Utf16,
    ):
        self._root_uri = root_uri
        if self._root_uri is not None:
            self._root_uri_scheme = uri_scheme(self._root_uri)
            root_path = to_fs_path(self._root_uri)
            if root_path is None:
                raise Exception("Couldn't get `root_path` from `root_uri`")
            self._root_path = root_path
        else:
            self._root_path = None
        self._sync_kind = sync_kind
        self._text_documents: Dict[str, TextDocument] = {}
        self._notebook_documents: Dict[str, types.NotebookDocument] = {}

        # Used to lookup notebooks which contain a given cell.
        self._cell_in_notebook: Dict[str, str] = {}
        self._folders: Dict[str, WorkspaceFolder] = {}
        self._docs: Dict[str, TextDocument] = {}
        self._position_encoding = position_encoding
        self._position_codec = PositionCodec(encoding=position_encoding)

        if workspace_folders is not None:
            for folder in workspace_folders:
                self.add_folder(folder)

    @property
    def position_encoding(self) -> Optional[Union[PositionEncodingKind, str]]:
        return self._position_encoding

    @property
    def position_codec(self) -> PositionCodec:
        return self._position_codec

    def _create_text_document(
        self,
        doc_uri: str,
        source: Optional[str] = None,
        version: Optional[int] = None,
        language_id: Optional[str] = None,
    ) -> TextDocument:
        return TextDocument(
            doc_uri,
            source=source,
            version=version,
            language_id=language_id,
            sync_kind=self._sync_kind,
            position_codec=self._position_codec,
        )

    def add_folder(self, folder: WorkspaceFolder):
        self._folders[folder.uri] = folder

    @property
    def documents(self):
        warnings.warn(
            "'workspace.documents' has been deprecated, use "
            "'workspace.text_documents' instead",
            DeprecationWarning,
            stacklevel=2,
        )
        return self.text_documents

    @property
    def notebook_documents(self):
        return self._notebook_documents

    @property
    def text_documents(self):
        return self._text_documents

    @property
    def folders(self):
        return self._folders

    def get_notebook_document(
        self, *, notebook_uri: Optional[str] = None, cell_uri: Optional[str] = None
    ) -> Optional[types.NotebookDocument]:
        """Return the notebook corresponding with the given uri.

        If both ``notebook_uri`` and ``cell_uri`` are given, ``notebook_uri`` takes
        precedence.

        Parameters
        ----------
        notebook_uri
           If given, return the notebook document with the given uri.

        cell_uri
           If given, return the notebook document which contains a cell with the
           given uri

        Returns
        -------
        Optional[NotebookDocument]
           The requested notebook document if found, ``None`` otherwise.
        """
        if notebook_uri is not None:
            return self._notebook_documents.get(notebook_uri)

        if cell_uri is not None:
            notebook_uri = self._cell_in_notebook.get(cell_uri)
            if notebook_uri is None:
                return None

            return self._notebook_documents.get(notebook_uri)

        return None

    def get_text_document(self, doc_uri: str) -> TextDocument:
        """
        Return a managed document if-present,
        else create one pointing at disk.

        See https://github.com/Microsoft/language-server-protocol/issues/177
        """
        return self._text_documents.get(doc_uri) or self._create_text_document(doc_uri)

    def is_local(self):
        return (
            self._root_uri_scheme == "" or self._root_uri_scheme == "file"
        ) and os.path.exists(self._root_path)

    def put_notebook_document(self, params: types.DidOpenNotebookDocumentParams):
        notebook = params.notebook_document

        # Create a fresh instance to ensure our copy cannot be accidentally modified.
        self._notebook_documents[notebook.uri] = copy.deepcopy(notebook)

        for cell_document in params.cell_text_documents:
            self.put_text_document(cell_document, notebook_uri=notebook.uri)

    def put_text_document(
        self,
        text_document: types.TextDocumentItem,
        notebook_uri: Optional[str] = None,
    ):
        """Add a text document to the workspace.

        Parameters
        ----------
        text_document
           The text document to add

        notebook_uri
           If set, indicates that this text document represents a cell in a notebook
           document
        """
        doc_uri = text_document.uri

        self._text_documents[doc_uri] = self._create_text_document(
            doc_uri,
            source=text_document.text,
            version=text_document.version,
            language_id=text_document.language_id,
        )

        if notebook_uri:
            self._cell_in_notebook[doc_uri] = notebook_uri

    def remove_notebook_document(self, params: types.DidCloseNotebookDocumentParams):
        notebook_uri = params.notebook_document.uri
        self._notebook_documents.pop(notebook_uri, None)

        for cell_document in params.cell_text_documents:
            self.remove_text_document(cell_document.uri)

    def remove_text_document(self, doc_uri: str):
        self._text_documents.pop(doc_uri, None)
        self._cell_in_notebook.pop(doc_uri, None)

    def remove_folder(self, folder_uri: str):
        self._folders.pop(folder_uri, None)
        try:
            del self._folders[folder_uri]
        except KeyError:
            pass

    @property
    def root_path(self):
        return self._root_path

    @property
    def root_uri(self):
        return self._root_uri

    def update_notebook_document(self, params: types.DidChangeNotebookDocumentParams):
        uri = params.notebook_document.uri
        notebook = self._notebook_documents[uri]
        notebook.version = params.notebook_document.version

        if params.change.metadata:
            notebook.metadata = params.change.metadata

        cell_changes = params.change.cells
        if cell_changes is None:
            return

        # Process changes to any cell metadata.
        nb_cells = {cell.document: cell for cell in notebook.cells}
        for new_data in cell_changes.data or []:
            nb_cell = nb_cells.get(new_data.document)
            if nb_cell is None:
                logger.warning(
                    "Ignoring metadata for '%s': not in notebook.", new_data.document
                )
                continue

            nb_cell.kind = new_data.kind
            nb_cell.metadata = new_data.metadata
            nb_cell.execution_summary = new_data.execution_summary

        # Process changes to the notebook's structure
        structure = cell_changes.structure
        if structure:
            cells = notebook.cells
            new_cells = structure.array.cells or []

            # Re-order the cells
            before = cells[: structure.array.start]
            after = cells[(structure.array.start + structure.array.delete_count) :]
            notebook.cells = [*before, *new_cells, *after]

            for new_cell in structure.did_open or []:
                self.put_text_document(new_cell, notebook_uri=uri)

            for removed_cell in structure.did_close or []:
                self.remove_text_document(removed_cell.uri)

        # Process changes to the text content of existing cells.
        for text in cell_changes.text_content or []:
            for change in text.changes:
                self.update_text_document(text.document, change)

    def update_text_document(
        self,
        text_doc: types.VersionedTextDocumentIdentifier,
        change: types.TextDocumentContentChangeEvent,
    ):
        doc_uri = text_doc.uri
        self._text_documents[doc_uri].apply_change(change)
        self._text_documents[doc_uri].version = text_doc.version

    def get_document(self, *args, **kwargs):
        warnings.warn(
            "'workspace.get_document' has been deprecated, use "
            "'workspace.get_text_document' instead",
            DeprecationWarning,
            stacklevel=2,
        )
        return self.get_text_document(*args, **kwargs)

    def remove_document(self, *args, **kwargs):
        warnings.warn(
            "'workspace.remove_document' has been deprecated, use "
            "'workspace.remove_text_document' instead",
            DeprecationWarning,
            stacklevel=2,
        )
        return self.remove_text_document(*args, **kwargs)

    def put_document(self, *args, **kwargs):
        warnings.warn(
            "'workspace.put_document' has been deprecated, use "
            "'workspace.put_text_document' instead",
            DeprecationWarning,
            stacklevel=2,
        )
        return self.put_text_document(*args, **kwargs)

    def update_document(self, *args, **kwargs):
        warnings.warn(
            "'workspace.update_document' has been deprecated, use "
            "'workspace.update_text_document' instead",
            DeprecationWarning,
            stacklevel=2,
        )
        return self.update_text_document(*args, **kwargs)
