from collections import defaultdict
from itertools import chain

from jedi._compatibility import unicode, zip_longest
from jedi import debug
from jedi import common
from jedi.parser import tree
from jedi.evaluate import iterable
from jedi.evaluate import analysis
from jedi.evaluate import precedence
from jedi.evaluate.helpers import FakeName
from jedi.cache import underscore_memoization


class Arguments(tree.Base):
    def __init__(self, evaluator, argument_node, trailer=None):
        """
        The argument_node is either a parser node or a list of evaluated
        objects. Those evaluated objects may be lists of evaluated objects
        themselves (one list for the first argument, one for the second, etc).

        :param argument_node: May be an argument_node or a list of nodes.
        """
        self.argument_node = argument_node
        self._evaluator = evaluator
        self.trailer = trailer  # Can be None, e.g. in a class definition.

    def _split(self):
        if isinstance(self.argument_node, (tuple, list)):
            for el in self.argument_node:
                yield 0, el
        else:
            if not tree.is_node(self.argument_node, 'arglist'):
                yield 0, self.argument_node
                return

            iterator = iter(self.argument_node.children)
            for child in iterator:
                if child == ',':
                    continue
                elif child in ('*', '**'):
                    yield len(child.value), next(iterator)
                else:
                    yield 0, child

    def get_parent_until(self, *args, **kwargs):
        if self.trailer is None:
            try:
                element = self.argument_node[0]
                from jedi.evaluate.iterable import AlreadyEvaluated
                if isinstance(element, AlreadyEvaluated):
                    element = self._evaluator.eval_element(element)[0]
            except IndexError:
                return None
            else:
                return element.get_parent_until(*args, **kwargs)
        else:
            return self.trailer.get_parent_until(*args, **kwargs)

    def as_tuple(self):
        for stars, argument in self._split():
            if tree.is_node(argument, 'argument'):
                argument, default = argument.children[::2]
            else:
                default = None
            yield argument, default, stars

    def unpack(self, func=None):
        named_args = []
        for stars, el in self._split():
            if stars == 1:
                arrays = self._evaluator.eval_element(el)
                iterators = [_iterate_star_args(self._evaluator, a, el, func)
                             for a in arrays]
                iterators = list(iterators)
                for values in list(zip_longest(*iterators)):
                    yield None, [v for v in values if v is not None]
            elif stars == 2:
                arrays = self._evaluator.eval_element(el)
                dicts = [_star_star_dict(self._evaluator, a, el, func)
                         for a in arrays]
                for dct in dicts:
                    for key, values in dct.items():
                        yield key, values
            else:
                if tree.is_node(el, 'argument'):
                    c = el.children
                    if len(c) == 3:  # Keyword argument.
                        named_args.append((c[0].value, (c[2],)))
                    else:  # Generator comprehension.
                        # Include the brackets with the parent.
                        comp = iterable.GeneratorComprehension(
                            self._evaluator, self.argument_node.parent)
                        yield None, (iterable.AlreadyEvaluated([comp]),)
                elif isinstance(el, (list, tuple)):
                    yield None, el
                else:
                    yield None, (el,)

        # Reordering var_args is necessary, because star args sometimes appear
        # after named argument, but in the actual order it's prepended.
        for key_arg in named_args:
            yield key_arg

    def _reorder_var_args(var_args):
        named_index = None
        new_args = []
        for i, stmt in enumerate(var_args):
            if isinstance(stmt, tree.ExprStmt):
                if named_index is None and stmt.assignment_details:
                    named_index = i

                if named_index is not None:
                    expression_list = stmt.expression_list()
                    if expression_list and expression_list[0] == '*':
                        new_args.insert(named_index, stmt)
                        named_index += 1
                        continue

            new_args.append(stmt)
        return new_args

    def eval_argument_clinic(self, arguments):
        """Uses a list with argument clinic information (see PEP 436)."""
        iterator = self.unpack()
        for i, (name, optional, allow_kwargs) in enumerate(arguments):
            key, va_values = next(iterator, (None, []))
            if key is not None:
                raise NotImplementedError
            if not va_values and not optional:
                debug.warning('TypeError: %s expected at least %s arguments, got %s',
                              name, len(arguments), i)
                raise ValueError
            values = list(chain.from_iterable(self._evaluator.eval_element(el)
                                              for el in va_values))
            if not values and not optional:
                # For the stdlib we always want values. If we don't get them,
                # that's ok, maybe something is too hard to resolve, however,
                # we will not proceed with the evaluation of that function.
                debug.warning('argument_clinic "%s" not resolvable.', name)
                raise ValueError
            yield values

    def scope(self):
        # Returns the scope in which the arguments are used.
        return (self.trailer or self.argument_node).get_parent_until(tree.IsScope)

    def eval_args(self):
        # TODO this method doesn't work with named args and a lot of other
        # things. Use unpack.
        return [self._evaluator.eval_element(el) for stars, el in self._split()]

    def __repr__(self):
        return '<%s: %s>' % (type(self).__name__, self.argument_node)

    def get_calling_var_args(self):
        if tree.is_node(self.argument_node, 'arglist', 'argument') \
                or self.argument_node == () and self.trailer is not None:
            return _get_calling_var_args(self._evaluator, self)
        else:
            return None


class ExecutedParam(tree.Param):
    """Fake a param and give it values."""
    def __init__(self, original_param, var_args, values):
        self._original_param = original_param
        self.var_args = var_args
        self._values = values

    def eval(self, evaluator):
        types = []
        for v in self._values:
            types += evaluator.eval_element(v)
        return types

    @property
    def position_nr(self):
        # Need to use the original logic here, because it uses the parent.
        return self._original_param.position_nr

    @property
    @underscore_memoization
    def name(self):
        return FakeName(str(self._original_param.name), self, self.start_pos)

    def __getattr__(self, name):
        return getattr(self._original_param, name)


def _get_calling_var_args(evaluator, var_args):
    old_var_args = None
    while var_args != old_var_args:
        old_var_args = var_args
        for name, default, stars in reversed(list(var_args.as_tuple())):
            if not stars or not isinstance(name, tree.Name):
                continue

            names = evaluator.goto(name)
            if len(names) != 1:
                break
            param = names[0].get_definition()
            if not isinstance(param, ExecutedParam):
                if isinstance(param, tree.Param):
                    # There is no calling var_args in this case - there's just
                    # a param without any input.
                    return None
                break
            # We never want var_args to be a tuple. This should be enough for
            # now, we can change it later, if we need to.
            if isinstance(param.var_args, Arguments):
                var_args = param.var_args
    return var_args.argument_node or var_args.trailer


def get_params(evaluator, func, var_args):
    param_names = []
    param_dict = {}
    for param in func.params:
        param_dict[str(param.name)] = param
    unpacked_va = list(var_args.unpack(func))
    from jedi.evaluate.representation import InstanceElement
    if isinstance(func, InstanceElement):
        # Include self at this place.
        unpacked_va.insert(0, (None, [iterable.AlreadyEvaluated([func.instance])]))
    var_arg_iterator = common.PushBackIterator(iter(unpacked_va))

    non_matching_keys = defaultdict(lambda: [])
    keys_used = {}
    keys_only = False
    had_multiple_value_error = False
    for param in func.params:
        # The value and key can both be null. There, the defaults apply.
        # args / kwargs will just be empty arrays / dicts, respectively.
        # Wrong value count is just ignored. If you try to test cases that are
        # not allowed in Python, Jedi will maybe not show any completions.
        default = [] if param.default is None else [param.default]
        key, va_values = next(var_arg_iterator, (None, default))
        while key is not None:
            keys_only = True
            k = unicode(key)
            try:
                key_param = param_dict[unicode(key)]
            except KeyError:
                non_matching_keys[key] += va_values
            else:
                param_names.append(ExecutedParam(key_param, var_args, va_values).name)

            if k in keys_used:
                had_multiple_value_error = True
                m = ("TypeError: %s() got multiple values for keyword argument '%s'."
                     % (func.name, k))
                calling_va = _get_calling_var_args(evaluator, var_args)
                if calling_va is not None:
                    analysis.add(evaluator, 'type-error-multiple-values',
                                 calling_va, message=m)
            else:
                try:
                    keys_used[k] = param_names[-1]
                except IndexError:
                    # TODO this is wrong stupid and whatever.
                    pass
            key, va_values = next(var_arg_iterator, (None, ()))

        values = []
        if param.stars == 1:
            # *args param
            lst_values = [iterable.MergedNodes(va_values)] if va_values else []
            for key, va_values in var_arg_iterator:
                # Iterate until a key argument is found.
                if key:
                    var_arg_iterator.push_back((key, va_values))
                    break
                if va_values:
                    lst_values.append(iterable.MergedNodes(va_values))
            seq = iterable.FakeSequence(evaluator, lst_values, 'tuple')
            values = [iterable.AlreadyEvaluated([seq])]
        elif param.stars == 2:
            # **kwargs param
            dct = iterable.FakeDict(evaluator, dict(non_matching_keys))
            values = [iterable.AlreadyEvaluated([dct])]
            non_matching_keys = {}
        else:
            # normal param
            if va_values:
                values = va_values
            else:
                # No value: Return an empty container
                values = []
                if not keys_only:
                    calling_va = var_args.get_calling_var_args()
                    if calling_va is not None:
                        m = _error_argument_count(func, len(unpacked_va))
                        analysis.add(evaluator, 'type-error-too-few-arguments',
                                     calling_va, message=m)

        # Now add to result if it's not one of the previously covered cases.
        if (not keys_only or param.stars == 2):
            param_names.append(ExecutedParam(param, var_args, values).name)
            keys_used[unicode(param.name)] = param_names[-1]

    if keys_only:
        # All arguments should be handed over to the next function. It's not
        # about the values inside, it's about the names. Jedi needs to now that
        # there's nothing to find for certain names.
        for k in set(param_dict) - set(keys_used):
            param = param_dict[k]
            values = [] if param.default is None else [param.default]
            param_names.append(ExecutedParam(param, var_args, values).name)

            if not (non_matching_keys or had_multiple_value_error
                    or param.stars or param.default):
                # add a warning only if there's not another one.
                calling_va = _get_calling_var_args(evaluator, var_args)
                if calling_va is not None:
                    m = _error_argument_count(func, len(unpacked_va))
                    analysis.add(evaluator, 'type-error-too-few-arguments',
                                 calling_va, message=m)

    for key, va_values in non_matching_keys.items():
        m = "TypeError: %s() got an unexpected keyword argument '%s'." \
            % (func.name, key)
        for value in va_values:
            analysis.add(evaluator, 'type-error-keyword-argument', value.parent, message=m)

    remaining_params = list(var_arg_iterator)
    if remaining_params:
        m = _error_argument_count(func, len(unpacked_va))
        # Just report an error for the first param that is not needed (like
        # cPython).
        first_key, first_values = remaining_params[0]
        for v in first_values:
            if first_key is not None:
                # Is a keyword argument, return the whole thing instead of just
                # the value node.
                v = v.parent
                try:
                    non_kw_param = keys_used[first_key]
                except KeyError:
                    pass
                else:
                    origin_args = non_kw_param.parent.var_args.argument_node
                    # TODO  calculate the var_args tree and check if it's in
                    # the tree (if not continue).
                    # print('\t\tnonkw', non_kw_param.parent.var_args.argument_node, )
                    if origin_args not in [f.parent.parent for f in first_values]:
                        continue
            analysis.add(evaluator, 'type-error-too-many-arguments',
                         v, message=m)
    return param_names


def _iterate_star_args(evaluator, array, input_node, func=None):
    from jedi.evaluate.representation import Instance
    if isinstance(array, iterable.Array):
        for field_stmt in array:  # yield from plz!
            yield field_stmt
    elif isinstance(array, iterable.Generator):
        for field_stmt in array.iter_content():
            yield iterable.AlreadyEvaluated([field_stmt])
    elif isinstance(array, Instance) and array.name.get_code() == 'tuple':
        debug.warning('Ignored a tuple *args input %s' % array)
    else:
        if func is not None:
            m = "TypeError: %s() argument after * must be a sequence, not %s" \
                % (func.name.value, array)
            analysis.add(evaluator, 'type-error-star', input_node, message=m)


def _star_star_dict(evaluator, array, input_node, func):
    dct = defaultdict(lambda: [])
    from jedi.evaluate.representation import Instance
    if isinstance(array, Instance) and array.name.get_code() == 'dict':
        # For now ignore this case. In the future add proper iterators and just
        # make one call without crazy isinstance checks.
        return {}

    if isinstance(array, iterable.FakeDict):
        return array._dct
    elif isinstance(array, iterable.Array) and array.type == 'dict':
        # TODO bad call to non-public API
        for key_node, values in array._items():
            for key in evaluator.eval_element(key_node):
                if precedence.is_string(key):
                    dct[key.obj] += values

    else:
        if func is not None:
            m = "TypeError: %s argument after ** must be a mapping, not %s" \
                % (func.name.value, array)
            analysis.add(evaluator, 'type-error-star-star', input_node, message=m)
    return dict(dct)


def _error_argument_count(func, actual_count):
    default_arguments = sum(1 for p in func.params if p.default or p.stars)

    if default_arguments == 0:
        before = 'exactly '
    else:
        before = 'from %s to ' % (len(func.params) - default_arguments)
    return ('TypeError: %s() takes %s%s arguments (%s given).'
            % (func.name, before, len(func.params), actual_count))
