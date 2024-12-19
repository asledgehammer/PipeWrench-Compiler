import { JSONSchemaType } from 'ajv';
export interface ModInfo {
    name: string;
    poster: string;
    id: string;
    description: string;
    url: string;
}
/** optional values: '41', '42-unstable', '41&42-unstable', default value is '41' */
export type CompilerTargetVersion = '41' | '42-unstable' | '41&42-unstable';
export interface PipeWrenchCompilerOptions {
    targetVersion?: CompilerTargetVersion;
}
export interface PipeWrenchConfig {
    modInfo: ModInfo;
    modelsDir: string;
    texturesDir: string;
    soundDir: string;
    scriptsDir: string;
    compilerOptions?: PipeWrenchCompilerOptions;
}
export declare const PipeWrenchConfigSchema: JSONSchemaType<PipeWrenchConfig>;
