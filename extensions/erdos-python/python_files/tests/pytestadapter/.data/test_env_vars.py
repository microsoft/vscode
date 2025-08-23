# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import os


def test_clear_env(monkeypatch):
    # Clear all environment variables
    monkeypatch.setattr(os, "environ", {})

    # Now os.environ should be empty
    assert not os.environ

    # After the test finishes, the environment variables will be reset to their original state


def test_check_env():
    # This test will have access to the original environment variables
    assert "PATH" in os.environ


def test_clear_env_unsafe():
    # Clear all environment variables
    os.environ.clear()
    # Now os.environ should be empty
    assert not os.environ


def test_check_env_unsafe():
    # ("PATH" in os.environ) is False here if it runs after test_clear_env_unsafe.
    # Regardless, this test will pass and TEST_PORT and TEST_UUID will still be set correctly
    assert "PATH" not in os.environ
