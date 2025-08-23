"""
There are a couple of classes documented in here:

- :class:`.BaseName` as an abstact base class for almost everything.
- :class:`.Name` used in a lot of places
- :class:`.Completion` for completions
- :class:`.BaseSignature` as a base class for signatures
- :class:`.Signature` for :meth:`.Script.get_signatures` only
- :class:`.ParamName` used for parameters of signatures
- :class:`.Refactoring` for refactorings
- :class:`.SyntaxError` for :meth:`.Script.get_syntax_errors` only

These classes are the much biggest part of the API, because they contain
the interesting information about all operations.
"""
import re
from pathlib import Path
from typing import Optional

from erdos.erdos._vendor.parso.tree import search_ancestor

from erdos.erdos._vendor.jedi import settings
from erdos.erdos._vendor.jedi import debug
from erdos.erdos._vendor.jedi.inference.utils import unite
from erdos.erdos._vendor.jedi.cache import memoize_method
from erdos.erdos._vendor.jedi.inference.compiled.mixed import MixedName
from erdos.erdos._vendor.jedi.inference.names import ImportName, SubModuleName
from erdos.erdos._vendor.jedi.inference.gradual.stub_value import StubModuleValue
from erdos.erdos._vendor.jedi.inference.gradual.conversion import convert_names, convert_values
from erdos.erdos._vendor.jedi.inference.base_value import ValueSet, HasNoContext
from erdos.erdos._vendor.jedi.api.keywords import KeywordName
from erdos.erdos._vendor.jedi.api import completion_cache
from erdos.erdos._vendor.jedi.api.helpers import filter_follow_imports


def _sort_names_by_start_pos(names):
    return sorted(names, key=lambda s: s.start_pos or (0, 0))


def defined_names(inference_state, value):
    """
    List sub-definitions (e.g., methods in class).

    :type scope: Scope
    :rtype: list of Name
    """
    try:
        context = value.as_context()
    except HasNoContext:
        return []
    filter = next(context.get_filters())
    names = [name for name in filter.values()]
    return [Name(inference_state, n) for n in _sort_names_by_start_pos(names)]


def _values_to_definitions(values):
    return [Name(c.inference_state, c.name) for c in values]


class BaseName:
    """
    The base class for all definitions, completions and signatures.
    """
    _mapping = {
        'posixpath': 'os.path',
        'riscospath': 'os.path',
        'ntpath': 'os.path',
        'os2emxpath': 'os.path',
        'macpath': 'os.path',
        'genericpath': 'os.path',
        'posix': 'os',
        '_io': 'io',
        '_functools': 'functools',
        '_collections': 'collections',
        '_socket': 'socket',
        '_sqlite3': 'sqlite3',
    }

    _tuple_mapping = dict((tuple(k.split('.')), v) for (k, v) in {
        'argparse._ActionsContainer': 'argparse.ArgumentParser',
    }.items())

    def __init__(self, inference_state, name):
        self._inference_state = inference_state
        self._name = name
        """
        An instance of :class:`parso.python.tree.Name` subclass.
        """
        self.is_keyword = isinstance(self._name, KeywordName)

    @memoize_method
    def _get_module_context(self):
        # This can take a while to complete, because in the worst case of
        # imports (consider `import a` completions), we need to load all
        # modules starting with a first.
        return self._name.get_root_context()

    @property
    def module_path(self) -> Optional[Path]:
        """
        Shows the file path of a module. e.g. ``/usr/lib/python3.9/os.py``
        """
        module = self._get_module_context()
        if module.is_stub() or not module.is_compiled():
            # Compiled modules should not return a module path even if they
            # have one.
            path: Optional[Path] = self._get_module_context().py__file__()
            return path

        return None

    @property
    def name(self):
        """
        Name of variable/function/class/module.

        For example, for ``x = None`` it returns ``'x'``.

        :rtype: str or None
        """
        return self._name.get_public_name()

    @property
    def type(self):
        """
        The type of the definition.

        Here is an example of the value of this attribute.  Let's consider
        the following source.  As what is in ``variable`` is unambiguous
        to Jedi, :meth:`jedi.Script.infer` should return a list of
        definition for ``sys``, ``f``, ``C`` and ``x``.

        >>> from jedi import Script
        >>> source = '''
        ... import keyword
        ...
        ... class C:
        ...     pass
        ...
        ... class D:
        ...     pass
        ...
        ... x = D()
        ...
        ... def f():
        ...     pass
        ...
        ... for variable in [keyword, f, C, x]:
        ...     variable'''

        >>> script = Script(source)
        >>> defs = script.infer()

        Before showing what is in ``defs``, let's sort it by :attr:`line`
        so that it is easy to relate the result to the source code.

        >>> defs = sorted(defs, key=lambda d: d.line)
        >>> print(defs)  # doctest: +NORMALIZE_WHITESPACE
        [<Name full_name='keyword', description='module keyword'>,
         <Name full_name='__main__.C', description='class C'>,
         <Name full_name='__main__.D', description='instance D'>,
         <Name full_name='__main__.f', description='def f'>]

        Finally, here is what you can get from :attr:`type`:

        >>> defs = [d.type for d in defs]
        >>> defs[0]
        'module'
        >>> defs[1]
        'class'
        >>> defs[2]
        'instance'
        >>> defs[3]
        'function'

        Valid values for type are ``module``, ``class``, ``instance``, ``function``,
        ``param``, ``path``, ``keyword``, ``property`` and ``statement``.

        """
        tree_name = self._name.tree_name
        resolve = False
        if tree_name is not None:
            # TODO move this to their respective names.
            definition = tree_name.get_definition()
            if definition is not None and definition.type == 'import_from' and \
                    tree_name.is_definition():
                resolve = True

        if isinstance(self._name, SubModuleName) or resolve:
            for value in self._name.infer():
                return value.api_type
        return self._name.api_type

    @property
    def module_name(self):
        """
        The module name, a bit similar to what ``__name__`` is in a random
        Python module.

        >>> from jedi import Script
        >>> source = 'import json'
        >>> script = Script(source, path='example.py')
        >>> d = script.infer()[0]
        >>> print(d.module_name)  # doctest: +ELLIPSIS
        json
        """
        return self._get_module_context().py__name__()

    def in_builtin_module(self):
        """
        Returns True, if this is a builtin module.
        """
        value = self._get_module_context().get_value()
        if isinstance(value, StubModuleValue):
            return any(v.is_compiled() for v in value.non_stub_value_set)
        return value.is_compiled()

    @property
    def line(self):
        """The line where the definition occurs (starting with 1)."""
        start_pos = self._name.start_pos
        if start_pos is None:
            return None
        return start_pos[0]

    @property
    def column(self):
        """The column where the definition occurs (starting with 0)."""
        start_pos = self._name.start_pos
        if start_pos is None:
            return None
        return start_pos[1]

    def get_definition_start_position(self):
        """
        The (row, column) of the start of the definition range. Rows start with
        1, columns start with 0.

        :rtype: Optional[Tuple[int, int]]
        """
        if self._name.tree_name is None:
            return None
        definition = self._name.tree_name.get_definition()
        if definition is None:
            return self._name.start_pos
        return definition.start_pos

    def get_definition_end_position(self):
        """
        The (row, column) of the end of the definition range. Rows start with
        1, columns start with 0.

        :rtype: Optional[Tuple[int, int]]
        """
        if self._name.tree_name is None:
            return None
        definition = self._name.tree_name.get_definition()
        if definition is None:
            return self._name.tree_name.end_pos
        if self.type in ("function", "class"):
            last_leaf = definition.get_last_leaf()
            if last_leaf.type == "newline":
                return last_leaf.get_previous_leaf().end_pos
            return last_leaf.end_pos
        return definition.end_pos

    def docstring(self, raw=False, fast=True):
        r"""
        Return a document string for this completion object.

        Example:

        >>> from jedi import Script
        >>> source = '''\
        ... def f(a, b=1):
        ...     "Document for function f."
        ... '''
        >>> script = Script(source, path='example.py')
        >>> doc = script.infer(1, len('def f'))[0].docstring()
        >>> print(doc)
        f(a, b=1)
        <BLANKLINE>
        Document for function f.

        Notice that useful extra information is added to the actual
        docstring, e.g. function signatures are prepended to their docstrings.
        If you need the actual docstring, use ``raw=True`` instead.

        >>> print(script.infer(1, len('def f'))[0].docstring(raw=True))
        Document for function f.

        :param fast: Don't follow imports that are only one level deep like
            ``import foo``, but follow ``from foo import bar``. This makes
            sense for speed reasons. Completing `import a` is slow if you use
            the ``foo.docstring(fast=False)`` on every object, because it
            parses all libraries starting with ``a``.
        """
        if isinstance(self._name, ImportName) and fast:
            return ''
        doc = self._get_docstring()
        if raw:
            return doc

        signature_text = self._get_docstring_signature()
        if signature_text and doc:
            return signature_text + '\n\n' + doc
        else:
            return signature_text + doc

    def _get_docstring(self):
        return self._name.py__doc__()

    def _get_docstring_signature(self):
        return '\n'.join(
            signature.to_string()
            for signature in self._get_signatures(for_docstring=True)
        )

    @property
    def description(self):
        """
        A description of the :class:`.Name` object, which is heavily used
        in testing. e.g. for ``isinstance`` it returns ``def isinstance``.

        Example:

        >>> from jedi import Script
        >>> source = '''
        ... def f():
        ...     pass
        ...
        ... class C:
        ...     pass
        ...
        ... variable = f if random.choice([0,1]) else C'''
        >>> script = Script(source)  # line is maximum by default
        >>> defs = script.infer(column=3)
        >>> defs = sorted(defs, key=lambda d: d.line)
        >>> print(defs)  # doctest: +NORMALIZE_WHITESPACE
        [<Name full_name='__main__.f', description='def f'>,
         <Name full_name='__main__.C', description='class C'>]
        >>> str(defs[0].description)
        'def f'
        >>> str(defs[1].description)
        'class C'

        """
        typ = self.type
        tree_name = self._name.tree_name
        if typ == 'param':
            return typ + ' ' + self._name.to_string()
        if typ in ('function', 'class', 'module', 'instance') or tree_name is None:
            if typ == 'function':
                # For the description we want a short and a pythonic way.
                typ = 'def'
            return typ + ' ' + self._name.get_public_name()

        definition = tree_name.get_definition(include_setitem=True) or tree_name
        # Remove the prefix, because that's not what we want for get_code
        # here.
        txt = definition.get_code(include_prefix=False)
        # Delete comments:
        txt = re.sub(r'#[^\n]+\n', ' ', txt)
        # Delete multi spaces/newlines
        txt = re.sub(r'\s+', ' ', txt).strip()
        return txt

    @property
    def full_name(self):
        """
        Dot-separated path of this object.

        It is in the form of ``<module>[.<submodule>[...]][.<object>]``.
        It is useful when you want to look up Python manual of the
        object at hand.

        Example:

        >>> from jedi import Script
        >>> source = '''
        ... import os
        ... os.path.join'''
        >>> script = Script(source, path='example.py')
        >>> print(script.infer(3, len('os.path.join'))[0].full_name)
        os.path.join

        Notice that it returns ``'os.path.join'`` instead of (for example)
        ``'posixpath.join'``. This is not correct, since the modules name would
        be ``<module 'posixpath' ...>```. However most users find the latter
        more practical.
        """
        if not self._name.is_value_name:
            return None

        names = self._name.get_qualified_names(include_module_names=True)
        if names is None:
            return None

        names = list(names)
        try:
            names[0] = self._mapping[names[0]]
        except KeyError:
            pass

        return '.'.join(names)

    def is_stub(self):
        """
        Returns True if the current name is defined in a stub file.
        """
        if not self._name.is_value_name:
            return False

        return self._name.get_root_context().is_stub()

    def is_side_effect(self):
        """
        Checks if a name is defined as ``self.foo = 3``. In case of self, this
        function would return False, for foo it would return True.
        """
        tree_name = self._name.tree_name
        if tree_name is None:
            return False
        return tree_name.is_definition() and tree_name.parent.type == 'trailer'

    @debug.increase_indent_cm('goto on name')
    def goto(self, *, follow_imports=False, follow_builtin_imports=False,
             only_stubs=False, prefer_stubs=False):

        """
        Like :meth:`.Script.goto` (also supports the same params), but does it
        for the current name. This is typically useful if you are using
        something like :meth:`.Script.get_names()`.

        :param follow_imports: The goto call will follow imports.
        :param follow_builtin_imports: If follow_imports is True will try to
            look up names in builtins (i.e. compiled or extension modules).
        :param only_stubs: Only return stubs for this goto call.
        :param prefer_stubs: Prefer stubs to Python objects for this goto call.
        :rtype: list of :class:`Name`
        """
        if not self._name.is_value_name:
            return []

        names = self._name.goto()
        if follow_imports:
            names = filter_follow_imports(names, follow_builtin_imports)
        names = convert_names(
            names,
            only_stubs=only_stubs,
            prefer_stubs=prefer_stubs,
        )
        return [self if n == self._name else Name(self._inference_state, n)
                for n in names]

    @debug.increase_indent_cm('infer on name')
    def infer(self, *, only_stubs=False, prefer_stubs=False):
        """
        Like :meth:`.Script.infer`, it can be useful to understand which type
        the current name has.

        Return the actual definitions. I strongly recommend not using it for
        your completions, because it might slow down |jedi|. If you want to
        read only a few objects (<=20), it might be useful, especially to get
        the original docstrings. The basic problem of this function is that it
        follows all results. This means with 1000 completions (e.g.  numpy),
        it's just very, very slow.

        :param only_stubs: Only return stubs for this goto call.
        :param prefer_stubs: Prefer stubs to Python objects for this type
            inference call.
        :rtype: list of :class:`Name`
        """
        assert not (only_stubs and prefer_stubs)

        if not self._name.is_value_name:
            return []

        # First we need to make sure that we have stub names (if possible) that
        # we can follow. If we don't do that, we can end up with the inferred
        # results of Python objects instead of stubs.
        names = convert_names([self._name], prefer_stubs=True)
        values = convert_values(
            ValueSet.from_sets(n.infer() for n in names),
            only_stubs=only_stubs,
            prefer_stubs=prefer_stubs,
        )
        resulting_names = [c.name for c in values]
        return [self if n == self._name else Name(self._inference_state, n)
                for n in resulting_names]

    def parent(self):
        """
        Returns the parent scope of this identifier.

        :rtype: Name
        """
        if not self._name.is_value_name:
            return None

        if self.type in ('function', 'class', 'param') and self._name.tree_name is not None:
            # Since the parent_context doesn't really match what the user
            # thinks of that the parent is here, we do these cases separately.
            # The reason for this is the following:
            # - class: Nested classes parent_context is always the
            #   parent_context of the most outer one.
            # - function: Functions in classes have the module as
            #   parent_context.
            # - param: The parent_context of a param is not its function but
            #   e.g. the outer class or module.
            cls_or_func_node = self._name.tree_name.get_definition()
            parent = search_ancestor(cls_or_func_node, 'funcdef', 'classdef', 'file_input')
            context = self._get_module_context().create_value(parent).as_context()
        else:
            context = self._name.parent_context

        if context is None:
            return None
        while context.name is None:
            # Happens for comprehension contexts
            context = context.parent_context

        return Name(self._inference_state, context.name)

    def __repr__(self):
        return "<%s %sname=%r, description=%r>" % (
            self.__class__.__name__,
            'full_' if self.full_name else '',
            self.full_name or self.name,
            self.description,
        )

    def get_line_code(self, before=0, after=0):
        """
        Returns the line of code where this object was defined.

        :param before: Add n lines before the current line to the output.
        :param after: Add n lines after the current line to the output.

        :return str: Returns the line(s) of code or an empty string if it's a
                     builtin.
        """
        if not self._name.is_value_name:
            return ''

        lines = self._name.get_root_context().code_lines
        if lines is None:
            # Probably a builtin module, just ignore in that case.
            return ''

        index = self._name.start_pos[0] - 1
        start_index = max(index - before, 0)
        return ''.join(lines[start_index:index + after + 1])

    def _get_signatures(self, for_docstring=False):
        if self._name.api_type == 'property':
            return []
        if for_docstring and self._name.api_type == 'statement' and not self.is_stub():
            # For docstrings we don't resolve signatures if they are simple
            # statements and not stubs. This is a speed optimization.
            return []

        if isinstance(self._name, MixedName):
            # While this would eventually happen anyway, it's basically just a
            # shortcut to not infer anything tree related, because it's really
            # not necessary.
            return self._name.infer_compiled_value().get_signatures()

        names = convert_names([self._name], prefer_stubs=True)
        return [sig for name in names for sig in name.infer().get_signatures()]

    def get_signatures(self):
        """
        Returns all potential signatures for a function or a class. Multiple
        signatures are typical if you use Python stubs with ``@overload``.

        :rtype: list of :class:`BaseSignature`
        """
        return [
            BaseSignature(self._inference_state, s)
            for s in self._get_signatures()
        ]

    def execute(self):
        """
        Uses type inference to "execute" this identifier and returns the
        executed objects.

        :rtype: list of :class:`Name`
        """
        return _values_to_definitions(self._name.infer().execute_with_values())

    def get_type_hint(self):
        """
        Returns type hints like ``Iterable[int]`` or ``Union[int, str]``.

        This method might be quite slow, especially for functions. The problem
        is finding executions for those functions to return something like
        ``Callable[[int, str], str]``.

        :rtype: str
        """
        return self._name.infer().get_type_hint()


class Completion(BaseName):
    """
    ``Completion`` objects are returned from :meth:`.Script.complete`. They
    provide additional information about a completion.
    """
    def __init__(self, inference_state, name, stack, like_name_length,
                 is_fuzzy, cached_name=None):
        super().__init__(inference_state, name)

        self._like_name_length = like_name_length
        self._stack = stack
        self._is_fuzzy = is_fuzzy
        self._cached_name = cached_name

        # Completion objects with the same Completion name (which means
        # duplicate items in the completion)
        self._same_name_completions = []

    def _complete(self, like_name):
        append = ''
        if settings.add_bracket_after_function \
                and self.type == 'function':
            append = '('

        name = self._name.get_public_name()
        if like_name:
            name = name[self._like_name_length:]
        return name + append

    @property
    def complete(self):
        """
        Only works with non-fuzzy completions. Returns None if fuzzy
        completions are used.

        Return the rest of the word, e.g. completing ``isinstance``::

            isinstan# <-- Cursor is here

        would return the string 'ce'. It also adds additional stuff, depending
        on your ``settings.py``.

        Assuming the following function definition::

            def foo(param=0):
                pass

        completing ``foo(par`` would give a ``Completion`` which ``complete``
        would be ``am=``.
        """
        if self._is_fuzzy:
            return None
        return self._complete(True)

    @property
    def name_with_symbols(self):
        """
        Similar to :attr:`.name`, but like :attr:`.name` returns also the
        symbols, for example assuming the following function definition::

            def foo(param=0):
                pass

        completing ``foo(`` would give a ``Completion`` which
        ``name_with_symbols`` would be "param=".

        """
        return self._complete(False)

    def docstring(self, raw=False, fast=True):
        """
        Documented under :meth:`BaseName.docstring`.
        """
        if self._like_name_length >= 3:
            # In this case we can just resolve the like name, because we
            # wouldn't load like > 100 Python modules anymore.
            fast = False

        return super().docstring(raw=raw, fast=fast)

    def _get_docstring(self):
        if self._cached_name is not None:
            return completion_cache.get_docstring(
                self._cached_name,
                self._name.get_public_name(),
                lambda: self._get_cache()
            )
        return super()._get_docstring()

    def _get_docstring_signature(self):
        if self._cached_name is not None:
            return completion_cache.get_docstring_signature(
                self._cached_name,
                self._name.get_public_name(),
                lambda: self._get_cache()
            )
        return super()._get_docstring_signature()

    def _get_cache(self):
        return (
            super().type,
            super()._get_docstring_signature(),
            super()._get_docstring(),
        )

    @property
    def type(self):
        """
        Documented under :meth:`BaseName.type`.
        """
        # Purely a speed optimization.
        if self._cached_name is not None:
            return completion_cache.get_type(
                self._cached_name,
                self._name.get_public_name(),
                lambda: self._get_cache()
            )

        return super().type

    def get_completion_prefix_length(self):
        """
        Returns the length of the prefix being completed.
        For example, completing ``isinstance``::

            isinstan# <-- Cursor is here

        would return 8, because len('isinstan') == 8.

        Assuming the following function definition::

            def foo(param=0):
                pass

        completing ``foo(par`` would return 3.
        """
        return self._like_name_length

    def __repr__(self):
        return '<%s: %s>' % (type(self).__name__, self._name.get_public_name())


class Name(BaseName):
    """
    *Name* objects are returned from many different APIs including
    :meth:`.Script.goto` or :meth:`.Script.infer`.
    """
    def __init__(self, inference_state, definition):
        super().__init__(inference_state, definition)

    @memoize_method
    def defined_names(self):
        """
        List sub-definitions (e.g., methods in class).

        :rtype: list of :class:`Name`
        """
        defs = self._name.infer()
        return sorted(
            unite(defined_names(self._inference_state, d) for d in defs),
            key=lambda s: s._name.start_pos or (0, 0)
        )

    def is_definition(self):
        """
        Returns True, if defined as a name in a statement, function or class.
        Returns False, if it's a reference to such a definition.
        """
        if self._name.tree_name is None:
            return True
        else:
            return self._name.tree_name.is_definition()

    def __eq__(self, other):
        return self._name.start_pos == other._name.start_pos \
            and self.module_path == other.module_path \
            and self.name == other.name \
            and self._inference_state == other._inference_state

    def __ne__(self, other):
        return not self.__eq__(other)

    def __hash__(self):
        return hash((self._name.start_pos, self.module_path, self.name, self._inference_state))


class BaseSignature(Name):
    """
    These signatures are returned by :meth:`BaseName.get_signatures`
    calls.
    """
    def __init__(self, inference_state, signature):
        super().__init__(inference_state, signature.name)
        self._signature = signature

    @property
    def params(self):
        """
        Returns definitions for all parameters that a signature defines.
        This includes stuff like ``*args`` and ``**kwargs``.

        :rtype: list of :class:`.ParamName`
        """
        return [ParamName(self._inference_state, n)
                for n in self._signature.get_param_names(resolve_stars=True)]

    def to_string(self):
        """
        Returns a text representation of the signature. This could for example
        look like ``foo(bar, baz: int, **kwargs)``.

        :rtype: str
        """
        return self._signature.to_string()


class Signature(BaseSignature):
    """
    A full signature object is the return value of
    :meth:`.Script.get_signatures`.
    """
    def __init__(self, inference_state, signature, call_details):
        super().__init__(inference_state, signature)
        self._call_details = call_details
        self._signature = signature

    @property
    def index(self):
        """
        Returns the param index of the current cursor position.
        Returns None if the index cannot be found in the curent call.

        :rtype: int
        """
        return self._call_details.calculate_index(
            self._signature.get_param_names(resolve_stars=True)
        )

    @property
    def bracket_start(self):
        """
        Returns a line/column tuple of the bracket that is responsible for the
        last function call. The first line is 1 and the first column 0.

        :rtype: int, int
        """
        return self._call_details.bracket_leaf.start_pos

    def __repr__(self):
        return '<%s: index=%r %s>' % (
            type(self).__name__,
            self.index,
            self._signature.to_string(),
        )


class ParamName(Name):
    def infer_default(self):
        """
        Returns default values like the ``1`` of ``def foo(x=1):``.

        :rtype: list of :class:`.Name`
        """
        return _values_to_definitions(self._name.infer_default())

    def infer_annotation(self, **kwargs):
        """
        :param execute_annotation: Default True; If False, values are not
            executed and classes are returned instead of instances.
        :rtype: list of :class:`.Name`
        """
        return _values_to_definitions(self._name.infer_annotation(ignore_stars=True, **kwargs))

    def to_string(self):
        """
        Returns a simple representation of a param, like
        ``f: Callable[..., Any]``.

        :rtype: str
        """
        return self._name.to_string()

    @property
    def kind(self):
        """
        Returns an enum instance of :mod:`inspect`'s ``Parameter`` enum.

        :rtype: :py:attr:`inspect.Parameter.kind`
        """
        return self._name.get_kind()
