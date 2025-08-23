# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import pytest


@pytest.fixture
def docker_client() -> object:
    try:
        # NOTE: Actually connect with the docker sdk
        raise Exception("Docker client not available")
    except Exception:
        pytest.skip("Docker client not available")

    return object()


def test_docker_client(docker_client):
    assert False
