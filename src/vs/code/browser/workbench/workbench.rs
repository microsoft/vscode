use wasm_bindgen::prelude::*;
use web_sys::{window, Document, Element};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[wasm_bindgen(start)]
pub fn main() -> Result<(), JsValue> {
    let document = window().unwrap().document().unwrap();
    let body = document.body().unwrap();

    let workspace_provider = WorkspaceProvider::new();
    let secret_storage_provider = LocalStorageSecretStorageProvider::new();
    let url_callback_provider = LocalStorageURLCallbackProvider::new();

    // Initialize the workbench with the providers
    initialize_workbench(&document, &workspace_provider, &secret_storage_provider, &url_callback_provider);

    Ok(())
}

fn initialize_workbench(
    document: &Document,
    workspace_provider: &WorkspaceProvider,
    secret_storage_provider: &LocalStorageSecretStorageProvider,
    url_callback_provider: &LocalStorageURLCallbackProvider,
) {
    // Example initialization logic
    let workbench_element = document.create_element("div").unwrap();
    workbench_element.set_inner_html("Welcome to the Rust-based Workbench!");
    document.body().unwrap().append_child(&workbench_element).unwrap();
}

#[derive(Serialize, Deserialize)]
struct Workspace {
    folder_uri: Option<String>,
    workspace_uri: Option<String>,
}

struct WorkspaceProvider {
    workspace: Option<Workspace>,
    payload: HashMap<String, String>,
}

impl WorkspaceProvider {
    fn new() -> Self {
        // Example initialization logic
        let workspace = Some(Workspace {
            folder_uri: Some("folder_uri_example".to_string()),
            workspace_uri: Some("workspace_uri_example".to_string()),
        });

        let payload = HashMap::new();

        WorkspaceProvider { workspace, payload }
    }

    fn open(&self, workspace: Workspace) {
        // Example open logic
        if let Some(folder_uri) = &workspace.folder_uri {
            web_sys::console::log_1(&format!("Opening folder: {}", folder_uri).into());
        } else if let Some(workspace_uri) = &workspace.workspace_uri {
            web_sys::console::log_1(&format!("Opening workspace: {}", workspace_uri).into());
        } else {
            web_sys::console::log_1(&"Opening empty workspace".into());
        }
    }
}

struct LocalStorageSecretStorageProvider;

impl LocalStorageSecretStorageProvider {
    fn new() -> Self {
        LocalStorageSecretStorageProvider
    }

    fn get(&self, key: &str) -> Option<String> {
        // Example get logic
        web_sys::window()
            .unwrap()
            .local_storage()
            .unwrap()
            .unwrap()
            .get_item(key)
            .unwrap()
    }

    fn set(&self, key: &str, value: &str) {
        // Example set logic
        web_sys::window()
            .unwrap()
            .local_storage()
            .unwrap()
            .unwrap()
            .set_item(key, value)
            .unwrap();
    }

    fn delete(&self, key: &str) {
        // Example delete logic
        web_sys::window()
            .unwrap()
            .local_storage()
            .unwrap()
            .unwrap()
            .remove_item(key)
            .unwrap();
    }
}

struct LocalStorageURLCallbackProvider;

impl LocalStorageURLCallbackProvider {
    fn new() -> Self {
        LocalStorageURLCallbackProvider
    }

    fn create(&self, options: Option<HashMap<String, String>>) -> String {
        // Example create logic
        let mut url = web_sys::window().unwrap().location().href().unwrap();
        if let Some(options) = options {
            for (key, value) in options {
                url.push_str(&format!("&{}={}", key, value));
            }
        }
        url
    }

    fn on_callback(&self, callback: Box<dyn Fn(String)>) {
        // Example on_callback logic
        let closure = Closure::wrap(callback);
        web_sys::window()
            .unwrap()
            .add_event_listener_with_callback("storage", closure.as_ref().unchecked_ref())
            .unwrap();
        closure.forget();
    }
}
