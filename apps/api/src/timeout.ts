// Bound diagnostic responses even while the database driver retries a connection.
export async function within<T>(operation: PromiseLike<T>, milliseconds = 2000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Diagnostic query timed out')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
