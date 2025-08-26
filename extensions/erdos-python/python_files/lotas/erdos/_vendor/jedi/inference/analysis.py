"""
Module for statical analysis.
"""
from lotas.erdos._vendor.parso.python import tree

from jedi import debug
from lotas.erdos._vendor.jedi.inference.helpers import is_string


CODES = {
    'attribute-error': (1, AttributeError, 'Potential AttributeError.'),
    'name-error': (2, NameError, 'Potential NameError.'),
    'import-error': (3, ImportError, 'Potential ImportError.'),
    'type-error-too-many-arguments': (4, TypeError, None),
    'type-error-too-few-arguments': (5, TypeError, None),
    'type-error-keyword-argument': (6, TypeError, None),
    'type-error-multiple-values': (7, TypeError, None),
    'type-error-star-star': (8, TypeError, None),
    'type-error-star': (9, TypeError, None),
    'type-error-operation': (10, TypeError, None),
    'type-error-not-iterable': (11, TypeError, None),
    'type-error-isinstance': (12, TypeError, None),
    'type-error-not-subscriptable': (13, TypeError, None),
    'value-error-too-many-values': (14, ValueError, None),
    'value-error-too-few-values': (15, ValueError, None),
}


class Error:
    def __init__(self, name, module_path, start_pos, message=None):
        self.path = module_path
        self._start_pos = start_pos
        self.name = name
        if message is None:
            message = CODES[self.name][2]
        self.message = message

    @property
    def line(self):
        return self._start_pos[0]

    @property
    def column(self):
        return self._start_pos[1]

    @property
    def code(self):
        # The class name start
        first = self.__class__.__name__[0]
        return first + str(CODES[self.name][0])

    def __str__(self):
        return '%s:%s:%s: %s %s' % (self.path, self.line, self.column,
                                    self.code, self.message)

    def __eq__(self, other):
        return (self.path == other.path and self.name == other.name
                and self._start_pos == other._start_pos)

    def __ne__(self, other):
        return not self.__eq__(other)

    def __hash__(self):
        return hash((self.path, self._start_pos, self.name))

    def __repr__(self):
        return '<%s %s: %s@%s,%s>' % (self.__class__.__name__,
                                      self.name, self.path,
                                      self._start_pos[0], self._start_pos[1])


class Warning(Error):
    pass


def add(node_context, error_name, node, message=None, typ=Error, payload=None):
    exception = CODES[error_name][1]
    if _check_for_exception_catch(node_context, node, exception, payload):
        return

    # TODO this path is probably not right
    module_context = node_context.get_root_context()
    module_path = module_context.py__file__()
    issue_instance = typ(error_name, module_path, node.start_pos, message)
    debug.warning(str(issue_instance), format=False)
    node_context.inference_state.analysis.append(issue_instance)
    return issue_instance


def _check_for_setattr(instance):
    """
    Check if there's any setattr method inside an instance. If so, return True.
    """
    module = instance.get_root_context()
    node = module.tree_node
    if node is None:
        # If it's a compiled module or doesn't have a tree_node
        return False

    try:
        stmt_names = node.get_used_names()['setattr']
    except KeyError:
        return False

    return any(node.start_pos < n.start_pos < node.end_pos
               # Check if it's a function called setattr.
               and not (n.parent.type == 'funcdef' and n.parent.name == n)
               for n in stmt_names)


def add_attribute_error(name_context, lookup_value, name):
    message = ('AttributeError: %s has no attribute %s.' % (lookup_value, name))
    # Check for __getattr__/__getattribute__ existance and issue a warning
    # instead of an error, if that happens.
    typ = Error
    if lookup_value.is_instance() and not lookup_value.is_compiled():
        # TODO maybe make a warning for __getattr__/__getattribute__

        if _check_for_setattr(lookup_value):
            typ = Warning

    payload = lookup_value, name
    add(name_context, 'attribute-error', name, message, typ, payload)


def _check_for_exception_catch(node_context, jedi_name, exception, payload=None):
    """
    Checks if a jedi object (e.g. `Statement`) sits inside a try/catch and
    doesn't count as an error (if equal to `exception`).
    Also checks `hasattr` for AttributeErrors and uses the `payload` to compare
    it.
    Returns True if the exception was catched.
    """
    def check_match(cls, exception):
        if not cls.is_class():
            return False

        for python_cls in exception.mro():
            if cls.py__name__() == python_cls.__name__ \
                    and cls.parent_context.is_builtins_module():
                return True
        return False

    def check_try_for_except(obj, exception):
        # Only nodes in try
        iterator = iter(obj.children)
        for branch_type in iterator:
            next(iterator)  # The colon
            suite = next(iterator)
            if branch_type == 'try' \
                    and not (branch_type.start_pos < jedi_name.start_pos <= suite.end_pos):
                return False

        for node in obj.get_except_clause_tests():
            if node is None:
                return True  # An exception block that catches everything.
            else:
                except_classes = node_context.infer_node(node)
                for cls in except_classes:
                    from lotas.erdos._vendor.jedi.inference.value import iterable
                    if isinstance(cls, iterable.Sequence) and \
                            cls.array_type == 'tuple':
                        # multiple exceptions
                        for lazy_value in cls.py__iter__():
                            for typ in lazy_value.infer():
                                if check_match(typ, exception):
                                    return True
                    else:
                        if check_match(cls, exception):
                            return True

    def check_hasattr(node, suite):
        try:
            assert suite.start_pos <= jedi_name.start_pos < suite.end_pos
            assert node.type in ('power', 'atom_expr')
            base = node.children[0]
            assert base.type == 'name' and base.value == 'hasattr'
            trailer = node.children[1]
            assert trailer.type == 'trailer'
            arglist = trailer.children[1]
            assert arglist.type == 'arglist'
            from lotas.erdos._vendor.jedi.inference.arguments import TreeArguments
            args = TreeArguments(node_context.inference_state, node_context, arglist)
            unpacked_args = list(args.unpack())
            # Arguments should be very simple
            assert len(unpacked_args) == 2

            # Check name
            key, lazy_value = unpacked_args[1]
            names = list(lazy_value.infer())
            assert len(names) == 1 and is_string(names[0])
            assert names[0].get_safe_value() == payload[1].value

            # Check objects
            key, lazy_value = unpacked_args[0]
            objects = lazy_value.infer()
            return payload[0] in objects
        except AssertionError:
            return False

    obj = jedi_name
    while obj is not None and not isinstance(obj, (tree.Function, tree.Class)):
        if isinstance(obj, tree.Flow):
            # try/except catch check
            if obj.type == 'try_stmt' and check_try_for_except(obj, exception):
                return True
            # hasattr check
            if exception == AttributeError and obj.type in ('if_stmt', 'while_stmt'):
                if check_hasattr(obj.children[1], obj.children[3]):
                    return True
        obj = obj.parent

    return False
