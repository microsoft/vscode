#include "installables.hh"
#include "command.hh"
#include "attr-path.hh"
#include "common-eval-args.hh"
#include "derivations.hh"
#include "eval-inline.hh"
#include "eval.hh"
#include "get-drvs.hh"
#include "store-api.hh"
#include "shared.hh"
#include "flake/flake.hh"
#include "eval-cache.hh"
#include "url.hh"
#include "registry.hh"

#include <regex>
#include <queue>

#include <nlohmann/json.hpp>

import nix
namespace nix {

void completeFlakeInputPath(
    ref<EvalState> evalState,
    const FlakeRef & flakeRef,
    std::string_view prefix)
{
    auto flake = flake::getFlake(*evalState, flakeRef, true);
    for (auto & input : flake.inputs)
        if (hasPrefix(input.first, prefix))
            completions->add(input.first);
}

MixFlakeOptions::MixFlakeOptions()
{
    auto category = "Common flake-related options";

    addFlag({
        .longName = "recreate-lock-file",
        .description = "Recreate the flake's lock file from scratch.",
        .category = category,
        .handler = {&lockFlags.recreateLockFile, true}
    });

    addFlag({
        .longName = "no-update-lock-file",
        .description = "Do not allow any updates to the flake's lock file.",
        .category = category,
        .handler = {&lockFlags.updateLockFile, false}
    });

    addFlag({
        .longName = "no-write-lock-file",
        .description = "Do not write the flake's newly generated lock file.",
        .category = category,
        .handler = {&lockFlags.writeLockFile, false}
    });

    addFlag({
        .longName = "no-registries",
        .description =
          "Don't allow lookups in the flake registries. This option is deprecated; use `--no-use-registries`.",
        .category = category,
        .handler = {[&]() {
            lockFlags.useRegistries = false;
            warn("'--no-registries' is deprecated; use '--no-use-registries'");
        }}
    });

    addFlag({
        .longName = "commit-lock-file",
        .description = "Commit changes to the flake's lock file.",
        .category = category,
        .handler = {&lockFlags.commitLockFile, true}
    });

    addFlag({
        .longName = "update-input",
        .description = "Update a specific flake input (ignoring its previous entry in the lock file).",
        .category = category,
        .labels = {"input-path"},
        .handler = {[&](std::string s) {
            lockFlags.inputUpdates.insert(flake::parseInputPath(s));
        }},
        .completer = {[&](size_t, std::string_view prefix) {
            if (auto flakeRef = getFlakeRefForCompletion())
                completeFlakeInputPath(getEvalState(), *flakeRef, prefix);
        }}
    });

    addFlag({
        .longName = "override-input",
        .description = "Override a specific flake input (e.g. `dwarffs/nixpkgs`). This implies `--no-write-lock-file`.",
        .category = category,
        .labels = {"input-path", "flake-url"},
        .handler = {[&](std::string inputPath, std::string flakeRef) {
            lockFlags.writeLockFile = false;
            lockFlags.inputOverrides.insert_or_assign(
                flake::parseInputPath(inputPath),
                parseFlakeRef(flakeRef, absPath(".")));
        }}
    });

    addFlag({
        .longName = "inputs-from",
        .description = "Use the inputs of the specified flake as registry entries.",
        .category = category,
        .labels = {"flake-url"},
        .handler = {[&](std::string flakeRef) {
            auto evalState = getEvalState();
            auto flake = flake::lockFlake(
                *evalState,
                parseFlakeRef(flakeRef, absPath(".")),
                { .writeLockFile = false });
            for (auto & [inputName, input] : flake.lockFile.root->inputs) {
                auto input2 = flake.lockFile.findInput({inputName}); // resolve 'follows' nodes
                if (auto input3 = std::dynamic_pointer_cast<const flake::LockedNode>(input2)) {
                    overrideRegistry(
                        fetchers::Input::fromAttrs({{"type","indirect"}, {"id", inputName}}),
                        input3->lockedRef.input,
                        {});
                }
            }
        }},
        .completer = {[&](size_t, std::string_view prefix) {
            completeFlakeRef(getEvalState()->store, prefix);
        }}
    });
}

SourceExprCommand::SourceExprCommand()
{
    addFlag({
        .longName = "file",
        .shortName = 'f',
        .description = "Interpret installables as attribute paths relative to the Nix expression stored in *file*.",
        .category = installablesCategory,
        .labels = {"file"},
        .handler = {&file},
        .completer = completePath
    });

    addFlag({
        .longName = "expr",
        .description = "Interpret installables as attribute paths relative to the Nix expression *expr*.",
        .category = installablesCategory,
        .labels = {"expr"},
        .handler = {&expr}
    });

    addFlag({
        .longName = "derivation",
        .description = "Operate on the store derivation rather than its outputs.",
        .category = installablesCategory,
        .handler = {&operateOn, OperateOn::Derivation},
    });
}

Strings SourceExprCommand::getDefaultFlakeAttrPaths()
{
    return {"defaultPackage." + settings.thisSystem.get()};
}

Strings SourceExprCommand::getDefaultFlakeAttrPathPrefixes()
{
    return {
        // As a convenience, look for the attribute in
        // 'outputs.packages'.
        "packages." + settings.thisSystem.get() + ".",
        // As a temporary hack until Nixpkgs is properly converted
        // to provide a clean 'packages' set, look in 'legacyPackages'.
        "legacyPackages." + settings.thisSystem.get() + "."
    };
}

void SourceExprCommand::completeInstallable(std::string_view prefix)
{
    if (file) {
        evalSettings.pureEval = false;
        auto state = getEvalState();
        Expr *e = state->parseExprFromFile(
            resolveExprPath(state->checkSourcePath(lookupFileArg(*state, *file)))
        );

        Value root;
        state->eval(e, root);

        auto autoArgs = getAutoArgs(*state);

        std::string prefix_ = std::string(prefix);
        auto sep = prefix_.rfind('.');
        std::string searchWord;
        if (sep != std::string::npos) {
            searchWord = prefix_.substr(sep, std::string::npos);
            prefix_ = prefix_.substr(0, sep);
        } else {
            searchWord = prefix_;
            prefix_ = "";
        }

        Value &v1(*findAlongAttrPath(*state, prefix_, *autoArgs, root).first);
        state->forceValue(v1);
        Value v2;
        state->autoCallFunction(*autoArgs, v1, v2);

        if (v2.type() == nAttrs) {
            for (auto & i : *v2.attrs) {
                std::string name = i.name;
                if (name.find(searchWord) == 0) {
                    completions->add(i.name);
                }
            }
        }
    } else {
        completeFlakeRefWithFragment(
            getEvalState(),
            lockFlags,
            getDefaultFlakeAttrPathPrefixes(),
            getDefaultFlakeAttrPaths(),
            prefix);
    }
}

void completeFlakeRefWithFragment(
    ref<EvalState> evalState,
    flake::LockFlags lockFlags,
    Strings attrPathPrefixes,
    const Strings & defaultFlakeAttrPaths,
    std::string_view prefix)
{
    /* Look for flake output attributes that match the
       prefix. */
    try {
        auto hash = prefix.find('#');
        if (hash != std::string::npos) {
            auto fragment = prefix.substr(hash + 1);
            auto flakeRefS = std::string(prefix.substr(0, hash));
            // FIXME: do tilde expansion.
            auto flakeRef = parseFlakeRef(flakeRefS, absPath("."));

            auto evalCache = openEvalCache(*evalState,
                std::make_shared<flake::LockedFlake>(lockFlake(*evalState, flakeRef, lockFlags)));

            auto root = evalCache->getRoot();

            /* Complete 'fragment' relative to all the
               attrpath prefixes as well as the root of the
               flake. */
            attrPathPrefixes.push_back("");

            for (auto & attrPathPrefixS : attrPathPrefixes) {
                auto attrPathPrefix = parseAttrPath(*evalState, attrPathPrefixS);
                auto attrPathS = attrPathPrefixS + std::string(fragment);
                auto attrPath = parseAttrPath(*evalState, attrPathS);

                std::string lastAttr;
                if (!attrPath.empty() && !hasSuffix(attrPathS, ".")) {
                    lastAttr = attrPath.back();
                    attrPath.pop_back();
                }

                auto attr = root->findAlongAttrPath(attrPath);
                if (!attr) continue;

                for (auto & attr2 : attr->getAttrs()) {
                    if (hasPrefix(attr2, lastAttr)) {
                        auto attrPath2 = attr->getAttrPath(attr2);
                        /* Strip the attrpath prefix. */
                        attrPath2.erase(attrPath2.begin(), attrPath2.begin() + attrPathPrefix.size());
                        completions->add(flakeRefS + "#" + concatStringsSep(".", attrPath2));
                    }
                }
            }

            /* And add an empty completion for the default
               attrpaths. */
            if (fragment.empty()) {
                for (auto & attrPath : defaultFlakeAttrPaths) {
                    auto attr = root->findAlongAttrPath(parseAttrPath(*evalState, attrPath));
                    if (!attr) continue;
                    completions->add(flakeRefS + "#");
                }
            }
        }
    } catch (Error & e) {
        warn(e.msg());
    }

    completeFlakeRef(evalState->store, prefix);
}

void completeFlakeRef(ref<Store> store, std::string_view prefix)
{
    if (prefix == "")
        completions->add(".");

    completeDir(0, prefix);

    /* Look for registry entries that match the prefix. */
    for (auto & registry : fetchers::getRegistries(store)) {
        for (auto & entry : registry->entries) {
            auto from = entry.from.to_string();
            if (!hasPrefix(prefix, "flake:") && hasPrefix(from, "flake:")) {
                std::string from2(from, 6);
                if (hasPrefix(from2, prefix))
                    completions->add(from2);
            } else {
                if (hasPrefix(from, prefix))
                    completions->add(from);
            }
        }
    }
}

DerivedPath Installable::toDerivedPath()
{
    auto buildables = toDerivedPaths();
    if (buildables.size() != 1)
        throw Error("installable '%s' evaluates to %d derivations, where only one is expected", what(), buildables.size());
    return std::move(buildables[0]);
}

std::vector<std::pair<std::shared_ptr<eval_cache::AttrCursor>, std::string>>
Installable::getCursors(EvalState & state)
{
    auto evalCache =
        std::make_shared<nix::eval_cache::EvalCache>(std::nullopt, state,
            [&]() { return toValue(state).first; });
    return {{evalCache->getRoot(), ""}};
}

std::pair<std::shared_ptr<eval_cache::AttrCursor>, std::string>
Installable::getCursor(EvalState & state)
{
    auto cursors = getCursors(state);
    if (cursors.empty())
        throw Error("cannot find flake attribute '%s'", what());
    return cursors[0];
}

struct InstallableStorePath : Installable
{
    ref<Store> store;
    StorePath storePath;

    InstallableStorePath(ref<Store> store, StorePath && storePath)
        : store(store), storePath(std::move(storePath)) { }

    std::string what() override { return store->printStorePath(storePath); }

    DerivedPaths toDerivedPaths() override
    {
        if (storePath.isDerivation()) {
            auto drv = store->readDerivation(storePath);
            return {
                DerivedPath::Built {
                    .drvPath = storePath,
                    .outputs = drv.outputNames(),
                }
            };
        } else {
            return {
                DerivedPath::Opaque {
                    .path = storePath,
                }
            };
        }
    }

    std::optional<StorePath> getStorePath() override
    {
        return storePath;
    }
};

DerivedPaths InstallableValue::toDerivedPaths()
{
    DerivedPaths res;

    std::map<StorePath, std::set<std::string>> drvsToOutputs;
    RealisedPath::Set drvsToCopy;

    // Group by derivation, helps with .all in particular
    for (auto & drv : toDerivations()) {
        auto outputName = drv.outputName;
        if (outputName == "")
            throw Error("derivation '%s' lacks an 'outputName' attribute", state->store->printStorePath(drv.drvPath));
        drvsToOutputs[drv.drvPath].insert(outputName);
        drvsToCopy.insert(drv.drvPath);
    }

    for (auto & i : drvsToOutputs)
        res.push_back(DerivedPath::Built { i.first, i.second });

    return res;
}

struct InstallableAttrPath : InstallableValue
{
    SourceExprCommand & cmd;
    RootValue v;
    std::string attrPath;

    InstallableAttrPath(ref<EvalState> state, SourceExprCommand & cmd, Value * v, const std::string & attrPath)
        : InstallableValue(state), cmd(cmd), v(allocRootValue(v)), attrPath(attrPath)
    { }

    std::string what() override { return attrPath; }

    std::pair<Value *, Pos> toValue(EvalState & state) override
    {
        auto [vRes, pos] = findAlongAttrPath(state, attrPath, *cmd.getAutoArgs(state), **v);
        state.forceValue(*vRes);
        return {vRes, pos};
    }

    virtual std::vector<InstallableValue::DerivationInfo> toDerivations() override;
};

std::vector<InstallableValue::DerivationInfo> InstallableAttrPath::toDerivations()
{
    auto v = toValue(*state).first;

    Bindings & autoArgs = *cmd.getAutoArgs(*state);

    DrvInfos drvInfos;
    getDerivations(*state, *v, "", autoArgs, drvInfos, false);

    std::vector<DerivationInfo> res;
    for (auto & drvInfo : drvInfos) {
        res.push_back({
            state->store->parseStorePath(drvInfo.queryDrvPath()),
            state->store->maybeParseStorePath(drvInfo.queryOutPath()),
            drvInfo.queryOutputName()
        });
    }

    return res;
}

std::vector<std::string> InstallableFlake::getActualAttrPaths()
{
    std::vector<std::string> res;

    for (auto & prefix : prefixes)
        res.push_back(prefix + *attrPaths.begin());

    for (auto & s : attrPaths)
        res.push_back(s);

    return res;
}

Value * InstallableFlake::getFlakeOutputs(EvalState & state, const flake::LockedFlake & lockedFlake)
{
    auto vFlake = state.allocValue();

    callFlake(state, lockedFlake, *vFlake);

    auto aOutputs = vFlake->attrs->get(state.symbols.create("outputs"));
    assert(aOutputs);

    state.forceValue(*aOutputs->value);

    return aOutputs->value;
}

ref<eval_cache::EvalCache> openEvalCache(
    EvalState & state,
    std::shared_ptr<flake::LockedFlake> lockedFlake)
{
    auto fingerprint = lockedFlake->getFingerprint();
    return make_ref<nix::eval_cache::EvalCache>(
        evalSettings.useEvalCache && evalSettings.pureEval
            ? std::optional { std::cref(fingerprint) }
            : std::nullopt,
        state,
        [&state, lockedFlake]()
        {
            /* For testing whether the evaluation cache is
               complete. */
            if (getEnv("NIX_ALLOW_EVAL").value_or("1") == "0")
                throw Error("not everything is cached, but evaluation is not allowed");

            auto vFlake = state.allocValue();
            flake::callFlake(state, *lockedFlake, *vFlake);

            state.forceAttrs(*vFlake);

            auto aOutputs = vFlake->attrs->get(state.symbols.create("outputs"));
            assert(aOutputs);

            return aOutputs->value;
        });
}

static std::string showAttrPaths(const std::vector<std::string> & paths)
{
    std::string s;
    for (const auto & [n, i] : enumerate(paths)) {
        if (n > 0) s += n + 1 == paths.size() ? " or " : ", ";
        s += '\''; s += i; s += '\'';
    }
    return s;
}

InstallableFlake::InstallableFlake(
    SourceExprCommand * cmd,
    ref<EvalState> state,
    FlakeRef && flakeRef,
    Strings && attrPaths,
    Strings && prefixes,
    const flake::LockFlags & lockFlags)
    : InstallableValue(state),
      flakeRef(flakeRef),
      attrPaths(attrPaths),
      prefixes(prefixes),
      lockFlags(lockFlags)
{
    if (cmd && cmd->getAutoArgs(*state)->size())
        throw UsageError("'--arg' and '--argstr' are incompatible with flakes");
}

std::tuple<std::string, FlakeRef, InstallableValue::DerivationInfo> InstallableFlake::toDerivation()
{
    auto lockedFlake = getLockedFlake();

    auto cache = openEvalCache(*state, lockedFlake);
    auto root = cache->getRoot();

    for (auto & attrPath : getActualAttrPaths()) {
        auto attr = root->findAlongAttrPath(
            parseAttrPath(*state, attrPath),
            true
        );

        if (!attr) continue;

        if (!attr->isDerivation())
            throw Error("flake output attribute '%s' is not a derivation", attrPath);

        auto drvPath = attr->forceDerivation();

        auto drvInfo = DerivationInfo{
            std::move(drvPath),
            state->store->maybeParseStorePath(attr->getAttr(state->sOutPath)->getString()),
            attr->getAttr(state->sOutputName)->getString()
        };

        return {attrPath, lockedFlake->flake.lockedRef, std::move(drvInfo)};
    }

    throw Error("flake '%s' does not provide attribute %s",
        flakeRef, showAttrPaths(getActualAttrPaths()));
}

std::vector<InstallableValue::DerivationInfo> InstallableFlake::toDerivations()
{
    std::vector<DerivationInfo> res;
    res.push_back(std::get<2>(toDerivation()));
    return res;
}

std::pair<Value *, Pos> InstallableFlake::toValue(EvalState & state)
{
    auto lockedFlake = getLockedFlake();

    auto vOutputs = getFlakeOutputs(state, *lockedFlake);

    auto emptyArgs = state.allocBindings(0);

    for (auto & attrPath : getActualAttrPaths()) {
        try {
            auto [v, pos] = findAlongAttrPath(state, attrPath, *emptyArgs, *vOutputs);
            state.forceValue(*v);
            return {v, pos};
        } catch (AttrPathNotFound & e) {
        }
    }

    throw Error("flake '%s' does not provide attribute %s",
        flakeRef, showAttrPaths(getActualAttrPaths()));
}

std::vector<std::pair<std::shared_ptr<eval_cache::AttrCursor>, std::string>>
InstallableFlake::getCursors(EvalState & state)
{
    auto evalCache = openEvalCache(state,
        std::make_shared<flake::LockedFlake>(lockFlake(state, flakeRef, lockFlags)));

    auto root = evalCache->getRoot();

    std::vector<std::pair<std::shared_ptr<eval_cache::AttrCursor>, std::string>> res;

    for (auto & attrPath : getActualAttrPaths()) {
        auto attr = root->findAlongAttrPath(parseAttrPath(state, attrPath));
        if (attr) res.push_back({attr, attrPath});
    }

    return res;
}

std::shared_ptr<flake::LockedFlake> InstallableFlake::getLockedFlake() const
{
    flake::LockFlags lockFlagsApplyConfig = lockFlags;
    lockFlagsApplyConfig.applyNixConfig = true;
    if (!_lockedFlake) {
        _lockedFlake = std::make_shared<flake::LockedFlake>(lockFlake(*state, flakeRef, lockFlagsApplyConfig));
    }
    return _lockedFlake;
}

FlakeRef InstallableFlake::nixpkgsFlakeRef() const
{
    auto lockedFlake = getLockedFlake();

    if (auto nixpkgsInput = lockedFlake->lockFile.findInput({"nixpkgs"})) {
        if (auto lockedNode = std::dynamic_pointer_cast<const flake::LockedNode>(nixpkgsInput)) {
            debug("using nixpkgs flake '%s'", lockedNode->lockedRef);
            return std::move(lockedNode->lockedRef);
        }
    }

    return Installable::nixpkgsFlakeRef();
}

std::vector<std::shared_ptr<Installable>> SourceExprCommand::parseInstallables(
    ref<Store> store, std::vector<std::string> ss)
{
    std::vector<std::shared_ptr<Installable>> result;

    if (file || expr) {
        if (file && expr)
            throw UsageError("'--file' and '--expr' are exclusive");

        // FIXME: backward compatibility hack
        if (file) {
            evalSettings.pureEval = false;
            evalSettings.enableImportFromDerivation = true;
        }

        auto state = getEvalState();
        auto vFile = state->allocValue();

        if (file)
            state->evalFile(lookupFileArg(*state, *file), *vFile);
        else {
            auto e = state->parseExprFromString(*expr, absPath("."));
            state->eval(e, *vFile);
        }

        for (auto & s : ss)
            result.push_back(std::make_shared<InstallableAttrPath>(state, *this, vFile, s == "." ? "" : s));

    } else {

        for (auto & s : ss) {
            std::exception_ptr ex;

            if (s.find('/') != std::string::npos) {
                try {
                    result.push_back(std::make_shared<InstallableStorePath>(store, store->followLinksToStorePath(s)));
                    continue;
                } catch (BadStorePath &) {
                } catch (...) {
                    if (!ex)
                        ex = std::current_exception();
                }
            }

            try {
                auto [flakeRef, fragment] = parseFlakeRefWithFragment(s, absPath("."));
                result.push_back(std::make_shared<InstallableFlake>(
                        this,
                        getEvalState(),
                        std::move(flakeRef),
                        fragment == "" ? getDefaultFlakeAttrPaths() : Strings{fragment},
                        getDefaultFlakeAttrPathPrefixes(),
                        lockFlags));
                continue;
            } catch (...) {
                ex = std::current_exception();
            }

            std::rethrow_exception(ex);
        }
    }

    return result;
}

std::shared_ptr<Installable> SourceExprCommand::parseInstallable(
    ref<Store> store, const std::string & installable)
{
    auto installables = parseInstallables(store, {installable});
    assert(installables.size() == 1);
    return installables.front();
}

BuiltPaths getBuiltPaths(ref<Store> evalStore, ref<Store> store, const DerivedPaths & hopefullyBuiltPaths)
{
    BuiltPaths res;
    for (auto & b : hopefullyBuiltPaths)
        std::visit(
            overloaded{
                [&](DerivedPath::Opaque bo) {
                    res.push_back(BuiltPath::Opaque{bo.path});
                },
                [&](DerivedPath::Built bfd) {
                    OutputPathMap outputs;
                    auto drv = evalStore->readDerivation(bfd.drvPath);
                    auto outputHashes = staticOutputHashes(*evalStore, drv); // FIXME: expensive
                    auto drvOutputs = drv.outputsAndOptPaths(*store);
                    for (auto & output : bfd.outputs) {
                        if (!outputHashes.count(output))
                            throw Error(
                                "the derivation '%s' doesn't have an output named '%s'",
                                store->printStorePath(bfd.drvPath), output);
                        if (settings.isExperimentalFeatureEnabled(
                                "ca-derivations")) {
                            auto outputId =
                                DrvOutput{outputHashes.at(output), output};
                            auto realisation =
                                store->queryRealisation(outputId);
                            if (!realisation)
                                throw Error(
                                    "cannot operate on an output of unbuilt "
                                    "content-addressed derivation '%s'",
                                    outputId.to_string());
                            outputs.insert_or_assign(
                                output, realisation->outPath);
                        } else {
                            // If ca-derivations isn't enabled, assume that
                            // the output path is statically known.
                            assert(drvOutputs.count(output));
                            assert(drvOutputs.at(output).second);
                            outputs.insert_or_assign(
                                output, *drvOutputs.at(output).second);
                        }
                    }
                    res.push_back(BuiltPath::Built{bfd.drvPath, outputs});
                },
            },
            b.raw());

    return res;
}

BuiltPaths build(
    ref<Store> evalStore,
    ref<Store> store,
    Realise mode,
    const std::vector<std::shared_ptr<Installable>> & installables,
    BuildMode bMode)
{
    if (mode == Realise::Nothing)
        settings.readOnlyMode = true;

    std::vector<DerivedPath> pathsToBuild;

    for (auto & i : installables) {
        auto b = i->toDerivedPaths();
        pathsToBuild.insert(pathsToBuild.end(), b.begin(), b.end());
    }

    if (mode == Realise::Nothing || mode == Realise::Derivation)
        printMissing(store, pathsToBuild, lvlError);
    else if (mode == Realise::Outputs)
        store->buildPaths(pathsToBuild, bMode, evalStore);

    return getBuiltPaths(evalStore, store, pathsToBuild);
}

BuiltPaths toBuiltPaths(
    ref<Store> evalStore,
    ref<Store> store,
    Realise mode,
    OperateOn operateOn,
    const std::vector<std::shared_ptr<Installable>> & installables)
{
    if (operateOn == OperateOn::Output)
        return build(evalStore, store, mode, installables);
    else {
        if (mode == Realise::Nothing)
            settings.readOnlyMode = true;

        BuiltPaths res;
        for (auto & drvPath : toDerivations(store, installables, true))
            res.push_back(BuiltPath::Opaque{drvPath});
        return res;
    }
}

StorePathSet toStorePaths(
    ref<Store> evalStore,
    ref<Store> store,
    Realise mode, OperateOn operateOn,
    const std::vector<std::shared_ptr<Installable>> & installables)
{
    StorePathSet outPaths;
    for (auto & path : toBuiltPaths(evalStore, store, mode, operateOn, installables)) {
        auto thisOutPaths = path.outPaths();
        outPaths.insert(thisOutPaths.begin(), thisOutPaths.end());
    }
    return outPaths;
}

StorePath toStorePath(
    ref<Store> evalStore,
    ref<Store> store,
    Realise mode, OperateOn operateOn,
    std::shared_ptr<Installable> installable)
{
    auto paths = toStorePaths(evalStore, store, mode, operateOn, {installable});

    if (paths.size() != 1)
        throw Error("argument '%s' should evaluate to one store path", installable->what());

    return *paths.begin();
}

StorePathSet toDerivations(
    ref<Store> store,
    const std::vector<std::shared_ptr<Installable>> & installables,
    bool useDeriver)
{
    StorePathSet drvPaths;

    for (auto & i : installables)
        for (auto & b : i->toDerivedPaths())
            std::visit(overloaded {
                [&](DerivedPath::Opaque bo) {
                    if (!useDeriver)
                        throw Error("argument '%s' did not evaluate to a derivation", i->what());
                    auto derivers = store->queryValidDerivers(bo.path);
                    if (derivers.empty())
                        throw Error("'%s' does not have a known deriver", i->what());
                    // FIXME: use all derivers?
                    drvPaths.insert(*derivers.begin());
                },
                [&](DerivedPath::Built bfd) {
                    drvPaths.insert(bfd.drvPath);
                },
            }, b.raw());

    return drvPaths;
}

InstallablesCommand::InstallablesCommand()
{
    expectArgs({
        .label = "installables",
        .handler = {&_installables},
        .completer = {[&](size_t, std::string_view prefix) {
            completeInstallable(prefix);
        }}
    });
}

void InstallablesCommand::prepare()
{
    if (_installables.empty() && useDefaultInstallables())
        // FIXME: commands like "nix install" should not have a
        // default, probably.
        _installables.push_back(".");
    installables = parseInstallables(getStore(), _installables);
}

std::optional<FlakeRef> InstallablesCommand::getFlakeRefForCompletion()
{
    if (_installables.empty()) {
        if (useDefaultInstallables())
            return parseFlakeRef(".", absPath("."));
        return {};
    }
    return parseFlakeRef(_installables.front(), absPath("."));
}

InstallableCommand::InstallableCommand()
{
    expectArgs({
        .label = "installable",
        .optional = true,
        .handler = {&_installable},
        .completer = {[&](size_t, std::string_view prefix) {
            completeInstallable(prefix);
        }}
    });
}

void InstallableCommand::prepare()
{
    installable = parseInstallable(getStore(), _installable);
}

}
