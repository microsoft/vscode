from pathlib import Path
from typing import Optional

from erdos.erdos._vendor.jedi.inference.cache import inference_state_method_cache
from erdos.erdos._vendor.jedi.inference.filters import DictFilter
from erdos.erdos._vendor.jedi.inference.names import ValueNameMixin, AbstractNameDefinition
from erdos.erdos._vendor.jedi.inference.base_value import Value
from erdos.erdos._vendor.jedi.inference.value.module import SubModuleDictMixin
from erdos.erdos._vendor.jedi.inference.context import NamespaceContext


class ImplicitNSName(ValueNameMixin, AbstractNameDefinition):
    """
    Accessing names for implicit namespace packages should infer to nothing.
    This object will prevent Jedi from raising exceptions
    """
    def __init__(self, implicit_ns_value, string_name):
        self._value = implicit_ns_value
        self.string_name = string_name


class ImplicitNamespaceValue(Value, SubModuleDictMixin):
    """
    Provides support for implicit namespace packages
    """
    api_type = 'namespace'
    parent_context = None

    def __init__(self, inference_state, string_names, paths):
        super().__init__(inference_state, parent_context=None)
        self.inference_state = inference_state
        self.string_names = string_names
        self._paths = paths

    def get_filters(self, origin_scope=None):
        yield DictFilter(self.sub_modules_dict())

    def get_qualified_names(self):
        return ()

    @property  # type: ignore[misc]
    @inference_state_method_cache()
    def name(self):
        string_name = self.py__package__()[-1]
        return ImplicitNSName(self, string_name)

    def py__file__(self) -> Optional[Path]:
        return None

    def py__package__(self):
        """Return the fullname
        """
        return self.string_names

    def py__path__(self):
        return self._paths

    def py__name__(self):
        return '.'.join(self.string_names)

    def is_namespace(self):
        return True

    def is_stub(self):
        return False

    def is_package(self):
        return True

    def as_context(self):
        return NamespaceContext(self)

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self.py__name__())
