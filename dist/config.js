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
        scriptsDir: { type: 'string' }
    },
    required: ['modInfo', 'modelsDir', 'texturesDir', 'soundDir', 'scriptsDir'],
    additionalProperties: false
};
