declare module 'backblaze-b2' {
    export default class B2 {
        constructor(options: { applicationKeyId: string; applicationKey: string });
        authorize(): Promise<any>;
        getUploadUrl(params: { bucketId: string }): Promise<any>;
        uploadFile(params: {
            uploadUrl: string;
            uploadAuthToken: string;
            fileName: string;
            data: Buffer;
            mime: string;
        }): Promise<any>;
        listFileNames(params: {
            bucketId: string;
            maxFileCount: number;
            prefix: string;
        }): Promise<any>;
        deleteFileVersion(params: { fileId: string; fileName: string }): Promise<any>;
    }
}
