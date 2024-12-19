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

export const PipeWrenchConfigSchema: JSONSchemaType<PipeWrenchConfig> = {
  type: 'object',
  properties: {
    modInfo: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        poster: { type: 'string' },
        id: { type: 'string' },
        description: { type: 'string' },
        url: { type: 'string' }
      },
      required: ['name', 'poster', 'id', 'description', 'url']
    },
    modelsDir: { type: 'string' },
    texturesDir: { type: 'string' },
    soundDir: { type: 'string' },
    scriptsDir: { type: 'string' },
    compilerOptions: {
      type: 'object',
      properties: {
        targetVersion: {
          type: 'string',
          default: '41',
          nullable: true,
          enum: ['41', '42-unstable', '41&42-unstable']
        }
      },
      nullable: true
    }
  },
  required: ['modInfo', 'modelsDir', 'texturesDir', 'soundDir', 'scriptsDir'],
  additionalProperties: false
};
