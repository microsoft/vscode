from collections import defaultdict
from inspect import Parameter

from jedi import debug
from lotas.erdos._vendor.jedi.inference.utils import PushBackIterator
from lotas.erdos._vendor.jedi.inference import analysis
from lotas.erdos._vendor.jedi.inference.lazy_value import LazyKnownValue, \
    LazyTreeValue, LazyUnknownValue
from lotas.erdos._vendor.jedi.inference.value import iterable
from lotas.erdos._vendor.jedi.inference.names import ParamName


def _add_argument_issue(error_name, lazy_value, message):
    if isinstance(lazy_value, LazyTreeValue):
        node = lazy_value.data
        if node.parent.type == 'argument':
            node = node.parent
        return analysis.add(lazy_value.context, error_name, node, message)


class ExecutedParamName(ParamName):
    def __init__(self, function_value, arguments, param_node, lazy_value, is_default=False):
        super().__init__(function_value, param_node.name, arguments=arguments)
        self._lazy_value = lazy_value
        self._is_default = is_default

    def infer(self):
        return self._lazy_value.infer()

    def matches_signature(self):
        if self._is_default:
            return True
        argument_values = self.infer().py__class__()
        if self.get_kind() in (Parameter.VAR_POSITIONAL, Parameter.VAR_KEYWORD):
            return True
        annotations = self.infer_annotation(execute_annotation=False)
        if not annotations:
            # If we cannot infer annotations - or there aren't any - pretend
            # that the signature matches.
            return True
        matches = any(c1.is_sub_class_of(c2)
                      for c1 in argument_values
                      for c2 in annotations.gather_annotation_classes())
        debug.dbg("param compare %s: %s <=> %s",
                  matches, argument_values, annotations, color='BLUE')
        return matches

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self.string_name)


def get_executed_param_names_and_issues(function_value, arguments):
    """
    Return a tuple of:
      - a list of `ExecutedParamName`s corresponding to the arguments of the
        function execution `function_value`, containing the inferred value of
        those arguments (whether explicit or default)
      - a list of the issues encountered while building that list

    For example, given:
    ```
    def foo(a, b, c=None, d='d'): ...

    foo(42, c='c')
    ```

    Then for the execution of `foo`, this will return a tuple containing:
      - a list with entries for each parameter a, b, c & d; the entries for a,
        c, & d will have their values (42, 'c' and 'd' respectively) included.
      - a list with a single entry about the lack of a value for `b`
    """
    def too_many_args(argument):
        m = _error_argument_count(funcdef, len(unpacked_va))
        # Just report an error for the first param that is not needed (like
        # cPython).
        if arguments.get_calling_nodes():
            # There might not be a valid calling node so check for that first.
            issues.append(
                _add_argument_issue(
                    'type-error-too-many-arguments',
                    argument,
                    message=m
                )
            )
        else:
            issues.append(None)
            debug.warning('non-public warning: %s', m)

    issues = []  # List[Optional[analysis issue]]
    result_params = []
    param_dict = {}
    funcdef = function_value.tree_node
    # Default params are part of the value where the function was defined.
    # This means that they might have access on class variables that the
    # function itself doesn't have.
    default_param_context = function_value.get_default_param_context()

    for param in funcdef.get_params():
        param_dict[param.name.value] = param
    unpacked_va = list(arguments.unpack(funcdef))
    var_arg_iterator = PushBackIterator(iter(unpacked_va))

    non_matching_keys = defaultdict(lambda: [])
    keys_used = {}
    keys_only = False
    had_multiple_value_error = False
    for param in funcdef.get_params():
        # The value and key can both be null. There, the defaults apply.
        # args / kwargs will just be empty arrays / dicts, respectively.
        # Wrong value count is just ignored. If you try to test cases that are
        # not allowed in Python, Jedi will maybe not show any completions.
        is_default = False
        key, argument = next(var_arg_iterator, (None, None))
        while key is not None:
            keys_only = True
            try:
                key_param = param_dict[key]
            except KeyError:
                non_matching_keys[key] = argument
            else:
                if key in keys_used:
                    had_multiple_value_error = True
                    m = ("TypeError: %s() got multiple values for keyword argument '%s'."
                         % (funcdef.name, key))
                    for contextualized_node in arguments.get_calling_nodes():
                        issues.append(
                            analysis.add(contextualized_node.context,
                                         'type-error-multiple-values',
                                         contextualized_node.node, message=m)
                        )
                else:
                    keys_used[key] = ExecutedParamName(
                        function_value, arguments, key_param, argument)
            key, argument = next(var_arg_iterator, (None, None))

        try:
            result_params.append(keys_used[param.name.value])
            continue
        except KeyError:
            pass

        if param.star_count == 1:
            # *args param
            lazy_value_list = []
            if argument is not None:
                lazy_value_list.append(argument)
                for key, argument in var_arg_iterator:
                    # Iterate until a key argument is found.
                    if key:
                        var_arg_iterator.push_back((key, argument))
                        break
                    lazy_value_list.append(argument)
            seq = iterable.FakeTuple(function_value.inference_state, lazy_value_list)
            result_arg = LazyKnownValue(seq)
        elif param.star_count == 2:
            if argument is not None:
                too_many_args(argument)
            # **kwargs param
            dct = iterable.FakeDict(function_value.inference_state, dict(non_matching_keys))
            result_arg = LazyKnownValue(dct)
            non_matching_keys = {}
        else:
            # normal param
            if argument is None:
                # No value: Return an empty container
                if param.default is None:
                    result_arg = LazyUnknownValue()
                    if not keys_only:
                        for contextualized_node in arguments.get_calling_nodes():
                            m = _error_argument_count(funcdef, len(unpacked_va))
                            issues.append(
                                analysis.add(
                                    contextualized_node.context,
                                    'type-error-too-few-arguments',
                                    contextualized_node.node,
                                    message=m,
                                )
                            )
                else:
                    result_arg = LazyTreeValue(default_param_context, param.default)
                    is_default = True
            else:
                result_arg = argument

        result_params.append(ExecutedParamName(
            function_value, arguments, param, result_arg, is_default=is_default
        ))
        if not isinstance(result_arg, LazyUnknownValue):
            keys_used[param.name.value] = result_params[-1]

    if keys_only:
        # All arguments should be handed over to the next function. It's not
        # about the values inside, it's about the names. Jedi needs to now that
        # there's nothing to find for certain names.
        for k in set(param_dict) - set(keys_used):
            param = param_dict[k]

            if not (non_matching_keys or had_multiple_value_error
                    or param.star_count or param.default):
                # add a warning only if there's not another one.
                for contextualized_node in arguments.get_calling_nodes():
                    m = _error_argument_count(funcdef, len(unpacked_va))
                    issues.append(
                        analysis.add(contextualized_node.context,
                                     'type-error-too-few-arguments',
                                     contextualized_node.node, message=m)
                    )

    for key, lazy_value in non_matching_keys.items():
        m = "TypeError: %s() got an unexpected keyword argument '%s'." \
            % (funcdef.name, key)
        issues.append(
            _add_argument_issue(
                'type-error-keyword-argument',
                lazy_value,
                message=m
            )
        )

    remaining_arguments = list(var_arg_iterator)
    if remaining_arguments:
        first_key, lazy_value = remaining_arguments[0]
        too_many_args(lazy_value)
    return result_params, issues


def get_executed_param_names(function_value, arguments):
    """
    Return a list of `ExecutedParamName`s corresponding to the arguments of the
    function execution `function_value`, containing the inferred value of those
    arguments (whether explicit or default). Any issues building this list (for
    example required arguments which are missing in the invocation) are ignored.

    For example, given:
    ```
    def foo(a, b, c=None, d='d'): ...

    foo(42, c='c')
    ```

    Then for the execution of `foo`, this will return a list containing entries
    for each parameter a, b, c & d; the entries for a, c, & d will have their
    values (42, 'c' and 'd' respectively) included.
    """
    return get_executed_param_names_and_issues(function_value, arguments)[0]


def _error_argument_count(funcdef, actual_count):
    params = funcdef.get_params()
    default_arguments = sum(1 for p in params if p.default or p.star_count)

    if default_arguments == 0:
        before = 'exactly '
    else:
        before = 'from %s to ' % (len(params) - default_arguments)
    return ('TypeError: %s() takes %s%s arguments (%s given).'
            % (funcdef.name, before, len(params), actual_count))
