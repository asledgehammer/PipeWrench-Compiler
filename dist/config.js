"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipeWrenchConfigSchema = void 0;
exports.PipeWrenchConfigSchema = {
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
