############################################################################
# Original work Copyright 2018 Palantir Technologies, Inc.                 #
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
import traceback
from typing import Set
from typing import Type
from erdos.erdos._vendor.lsprotocol.types import ResponseError


class JsonRpcException(Exception):
    """A class used as a base class for json rpc exceptions."""

    def __init__(self, message=None, code=None, data=None):
        message = message or getattr(self.__class__, "MESSAGE")
        super().__init__(message)
        self.message = message
        self.code = code or getattr(self.__class__, "CODE")
        self.data = data

    def __eq__(self, other):
        return (
            isinstance(other, self.__class__)
            and self.code == other.code
            and self.message == other.message
        )

    def __hash__(self):
        return hash((self.code, self.message))

    @staticmethod
    def from_error(error):
        for exc_class in _EXCEPTIONS:
            if exc_class.supports_code(error.code):
                return exc_class(
                    code=error.code, message=error.message, data=error.data
                )

        return JsonRpcException(code=error.code, message=error.message, data=error.data)

    @classmethod
    def supports_code(cls, code):
        # Defaults to UnknownErrorCode
        return getattr(cls, "CODE", -32001) == code

    def to_response_error(self) -> ResponseError:
        return ResponseError(code=self.code, message=self.message, data=self.data)


class JsonRpcInternalError(JsonRpcException):
    CODE = -32603
    MESSAGE = "Internal Error"

    @classmethod
    def of(cls, exc_info):
        exc_type, exc_value, exc_tb = exc_info
        return cls(
            message="".join(
                traceback.format_exception_only(exc_type, exc_value)
            ).strip(),
            data={"traceback": traceback.format_tb(exc_tb)},
        )


class JsonRpcInvalidParams(JsonRpcException):
    CODE = -32602
    MESSAGE = "Invalid Params"


class JsonRpcInvalidRequest(JsonRpcException):
    CODE = -32600
    MESSAGE = "Invalid Request"


class JsonRpcMethodNotFound(JsonRpcException):
    CODE = -32601
    MESSAGE = "Method Not Found"

    @classmethod
    def of(cls, method):
        return cls(message=cls.MESSAGE + ": " + method)


class JsonRpcParseError(JsonRpcException):
    CODE = -32700
    MESSAGE = "Parse Error"


class JsonRpcRequestCancelled(JsonRpcException):
    CODE = -32800
    MESSAGE = "Request Cancelled"


class JsonRpcContentModified(JsonRpcException):
    CODE = -32801
    MESSAGE = "Content Modified"


class JsonRpcServerNotInitialized(JsonRpcException):
    CODE = -32002
    MESSAGE = "ServerNotInitialized"


class JsonRpcUnknownErrorCode(JsonRpcException):
    CODE = -32001
    MESSAGE = "UnknownErrorCode"


class JsonRpcReservedErrorRangeStart(JsonRpcException):
    CODE = -32099
    MESSAGE = "jsonrpcReservedErrorRangeStart"


class JsonRpcReservedErrorRangeEnd(JsonRpcException):
    CODE = -32000
    MESSAGE = "jsonrpcReservedErrorRangeEnd"


class LspReservedErrorRangeStart(JsonRpcException):
    CODE = -32899
    MESSAGE = "lspReservedErrorRangeStart"


class LspReservedErrorRangeEnd(JsonRpcException):
    CODE = -32800
    MESSAGE = "lspReservedErrorRangeEnd"


class JsonRpcServerError(JsonRpcException):
    def __init__(self, message, code, data=None):
        if not _is_server_error_code(code):
            raise ValueError("Error code should be in range -32099 - -32000")
        super().__init__(message=message, code=code, data=data)

    @classmethod
    def supports_code(cls, code):
        return _is_server_error_code(code)


def _is_server_error_code(code):
    return -32099 <= code <= -32000


_EXCEPTIONS: Set[Type[JsonRpcException]] = {
    JsonRpcInternalError,
    JsonRpcInvalidParams,
    JsonRpcInvalidRequest,
    JsonRpcMethodNotFound,
    JsonRpcParseError,
    JsonRpcRequestCancelled,
    JsonRpcServerError,
}


class PyglsError(Exception):
    pass


class CommandAlreadyRegisteredError(PyglsError):
    def __init__(self, command_name):
        self.command_name = command_name

    def __repr__(self):
        return f'Command "{self.command_name}" is already registered.'


class FeatureAlreadyRegisteredError(PyglsError):
    def __init__(self, feature_name):
        self.feature_name = feature_name

    def __repr__(self):
        return f'Feature "{self.feature_name}" is already registered.'


class FeatureRequestError(PyglsError):
    pass


class FeatureNotificationError(PyglsError):
    pass


class MethodTypeNotRegisteredError(PyglsError):
    def __init__(self, name):
        self.name = name

    def __repr__(self):
        return f'"{self.name}" is not added to `pygls.lsp.LSP_METHODS_MAP`.'


class ThreadDecoratorError(PyglsError):
    pass


class ValidationError(PyglsError):
    def __init__(self, errors=None):
        self.errors = errors or []

    def __repr__(self):
        opt_errs = "\n-".join([e for e in self.errors])
        return f"Missing options: {opt_errs}"
