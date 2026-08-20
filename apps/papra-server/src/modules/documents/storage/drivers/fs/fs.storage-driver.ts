import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { safely } from '@corentinth/chisels';
import { isFileAlreadyExistsError } from '../../../../shared/fs/fs.models';
import {
  checkFileExists,
  deleteFile,
  ensureDirectoryExists,
  moveFile as moveFsFile,
} from '../../../../shared/fs/fs.services';
import {
  createFileAlreadyExistsInStorageError,
  createFileNotFoundError,
} from '../../document-storage.errors';
import { defineStorageDriver } from '../drivers.models';
import { isFileNotFoundError } from './fs.storage-driver.models';

export const FS_STORAGE_DRIVER_NAME = 'filesystem' as const;

export const fsStorageDriverFactory = defineStorageDriver(({ documentStorageConfig }) => {
  const { root } = documentStorageConfig.drivers.filesystem;

  const getStoragePath = ({ storageKey }: { storageKey: string }) => ({
    storagePath: join(root, storageKey),
  });

  return {
    name: FS_STORAGE_DRIVER_NAME,
    saveFile: async ({ fileStream, storageKey }) => {
      const { storagePath } = getStoragePath({ storageKey });

      await ensureDirectoryExists({ path: dirname(storagePath) });

      // 'wx' flag ensures that the file is created exclusively and fails if it already exists
      const writeStream = fs.createWriteStream(storagePath, { flags: 'wx' });

      fileStream.pipe(writeStream);

      return new Promise((resolve, reject) => {
        writeStream.on('finish', () => {
          resolve();
        });

        writeStream.on('error', (error) => {
          const rejection = isFileAlreadyExistsError({ error })
            ? createFileAlreadyExistsInStorageError()
            : error;

          reject(rejection);
        });

        // Listen for errors on the input stream as well
        fileStream.on('error', (error) => {
          // Clean up the write stream and file
          writeStream.destroy();
          fs.unlink(storagePath, () => {}); // Ignore errors when cleaning up
          reject(error);
        });
      });
    },
    getFileStream: async ({ storageKey }) => {
      const { storagePath } = getStoragePath({ storageKey });

      const fileExists = await checkFileExists({ path: storagePath });

      if (!fileExists) {
        throw createFileNotFoundError();
      }

      const fileStream = fs.createReadStream(storagePath);

      return { fileStream };
    },
    deleteFile: async ({ storageKey }) => {
      const { storagePath } = getStoragePath({ storageKey });

      const [, error] = await safely(deleteFile({ filePath: storagePath }));

      if (error && isFileNotFoundError({ error })) {
        throw createFileNotFoundError();
      }

      if (error) {
        throw error;
      }
    },
    fileExists: async ({ storageKey }) => {
      const { storagePath } = getStoragePath({ storageKey });
      const exists = await checkFileExists({ path: storagePath });

      return exists;
    },
    moveFile: async ({ sourceKey, destinationKey }) => {
      const { storagePath: sourceFilePath } = getStoragePath({ storageKey: sourceKey });
      const { storagePath: destinationFilePath } = getStoragePath({ storageKey: destinationKey });

      const destinationExists = await checkFileExists({ path: destinationFilePath });
      if (destinationExists) {
        throw createFileAlreadyExistsInStorageError();
      }

      await ensureDirectoryExists({ path: dirname(destinationFilePath) });
      await moveFsFile({ sourceFilePath, destinationFilePath });
    },
  };
});
