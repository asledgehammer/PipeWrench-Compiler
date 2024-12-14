import * as ts from 'typescript';
import { EmitHost, ProcessedFile } from 'typescript-to-lua/dist/transpilation/utils';
import { CompilerOptions } from 'typescript-to-lua/dist/CompilerOptions';
import { LuaRequire } from './find-lua-requires';
import { Plugin } from 'typescript-to-lua/dist/transpilation/plugins';
interface ResolutionResult {
    resolvedFiles: ProcessedFile[];
    diagnostics: ts.Diagnostic[];
}
export interface ModuleMapping {
    requirePath: string;
    dependencyPath: string;
    fileName: string;
}
export declare class ResolutionContext {
    readonly program: ts.Program;
    readonly options: CompilerOptions;
    private readonly emitHost;
    private readonly plugins;
    private noResolvePaths;
    diagnostics: ts.Diagnostic[];
    resolvedFiles: Map<string, ProcessedFile>;
    private moduleMappings;
    constructor(program: ts.Program, options: CompilerOptions, emitHost: EmitHost, plugins: Plugin[]);
    addAndResolveDependencies(file: ProcessedFile): void;
    resolveImport(file: ProcessedFile, required: LuaRequire): void;
    processedDependencies: Set<string>;
    private formatPathToFile;
    private processDependency;
    private couldNotResolveImport;
    private resolveDependencyPath;
    private resolveLuaDependencyPathFromNodeModules;
    private pathToFile;
    private getFileFromPath;
    private searchForFileFromPath;
    private tryGetModuleNameFromPaths;
    getModuleMappings(): ModuleMapping[];
}
export declare function resolveDependencies(program: ts.Program, files: ProcessedFile[], emitHost: EmitHost, plugins: Plugin[]): ResolutionResult;
export {};
