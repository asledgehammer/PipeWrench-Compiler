import * as ts from 'typescript';
import * as tstl from 'typescript-to-lua';
import { type FunctionVisitor, type Statement, type TransformationContext } from 'typescript-to-lua';
import type { ClassLikeDeclaration } from 'typescript';
import type { OneToManyVisitorResult } from 'typescript-to-lua/dist/transformation/utils/lua-ast';
import { ModuleMapping } from './moduleResolve';
import { type PipeWrenchConfig } from './config';
interface PipeWrenchLibraryConfig {
    client?: string;
    server?: string;
}
/**
 * when CompilerOptions.luaBundle === undefined && CompilerOptions.luaBundleEntry === undefined,
 * fileName is exist
 */
declare type TSTLEmitFile = tstl.EmitFile & {
    fileName?: string;
};
interface ImportModuleConfig extends ModuleMapping {
    packageRoot: string;
    config: PipeWrenchLibraryConfig;
}
declare class PipeWrenchPlugin implements tstl.Plugin {
    visitors: tstl.Visitors;
    /** The function names that needs to be imported from pipewonch_fixes.lua */
    libFeatures: Set<string>;
    config: PipeWrenchConfig;
    importModuleConfig: ImportModuleConfig[];
    constructor();
    beforeTransform(program: ts.Program, options: tstl.CompilerOptions): void;
    afterPrint(program: ts.Program, options: tstl.CompilerOptions, emitHost: tstl.EmitHost, result: tstl.ProcessedFile[]): void;
    beforeEmit(program: ts.Program, options: tstl.CompilerOptions, emitHost: tstl.EmitHost, result: tstl.EmitFile[]): void;
    validatePzpwConfig(): void;
    moduleResolution(moduleIdentifier: string, requiringFile: string, options: tstl.CompilerOptions, emitHost: tstl.EmitHost): "pipewrench_fixes" | undefined;
    /**
     * replace `ClassName.name = className` to `ClassName.Type = className` in statement
     *
     * Because in vanilla code, the name field is occupied
     */
    replaceStatementClassNameFieldToType(result: Statement[]): void;
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
    patchPzClass: <T = tstl.Expression | OneToManyVisitorResult<tstl.Statement>>(declaration: ClassLikeDeclaration, context: TransformationContext, result: T) => T;
    classDeclarationPatcher: tstl.Visitor<ts.ClassDeclaration>;
    ClassExpressionPatcher: tstl.Visitor<ts.ClassExpression>;
    SourceFilePatcher: FunctionVisitor<ts.SourceFile>;
    getPzpwFixesPath(): string;
    getPzpwFixesContent(): string;
    isPzpwPatchImport(filePath: string): boolean;
    /**
     * Collect dependencies,
     * parse the path where the dependencies are located,
     * search for corresponding packages based on the path,
     * and find and collect pzpw configurations
     */
    collectImportModuleConfig(program: ts.Program, options: tstl.CompilerOptions, emitHost: tstl.EmitHost, result: tstl.ProcessedFile[]): void;
    /**
     * Match the original path of the output file.
     * If the original path matches the side,
     * change the output path of the file
     */
    moveSideFiles({ side, importModuleConfig, file, options }: {
        side: 'client' | 'server';
        importModuleConfig: ImportModuleConfig;
        file: TSTLEmitFile;
        options: tstl.CompilerOptions;
    }): void;
    moveServerAndClientFiles(program: ts.Program, options: tstl.CompilerOptions, emitHost: tstl.EmitHost, result: TSTLEmitFile[]): void;
    getPipeWrenchLibraryConfig(packageRoot: string): PipeWrenchLibraryConfig | undefined;
    /**
     * replace `ClassName.name = className` to `ClassName.Type = className` in code
     *
     * Because in vanilla code, the name field is occupied
     */
    replaceClassNameFieldToType(content: string): string;
    /** replace AggregateError name field to Type */
    patchAggregateError(content: string): string;
    /** Simultaneously compatible with both ts class and pz vanilla class */
    patchInstanceOf(content: string): string;
    patchLuaBundleForPz(result: tstl.EmitFile[], outDir: string): void;
}
declare const plugin: PipeWrenchPlugin;
export default plugin;
