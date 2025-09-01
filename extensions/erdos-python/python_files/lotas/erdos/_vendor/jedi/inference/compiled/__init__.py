# This file also re-exports symbols for wider use. We configure mypy and flake8
# to be aware that this file does this.

from erdos._vendor.jedi.inference.compiled.value import CompiledValue, CompiledName, \
    CompiledValueFilter, CompiledValueName, create_from_access_path
from erdos._vendor.jedi.inference.base_value import LazyValueWrapper


def builtin_from_name(inference_state, string):
    typing_builtins_module = inference_state.builtins_module
    if string in ('None', 'True', 'False'):
        builtins, = typing_builtins_module.non_stub_value_set
        filter_ = next(builtins.get_filters())
    else:
        filter_ = next(typing_builtins_module.get_filters())
    name, = filter_.get(string)
    value, = name.infer()
    return value


class ExactValue(LazyValueWrapper):
    """
    This class represents exact values, that makes operations like additions
    and exact boolean values possible, while still being a "normal" stub.
    """
    def __init__(self, compiled_value):
        self.inference_state = compiled_value.inference_state
        self._compiled_value = compiled_value

    def __getattribute__(self, name):
        if name in ('get_safe_value', 'execute_operation', 'access_handle',
                    'negate', 'py__bool__', 'is_compiled'):
            return getattr(self._compiled_value, name)
        return super().__getattribute__(name)

    def _get_wrapped_value(self):
        instance, = builtin_from_name(
            self.inference_state, self._compiled_value.name.string_name).execute_with_values()
        return instance

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self._compiled_value)


def create_simple_object(inference_state, obj):
    """
    Only allows creations of objects that are easily picklable across Python
    versions.
    """
    assert type(obj) in (int, float, str, bytes, slice, complex, bool), repr(obj)
    compiled_value = create_from_access_path(
        inference_state,
        inference_state.compiled_subprocess.create_simple_object(obj)
    )
    return ExactValue(compiled_value)


def get_string_value_set(inference_state):
    return builtin_from_name(inference_state, 'str').execute_with_values()


def load_module(inference_state, dotted_name, **kwargs):
    # Temporary, some tensorflow builtins cannot be loaded, so it's tried again
    # and again and it's really slow.
    if dotted_name.startswith('tensorflow.'):
        return None
    access_path = inference_state.compiled_subprocess.load_module(dotted_name=dotted_name, **kwargs)
    if access_path is None:
        return None
    return create_from_access_path(inference_state, access_path)
