import os
import re
import sys
import json
import tempfile
import uuid

from chat.ask_codebase.store.qdrant import QdrantWrapper as Q, get_client
from chat.ask_codebase.indexing.embedding import EmbeddingWrapper as E

from langchain.embeddings import HuggingFaceEmbeddings
from chat.ask_codebase.indexing.loader.file import (
    FileLoader,
    FileSource,
    gen_local_reference_maker,
)
from chat.util.misc import is_source_code
from chat.ask_codebase.chains.simple_qa import SimpleQA
from chat.ask_codebase.chains.stuff_dc_qa import StuffDocumentCodeQa


def get_app_data_dir(app_name):
    home = os.path.expanduser("~")
    if os.name == "nt":  # For Windows
        appPath = os.path.join(home, "AppData", "Roaming", app_name)
    else:  # For Unix and Linux
        appPath = os.path.join(home, ".local", "share", app_name)
    
    if not os.path.exists(appPath):
        os.makedirs(appPath)
    return appPath

supportedFileTypes = []

STORAGE_FILE = os.path.join(get_app_data_dir("devchat"), "qdrant_storage2")
SOURCE_NAME = ""


def query(question: str):
    try:
        client = get_client(mode=STORAGE_FILE)
        q = Q.reuse(
            source_name=SOURCE_NAME,
            embedding_cls=HuggingFaceEmbeddings,
            client=client,
        )

        chain = StuffDocumentCodeQa(q)

        _, docs = chain.run(question)
        
        for d in docs:
            print(d.metadata.get('filepath'))
            print(d.page_content)

        sys.exit(0)
    except Exception as e:
        print(e)
        sys.exit(1)


if __name__ == "__main__":
    try:
        if os.path.exists(".chat/askcode.json"):
            with open(".chat/askcode.json", "r") as f:
                askcode_data = json.load(f)
                SOURCE_NAME = askcode_data.get("SOURCE_NAME", str(uuid.uuid4()))
        else:
            SOURCE_NAME = str(uuid.uuid4())
            with open(".chat/askcode.json", "w+") as f:
                json.dump({"SOURCE_NAME": SOURCE_NAME}, f)
        query(sys.argv[1])
        sys.exit(0)
    except Exception as e:
        print(e)
        sys.exit(1)