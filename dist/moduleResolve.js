"use strict";
// copy and change from typescript-to-lua v1.28.1
// src/transpilation/resolve.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResolutionContext = void 0;
exports.resolveDependencies = resolveDependencies;
const path = __importStar(require("path"));
const resolve = __importStar(require("enhanced-resolve"));
const fs = __importStar(require("fs"));
const source_map_1 = require("source-map");
const transpiler_1 = require("typescript-to-lua/dist/transpilation/transpiler");
const utils_1 = require("typescript-to-lua/dist/utils");
const diagnostics_1 = require("typescript-to-lua/dist/transpilation/diagnostics");
const CompilerOptions_1 = require("typescript-to-lua/dist/CompilerOptions");
const find_lua_requires_1 = require("./find-lua-requires");
const picomatch_1 = __importDefault(require("picomatch"));
const resolver = resolve.ResolverFactory.createResolver({
    extensions: ['.lua'],
    enforceExtension: true, // Resolved file must be a lua file
    fileSystem: { ...new resolve.CachedInputFileSystem(fs, 0) },
    useSyncFileSystemCalls: true,
    conditionNames: ['require', 'node', 'tstl', 'default'],
    symlinks: false // Do not resolve symlinks to their original paths (that breaks node_modules detection)
});
class ResolutionContext {
    program;
    options;
    emitHost;
    plugins;
    noResolvePaths;
    diagnostics = [];
    resolvedFiles = new Map();
    moduleMappings = [];
    constructor(program, options, emitHost, plugins) {
        this.program = program;
        this.options = options;
        this.emitHost = emitHost;
        this.plugins = plugins;
        const unique = [...new Set(options.noResolvePaths)];
        const matchers = unique.map((x) => (0, picomatch_1.default)(x));
        this.noResolvePaths = matchers;
    }
    addAndResolveDependencies(file) {
        if (this.resolvedFiles.has(file.fileName))
            return;
        this.resolvedFiles.set(file.fileName, file);
        // Do this backwards so the replacements do not mess with the positions of the previous requires
        for (const required of (0, find_lua_requires_1.findLuaRequires)(file.code).reverse()) {
            // Do not resolve noResolution paths
            if (required.requirePath.startsWith('@NoResolution:')) {
                // Remove @NoResolution prefix if not building in library mode
                if (!isBuildModeLibrary(this.program)) {
                    const path = required.requirePath.replace('@NoResolution:', '');
                    replaceRequireInCode(file, required, path, this.options.extension);
                    replaceRequireInSourceMap(file, required, path, this.options.extension);
                }
                // Skip
                continue;
            }
            // Try to resolve the import starting from the directory `file` is in
            this.resolveImport(file, required);
        }
    }
    resolveImport(file, required) {
        // Do no resolve lualib - always use the lualib of the application entry point, not the lualib from external packages
        if (required.requirePath === 'lualib_bundle') {
            this.resolvedFiles.set('lualib_bundle', {
                fileName: 'lualib_bundle',
                code: ''
            });
            return;
        }
        if (this.noResolvePaths.find((isMatch) => isMatch(required.requirePath))) {
            if (this.options.tstlVerbose) {
                console.log(`Skipping module resolution of ${required.requirePath} as it is in the tsconfig noResolvePaths.`);
            }
            return;
        }
        const dependencyPath = this.resolveDependencyPath(file, required.requirePath);
        if (!dependencyPath)
            return this.couldNotResolveImport(required, file);
        this.moduleMappings.push({
            requirePath: required.requirePath,
            dependencyPath,
            fileName: file.fileName
        });
        if (this.options.tstlVerbose) {
            console.log(`Resolved ${required.requirePath} to ${(0, utils_1.normalizeSlashes)(dependencyPath)}`);
        }
    }
    processedDependencies = new Set();
    formatPathToFile(targetPath, required) {
        const isRelative = ['/', './', '../'].some((p) => targetPath.startsWith(p));
        // // If the import is relative, always resolve it relative to the requiring file
        // // If the import is not relative, resolve it relative to options.baseUrl if it is set
        const fileDirectory = path.dirname(required.fileName);
        const relativeTo = isRelative
            ? fileDirectory
            : this.options.baseUrl ?? fileDirectory;
        // // Check if file is a file in the project
        const resolvedPath = path.join(relativeTo, targetPath);
        return resolvedPath;
    }
    processDependency(dependencyPath) {
        if (this.processedDependencies.has(dependencyPath))
            return;
        this.processedDependencies.add(dependencyPath);
        if (!shouldIncludeDependency(dependencyPath, this.program))
            return;
        // If dependency is not part of project, add dependency to output and resolve its dependencies recursively
        const dependencyContent = this.emitHost.readFile(dependencyPath);
        if (dependencyContent === undefined) {
            this.diagnostics.push((0, diagnostics_1.couldNotReadDependency)(dependencyPath));
            return;
        }
        const dependency = {
            fileName: dependencyPath,
            code: dependencyContent
        };
        this.addAndResolveDependencies(dependency);
    }
    couldNotResolveImport(required, file) {
        const fallbackRequire = fallbackResolve(required, (0, transpiler_1.getSourceDir)(this.program), path.dirname(file.fileName));
        replaceRequireInCode(file, required, fallbackRequire, this.options.extension);
        replaceRequireInSourceMap(file, required, fallbackRequire, this.options.extension);
        this.diagnostics.push((0, diagnostics_1.couldNotResolveRequire)(required.requirePath, path.relative((0, transpiler_1.getProjectRoot)(this.program), file.fileName)));
    }
    resolveDependencyPath(requiringFile, dependency) {
        const fileDirectory = path.dirname(requiringFile.fileName);
        if (this.options.tstlVerbose) {
            console.log(`Resolving "${dependency}" from ${(0, utils_1.normalizeSlashes)(requiringFile.fileName)}`);
        }
        const requiredFromLuaFile = requiringFile.fileName.endsWith('.lua');
        const dependencyPath = requiredFromLuaFile
            ? luaRequireToPath(dependency)
            : dependency;
        if (requiredFromLuaFile && isNodeModulesFile(requiringFile.fileName)) {
            // If requiring file is in lua module, try to resolve sibling in that file first
            const resolvedNodeModulesFile = this.resolveLuaDependencyPathFromNodeModules(requiringFile, dependencyPath);
            if (resolvedNodeModulesFile)
                return resolvedNodeModulesFile;
        }
        // Check if file is a file in the project
        const resolvedPath = this.formatPathToFile(dependencyPath, requiringFile);
        const fileFromPath = this.getFileFromPath(resolvedPath);
        if (fileFromPath)
            return fileFromPath;
        if (this.options.paths && this.options.baseUrl) {
            // If no file found yet and paths are present, try to find project file via paths mappings
            const fileFromPaths = this.tryGetModuleNameFromPaths(dependencyPath, this.options.paths, this.options.baseUrl);
            if (fileFromPaths)
                return fileFromPaths;
        }
        // Not a TS file in our project sources, use resolver to check if we can find dependency
        try {
            const resolveResult = resolver.resolveSync({}, fileDirectory, dependencyPath);
            if (resolveResult)
                return resolveResult;
        }
        catch (e) {
            // resolveSync errors if it fails to resolve
            if (this.options.tstlVerbose && e.details) {
                // Output resolver log
                console.log(e.details);
            }
        }
        return undefined;
    }
    resolveLuaDependencyPathFromNodeModules(requiringFile, dependency) {
        // We don't know for sure where the lua root is, so guess it is at package root
        const splitPath = path.normalize(requiringFile.fileName).split(path.sep);
        let packageRootIndex = splitPath.lastIndexOf('node_modules') + 2;
        let packageRoot = splitPath.slice(0, packageRootIndex).join(path.sep);
        while (packageRootIndex < splitPath.length) {
            // Try to find lua file relative to currently guessed Lua root
            const resolvedPath = path.join(packageRoot, dependency);
            const fileFromPath = this.getFileFromPath(resolvedPath);
            if (fileFromPath) {
                return fileFromPath;
            }
            else {
                // Did not find file at current root, try again one directory deeper
                packageRoot = path.join(packageRoot, splitPath[packageRootIndex++]);
            }
        }
        return undefined;
    }
    // value is false if already searched but not found
    pathToFile = new Map();
    getFileFromPath(resolvedPath) {
        const existingFile = this.pathToFile.get(resolvedPath);
        if (existingFile)
            return existingFile;
        if (existingFile === false)
            return undefined;
        const file = this.searchForFileFromPath(resolvedPath);
        this.pathToFile.set(resolvedPath, file ?? false);
        return file;
    }
    searchForFileFromPath(resolvedPath) {
        const possibleProjectFiles = [
            resolvedPath, // JSON files need their extension as part of the import path, caught by this branch,
            resolvedPath + '.ts', // Regular ts file
            path.join(resolvedPath, 'index.ts'), // Index ts file,
            resolvedPath + '.tsx', // tsx file
            path.join(resolvedPath, 'index.tsx') // tsx index
        ];
        for (const possibleFile of possibleProjectFiles) {
            if (isProjectFile(possibleFile, this.program)) {
                return possibleFile;
            }
        }
        // Check if this is a lua file in the project sources
        const possibleLuaProjectFiles = [
            resolvedPath + '.lua', // lua file in sources
            path.join(resolvedPath, 'index.lua'), // lua index file in sources
            path.join(resolvedPath, 'init.lua') // lua looks for <require>/init.lua if it cannot find <require>.lua
        ];
        for (const possibleFile of possibleLuaProjectFiles) {
            if (this.emitHost.fileExists(possibleFile)) {
                return possibleFile;
            }
        }
    }
    // Taken from TS and modified: https://github.com/microsoft/TypeScript/blob/88a1e3a1dd8d2d86e844ff1c16d5f041cebcfdb9/src/compiler/moduleSpecifiers.ts#L562
    tryGetModuleNameFromPaths(relativeToBaseUrl, paths, baseUrl) {
        const relativeImport = removeTrailingDirectorySeparator((0, utils_1.normalizeSlashes)(relativeToBaseUrl));
        for (const [importPattern, targetPatterns] of Object.entries(paths)) {
            const pattern = removeFileExtension((0, utils_1.normalizeSlashes)(importPattern));
            const indexOfStar = pattern.indexOf('*');
            if (indexOfStar !== -1) {
                // Try to match <prefix>*<suffix> to relativeImport
                const prefix = pattern.substring(0, indexOfStar);
                const suffix = pattern.substring(indexOfStar + 1);
                if ((relativeImport.length >= prefix.length + suffix.length &&
                    relativeImport.startsWith(prefix) &&
                    relativeImport.endsWith(suffix)) ||
                    (!suffix &&
                        relativeImport === removeTrailingDirectorySeparator(prefix))) {
                    // If import matches <prefix>*<suffix>, extract the matched * path
                    const matchedStar = relativeImport.substring(prefix.length, relativeImport.length - suffix.length);
                    // Try to resolve to the target patterns with filled in * pattern
                    for (const target of targetPatterns) {
                        const file = this.getFileFromPath(path.join(baseUrl, target.replace('*', matchedStar)));
                        if (file)
                            return file;
                    }
                }
            }
            else if (pattern === relativeImport) {
                // If there is no * pattern, check for exact matches and try those targets
                for (const target of targetPatterns) {
                    const file = this.getFileFromPath(path.join(baseUrl, target));
                    if (file)
                        return file;
                }
            }
        }
    }
    getModuleMappings() {
        return this.moduleMappings;
    }
}
exports.ResolutionContext = ResolutionContext;
function resolveDependencies(program, files, emitHost, plugins) {
    const options = program.getCompilerOptions();
    const resolutionContext = new ResolutionContext(program, options, emitHost, plugins);
    // Resolve dependencies for all processed files
    for (const file of files) {
        if (options.tstlVerbose) {
            console.log(`Resolving dependencies for ${(0, utils_1.normalizeSlashes)(file.fileName)}`);
        }
        resolutionContext.addAndResolveDependencies(file);
    }
    return {
        resolvedFiles: [...resolutionContext.resolvedFiles.values()],
        diagnostics: resolutionContext.diagnostics
    };
}
function shouldRewriteRequires(resolvedDependency, program) {
    return !isBuildModeLibrary(program) || !isNodeModulesFile(resolvedDependency);
}
function shouldIncludeDependency(resolvedDependency, program) {
    // Never include lua files (again) that are transpiled from project sources
    if (hasSourceFileInProject(resolvedDependency, program))
        return false;
    // Always include lua files not in node_modules (internal lua sources)
    if (!isNodeModulesFile(resolvedDependency))
        return true;
    // Only include node_modules files if not in library mode
    return !isBuildModeLibrary(program);
}
function isBuildModeLibrary(program) {
    return program.getCompilerOptions().buildMode === CompilerOptions_1.BuildMode.Library;
}
function replaceRequireInCode(file, originalRequire, newRequire, extension) {
    const requirePath = requirePathForFile(newRequire, extension);
    file.code = file.code =
        file.code.substring(0, originalRequire.from) +
            `require("${requirePath}")` +
            file.code.substring(originalRequire.to + 1);
}
function replaceRequireInSourceMap(file, originalRequire, newRequire, extension) {
    const requirePath = requirePathForFile(newRequire, extension);
    if (file.sourceMapNode) {
        replaceInSourceMap(file.sourceMapNode, file.sourceMapNode, `"${originalRequire.requirePath}"`, `"${requirePath}"`);
    }
}
function requirePathForFile(filePath, extension = '.lua') {
    if (!extension.startsWith('.')) {
        extension = `.${extension}`;
    }
    if (filePath.endsWith(extension)) {
        return (0, utils_1.formatPathToLuaPath)(filePath.substring(0, filePath.length - extension.length));
    }
    else {
        return (0, utils_1.formatPathToLuaPath)(filePath);
    }
}
function replaceInSourceMap(node, parent, require, resolvedRequire) {
    if ((!node.children || node.children.length === 0) &&
        node.toString() === require) {
        parent.children = [
            new source_map_1.SourceNode(node.line, node.column, node.source, [resolvedRequire])
        ];
        return true; // Stop after finding the first occurrence
    }
    if (node.children) {
        for (const c of node.children) {
            if (replaceInSourceMap(c, node, require, resolvedRequire)) {
                return true; // Occurrence found in one of the children
            }
        }
    }
    return false; // Did not find the require
}
function isNodeModulesFile(filePath) {
    return path
        .normalize(filePath)
        .split(path.sep)
        .some((p) => p === 'node_modules');
}
function isProjectFile(file, program) {
    return program.getSourceFile(file) !== undefined;
}
function hasSourceFileInProject(filePath, program) {
    const pathWithoutExtension = (0, utils_1.trimExtension)(filePath);
    return (isProjectFile(pathWithoutExtension + '.ts', program) ||
        isProjectFile(pathWithoutExtension + '.tsx', program) ||
        isProjectFile(pathWithoutExtension + '.json', program));
}
// Transform an import path to a lua require that is probably not correct, but can be used as fallback when regular resolution fails
function fallbackResolve(required, sourceRootDir, fileDir) {
    return (0, utils_1.formatPathToLuaPath)(path
        .normalize(path.join(path.relative(sourceRootDir, fileDir), required.requirePath))
        .split(path.sep)
        .filter((s) => s !== '.' && s !== '..')
        .join(path.sep));
}
function luaRequireToPath(requirePath) {
    return requirePath.replace(/\./g, path.sep);
}
function removeFileExtension(path) {
    return path.includes('.') ? (0, utils_1.trimExtension)(path) : path;
}
function removeTrailingDirectorySeparator(path) {
    return path.endsWith('/') || path.endsWith('\\')
        ? path.substring(0, -1)
        : path;
}
