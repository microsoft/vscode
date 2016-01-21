"""
The :mod:`jedi.api.classes` module contains the return classes of the API.
These classes are the much bigger part of the whole API, because they contain
the interesting information about completion and goto operations.
"""
import warnings
from itertools import chain
import re

from jedi._compatibility import unicode, use_metaclass
from jedi import settings
from jedi import common
from jedi.parser import tree
from jedi.evaluate.cache import memoize_default, CachedMetaClass
from jedi.evaluate import representation as er
from jedi.evaluate import iterable
from jedi.evaluate import imports
from jedi.evaluate import compiled
from jedi.api import keywords
from jedi.evaluate.finder import filter_definition_names


def defined_names(evaluator, scope):
    """
    List sub-definitions (e.g., methods in class).

    :type scope: Scope
    :rtype: list of Definition
    """
    dct = scope.names_dict
    names = list(chain.from_iterable(dct.values()))
    names = filter_definition_names(names, scope)
    return [Definition(evaluator, d) for d in sorted(names, key=lambda s: s.start_pos)]


class BaseDefinition(object):
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
        '_sqlite3': 'sqlite3',
        '__builtin__': '',
        'builtins': '',
    }

    _tuple_mapping = dict((tuple(k.split('.')), v) for (k, v) in {
        'argparse._ActionsContainer': 'argparse.ArgumentParser',
        '_sre.SRE_Match': 're.MatchObject',
        '_sre.SRE_Pattern': 're.RegexObject',
    }.items())

    def __init__(self, evaluator, name):
        self._evaluator = evaluator
        self._name = name
        """
        An instance of :class:`jedi.parser.reprsentation.Name` subclass.
        """
        self._definition = evaluator.wrap(self._name.get_definition())
        self.is_keyword = isinstance(self._definition, keywords.Keyword)

        # generate a path to the definition
        self._module = name.get_parent_until()
        if self.in_builtin_module():
            self.module_path = None
        else:
            self.module_path = self._module.path
            """Shows the file path of a module. e.g. ``/usr/lib/python2.7/os.py``"""

    @property
    def name(self):
        """
        Name of variable/function/class/module.

        For example, for ``x = None`` it returns ``'x'``.

        :rtype: str or None
        """
        return unicode(self._name)

    @property
    def start_pos(self):
        """
        .. deprecated:: 0.7.0
           Use :attr:`.line` and :attr:`.column` instead.
        .. todo:: Remove!
        """
        warnings.warn("Use line/column instead.", DeprecationWarning)
        return self._name.start_pos

    @property
    def type(self):
        """
        The type of the definition.

        Here is an example of the value of this attribute.  Let's consider
        the following source.  As what is in ``variable`` is unambiguous
        to Jedi, :meth:`jedi.Script.goto_definitions` should return a list of
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
        >>> defs = script.goto_definitions()

        Before showing what is in ``defs``, let's sort it by :attr:`line`
        so that it is easy to relate the result to the source code.

        >>> defs = sorted(defs, key=lambda d: d.line)
        >>> defs                           # doctest: +NORMALIZE_WHITESPACE
        [<Definition module keyword>, <Definition class C>,
         <Definition class D>, <Definition def f>]

        Finally, here is what you can get from :attr:`type`:

        >>> defs[0].type
        'module'
        >>> defs[1].type
        'class'
        >>> defs[2].type
        'instance'
        >>> defs[3].type
        'function'

        """
        stripped = self._definition
        if isinstance(stripped, er.InstanceElement):
            stripped = stripped.var

        if isinstance(stripped, compiled.CompiledObject):
            return stripped.api_type()
        elif isinstance(stripped, iterable.Array):
            return 'instance'
        elif isinstance(stripped, tree.Import):
            return 'import'

        string = type(stripped).__name__.lower().replace('wrapper', '')
        if string == 'exprstmt':
            return 'statement'
        else:
            return string

    def _path(self):
        """The path to a module/class/function definition."""
        path = []
        par = self._definition
        while par is not None:
            if isinstance(par, tree.Import):
                path += imports.ImportWrapper(self._evaluator, self._name).import_path
                break
            try:
                name = par.name
            except AttributeError:
                pass
            else:
                if isinstance(par, er.ModuleWrapper):
                    # TODO just make the path dotted from the beginning, we
                    # shouldn't really split here.
                    path[0:0] = par.py__name__().split('.')
                    break
                else:
                    path.insert(0, unicode(name))
            par = par.parent
        return path

    @property
    def module_name(self):
        """
        The module name.

        >>> from jedi import Script
        >>> source = 'import json'
        >>> script = Script(source, path='example.py')
        >>> d = script.goto_definitions()[0]
        >>> print(d.module_name)                       # doctest: +ELLIPSIS
        json
        """
        return str(self._module.name)

    def in_builtin_module(self):
        """Whether this is a builtin module."""
        return isinstance(self._module, compiled.CompiledObject)

    @property
    def line(self):
        """The line where the definition occurs (starting with 1)."""
        if self.in_builtin_module():
            return None
        return self._name.start_pos[0]

    @property
    def column(self):
        """The column where the definition occurs (starting with 0)."""
        if self.in_builtin_module():
            return None
        return self._name.start_pos[1]

    def docstring(self, raw=False):
        r"""
        Return a document string for this completion object.

        Example:

        >>> from jedi import Script
        >>> source = '''\
        ... def f(a, b=1):
        ...     "Document for function f."
        ... '''
        >>> script = Script(source, 1, len('def f'), 'example.py')
        >>> doc = script.goto_definitions()[0].docstring()
        >>> print(doc)
        f(a, b=1)
        <BLANKLINE>
        Document for function f.

        Notice that useful extra information is added to the actual
        docstring.  For function, it is call signature.  If you need
        actual docstring, use ``raw=True`` instead.

        >>> print(script.goto_definitions()[0].docstring(raw=True))
        Document for function f.

        """
        if raw:
            return _Help(self._definition).raw()
        else:
            return _Help(self._definition).full()

    @property
    def doc(self):
        """
        .. deprecated:: 0.8.0
           Use :meth:`.docstring` instead.
        .. todo:: Remove!
        """
        warnings.warn("Use docstring() instead.", DeprecationWarning)
        return self.docstring()

    @property
    def raw_doc(self):
        """
        .. deprecated:: 0.8.0
           Use :meth:`.docstring` instead.
        .. todo:: Remove!
        """
        warnings.warn("Use docstring() instead.", DeprecationWarning)
        return self.docstring(raw=True)

    @property
    def description(self):
        """A textual description of the object."""
        return unicode(self._name)

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
        >>> script = Script(source, 3, len('os.path.join'), 'example.py')
        >>> print(script.goto_definitions()[0].full_name)
        os.path.join

        Notice that it correctly returns ``'os.path.join'`` instead of
        (for example) ``'posixpath.join'``.

        """
        path = [unicode(p) for p in self._path()]
        # TODO add further checks, the mapping should only occur on stdlib.
        if not path:
            return None  # for keywords the path is empty

        with common.ignored(KeyError):
            path[0] = self._mapping[path[0]]
        for key, repl in self._tuple_mapping.items():
            if tuple(path[:len(key)]) == key:
                path = [repl] + path[len(key):]

        return '.'.join(path if path[0] else path[1:])

    def goto_assignments(self):
        defs = self._evaluator.goto(self._name)
        return [Definition(self._evaluator, d) for d in defs]

    @memoize_default()
    def _follow_statements_imports(self):
        """
        Follow both statements and imports, as far as possible.
        """
        if self._definition.isinstance(tree.ExprStmt):
            return self._evaluator.eval_statement(self._definition)
        elif self._definition.isinstance(tree.Import):
            return imports.ImportWrapper(self._evaluator, self._name).follow()
        else:
            return [self._definition]

    @property
    @memoize_default()
    def params(self):
        """
        Raises an ``AttributeError``if the definition is not callable.
        Otherwise returns a list of `Definition` that represents the params.
        """
        followed = self._follow_statements_imports()
        if not followed or not hasattr(followed[0], 'py__call__'):
            raise AttributeError()
        followed = followed[0]  # only check the first one.

        if followed.type == 'funcdef':
            if isinstance(followed, er.InstanceElement):
                params = followed.params[1:]
            else:
                params = followed.params
        elif followed.isinstance(er.compiled.CompiledObject):
            params = followed.params
        else:
            try:
                sub = followed.get_subscope_by_name('__init__')
                params = sub.params[1:]  # ignore self
            except KeyError:
                return []
        return [_Param(self._evaluator, p.name) for p in params]

    def parent(self):
        scope = self._definition.get_parent_scope()
        scope = self._evaluator.wrap(scope)
        return Definition(self._evaluator, scope.name)

    def __repr__(self):
        return "<%s %s>" % (type(self).__name__, self.description)


class Completion(BaseDefinition):
    """
    `Completion` objects are returned from :meth:`api.Script.completions`. They
    provide additional information about a completion.
    """
    def __init__(self, evaluator, name, needs_dot, like_name_length):
        super(Completion, self).__init__(evaluator, name)

        self._needs_dot = needs_dot
        self._like_name_length = like_name_length

        # Completion objects with the same Completion name (which means
        # duplicate items in the completion)
        self._same_name_completions = []

    def _complete(self, like_name):
        dot = '.' if self._needs_dot else ''
        append = ''
        if settings.add_bracket_after_function \
                and self.type == 'Function':
            append = '('

        if settings.add_dot_after_module:
            if isinstance(self._definition, tree.Module):
                append += '.'
        if isinstance(self._definition, tree.Param):
            append += '='

        name = str(self._name)
        if like_name:
            name = name[self._like_name_length:]
        return dot + name + append

    @property
    def complete(self):
        """
        Return the rest of the word, e.g. completing ``isinstance``::

            isinstan# <-- Cursor is here

        would return the string 'ce'. It also adds additional stuff, depending
        on your `settings.py`.
        """
        return self._complete(True)

    @property
    def name_with_symbols(self):
        """
        Similar to :attr:`name`, but like :attr:`name`
        returns also the symbols, for example::

            list()

        would return ``.append`` and others (which means it adds a dot).
        """
        return self._complete(False)

    @property
    def description(self):
        """Provide a description of the completion object."""
        if self._definition is None:
            return ''
        t = self.type
        if t == 'statement' or t == 'import':
            desc = self._definition.get_code()
        else:
            desc = '.'.join(unicode(p) for p in self._path())

        line = '' if self.in_builtin_module else '@%s' % self.line
        return '%s: %s%s' % (t, desc, line)

    def __repr__(self):
        return '<%s: %s>' % (type(self).__name__, self._name)

    def docstring(self, raw=False, fast=True):
        """
        :param fast: Don't follow imports that are only one level deep like
            ``import foo``, but follow ``from foo import bar``. This makes
            sense for speed reasons. Completing `import a` is slow if you use
            the ``foo.docstring(fast=False)`` on every object, because it
            parses all libraries starting with ``a``.
        """
        definition = self._definition
        if isinstance(definition, tree.Import):
            i = imports.ImportWrapper(self._evaluator, self._name)
            if len(i.import_path) > 1 or not fast:
                followed = self._follow_statements_imports()
                if followed:
                    # TODO: Use all of the followed objects as input to Documentation.
                    definition = followed[0]

        if raw:
            return _Help(definition).raw()
        else:
            return _Help(definition).full()

    @property
    def type(self):
        """
        The type of the completion objects. Follows imports. For a further
        description, look at :attr:`jedi.api.classes.BaseDefinition.type`.
        """
        if isinstance(self._definition, tree.Import):
            i = imports.ImportWrapper(self._evaluator, self._name)
            if len(i.import_path) <= 1:
                return 'module'

            followed = self.follow_definition()
            if followed:
                # Caveat: Only follows the first one, ignore the other ones.
                # This is ok, since people are almost never interested in
                # variations.
                return followed[0].type
        return super(Completion, self).type

    @memoize_default()
    def _follow_statements_imports(self):
        # imports completion is very complicated and needs to be treated
        # separately in Completion.
        definition = self._definition
        if definition.isinstance(tree.Import):
            i = imports.ImportWrapper(self._evaluator, self._name)
            return i.follow()
        return super(Completion, self)._follow_statements_imports()

    @memoize_default()
    def follow_definition(self):
        """
        Return the original definitions. I strongly recommend not using it for
        your completions, because it might slow down |jedi|. If you want to
        read only a few objects (<=20), it might be useful, especially to get
        the original docstrings. The basic problem of this function is that it
        follows all results. This means with 1000 completions (e.g.  numpy),
        it's just PITA-slow.
        """
        defs = self._follow_statements_imports()
        return [Definition(self._evaluator, d.name) for d in defs]


class Definition(use_metaclass(CachedMetaClass, BaseDefinition)):
    """
    *Definition* objects are returned from :meth:`api.Script.goto_assignments`
    or :meth:`api.Script.goto_definitions`.
    """
    def __init__(self, evaluator, definition):
        super(Definition, self).__init__(evaluator, definition)

    @property
    def description(self):
        """
        A description of the :class:`.Definition` object, which is heavily used
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
        >>> script = Script(source, column=3)  # line is maximum by default
        >>> defs = script.goto_definitions()
        >>> defs = sorted(defs, key=lambda d: d.line)
        >>> defs
        [<Definition def f>, <Definition class C>]
        >>> str(defs[0].description)  # strip literals in python2
        'def f'
        >>> str(defs[1].description)
        'class C'

        """
        d = self._definition
        if isinstance(d, er.InstanceElement):
            d = d.var

        if isinstance(d, compiled.CompiledObject):
            typ = d.api_type()
            if typ == 'instance':
                typ = 'class'  # The description should be similar to Py objects.
            d = typ + ' ' + d.name.get_code()
        elif isinstance(d, iterable.Array):
            d = 'class ' + d.type
        elif isinstance(d, (tree.Class, er.Class, er.Instance)):
            d = 'class ' + unicode(d.name)
        elif isinstance(d, (er.Function, tree.Function)):
            d = 'def ' + unicode(d.name)
        elif isinstance(d, tree.Module):
            # only show module name
            d = 'module %s' % self.module_name
        elif isinstance(d, tree.Param):
            d = d.get_code().strip()
            if d.endswith(','):
                d = d[:-1]  # Remove the comma.
        else:  # ExprStmt
            try:
                first_leaf = d.first_leaf()
            except AttributeError:
                # `d` is already a Leaf (Name).
                first_leaf = d
            # Remove the prefix, because that's not what we want for get_code
            # here.
            old, first_leaf.prefix = first_leaf.prefix, ''
            try:
                d = d.get_code()
            finally:
                first_leaf.prefix = old
        # Delete comments:
        d = re.sub('#[^\n]+\n', ' ', d)
        # Delete multi spaces/newlines
        return re.sub('\s+', ' ', d).strip()

    @property
    def desc_with_module(self):
        """
        In addition to the definition, also return the module.

        .. warning:: Don't use this function yet, its behaviour may change. If
            you really need it, talk to me.

        .. todo:: Add full path. This function is should return a
            `module.class.function` path.
        """
        position = '' if self.in_builtin_module else '@%s' % (self.line)
        return "%s:%s%s" % (self.module_name, self.description, position)

    @memoize_default()
    def defined_names(self):
        """
        List sub-definitions (e.g., methods in class).

        :rtype: list of Definition
        """
        defs = self._follow_statements_imports()
        # For now we don't want base classes or evaluate decorators.
        defs = [d.base if isinstance(d, (er.Class, er.Function)) else d for d in defs]
        iterable = (defined_names(self._evaluator, d) for d in defs)
        iterable = list(iterable)
        return list(chain.from_iterable(iterable))

    def is_definition(self):
        """
        Returns True, if defined as a name in a statement, function or class.
        Returns False, if it's a reference to such a definition.
        """
        return self._name.is_definition()

    def __eq__(self, other):
        return self._name.start_pos == other._name.start_pos \
            and self.module_path == other.module_path \
            and self.name == other.name \
            and self._evaluator == other._evaluator

    def __ne__(self, other):
        return not self.__eq__(other)

    def __hash__(self):
        return hash((self._name.start_pos, self.module_path, self.name, self._evaluator))


class CallSignature(Definition):
    """
    `CallSignature` objects is the return value of `Script.function_definition`.
    It knows what functions you are currently in. e.g. `isinstance(` would
    return the `isinstance` function. without `(` it would return nothing.
    """
    def __init__(self, evaluator, executable_name, call_stmt, index, key_name):
        super(CallSignature, self).__init__(evaluator, executable_name)
        self._index = index
        self._key_name = key_name
        self._call_stmt = call_stmt

    @property
    def index(self):
        """
        The Param index of the current call.
        Returns None if the index cannot be found in the curent call.
        """
        if self._key_name is not None:
            for i, param in enumerate(self.params):
                if self._key_name == param.name:
                    return i
            if self.params and self.params[-1]._name.get_definition().stars == 2:
                return i
            else:
                return None

        if self._index >= len(self.params):

            for i, param in enumerate(self.params):
                # *args case
                if param._name.get_definition().stars == 1:
                    return i
            return None
        return self._index

    @property
    def bracket_start(self):
        """
        The indent of the bracket that is responsible for the last function
        call.
        """
        return self._call_stmt.end_pos

    @property
    def call_name(self):
        """
        .. deprecated:: 0.8.0
           Use :attr:`.name` instead.
        .. todo:: Remove!

        The name (e.g. 'isinstance') as a string.
        """
        warnings.warn("Use name instead.", DeprecationWarning)
        return unicode(self.name)

    @property
    def module(self):
        """
        .. deprecated:: 0.8.0
           Use :attr:`.module_name` for the module name.
        .. todo:: Remove!
        """
        return self._executable.get_parent_until()

    def __repr__(self):
        return '<%s: %s index %s>' % (type(self).__name__, self._name,
                                      self.index)


class _Param(Definition):
    """
    Just here for backwards compatibility.
    """
    def get_code(self):
        """
        .. deprecated:: 0.8.0
           Use :attr:`.description` and :attr:`.name` instead.
        .. todo:: Remove!

        A function to get the whole code of the param.
        """
        warnings.warn("Use description instead.", DeprecationWarning)
        return self.description


class _Help(object):
    """
    Temporary implementation, will be used as `Script.help() or something in
    the future.
    """
    def __init__(self, definition):
        self._name = definition

    def full(self):
        try:
            return self._name.doc
        except AttributeError:
            return self.raw()

    def raw(self):
        """
        The raw docstring ``__doc__`` for any object.

        See :attr:`doc` for example.
        """
        try:
            return self._name.raw_doc
        except AttributeError:
            return ''
