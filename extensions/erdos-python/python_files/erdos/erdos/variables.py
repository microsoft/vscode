#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
#

from __future__ import annotations

import contextlib
import copy
import json
import logging
import time
import types
from typing import TYPE_CHECKING, Any

from .access_keys import decode_access_key, encode_access_key
from .inspectors import get_inspector
from .erdos_comm import CommMessage, JsonRpcErrorCode, ErdosComm
from .utils import (
    JsonData,
    JsonRecord,
    cancel_tasks,
    create_task,
    get_qualname,
)
from .variables_comm import (
    ClearRequest,
    ClipboardFormatFormat,
    ClipboardFormatRequest,
    DeleteRequest,
    FormattedVariable,
    InspectedVariable,
    InspectRequest,
    ListRequest,
    QueryTableSummaryRequest,
    RefreshParams,
    UpdateParams,
    Variable,
    VariableKind,
    VariableList,
    VariablesBackendMessageContent,
    VariablesFrontendEvent,
    ViewRequest,
)

if TYPE_CHECKING:
    import asyncio
    from collections.abc import Iterable, Mapping

    from comm.base_comm import BaseComm

    from .erdos_ipkernel import ErdosIPyKernel

logger = logging.getLogger(__name__)

MAX_CHILDREN: int = 100

MAX_ITEMS: int = 10000

MAX_SNAPSHOT_COMPARISON_BUDGET: int = 10_000_000


def timestamp() -> int:
    """Returns the current time in milliseconds; used for timestamping updates."""
    return int(time.time() * 1000)


def _resolve_value_from_path(context: Any, path: Iterable[str]) -> Any:
    """Use inspectors to possibly resolve nested value from context."""
    is_known = False
    value = None
    for access_key in path:
        inspector = get_inspector(context)
        try:
            key = decode_access_key(access_key)
        except Exception as err:
            raise ValueError(f"Invalid access key: {access_key!r}. Reason: {err!r}") from err
        is_known = inspector.has_child(key)
        if is_known:
            value = inspector.get_child(key)

        context = value

        if not is_known:
            break
    return is_known, value


class VariablesService:
    def __init__(self, kernel: ErdosIPyKernel) -> None:
        self.kernel = kernel

        self._comm: ErdosComm | None = None

        self._pending_tasks: set[asyncio.Task] = set()

        self._snapshot: dict[str, Any] | None = None

    def on_comm_open(self, comm: BaseComm, _msg: JsonRecord) -> None:
        """Setup erdos.variables comm to receive messages."""
        self._comm = ErdosComm(comm)
        self._comm.on_msg(self.handle_msg, VariablesBackendMessageContent)

        self.send_refresh_event()

    def handle_msg(
        self,
        msg: CommMessage[VariablesBackendMessageContent],
        raw_msg: JsonRecord,
    ) -> None:
        """Handle messages received from the client via the erdos.variables comm."""
        request = msg.content.data

        if isinstance(request, ListRequest):
            self._send_list()

        elif isinstance(request, ClearRequest):
            self._delete_all_vars(raw_msg)

        elif isinstance(request, DeleteRequest):
            self._delete_vars(request.params.names, raw_msg)

        elif isinstance(request, InspectRequest):
            self._inspect_var(request.params.path)

        elif isinstance(request, ClipboardFormatRequest):
            self._send_formatted_var(request.params.path, request.params.format)

        elif isinstance(request, ViewRequest):
            self._perform_view_action(request.params.path)

        elif isinstance(request, QueryTableSummaryRequest):
            self._perform_get_table_summary(request.params.path, request.params.query_types)

        else:
            logger.warning(f"Unhandled request: {request}")

    def _send_update(
        self,
        assigned: Mapping[str, Any],
        unevaluated: Mapping[str, Any],
        removed: set[str],
    ) -> None:
        """
        Sends the list of variables that have changed in the current user session through the variables comm to the client.

        TODO: Fix below docstring, see erdos#2319

        For example:
        {
            "data": {
                "method": "refresh",
                "params: {
                    "assigned": [{
                        "display_name": "newvar1",
                        "display_value": "Hello",
                        "kind": "string"
                    }],
                    "unevaluated": [],
                    "removed": ["oldvar1", "oldvar2"]
                }
            }
            ...
        }
        """
        exp_service = self.kernel.data_explorer_service
        con_service = self.kernel.connections_service
        for name in removed:
            if exp_service.variable_has_active_explorers(name):
                exp_service.handle_variable_deleted(name)

            if con_service.variable_has_active_connection(name):
                con_service.handle_variable_deleted(name)

        updated = {**assigned, **unevaluated}
        for name, value in updated.items():
            if exp_service.variable_has_active_explorers(name):
                exp_service.handle_variable_updated(name, value)

            if con_service.variable_has_active_connection(name):
                con_service.handle_variable_updated(name, value)

        if len(assigned) > MAX_ITEMS or len(removed) > MAX_ITEMS:
            return self.send_refresh_event()

        variables = self._get_filtered_vars(assigned)
        filtered_assigned = _summarize_children(variables, MAX_ITEMS)

        variables = self._get_filtered_vars(unevaluated)
        filtered_unevaluated = _summarize_children(variables, MAX_ITEMS)

        filtered_removed = [encode_access_key(name) for name in sorted(removed)]

        if filtered_assigned or filtered_unevaluated or filtered_removed:
            msg = UpdateParams(
                assigned=filtered_assigned,
                unevaluated=filtered_unevaluated,
                removed=filtered_removed,
                version=0,
            )
            self._send_event(VariablesFrontendEvent.Update.value, msg.dict())
            return None
        return None

    def send_refresh_event(self) -> None:
        """
        Sends a refresh message summarizing the variables of the current user session through the variables comm to the client.

        For example:
        {
            "data": {
                "method": "refresh",
                "variables": [{
                    "display_name": "mygreeting",
                    "display_value": "Hello",
                    "kind": "string"
                }]
            }
            ...
        }
        """
        variables = self._get_filtered_vars()
        filtered_variables = _summarize_children(variables, MAX_ITEMS)

        msg = RefreshParams(
            variables=filtered_variables,
            length=len(filtered_variables),
            version=0,
        )
        self._send_event(VariablesFrontendEvent.Refresh.value, msg.dict())

    async def shutdown(self) -> None:
        await cancel_tasks(self._pending_tasks)

        if self._comm is not None:
            with contextlib.suppress(Exception):
                self._comm.close()

    def poll_variables(self) -> None:
        if self._snapshot is None:
            return

        try:
            assigned, unevaluated, removed = self._compare_user_ns()
            self._send_update(assigned, unevaluated, removed)
        except Exception as err:
            logger.warning(err, exc_info=True)

    def snapshot_user_ns(self) -> None:
        """
        Snapshot.

        Creates a conservative "snapshot" of the user namespace to
        enable variable change detection without having to do a full
        refresh of the variables view any time the user executes
        code. Because many objects (any mutable Python collection, or
        some data structures like pandas, NumPy, or PyTorch objects)
        require a deep copy to support change detection, we only
        copy-and-compare such objects up to a certain limit to keep
        the execution overhead to a minimum when namespaces get large
        or contain many large mutable objects.
        """
        ns = self._get_user_ns()

        immutable_vars = {}

        mutable_vars_copied = {}

        mutable_vars_excluded = {}

        comparison_cost = 0

        start = time.time()

        for key, value in ns.items():
            if self._is_hidden(key, value):
                continue

            inspector = get_inspector(value)

            if inspector.is_mutable():
                cost = inspector.get_comparison_cost()
                if comparison_cost + cost > MAX_SNAPSHOT_COMPARISON_BUDGET:
                    mutable_vars_excluded[key] = value
                else:
                    comparison_cost += cost
                    try:
                        mutable_vars_copied[key] = inspector.deepcopy()
                    except copy.Error:
                        mutable_vars_excluded[key] = value
            else:
                immutable_vars[key] = value

        self._snapshot = {
            "immutable": immutable_vars,
            "mutable_copied": mutable_vars_copied,
            "mutable_excluded": mutable_vars_excluded,
        }
        elapsed = time.time() - start
        logger.debug(f"Snapshotting namespace took {elapsed:.4f} seconds")

        copied = repr(list(self._snapshot["mutable_copied"].keys()))
        logger.debug(f"Variables copied: {copied}")

    def _compare_user_ns(
        self,
    ) -> tuple[dict[str, Any], dict[str, Any], set[str]]:
        """
        Attempts to detect changes to variables in the user's environment.

        Returns
        -------
        A tuple (dict, dict, set) containing a dict of variables that were
        modified (added or updated), a set of variables that were not evaluated
        for updates, and a set of variables that were removed.
        """
        assigned = {}
        unevaluated = {}
        removed = set()

        if self._snapshot is None:
            return assigned, unevaluated, removed

        after = self._get_user_ns()

        snapshot = self._snapshot

        def _compare_immutable(v1, v2):
            return v1 is not v2

        def _compare_mutable(v1, v2):
            inspector1 = get_inspector(v1)
            inspector2 = get_inspector(v2)

            return type(inspector1) is not type(inspector2) or not inspector1.equals(v2)

        def _compare_always_different(_v1, _v2):
            return True

        all_snapshot_keys = set()

        def _check_ns_subset(ns_subset, evaluated, are_different_func):
            all_snapshot_keys.update(ns_subset.keys())

            for key, value in ns_subset.items():
                try:
                    if self._is_hidden(key, value):
                        continue

                    if key not in after:
                        removed.add(key)
                    elif are_different_func(value, after[key]):
                        if evaluated:
                            assigned[key] = after[key]
                        else:
                            unevaluated[key] = after[key]
                except Exception as err:
                    logger.warning("err: %s", err, exc_info=True)
                    raise

        start = time.time()

        _check_ns_subset(
            snapshot["immutable"], evaluated=True, are_different_func=_compare_immutable
        )
        _check_ns_subset(
            snapshot["mutable_copied"], evaluated=True, are_different_func=_compare_mutable
        )
        _check_ns_subset(
            snapshot["mutable_excluded"],
            evaluated=False,
            are_different_func=_compare_always_different,
        )

        for key, value in after.items():
            if self._is_hidden(key, value):
                continue

            if key not in all_snapshot_keys:
                assigned[key] = value

        elapsed = time.time() - start
        logger.debug(f"Detecting namespace changes took {elapsed:.4f} seconds")

        return assigned, unevaluated, removed

    def _get_user_ns(self) -> dict[str, Any]:
        return self.kernel.shell.user_ns or {}

    def _is_hidden(self, name: str, value: Any) -> bool:
        """Is this variable a hidden kernel variable?.

        Most of the time the answer is just whether it's in the kernel-hidden user namespace. But
        the _ symbol is commonly overridden by users/packages. So we don't want to hide it if its
        value is different from the value in the hidden namespace.
        """
        hidden = self.kernel.shell.user_ns_hidden or {}
        if name == "_":
            return name in hidden and value is hidden[name]
        return name in hidden

    def _get_filtered_vars(self, variables: Mapping[str, Any] | None = None) -> dict[str, Any]:
        """
        Get filtered vars.

        Returns
        -------
        A filtered dict of the variables, excluding hidden variables. If variables
        is None, the current user namespace in the environment is used.
        """
        if variables is None:
            variables = self._get_user_ns()

        return {key: value for key, value in variables.items() if not self._is_hidden(key, value)}

    def _find_var(self, path: Iterable[str]) -> tuple[bool, Any]:
        """
        Finds the variable at the requested path in the current user session.

        Parameters
        ----------
        path : Iterable[str]
            A list of path segments that will be traversed to find the requested variable.

        Returns
        -------
        A tuple (bool, Any) containing a boolean indicating whether the variable was found, as well
        as the value of the variable, if found.
        """
        if path is None:
            return False, None

        return _resolve_value_from_path(self._get_user_ns(), path)

    def _list_all_vars(self) -> list[Variable]:
        variables = self._get_filtered_vars()
        return _summarize_children(variables, MAX_ITEMS)

    def _send_list(self) -> None:
        filtered_variables = self._list_all_vars()
        msg = VariableList(
            variables=filtered_variables,
            length=len(filtered_variables),
            version=0,
        )
        self._send_result(msg.dict())

    def _delete_all_vars(self, parent: dict[str, Any]) -> None:
        """
        Deletes all of the variables in the current user session.

        Parameters
        ----------
        parent :  Dict[str, Any]
            A dict providing the parent context for the response,
            e.g. the client message requesting the clear operation
        """
        create_task(self._soft_reset(parent), self._pending_tasks)

        self._send_result({})

    async def _soft_reset(self, parent: dict[str, Any]) -> None:
        """Use %reset with the soft switch to delete all user defined variables from the environment."""
        code = "%reset -sf"
        await self.kernel.do_execute(code, silent=False, store_history=False)

        self.kernel.publish_execute_input(code, parent)

        self.send_refresh_event()

    def _delete_vars(self, names: Iterable[str], parent: dict[str, Any]) -> None:
        """
        Deletes the requested variables by name from the current user session.

        Parameters
        ----------
        names :  Iterable[str]
            A list of variable names to delete
        parent : Dict[str, Any]
            A dict providing the parent context for the response,
            e.g. the client message requesting the delete operation
        """
        if names is None:
            return

        self.snapshot_user_ns()

        for name in names:
            try:
                self.kernel.shell.del_var(name, by_name=False)
            except Exception:
                logger.warning(f"Unable to delete variable '{name}'")

        _, _, removed = self._compare_user_ns()

        if len(removed) > 0:
            code = "del " + ", ".join(removed)
            self.kernel.publish_execute_input(code, parent)

        exp_service = self.kernel.data_explorer_service
        for name in removed:
            if exp_service.variable_has_active_explorers(name):
                exp_service.handle_variable_deleted(name)

        self._send_result([encode_access_key(name) for name in sorted(removed)])

    def _inspect_var(self, path: list[str]) -> None:
        """
        Describes the variable at the requested path in the current user session.

        Parameters
        ----------
        path : List[str]
            A list of names describing the path to the variable.
        """
        is_known, value = self._find_var(path)
        if is_known:
            self._send_details(path, value)
        else:
            self._send_error(
                JsonRpcErrorCode.INVALID_PARAMS,
                f"Cannot find variable at '{path}' to inspect",
            )

    def _perform_view_action(self, path: list[str]) -> None:
        """Performs the view action depending of the variable type."""
        if path is None:
            return None

        is_known, value = self._find_var(path)
        if not is_known:
            return self._send_error(
                JsonRpcErrorCode.INVALID_PARAMS,
                f"Cannot find variable at '{path}' to view",
            )

        try:
            if self.kernel.connections_service.object_is_supported(value):
                self._open_connections_pane(path, value)
            elif self.kernel.data_explorer_service.is_supported(value):
                self._open_data_explorer(path, value)
            else:
                self._send_error(
                    JsonRpcErrorCode.INTERNAL_ERROR,
                    f"Error opening viewer for variable at '{path}'. Object not supported. Try restarting the session.",
                )
        except Exception as err:
            self._send_error(
                JsonRpcErrorCode.INTERNAL_ERROR,
                f"Error opening viewer for variable at '{path}'. Try restarting the session.",
            )
            logger.error(err, exc_info=True)

    def _open_data_explorer(self, path: list[str], value: Any) -> None:
        """Opens a DataExplorer comm for the variable at the requested path in the current user session."""
        access_key = path[-1]

        title = str(decode_access_key(access_key))
        comm_id = self.kernel.data_explorer_service.register_table(value, title, variable_path=path)
        self._send_result(comm_id)

    def _open_connections_pane(self, path: list[str], value: Any) -> None:
        """Opens a Connections comm for the variable at the requested path in the current user session."""
        self.kernel.connections_service.register_connection(value, variable_path=path)
        self._send_result({})

    def _send_event(self, name: str, payload: JsonRecord) -> None:
        """Send an event payload to the client."""
        if self._comm is not None:
            self._comm.send_event(name, payload)
        else:
            logger.warning(f"Cannot send {name} event: comm is not open")

    def _send_error(self, code: JsonRpcErrorCode, message: str) -> None:
        """Send an error message to the client."""
        if self._comm is not None:
            self._comm.send_error(code, message)
        else:
            logger.warning(f"Cannot send error {message} (code {code}): comm is not open)")

    def _send_result(self, data: JsonData = None) -> None:
        """Send an RPC result value to the client."""
        if self._comm is not None:
            self._comm.send_result(data)
        else:
            logger.warning(f"Cannot send RPC result: {data}: comm is not open")

    def _send_formatted_var(
        self,
        path: list[str],
        clipboard_format: ClipboardFormatFormat = ClipboardFormatFormat.TextPlain,
    ) -> None:
        """
        Sends a formatted variable.

        Formats the variable at the requested path in the current user session
        using the requested clipboard format and sends the result through the
        variables comm to the client.

        Parameters
        ----------
        path : List[str]
            A list of names describing the path to the variable.
        clipboard_format : ClipboardFormatFormat
            The format to use for the clipboard copy, described as a mime type.
            Defaults to "text/plain".
        """
        if path is None:
            return

        is_known, value = self._find_var(path)
        if is_known:
            content = _format_value(value, clipboard_format)
            msg = FormattedVariable(content=content)
            self._send_result(msg.dict())
        else:
            self._send_error(
                JsonRpcErrorCode.INVALID_PARAMS,
                f"Cannot find variable at '{path}' to format",
            )

    def _send_details(self, _path: list[str], value: Any = None):
        """
        Sends details.

        Sends a detailed list of children of the value (or just the value
        itself, if is a leaf node on the path) as a message through the
        variables comm to the client.

        For example:
        {
            "data": {
                "result": {
                    "children": [{
                        "display_name": "property1",
                        "display_value": "Hello",
                        "kind": "string",
                        "display_type": "str"
                    },{
                        "display_name": "property2",
                        "display_value": "123",
                        "kind": "number"
                        "display_type": "int"
                    }]
                }
            }
            ...
        }

        Parameters
        ----------
        path : List[str]
            A list of names describing the path to the variable.
        value : Any
            The variable's value to summarize.
        """
        children = []
        inspector = get_inspector(value)
        if inspector.has_children():
            children = _summarize_children(value)
        else:
            summary = _summarize_variable("", value)
            if summary is not None:
                children.append(summary)

        msg = InspectedVariable(children=children, length=len(children))
        self._send_result(msg.dict())

    def _perform_get_table_summary(self, path: list[str], query_types: list[str]) -> None:
        """RPC handler for getting table summary."""
        import traceback

        try:
            self._get_table_summary(path, query_types)
        except Exception as err:
            self._send_error(
                JsonRpcErrorCode.INTERNAL_ERROR,
                f"Error summarizing table at '{path}': {err}\n{traceback.format_exc()}",
            )

    def _get_table_summary(self, path: list[str], query_types: list[str]) -> None:
        """Compute statistical summary for a table without opening a data explorer."""
        from .data_explorer import (
            DataExplorerState,
            _get_column_profiles,
            _get_table_view,
            _value_type_is_supported,
        )
        from .data_explorer_comm import FormatOptions, GetSchemaParams

        is_known, value = self._find_var(path)
        if not is_known:
            raise ValueError(f"Cannot find table at '{path}' to summarize")

        if not _value_type_is_supported(value):
            raise ValueError(f"Variable at '{path}' is not supported for table summary")

        try:
            temp_state = DataExplorerState("temp_summary")
            temp_comm = ErdosComm.create(target_name="temp_summary", comm_id="temp_summary_comm")
            table_view = _get_table_view(value, temp_comm, temp_state, self.kernel.job_queue)
        except Exception as e:
            raise ValueError(f"Failed to create table view: {e}") from e

        num_rows = table_view.table.shape[0]
        num_columns = table_view.table.shape[1]
        schema = table_view.get_schema(GetSchemaParams(column_indices=list(range(num_columns))))

        format_options = FormatOptions(
            large_num_digits=4,
            small_num_digits=6,
            max_integral_digits=7,
            max_value_length=1000,
            thousands_sep=None,
        )

        profiles, skipped_columns = _get_column_profiles(
            table_view, schema, query_types, format_options
        )

        for i, column_name, error in skipped_columns:
            logger.warning(f"Skipping summary stats for column {i} ({column_name}): {error}")

        self._send_result(
            {
                "num_rows": num_rows,
                "num_columns": num_columns,
                "column_schemas": [json.dumps(x.dict()) for x in schema.columns],
                "column_profiles": [json.dumps(x) for x in profiles],
            }
        )


def _summarize_variable(key: Any, value: Any, display_name: str | None = None) -> Variable | None:
    """
    Summarizes the given variable into a Variable object.

    Parameters
    ----------
    key : Any
        The actual key of the variable in its parent object, used as an input to determine the
        variable's string access key.
    value : Any
        The variable's value.
    display_name : str
        An optional string to use for the variable's display name. Is
        a stringified version of `key` if not passed.

    Returns
    -------
    A Variable summary, or None if the variable should be skipped.
    """
    if isinstance(value, types.ModuleType):
        return None

    if display_name is None:
        display_name = str(key)

    try:
        ins = get_inspector(value)

        kind_str = ins.get_kind()
        kind = VariableKind(kind_str)
        display_value, is_truncated = ins.get_display_value()
        display_type = ins.get_display_type()
        type_info = ins.get_type_info()
        access_key = encode_access_key(key)
        length = ins.get_length()
        size = ins.get_size()
        has_children = ins.has_children()
        has_viewer = ins.has_viewer()
        updated_time = timestamp()

        return Variable(
            display_name=display_name,
            display_value=display_value,
            display_type=display_type,
            kind=kind,
            type_info=type_info,
            access_key=access_key,
            length=length,
            size=size,
            has_children=has_children,
            has_viewer=has_viewer,
            is_truncated=is_truncated,
            updated_time=updated_time,
        )

    except Exception as err:
        logger.warning(err, exc_info=True)
        return Variable(
            display_name=display_name,
            display_value=get_qualname(value),
            display_type="",
            kind=VariableKind.Other,
            type_info="",
            access_key="",
            length=0,
            size=0,
            has_children=False,
            has_viewer=False,
            is_truncated=False,
            updated_time=timestamp(),
        )


def _summarize_children(parent: Any, limit: int = MAX_CHILDREN) -> list[Variable]:
    inspector = get_inspector(parent)
    children = inspector.get_children()
    summaries = []
    for child in children:
        if len(summaries) >= limit:
            break
        try:
            value = inspector.get_child(child)
        except Exception:
            value = "Cannot get value."

        display_name = inspector.get_display_name(child)
        summary = _summarize_variable(child, value, display_name=display_name)
        if summary is not None:
            summaries.append(summary)
    return summaries


def _format_value(value: Any, clipboard_format: ClipboardFormatFormat) -> str:
    """Formats the given value using the requested clipboard format."""
    inspector = get_inspector(value)

    if clipboard_format == ClipboardFormatFormat.TextHtml:
        return inspector.to_html()
    else:
        return inspector.to_plaintext()

