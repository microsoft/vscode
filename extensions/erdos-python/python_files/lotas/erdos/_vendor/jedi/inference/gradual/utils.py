from pathlib import Path

from erdos._vendor.jedi.inference.gradual.typeshed import TYPESHED_PATH, create_stub_module


def load_proper_stub_module(inference_state, grammar, file_io, import_names, module_node):
    """
    This function is given a random .pyi file and should return the proper
    module.
    """
    path = file_io.path
    path = Path(path)
    assert path.suffix == '.pyi'
    try:
        relative_path = path.relative_to(TYPESHED_PATH)
    except ValueError:
        pass
    else:
        # /[...]/stdlib/3/os/__init__.pyi -> stdlib/3/os/__init__
        rest = relative_path.with_suffix('')
        # Remove the stdlib/3 or third_party/3.6 part
        import_names = rest.parts[2:]
        if rest.name == '__init__':
            import_names = import_names[:-1]

    if import_names is not None:
        actual_value_set = inference_state.import_module(import_names, prefer_stubs=False)

        stub = create_stub_module(
            inference_state, grammar, actual_value_set,
            module_node, file_io, import_names
        )
        inference_state.stub_module_cache[import_names] = stub
        return stub
    return None
