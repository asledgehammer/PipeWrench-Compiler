import * as ts from 'typescript';
import * as tstl from 'typescript-to-lua';
import {
  transformClassAsExpression,
  transformClassDeclaration
} from 'typescript-to-lua/dist/transformation/visitors/class';
import { transformIdentifier } from 'typescript-to-lua/dist/transformation/visitors/identifier';
import { transformSourceFileNode } from 'typescript-to-lua/dist/transformation/visitors/sourceFile';
import {
  getExtendedNode,
  getExtendedType
} from 'typescript-to-lua/dist/transformation/visitors/class/utils';
import * as lua from 'typescript-to-lua/dist/LuaAST';

import path, { sep, join, basename, relative, parse } from 'node:path';
import {
  isAssignmentStatement,
  isCallExpression,
  isExpressionStatement,
  isIdentifier,
  isStringLiteral,
  isTableIndexExpression,
  type Expression,
  type FunctionVisitor,
  type Statement,
  type TransformationContext
} from 'typescript-to-lua';
import {
  copyFileSync,
  copySync,
  ensureDirSync,
  existsSync,
  pathExistsSync,
  readFileSync,
  writeFileSync
} from 'fs-extra';
import type { ClassLikeDeclaration } from 'typescript';
import type { OneToManyVisitorResult } from 'typescript-to-lua/dist/transformation/utils/lua-ast';
import { ResolutionContext, ModuleMapping } from './moduleResolve';

import Ajv from 'ajv';
import { PipeWrenchConfigSchema, type PipeWrenchConfig } from './config';

const ajv = new Ajv();

type Scope = 'client' | 'server' | 'shared' | 'none';

interface PipeWrenchLibraryConfig {
  client?: string;
  server?: string;
}

/**
 * when CompilerOptions.luaBundle === undefined && CompilerOptions.luaBundleEntry === undefined,
 * fileName is exist
 */
type TSTLEmitFile = tstl.EmitFile & { fileName?: string };

interface ImportModuleConfig extends ModuleMapping {
  packageRoot: string;
  config: PipeWrenchLibraryConfig;
}

const pzpwPatchFileName = `pipewrench_fixes`;

const getClassName = (
  classDeclaration: ts.ClassLikeDeclaration,
  context: TransformationContext
) => {
  let className: lua.Identifier;
  if (classDeclaration.name !== undefined) {
    className = transformIdentifier(context, classDeclaration.name);
  } else {
    className = lua.createIdentifier(
      context.createTempName('class'),
      classDeclaration
    );
  }
  return className.text;
};

const createSimpleCallStatement = (
  funcName: string,
  params: (string | Expression)[]
) =>
  lua.createExpressionStatement(
    lua.createCallExpression(
      lua.createIdentifier(funcName),
      params.map((param) =>
        typeof param === 'string' ? lua.createIdentifier(param) : param
      )
    )
  );

const transformSimpleLibFunction = (
  libFeatures: Set<string>,
  funcName: string,
  params: (string | Expression)[]
) => {
  libFeatures.add(funcName);
  return createSimpleCallStatement(funcName, params);
};

const getClassNameAssignStatementIndex = (result: Statement[]) =>
  result.findIndex((st) => {
    if (isAssignmentStatement(st)) {
      const left = st.left?.[0];
      const right = st.right?.[0];
      if (
        isTableIndexExpression(left) &&
        isStringLiteral(left.index) &&
        left.index.value === 'name' &&
        isStringLiteral(right)
      ) {
        return true;
      }
    }
    return false;
  });

const getClassExtendsStatementIndex = (result: Statement[]) =>
  result.findIndex((st) => {
    if (
      isExpressionStatement(st) &&
      isCallExpression(st.expression) &&
      isIdentifier(st.expression.expression) &&
      st.expression.expression.text === '__TS__ClassExtends'
    ) {
      return true;
    }
    return false;
  });

const createRequireStatement = (source: string, varName: string) => {
  return lua.createVariableDeclarationStatement(
    lua.createIdentifier(varName),
    lua.createCallExpression(lua.createIdentifier(`require`), [
      lua.createStringLiteral(source)
    ])
  );
};

const createDeclareStatement = (varName: string, fromName: string) => {
  return lua.createVariableDeclarationStatement(
    lua.createIdentifier(varName),
    lua.createTableIndexExpression(
      lua.createIdentifier(fromName),
      lua.createStringLiteral(varName)
    )
  );
};

const copyMake = (src: string, dest: string) => {
  ensureDirSync(dest);
  copySync(src, dest, { recursive: true });
};

const fixRequire = (scope: Scope, lua: string): string => {
  if (lua.length === 0) return '';
  const fix = (fromImport: string): string => {
    let toImport = fromImport.replace(/\./g, '/');
    // Remove cross-references for client/server/shared.
    if (toImport.startsWith('shared/')) {
      toImport = toImport.substring('shared/'.length);
    } else if (toImport.startsWith('client/')) {
      if (scope === 'server') {
        console.warn(
          `Cannot reference code from src/client from src/server. ` +
            '(Code will fail when ran)'
        );
      }
      toImport = toImport.substring('client/'.length);
    } else if (toImport.startsWith('server/')) {
      if (scope === 'client') {
        console.warn(
          `Cannot reference code from src/server from src/client. ` +
            '(Code will fail when ran)'
        );
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
        if (char === '"') break;
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

const handleFile = (file: tstl.EmitFile) => {
  if (file.code.length === 0) return;
  let scope: Scope = 'none';
  const fp = parse(file.outputPath);
  if (fp.dir.indexOf('client')) scope = 'client';
  else if (fp.dir.indexOf('server')) scope = 'server';
  else if (fp.dir.indexOf('shared')) scope = 'shared';
  // temporary solution
  const split = fp.dir.split(`lua${path.sep}lua_modules`);
  const isLuaModule = split.length > 1;
  if (fp.name === 'lualib_bundle') {
    file.outputPath = join(fp.dir, 'shared/lualib_bundle.lua');
  }
  if (fp.name === pzpwPatchFileName) {
    file.outputPath = join(fp.dir, `shared/${pzpwPatchFileName}.lua`);
  }
  if (isLuaModule) {
    file.outputPath = join(
      split[0],
      'lua',
      'shared',
      'lua_modules',
      ...split.slice(1),
      fp.base
    );
  }
  file.code = fixRequire(scope, file.code);
};

/**
 * config path should be like this: 'client'
 * convert './client' and 'client.d.ts' and 'client.lua' to 'client'
 */
const normalizeSideConfigPath = (filePath: string) => {
  return filePath
    .trim()
    .replace(/\.d\.ts$/, '')
    .replace(/\.lua$/, '')
    .replace(/^\.?\//, '');
};

const isPackageRoot = (packageRoot: string) => {
  try {
    if (!pathExistsSync(packageRoot)) {
      return false;
    }
    const packageJsonPath = join(packageRoot, 'package.json');
    return pathExistsSync(packageJsonPath);
  } catch (error) {
    return false;
  }
};

const findPackageRootInPath = (requiringFile: string) => {
  const requiringFileDir = path.dirname(requiringFile);
  const splitPath = path.normalize(requiringFileDir).split(path.sep);
  for (let i = splitPath.length; i > 0; i--) {
    const packageRoot = splitPath.slice(0, i).join(path.sep);
    const pathIsPackageRoot = isPackageRoot(packageRoot);
    if (pathIsPackageRoot) {
      return packageRoot;
    }
  }
};

class PipeWrenchPlugin implements tstl.Plugin {
  visitors: tstl.Visitors;

  /** The function names that needs to be imported from pipewonch_fixes.lua */
  libFeatures: Set<string> = new Set();

  config!: PipeWrenchConfig;
  importModuleConfig: ImportModuleConfig[] = [];

  constructor() {
    this.validatePzpwConfig();
    this.visitors = {
      [ts.SyntaxKind.ClassDeclaration]: this.classDeclarationPatcher,

      [ts.SyntaxKind.ClassExpression]: this.ClassExpressionPatcher,

      [ts.SyntaxKind.SourceFile]: this.SourceFilePatcher
    };
  }

  beforeTransform(program: ts.Program, options: tstl.CompilerOptions) {
    if (!options.outDir) {
      throw 'Must specify outDir in tsconfig.json';
    }
    if (options.luaBundle && options.luaBundleEntry) {
      throw new Error(
        `[tsconfig.json]tstl.luaBundle and tstl.luaBundleEntry could not exist simultaneously`
      );
    }
    return;
  }

  afterPrint(
    program: ts.Program,
    options: tstl.CompilerOptions,
    emitHost: tstl.EmitHost,
    result: tstl.ProcessedFile[]
  ) {
    this.collectImportModuleConfig(program, options, emitHost, result);
  }

  beforeEmit(
    program: ts.Program,
    options: tstl.CompilerOptions,
    emitHost: tstl.EmitHost,
    result: tstl.EmitFile[]
  ) {
    const { outDir } = options;
    if (!outDir) {
      return;
    }
    this.moveServerAndClientFiles(
      program,
      options,
      emitHost,
      result as TSTLEmitFile[]
    );
    const modSubDir = join(outDir, this.config.modInfo.id);
    ensureDirSync(modSubDir);

    const copyDirs = [
      {
        src: this.config.modelsDir,
        dest: join(modSubDir, 'media', 'models')
      },
      {
        src: this.config.texturesDir,
        dest: join(modSubDir, 'media', 'textures')
      },
      {
        src: this.config.soundDir,
        dest: join(modSubDir, 'media', 'sound')
      },
      {
        src: this.config.scriptsDir,
        dest: join(modSubDir, 'media', 'scripts')
      },
      {
        src: this.config.modInfo.poster,
        dest: join(modSubDir, basename(this.config.modInfo.poster)),
        isFile: true
      }
    ];
    copyDirs.forEach(({ src, dest, isFile }) => {
      if (src && existsSync(src)) {
        if (isFile) {
          copyFileSync(src, dest);
        } else {
          copyMake(src, dest);
        }
      }
    });

    const modInfoArray = Object.entries(this.config.modInfo).map(
      ([key, value]) => `${key}=${value}`
    );
    writeFileSync(join(modSubDir, 'mod.info'), modInfoArray.join('\n'));

    result.forEach((file) => {
      // file
      file.outputPath = join(
        modSubDir,
        'media',
        'lua',
        relative(outDir, file.outputPath)
      );
      handleFile(file);
    });
  }

  validatePzpwConfig() {
    // provide json schemas for pipewrench.json?
    const validateConfig = ajv.compile(PipeWrenchConfigSchema);

    const rawData = readFileSync(join(process.cwd(), './pipewrench.json'));
    const rawConfig = JSON.parse(rawData.toString());
    if (validateConfig(rawConfig)) {
      this.config = rawConfig;
      console.log('Configuration:', this.config);
    } else {
      console.error(validateConfig.errors);
      throw 'Error parsing pipewrench.json';
    }
  }

  moduleResolution(
    moduleIdentifier: string,
    requiringFile: string,
    options: tstl.CompilerOptions,
    emitHost: tstl.EmitHost
  ) {
    // add pipewrench_fixes.lua into lua files
    const { fileExists: originFileExists, readFile: originReadFile } = emitHost;
    emitHost.fileExists = (filePath: string) => {
      if (this.isPzpwPatchImport(filePath)) {
        return true;
      }
      return originFileExists(filePath);
    };
    emitHost.readFile = (filePath: string) => {
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
   * patch class like this:
   *
   * ```typescript
   * class A {}
   * const CB = class B {}
   * class B extends A {}
   * export default class D {}
   * ```
   *
   * but notice, this example may has problem because it is anonymous,
   * and its name and Type is 'default', may same to other classes
   *
   * ```typescript
   * export default class {}
   * ```
   */
  patchPzClass = <T = Expression | OneToManyVisitorResult<Statement>>(
    declaration: ClassLikeDeclaration,
    context: TransformationContext,
    result: T
  ) => {
    // Reference from typescript-to-lua
    // src/transformation/visitors/class/setup.ts
    if (!Array.isArray(result)) {
      return result;
    }
    const { libFeatures } = this;
    // find `ClassName.name = className`
    const classNameAssignStatementIndex =
      getClassNameAssignStatementIndex(result);

    const className = getClassName(declaration, context);

    // add `__PW__ClassPatch(className)`
    if (classNameAssignStatementIndex > -1) {
      // create `__PW__ClassPatch(className)` statement
      const pwClassPatchStatement = transformSimpleLibFunction(
        libFeatures,
        `__PW__ClassPatch`,
        [className]
      );
      // add after `ClassName.name = className`
      result.splice(
        classNameAssignStatementIndex + 1,
        0,
        pwClassPatchStatement
      );
    }

    // handle class extends
    const extendedType = getExtendedType(context, declaration);
    if (extendedType) {
      // find `__TS__ClassExtends(className, baseClassName)`
      const classExtendsStatementIndex = getClassExtendsStatementIndex(result);
      // add `__PW__ClassExtendsPatch(className, baseClassName)`
      if (classExtendsStatementIndex > -1) {
        // create `__PW__ClassExtendsPatch(Pz2PzpwClass, PzpwClass)` statement
        const extendedNode = getExtendedNode(declaration)!;
        const pwClassExtendsPatchStatement = transformSimpleLibFunction(
          libFeatures,
          `__PW__ClassExtendsPatch`,
          [className, context.transformExpression(extendedNode.expression)]
        );
        // add before __TS__ClassExtends
        result.splice(
          classExtendsStatementIndex,
          0,
          pwClassExtendsPatchStatement
        );
      }
    } else {
      // add `__PW__BaseClassExtends(PzpwClass)`
      if (classNameAssignStatementIndex > -1) {
        // create `__PW__BaseClassExtends(PzpwClass)` statement
        const pwBaseClassExtendsStatement = transformSimpleLibFunction(
          libFeatures,
          `__PW__BaseClassExtends`,
          [className]
        );
        // add after __PW__ClassPatch
        result.splice(
          classNameAssignStatementIndex + 2,
          0,
          pwBaseClassExtendsStatement
        );
      }
    }

    return result;
  };

  classDeclarationPatcher: tstl.Visitor<ts.ClassDeclaration> = (
    declaration,
    context
  ) => {
    const { patchPzClass } = this;
    const result = transformClassDeclaration(
      declaration,
      context
    ) as OneToManyVisitorResult<Statement>;
    return patchPzClass(declaration, context, result);
  };

  ClassExpressionPatcher: tstl.Visitor<ts.ClassExpression> = (
    declaration,
    context
  ) => {
    const { patchPzClass } = this;
    // Temporarily intercept calls to execute patch
    const { addPrecedingStatements: originAddPrecedingStatements } = context;
    context.addPrecedingStatements = function (
      statements: Statement | Statement[]
    ) {
      const result = patchPzClass(declaration, context, statements);
      originAddPrecedingStatements.call(context, result);
      context.addPrecedingStatements = originAddPrecedingStatements;
    };

    return transformClassAsExpression(declaration, context);
  };

  SourceFilePatcher: FunctionVisitor<ts.SourceFile> = (node, context) => {
    const { libFeatures } = this;
    const result = transformSourceFileNode(node, context);
    // `pipewrench_fixes`
    if (Array.isArray(result.statements)) {
      const pzpwFixVarName = `____pipewrench_fixes`;
      result.statements.unshift(
        // local ____pipewrench_fixes = require("pipewrench_fixes")
        createRequireStatement(
          relative(
            node.fileName,
            join(context.options.rootDir!, `${pzpwPatchFileName}.lua`)
          )
            .replaceAll('\\', '/')
            .replace(/\.lua$/, ''),
          pzpwFixVarName
        ),
        ...[...libFeatures].map((future) =>
          // local __PW__Xxx = ____pipewrench_fixes.__PW__Xxx
          createDeclareStatement(future, pzpwFixVarName)
        )
      );
    }
    return result;
  };

  getPzpwFixesPath() {
    return join(__dirname, `../lua/${pzpwPatchFileName}.lua`);
  }

  getPzpwFixesContent() {
    return readFileSync(this.getPzpwFixesPath(), 'utf-8');
  }

  isPzpwPatchImport(filePath: string) {
    return filePath.endsWith(`${sep}${pzpwPatchFileName}.lua`);
  }

  /**
   * Collect dependencies,
   * parse the path where the dependencies are located,
   * search for corresponding packages based on the path,
   * and find and collect pzpw configurations
   */
  collectImportModuleConfig(
    program: ts.Program,
    options: tstl.CompilerOptions,
    emitHost: tstl.EmitHost,
    result: tstl.ProcessedFile[]
  ) {
    const clonedResult = result.map((file) => ({
      fileName: file.fileName,
      code: file.code
    }));

    const resolutionContext = new ResolutionContext(
      program,
      options,
      emitHost,
      []
    );

    for (const file of clonedResult) {
      resolutionContext.addAndResolveDependencies(file);
    }

    const allModuleMappings = resolutionContext.getModuleMappings();

    const moduleMappings = allModuleMappings.filter(
      (moduleMapping) => moduleMapping.requirePath !== '.'
    );
    const defaultModuleConfig = {
      client: 'client',
      server: 'server'
    };
    const importModuleConfig: ImportModuleConfig[] = moduleMappings
      .map((moduleMapping): ImportModuleConfig | undefined => {
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
      .filter((config): config is ImportModuleConfig => !!config);

    this.importModuleConfig = importModuleConfig;
  }

  /**
   * Match the original path of the output file.
   * If the original path matches the side,
   * change the output path of the file
   */
  moveSideFiles({
    side,
    importModuleConfig,
    file,
    options
  }: {
    side: 'client' | 'server';
    importModuleConfig: ImportModuleConfig;
    file: TSTLEmitFile;
    options: tstl.CompilerOptions;
  }) {
    const { packageRoot, config, requirePath } = importModuleConfig;
    if (!config[side]) {
      return;
    }
    const sidePrefix = normalizeSideConfigPath(config[side] as string);
    // Extra check, cannot exceed packageRoot
    const targetPos = join(packageRoot, sidePrefix);
    if (!targetPos.startsWith(packageRoot)) {
      console.warn(
        `module ${requirePath} has wrong pzpw config: pzpw.${side} = ${config[side]}`
      );
      return;
    }
    const sideFilePath = join(packageRoot, `${sidePrefix}.lua`);
    const sideDirPath = `${join(packageRoot, sidePrefix)}${path.sep}`;
    if (
      file.fileName === sideFilePath ||
      file.fileName?.startsWith(sideDirPath)
    ) {
      const outDir = path.normalize(options.outDir as string);
      const sideFileOutputPath = file.outputPath.replace(
        `${outDir}${path.sep}lua_modules`,
        `${outDir}${path.sep}${side}${path.sep}lua_modules`
      );
      file.outputPath = sideFileOutputPath;
    }
  }

  moveServerAndClientFiles(
    program: ts.Program,
    options: tstl.CompilerOptions,
    emitHost: tstl.EmitHost,
    result: TSTLEmitFile[]
  ) {
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

  getPipeWrenchLibraryConfig(packageRoot: string) {
    try {
      if (!pathExistsSync(packageRoot)) {
        return;
      }
      const packageJsonPath = join(packageRoot, 'package.json');
      if (!pathExistsSync(packageJsonPath)) {
        return;
      }
      const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent) as {
        pzpw?: PipeWrenchLibraryConfig;
      };
      return packageJson?.pzpw;
    } catch (error) {
      return;
    }
  }
}

const plugin = new PipeWrenchPlugin();

export default plugin;
