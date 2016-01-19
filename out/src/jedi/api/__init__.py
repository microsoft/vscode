"""
The API basically only provides one class. You can create a :class:`Script` and
use its methods.

Additionally you can add a debug function with :func:`set_debug_function`.

.. warning:: Please, note that Jedi is **not thread safe**.
"""
import re
import os
import warnings
import sys
from itertools import chain

from jedi._compatibility import unicode, builtins
from jedi.parser import Parser, load_grammar
from jedi.parser.tokenize import source_tokens
from jedi.parser import tree
from jedi.parser.user_context import UserContext, UserContextParser
from jedi import debug
from jedi import settings
from jedi import common
from jedi import cache
from jedi.api import keywords
from jedi.api import classes
from jedi.api import interpreter
from jedi.api import usages
from jedi.api import helpers
from jedi.evaluate import Evaluator
from jedi.evaluate import representation as er
from jedi.evaluate import compiled
from jedi.evaluate import imports
from jedi.evaluate.cache import memoize_default
from jedi.evaluate.helpers import FakeName, get_module_names
from jedi.evaluate.finder import global_names_dict_generator, filter_definition_names
from jedi.evaluate import analysis

# Jedi uses lots and lots of recursion. By setting this a little bit higher, we
# can remove some "maximum recursion depth" errors.
sys.setrecursionlimit(2000)


class NotFoundError(Exception):
    """A custom error to avoid catching the wrong exceptions.

    .. deprecated:: 0.9.0
       Not in use anymore, Jedi just returns no goto result if you're not on a
       valid name.
    .. todo:: Remove!
    """


class Script(object):
    """
    A Script is the base for completions, goto or whatever you want to do with
    |jedi|.

    You can either use the ``source`` parameter or ``path`` to read a file.
    Usually you're going to want to use both of them (in an editor).

    :param source: The source code of the current file, separated by newlines.
    :type source: str
    :param line: The line to perform actions on (starting with 1).
    :type line: int
    :param column: The column of the cursor (starting with 0).
    :type column: int
    :param path: The path of the file in the file system, or ``''`` if
        it hasn't been saved yet.
    :type path: str or None
    :param encoding: The encoding of ``source``, if it is not a
        ``unicode`` object (default ``'utf-8'``).
    :type encoding: str
    :param source_encoding: The encoding of ``source``, if it is not a
        ``unicode`` object (default ``'utf-8'``).
    :type encoding: str
    """
    def __init__(self, source=None, line=None, column=None, path=None,
                 encoding='utf-8', source_path=None, source_encoding=None):
        if source_path is not None:
            warnings.warn("Use path instead of source_path.", DeprecationWarning)
            path = source_path
        if source_encoding is not None:
            warnings.warn("Use encoding instead of source_encoding.", DeprecationWarning)
            encoding = source_encoding

        self._orig_path = path
        self.path = None if path is None else os.path.abspath(path)

        if source is None:
            with open(path) as f:
                source = f.read()

        self.source = common.source_to_unicode(source, encoding)
        lines = common.splitlines(self.source)
        line = max(len(lines), 1) if line is None else line
        if not (0 < line <= len(lines)):
            raise ValueError('`line` parameter is not in a valid range.')

        line_len = len(lines[line - 1])
        column = line_len if column is None else column
        if not (0 <= column <= line_len):
            raise ValueError('`column` parameter is not in a valid range.')
        self._pos = line, column

        cache.clear_time_caches()
        debug.reset_time()
        self._grammar = load_grammar('grammar%s.%s' % sys.version_info[:2])
        self._user_context = UserContext(self.source, self._pos)
        self._parser = UserContextParser(self._grammar, self.source, path,
                                         self._pos, self._user_context,
                                         self._parsed_callback)
        self._evaluator = Evaluator(self._grammar)
        debug.speed('init')

    def _parsed_callback(self, parser):
        module = self._evaluator.wrap(parser.module)
        imports.add_module(self._evaluator, unicode(module.name), module)

    @property
    def source_path(self):
        """
        .. deprecated:: 0.7.0
           Use :attr:`.path` instead.
        .. todo:: Remove!
        """
        warnings.warn("Use path instead of source_path.", DeprecationWarning)
        return self.path

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, repr(self._orig_path))

    def completions(self):
        """
        Return :class:`classes.Completion` objects. Those objects contain
        information about the completions, more than just names.

        :return: Completion objects, sorted by name and __ comes last.
        :rtype: list of :class:`classes.Completion`
        """
        def get_completions(user_stmt, bs):
            # TODO this closure is ugly. it also doesn't work with
            # simple_complete (used for Interpreter), somehow redo.
            module = self._evaluator.wrap(self._parser.module())
            names, level, only_modules, unfinished_dotted = \
                helpers.check_error_statements(module, self._pos)
            completion_names = []
            if names is not None:
                imp_names = tuple(str(n) for n in names if n.end_pos < self._pos)
                i = imports.Importer(self._evaluator, imp_names, module, level)
                completion_names = i.completion_names(self._evaluator, only_modules)

            # TODO this paragraph is necessary, but not sure it works.
            context = self._user_context.get_context()
            if not next(context).startswith('.'):  # skip the path
                if next(context) == 'from':
                    # completion is just "import" if before stands from ..
                    if unfinished_dotted:
                        return completion_names
                    else:
                        return set([keywords.keyword('import').name])

            if isinstance(user_stmt, tree.Import):
                module = self._parser.module()
                completion_names += imports.completion_names(self._evaluator,
                                                             user_stmt, self._pos)
                return completion_names

            if names is None and not isinstance(user_stmt, tree.Import):
                if not path and not dot:
                    # add keywords
                    completion_names += keywords.completion_names(
                        self._evaluator,
                        user_stmt,
                        self._pos,
                        module)
                    # TODO delete? We should search for valid parser
                    # transformations.
                completion_names += self._simple_complete(path, dot, like)
            return completion_names

        debug.speed('completions start')
        path = self._user_context.get_path_until_cursor()
        # Dots following an int are not the start of a completion but a float
        # literal.
        if re.search(r'^\d\.$', path):
            return []
        path, dot, like = helpers.completion_parts(path)

        user_stmt = self._parser.user_stmt_with_whitespace()

        b = compiled.builtin
        completion_names = get_completions(user_stmt, b)

        if not dot:
            # add named params
            for call_sig in self.call_signatures():
                # Allow protected access, because it's a public API.
                module = call_sig._name.get_parent_until()
                # Compiled modules typically don't allow keyword arguments.
                if not isinstance(module, compiled.CompiledObject):
                    for p in call_sig.params:
                        # Allow access on _definition here, because it's a
                        # public API and we don't want to make the internal
                        # Name object public.
                        if p._definition.stars == 0:  # no *args/**kwargs
                            completion_names.append(p._name)

        needs_dot = not dot and path

        comps = []
        comp_dct = {}
        for c in set(completion_names):
            n = str(c)
            if settings.case_insensitive_completion \
                    and n.lower().startswith(like.lower()) \
                    or n.startswith(like):
                if isinstance(c.parent, (tree.Function, tree.Class)):
                    # TODO I think this is a hack. It should be an
                    #   er.Function/er.Class before that.
                    c = self._evaluator.wrap(c.parent).name
                new = classes.Completion(self._evaluator, c, needs_dot, len(like))
                k = (new.name, new.complete)  # key
                if k in comp_dct and settings.no_completion_duplicates:
                    comp_dct[k]._same_name_completions.append(new)
                else:
                    comp_dct[k] = new
                    comps.append(new)

        debug.speed('completions end')

        return sorted(comps, key=lambda x: (x.name.startswith('__'),
                                            x.name.startswith('_'),
                                            x.name.lower()))

    def _simple_complete(self, path, dot, like):
        if not path and not dot:
            scope = self._parser.user_scope()
            if not scope.is_scope():  # Might be a flow (if/while/etc).
                scope = scope.get_parent_scope()
            names_dicts = global_names_dict_generator(
                self._evaluator,
                self._evaluator.wrap(scope),
                self._pos
            )
            completion_names = []
            for names_dict, pos in names_dicts:
                names = list(chain.from_iterable(names_dict.values()))
                if not names:
                    continue
                completion_names += filter_definition_names(names, self._parser.user_stmt(), pos)
        elif self._get_under_cursor_stmt(path) is None:
            return []
        else:
            scopes = list(self._prepare_goto(path, True))
            completion_names = []
            debug.dbg('possible completion scopes: %s', scopes)
            for s in scopes:
                names = []
                for names_dict in s.names_dicts(search_global=False):
                    names += chain.from_iterable(names_dict.values())

                completion_names += filter_definition_names(names, self._parser.user_stmt())
        return completion_names

    def _prepare_goto(self, goto_path, is_completion=False):
        """
        Base for completions/goto. Basically it returns the resolved scopes
        under cursor.
        """
        debug.dbg('start: %s in %s', goto_path, self._parser.user_scope())

        user_stmt = self._parser.user_stmt_with_whitespace()
        if not user_stmt and len(goto_path.split('\n')) > 1:
            # If the user_stmt is not defined and the goto_path is multi line,
            # something's strange. Most probably the backwards tokenizer
            # matched to much.
            return []

        if isinstance(user_stmt, tree.Import):
            i, _ = helpers.get_on_import_stmt(self._evaluator, self._user_context,
                                              user_stmt, is_completion)
            if i is None:
                return []
            scopes = [i]
        else:
            # just parse one statement, take it and evaluate it
            eval_stmt = self._get_under_cursor_stmt(goto_path)
            if eval_stmt is None:
                return []

            module = self._evaluator.wrap(self._parser.module())
            names, level, _, _ = helpers.check_error_statements(module, self._pos)
            if names:
                names = [str(n) for n in names]
                i = imports.Importer(self._evaluator, names, module, level)
                return i.follow()

            scopes = self._evaluator.eval_element(eval_stmt)

        return scopes

    @memoize_default()
    def _get_under_cursor_stmt(self, cursor_txt, start_pos=None):
        tokenizer = source_tokens(cursor_txt)
        r = Parser(self._grammar, cursor_txt, tokenizer=tokenizer)
        try:
            # Take the last statement available that is not an endmarker.
            # And because it's a simple_stmt, we need to get the first child.
            stmt = r.module.children[-2].children[0]
        except (AttributeError, IndexError):
            return None

        user_stmt = self._parser.user_stmt()
        if user_stmt is None:
            # Set the start_pos to a pseudo position, that doesn't exist but
            # works perfectly well (for both completions in docstrings and
            # statements).
            pos = start_pos or self._pos
        else:
            pos = user_stmt.start_pos

        stmt.move(pos[0] - 1, pos[1])  # Moving the offset.
        stmt.parent = self._parser.user_scope()
        return stmt

    def goto_definitions(self):
        """
        Return the definitions of a the path under the cursor.  goto function!
        This follows complicated paths and returns the end, not the first
        definition. The big difference between :meth:`goto_assignments` and
        :meth:`goto_definitions` is that :meth:`goto_assignments` doesn't
        follow imports and statements. Multiple objects may be returned,
        because Python itself is a dynamic language, which means depending on
        an option you can have two different versions of a function.

        :rtype: list of :class:`classes.Definition`
        """
        def resolve_import_paths(scopes):
            for s in scopes.copy():
                if isinstance(s, imports.ImportWrapper):
                    scopes.remove(s)
                    scopes.update(resolve_import_paths(set(s.follow())))
            return scopes

        goto_path = self._user_context.get_path_under_cursor()
        context = self._user_context.get_context()
        definitions = set()
        if next(context) in ('class', 'def'):
            definitions = set([self._evaluator.wrap(self._parser.user_scope())])
        else:
            # Fetch definition of callee, if there's no path otherwise.
            if not goto_path:
                definitions = set(signature._definition
                                  for signature in self.call_signatures())

        if re.match('\w[\w\d_]*$', goto_path) and not definitions:
            user_stmt = self._parser.user_stmt()
            if user_stmt is not None and user_stmt.type == 'expr_stmt':
                for name in user_stmt.get_defined_names():
                    if name.start_pos <= self._pos <= name.end_pos:
                        # TODO scaning for a name and then using it should be
                        # the default.
                        definitions = set(self._evaluator.goto_definition(name))

        if not definitions and goto_path:
            definitions = set(self._prepare_goto(goto_path))

        definitions = resolve_import_paths(definitions)
        names = [s.name for s in definitions]
        defs = [classes.Definition(self._evaluator, name) for name in names]
        return helpers.sorted_definitions(set(defs))

    def goto_assignments(self):
        """
        Return the first definition found. Imports and statements aren't
        followed. Multiple objects may be returned, because Python itself is a
        dynamic language, which means depending on an option you can have two
        different versions of a function.

        :rtype: list of :class:`classes.Definition`
        """
        results = self._goto()
        d = [classes.Definition(self._evaluator, d) for d in set(results)]
        return helpers.sorted_definitions(d)

    def _goto(self, add_import_name=False):
        """
        Used for goto_assignments and usages.

        :param add_import_name: Add the the name (if import) to the result.
        """
        def follow_inexistent_imports(defs):
            """ Imports can be generated, e.g. following
            `multiprocessing.dummy` generates an import dummy in the
            multiprocessing module. The Import doesn't exist -> follow.
            """
            definitions = set(defs)
            for d in defs:
                if isinstance(d.parent, tree.Import) \
                        and d.start_pos == (0, 0):
                    i = imports.ImportWrapper(self._evaluator, d.parent).follow(is_goto=True)
                    definitions.remove(d)
                    definitions |= follow_inexistent_imports(i)
            return definitions

        goto_path = self._user_context.get_path_under_cursor()
        context = self._user_context.get_context()
        user_stmt = self._parser.user_stmt()
        user_scope = self._parser.user_scope()

        stmt = self._get_under_cursor_stmt(goto_path)
        if stmt is None:
            return []

        if user_scope is None:
            last_name = None
        else:
            # Try to use the parser if possible.
            last_name = user_scope.name_for_position(self._pos)

        if last_name is None:
            last_name = stmt
            while not isinstance(last_name, tree.Name):
                try:
                    last_name = last_name.children[-1]
                except AttributeError:
                    # Doesn't have a name in it.
                    return []

        if next(context) in ('class', 'def'):
            # The cursor is on a class/function name.
            user_scope = self._parser.user_scope()
            definitions = set([user_scope.name])
        elif isinstance(user_stmt, tree.Import):
            s, name = helpers.get_on_import_stmt(self._evaluator,
                                                 self._user_context, user_stmt)

            definitions = self._evaluator.goto(name)
        else:
            # The Evaluator.goto function checks for definitions, but since we
            # use a reverse tokenizer, we have new name_part objects, so we
            # have to check the user_stmt here for positions.
            if isinstance(user_stmt, tree.ExprStmt) \
                    and isinstance(last_name.parent, tree.ExprStmt):
                for name in user_stmt.get_defined_names():
                    if name.start_pos <= self._pos <= name.end_pos:
                        return [name]

            defs = self._evaluator.goto(last_name)
            definitions = follow_inexistent_imports(defs)
        return definitions

    def usages(self, additional_module_paths=()):
        """
        Return :class:`classes.Definition` objects, which contain all
        names that point to the definition of the name under the cursor. This
        is very useful for refactoring (renaming), or to show all usages of a
        variable.

        .. todo:: Implement additional_module_paths

        :rtype: list of :class:`classes.Definition`
        """
        temp, settings.dynamic_flow_information = \
            settings.dynamic_flow_information, False
        try:
            user_stmt = self._parser.user_stmt()
            definitions = self._goto(add_import_name=True)
            if not definitions and isinstance(user_stmt, tree.Import):
                # For not defined imports (goto doesn't find something, we take
                # the name as a definition. This is enough, because every name
                # points to it.
                name = user_stmt.name_for_position(self._pos)
                if name is None:
                    # Must be syntax
                    return []
                definitions = [name]

            if not definitions:
                # Without a definition for a name we cannot find references.
                return []

            if not isinstance(user_stmt, tree.Import):
                # import case is looked at with add_import_name option
                definitions = usages.usages_add_import_modules(self._evaluator,
                                                               definitions)

            module = set([d.get_parent_until() for d in definitions])
            module.add(self._parser.module())
            names = usages.usages(self._evaluator, definitions, module)

            for d in set(definitions):
                names.append(classes.Definition(self._evaluator, d))
        finally:
            settings.dynamic_flow_information = temp

        return helpers.sorted_definitions(set(names))

    def call_signatures(self):
        """
        Return the function object of the call you're currently in.

        E.g. if the cursor is here::

            abs(# <-- cursor is here

        This would return the ``abs`` function. On the other hand::

            abs()# <-- cursor is here

        This would return ``None``.

        :rtype: list of :class:`classes.CallSignature`
        """
        call_txt, call_index, key_name, start_pos = self._user_context.call_signature()
        if call_txt is None:
            return []

        stmt = self._get_under_cursor_stmt(call_txt, start_pos)
        if stmt is None:
            return []

        with common.scale_speed_settings(settings.scale_call_signatures):
            origins = cache.cache_call_signatures(self._evaluator, stmt,
                                                  self.source, self._pos)
        debug.speed('func_call followed')

        return [classes.CallSignature(self._evaluator, o.name, stmt, call_index, key_name)
                for o in origins if hasattr(o, 'py__call__')]

    def _analysis(self):
        def check_types(types):
            for typ in types:
                try:
                    f = typ.iter_content
                except AttributeError:
                    pass
                else:
                    check_types(f())

        #statements = set(chain(*self._parser.module().used_names.values()))
        nodes, imp_names, decorated_funcs = \
            analysis.get_module_statements(self._parser.module())
        # Sort the statements so that the results are reproducible.
        for n in imp_names:
            imports.ImportWrapper(self._evaluator, n).follow()
        for node in sorted(nodes, key=lambda obj: obj.start_pos):
            check_types(self._evaluator.eval_element(node))

        for dec_func in decorated_funcs:
            er.Function(self._evaluator, dec_func).get_decorated_func()

        ana = [a for a in self._evaluator.analysis if self.path == a.path]
        return sorted(set(ana), key=lambda x: x.line)


class Interpreter(Script):
    """
    Jedi API for Python REPLs.

    In addition to completion of simple attribute access, Jedi
    supports code completion based on static code analysis.
    Jedi can complete attributes of object which is not initialized
    yet.

    >>> from os.path import join
    >>> namespace = locals()
    >>> script = Interpreter('join().up', [namespace])
    >>> print(script.completions()[0].name)
    upper
    """

    def __init__(self, source, namespaces, **kwds):
        """
        Parse `source` and mixin interpreted Python objects from `namespaces`.

        :type source: str
        :arg  source: Code to parse.
        :type namespaces: list of dict
        :arg  namespaces: a list of namespace dictionaries such as the one
                          returned by :func:`locals`.

        Other optional arguments are same as the ones for :class:`Script`.
        If `line` and `column` are None, they are assumed be at the end of
        `source`.
        """
        if type(namespaces) is not list or len(namespaces) == 0 or \
           any([type(x) is not dict for x in namespaces]):
            raise TypeError("namespaces must be a non-empty list of dict")

        super(Interpreter, self).__init__(source, **kwds)
        self.namespaces = namespaces

        # Don't use the fast parser, because it does crazy stuff that we don't
        # need in our very simple and small code here (that is always
        # changing).
        self._parser = UserContextParser(self._grammar, self.source,
                                         self._orig_path, self._pos,
                                         self._user_context, self._parsed_callback,
                                         use_fast_parser=False)
        interpreter.add_namespaces_to_parser(self._evaluator, namespaces,
                                             self._parser.module())

    def _simple_complete(self, path, dot, like):
        user_stmt = self._parser.user_stmt_with_whitespace()
        is_simple_path = not path or re.search('^[\w][\w\d.]*$', path)
        if isinstance(user_stmt, tree.Import) or not is_simple_path:
            return super(Interpreter, self)._simple_complete(path, dot, like)
        else:
            class NamespaceModule(object):
                def __getattr__(_, name):
                    for n in self.namespaces:
                        try:
                            return n[name]
                        except KeyError:
                            pass
                    raise AttributeError()

                def __dir__(_):
                    gen = (n.keys() for n in self.namespaces)
                    return list(set(chain.from_iterable(gen)))

            paths = path.split('.') if path else []

            namespaces = (NamespaceModule(), builtins)
            for p in paths:
                old, namespaces = namespaces, []
                for n in old:
                    try:
                        namespaces.append(getattr(n, p))
                    except Exception:
                        pass

            completion_names = []
            for namespace in namespaces:
                for name in dir(namespace):
                    if name.lower().startswith(like.lower()):
                        scope = self._parser.module()
                        n = FakeName(name, scope)
                        completion_names.append(n)
            return completion_names


def defined_names(source, path=None, encoding='utf-8'):
    """
    Get all definitions in `source` sorted by its position.

    This functions can be used for listing functions, classes and
    data defined in a file.  This can be useful if you want to list
    them in "sidebar".  Each element in the returned list also has
    `defined_names` method which can be used to get sub-definitions
    (e.g., methods in class).

    :rtype: list of classes.Definition

    .. deprecated:: 0.9.0
       Use :func:`names` instead.
    .. todo:: Remove!
    """
    warnings.warn("Use call_signatures instead.", DeprecationWarning)
    return names(source, path, encoding)


def names(source=None, path=None, encoding='utf-8', all_scopes=False,
          definitions=True, references=False):
    """
    Returns a list of `Definition` objects, containing name parts.
    This means you can call ``Definition.goto_assignments()`` and get the
    reference of a name.
    The parameters are the same as in :py:class:`Script`, except or the
    following ones:

    :param all_scopes: If True lists the names of all scopes instead of only
        the module namespace.
    :param definitions: If True lists the names that have been defined by a
        class, function or a statement (``a = b`` returns ``a``).
    :param references: If True lists all the names that are not listed by
        ``definitions=True``. E.g. ``a = b`` returns ``b``.
    """
    def def_ref_filter(_def):
        is_def = _def.is_definition()
        return definitions and is_def or references and not is_def

    # Set line/column to a random position, because they don't matter.
    script = Script(source, line=1, column=0, path=path, encoding=encoding)
    defs = [classes.Definition(script._evaluator, name_part)
            for name_part in get_module_names(script._parser.module(), all_scopes)]
    return sorted(filter(def_ref_filter, defs), key=lambda x: (x.line, x.column))


def preload_module(*modules):
    """
    Preloading modules tells Jedi to load a module now, instead of lazy parsing
    of modules. Usful for IDEs, to control which modules to load on startup.

    :param modules: different module names, list of string.
    """
    for m in modules:
        s = "import %s as x; x." % m
        Script(s, 1, len(s), None).completions()


def set_debug_function(func_cb=debug.print_to_stdout, warnings=True,
                       notices=True, speed=True):
    """
    Define a callback debug function to get all the debug messages.

    :param func_cb: The callback function for debug messages, with n params.
    """
    debug.debug_function = func_cb
    debug.enable_warning = warnings
    debug.enable_notice = notices
    debug.enable_speed = speed
