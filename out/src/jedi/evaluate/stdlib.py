"""
Implementations of standard library functions, because it's not possible to
understand them with Jedi.

To add a new implementation, create a function and add it to the
``_implemented`` dict at the bottom of this module.

"""
import collections
import re

from jedi._compatibility import unicode
from jedi.evaluate import compiled
from jedi.evaluate import representation as er
from jedi.evaluate import iterable
from jedi.parser import Parser
from jedi.parser import tree
from jedi import debug
from jedi.evaluate import precedence
from jedi.evaluate import param


class NotInStdLib(LookupError):
    pass


def execute(evaluator, obj, params):
    try:
        obj_name = str(obj.name)
    except AttributeError:
        pass
    else:
        if obj.parent == compiled.builtin:
            module_name = 'builtins'
        elif isinstance(obj.parent, tree.Module):
            module_name = str(obj.parent.name)
        else:
            module_name = ''

        # for now we just support builtin functions.
        try:
            return _implemented[module_name][obj_name](evaluator, obj, params)
        except KeyError:
            pass
    raise NotInStdLib()


def _follow_param(evaluator, params, index):
    try:
        key, values = list(params.unpack())[index]
    except IndexError:
        return []
    else:
        return iterable.unite(evaluator.eval_element(v) for v in values)


def argument_clinic(string, want_obj=False, want_scope=False):
    """
    Works like Argument Clinic (PEP 436), to validate function params.
    """
    clinic_args = []
    allow_kwargs = False
    optional = False
    while string:
        # Optional arguments have to begin with a bracket. And should always be
        # at the end of the arguments. This is therefore not a proper argument
        # clinic implementation. `range()` for exmple allows an optional start
        # value at the beginning.
        match = re.match('(?:(?:(\[),? ?|, ?|)(\w+)|, ?/)\]*', string)
        string = string[len(match.group(0)):]
        if not match.group(2):  # A slash -> allow named arguments
            allow_kwargs = True
            continue
        optional = optional or bool(match.group(1))
        word = match.group(2)
        clinic_args.append((word, optional, allow_kwargs))

    def f(func):
        def wrapper(evaluator, obj, arguments):
            try:
                lst = list(arguments.eval_argument_clinic(clinic_args))
            except ValueError:
                return []
            else:
                kwargs = {}
                if want_scope:
                    kwargs['scope'] = arguments.scope()
                if want_obj:
                    kwargs['obj'] = obj
                return func(evaluator, *lst, **kwargs)

        return wrapper
    return f


@argument_clinic('object, name[, default], /')
def builtins_getattr(evaluator, objects, names, defaults=None):
    types = []
    # follow the first param
    for obj in objects:
        if not isinstance(obj, (er.Instance, er.Class, tree.Module, compiled.CompiledObject)):
            debug.warning('getattr called without instance')
            continue

        for name in names:
            if precedence.is_string(name):
                return evaluator.find_types(obj, name.obj)
            else:
                debug.warning('getattr called without str')
                continue
    return types


@argument_clinic('object[, bases, dict], /')
def builtins_type(evaluator, objects, bases, dicts):
    if bases or dicts:
        # metaclass... maybe someday...
        return []
    else:
        return [o.base for o in objects if isinstance(o, er.Instance)]


class SuperInstance(er.Instance):
    """To be used like the object ``super`` returns."""
    def __init__(self, evaluator, cls):
        su = cls.py_mro()[1]
        super().__init__(evaluator, su and su[0] or self)


@argument_clinic('[type[, obj]], /', want_scope=True)
def builtins_super(evaluator, types, objects, scope):
    # TODO make this able to detect multiple inheritance super
    accept = (tree.Function, er.FunctionExecution)
    if scope.isinstance(*accept):
        wanted = (tree.Class, er.Instance)
        cls = scope.get_parent_until(accept + wanted,
                                     include_current=False)
        if isinstance(cls, wanted):
            if isinstance(cls, tree.Class):
                cls = er.Class(evaluator, cls)
            elif isinstance(cls, er.Instance):
                cls = cls.base
            su = cls.py__bases__(evaluator)
            if su:
                return evaluator.execute(su[0])
    return []


@argument_clinic('sequence, /', want_obj=True)
def builtins_reversed(evaluator, sequences, obj):
    # Unpack the iterator values
    objects = tuple(iterable.get_iterator_types(sequences))
    rev = [iterable.AlreadyEvaluated([o]) for o in reversed(objects)]
    # Repack iterator values and then run it the normal way. This is
    # necessary, because `reversed` is a function and autocompletion
    # would fail in certain cases like `reversed(x).__iter__` if we
    # just returned the result directly.
    rev = iterable.AlreadyEvaluated(
        [iterable.FakeSequence(evaluator, rev, 'list')]
    )
    return [er.Instance(evaluator, obj, param.Arguments(evaluator, [rev]))]


@argument_clinic('obj, type, /')
def builtins_isinstance(evaluator, objects, types):
    bool_results = set([])
    for o in objects:
        try:
            mro_func = o.py__class__(evaluator).py__mro__
        except AttributeError:
            # This is temporary. Everything should have a class attribute in
            # Python?! Maybe we'll leave it here, because some numpy objects or
            # whatever might not.
            return [compiled.true_obj, compiled.false_obj]

        mro = mro_func(evaluator)

        for cls_or_tup in types:
            if cls_or_tup.is_class():
                bool_results.add(cls_or_tup in mro)
            else:
                # Check for tuples.
                classes = iterable.get_iterator_types([cls_or_tup])
                bool_results.add(any(cls in mro for cls in classes))

    return [compiled.keyword_from_value(x) for x in bool_results]


def collections_namedtuple(evaluator, obj, params):
    """
    Implementation of the namedtuple function.

    This has to be done by processing the namedtuple class template and
    evaluating the result.

    .. note:: |jedi| only supports namedtuples on Python >2.6.

    """
    # Namedtuples are not supported on Python 2.6
    if not hasattr(collections, '_class_template'):
        return []

    # Process arguments
    name = _follow_param(evaluator, params, 0)[0].obj
    _fields = _follow_param(evaluator, params, 1)[0]
    if isinstance(_fields, compiled.CompiledObject):
        fields = _fields.obj.replace(',', ' ').split()
    elif isinstance(_fields, iterable.Array):
        try:
            fields = [v.obj for v in _fields.values()]
        except AttributeError:
            return []
    else:
        return []

    # Build source
    source = collections._class_template.format(
        typename=name,
        field_names=fields,
        num_fields=len(fields),
        arg_list=', '.join(fields),
        repr_fmt=', '.join(collections._repr_template.format(name=name) for name in fields),
        field_defs='\n'.join(collections._field_template.format(index=index, name=name)
                             for index, name in enumerate(fields))
    )

    # Parse source
    generated_class = Parser(evaluator.grammar, unicode(source)).module.subscopes[0]
    return [er.Class(evaluator, generated_class)]


@argument_clinic('first, /')
def _return_first_param(evaluator, firsts):
    return firsts


_implemented = {
    'builtins': {
        'getattr': builtins_getattr,
        'type': builtins_type,
        'super': builtins_super,
        'reversed': builtins_reversed,
        'isinstance': builtins_isinstance,
    },
    'copy': {
        'copy': _return_first_param,
        'deepcopy': _return_first_param,
    },
    'json': {
        'load': lambda *args: [],
        'loads': lambda *args: [],
    },
    'collections': {
        'namedtuple': collections_namedtuple,
    },
}
