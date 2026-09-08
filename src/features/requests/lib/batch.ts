// Runs `worker` over `items` in fixed-size concurrent batches, reporting
// cumulative results after each batch — a client-orchestrated stand-in for
// server-side streaming: each individual item is still a real, atomic
// server-side operation (one send-request call), and the UI gets
// progressive updates without needing manual stream parsing.
//
// `worker` must not throw — it should catch its own errors and resolve
// with a result object, or one failure would sink its entire batch via
// Promise.all.
export async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<R>,
  onBatchDone: (resultsSoFar: R[]) => void,
): Promise<R[]> {
  const allResults: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(worker));
    allResults.push(...batchResults);
    onBatchDone(allResults);
  }

  return allResults;
}
