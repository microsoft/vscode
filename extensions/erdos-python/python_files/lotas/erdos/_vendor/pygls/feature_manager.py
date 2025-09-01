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
import asyncio
import functools
import inspect
import itertools
import logging
from typing import Any, Callable, Dict, Optional, get_type_hints

from erdos._vendor.pygls.constants import (
    ATTR_COMMAND_TYPE,
    ATTR_EXECUTE_IN_THREAD,
    ATTR_FEATURE_TYPE,
    ATTR_REGISTERED_NAME,
    ATTR_REGISTERED_TYPE,
    PARAM_LS,
)
from erdos._vendor.pygls.exceptions import (
    CommandAlreadyRegisteredError,
    FeatureAlreadyRegisteredError,
    ThreadDecoratorError,
    ValidationError,
)
from erdos._vendor.pygls.lsp import get_method_options_type, is_instance

logger = logging.getLogger(__name__)


def assign_help_attrs(f, reg_name, reg_type):
    setattr(f, ATTR_REGISTERED_NAME, reg_name)
    setattr(f, ATTR_REGISTERED_TYPE, reg_type)


def assign_thread_attr(f):
    setattr(f, ATTR_EXECUTE_IN_THREAD, True)


def get_help_attrs(f):
    return getattr(f, ATTR_REGISTERED_NAME, None), getattr(
        f, ATTR_REGISTERED_TYPE, None
    )


def has_ls_param_or_annotation(f, annotation):
    """Returns true if callable has first parameter named `ls` or type of
    annotation"""
    try:
        sig = inspect.signature(f)
        first_p = next(itertools.islice(sig.parameters.values(), 0, 1))
        return first_p.name == PARAM_LS or get_type_hints(f)[first_p.name] == annotation
    except Exception:
        return False


def is_thread_function(f):
    return getattr(f, ATTR_EXECUTE_IN_THREAD, False)


def wrap_with_server(f, server):
    """Returns a new callable/coroutine with server as first argument."""
    if not has_ls_param_or_annotation(f, type(server)):
        return f

    if asyncio.iscoroutinefunction(f):

        async def wrapped(*args, **kwargs):
            return await f(server, *args, **kwargs)

    else:
        wrapped = functools.partial(f, server)
        if is_thread_function(f):
            assign_thread_attr(wrapped)

    return wrapped


class FeatureManager:
    """A class for managing server features.

    Attributes:
        _builtin_features(dict): Predefined set of lsp methods
        _feature_options(dict): Registered feature's options
        _features(dict): Registered features
        _commands(dict): Registered commands
        server(LanguageServer): Reference to the language server
                                If passed, server will be passed to registered
                                features/commands with first parameter:
                                    1. ls - parameter naming convention
                                    2. name: LanguageServer - add typings
    """

    def __init__(self, server=None, converter=None):
        self._builtin_features = {}
        self._feature_options = {}
        self._features = {}
        self._commands = {}
        self.server = server
        self.converter = converter

    def add_builtin_feature(self, feature_name: str, func: Callable) -> None:
        """Registers builtin (predefined) feature."""
        self._builtin_features[feature_name] = func
        logger.info("Registered builtin feature %s", feature_name)

    @property
    def builtin_features(self) -> Dict:
        """Returns server builtin features."""
        return self._builtin_features

    def command(self, command_name: str) -> Callable:
        """Decorator used to register custom commands.

        Example:
            @ls.command('myCustomCommand')
        """

        def decorator(f):
            # Validate
            if command_name is None or command_name.strip() == "":
                logger.error("Missing command name.")
                raise ValidationError("Command name is required.")

            # Check if not already registered
            if command_name in self._commands:
                logger.error('Command "%s" is already registered.', command_name)
                raise CommandAlreadyRegisteredError(command_name)

            assign_help_attrs(f, command_name, ATTR_COMMAND_TYPE)

            wrapped = wrap_with_server(f, self.server)
            # Assign help attributes for thread decorator
            assign_help_attrs(wrapped, command_name, ATTR_COMMAND_TYPE)

            self._commands[command_name] = wrapped

            logger.info('Command "%s" is successfully registered.', command_name)

            return f

        return decorator

    @property
    def commands(self) -> Dict:
        """Returns registered custom commands."""
        return self._commands

    def feature(
        self,
        feature_name: str,
        options: Optional[Any] = None,
    ) -> Callable:
        """Decorator used to register LSP features.

        Example:
            @ls.feature('textDocument/completion', CompletionItems(trigger_characters=['.']))
        """

        def decorator(f):
            # Validate
            if feature_name is None or feature_name.strip() == "":
                logger.error("Missing feature name.")
                raise ValidationError("Feature name is required.")

            # Add feature if not exists
            if feature_name in self._features:
                logger.error('Feature "%s" is already registered.', feature_name)
                raise FeatureAlreadyRegisteredError(feature_name)

            assign_help_attrs(f, feature_name, ATTR_FEATURE_TYPE)

            wrapped = wrap_with_server(f, self.server)
            # Assign help attributes for thread decorator
            assign_help_attrs(wrapped, feature_name, ATTR_FEATURE_TYPE)

            self._features[feature_name] = wrapped

            if options:
                options_type = get_method_options_type(feature_name)
                if options_type and not is_instance(
                    self.converter, options, options_type
                ):
                    raise TypeError(
                        (
                            f'Options of method "{feature_name}"'
                            f" should be instance of type {options_type}"
                        )
                    )
                self._feature_options[feature_name] = options

            logger.info('Registered "%s" with options "%s"', feature_name, options)

            return f

        return decorator

    @property
    def feature_options(self) -> Dict:
        """Returns feature options for registered features."""
        return self._feature_options

    @property
    def features(self) -> Dict:
        """Returns registered features"""
        return self._features

    def thread(self) -> Callable:
        """Decorator that mark function to execute it in a thread."""

        def decorator(f):
            if asyncio.iscoroutinefunction(f):
                raise ThreadDecoratorError(
                    f'Thread decorator cannot be used with async functions "{f.__name__}"'
                )

            # Allow any decorator order
            try:
                reg_name = getattr(f, ATTR_REGISTERED_NAME)
                reg_type = getattr(f, ATTR_REGISTERED_TYPE)

                if reg_type is ATTR_FEATURE_TYPE:
                    assign_thread_attr(self.features[reg_name])
                elif reg_type is ATTR_COMMAND_TYPE:
                    assign_thread_attr(self.commands[reg_name])

            except AttributeError:
                assign_thread_attr(f)

            return f

        return decorator
