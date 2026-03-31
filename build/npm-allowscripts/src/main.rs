/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use serde::Deserialize;
use std::collections::BTreeMap;
use std::env;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{self, Command};

/// Lifecycle script names that npm auto-runs during install.
const LIFECYCLE_SCRIPTS: &[&str] = &["preinstall", "install", "postinstall"];

/// Represents the `allowScripts` configuration in package.json.
/// Maps package name → version pattern ("*", exact, or "major.minor.x").
#[derive(Debug, Deserialize)]
struct PackageJson {
    #[serde(default, rename = "allowScripts")]
    allow_scripts: BTreeMap<String, String>,
}

/// A dependency found in node_modules that has lifecycle scripts.
struct ScriptedPackage {
    name: String,
    version: String,
    dir: PathBuf,
    scripts: Vec<String>,
}

impl fmt::Display for ScriptedPackage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}@{} [{}]",
            self.name,
            self.version,
            self.scripts.join(", ")
        )
    }
}

#[derive(Debug, Deserialize)]
struct DepPackageJson {
    #[serde(default)]
    name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    scripts: BTreeMap<String, String>,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let mode = args.get(1).map(|s| s.as_str()).unwrap_or("exec");

    let cwd = env::current_dir().unwrap_or_else(|e| {
        eprintln!("error: could not determine current directory: {e}");
        process::exit(1);
    });

    // Read allowScripts config from the CWD's package.json.
    let config = load_config(&cwd).unwrap_or_else(|e| {
        eprintln!("error: failed to read allowScripts config from {}/package.json: {e}", cwd.display());
        process::exit(1);
    });

    // Find repo root for .npmrc config and PATH augmentation (node-gyp, etc.)
    let root = find_repo_root().unwrap_or_else(|| cwd.clone());
    let npmrc = parse_npmrc(&cwd.join(".npmrc"));

    let node_modules = cwd.join("node_modules");
    if !node_modules.is_dir() {
        eprintln!(
            "error: node_modules not found at {}",
            node_modules.display()
        );
        process::exit(1);
    }

    let scripted = discover_scripted_packages(&node_modules);

    match mode {
        "enforce" => run_enforce(&config, &scripted, &root, &npmrc),
        "audit" => run_audit(&config, &scripted),
        "exec" => run_exec(&config, &scripted, &root, &npmrc),
        _ => {
            eprintln!("usage: allow-scripts [enforce|audit|exec]");
            eprintln!();
            eprintln!("  enforce  Run allowed scripts, error on unapproved packages");
            eprintln!(
                "  audit    Report all packages with lifecycle scripts and their approval status"
            );
            eprintln!("  exec     (default) Run allowed scripts, skip unapproved without erroring");
            process::exit(1);
        }
    }
}

/// Walk up from CWD to find the repo root (a directory containing package.json with allowScripts).
fn find_repo_root() -> Option<PathBuf> {
    let mut dir = env::current_dir().ok()?;
    loop {
        let pkg = dir.join("package.json");
        if pkg.is_file() {
            if let Ok(content) = fs::read_to_string(&pkg) {
                if content.contains("\"allowScripts\"") {
                    return Some(dir);
                }
            }
        }
        if !dir.pop() {
            return None;
        }
    }
}

/// Load the allowScripts config from the repo root package.json.
fn load_config(root: &Path) -> Result<BTreeMap<String, String>, String> {
    let pkg_path = root.join("package.json");
    let content = fs::read_to_string(&pkg_path).map_err(|e| format!("read: {e}"))?;
    let pkg: PackageJson = serde_json::from_str(&content).map_err(|e| format!("parse: {e}"))?;
    Ok(pkg.allow_scripts)
}

/// Parse .npmrc key=value pairs into environment variable form (npm_config_<key>).
fn parse_npmrc(path: &Path) -> BTreeMap<String, String> {
    let mut result = BTreeMap::new();
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return result,
    };
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(eq_pos) = trimmed.find('=') {
            let key = trimmed[..eq_pos].trim();
            let value = trimmed[eq_pos + 1..].trim().trim_matches('"');
            result.insert(
                format!("npm_config_{}", key.replace('-', "_")),
                value.to_string(),
            );
        }
    }
    result
}

/// Scan node_modules for packages with lifecycle scripts.
fn discover_scripted_packages(node_modules: &Path) -> Vec<ScriptedPackage> {
    let mut result = Vec::new();

    // Scan direct children and scoped packages (@scope/pkg)
    let entries = match fs::read_dir(node_modules) {
        Ok(e) => e,
        Err(_) => return result,
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        if name.starts_with('@') {
            // Scoped package: scan children
            if let Ok(scoped_entries) = fs::read_dir(entry.path()) {
                for scoped_entry in scoped_entries.flatten() {
                    let sub_name = scoped_entry.file_name().to_string_lossy().to_string();
                    let full_name = format!("{name}/{sub_name}");
                    if let Some(pkg) = check_package(&scoped_entry.path(), &full_name) {
                        result.push(pkg);
                    }
                }
            }
        } else if let Some(pkg) = check_package(&entry.path(), &name) {
            result.push(pkg);
        }
    }

    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

/// Check if a single package directory has lifecycle scripts.
fn check_package(dir: &Path, name: &str) -> Option<ScriptedPackage> {
    let pkg_json_path = dir.join("package.json");
    let content = fs::read_to_string(&pkg_json_path).ok()?;
    let pkg: DepPackageJson = serde_json::from_str(&content).ok()?;

    let lifecycle_scripts: Vec<String> = LIFECYCLE_SCRIPTS
        .iter()
        .filter(|s| {
            pkg.scripts
                .get(**s)
                .map(|v| !v.trim().is_empty())
                .unwrap_or(false)
        })
        .map(|s| s.to_string())
        .collect();

    if lifecycle_scripts.is_empty() {
        return None;
    }

    Some(ScriptedPackage {
        name: if pkg.name.is_empty() {
            name.to_string()
        } else {
            pkg.name
        },
        version: pkg.version,
        dir: dir.to_path_buf(),
        scripts: lifecycle_scripts,
    })
}

/// Check if a package name+version is allowed by the config.
fn is_allowed(config: &BTreeMap<String, String>, name: &str, version: &str) -> bool {
    match config.get(name) {
        None => false,
        Some(pattern) => {
            if pattern == "*" || pattern.is_empty() {
                return true;
            }
            // Support exact version match or semver prefix match (e.g., "1.x", ">=1.0.0")
            // For simplicity, support: exact match, "*", or prefix with "x"
            if pattern == version {
                return true;
            }
            // Support "major.x" or "major.minor.x" patterns
            let pattern_parts: Vec<&str> = pattern.split('.').collect();
            let version_parts: Vec<&str> = version.split('.').collect();
            for (p, v) in pattern_parts.iter().zip(version_parts.iter()) {
                if *p == "x" || *p == "X" || *p == "*" {
                    return true;
                }
                if p != v {
                    return false;
                }
            }
            true
        }
    }
}

/// Run a lifecycle script for a specific package.
fn run_script(
    root: &Path,
    pkg: &ScriptedPackage,
    script: &str,
    npmrc: &BTreeMap<String, String>,
) -> bool {
    let pkg_json_path = pkg.dir.join("package.json");
    let content = match fs::read_to_string(&pkg_json_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let dep_pkg: DepPackageJson = match serde_json::from_str(&content) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let cmd = match dep_pkg.scripts.get(script) {
        Some(c) => c,
        None => return true, // no script to run
    };

    println!(
        "  \x1b[34m[{}@{}]\x1b[0m running {} ...",
        pkg.name, pkg.version, script
    );

    let shell = if cfg!(windows) { "cmd" } else { "sh" };
    let shell_flag = if cfg!(windows) { "/C" } else { "-c" };
    let mut command = Command::new(shell);
    command
        .args([shell_flag, cmd])
        .current_dir(&pkg.dir)
        .env("PATH", augment_path(root))
        .env(
            "npm_config_node_gyp",
            root.join("build")
                .join("npm")
                .join("gyp")
                .join("node_modules")
                .join(".bin")
                .join("node-gyp"),
        );

    // Propagate .npmrc config as npm_config_* env vars (disturl, target, runtime, etc.)
    for (key, value) in npmrc {
        if key != "npm_config_ignore_scripts" {
            command.env(key, value);
        }
    }

    let status = command.status();

    match status {
        Ok(s) if s.success() => true,
        Ok(s) => {
            eprintln!(
                "  \x1b[31m[{}@{}]\x1b[0m {} exited with code {}",
                pkg.name,
                pkg.version,
                script,
                s.code().unwrap_or(-1)
            );
            false
        }
        Err(e) => {
            eprintln!(
                "  \x1b[31m[{}@{}]\x1b[0m {} failed to execute: {}",
                pkg.name, pkg.version, script, e
            );
            false
        }
    }
}

/// Augment PATH with node_modules/.bin and the bundled node-gyp so native
/// rebuild tools are available when running lifecycle scripts.
fn augment_path(root: &Path) -> String {
    let bin_dir = root.join("node_modules").join(".bin");
    let gyp_dir = root
        .join("build")
        .join("npm")
        .join("gyp")
        .join("node_modules")
        .join(".bin");
    let current = env::var("PATH").unwrap_or_default();
    format!("{}:{}:{current}", bin_dir.display(), gyp_dir.display())
}

// ─── Modes ──────────────────────────────────────────────────────────────────

/// enforce: run allowed scripts, error if any unapproved package has lifecycle scripts.
fn run_enforce(
    config: &BTreeMap<String, String>,
    scripted: &[ScriptedPackage],
    root: &Path,
    npmrc: &BTreeMap<String, String>,
) {
    let mut allowed_pkgs = Vec::new();
    let mut blocked_pkgs = Vec::new();

    for pkg in scripted {
        if is_allowed(config, &pkg.name, &pkg.version) {
            allowed_pkgs.push(pkg);
        } else {
            blocked_pkgs.push(pkg);
        }
    }

    // Run allowed scripts
    if !allowed_pkgs.is_empty() {
        println!(
            "\x1b[1m\x1b[32m✓ Running lifecycle scripts for {} allowed package(s):\x1b[0m",
            allowed_pkgs.len()
        );
        let mut any_failed = false;
        for pkg in &allowed_pkgs {
            for script in &pkg.scripts {
                if !run_script(root, pkg, script, npmrc) {
                    any_failed = true;
                }
            }
        }
        if any_failed {
            eprintln!("\x1b[1m\x1b[31m✗ Some allowed scripts failed to execute.\x1b[0m");
            process::exit(1);
        }
    }

    // Report and error on blocked scripts
    if !blocked_pkgs.is_empty() {
        eprintln!();
        eprintln!(
            "\x1b[1m\x1b[31m✗ {} package(s) have lifecycle scripts NOT in the allowlist:\x1b[0m",
            blocked_pkgs.len()
        );
        for pkg in &blocked_pkgs {
            eprintln!("  \x1b[31m✗\x1b[0m {pkg}");
            for script in &pkg.scripts {
                let cmd = get_script_cmd(&pkg.dir, script).unwrap_or_default();
                eprintln!("      {script}: {cmd}");
            }
        }
        eprintln!();
        eprintln!("To approve, add the package to \"allowScripts.allowed\" in package.json.");
        eprintln!("To investigate, inspect the script content before approving.");
        process::exit(1);
    }

    println!("\x1b[1m\x1b[32m✓ All lifecycle scripts accounted for.\x1b[0m");
}

/// audit: report all scripted packages and their approval status.
fn run_audit(config: &BTreeMap<String, String>, scripted: &[ScriptedPackage]) {
    if scripted.is_empty() {
        println!("No packages with lifecycle scripts found.");
        return;
    }

    println!("\x1b[1mPackages with lifecycle scripts:\x1b[0m\n");

    let mut allowed_count = 0u32;
    let mut blocked_count = 0u32;

    for pkg in scripted {
        let approved = is_allowed(config, &pkg.name, &pkg.version);
        let marker = if approved {
            allowed_count += 1;
            "\x1b[32m✓\x1b[0m"
        } else {
            blocked_count += 1;
            "\x1b[31m✗\x1b[0m"
        };
        println!("  {marker} {pkg}");
        for script in &pkg.scripts {
            let cmd = get_script_cmd(&pkg.dir, script).unwrap_or_default();
            println!("      {script}: {cmd}");
        }
    }

    println!();
    println!(
        "  \x1b[32m{allowed_count} allowed\x1b[0m, \x1b[31m{blocked_count} blocked\x1b[0m, {} total",
        scripted.len()
    );

    // Also check for stale entries in allowlist that don't match any installed package
    let stale: Vec<&String> = config
        .keys()
        .filter(|name| !scripted.iter().any(|p| &p.name == *name))
        .collect();

    if !stale.is_empty() {
        println!();
        println!("\x1b[33m⚠ Stale allowlist entries (no matching installed package):\x1b[0m");
        for name in &stale {
            println!("  - {name}");
        }
    }
}

/// exec: run allowed scripts, silently skip unapproved (no error).
fn run_exec(
    config: &BTreeMap<String, String>,
    scripted: &[ScriptedPackage],
    root: &Path,
    npmrc: &BTreeMap<String, String>,
) {
    let allowed: Vec<&ScriptedPackage> = scripted
        .iter()
        .filter(|pkg| is_allowed(config, &pkg.name, &pkg.version))
        .collect();

    if allowed.is_empty() {
        println!("No allowed packages with lifecycle scripts to run.");
        return;
    }

    println!(
        "\x1b[1m\x1b[32m✓ Running lifecycle scripts for {} allowed package(s):\x1b[0m",
        allowed.len()
    );
    let mut any_failed = false;
    for pkg in &allowed {
        for script in &pkg.scripts {
            if !run_script(root, pkg, script, npmrc) {
                any_failed = true;
            }
        }
    }

    if any_failed {
        eprintln!("\x1b[1m\x1b[31m✗ Some scripts failed.\x1b[0m");
        process::exit(1);
    }

    println!("\x1b[1m\x1b[32m✓ Done.\x1b[0m");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn get_script_cmd(dir: &Path, script: &str) -> Option<String> {
    let content = fs::read_to_string(dir.join("package.json")).ok()?;
    let pkg: DepPackageJson = serde_json::from_str(&content).ok()?;
    pkg.scripts.get(script).cloned()
}
