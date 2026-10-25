import pytest

from backend.data_store import store


@pytest.fixture(scope="session")
def loaded_store():
    if store.version == 0:
        store.load()
    return store
