"""
Tests for CognifactAgent.

Run with:  pytest cognifact/test_cognifact_agent.py -v
"""

import pytest
from cognifact_agent import CognifactAgent


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def agent():
    return CognifactAgent()


GOOD_IMPL = "def add(a, b):\n    return a + b\n"
BAD_IMPL  = "def add(a, b):\n    return a - b\n"   # subtraction instead
ERR_IMPL  = "def add(a, b):\n    return a / b\n"   # will cause ZeroDivisionError on 0+0


# ---------------------------------------------------------------------------
# initialize_cognifact
# ---------------------------------------------------------------------------

class TestInitializeCognifact:
    def test_cognifact_is_not_none_after_init(self, agent):
        assert agent.cognifact is not None

    def test_initial_cognifact_contains_test_function(self, agent):
        assert "def test_addition" in agent.cognifact

    def test_initial_cognifact_contains_assertions(self, agent):
        assert "assert add" in agent.cognifact

    def test_reinitialize_resets_to_base(self, agent):
        agent.write_test("something else")
        agent.initialize_cognifact()
        assert "def test_addition" in agent.cognifact


# ---------------------------------------------------------------------------
# get_cognifact
# ---------------------------------------------------------------------------

class TestGetCognifact:
    def test_returns_string(self, agent):
        assert isinstance(agent.get_cognifact(), str)

    def test_returns_same_as_attribute(self, agent):
        assert agent.get_cognifact() == agent.cognifact

    def test_reflects_updates(self, agent):
        agent.write_test("sorting")
        assert agent.get_cognifact() == agent.cognifact


# ---------------------------------------------------------------------------
# write_test
# ---------------------------------------------------------------------------

class TestWriteTest:
    def test_returns_string(self, agent):
        result = agent.write_test("addition")
        assert isinstance(result, str)

    def test_updates_internal_cognifact(self, agent):
        result = agent.write_test("addition")
        assert agent.cognifact == result

    def test_function_name_derived_from_spec(self, agent):
        agent.write_test("addition function with edge cases")
        assert "def test_addition_function_with_edge_cases" in agent.cognifact

    def test_spaces_replaced_with_underscores(self, agent):
        agent.write_test("my fancy spec")
        assert "def test_my_fancy_spec" in agent.cognifact

    def test_spec_appears_in_docstring(self, agent):
        spec = "addition edge cases"
        agent.write_test(spec)
        assert spec in agent.cognifact

    def test_contains_assertions(self, agent):
        agent.write_test("some spec")
        assert "assert add" in agent.cognifact

    def test_overwrites_previous_cognifact(self, agent):
        agent.write_test("first spec")
        first = agent.cognifact
        agent.write_test("second spec")
        assert agent.cognifact != first
        assert "second_spec" in agent.cognifact


# ---------------------------------------------------------------------------
# validate_test
# ---------------------------------------------------------------------------

class TestValidateTest:
    def test_good_impl_passes(self, agent):
        passed, msg = agent.validate_test(GOOD_IMPL)
        assert passed is True

    def test_good_impl_message_indicates_success(self, agent):
        _, msg = agent.validate_test(GOOD_IMPL)
        assert "passed" in msg.lower() or "✅" in msg

    def test_bad_impl_fails(self, agent):
        passed, _ = agent.validate_test(BAD_IMPL)
        assert passed is False

    def test_bad_impl_message_indicates_failure(self, agent):
        _, msg = agent.validate_test(BAD_IMPL)
        assert "assertion failed" in msg.lower() or "❌" in msg

    def test_error_impl_returns_false(self, agent):
        passed, msg = agent.validate_test(ERR_IMPL)
        assert passed is False
        assert "Error" in msg or "❌" in msg

    def test_missing_add_function_returns_false(self, agent):
        impl_without_add = "x = 1\n"
        passed, msg = agent.validate_test(impl_without_add)
        assert passed is False

    def test_validate_after_write_test_good_impl(self, agent):
        agent.write_test("addition with edge cases")
        passed, _ = agent.validate_test(GOOD_IMPL)
        assert passed is True

    def test_validate_after_write_test_bad_impl(self, agent):
        agent.write_test("addition with edge cases")
        passed, _ = agent.validate_test(BAD_IMPL)
        assert passed is False

    def test_does_not_pollute_global_namespace(self, agent):
        agent.validate_test(GOOD_IMPL)
        assert "add" not in dir()  # exec'd into isolated namespace


# ---------------------------------------------------------------------------
# update_test
# ---------------------------------------------------------------------------

class TestUpdateTest:
    def test_returns_string(self, agent):
        result = agent.update_test("some reason")
        assert isinstance(result, str)

    def test_appends_failure_reason(self, agent):
        reason = "subtraction bug detected"
        agent.update_test(reason)
        assert reason in agent.cognifact

    def test_appends_robustness_comment(self, agent):
        agent.update_test("any reason")
        assert "robustness check" in agent.cognifact

    def test_original_content_preserved(self, agent):
        original = agent.cognifact
        agent.update_test("extra info")
        assert original in agent.cognifact

    def test_multiple_updates_accumulate(self, agent):
        agent.update_test("first failure")
        agent.update_test("second failure")
        assert "first failure" in agent.cognifact
        assert "second failure" in agent.cognifact

    def test_updated_cognifact_still_passes_good_impl(self, agent):
        agent.update_test("spurious update")
        passed, _ = agent.validate_test(GOOD_IMPL)
        assert passed is True


# ---------------------------------------------------------------------------
# compute_loss
# ---------------------------------------------------------------------------

class TestComputeLoss:
    def test_zero_loss_when_equal(self, agent):
        assert agent.compute_loss(5, 5) == 0.0

    def test_one_loss_when_not_equal(self, agent):
        assert agent.compute_loss(7, 5) == 1.0

    def test_returns_float(self, agent):
        assert isinstance(agent.compute_loss(1, 2), float)

    def test_zero_vs_zero(self, agent):
        assert agent.compute_loss(0, 0) == 0.0

    def test_none_equality(self, agent):
        assert agent.compute_loss(None, None) == 0.0

    def test_string_equality(self, agent):
        assert agent.compute_loss("hello", "hello") == 0.0

    def test_string_inequality(self, agent):
        assert agent.compute_loss("hello", "world") == 1.0

    def test_type_mismatch_is_loss(self, agent):
        # int 5 vs string "5" are not equal
        assert agent.compute_loss(5, "5") == 1.0


# ---------------------------------------------------------------------------
# Integration: full repair loop
# ---------------------------------------------------------------------------

class TestRepairLoop:
    def test_bad_impl_triggers_update_then_good_impl_passes(self, agent):
        agent.write_test("addition")

        passed, _ = agent.validate_test(BAD_IMPL)
        assert passed is False

        agent.update_test("bad impl detected")

        passed, _ = agent.validate_test(GOOD_IMPL)
        assert passed is True

    def test_loss_zero_after_good_validation(self, agent):
        agent.write_test("addition")
        passed, _ = agent.validate_test(GOOD_IMPL)
        loss = agent.compute_loss(passed, True)
        assert loss == 0.0

    def test_loss_one_after_bad_validation(self, agent):
        agent.write_test("addition")
        passed, _ = agent.validate_test(BAD_IMPL)
        loss = agent.compute_loss(passed, True)
        assert loss == 1.0
