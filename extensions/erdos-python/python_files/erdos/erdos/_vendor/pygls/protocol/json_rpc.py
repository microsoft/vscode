############################################################################
# Copyright(c) Open Law Library. All rights reserved.                      #
# See ThirdPartyNotices.txt in the project root for additional notices.    #
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
from __future__ import annotations
import asyncio
import enum
import json
import logging
import re
import sys
import uuid
import traceback
from concurrent.futures import Future
from functools import partial
from typing import (
    Any,
    Dict,
    List,
    Optional,
    Type,
    Union,
    TYPE_CHECKING,
)

if TYPE_CHECKING:
    from erdos.erdos._vendor.pygls.server import LanguageServer, WebSocketTransportAdapter


from erdos.erdos._vendor import attrs
from erdos.erdos._vendor.cattrs.errors import ClassValidationError

from erdos.erdos._vendor.lsprotocol.types import (
    CANCEL_REQUEST,
    EXIT,
    WORKSPACE_EXECUTE_COMMAND,
    ResponseError,
    ResponseErrorMessage,
)

from erdos.erdos._vendor.pygls.exceptions import (
    JsonRpcException,
    JsonRpcInternalError,
    JsonRpcInvalidParams,
    JsonRpcMethodNotFound,
    JsonRpcRequestCancelled,
    FeatureNotificationError,
    FeatureRequestError,
)
from erdos.erdos._vendor.pygls.feature_manager import FeatureManager, is_thread_function

logger = logging.getLogger(__name__)


@attrs.define
class JsonRPCNotification:
    """A class that represents a generic json rpc notification message.
    Used as a fallback for unknown types.
    """

    method: str
    jsonrpc: str
    params: Any


@attrs.define
class JsonRPCRequestMessage:
    """A class that represents a generic json rpc request message.
    Used as a fallback for unknown types.
    """

    id: Union[int, str]
    method: str
    jsonrpc: str
    params: Any


@attrs.define
class JsonRPCResponseMessage:
    """A class that represents a generic json rpc response message.
    Used as a fallback for unknown types.
    """

    id: Union[int, str]
    jsonrpc: str
    result: Any


class JsonRPCProtocol(asyncio.Protocol):
    """Json RPC protocol implementation using on top of `asyncio.Protocol`.

    Specification of the protocol can be found here:
        https://www.jsonrpc.org/specification

    This class provides bidirectional communication which is needed for LSP.
    """

    CHARSET = "utf-8"
    CONTENT_TYPE = "application/vscode-jsonrpc"

    MESSAGE_PATTERN = re.compile(
        rb"^(?:[^\r\n]+\r\n)*"
        + rb"Content-Length: (?P<length>\d+)\r\n"
        + rb"(?:[^\r\n]+\r\n)*\r\n"
        + rb"(?P<body>{.*)",
        re.DOTALL,
    )

    VERSION = "2.0"

    def __init__(self, server: LanguageServer, converter):
        self._server = server
        self._converter = converter

        self._shutdown = False

        # Book keeping for in-flight requests
        self._request_futures: Dict[str, Future[Any]] = {}
        self._result_types: Dict[str, Any] = {}

        self.fm = FeatureManager(server, converter)
        self.transport: Optional[
            Union[asyncio.WriteTransport, WebSocketTransportAdapter]
        ] = None
        self._message_buf: List[bytes] = []

        self._send_only_body = False

    def __call__(self):
        return self

    def _execute_notification(self, handler, *params):
        """Executes notification message handler."""
        if asyncio.iscoroutinefunction(handler):
            future = asyncio.ensure_future(handler(*params))
            future.add_done_callback(self._execute_notification_callback)
        else:
            if is_thread_function(handler):
                self._server.thread_pool.apply_async(handler, (*params,))
            else:
                handler(*params)

    def _execute_notification_callback(self, future):
        """Success callback used for coroutine notification message."""
        if future.exception():
            try:
                raise future.exception()
            except Exception:
                error = JsonRpcInternalError.of(sys.exc_info())
                logger.exception('Exception occurred in notification: "%s"', error)

            # Revisit. Client does not support response with msg_id = None
            # https://stackoverflow.com/questions/31091376/json-rpc-2-0-allow-notifications-to-have-an-error-response
            # self._send_response(None, error=error)

    def _execute_request(self, msg_id, handler, params):
        """Executes request message handler."""

        if asyncio.iscoroutinefunction(handler):
            future = asyncio.ensure_future(handler(params))
            self._request_futures[msg_id] = future
            future.add_done_callback(partial(self._execute_request_callback, msg_id))
        else:
            # Can't be canceled
            if is_thread_function(handler):
                self._server.thread_pool.apply_async(
                    handler,
                    (params,),
                    callback=partial(
                        self._send_response,
                        msg_id,
                    ),
                    error_callback=partial(self._execute_request_err_callback, msg_id),
                )
            else:
                self._send_response(msg_id, handler(params))

    def _execute_request_callback(self, msg_id, future):
        """Success callback used for coroutine request message."""
        try:
            if not future.cancelled():
                self._send_response(msg_id, result=future.result())
            else:
                self._send_response(
                    msg_id,
                    error=JsonRpcRequestCancelled(
                        f'Request with id "{msg_id}" is canceled'
                    ).to_response_error(),
                )
            self._request_futures.pop(msg_id, None)
        except Exception:
            error = JsonRpcInternalError.of(sys.exc_info())
            logger.exception('Exception occurred for message "%s": %s', msg_id, error)
            self._send_response(msg_id, error=error.to_response_error())

    def _execute_request_err_callback(self, msg_id, exc):
        """Error callback used for coroutine request message."""
        exc_info = (type(exc), exc, None)
        error = JsonRpcInternalError.of(exc_info)
        logger.exception('Exception occurred for message "%s": %s', msg_id, error)
        self._send_response(msg_id, error=error.to_response_error())

    def _get_handler(self, feature_name):
        """Returns builtin or used defined feature by name if exists."""
        try:
            return self.fm.builtin_features[feature_name]
        except KeyError:
            try:
                return self.fm.features[feature_name]
            except KeyError:
                raise JsonRpcMethodNotFound.of(feature_name)

    def _handle_cancel_notification(self, msg_id):
        """Handles a cancel notification from the client."""
        future = self._request_futures.pop(msg_id, None)

        if not future:
            logger.warning('Cancel notification for unknown message id "%s"', msg_id)
            return

        # Will only work if the request hasn't started executing
        if future.cancel():
            logger.info('Cancelled request with id "%s"', msg_id)

    def _handle_notification(self, method_name, params):
        """Handles a notification from the client."""
        if method_name == CANCEL_REQUEST:
            self._handle_cancel_notification(params.id)
            return

        try:
            handler = self._get_handler(method_name)
            self._execute_notification(handler, params)
        except (KeyError, JsonRpcMethodNotFound):
            logger.warning('Ignoring notification for unknown method "%s"', method_name)
        except Exception as error:
            logger.exception(
                'Failed to handle notification "%s": %s',
                method_name,
                params,
                exc_info=True,
            )
            self._server._report_server_error(error, FeatureNotificationError)

    def _handle_request(self, msg_id, method_name, params):
        """Handles a request from the client."""
        try:
            handler = self._get_handler(method_name)

            # workspace/executeCommand is a special case
            if method_name == WORKSPACE_EXECUTE_COMMAND:
                handler(params, msg_id)
            else:
                self._execute_request(msg_id, handler, params)

        except JsonRpcException as error:
            logger.exception(
                "Failed to handle request %s %s %s",
                msg_id,
                method_name,
                params,
                exc_info=True,
            )
            self._send_response(msg_id, None, error.to_response_error())
            self._server._report_server_error(error, FeatureRequestError)
        except Exception as error:
            logger.exception(
                "Failed to handle request %s %s %s",
                msg_id,
                method_name,
                params,
                exc_info=True,
            )
            err = JsonRpcInternalError.of(sys.exc_info()).to_response_error()
            self._send_response(msg_id, None, err)
            self._server._report_server_error(error, FeatureRequestError)

    def _handle_response(self, msg_id, result=None, error=None):
        """Handles a response from the client."""
        future = self._request_futures.pop(msg_id, None)

        if not future:
            logger.warning('Received response to unknown message id "%s"', msg_id)
            return

        if error is not None:
            logger.debug('Received error response to message "%s": %s', msg_id, error)
            future.set_exception(JsonRpcException.from_error(error))
        else:
            logger.debug('Received result for message "%s": %s', msg_id, result)
            future.set_result(result)

    def _serialize_message(self, data):
        """Function used to serialize data sent to the client."""

        if hasattr(data, "__attrs_attrs__"):
            return self._converter.unstructure(data)

        if isinstance(data, enum.Enum):
            return data.value

        return data.__dict__

    def _deserialize_message(self, data):
        """Function used to deserialize data recevied from the client."""

        if "jsonrpc" not in data:
            return data

        try:
            if "id" in data:
                if "error" in data:
                    return self._converter.structure(data, ResponseErrorMessage)
                elif "method" in data:
                    request_type = (
                        self.get_message_type(data["method"]) or JsonRPCRequestMessage
                    )
                    return self._converter.structure(data, request_type)
                else:
                    response_type = (
                        self._result_types.pop(data["id"]) or JsonRPCResponseMessage
                    )
                    return self._converter.structure(data, response_type)

            else:
                method = data.get("method", "")
                notification_type = self.get_message_type(method) or JsonRPCNotification
                return self._converter.structure(data, notification_type)

        except ClassValidationError as exc:
            logger.error("Unable to deserialize message\n%s", traceback.format_exc())
            raise JsonRpcInvalidParams() from exc

        except Exception as exc:
            logger.error("Unable to deserialize message\n%s", traceback.format_exc())
            raise JsonRpcInternalError() from exc

    def _procedure_handler(self, message):
        """Delegates message to handlers depending on message type."""

        if message.jsonrpc != JsonRPCProtocol.VERSION:
            logger.warning('Unknown message "%s"', message)
            return

        if self._shutdown and getattr(message, "method", "") != EXIT:
            logger.warning("Server shutting down. No more requests!")
            return

        if hasattr(message, "method"):
            if hasattr(message, "id"):
                logger.debug("Request message received.")
                self._handle_request(message.id, message.method, message.params)
            else:
                logger.debug("Notification message received.")
                self._handle_notification(message.method, message.params)
        else:
            if hasattr(message, "error"):
                logger.debug("Error message received.")
                self._handle_response(message.id, None, message.error)
            else:
                logger.debug("Response message received.")
                self._handle_response(message.id, message.result)

    def _send_data(self, data):
        """Sends data to the client."""
        if not data:
            return

        if self.transport is None:
            logger.error("Unable to send data, no available transport!")
            return

        try:
            body = json.dumps(data, default=self._serialize_message)
            logger.info("Sending data: %s", body)

            if self._send_only_body:
                # Mypy/Pyright seem to think `write()` wants `"bytes | bytearray | memoryview"`
                # But runtime errors with anything but `str`.
                self.transport.write(body)  # type: ignore
                return

            header = (
                f"Content-Length: {len(body)}\r\n"
                f"Content-Type: {self.CONTENT_TYPE}; charset={self.CHARSET}\r\n\r\n"
            ).encode(self.CHARSET)

            self.transport.write(header + body.encode(self.CHARSET))
        except Exception as error:
            logger.exception("Error sending data", exc_info=True)
            self._server._report_server_error(error, JsonRpcInternalError)

    def _send_response(
        self, msg_id, result=None, error: Union[ResponseError, None] = None
    ):
        """Sends a JSON RPC response to the client.

        Args:
            msg_id(str): Id from request
            result(any): Result returned by handler
            error(any): Error returned by handler
        """

        if error is not None:
            response = ResponseErrorMessage(id=msg_id, error=error)

        else:
            response_type = self._result_types.pop(msg_id, JsonRPCResponseMessage)
            response = response_type(
                id=msg_id, result=result, jsonrpc=JsonRPCProtocol.VERSION
            )

        self._send_data(response)

    def connection_lost(self, exc):
        """Method from base class, called when connection is lost, in which case we
        want to shutdown the server's process as well.
        """
        logger.error("Connection to the client is lost! Shutting down the server.")
        sys.exit(1)

    def connection_made(  # type: ignore # see: https://github.com/python/typeshed/issues/3021
        self,
        transport: asyncio.Transport,
    ):
        """Method from base class, called when connection is established"""
        self.transport = transport

    def data_received(self, data: bytes):
        try:
            self._data_received(data)
        except Exception as error:
            logger.exception("Error receiving data", exc_info=True)
            self._server._report_server_error(error, JsonRpcInternalError)

    def _data_received(self, data: bytes):
        """Method from base class, called when server receives the data"""
        logger.debug("Received %r", data)

        while len(data):
            # Append the incoming chunk to the message buffer
            self._message_buf.append(data)

            # Look for the body of the message
            message = b"".join(self._message_buf)
            found = JsonRPCProtocol.MESSAGE_PATTERN.fullmatch(message)

            body = found.group("body") if found else b""
            length = int(found.group("length")) if found else 1

            if len(body) < length:
                # Message is incomplete; bail until more data arrives
                return

            # Message is complete;
            # extract the body and any remaining data,
            # and reset the buffer for the next message
            body, data = body[:length], body[length:]
            self._message_buf = []

            # Parse the body
            self._procedure_handler(
                json.loads(
                    body.decode(self.CHARSET), object_hook=self._deserialize_message
                )
            )

    def get_message_type(self, method: str) -> Optional[Type]:
        """Return the type definition of the message associated with the given method."""
        return None

    def get_result_type(self, method: str) -> Optional[Type]:
        """Return the type definition of the result associated with the given method."""
        return None

    def notify(self, method: str, params=None):
        """Sends a JSON RPC notification to the client."""

        logger.debug("Sending notification: '%s' %s", method, params)

        notification_type = self.get_message_type(method) or JsonRPCNotification
        notification = notification_type(
            method=method, params=params, jsonrpc=JsonRPCProtocol.VERSION
        )

        self._send_data(notification)

    def send_request(self, method, params=None, callback=None, msg_id=None):
        """Sends a JSON RPC request to the client.

        Args:
            method(str): The method name of the message to send
            params(any): The payload of the message

        Returns:
            Future that will be resolved once a response has been received
        """

        if msg_id is None:
            msg_id = str(uuid.uuid4())

        request_type = self.get_message_type(method) or JsonRPCRequestMessage
        logger.debug('Sending request with id "%s": %s %s', msg_id, method, params)

        request = request_type(
            id=msg_id,
            method=method,
            params=params,
            jsonrpc=JsonRPCProtocol.VERSION,
        )

        future = Future()  # type: ignore[var-annotated]
        # If callback function is given, call it when result is received
        if callback:

            def wrapper(future: Future):
                result = future.result()
                logger.info("Client response for %s received: %s", params, result)
                callback(result)

            future.add_done_callback(wrapper)

        self._request_futures[msg_id] = future
        self._result_types[msg_id] = self.get_result_type(method)

        self._send_data(request)

        return future

    def send_request_async(self, method, params=None, msg_id=None):
        """Calls `send_request` and wraps `concurrent.futures.Future` with
        `asyncio.Future` so it can be used with `await` keyword.

        Args:
            method(str): The method name of the message to send
            params(any): The payload of the message
            msg_id(str|int): Optional, message id

        Returns:
            `asyncio.Future` that can be awaited
        """
        return asyncio.wrap_future(
            self.send_request(method, params=params, msg_id=msg_id)
        )

    def thread(self):
        """Decorator that mark function to execute it in a thread."""
        return self.fm.thread()
