"use strict";
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
const ts = __importStar(require("typescript"));
const class_1 = require("typescript-to-lua/dist/transformation/visitors/class");
const identifier_1 = require("typescript-to-lua/dist/transformation/visitors/identifier");
const sourceFile_1 = require("typescript-to-lua/dist/transformation/visitors/sourceFile");
const utils_1 = require("typescript-to-lua/dist/transformation/visitors/class/utils");
const lua = __importStar(require("typescript-to-lua/dist/LuaAST"));
const node_path_1 = __importStar(require("node:path"));
const typescript_to_lua_1 = require("typescript-to-lua");
const fs_extra_1 = require("fs-extra");
const moduleResolve_1 = require("./moduleResolve");
const ajv_1 = __importDefault(require("ajv"));
const config_1 = require("./config");
const ajv = new ajv_1.default();
const pzpwPatchFileName = `pipewrench_fixes`;
const getClassName = (classDeclaration, context) => {
    let className;
    if (classDeclaration.name !== undefined) {
        className = (0, identifier_1.transformIdentifier)(context, classDeclaration.name);
    }
    else {
        className = lua.createIdentifier(context.createTempName('class'), classDeclaration);
    }
    return className.text;
};
const createSimpleCallStatement = (funcName, params) => lua.createExpressionStatement(lua.createCallExpression(lua.createIdentifier(funcName), params.map((param) => typeof param === 'string' ? lua.createIdentifier(param) : param)));
const transformSimpleLibFunction = (libFeatures, funcName, params) => {
    libFeatures.add(funcName);
    return createSimpleCallStatement(funcName, params);
};
const getClassNameAssignStatementIndex = (result) => result.findIndex((st) => {
    if ((0, typescript_to_lua_1.isAssignmentStatement)(st)) {
        const left = st.left?.[0];
        const right = st.right?.[0];
        if ((0, typescript_to_lua_1.isTableIndexExpression)(left) &&
            (0, typescript_to_lua_1.isStringLiteral)(left.index) &&
            left.index.value === 'name' &&
            (0, typescript_to_lua_1.isStringLiteral)(right)) {
            return true;
        }
    }
    return false;
});
const getClassExtendsStatementIndex = (result) => result.findIndex((st) => {
    if ((0, typescript_to_lua_1.isExpressionStatement)(st) &&
        (0, typescript_to_lua_1.isCallExpression)(st.expression) &&
        (0, typescript_to_lua_1.isIdentifier)(st.expression.expression) &&
        st.expression.expression.text === '__TS__ClassExtends') {
        return true;
    }
    return false;
});
const createRequireStatement = (source, varName) => {
    return lua.createVariableDeclarationStatement(lua.createIdentifier(varName), lua.createCallExpression(lua.createIdentifier(`require`), [
        lua.createStringLiteral(source)
    ]));
};
const createDeclareStatement = (varName, fromName) => {
    return lua.createVariableDeclarationStatement(lua.createIdentifier(varName), lua.createTableIndexExpression(lua.createIdentifier(fromName), lua.createStringLiteral(varName)));
};
const copyMake = (src, dest) => {
    (0, fs_extra_1.ensureDirSync)(dest);
    (0, fs_extra_1.copySync)(src, dest, { recursive: true });
};
const fixRequire = (scope, lua) => {
    if (lua.length === 0)
        return '';
    const fix = (fromImport) => {
        let toImport = fromImport.replace(/\./g, '/');
        // Remove cross-references for client/server/shared.
        if (toImport.startsWith('shared/')) {
            toImport = toImport.substring('shared/'.length);
        }
        else if (toImport.startsWith('client/')) {
            if (scope === 'server') {
                console.warn(`Cannot reference code from src/client from src/server. ` +
                    '(Code will fail when ran)');
            }
            toImport = toImport.substring('client/'.length);
        }
        else if (toImport.startsWith('server/')) {
            if (scope === 'client') {
                console.warn(`Cannot reference code from src/server from src/client. ` +
                    '(Code will fail when ran)');
            }
            toImport = toImport.substring('server/'.length);
        }
        return toImport;
    };
    let index = -1;
    do {
        let fromImport = '';
        index = lua.indexOf('require("');
        if (index !== -1) {
            index += 9;
            // Grab the require string.
            while (index < lua.length) {
                const char = lua.charAt(index++);
                if (char === '"')
                    break;
                fromImport += char;
            }
            const toImport = fix(fromImport);
            // Kahlua only works with '/', nor '.' in 'require(..)'.
            const from = 'require("' + fromImport + '")';
            const to = "require('" + toImport.replace(/\./g, '/') + "')";
            lua = lua.replace(from, to);
        }
    } while (index !== -1);
    return lua;
};
const handleFile = (file) => {
    if (file.code.length === 0)
        return;
    let scope = 'none';
    const fp = (0, node_path_1.parse)(file.outputPath);
    if (fp.dir.indexOf('client'))
        scope = 'client';
    else if (fp.dir.indexOf('server'))
        scope = 'server';
    else if (fp.dir.indexOf('shared'))
        scope = 'shared';
    // temporary solution
    const split = fp.dir.split(`lua${node_path_1.default.sep}lua_modules`);
    const isLuaModule = split.length > 1;
    if (fp.name === 'lualib_bundle') {
        file.outputPath = (0, node_path_1.join)(fp.dir, 'shared/lualib_bundle.lua');
    }
    if (fp.name === pzpwPatchFileName) {
        file.outputPath = (0, node_path_1.join)(fp.dir, `shared/${pzpwPatchFileName}.lua`);
    }
    if (isLuaModule) {
        file.outputPath = (0, node_path_1.join)(split[0], 'lua', 'shared', 'lua_modules', ...split.slice(1), fp.base);
    }
    file.code = fixRequire(scope, file.code);
};
/**
 * config path should be like this: 'client'
 * convert './client' and 'client.d.ts' and 'client.lua' to 'client'
 */
const normalizeSideConfigPath = (filePath) => {
    return filePath
        .trim()
        .replace(/\.d\.ts$/, '')
        .replace(/\.lua$/, '')
        .replace(/^\.?\//, '');
};
const isPackageRoot = (packageRoot) => {
    try {
        if (!(0, fs_extra_1.pathExistsSync)(packageRoot)) {
            return false;
        }
        const packageJsonPath = (0, node_path_1.join)(packageRoot, 'package.json');
        return (0, fs_extra_1.pathExistsSync)(packageJsonPath);
    }
    catch (error) {
        return false;
    }
};
const findPackageRootInPath = (requiringFile) => {
    const requiringFileDir = node_path_1.default.dirname(requiringFile);
    const splitPath = node_path_1.default.normalize(requiringFileDir).split(node_path_1.default.sep);
    for (let i = splitPath.length; i > 0; i--) {
        const packageRoot = splitPath.slice(0, i).join(node_path_1.default.sep);
        const pathIsPackageRoot = isPackageRoot(packageRoot);
        if (pathIsPackageRoot) {
            return packageRoot;
        }
    }
};
class PipeWrenchPlugin {
    visitors;
    /** The function names that needs to be imported from pipewonch_fixes.lua */
    libFeatures = new Set();
    config;
    importModuleConfig = [];
    constructor() {
        this.validatePzpwConfig();
        this.visitors = {
            [ts.SyntaxKind.ClassDeclaration]: this.classDeclarationPatcher,
            [ts.SyntaxKind.ClassExpression]: this.ClassExpressionPatcher,
            [ts.SyntaxKind.SourceFile]: this.SourceFilePatcher
        };
    }
    beforeTransform(program, options) {
        if (!options.outDir) {
            throw 'Must specify outDir in tsconfig.json';
        }
        if (options.luaBundle && options.luaBundleEntry) {
            throw new Error(`[tsconfig.json]tstl.luaBundle and tstl.luaBundleEntry could not exist simultaneously`);
        }
        return;
    }
    afterPrint(program, options, emitHost, result) {
        this.collectImportModuleConfig(program, options, emitHost, result);
    }
    beforeEmit(program, options, emitHost, result) {
        const { outDir } = options;
        if (!outDir) {
            return;
        }
        this.patchLuaBundleForPz(result, options.outDir);
        this.moveServerAndClientFiles(program, options, emitHost, result);
        const getModSubDir = (outDir, config) => {
            const targetVersion = config.compilerOptions?.targetVersion;
            if (targetVersion === '42-unstable') {
                return (0, node_path_1.join)(outDir, config.modInfo.id, '42');
            }
            return (0, node_path_1.join)(outDir, config.modInfo.id);
        };
        const modSubDir = getModSubDir(outDir, this.config);
        (0, fs_extra_1.ensureDirSync)(modSubDir);
        const targetVersion = this.config.compilerOptions?.targetVersion;
        if (targetVersion === '42-unstable' || targetVersion === '41&42-unstable') {
            (0, fs_extra_1.ensureDirSync)((0, node_path_1.join)(outDir, this.config.modInfo.id, 'common'));
        }
        const copyDirs = [
            {
                src: this.config.modelsDir,
                dest: (0, node_path_1.join)(modSubDir, 'media', 'models')
            },
            {
                src: this.config.texturesDir,
                dest: (0, node_path_1.join)(modSubDir, 'media', 'textures')
            },
            {
                src: this.config.soundDir,
                dest: (0, node_path_1.join)(modSubDir, 'media', 'sound')
            },
            {
                src: this.config.scriptsDir,
                dest: (0, node_path_1.join)(modSubDir, 'media', 'scripts')
            },
            {
                src: this.config.modInfo.poster,
                dest: (0, node_path_1.join)(modSubDir, (0, node_path_1.basename)(this.config.modInfo.poster)),
                isFile: true
            }
        ];
        copyDirs.forEach(({ src, dest, isFile }) => {
            if (src && (0, fs_extra_1.existsSync)(src)) {
                if (isFile) {
                    (0, fs_extra_1.copyFileSync)(src, dest);
                }
                else {
                    copyMake(src, dest);
                }
            }
        });
        const modInfoArray = Object.entries(this.config.modInfo).map(([key, value]) => `${key}=${value}`);
        (0, fs_extra_1.writeFileSync)((0, node_path_1.join)(modSubDir, 'mod.info'), modInfoArray.join('\n'));
        result.forEach((file) => {
            // file
            file.outputPath = (0, node_path_1.join)(modSubDir, 'media', 'lua', (0, node_path_1.relative)(outDir, file.outputPath));
            handleFile(file);
        });
    }
    afterEmit(program, options) {
        if (!options.outDir) {
            return;
        }
        const modSubDir = (0, node_path_1.join)(options.outDir, this.config.modInfo.id);
        const targetVersion = this.config.compilerOptions?.targetVersion;
        if (targetVersion === '41&42-unstable') {
            const sourceDir = (0, node_path_1.join)(modSubDir, '42', 'media');
            const destDir = (0, node_path_1.join)(modSubDir, 'media');
            (0, fs_extra_1.copyFileSync)((0, node_path_1.join)(modSubDir, '42', 'mod.info'), (0, node_path_1.join)(modSubDir, 'mod.info'));
            (0, fs_extra_1.copyFileSync)((0, node_path_1.join)(modSubDir, '42', this.config.modInfo.poster), (0, node_path_1.join)(modSubDir, this.config.modInfo.poster));
            copyMake(sourceDir, destDir);
        }
    }
    validatePzpwConfig() {
        // provide json schemas for pipewrench.json?
        const validateConfig = ajv.compile(config_1.PipeWrenchConfigSchema);
        const rawData = (0, fs_extra_1.readFileSync)((0, node_path_1.join)(process.cwd(), './pipewrench.json'));
        const rawConfig = JSON.parse(rawData.toString());
        if (validateConfig(rawConfig)) {
            this.config = rawConfig;
            console.log('Configuration:', this.config);
        }
        else {
            throw `Error parsing pipewrench.json: \nerrors: ${JSON.stringify(validateConfig.errors, null, 2)}`;
        }
    }
    moduleResolution(moduleIdentifier, requiringFile, options, emitHost) {
        // add pipewrench_fixes.lua into lua files
        const { fileExists: originFileExists, readFile: originReadFile } = emitHost;
        emitHost.fileExists = (filePath) => {
            if (this.isPzpwPatchImport(filePath)) {
                return true;
            }
            return originFileExists(filePath);
        };
        emitHost.readFile = (filePath) => {
            if (this.isPzpwPatchImport(filePath)) {
                return this.getPzpwFixesContent();
            }
            return originReadFile(filePath);
        };
        // import pipewrench_fixes from top dir
        if (moduleIdentifier === pzpwPatchFileName) {
            return pzpwPatchFileName;
        }
        return void 0;
    }
    /**
     * replace `ClassName.name = className` to `ClassName.Type = className` in statement
     *
     * Because in vanilla code, the name field is occupied
     */
    replaceStatementClassNameFieldToType(result) {
        // find `ClassName.name = className`
        const classNameAssignStatementIndex = getClassNameAssignStatementIndex(result);
        if (classNameAssignStatementIndex === -1) {
            return;
        }
        const classNameAssignStatement = result[classNameAssignStatementIndex];
        const assignStatementLeft = classNameAssignStatement
            .left[0];
        const assignStatementLeftIndex = assignStatementLeft.index;
        assignStatementLeftIndex.value = 'Type';
    }
    /**
     * patch class like this:
     *
     * ```typescript
     * class A {}
     * const CB = class B {}
     * class B extends A {}
     * export default class D {}
     * ```
     * and replace `ClassName.name = className` to `ClassName.Type = className` in statement
     *
     * but notice, this example may has problem because it is anonymous,
     * and its name and Type is 'default', may same to other classes
     *
     * ```typescript
     * export default class {}
     * ```
     */
    patchPzClass = (declaration, context, result) => {
        // Reference from typescript-to-lua
        // src/transformation/visitors/class/setup.ts
        if (!Array.isArray(result)) {
            return result;
        }
        const { libFeatures } = this;
        // find `ClassName.name = className`
        const classNameAssignStatementIndex = getClassNameAssignStatementIndex(result);
        const className = getClassName(declaration, context);
        // handle class extends
        const extendedType = (0, utils_1.getExtendedType)(context, declaration);
        if (extendedType) {
            // find `__TS__ClassExtends(className, baseClassName)`
            const classExtendsStatementIndex = getClassExtendsStatementIndex(result);
            // add `__PW__ClassExtendsPatch(className, baseClassName)`
            if (classExtendsStatementIndex > -1) {
                // create `__PW__ClassExtendsPatch(Pz2PzpwClass, PzpwClass)` statement
                const extendedNode = (0, utils_1.getExtendedNode)(declaration);
                const pwClassExtendsPatchStatement = transformSimpleLibFunction(libFeatures, `__PW__ClassExtendsPatch`, [className, context.transformExpression(extendedNode.expression)]);
                // add before __TS__ClassExtends
                result.splice(classExtendsStatementIndex, 0, pwClassExtendsPatchStatement);
            }
        }
        else {
            // add `__PW__BaseClassExtends(PzpwClass)`
            if (classNameAssignStatementIndex > -1) {
                // create `__PW__BaseClassExtends(PzpwClass)` statement
                const pwBaseClassExtendsStatement = transformSimpleLibFunction(libFeatures, `__PW__BaseClassExtends`, [className]);
                // add after `ClassName.name = className`
                result.splice(classNameAssignStatementIndex + 1, 0, pwBaseClassExtendsStatement);
            }
        }
        this.replaceStatementClassNameFieldToType(result);
        return result;
    };
    classDeclarationPatcher = (declaration, context) => {
        const { patchPzClass } = this;
        const result = (0, class_1.transformClassDeclaration)(declaration, context);
        return patchPzClass(declaration, context, result);
    };
    ClassExpressionPatcher = (declaration, context) => {
        const { patchPzClass } = this;
        // Temporarily intercept calls to execute patch
        const { addPrecedingStatements: originAddPrecedingStatements } = context;
        context.addPrecedingStatements = function (statements) {
            const result = patchPzClass(declaration, context, statements);
            originAddPrecedingStatements.call(context, result);
            context.addPrecedingStatements = originAddPrecedingStatements;
        };
        return (0, class_1.transformClassAsExpression)(declaration, context);
    };
    SourceFilePatcher = (node, context) => {
        const { libFeatures } = this;
        const result = (0, sourceFile_1.transformSourceFileNode)(node, context);
        // `pipewrench_fixes`
        if (Array.isArray(result.statements)) {
            const pzpwFixVarName = `____pipewrench_fixes`;
            result.statements.unshift(
            // local ____pipewrench_fixes = require("pipewrench_fixes")
            createRequireStatement((0, node_path_1.relative)(node.fileName, (0, node_path_1.join)(context.options.rootDir, `${pzpwPatchFileName}.lua`))
                .replaceAll('\\', '/')
                .replace(/\.lua$/, ''), pzpwFixVarName), ...[...libFeatures].map((future) => 
            // local __PW__Xxx = ____pipewrench_fixes.__PW__Xxx
            createDeclareStatement(future, pzpwFixVarName)));
        }
        return result;
    };
    getPzpwFixesPath() {
        return (0, node_path_1.join)(__dirname, `../lua/${pzpwPatchFileName}.lua`);
    }
    getPzpwFixesContent() {
        return (0, fs_extra_1.readFileSync)(this.getPzpwFixesPath(), 'utf-8');
    }
    isPzpwPatchImport(filePath) {
        return filePath.endsWith(`${node_path_1.sep}${pzpwPatchFileName}.lua`);
    }
    /**
     * Collect dependencies,
     * parse the path where the dependencies are located,
     * search for corresponding packages based on the path,
     * and find and collect pzpw configurations
     */
    collectImportModuleConfig(program, options, emitHost, result) {
        const clonedResult = result.map((file) => ({
            fileName: file.fileName,
            code: file.code
        }));
        const resolutionContext = new moduleResolve_1.ResolutionContext(program, options, emitHost, []);
        for (const file of clonedResult) {
            resolutionContext.addAndResolveDependencies(file);
        }
        const allModuleMappings = resolutionContext.getModuleMappings();
        const moduleMappings = allModuleMappings.filter((moduleMapping) => moduleMapping.requirePath !== '.');
        const defaultModuleConfig = {
            client: 'client',
            server: 'server'
        };
        const importModuleConfig = moduleMappings
            .map((moduleMapping) => {
            const packageRoot = findPackageRootInPath(moduleMapping.dependencyPath);
            if (!packageRoot) {
                return;
            }
            const config = this.getPipeWrenchLibraryConfig(packageRoot);
            return {
                ...moduleMapping,
                packageRoot,
                config: {
                    ...defaultModuleConfig,
                    ...config
                }
            };
        })
            .filter((config) => !!config);
        this.importModuleConfig = importModuleConfig;
    }
    /**
     * Match the original path of the output file.
     * If the original path matches the side,
     * change the output path of the file
     */
    moveSideFiles({ side, importModuleConfig, file, options }) {
        const { packageRoot, config, requirePath } = importModuleConfig;
        if (!config[side]) {
            return;
        }
        const sidePrefix = normalizeSideConfigPath(config[side]);
        // Extra check, cannot exceed packageRoot
        const targetPos = (0, node_path_1.join)(packageRoot, sidePrefix);
        if (!targetPos.startsWith(packageRoot)) {
            console.warn(`module ${requirePath} has wrong pzpw config: pzpw.${side} = ${config[side]}`);
            return;
        }
        const sideFilePath = (0, node_path_1.join)(packageRoot, `${sidePrefix}.lua`);
        const sideDirPath = `${(0, node_path_1.join)(packageRoot, sidePrefix)}${node_path_1.default.sep}`;
        if (file.fileName === sideFilePath ||
            file.fileName?.startsWith(sideDirPath)) {
            const outDir = node_path_1.default.normalize(options.outDir);
            const sideFileOutputPath = file.outputPath.replace(`${outDir}${node_path_1.default.sep}lua_modules`, `${outDir}${node_path_1.default.sep}${side}${node_path_1.default.sep}lua_modules`);
            file.outputPath = sideFileOutputPath;
        }
    }
    moveServerAndClientFiles(program, options, emitHost, result) {
        const importModuleConfigs = this.importModuleConfig;
        result.forEach((file) => {
            if (!file.fileName) {
                return;
            }
            importModuleConfigs.forEach((importModuleConfig) => {
                if (!file.fileName) {
                    return;
                }
                const { packageRoot } = importModuleConfig;
                const inPackageRoot = file.fileName.startsWith(packageRoot);
                if (!inPackageRoot) {
                    return;
                }
                this.moveSideFiles({
                    side: 'client',
                    importModuleConfig,
                    file,
                    options
                });
                this.moveSideFiles({
                    side: 'server',
                    importModuleConfig,
                    file,
                    options
                });
            });
        });
    }
    getPipeWrenchLibraryConfig(packageRoot) {
        try {
            if (!(0, fs_extra_1.pathExistsSync)(packageRoot)) {
                return;
            }
            const packageJsonPath = (0, node_path_1.join)(packageRoot, 'package.json');
            if (!(0, fs_extra_1.pathExistsSync)(packageJsonPath)) {
                return;
            }
            const packageJsonContent = (0, fs_extra_1.readFileSync)(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);
            return packageJson?.pzpw;
        }
        catch (error) {
            return;
        }
    }
    /**
     * replace `ClassName.name = className` to `ClassName.Type = className` in code
     *
     * Because in vanilla code, the name field is occupied
     */
    replaceClassNameFieldToType(content) {
        return content.replaceAll('.name', '.Type');
    }
    /** replace AggregateError name field to Type */
    patchAggregateError(content) {
        return content.replace('name = "AggregateError"', 'Type = "AggregateError"');
    }
    /** Simultaneously compatible with both ts class and pz vanilla class */
    patchInstanceOf(content) {
        const lines = content.split('\n');
        const instanceOfFunctionIndex = lines.findIndex((line) => line.includes(`function __TS__InstanceOf`));
        if (instanceOfFunctionIndex === -1) {
            return content;
        }
        const instanceOfPatchContent = `require "tests/classExtendEachOther/base/ISBaseObject"
ISBaseObject[Symbol.hasInstance] = function(classTbl, obj)
    if type(obj) == "table" then
        local luaClass = obj.constructor or getmetatable(obj)
        while luaClass ~= nil do
            if luaClass == classTbl then
                return true
            end
            luaClass = luaClass.____super or getmetatable(luaClass)
        end
    end
    return false
end`;
        lines.splice(instanceOfFunctionIndex, 0, instanceOfPatchContent);
        return lines.join('\n');
    }
    patchLuaBundleForPz(result, outDir) {
        const luaBundleOutputPath = (0, node_path_1.join)(outDir, 'lualib_bundle.lua');
        const luaBundleFile = result.find((file) => file.outputPath === luaBundleOutputPath);
        if (!luaBundleFile) {
            return;
        }
        let code = luaBundleFile.code;
        code = this.replaceClassNameFieldToType(code);
        code = this.patchAggregateError(code);
        code = this.patchInstanceOf(code);
        luaBundleFile.code = code;
    }
}
const plugin = new PipeWrenchPlugin();
exports.default = plugin;
