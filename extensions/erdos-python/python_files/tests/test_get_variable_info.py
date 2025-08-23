import get_variable_info


def set_global_variable(value):
    # setting on the module allows tests to set a variable that the module under test can access
    get_variable_info.test_variable = value  # pyright: ignore[reportGeneralTypeIssues]


def get_global_variable():
    results = get_variable_info.getVariableDescriptions()
    for variable in results:
        if variable["name"] == "test_variable":
            return variable
    return None


def assert_variable_found(variable, expected_value, expected_type, expected_count=None):
    set_global_variable(variable)
    variable = get_global_variable()
    assert variable is not None
    if expected_value is not None:
        assert variable["value"] == expected_value
    assert variable["type"] == expected_type
    if expected_count is not None:
        assert variable["count"] == expected_count
    else:
        assert "count" not in variable
    return variable


def assert_indexed_child(variable, start_index, expected_index, expected_child_value=None):
    children = get_variable_info.getAllChildrenDescriptions(
        variable["root"], variable["propertyChain"], start_index
    )
    child = children[expected_index]

    if expected_child_value is not None:
        assert child["value"] == expected_child_value
    return child


def assert_property(variable, expected_property_name, expected_property_value=None):
    children = get_variable_info.getAllChildrenDescriptions(
        variable["root"], variable["propertyChain"], 0
    )
    found = None
    for child in children:
        chain = child["propertyChain"]
        property_name = chain[-1] if chain else None
        if property_name == expected_property_name:
            found = child
            break

    assert found is not None
    if expected_property_value is not None:
        assert found["value"] == expected_property_value
    return found


def test_simple():
    assert_variable_found(1, "1", "int", None)


def test_list():
    found = assert_variable_found([1, 2, 3], "[1, 2, 3]", "list", 3)
    assert_indexed_child(found, 0, 0, "1")


def test_dict():
    found = assert_variable_found({"a": 1, "b": 2}, "{'a': 1, 'b': 2}", "dict", None)
    assert found["hasNamedChildren"]
    assert_property(found, "a", "1")
    assert_property(found, "b", "2")


def test_tuple():
    found = assert_variable_found((1, 2, 3), "(1, 2, 3)", "tuple", 3)
    assert_indexed_child(found, 0, 0, "1")


def test_set():
    found = assert_variable_found({1, 2, 3}, "{1, 2, 3}", "set", 3)
    assert_indexed_child(found, 0, 0, "1")


def test_self_referencing_dict():
    d = {}
    d["self"] = d
    found = assert_variable_found(d, "{'self': {...}}", "dict", None)
    assert_property(found, "self", "{'self': {...}}")


def test_nested_list():
    found = assert_variable_found([[1, 2], [3, 4]], "[[1, 2], [3, 4]]", "list", 2)
    assert_indexed_child(found, 0, 0, "[1, 2]")


def test_long_list():
    child = assert_variable_found(list(range(1_000_000)), None, "list", 1_000_000)
    value = child["value"]
    assert value.startswith("[0, 1, 2, 3")
    assert value.endswith("...]")
    assert_indexed_child(child, 400_000, 10, "400010")
    assert_indexed_child(child, 999_950, 10, "999960")


def test_get_nested_children():
    d = [{"a": {("hello")}}]
    found = assert_variable_found(d, "[{'a': {...}}]", "list", 1)

    found = assert_indexed_child(found, 0, 0)
    found = assert_property(found, "a")
    found = assert_indexed_child(found, 0, 0)
    assert found["value"] == "'hello'"
