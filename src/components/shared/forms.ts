export function fieldUpdate<T, K extends keyof T>(field: K, value: T[K]): Pick<T, K> {
  return { [field]: value } as Pick<T, K>;
}
