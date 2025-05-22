import { Service } from "typedi";
import sharp from "sharp";
import { OutputAssetSchemaType } from "@api/typebox-schemas/models/OutputAssetSchema.model.js";
import { Subject } from "rxjs";
import type { UploadFile } from "@tsdiapi/server";
import type { UploadFileResponse } from "@tsdiapi/s3";
import { AssetType } from "@generated/prisma/index.js";
import type { PrismaClient } from "@generated/prisma/index.js";
import { usePrisma } from "@tsdiapi/prisma";

const model = () => {
    return usePrisma<PrismaClient>()['asset']
}

const getImageMeta = async (buffer: Buffer): Promise<{ width: number, height: number, format: string }> => {
    const metadata = await sharp(buffer).metadata();
    return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format
    };
}

export const createThumbnail = async (buffer: Buffer, size: number) => {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const originalWidth = metadata.width || 0;
    const thumbnailWidth = Math.min(size, originalWidth);

    const thumbnailBuffer = await sharp(buffer)
        .resize({
            width: thumbnailWidth,
            fit: 'inside',
            withoutEnlargement: true,
        })
        .toBuffer();

    return thumbnailBuffer;
}

export type OnDeleteEvent = {
    assetId: string;
    isPrivate: boolean;
}

export type DeleteFunc = (key: string, isPrivate: boolean) => Promise<void> | void;
export type UploadFunc = (file: UploadFile, isPrivate: boolean) => Promise<UploadFileResponse> | UploadFileResponse;

export type OnUploadEvent = {
    file: UploadFile;
    isPrivate: boolean;
    upload: UploadFileResponse | UploadFile;
}

@Service()
export default class AssetService {
    private previewSize: number = 512;
    private generatePreview: boolean = true;
    public setGeneratePreview(generate: boolean) {
        this.generatePreview = generate;
    }
    public getGeneratePreview(): boolean {
        return this.generatePreview;
    }
    public setPreviewSize(size: number) {
        this.previewSize = size;
    }
    public getPreviewSize(): number {
        return this.previewSize;
    }
    onDelete$: Subject<OnDeleteEvent> = new Subject<OnDeleteEvent>();
    onUpload$: Subject<OnUploadEvent> = new Subject<OnUploadEvent>();

    getAssetType(mimetype: string): AssetType {
        if (mimetype.includes("image")) {
            return AssetType.IMAGE;
        }
        if (mimetype.includes("video")) {
            return AssetType.VIDEO;
        }
        if (mimetype.includes("application")) {
            return AssetType.DOCUMENT;
        }
        return AssetType.OTHER;
    }

    deleteFunc: DeleteFunc;
    uploadFunc: UploadFunc;
    public setDeleteFunc(func: DeleteFunc) {
        this.deleteFunc = func;
    }
    public setUploadFunc(func: UploadFunc) {
        this.uploadFunc = func;
    }

    public async getBy(params: { userId?: string, adminId?: string }): Promise<OutputAssetSchemaType[]> {
        try {
            const db = model();
            if (!db) {
                console.log('Asset entity not found in Prisma client. Please check your Prisma schema.');
                return [];
            }
            const assets = await db.findMany({
                where: {
                    ...(params.userId ? { userId: params.userId } : {}),
                    ...(params.adminId ? { adminId: params.adminId } : {})
                }
            });
            return assets as OutputAssetSchemaType[];
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    public async getById(id: string, params: { userId?: string, adminId?: string }): Promise<OutputAssetSchemaType | null> {
        try {
            const db = model();
            if (!db) {
                console.log('Asset entity not found in Prisma client. Please check your Prisma schema.');
                return null;
            }
            const asset = await db.findUnique({
                where: { id }
            });

            if (!asset) return null;

            return asset as OutputAssetSchemaType;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async uploadFile(params: { userId?: string, adminId?: string }, file: UploadFile, isPrivate = false, name?: string): Promise<OutputAssetSchemaType | null> {
        try {
            const db = model();
            if (!db) {
                console.log('Asset entity not found in Prisma client. Please check your Prisma schema.');
                return null;
            }

            const fileName = name || file.filename || file.id;
            const thumbnailFileName = name ? name + '-thumbnail' : `${fileName}-thumbnail`;

            if (file.url) {
                console.info(`Upload will be skipped as URL is provided: ${file.url}`);
            }

            const result = file?.url ? {
                ...file,
                key: file.id,
                region: file.s3region,
                bucket: file.s3bucket,
                type: this.getAssetType(file.mimetype),
                name: fileName,
            } : await this.uploadFunc({
                ...file,
                filename: fileName,
            }, isPrivate);

            if (!result?.url) {
                console.log('Upload function did not return a URL, which is mandatory')
                return null;
            }

            const data: Record<string, any> = {
                key: result.key || null,
                name: fileName,
                url: result.url,
                s3bucket: result.bucket || null,
                s3region: result.region || null,
                filesize: file.filesize || 0,
                mimetype: file.mimetype || null,
                type: this.getAssetType(file.mimetype),
                isPrivate,
                ...(params.userId ? { userId: params.userId } : {}),
                ...(params.adminId ? { adminId: params.adminId } : {})
            }

            let thumbnail: Record<string, any>, thumbnailMeta: Record<string, any>;

            if (data.type === AssetType.IMAGE) {
                const meta = await getImageMeta(file.buffer);
                data.width = meta.width;
                data.height = meta.height;
                data.format = meta.format;

                if (this.generatePreview) {
                    console.log(`Creating thumbnail for image: ${fileName}`);
                    const thumbnailBuffer = await createThumbnail(file.buffer, this.previewSize);
                    thumbnail = await this.uploadFunc({
                        buffer: thumbnailBuffer,
                        mimetype: file.mimetype,
                        filename: thumbnailFileName
                    } as any, isPrivate) as unknown as UploadFile;
                    thumbnailMeta = await getImageMeta(thumbnailBuffer);
                    data.thumbnailUrl = thumbnail.url;
                    data.thumbnailKey = thumbnail.key;
                }
            } else {
                const format = file.mimetype.split('/')[1];
                if (format) {
                    data.format = format;
                }
            }

            const asset = await db.create({
                data: data as any
            });

            try {
                if (this.onUpload$) {
                    this.onUpload$.next({
                        file: file,
                        isPrivate: isPrivate,
                        upload: result
                    });
                }
            } catch (error) {
                console.error(error);
            }

            return asset as OutputAssetSchemaType;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async uploadFiles(params: { userId?: string, adminId?: string }, files: UploadFile[], isPrivate = false): Promise<OutputAssetSchemaType[]> {
        try {
            const results: OutputAssetSchemaType[] = [];
            for (const file of files) {
                const result = await this.uploadFile(params, file, isPrivate);
                if (result) {
                    results.push(result);
                }
            }
            return results;
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    async deleteAsset(params: { userId?: string, adminId?: string }, assetId: string): Promise<boolean> {
        try {
            const db = model();
            if (!db) {
                console.log('Asset entity not found in Prisma client. Please check your Prisma schema.');
                return false;
            }

            const asset = await db.findUnique({
                where: { id: assetId }
            });

            if (!asset) return false;
            if (asset.userId !== params.userId && !params.adminId) return false; // asset.adminId !== params.adminId

            try {
                if (asset.key) {
                    this.onDelete$.next({
                        assetId: asset.id,
                        isPrivate: asset.isPrivate
                    });
                    if (this.deleteFunc) {
                        await this.deleteFunc(asset.key, asset.isPrivate);
                    }
                }
                if (asset.thumbnailKey) {
                    await this.deleteFunc(asset.thumbnailKey, asset.isPrivate);
                }
                await db.delete({
                    where: { id: assetId }
                });
            } catch (error) {
                console.error(error);
            }

            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }
} 