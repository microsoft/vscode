"""
Used only for REPL Completion.
"""

import inspect
from pathlib import Path

from erdos.erdos._vendor.jedi.parser_utils import get_cached_code_lines

from erdos.erdos._vendor.jedi import settings
from erdos.erdos._vendor.jedi.cache import memoize_method
from erdos.erdos._vendor.jedi.inference import compiled
from erdos.erdos._vendor.jedi.file_io import FileIO
from erdos.erdos._vendor.jedi.inference.names import NameWrapper
from erdos.erdos._vendor.jedi.inference.base_value import ValueSet, ValueWrapper, NO_VALUES
from erdos.erdos._vendor.jedi.inference.value import ModuleValue
from erdos.erdos._vendor.jedi.inference.cache import inference_state_function_cache, \
    inference_state_method_cache
from erdos.erdos._vendor.jedi.inference.compiled.access import ALLOWED_GETITEM_TYPES, get_api_type
from erdos.erdos._vendor.jedi.inference.gradual.conversion import to_stub
from erdos.erdos._vendor.jedi.inference.context import CompiledContext, CompiledModuleContext, \
    TreeContextMixin

_sentinel = object()


class MixedObject(ValueWrapper):
    """
    A ``MixedObject`` is used in two ways:

    1. It uses the default logic of ``parser.python.tree`` objects,
    2. except for getattr calls and signatures. The names dicts are generated
       in a fashion like ``CompiledValue``.

    This combined logic makes it possible to provide more powerful REPL
    completion. It allows side effects that are not noticable with the default
    parser structure to still be completable.

    The biggest difference from CompiledValue to MixedObject is that we are
    generally dealing with Python code and not with C code. This will generate
    fewer special cases, because we in Python you don't have the same freedoms
    to modify the runtime.
    """
    def __init__(self, compiled_value, tree_value):
        super().__init__(tree_value)
        self.compiled_value = compiled_value
        self.access_handle = compiled_value.access_handle

    def get_filters(self, *args, **kwargs):
        yield MixedObjectFilter(
            self.inference_state, self.compiled_value, self._wrapped_value)

    def get_signatures(self):
        # Prefer `inspect.signature` over somehow analyzing Python code. It
        # should be very precise, especially for stuff like `partial`.
        return self.compiled_value.get_signatures()

    @inference_state_method_cache(default=NO_VALUES)
    def py__call__(self, arguments):
        # Fallback to the wrapped value if to stub returns no values.
        values = to_stub(self._wrapped_value)
        if not values:
            values = self._wrapped_value
        return values.py__call__(arguments)

    def get_safe_value(self, default=_sentinel):
        if default is _sentinel:
            return self.compiled_value.get_safe_value()
        else:
            return self.compiled_value.get_safe_value(default)

    @property
    def array_type(self):
        return self.compiled_value.array_type

    def get_key_values(self):
        return self.compiled_value.get_key_values()

    def py__simple_getitem__(self, index):
        python_object = self.compiled_value.access_handle.access._obj
        if type(python_object) in ALLOWED_GETITEM_TYPES:
            return self.compiled_value.py__simple_getitem__(index)
        return self._wrapped_value.py__simple_getitem__(index)

    def negate(self):
        return self.compiled_value.negate()

    def _as_context(self):
        if self.parent_context is None:
            return MixedModuleContext(self)
        return MixedContext(self)

    def __repr__(self):
        return '<%s: %s; %s>' % (
            type(self).__name__,
            self.access_handle.get_repr(),
            self._wrapped_value,
        )


class MixedContext(CompiledContext, TreeContextMixin):
    @property
    def compiled_value(self):
        return self._value.compiled_value


class MixedModuleContext(CompiledModuleContext, MixedContext):
    pass


class MixedName(NameWrapper):
    """
    The ``CompiledName._compiled_value`` is our MixedObject.
    """
    def __init__(self, wrapped_name, parent_tree_value):
        super().__init__(wrapped_name)
        self._parent_tree_value = parent_tree_value

    @property
    def start_pos(self):
        values = list(self.infer())
        if not values:
            # This means a start_pos that doesn't exist (compiled objects).
            return 0, 0
        return values[0].name.start_pos

    @memoize_method
    def infer(self):
        compiled_value = self._wrapped_name.infer_compiled_value()
        tree_value = self._parent_tree_value
        if tree_value.is_instance() or tree_value.is_class():
            tree_values = tree_value.py__getattribute__(self.string_name)
            if compiled_value.is_function():
                return ValueSet({MixedObject(compiled_value, v) for v in tree_values})

        module_context = tree_value.get_root_context()
        return _create(self._inference_state, compiled_value, module_context)


class MixedObjectFilter(compiled.CompiledValueFilter):
    def __init__(self, inference_state, compiled_value, tree_value):
        super().__init__(inference_state, compiled_value)
        self._tree_value = tree_value

    def _create_name(self, *args, **kwargs):
        return MixedName(
            super()._create_name(*args, **kwargs),
            self._tree_value,
        )


@inference_state_function_cache()
def _load_module(inference_state, path):
    return inference_state.parse(
        path=path,
        cache=True,
        diff_cache=settings.fast_parser,
        cache_path=settings.cache_directory
    ).get_root_node()


def _get_object_to_check(python_object):
    """Check if inspect.getfile has a chance to find the source."""
    try:
        python_object = inspect.unwrap(python_object)
    except ValueError:
        # Can return a ValueError when it wraps around
        pass

    if (inspect.ismodule(python_object)
            or inspect.isclass(python_object)
            or inspect.ismethod(python_object)
            or inspect.isfunction(python_object)
            or inspect.istraceback(python_object)
            or inspect.isframe(python_object)
            or inspect.iscode(python_object)):
        return python_object

    try:
        return python_object.__class__
    except AttributeError:
        raise TypeError  # Prevents computation of `repr` within inspect.


def _find_syntax_node_name(inference_state, python_object):
    original_object = python_object
    try:
        python_object = _get_object_to_check(python_object)
        path = inspect.getsourcefile(python_object)
    except (OSError, TypeError):
        # The type might not be known (e.g. class_with_dict.__weakref__)
        return None
    path = None if path is None else Path(path)
    try:
        if path is None or not path.exists():
            # The path might not exist or be e.g. <stdin>.
            return None
    except OSError:
        # Might raise an OSError on Windows:
        #
        #     [WinError 123] The filename, directory name, or volume label
        #     syntax is incorrect: '<string>'
        return None

    file_io = FileIO(path)
    module_node = _load_module(inference_state, path)

    if inspect.ismodule(python_object):
        # We don't need to check names for modules, because there's not really
        # a way to write a module in a module in Python (and also __name__ can
        # be something like ``email.utils``).
        code_lines = get_cached_code_lines(inference_state.grammar, path)
        return module_node, module_node, file_io, code_lines

    try:
        name_str = python_object.__name__
    except AttributeError:
        # Stuff like python_function.__code__.
        return None

    if name_str == '<lambda>':
        return None  # It's too hard to find lambdas.

    # Doesn't always work (e.g. os.stat_result)
    names = module_node.get_used_names().get(name_str, [])
    # Only functions and classes are relevant. If a name e.g. points to an
    # import, it's probably a builtin (like collections.deque) and needs to be
    # ignored.
    names = [
        n for n in names
        if n.parent.type in ('funcdef', 'classdef') and n.parent.name == n
    ]
    if not names:
        return None

    try:
        code = python_object.__code__
        # By using the line number of a code object we make the lookup in a
        # file pretty easy. There's still a possibility of people defining
        # stuff like ``a = 3; foo(a); a = 4`` on the same line, but if people
        # do so we just don't care.
        line_nr = code.co_firstlineno
    except AttributeError:
        pass
    else:
        line_names = [name for name in names if name.start_pos[0] == line_nr]
        # There's a chance that the object is not available anymore, because
        # the code has changed in the background.
        if line_names:
            names = line_names

    code_lines = get_cached_code_lines(inference_state.grammar, path)
    # It's really hard to actually get the right definition, here as a last
    # resort we just return the last one. This chance might lead to odd
    # completions at some points but will lead to mostly correct type
    # inference, because people tend to define a public name in a module only
    # once.
    tree_node = names[-1].parent
    if tree_node.type == 'funcdef' and get_api_type(original_object) == 'instance':
        # If an instance is given and we're landing on a function (e.g.
        # partial in 3.5), something is completely wrong and we should not
        # return that.
        return None
    return module_node, tree_node, file_io, code_lines


@inference_state_function_cache()
def _create(inference_state, compiled_value, module_context):
    # TODO accessing this is bad, but it probably doesn't matter that much,
    # because we're working with interpreters only here.
    python_object = compiled_value.access_handle.access._obj
    result = _find_syntax_node_name(inference_state, python_object)
    if result is None:
        # TODO Care about generics from stuff like `[1]` and don't return like this.
        if type(python_object) in (dict, list, tuple):
            return ValueSet({compiled_value})

        tree_values = to_stub(compiled_value)
        if not tree_values:
            return ValueSet({compiled_value})
    else:
        module_node, tree_node, file_io, code_lines = result

        if module_context is None or module_context.tree_node != module_node:
            root_compiled_value = compiled_value.get_root_context().get_value()
            # TODO this __name__ might be wrong.
            name = root_compiled_value.py__name__()
            string_names = tuple(name.split('.'))
            module_value = ModuleValue(
                inference_state, module_node,
                file_io=file_io,
                string_names=string_names,
                code_lines=code_lines,
                is_package=root_compiled_value.is_package(),
            )
            if name is not None:
                inference_state.module_cache.add(string_names, ValueSet([module_value]))
            module_context = module_value.as_context()

        tree_values = ValueSet({module_context.create_value(tree_node)})
        if tree_node.type == 'classdef':
            if not compiled_value.is_class():
                # Is an instance, not a class.
                tree_values = tree_values.execute_with_values()

    return ValueSet(
        MixedObject(compiled_value, tree_value=tree_value)
        for tree_value in tree_values
    )
