import { useState } from 'react';
import { toast } from '@/lib/toast';
import { confirmUpload, markDocumentUnavailable, removeUpload, requestUploadUrl } from '../api/portalApi';
import { uploadFileWithProgress } from '../api/storageUpload';
import { convertHeicIfNeeded } from '../utils/heicConversion';
import { compressImageIfNeeded } from '../utils/imageCompression';
import type { UploadTask } from '../types';

// Each task carries its own try/catch end-to-end (process -> request URL ->
// upload -> confirm), so one file failing never touches the others' state.
// A task disappears from this hook's state as soon as it's confirmed —
// `onMutated` triggers a portal-resolve refetch, and the file then shows up
// in the server-reported list instead, rather than being tracked in two
// places at once.
export function useUploadQueue(token: string, onMutated: () => void) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);

  function updateTask(id: string, patch: Partial<UploadTask>) {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }

  async function runTask(requiredDocumentId: string, id: string, file: File) {
    try {
      updateTask(id, { status: 'processing', progress: 0, errorMessage: undefined });

      let processedFile = file;
      processedFile = await convertHeicIfNeeded(processedFile);
      processedFile = await compressImageIfNeeded(processedFile);

      updateTask(id, { status: 'uploading', displayName: processedFile.name });

      const mimeType = processedFile.type || 'application/octet-stream';
      const { signedUrl, storagePath, uploadToken } = await requestUploadUrl({
        token,
        requiredDocumentId,
        filename: processedFile.name,
        mimeType,
        sizeBytes: processedFile.size,
      });

      await uploadFileWithProgress(signedUrl, uploadToken, processedFile, mimeType, (progress) =>
        updateTask(id, { progress }),
      );

      updateTask(id, { status: 'confirming', progress: 100 });

      const result = await confirmUpload({
        token,
        requiredDocumentId,
        storagePath,
        filename: processedFile.name,
        mimeType,
        sizeBytes: processedFile.size,
      });

      if (!result.accepted) {
        // The file uploaded fine, but the server's content check found it
        // doesn't actually look like what it claims to be (e.g. a renamed
        // file). Surfaced the same way as a failed upload — the useful
        // next step for the client is the same either way: try a
        // different file.
        updateTask(id, {
          status: 'error',
          errorMessage: "This file doesn't look right — please check it and try again.",
        });
        return;
      }

      removeTask(id);
      onMutated();
    } catch (error) {
      updateTask(id, {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Upload failed.',
      });
    }
  }

  function addFiles(requiredDocumentId: string, files: File[]) {
    const newTasks: UploadTask[] = files.map((file) => ({
      id: crypto.randomUUID(),
      requiredDocumentId,
      file,
      displayName: file.name,
      status: 'processing',
      progress: 0,
    }));
    setTasks((prev) => [...prev, ...newTasks]);
    newTasks.forEach((task) => runTask(task.requiredDocumentId, task.id, task.file));
  }

  function retryTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) runTask(task.requiredDocumentId, task.id, task.file);
  }

  async function removeUploadedFile(documentId: string) {
    try {
      await removeUpload(token, documentId);
      onMutated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove this file.');
    }
  }

  async function markUnavailable(requiredDocumentId: string, reason: string) {
    try {
      await markDocumentUnavailable(token, requiredDocumentId, reason);
      toast.success("Thanks — we've let your accountant know.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send this.');
    }
  }

  return {
    tasks,
    addFiles,
    retryTask,
    dismissTask: removeTask,
    removeUploadedFile,
    markUnavailable,
  };
}
