import { JSONSchemaType } from 'ajv';
export interface ModInfo {
    name: string;
    poster: string;
    id: string;
    description: string;
    url: string;
}
export interface PipeWrenchConfig {
    modInfo: ModInfo;
    modelsDir: string;
    texturesDir: string;
    soundDir: string;
    scriptsDir: string;
}
export declare const PipeWrenchConfigSchema: JSONSchemaType<PipeWrenchConfig>;
