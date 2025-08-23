from erdos.erdos._vendor.jedi import debug
from erdos.erdos._vendor.jedi.inference.base_value import ValueSet, \
    NO_VALUES
from erdos.erdos._vendor.jedi.inference.utils import to_list
from erdos.erdos._vendor.jedi.inference.gradual.stub_value import StubModuleValue
from erdos.erdos._vendor.jedi.inference.gradual.typeshed import try_to_load_stub_cached
from erdos.erdos._vendor.jedi.inference.value.decorator import Decoratee


def _stub_to_python_value_set(stub_value, ignore_compiled=False):
    stub_module_context = stub_value.get_root_context()
    if not stub_module_context.is_stub():
        return ValueSet([stub_value])

    decorates = None
    if isinstance(stub_value, Decoratee):
        decorates = stub_value._original_value

    was_instance = stub_value.is_instance()
    if was_instance:
        arguments = getattr(stub_value, '_arguments', None)
        stub_value = stub_value.py__class__()

    qualified_names = stub_value.get_qualified_names()
    if qualified_names is None:
        return NO_VALUES

    was_bound_method = stub_value.is_bound_method()
    if was_bound_method:
        # Infer the object first. We can infer the method later.
        method_name = qualified_names[-1]
        qualified_names = qualified_names[:-1]
        was_instance = True
        arguments = None

    values = _infer_from_stub(stub_module_context, qualified_names, ignore_compiled)
    if was_instance:
        values = ValueSet.from_sets(
            c.execute_with_values() if arguments is None else c.execute(arguments)
            for c in values
            if c.is_class()
        )
    if was_bound_method:
        # Now that the instance has been properly created, we can simply get
        # the method.
        values = values.py__getattribute__(method_name)
    if decorates is not None:
        values = ValueSet(Decoratee(v, decorates) for v in values)
    return values


def _infer_from_stub(stub_module_context, qualified_names, ignore_compiled):
    from erdos.erdos._vendor.jedi.inference.compiled.mixed import MixedObject
    stub_module = stub_module_context.get_value()
    assert isinstance(stub_module, (StubModuleValue, MixedObject)), stub_module_context
    non_stubs = stub_module.non_stub_value_set
    if ignore_compiled:
        non_stubs = non_stubs.filter(lambda c: not c.is_compiled())
    for name in qualified_names:
        non_stubs = non_stubs.py__getattribute__(name)
    return non_stubs


@to_list
def _try_stub_to_python_names(names, prefer_stub_to_compiled=False):
    for name in names:
        module_context = name.get_root_context()
        if not module_context.is_stub():
            yield name
            continue

        if name.api_type == 'module':
            values = convert_values(name.infer(), ignore_compiled=prefer_stub_to_compiled)
            if values:
                for v in values:
                    yield v.name
                continue
        else:
            v = name.get_defining_qualified_value()
            if v is not None:
                converted = _stub_to_python_value_set(v, ignore_compiled=prefer_stub_to_compiled)
                if converted:
                    converted_names = converted.goto(name.get_public_name())
                    if converted_names:
                        for n in converted_names:
                            if n.get_root_context().is_stub():
                                # If it's a stub again, it means we're going in
                                # a circle. Probably some imports make it a
                                # stub again.
                                yield name
                            else:
                                yield n
                        continue
        yield name


def _load_stub_module(module):
    if module.is_stub():
        return module
    return try_to_load_stub_cached(
        module.inference_state,
        import_names=module.string_names,
        python_value_set=ValueSet([module]),
        parent_module_value=None,
        sys_path=module.inference_state.get_sys_path(),
    )


@to_list
def _python_to_stub_names(names, fallback_to_python=False):
    for name in names:
        module_context = name.get_root_context()
        if module_context.is_stub():
            yield name
            continue

        if name.api_type == 'module':
            found_name = False
            for n in name.goto():
                if n.api_type == 'module':
                    values = convert_values(n.infer(), only_stubs=True)
                    for v in values:
                        yield v.name
                        found_name = True
                else:
                    for x in _python_to_stub_names([n], fallback_to_python=fallback_to_python):
                        yield x
                        found_name = True
            if found_name:
                continue
        else:
            v = name.get_defining_qualified_value()
            if v is not None:
                converted = to_stub(v)
                if converted:
                    converted_names = converted.goto(name.get_public_name())
                    if converted_names:
                        yield from converted_names
                        continue
        if fallback_to_python:
            # This is the part where if we haven't found anything, just return
            # the stub name.
            yield name


def convert_names(names, only_stubs=False, prefer_stubs=False, prefer_stub_to_compiled=True):
    if only_stubs and prefer_stubs:
        raise ValueError("You cannot use both of only_stubs and prefer_stubs.")

    with debug.increase_indent_cm('convert names'):
        if only_stubs or prefer_stubs:
            return _python_to_stub_names(names, fallback_to_python=prefer_stubs)
        else:
            return _try_stub_to_python_names(
                names, prefer_stub_to_compiled=prefer_stub_to_compiled)


def convert_values(values, only_stubs=False, prefer_stubs=False, ignore_compiled=True):
    assert not (only_stubs and prefer_stubs)
    with debug.increase_indent_cm('convert values'):
        if only_stubs or prefer_stubs:
            return ValueSet.from_sets(
                to_stub(value)
                or (ValueSet({value}) if prefer_stubs else NO_VALUES)
                for value in values
            )
        else:
            return ValueSet.from_sets(
                _stub_to_python_value_set(stub_value, ignore_compiled=ignore_compiled)
                or ValueSet({stub_value})
                for stub_value in values
            )


def to_stub(value):
    if value.is_stub():
        return ValueSet([value])

    was_instance = value.is_instance()
    if was_instance:
        value = value.py__class__()

    qualified_names = value.get_qualified_names()
    stub_module = _load_stub_module(value.get_root_context().get_value())
    if stub_module is None or qualified_names is None:
        return NO_VALUES

    was_bound_method = value.is_bound_method()
    if was_bound_method:
        # Infer the object first. We can infer the method later.
        method_name = qualified_names[-1]
        qualified_names = qualified_names[:-1]
        was_instance = True

    stub_values = ValueSet([stub_module])
    for name in qualified_names:
        stub_values = stub_values.py__getattribute__(name)

    if was_instance:
        stub_values = ValueSet.from_sets(
            c.execute_with_values()
            for c in stub_values
            if c.is_class()
        )
    if was_bound_method:
        # Now that the instance has been properly created, we can simply get
        # the method.
        stub_values = stub_values.py__getattribute__(method_name)
    return stub_values
