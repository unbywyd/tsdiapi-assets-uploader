import { AppContext, addSchema, ResponseErrorSchema, ResponseSuccessSchema } from "@tsdiapi/server";
import { Type } from "@sinclair/typebox";
import { isBearerValid } from "@tsdiapi/jwt-auth";
import { OutputAssetSchema } from "@generated/typebox-schemas/models/OutputAssetSchema.model.js";
import AssetService from "./{{kebabCase name}}.service.js";
import { useS3Provider } from "@tsdiapi/s3";
import { Container } from "typedi";

const assetService = Container.get(AssetService);
const previewSize = 512;
const generatePreview = true;

assetService.setPreviewSize(previewSize);
assetService.setGeneratePreview(generatePreview);

assetService.setDeleteFunc(async (key, isPrivate) => {
    const s3provider = useS3Provider();
    if (s3provider) {
        try {
            await s3provider.deleteFromS3(key, isPrivate);
        } catch (error) {
            console.error(`Error deleting file ${key}. Please check your S3 credentials and configuration.`, error);
        }
    } else {
        console.error('S3 provider not found. Please ensure the S3 plugin is passed to the tsdiapi application.');
    }
});

assetService.setUploadFunc(async (file, isPrivate) => {
    try {
        const s3provider = useS3Provider();
        if (!s3provider) {
            console.error('S3 provider not found. Please ensure the S3 plugin is passed to the tsdiapi application.');
            return null;
        }
        try {
            const upload = await s3provider.uploadToS3({
                buffer: file.buffer,
                mimetype: file.mimetype,
                originalname: file.filename
            }, isPrivate);
            return upload;
        } catch (error) {
            console.error('Error uploading file', error);
            return null;
        }
    } catch (error) {
        console.log('Error uploading file', error);
        return null;
    }
});

export { assetService };

// Body schema
const BodySchema = addSchema(Type.Object({
    files: Type.Array(Type.String({
        format: 'binary'
    }))
}, { $id: 'AssetsUploaderBodySchema' }));

// Params schemas
const AssetTypeParamSchema = addSchema(Type.Object({
    type: Type.String({
        enum: ['private', 'public']
    })
}, { $id: 'AssetsUploaderAssetTypeParamSchema' }));

const AssetIdParamSchema = addSchema(Type.Object({
    id: Type.String()
}, { $id: 'AssetsUploaderAssetIdParamSchema' }));

export default async function registerAssetRoutes({ useRoute }: AppContext) {
    useRoute()
        .controller('assets')
        .get('/me')
        .description('Get assets')
        .code(403, ResponseErrorSchema)
        .code(404, ResponseErrorSchema)
        .auth('bearer', async (req, reply) => {
            const isValid = await isBearerValid(req);
            if (!isValid) {
                return {
                    status: 403,
                    data: {
                        error: 'Invalid access token'
                    }
                }
            }
            return true;
        })
        .code(200, Type.Array(OutputAssetSchema))
        .handler(async (req, reply) => {
            const session = req.session;
            const query = {
                ...((session?.id && !session.adminId) ? { userId: session.id } : {}),
                ...(session?.adminId ? { adminId: session.adminId } : {})
            }
            const assets = await assetService.getBy(query);
            return { status: 200, data: assets };
        })
        .build();

    useRoute()
        .controller('assets')
        .body(BodySchema)
        .description('Asset upload')
        .code(403, ResponseErrorSchema)
        .auth('bearer', async (req, reply) => {
            const isValid = await isBearerValid(req);
            if (!isValid) {
                return {
                    status: 403,
                    data: {
                        error: 'Invalid access token'
                    }
                }
            }
            return true;
        })
        .post('/upload/:type')
        .params(AssetTypeParamSchema)
        .acceptMultipart()
        .code(200, Type.Array(OutputAssetSchema))
        .fileOptions({
            maxFileSize: 50 * 1024 * 1024, // 50MB
            maxFiles: 10
        })
        .setRequestFormat('multipart/form-data')
        .handler(async (req) => {
            const isPrivate = req.params.type === 'private';
            const session = req.session;
            const query = {
                ...((session?.id && !session.adminId) ? { userId: session.id } : {}),
                ...(session?.adminId ? { adminId: session.adminId } : {})
            }
            const files = req.tempFiles;
            const uploaded = await assetService.uploadFiles(query, files, isPrivate);
            return { status: 200, data: uploaded };
        })
        .build();

    useRoute()
        .controller('assets')
        .get('/single/:id')
        .params(AssetIdParamSchema)
        .description('Get asset by ID')
        .code(403, ResponseErrorSchema)
        .code(401, ResponseErrorSchema)
        .auth('bearer', async (req, reply) => {
            const isValid = await isBearerValid(req);
            if (!isValid) {
                return {
                    status: 403,
                    data: {
                        error: 'Invalid access token'
                    }
                }
            }
            return true;
        })
        .code(200, OutputAssetSchema)
        .handler(async (req) => {
            const session = req.session;
            const query = {
                ...((session?.id && !session.adminId) ? { userId: session.id } : {}),
                ...(session?.adminId ? { adminId: session.adminId } : {})
            }
            const asset = await assetService.getById(req.params.id, query);
            if (!asset) {
                return { status: 401, data: { error: 'Asset not found' } };
            }

            return { status: 200, data: asset };
        })
        .build();

    useRoute()
        .controller('assets')
        .delete('/:id')
        .params(AssetIdParamSchema)
        .description('Delete asset')
        .code(403, ResponseErrorSchema)
        .code(401, ResponseErrorSchema)
        .auth('bearer', async (req, reply) => {
            const isValid = await isBearerValid(req);
            if (!isValid) {
                return {
                    status: 403,
                    data: {
                        error: 'Invalid access token'
                    }
                }
            }
            return true;
        })
        .code(200, ResponseSuccessSchema)
        .handler(async (req) => {
            const session = req.session;
            const query = {
                ...((session?.id && !session.adminId) ? { userId: session.id } : {}),
                ...(session?.adminId ? { adminId: session.adminId } : {})
            }
            const success = await assetService.deleteAsset(query, req.params.id);
            if (!success) {
                return { status: 401, data: { error: 'Asset not found or access denied' } };
            }

            return { status: 200, data: { success: true } };
        })
        .build();
} 