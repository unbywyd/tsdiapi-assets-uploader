import type { AppContext, AppPlugin } from "@tsdiapi/server";

export type PluginOptions = {
    previewSize?: number,
    generatePreview?: boolean,
}

class App implements AppPlugin {
    name = 'tsdiapi-assets-uploader';
    config: PluginOptions;
    context: AppContext;
    constructor(config?: PluginOptions) {
        this.config = { ...config };
    }
    async onInit(ctx: AppContext) {
        this.context = ctx;
    }
}

export default function createPlugin(config?: PluginOptions) {
    return new App(config);
}